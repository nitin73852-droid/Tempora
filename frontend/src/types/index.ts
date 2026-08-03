export type RoomDuration = '30-min' | '1-hour' | '24-hour' | '7-days' | 'custom' | 'manual';
export type RoomType = 'two-people' | 'group';

export interface ParticipantMetadata {
  memberId: string;
  nickname: string;
  avatar?: string;
  role: 'host' | 'member';
  online: boolean;
  joinedAt: string;
}

export type Member = ParticipantMetadata;

export interface RoomPreview {
  id: string;
  name: string;
  type: RoomType;
  duration: RoomDuration;
  status: 'active' | 'ending' | 'ended' | 'destroyed';
  hostId: string;
  hostNickname?: string;
  participantCount?: number;
  participants: ParticipantMetadata[];
  expiresAt?: string;
  isParticipant?: boolean;
  isFull?: boolean;
  isLocked?: boolean;
}

export interface JoinedRoomSummary {
  roomId: string;
  roomName: string;
  roomType: RoomType;
  duration: RoomDuration;
  status: 'active' | 'ending' | 'ended' | 'destroyed';
  expiresAt?: string;
  joinedAt: string;
}

export interface ReplyMetadata {
  messageId: string;
  senderId: string;
  senderNickname: string;
  messagePreview: string;
}

export interface FileAttachment {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface ChatMessage {
  id: string;
  clientMsgId?: string;
  roomId: string;
  senderId: string;
  senderNickname: string;
  content: string;
  sequenceNumber?: number;
  createdAt: string;
  replyTo?: ReplyMetadata;
  file?: FileAttachment;
  status?: 'PENDING' | 'STORED' | 'DELIVERED';
}

export interface OutboxMessage {
  clientMsgId: string;
  roomId: string;
  senderId: string;
  senderNickname: string;
  content: string;
  replyTo?: ReplyMetadata;
  createdAt: string;
  status: 'PENDING';
}

export interface ReactionEvent {
  id: string;
  roomId: string;
  messageId: string;
  memberId: string;
  senderNickname?: string;
  emoji: string;
  createdAt: string;
}

export interface RoomStateV2 {
  id: string;
  name: string;
  type: RoomType;
  duration: RoomDuration;
  status: 'active' | 'ending' | 'ended' | 'destroyed';
  hostId: string;
  isLocked?: boolean;
  lastSeq: number;
  createdAt: string;
  expiresAt?: string;
  participants: ParticipantMetadata[];
}

export type Room = RoomStateV2;
