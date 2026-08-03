export type RoomDuration = '1h' | '8h' | '24h' | '7d' | string;
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

export interface RoomRow {
  id: string;
  room_name: string;
  room_type: string;
  duration: string;
  status: string;
  host_id: string;
  is_locked: number;
  last_seq: number;
  created_at: string;
  expires_at: string;
}

export interface RoomPreview {
  id: string;
  name: string;
  type: RoomType;
  duration: RoomDuration;
  status: 'active' | 'ending' | 'ended' | 'destroyed';
  hostId: string;
  memberCount: number;
  participants: ParticipantMetadata[];
  expiresAt?: string;
  isParticipant?: boolean;
  isLocked?: boolean;
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

export interface MessagePayload {
  id: string;
  clientMsgId: string;
  roomId: string;
  senderId: string;
  senderNickname: string;
  content: string;
  sequenceNumber: number;
  createdAt: string;
  replyTo?: ReplyMetadata;
  file?: FileAttachment;
  status?: string;
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
  members: ParticipantMetadata[];
  participants?: ParticipantMetadata[];
}

export type Room = RoomStateV2;
export type RoomState = RoomStateV2;

export interface AuthJoinResult {
  success: boolean;
  token?: string;
  room?: Partial<RoomStateV2>;
  member?: Partial<ParticipantMetadata>;
  activeMembers?: ParticipantMetadata[];
  latestSeq?: number;
  missedMessages?: MessagePayload[];
  missedReactions?: ReactionEvent[];
  error?: string;
}
