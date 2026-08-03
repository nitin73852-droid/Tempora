import { MessagePayload, ReplyMetadata, FileAttachment, ReactionEvent } from '../types';
import { dbClient } from '../database/client';
import { sanitizeContent, MAX_MESSAGE_LENGTH } from '../middleware/rateLimit';
import { encryptText, decryptText } from '../utils/encryption';

class MessageService {
  public async processAndQueueMessage(
    clientMsgId: string,
    roomId: string,
    senderId: string,
    senderNickname: string,
    content: string,
    offlineRecipientIds: string[],
    replyTo?: ReplyMetadata,
    file?: FileAttachment
  ): Promise<MessagePayload> {
    const sanitizedContent = sanitizeContent((content || '').trim().slice(0, MAX_MESSAGE_LENGTH));
    const sanitizedNickname = sanitizeContent((senderNickname || '').trim());

    const seqResult = await dbClient.execute({
      sql: `UPDATE rooms SET last_seq = last_seq + 1 WHERE id = ? RETURNING last_seq`,
      args: [roomId],
    });

    const sequenceNumber = Number(seqResult.rows[0]?.last_seq || 1);
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = new Date().toISOString();
    const replyToStr = replyTo ? JSON.stringify(replyTo) : null;
    const fileStr = file ? JSON.stringify(file) : null;

    const encryptedContentStr = JSON.stringify(encryptText(sanitizedContent));
    const pendingRecipients = offlineRecipientIds.filter((id) => id !== senderId);

    if (pendingRecipients.length > 0) {
      const batchStatements = pendingRecipients.map((recipientId) => ({
        sql: `INSERT INTO pending_messages 
                (id, room_id, message_id, client_msg_id, sender_id, recipient_id, content, sequence_number, reply_to, file_info, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(room_id, recipient_id, client_msg_id) DO NOTHING`,
        args: [
          `pend_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          roomId,
          messageId,
          clientMsgId,
          senderId,
          recipientId,
          encryptedContentStr,
          sequenceNumber,
          replyToStr,
          fileStr,
          createdAt,
        ],
      }));

      await dbClient.batch(batchStatements, 'write');
    }

    return {
      id: messageId,
      clientMsgId,
      roomId,
      senderId,
      senderNickname: sanitizedNickname,
      content: sanitizedContent,
      sequenceNumber,
      createdAt,
      replyTo,
      file,
      status: 'STORED',
    };
  }

  public async getAndClearPendingMessages(roomId: string, recipientId: string): Promise<MessagePayload[]> {
    const result = await dbClient.execute({
      sql: `SELECT * FROM pending_messages WHERE room_id = ? AND recipient_id = ? ORDER BY sequence_number ASC`,
      args: [roomId, recipientId],
    });

    if (result.rows.length === 0) return [];

    const messages: MessagePayload[] = [];
    for (const row of result.rows) {
      let content = row.content as string;
      try {
        if (content.startsWith('{')) {
          const parsed = JSON.parse(content);
          if (parsed.ciphertext && parsed.iv && parsed.tag) {
            content = decryptText(parsed);
          }
        }
      } catch (err) {
        console.warn(`[MessageService] Decryption fallback for pending msg ${row.id}`);
      }

      let replyTo: ReplyMetadata | undefined;
      if (row.reply_to) {
        try {
          replyTo = JSON.parse(row.reply_to as string);
        } catch {
          // ignore parse error
        }
      }

      let file: FileAttachment | undefined;
      if (row.file_info) {
        try {
          file = JSON.parse(row.file_info as string);
        } catch {
          // ignore parse error
        }
      }

      messages.push({
        id: row.message_id as string,
        clientMsgId: row.client_msg_id as string,
        roomId: row.room_id as string,
        senderId: row.sender_id as string,
        senderNickname: 'Member',
        content,
        sequenceNumber: Number(row.sequence_number),
        createdAt: row.created_at as string,
        replyTo,
        file,
        status: 'STORED',
      });
    }

    await dbClient.execute({
      sql: `DELETE FROM pending_messages WHERE room_id = ? AND recipient_id = ?`,
      args: [roomId, recipientId],
    });

    return messages;
  }

  public async getPendingMessagesForRecipient(roomId: string, recipientId: string): Promise<MessagePayload[]> {
    return this.getAndClearPendingMessages(roomId, recipientId);
  }

  public async acknowledgeDelivery(roomId: string, recipientId: string, clientMsgId: string): Promise<void> {
    await dbClient.execute({
      sql: `DELETE FROM pending_messages WHERE room_id = ? AND recipient_id = ? AND client_msg_id = ?`,
      args: [roomId, recipientId, clientMsgId],
    });
  }

  public async ackPendingMessage(roomId: string, recipientId: string, clientMsgId: string): Promise<void> {
    return this.acknowledgeDelivery(roomId, recipientId, clientMsgId);
  }

  public async processAndQueueReaction(
    roomId: string,
    messageId: string,
    memberId: string,
    senderNickname: string,
    emoji: string,
    offlineRecipientIds: string[]
  ): Promise<ReactionEvent> {
    const createdAt = new Date().toISOString();

    const pendingRecipients = offlineRecipientIds.filter((id) => id !== memberId);
    if (pendingRecipients.length > 0) {
      const batchStatements = pendingRecipients.map((recipientId) => ({
        sql: `INSERT INTO pending_reactions (id, room_id, message_id, member_id, recipient_id, emoji, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(room_id, recipient_id, message_id, member_id) 
              DO UPDATE SET emoji = EXCLUDED.emoji, created_at = EXCLUDED.created_at`,
        args: [
          `preact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          roomId,
          messageId,
          memberId,
          recipientId,
          emoji,
          createdAt,
        ],
      }));

      await dbClient.batch(batchStatements, 'write');
    }

    return {
      id: `react_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      roomId,
      messageId,
      memberId,
      senderNickname,
      emoji,
      createdAt,
    };
  }

  public async getAndClearPendingReactions(roomId: string, recipientId: string): Promise<ReactionEvent[]> {
    const result = await dbClient.execute({
      sql: `SELECT * FROM pending_reactions WHERE room_id = ? AND recipient_id = ?`,
      args: [roomId, recipientId],
    });

    if (result.rows.length === 0) return [];

    const reactions: ReactionEvent[] = result.rows.map((row) => ({
      id: row.id as string,
      roomId: row.room_id as string,
      messageId: row.message_id as string,
      memberId: row.member_id as string,
      senderNickname: 'Member',
      emoji: row.emoji as string,
      createdAt: row.created_at as string,
    }));

    await dbClient.execute({
      sql: `DELETE FROM pending_reactions WHERE room_id = ? AND recipient_id = ?`,
      args: [roomId, recipientId],
    });

    return reactions;
  }

  public async getPendingReactionsForRecipient(roomId: string, recipientId: string): Promise<ReactionEvent[]> {
    return this.getAndClearPendingReactions(roomId, recipientId);
  }

  public async ackPendingReaction(roomId: string, recipientId: string, messageId: string, memberId: string): Promise<void> {
    await dbClient.execute({
      sql: `DELETE FROM pending_reactions WHERE room_id = ? AND recipient_id = ? AND message_id = ? AND member_id = ?`,
      args: [roomId, recipientId, messageId, memberId],
    });
  }
}

export const messageService = new MessageService();
export default messageService;
