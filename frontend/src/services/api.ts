import { RoomPreview, RoomDuration, RoomType } from '../types';
import { API_BASE_URL } from '../config';

class ApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  public async createRoom(params: {
    roomName: string;
    roomType: RoomType;
    duration: RoomDuration;
    hostNickname: string;
  }): Promise<{ roomId: string; hostId: string; expiresAt?: string }> {
    const res = await fetch(`${this.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create workspace');
    }

    return res.json();
  }

  public async previewRoom(roomId: string, memberId?: string, nickname?: string): Promise<RoomPreview> {
    const url = new URL(`${this.baseUrl}/api/rooms/${roomId}/preview`);
    if (memberId) url.searchParams.set('memberId', memberId);
    if (nickname) url.searchParams.set('nickname', nickname);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const err = new Error(errorData.error || 'Workspace not found or expired') as any;
      err.status = res.status;
      throw err;
    }

    return res.json();
  }

  public async uploadFile(
    roomId: string,
    file: File,
    metadata: {
      clientMsgId: string;
      senderId: string;
      senderNickname: string;
      content?: string;
      replyTo?: any;
    }
  ): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('roomId', roomId);
    formData.append('clientMsgId', metadata.clientMsgId);
    formData.append('senderId', metadata.senderId);
    formData.append('senderNickname', metadata.senderNickname);
    if (metadata.content) formData.append('content', metadata.content);
    if (metadata.replyTo) formData.append('replyTo', JSON.stringify(metadata.replyTo));

    const res = await fetch(`${this.baseUrl}/api/files/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'File upload failed');
    }

    return res.json();
  }

  public getFileDownloadUrl(fileId: string): string {
    return `${this.baseUrl}/api/files/${fileId}`;
  }
}

export const apiService = new ApiService();
export default apiService;
