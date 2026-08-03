import { Member } from '../types';
import { dbClient } from '../database/client';

class MemberService {
  public async addMember(
    roomId: string,
    memberId: string,
    nickname: string,
    avatar?: string,
    role: 'host' | 'member' = 'member'
  ): Promise<void> {
    const nowStr = new Date().toISOString();
    await dbClient.execute({
      sql: `INSERT INTO members (room_id, member_id, nickname, avatar, role, joined_at, status)
            VALUES (?, ?, ?, ?, ?, ?, 'active')
            ON CONFLICT(room_id, member_id) DO UPDATE SET
              nickname = excluded.nickname,
              avatar = COALESCE(excluded.avatar, members.avatar),
              status = 'active'`,
      args: [roomId, memberId, nickname, avatar || null, role, nowStr],
    });
  }

  public async updateAvatar(roomId: string, memberId: string, avatar: string): Promise<void> {
    await dbClient.execute({
      sql: `UPDATE members SET avatar = ? WHERE room_id = ? AND member_id = ?`,
      args: [avatar, roomId, memberId],
    });
  }

  public async updateMemberAvatar(roomId: string, memberId: string, avatar: string): Promise<void> {
    return this.updateAvatar(roomId, memberId, avatar);
  }

  public async getRoomMembers(roomId: string): Promise<Member[]> {
    const result = await dbClient.execute({
      sql: `SELECT member_id, nickname, avatar, role, joined_at, status FROM members WHERE room_id = ? AND status = 'active' ORDER BY joined_at ASC`,
      args: [roomId],
    });

    return result.rows.map((row) => ({
      memberId: row.member_id as string,
      nickname: row.nickname as string,
      avatar: (row.avatar as string) || undefined,
      role: row.role as 'host' | 'member',
      online: false,
      joinedAt: row.joined_at as string,
    }));
  }

  public async removeRoomMember(
    roomId: string,
    memberId: string,
    _reason: 'LEFT' | 'KICKED' = 'LEFT'
  ): Promise<void> {
    const nowStr = new Date().toISOString();
    await dbClient.execute({
      sql: `UPDATE members SET status = 'left', left_at = ? WHERE room_id = ? AND member_id = ?`,
      args: [nowStr, roomId, memberId],
    });

    try {
      await dbClient.execute({
        sql: `DELETE FROM pending_messages WHERE room_id = ? AND recipient_id = ?`,
        args: [roomId, memberId],
      });
      await dbClient.execute({
        sql: `DELETE FROM pending_reactions WHERE room_id = ? AND recipient_id = ?`,
        args: [roomId, memberId],
      });
    } catch {
      // Ignore if queue empty
    }
  }

  public async removeMember(
    roomId: string,
    memberId: string,
    reason: 'LEFT' | 'KICKED' = 'LEFT'
  ): Promise<void> {
    return this.removeRoomMember(roomId, memberId, reason);
  }

  public async leaveMember(roomId: string, memberId: string): Promise<void> {
    return this.removeRoomMember(roomId, memberId, 'LEFT');
  }
}

export const memberService = new MemberService();
export default memberService;
