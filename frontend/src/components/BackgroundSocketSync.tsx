import React from 'react';
import { useRoomStore } from '../stores/roomStore';
import { syncEngine } from '../engine/SyncEngine';
import { socket } from '../socket';

export const BackgroundSocketSync: React.FC = () => {
  const { joinedRooms, isSocketConnected, clearUnreadCount, incrementUnreadCount } = useRoomStore();

  React.useEffect(() => {
    if (!isSocketConnected || joinedRooms.length === 0) return;

    const currentMemberId = syncEngine.getMemberId();
    const joinedRoomIds = joinedRooms.map((r) => r.roomId);

    joinedRoomIds.forEach((roomId) => {
      socket.emit(
        'auth_and_join',
        {
          roomId,
          memberId: currentMemberId,
          nickname: useRoomStore.getState().nickname || 'Member',
        },
        () => {
          // Joined silently
        }
      );
    });

    const handleBackgroundMessage = (data: any) => {
      const currentRoomId = useRoomStore.getState().currentRoom?.id;
      if (data.roomId !== currentRoomId && data.senderId !== currentMemberId) {
        incrementUnreadCount(data.roomId);
      }
    };

    socket.on('receive_message', handleBackgroundMessage);

    return () => {
      socket.off('receive_message', handleBackgroundMessage);
    };
  }, [joinedRooms, isSocketConnected, incrementUnreadCount, clearUnreadCount]);

  return null;
};

export default BackgroundSocketSync;
