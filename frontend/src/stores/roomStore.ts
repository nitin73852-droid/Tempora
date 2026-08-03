import { create } from 'zustand';
import { RoomPreview, ChatMessage, ReactionEvent, JoinedRoomSummary, ParticipantMetadata } from '../types';

interface RoomStoreState {
  nickname: string;
  userAvatar: string | null;
  joinedRooms: JoinedRoomSummary[];
  currentRoom: RoomPreview | null;
  chatMessages: ChatMessage[];
  reactions: Record<string, ReactionEvent[]>;
  roomAvatars: Record<string, string>;
  typingUsers: Record<string, boolean>;
  unreadCounts: Record<string, number>;
  syncState: 'IDLE' | 'CONNECTING' | 'SYNCING' | 'READY' | 'ERROR';
  isSocketConnected: boolean;

  setNickname: (nickname: string) => void;
  setUserAvatar: (avatar: string | null) => void;
  addJoinedRoom: (room: JoinedRoomSummary) => void;
  removeJoinedRoom: (roomId: string) => void;
  setRoom: (room: RoomPreview | null) => void;
  setParticipants: (participants: ParticipantMetadata[]) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  addOrUpdateMessage: (msg: ChatMessage) => void;
  applyReactionEvent: (event: ReactionEvent) => void;
  setRoomAvatar: (nickname: string, avatar: string) => void;
  setTypingUsers: (typing: Record<string, boolean>) => void;
  incrementUnreadCount: (roomId: string) => void;
  clearUnreadCount: (roomId: string) => void;
  setSyncState: (state: 'IDLE' | 'CONNECTING' | 'SYNCING' | 'READY' | 'ERROR') => void;
  setSocketConnected: (connected: boolean) => void;
  clearRoomState: () => void;
}

const NICKNAME_KEY = 'tempora_user_nickname';
const AVATAR_KEY = 'tempora_user_avatar';
const JOINED_ROOMS_KEY = 'tempora_joined_rooms';

const loadSavedNickname = (): string => {
  return localStorage.getItem(NICKNAME_KEY) || '';
};

const loadSavedAvatar = (): string | null => {
  return localStorage.getItem(AVATAR_KEY) || null;
};

const loadJoinedRooms = (): JoinedRoomSummary[] => {
  try {
    const raw = localStorage.getItem(JOINED_ROOMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const useRoomStore = create<RoomStoreState>((set) => ({
  nickname: loadSavedNickname(),
  userAvatar: loadSavedAvatar(),
  joinedRooms: loadJoinedRooms(),
  currentRoom: null,
  chatMessages: [],
  reactions: {},
  roomAvatars: {},
  typingUsers: {},
  unreadCounts: {},
  syncState: 'IDLE',
  isSocketConnected: false,

  setNickname: (nickname) => {
    localStorage.setItem(NICKNAME_KEY, nickname);
    set({ nickname });
  },

  setUserAvatar: (userAvatar) => {
    if (userAvatar) {
      localStorage.setItem(AVATAR_KEY, userAvatar);
    } else {
      localStorage.removeItem(AVATAR_KEY);
    }
    set({ userAvatar });
  },

  addJoinedRoom: (room) =>
    set((state) => {
      const filtered = state.joinedRooms.filter((r) => r.roomId !== room.roomId);
      const updated = [room, ...filtered];
      localStorage.setItem(JOINED_ROOMS_KEY, JSON.stringify(updated));
      return { joinedRooms: updated };
    }),

  removeJoinedRoom: (roomId) =>
    set((state) => {
      const updated = state.joinedRooms.filter((r) => r.roomId !== roomId);
      localStorage.setItem(JOINED_ROOMS_KEY, JSON.stringify(updated));
      return { joinedRooms: updated };
    }),

  setRoom: (currentRoom) => set({ currentRoom }),

  setParticipants: (participants) =>
    set((state) => {
      if (!state.currentRoom) return state;
      return {
        currentRoom: {
          ...state.currentRoom,
          participantCount: participants.length,
          participants,
        },
      };
    }),

  setChatMessages: (chatMessages) => set({ chatMessages }),

  addOrUpdateMessage: (msg) =>
    set((state) => {
      const existingIdx = state.chatMessages.findIndex(
        (m) => (msg.clientMsgId && m.clientMsgId === msg.clientMsgId) || m.id === msg.id
      );

      if (existingIdx !== -1) {
        const updated = [...state.chatMessages];
        updated[existingIdx] = { ...updated[existingIdx], ...msg };
        return { chatMessages: updated };
      }

      return { chatMessages: [...state.chatMessages, msg] };
    }),

  applyReactionEvent: (event) =>
    set((state) => {
      const msgReactions = state.reactions[event.messageId] || [];
      const filtered = msgReactions.filter((r) => r.memberId !== event.memberId);

      if (!event.emoji) {
        return {
          reactions: {
            ...state.reactions,
            [event.messageId]: filtered,
          },
        };
      }

      return {
        reactions: {
          ...state.reactions,
          [event.messageId]: [...filtered, event],
        },
      };
    }),

  setRoomAvatar: (nickname, avatar) =>
    set((state) => ({
      roomAvatars: { ...state.roomAvatars, [nickname]: avatar },
    })),

  setTypingUsers: (typingUsers) => set({ typingUsers }),

  incrementUnreadCount: (roomId) =>
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [roomId]: (state.unreadCounts[roomId] || 0) + 1,
      },
    })),

  clearUnreadCount: (roomId) =>
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [roomId]: 0,
      },
    })),

  setSyncState: (syncState) => set({ syncState }),

  setSocketConnected: (isSocketConnected) => set({ isSocketConnected }),

  clearRoomState: () =>
    set({
      currentRoom: null,
      chatMessages: [],
      reactions: {},
      typingUsers: {},
      syncState: 'IDLE',
    }),
}));
