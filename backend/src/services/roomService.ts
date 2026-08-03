import { RoomRow, RoomStateV2, RoomType, RoomDuration } from '../types';
import { dbClient } from '../database/client';
import { memberService } from './memberService';

class RoomService {
  public async createRoom(
    id: string,
    name: string,
    type: RoomType,
    duration: RoomDuration,
    customDurationMinutes?: number,
    hostNickname?: string,
    hostMemberId?: string,
    hostAvatar?: string
  ): Promise<RoomStateV2> {
    const createdAt = new Date().toISOString();
    let expiresAt: string | undefined;

    if (duration === '30-min') {
      expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    } else if (duration === '1-hour' || duration === '1h') {
      expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    } else if (duration === '24-hour' || duration === '8h' || duration === '24h') {
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else if (duration === '7-days' || duration === '7d') {
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (duration === 'custom' && customDurationMinutes) {
      expiresAt = new Date(Date.now() + customDurationMinutes * 60 * 1000).toISOString();
    }

    const hostId = hostMemberId || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const finalHostNickname = hostNickname || 'Host';

    await dbClient.execute({
      sql: `INSERT INTO rooms (id, room_name, room_type, duration, status, host_id, is_locked, last_seq, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      args: [id, name, type, duration, 'active', hostId, createdAt, expiresAt || 'never'],
    });

    await memberService.addMember(id, hostId, finalHostNickname, hostAvatar, 'host');

    return {
      id,
      name,
      type,
      duration,
      status: 'active',
      hostId,
      isLocked: false,
      lastSeq: 0,
      createdAt,
      expiresAt,
      participants: [
        {
          memberId: hostId,
          nickname: finalHostNickname,
          avatar: hostAvatar,
          role: 'host',
          online: true,
          joinedAt: createdAt,
        },
      ],
    };
  }

  public async getRoomRow(id: string): Promise<RoomRow | null> {
    const result = await dbClient.execute({
      sql: `SELECT * FROM rooms WHERE id = ?`,
      args: [id],
    });

    if (result.rows.length === 0) return null;
    return result.rows[0] as unknown as RoomRow;
  }

  public async getRoom(id: string, onlineMemberIds?: Set<string>): Promise<RoomStateV2 | null> {
    const roomRow = await this.getRoomRow(id);
    if (!roomRow) return null;

    const members = await memberService.getRoomMembers(id);
    const mappedMembers = members.map((m) => ({
      ...m,
      online: onlineMemberIds ? onlineMemberIds.has(m.memberId) : false,
    }));

    return {
      id: roomRow.id,
      name: roomRow.room_name,
      type: roomRow.room_type as RoomType,
      duration: roomRow.duration as RoomDuration,
      status: roomRow.status as 'active' | 'ending' | 'ended' | 'destroyed',
      hostId: roomRow.host_id,
      isLocked: Boolean(roomRow.is_locked),
      lastSeq: Number(roomRow.last_seq || 0),
      createdAt: roomRow.created_at,
      expiresAt: roomRow.expires_at === 'never' ? undefined : roomRow.expires_at,
      participants: mappedMembers,
    };
  }

  public async toggleRoomLock(roomId: string, isLocked: boolean, hostId: string): Promise<boolean> {
    const roomRow = await this.getRoomRow(roomId);
    if (!roomRow) throw new Error('Room not found');

    if (roomRow.host_id !== hostId) {
      throw new Error('Only the host can change group lock state');
    }
    if (roomRow.room_type !== 'group') {
      throw new Error('Lock feature applies only to group rooms');
    }

    const lockedVal = isLocked ? 1 : 0;
    await dbClient.execute({
      sql: `UPDATE rooms SET is_locked = ? WHERE id = ?`,
      args: [lockedVal, roomId],
    });

    return isLocked;
  }

  public async getUserJoinedRooms(memberId?: string, nickname?: string) {
    if (!memberId && !nickname) return [];

    let result;
    try {
      if (memberId) {
        result = await dbClient.execute({
          sql: `SELECT DISTINCT r.* FROM rooms r JOIN members m ON r.id = m.room_id WHERE m.member_id = ? AND r.status != 'destroyed'`,
          args: [memberId],
        });
      } else {
        result = await dbClient.execute({
          sql: `SELECT DISTINCT r.* FROM rooms r JOIN members m ON r.id = m.room_id WHERE m.nickname = ? AND r.status != 'destroyed'`,
          args: [nickname!],
        });
      }
    } catch (err: any) {
      console.warn('[RoomService] Query fallback for getUserJoinedRooms:', err.message);
      return [];
    }

    return result.rows.map((row) => ({
      roomId: row.id as string,
      roomName: row.room_name as string,
      id: row.id as string,
      name: row.room_name as string,
      type: row.room_type as RoomType,
      roomType: row.room_type as RoomType,
      duration: row.duration as RoomDuration,
      status: row.status as 'active' | 'ending' | 'ended' | 'destroyed',
      hostId: row.host_id as string,
      isHost: row.host_id === memberId,
      isLocked: Boolean(row.is_locked),
      lastSeq: Number(row.last_seq || 0),
      createdAt: row.created_at as string,
      expiresAt: row.expires_at === 'never' ? undefined : (row.expires_at as string),
    }));
  }

  public async deleteRoom(id: string): Promise<void> {
    await dbClient.execute({
      sql: `UPDATE rooms SET status = 'destroyed' WHERE id = ?`,
      args: [id],
    });
  }
}

export const roomService = new RoomService();
export default roomService;
