import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoomStore } from '../stores/roomStore';
import { apiService } from '../services/api';
import CreateRoomModal from '../components/CreateRoomModal';
import SettingsModal from '../components/SettingsModal';
import NicknameModal from '../components/NicknameModal';
import Button from '../components/ui/Button';
import DefaultAvatar from '../components/DefaultAvatar';
import {
  Shield,
  Plus,
  LogIn,
  Clock,
  Lock,
  ArrowRight,
  Settings,
  Sparkles,
  Zap,
  Trash2,
} from 'lucide-react';
import { RoomDuration, RoomType } from '../types';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { nickname, setNickname, userAvatar, joinedRooms, removeJoinedRoom } = useRoomStore();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleCreateWorkspace = async (params: {
    roomName: string;
    roomType: RoomType;
    duration: RoomDuration;
  }) => {
    if (!nickname) {
      setIsNicknameModalOpen(true);
      return;
    }

    const result = await apiService.createRoom({
      ...params,
      hostNickname: nickname,
    });

    navigate(`/room/${result.roomId}`);
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinRoomCode.trim()) return;

    if (!nickname) {
      setIsNicknameModalOpen(true);
      return;
    }

    const cleanCode = joinRoomCode.trim().toUpperCase();

    try {
      setIsJoining(true);
      setJoinError(null);
      await apiService.previewRoom(cleanCode, undefined, nickname);
      navigate(`/room/${cleanCode}`);
    } catch (err: any) {
      setJoinError(err.message || 'Workspace not found or expired');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-background cyber-grid flex flex-col justify-between">
      <header className="px-4 sm:px-8 py-4 border-b border-outline-variant/30 flex items-center justify-between glass-layer">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
            <Shield className="w-5 h-5" />
          </div>
          <span className="text-base sm:text-lg font-bold tracking-tight text-on-surface">Tempora V2</span>
        </div>

        <div className="flex items-center space-x-3">
          {nickname ? (
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant/60 hover:border-primary transition cursor-pointer text-xs font-semibold text-on-surface"
            >
              {userAvatar ? (
                <img src={userAvatar} alt={nickname} className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <DefaultAvatar size={20} />
              )}
              <span>{nickname}</span>
              <Settings className="w-3.5 h-3.5 text-on-surface-variant ml-1" />
            </button>
          ) : (
            <Button size="sm" onClick={() => setIsNicknameModalOpen(true)}>
              Choose Nickname
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 sm:py-16 space-y-12 my-auto">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-mono text-primary font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Zero Permanent Chat History Guarantee</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-on-surface leading-tight">
            Private. Temporary. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              Encrypted Rest Communications.
            </span>
          </h1>

          <p className="text-xs sm:text-base text-on-surface-variant leading-relaxed">
            Create temporary workspace rooms for instant, end-to-end server-encrypted collaboration. Conversations automatically vanish once expired.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" onClick={() => setIsCreateModalOpen(true)} className="w-full sm:w-auto">
              <Plus className="w-5 h-5 mr-2" />
              Create Workspace
            </Button>
          </div>
        </div>

        <div className="max-w-md mx-auto p-5 rounded-xl bg-surface-container border border-outline-variant/60 shadow-2xl space-y-4">
          <div className="flex items-center space-x-2 text-sm font-semibold text-on-surface">
            <LogIn className="w-4 h-4 text-primary" />
            <span>Join Existing Workspace</span>
          </div>

          {joinError && (
            <div className="p-2.5 rounded-lg bg-error/10 border border-error/30 text-error text-xs font-mono">
              {joinError}
            </div>
          )}

          <form onSubmit={handleJoinSubmit} className="flex items-center space-x-2">
            <input
              type="text"
              value={joinRoomCode}
              onChange={(e) => setJoinRoomCode(e.target.value)}
              placeholder="Enter workspace ID (e.g. STQJ7DU8)"
              className="flex-1 bg-surface-container-high border border-outline-variant/60 rounded-lg px-3.5 py-2.5 text-xs sm:text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary uppercase font-mono"
              maxLength={12}
            />
            <Button type="submit" disabled={isJoining || !joinRoomCode.trim()} size="md" className="shrink-0">
              <span>{isJoining ? 'Joining...' : 'Join'}</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </form>
        </div>

        {joinedRooms.length > 0 && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-on-surface-variant">
                Recent Workspaces ({joinedRooms.length})
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {joinedRooms.map((room) => (
                <div
                  key={room.roomId}
                  onClick={() => navigate(`/room/${room.roomId}`)}
                  className="p-4 rounded-xl bg-surface-container/80 border border-outline-variant/40 hover:border-primary/60 transition cursor-pointer flex items-center justify-between group shadow-sm"
                >
                  <div className="space-y-1 min-w-0 flex-1 pr-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-xs sm:text-sm text-on-surface truncate group-hover:text-primary transition">
                        {room.roomName}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                        {room.roomId}
                      </span>
                    </div>
                    <div className="flex items-center space-x-3 text-[11px] text-on-surface-variant font-mono">
                      <span className="capitalize">{room.roomType}</span>
                      <span>•</span>
                      <span className="capitalize">{room.duration}</span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeJoinedRoom(room.roomId);
                    }}
                    className="p-1.5 rounded hover:bg-error/10 text-on-surface-variant hover:text-error transition cursor-pointer shrink-0"
                    title="Remove from recent list"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-outline-variant/20">
          <div className="p-4 rounded-xl bg-surface-container-high/40 border border-outline-variant/30 space-y-2">
            <Zap className="w-5 h-5 text-primary" />
            <h3 className="text-xs sm:text-sm font-semibold text-on-surface">Monotonic Synchronization</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Sequence-based messaging pipeline guarantees message delivery order even during network reconnection.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-surface-container-high/40 border border-outline-variant/30 space-y-2">
            <Lock className="w-5 h-5 text-amber-400" />
            <h3 className="text-xs sm:text-sm font-semibold text-on-surface">Server-Side AES-256 Encryption</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Message transport and temporary uploads are encrypted at rest on backend databases.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-surface-container-high/40 border border-outline-variant/30 space-y-2">
            <Clock className="w-5 h-5 text-secondary" />
            <h3 className="text-xs sm:text-sm font-semibold text-on-surface">Auto Destruction</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              All workspace data, messages, and temporary shared files are permanently purged on expiration.
            </p>
          </div>
        </div>
      </main>

      <footer className="px-4 py-4 border-t border-outline-variant/30 text-center text-xs text-on-surface-variant font-mono">
        Tempora V2 Platform • Private & Ephemeral Communication System
      </footer>

      <CreateRoomModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateWorkspace}
      />

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <NicknameModal
        isOpen={isNicknameModalOpen}
        onSave={(name) => {
          setNickname(name);
          setIsNicknameModalOpen(false);
        }}
      />
    </div>
  );
};

export default LandingPage;
