import { Server, Socket } from 'socket.io';
import { roomService } from '../services/roomService';
import { messageService } from '../services/messageService';
import { memberService } from '../services/memberService';
import { fileService } from '../services/fileService';
import { roomLifecycleService } from '../services/roomLifecycleService';
import { MessagePayload } from '../types';
import { generateToken } from '../utils/jwt';
import { checkRateLimit, sanitizeContent, MAX_NICKNAME_LENGTH } from '../middleware/rateLimit';

let globalIo: Server | null = null;
const memberSocketMap = new Map<string, string>();
const socketMetaMap = new Map<string, { roomId: string; memberId: string; nickname: string }>();

export const activeConnections = {
  broadcastToRoom: (roomId: string, event: string, data: any) => {
    if (globalIo) {
      globalIo.to(roomId).emit(event, data);
    }
  },
  getRoomOnlineMemberIds: (roomId: string): string[] => {
    if (!globalIo) return [];
    const roomSockets = globalIo.sockets.adapter.rooms.get(roomId);
    const activeMemberIds: string[] = [];
    if (roomSockets) {
      for (const [memId, sockId] of memberSocketMap.entries()) {
        if (roomSockets.has(sockId)) {
          activeMemberIds.push(memId);
        }
      }
    }
    return activeMemberIds;
  },
};

export const initSocket = (io: Server) => {
  globalIo = io;
  // Bind socket server to room lifecycle manager for teardown broadcasts & worker
  roomLifecycleService.setSocketServer(io);

  const getActiveMemberIds = (roomId: string): Set<string> => {
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    const activeMemberIds = new Set<string>();

    if (roomSockets) {
      for (const [memId, sockId] of memberSocketMap.entries()) {
        if (roomSockets.has(sockId)) {
          activeMemberIds.add(memId);
        }
      }
    }
    return activeMemberIds;
  };

  const broadcastPresence = async (roomId: string) => {
    try {
      const activeMemberIds = getActiveMemberIds(roomId);
      const room = await roomService.getRoom(roomId, activeMemberIds);
      const members = room?.members || [];
      const onlineMemberIds = Array.from(activeMemberIds);

      io.to(roomId).emit('presence_update', { roomId, members, onlineMemberIds });
    } catch (err: any) {
      console.error(`[Socket] Error broadcasting presence for room [${roomId}]:`, err.message);
    }
  };

  io.on('connection', (socket: Socket) => {
    // 1. Auth and Join Room Event Contract V2
    socket.on(
      'auth_and_join',
      async (
        data: { roomId: string; memberId: string; nickname: string; avatar?: string; lastKnownSeq?: number },
        callback?: (res: any) => void
      ) => {
        const { roomId, memberId, nickname, avatar } = data;

        try {
          const sanitizedNickname = sanitizeContent(String(nickname || 'Anonymous').trim().slice(0, MAX_NICKNAME_LENGTH));
          const existingRoom = await roomService.getRoom(roomId);
          if (!existingRoom) {
            if (callback) callback({ success: false, error: 'Room expired or does not exist.' });
            return;
          }

          const existingMembers = existingRoom.members || [];
          const isAlreadyParticipant = existingMembers.some((m) => m.memberId === memberId);
          const isHost = existingRoom.hostId === memberId;

          if (existingRoom.type === 'group' && existingRoom.isLocked && !isAlreadyParticipant && !isHost) {
            if (callback) callback({ success: false, isLocked: true, error: 'This group is locked by the Host.' });
            return;
          }

          // Add member to members table (or update nickname/avatar on reconnect)
          await memberService.addMember(roomId, memberId, sanitizedNickname, avatar);

          memberSocketMap.set(memberId, socket.id);
          socketMetaMap.set(socket.id, { roomId, memberId, nickname: sanitizedNickname });
          socket.join(roomId);

          await broadcastPresence(roomId);

          const activeMemberIds = getActiveMemberIds(roomId);
          const room = await roomService.getRoom(roomId, activeMemberIds);

          const token = generateToken({
            roomId,
            memberId,
            nickname: sanitizedNickname,
            role: room?.hostId === memberId ? 'host' : 'member',
          });

          // Retrieve recipient-specific pending messages & reactions for this reconnecting member
          const missedMessages = await messageService.getPendingMessagesForRecipient(roomId, memberId);
          const missedReactions = await messageService.getPendingReactionsForRecipient(roomId, memberId);

          const callbackPayload = {
            success: true,
            token,
            room: {
              id: room?.id || roomId,
              name: room?.name || existingRoom.name,
              type: room?.type || existingRoom.type,
              duration: room?.duration || existingRoom.duration,
              status: room?.status || existingRoom.status,
              hostId: room?.hostId || existingRoom.hostId,
              expiresAt: room?.expiresAt || existingRoom.expiresAt,
              isLocked: Boolean(room?.isLocked),
            },
            member: { memberId, nickname: sanitizedNickname, role: room?.hostId === memberId ? 'host' : 'member' },
            activeMembers: room?.members || [],
            latestSeq: room?.lastSeq || 0,
            missedMessages,
            missedReactions,
          };

          if (callback) callback(callbackPayload);
        } catch (err: any) {
          console.error(`[Socket] Error in auth_and_join for member [${memberId}]:`, err.message);
          if (callback) callback({ success: false, error: err.message || 'Failed to join room.' });
        }
      }
    );

    // 2. Send Message Event Contract V2 (with rate limit)
    socket.on(
      'send_message',
      async (
        data: { clientMsgId: string; roomId: string; senderId: string; senderNickname: string; content: string; replyTo?: any; file?: any },
        callback?: (res: any) => void
      ) => {
        const { clientMsgId, roomId, senderId, senderNickname, content, replyTo, file } = data;

        if (!checkRateLimit(`msg_${senderId}`, 5, 3000)) {
          if (callback) callback({ success: false, error: 'Sending messages too fast. Please slow down.' });
          return;
        }

        try {
          const activeMemberIds = getActiveMemberIds(roomId);
          const allMembers = await memberService.getRoomMembers(roomId);
          const offlineRecipientIds = allMembers
            .filter((m) => !activeMemberIds.has(m.memberId) && m.memberId !== senderId)
            .map((m) => m.memberId);

          const msgPayload: MessagePayload = await messageService.processAndQueueMessage(
            clientMsgId,
            roomId,
            senderId,
            senderNickname,
            content,
            offlineRecipientIds,
            replyTo,
            file
          );

          // Deliver immediately to all currently online members
          io.to(roomId).emit('receive_message', msgPayload);

          if (callback) {
            callback({
              success: true,
              clientMsgId: msgPayload.clientMsgId,
              messageId: msgPayload.id,
              sequenceNumber: msgPayload.sequenceNumber,
              createdAt: msgPayload.createdAt,
            });
          }
        } catch (err: any) {
          console.error(`[Socket] Error in send_message:`, err.message);
          if (callback) callback({ success: false, error: err.message });
        }
      }
    );

    // 3. Send Reaction Event
    socket.on('send_reaction', async (data: { roomId: string; messageId: string; memberId: string; emoji: string }) => {
      const { roomId, messageId, memberId, emoji } = data;
      try {
        const activeMemberIds = getActiveMemberIds(roomId);
        const allMembers = await memberService.getRoomMembers(roomId);
        const offlineRecipientIds = allMembers
          .filter((m) => !activeMemberIds.has(m.memberId) && m.memberId !== memberId)
          .map((m) => m.memberId);

        const reactionEvent = await messageService.processAndQueueReaction(
          roomId,
          messageId,
          memberId,
          'Member',
          emoji,
          offlineRecipientIds
        );

        io.to(roomId).emit('message_reaction', reactionEvent);
      } catch (err: any) {
        console.error(`[Socket] Error in send_reaction:`, err.message);
      }
    });

    // 4. Delivery ACK Reaction Event (Deletes recipient's pending reaction row)
    socket.on('ack_reaction_delivery', async (data: { roomId: string; recipientId: string; messageId: string; memberId: string }) => {
      const { roomId, recipientId, messageId, memberId } = data;
      try {
        await messageService.ackPendingReaction(roomId, recipientId, messageId, memberId);
      } catch (err: any) {
        console.error(`[Socket] Error in ack_reaction_delivery:`, err.message);
      }
    });

    // 5. Typing Status Event
    socket.on('typing_status', (data: { roomId: string; nickname: string; isTyping: boolean }) => {
      const { roomId, nickname, isTyping } = data;
      socket.to(roomId).emit('user_typing', { nickname, isTyping });
    });

    // 6. Update Avatar Event (Real-time Broadcast)
    socket.on('update_avatar', async (data: { roomId: string; nickname: string; avatar: string }) => {
      const { roomId, nickname, avatar } = data;
      const meta = socketMetaMap.get(socket.id);
      if (meta?.memberId) {
        await memberService.updateAvatar(roomId, meta.memberId, avatar);
        activeConnections.broadcastToRoom(roomId, 'avatar_update', {
          roomId,
          memberId: meta.memberId,
          nickname,
          avatar,
        });
      }
    });

    // 7. Sync Catch-Up Event Contract V2
    socket.on(
      'sync_catchup',
      async (data: { roomId: string; memberId: string }, callback?: (res: any) => void) => {
        const { roomId, memberId } = data;
        try {
          const missedMessages = await messageService.getPendingMessagesForRecipient(roomId, memberId);
          const missedReactions = await messageService.getPendingReactionsForRecipient(roomId, memberId);
          const room = await roomService.getRoom(roomId);
          if (callback) {
            callback({
              success: true,
              roomId,
              missedMessages,
              missedReactions,
              latestSeq: room?.lastSeq || 0,
            });
          }
        } catch (err: any) {
          if (callback) callback({ success: false, error: err.message });
        }
      }
    );

    // 8. Delivery ACK Event Contract V2
    socket.on('ack_delivery', async (data: { roomId: string; memberId: string; sequenceNumber: number; messageId?: string; clientMsgId?: string; fileId?: string }) => {
      const { roomId, memberId, messageId, clientMsgId, sequenceNumber, fileId } = data;
      const targetId = messageId || clientMsgId || String(sequenceNumber);

      try {
        await messageService.ackPendingMessage(roomId, memberId, targetId);
        if (fileId) {
          await fileService.ackFileDelivery(fileId, memberId);
        }
        io.to(roomId).emit('receipt_update', { roomId, memberId, status: 'DELIVERED', sequenceNumber });
      } catch (err: any) {
        console.error(`[Socket] Error in ack_delivery:`, err.message);
      }
    });

    // 9. Read ACK Event Contract V2
    socket.on('ack_read', async (data: { roomId: string; memberId: string; sequenceNumber: number; messageId?: string; clientMsgId?: string; fileId?: string }) => {
      const { roomId, memberId, messageId, clientMsgId, sequenceNumber, fileId } = data;
      const targetId = messageId || clientMsgId || String(sequenceNumber);

      try {
        await messageService.ackPendingMessage(roomId, memberId, targetId);
        if (fileId) {
          await fileService.ackFileDelivery(fileId, memberId);
        }
        io.to(roomId).emit('receipt_update', { roomId, memberId, status: 'READ', sequenceNumber });
      } catch (err: any) {
        console.error(`[Socket] Error in ack_read:`, err.message);
      }
    });

    // 10. Leave Room
    socket.on('leave_room', async (data: { roomId: string; memberId: string; nickname: string }) => {
      const { roomId, memberId, nickname } = data;
      try {
        socket.leave(roomId);
        await memberService.removeRoomMember(roomId, memberId, 'LEFT');
        await broadcastPresence(roomId);
        io.to(roomId).emit('member_removed', { roomId, memberId, nickname, reason: 'LEFT' });
        io.to(roomId).emit('user_left', { memberId, nickname });
      } catch (err: any) {
        console.error(`[Socket] Error in leave_room:`, err.message);
      }
    });

    // 11. End Room (Triggers Unified Room Lifecycle Teardown)
    socket.on('end_room', async (data: { roomId: string; nickname: string }) => {
      const { roomId, nickname } = data;
      try {
        await roomLifecycleService.destroyRoom(roomId, `Room ended by ${nickname}`);
      } catch (err: any) {
        console.error(`[Socket] Error in end_room:`, err.message);
      }
    });

    // 12. Toggle Room Lock (Host only)
    socket.on(
      'toggle_room_lock',
      async (data: { roomId: string; isLocked: boolean; hostId: string }, callback?: (res: any) => void) => {
        const { roomId, isLocked, hostId } = data;
        try {
          const updatedLocked = await roomService.toggleRoomLock(roomId, isLocked, hostId);
          io.to(roomId).emit('room_lock_update', { roomId, isLocked: updatedLocked });
          if (callback) callback({ success: true, isLocked: updatedLocked });
        } catch (err: any) {
          if (callback) callback({ success: false, error: err.message });
        }
      }
    );

    // 13. Kick Member (Host only)
    socket.on(
      'kick_member',
      async (
        data: { roomId: string; hostId: string; targetMemberId: string; targetNickname: string },
        callback?: (res: any) => void
      ) => {
        const { roomId, hostId, targetMemberId, targetNickname } = data;
        try {
          const room = await roomService.getRoom(roomId);
          if (!room || room.hostId !== hostId) {
            if (callback) callback({ success: false, error: 'Only the host can kick members.' });
            return;
          }
          if (targetMemberId === hostId) {
            if (callback) callback({ success: false, error: 'Host cannot kick themselves.' });
            return;
          }

          await memberService.removeRoomMember(roomId, targetMemberId, 'KICKED');

          // Notify kicked member directly if online
          const targetSocketId = memberSocketMap.get(targetMemberId);
          if (targetSocketId) {
            io.to(targetSocketId).emit('member_removed', {
              roomId,
              memberId: targetMemberId,
              nickname: targetNickname,
              reason: 'KICKED',
              message: 'You were removed from this group by the Host.',
            });
            io.to(targetSocketId).emit('user_kicked', {
              roomId,
              memberId: targetMemberId,
              nickname: targetNickname,
              reason: 'You were removed from this group by the Host.',
            });
          }

          // Broadcast presence & member_removed to room channel
          await broadcastPresence(roomId);
          io.to(roomId).emit('member_removed', { roomId, memberId: targetMemberId, nickname: targetNickname, reason: 'KICKED' });
          io.to(roomId).emit('user_kicked', { roomId, memberId: targetMemberId, nickname: targetNickname });

          if (callback) callback({ success: true });
        } catch (err: any) {
          if (callback) callback({ success: false, error: err.message });
        }
      }
    );

    // 12. Disconnect
    socket.on('disconnect', async () => {
      try {
        const meta = socketMetaMap.get(socket.id);
        socketMetaMap.delete(socket.id);
        if (meta?.memberId) {
          memberSocketMap.delete(meta.memberId);
          await broadcastPresence(meta.roomId);
        }
      } catch (err: any) {
        console.error(`[Socket] Error in disconnect handler:`, err.message);
      }
    });
  });
};
