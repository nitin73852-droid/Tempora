import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoomStore } from '../stores/roomStore';
import Button from '../components/ui/Button';
import DefaultAvatar from '../components/DefaultAvatar';
import SettingsModal from '../components/SettingsModal';
import NicknameModal from '../components/NicknameModal';
import JoinRoomPreviewModal from '../components/JoinRoomPreviewModal';
import ConfirmDialog from '../components/ConfirmDialog';
import RoomNotFoundView from '../components/RoomNotFoundView';
import FileAttachmentCard from '../components/FileAttachmentCard';
import MessageInfoModal from '../components/MessageInfoModal';
import { decodeHtmlEntities } from '../utils/sanitize';
import {
  Send,
  Lock,
  Unlock,
  ArrowLeft,
  Users,
  Copy,
  Check,
  Sparkles,
  LogOut,
  Trash2,
  Settings,
  Reply,
  X,
  Clock,
  Info,
  Menu,
  Paperclip,
  Smile,
  Plus,
  MoreVertical,
  UserX,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RoomPreview, ReplyMetadata, ReactionEvent, ChatMessage, ParticipantMetadata } from '../types';
import { syncEngine } from '../engine/SyncEngine';
import { messageManager } from '../engine/MessageManager';
import { apiService } from '../services/api';

type PageState =
  | 'check_nickname'
  | 'checking_status'
  | 'preview'
  | 'connecting'
  | 'room'
  | 'not_found'
  | 'expired'
  | 'room_ended';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const EXTENDED_EMOJIS = [
  '🔥', '🎉', '🚀', '💯', '👏', '👀',
  '😍', '🤔', '🤝', '⚡', '✨', '🙌',
  '🥳', '😎', '💡', '💪', '🎯', '❤️‍🔥',
  '🤯', '🙈', '🫡', '📌', '🏆', '⭐',
];

const formatTime = (tsStr: string): string => {
  const d = new Date(tsStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatRemainingTime = (expiresAtStr?: string): string => {
  if (!expiresAtStr || expiresAtStr === 'never') return 'Manual Ending';

  const expiryMs = new Date(expiresAtStr).getTime();
  if (isNaN(expiryMs)) return 'Manual Ending';

  const diffMs = expiryMs - Date.now();
  if (diffMs <= 0) return 'Expired';

  const totalSecs = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (days > 0) {
    return `${days} ${days === 1 ? 'day' : 'days'} ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  if (hours > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${mins} ${mins === 1 ? 'min' : 'mins'}`;
  }
  if (mins > 0) {
    return `${mins} ${mins === 1 ? 'min' : 'mins'}`;
  }
  return `${secs} ${secs === 1 ? 'second' : 'seconds'}`;
};

const RoomInfoContent: React.FC<{
  remainingTimeText: string;
  expiresAt?: string;
  roomTypeLabel: string;
  isGroupRoom: boolean;
  isHost: boolean;
  isLocked?: boolean;
  participants: ParticipantMetadata[];
  onlineParticipants: ParticipantMetadata[];
  offlineParticipants: ParticipantMetadata[];
  renderAvatar: (nick: string, size?: number) => React.ReactNode;
  onToggleLockClick?: () => void;
  onKickMemberClick?: (member: ParticipantMetadata) => void;
  onClose?: () => void;
}> = ({
  remainingTimeText,
  expiresAt,
  roomTypeLabel,
  isGroupRoom,
  isHost,
  isLocked,
  participants,
  onlineParticipants,
  offlineParticipants,
  renderAvatar,
  onToggleLockClick,
  onKickMemberClick,
  onClose,
}) => {
  const [activeMenuMemberId, setActiveMenuMemberId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full bg-surface-container/90">
      <div className="p-4 border-b border-outline-variant/30 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-on-surface">
          <Info className="w-4 h-4 text-primary" />
          <span>Room Information</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition cursor-pointer"
            aria-label="Close Room Information"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
        <div className="space-y-1.5 p-3 rounded-lg bg-surface-container/60 border border-outline-variant/40">
          <div className="flex items-center space-x-2 text-xs font-semibold text-on-surface-variant">
            <Clock className="w-4 h-4 text-secondary" />
            <span>Time Remaining</span>
          </div>
          <p className="text-sm font-mono font-bold text-primary pl-6">
            {remainingTimeText || formatRemainingTime(expiresAt)}
          </p>
        </div>

        <div className="space-y-1.5 p-3 rounded-lg bg-surface-container/60 border border-outline-variant/40">
          <div className="flex items-center space-x-2 text-xs font-semibold text-on-surface-variant">
            <Users className="w-4 h-4 text-primary" />
            <span>Room Type</span>
          </div>
          <p className="text-xs font-semibold text-on-surface pl-6 capitalize">
            {roomTypeLabel}
          </p>
        </div>

        {isHost && isGroupRoom && (
          <div className="space-y-2 p-3 rounded-lg bg-surface-container/60 border border-outline-variant/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-semibold text-on-surface-variant">
                {isLocked ? <Lock className="w-4 h-4 text-amber-400" /> : <Unlock className="w-4 h-4 text-primary" />}
                <span>Group Lock State</span>
              </div>
              <span
                className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                  isLocked ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-primary/10 text-primary border border-primary/20'
                }`}
              >
                {isLocked ? 'Locked' : 'Unlocked'}
              </span>
            </div>
            <p className="text-[11px] text-on-surface-variant/80 leading-tight">
              {isLocked ? 'New members cannot join via link.' : 'Public joins allowed via invite link.'}
            </p>
            <Button
              variant={isLocked ? 'secondary' : 'ghost'}
              size="sm"
              onClick={onToggleLockClick}
              className="w-full text-xs mt-1 py-1.5 flex items-center justify-center space-x-1.5 border border-outline-variant/40"
            >
              {isLocked ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-primary" />
                  <span>Unlock Group</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Lock Group</span>
                </>
              )}
            </Button>
          </div>
        )}

        <div className="border-t border-outline-variant/30 my-2" />

        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-2 text-xs font-bold text-on-surface">
              <Users className="w-4 h-4 text-primary" />
              <span>Participants</span>
            </div>
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              {participants.length} {participants.length === 1 ? 'Member' : 'Members'}
            </span>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant px-1 font-mono">
              Online ({onlineParticipants.length})
            </p>
            <div className="space-y-1">
              {onlineParticipants.map((p) => (
                <div key={p.memberId} className="flex items-center justify-between p-2 rounded hover:bg-surface-container-high/50 text-xs transition relative">
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                    <div className="relative">
                      {renderAvatar(p.nickname, 26)}
                      <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-primary ring-2 ring-background" />
                    </div>
                    <span className="truncate text-on-surface font-medium">{p.nickname}</span>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    {p.role === 'host' ? (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/20 shrink-0">
                        Host
                      </span>
                    ) : (
                      isHost && isGroupRoom && (
                        <div className="relative">
                          <button
                            onClick={() => setActiveMenuMemberId(activeMenuMemberId === p.memberId ? null : p.memberId)}
                            className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer"
                            title="Moderation Menu"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {activeMenuMemberId === p.memberId && (
                            <div className="absolute right-0 top-6 z-50 p-1 bg-surface-container-high border border-outline-variant/60 rounded-lg shadow-xl w-32">
                              <button
                                onClick={() => {
                                  setActiveMenuMemberId(null);
                                  onKickMemberClick?.(p);
                                }}
                                className="w-full px-2.5 py-1.5 text-left text-xs font-semibold text-error hover:bg-error/10 rounded flex items-center space-x-1.5 transition cursor-pointer"
                              >
                                <UserX className="w-3.5 h-3.5" />
                                <span>Kick Member</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {offlineParticipants.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant px-1 font-mono">
                Offline ({offlineParticipants.length})
              </p>
              <div className="space-y-1">
                {offlineParticipants.map((p) => (
                  <div key={p.memberId} className="flex items-center justify-between p-2 rounded hover:bg-surface-container-high/30 text-xs opacity-60 transition relative">
                    <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                      <div className="relative">
                        {renderAvatar(p.nickname, 26)}
                        <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-outline-variant ring-2 ring-background" />
                      </div>
                      <span className="truncate text-on-surface font-medium">{p.nickname}</span>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0">
                      {p.role === 'host' ? (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-outline-variant/20 text-on-surface-variant border border-outline-variant/30 shrink-0">
                          Host
                        </span>
                      ) : (
                        isHost && isGroupRoom && (
                          <div className="relative">
                            <button
                              onClick={() => setActiveMenuMemberId(activeMenuMemberId === p.memberId ? null : p.memberId)}
                              className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition cursor-pointer"
                              title="Moderation Menu"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>

                            {activeMenuMemberId === p.memberId && (
                              <div className="absolute right-0 top-6 z-50 p-1 bg-surface-container-high border border-outline-variant/60 rounded-lg shadow-xl w-32">
                                <button
                                  onClick={() => {
                                    setActiveMenuMemberId(null);
                                    onKickMemberClick?.(p);
                                  }}
                                  className="w-full px-2.5 py-1.5 text-left text-xs font-semibold text-error hover:bg-error/10 rounded flex items-center space-x-1.5 transition cursor-pointer"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                  <span>Kick Member</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const RoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const {
    nickname,
    setNickname,
    userAvatar,
    currentRoom,
    chatMessages,
    reactions,
    roomAvatars,
    typingUsers,
    syncState,
    clearRoomState,
    clearUnreadCount,
  } = useRoomStore();

  const [pageState, setPageState] = useState<PageState>(() => {
    return useRoomStore.getState().nickname ? 'checking_status' : 'check_nickname';
  });
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [remainingTimeText, setRemainingTimeText] = useState<string>('');
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [initStatusText, setInitStatusText] = useState('Checking workspace status...');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isConfirmLeaveOpen, setIsConfirmLeaveOpen] = useState(false);
  const [isConfirmEndOpen, setIsConfirmEndOpen] = useState(false);

  const [isConfirmLockOpen, setIsConfirmLockOpen] = useState(false);
  const [isConfirmKickOpen, setIsConfirmKickOpen] = useState(false);
  const [memberToKick, setMemberToKick] = useState<ParticipantMetadata | null>(null);

  const [replyingTo, setReplyingTo] = useState<{ id: string; senderNickname: string; senderId: string; content: string } | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState<boolean>(false);
  const [showFullPicker, setShowFullPicker] = useState<boolean>(false);
  const [openBelowMsgIds, setOpenBelowMsgIds] = useState<Record<string, boolean>>({});

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPressDraggingRef = useRef<boolean>(false);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initializedRoomIdRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isChatReady = syncState === 'READY';
  const activeTypingNames = Object.keys(typingUsers).filter(name => name !== nickname);
  const expiresAt = currentRoom?.expiresAt || preview?.expiresAt;
  const myMemberId = messageManager.getMemberId();

  // ── Listen for Kick Event ──
  useEffect(() => {
    const handleKicked = (e: CustomEvent) => {
      setToastMessage(e.detail?.message || 'You were removed from this group by the Host.');
      setTimeout(() => {
        navigate('/');
      }, 2000);
    };
    window.addEventListener('tempora:kicked' as any, handleKicked);
    return () => window.removeEventListener('tempora:kicked' as any, handleKicked);
  }, [navigate]);

  // ── Drift-Free Remaining Time Countdown ──
  useEffect(() => {
    const updateTimer = () => {
      setRemainingTimeText(formatRemainingTime(expiresAt));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  // ── Universal Single Click/Tap-Outside Listener for All Popups & Selection ──
  useEffect(() => {
    if (!activeReactionMsgId && !selectedMessage && !showFullPicker) return;

    const handleOutsideClick = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      if (target.closest('.tempora-interactive-popup') || target.closest('.tempora-action-bar')) {
        return;
      }

      setActiveReactionMsgId(null);
      setSelectedMessage(null);
      setShowFullPicker(false);
    };

    document.addEventListener('pointerdown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);

    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [activeReactionMsgId, selectedMessage, showFullPicker]);

  // ── Escape Key Listener ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isMobileDrawerOpen) setIsMobileDrawerOpen(false);
        handleDismissSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileDrawerOpen]);

  useEffect(() => {
    if (chatMessages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  useEffect(() => {
    if (roomId && pageState === 'room' && isChatReady) {
      clearUnreadCount(roomId);
    }
  }, [roomId, pageState, isChatReady, clearUnreadCount]);

  // ── Strict Room Entry via State Machine ──
  useEffect(() => {
    if (!roomId) return;

    if (!nickname) {
      setPageState('check_nickname');
      initializedRoomIdRef.current = null;
      return;
    }

    const initKey = `${roomId}_${nickname}`;
    if (initializedRoomIdRef.current === initKey) return;

    let isCancelled = false;

    const runInit = async () => {
      initializedRoomIdRef.current = initKey;
      setPageState('checking_status');
      setInitStatusText('Checking workspace status...');

      const memberId = messageManager.getMemberId();
      const joinedRooms = useRoomStore.getState().joinedRooms;
      const isAlreadyJoinedLocally = joinedRooms.some((r) => r.roomId === roomId);

      try {
        const previewData = await apiService.previewRoom(roomId, memberId, nickname);

        if (isCancelled) return;

        setPreview(previewData);

        if (isAlreadyJoinedLocally || previewData.isParticipant) {
          setPageState('connecting');
          setInitStatusText('Connecting to workspace server...');
          await syncEngine.initializeRoomSequence(roomId, nickname);
          if (!isCancelled) setPageState('room');
        } else {
          setPageState('preview');
        }
      } catch (err: any) {
        if (isCancelled) return;
        if (err.status === 410) {
          setPageState('expired');
        } else {
          setPageState('not_found');
        }
      }
    };

    runInit();

    return () => {
      isCancelled = true;
    };
  }, [roomId, nickname, navigate]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      clearRoomState();
      initializedRoomIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Typing Indicator Handler ──
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    if (!roomId || !nickname) return;

    syncEngine.sendTyping(roomId, nickname, true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      syncEngine.sendTyping(roomId, nickname, false);
    }, 2000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    const MAX_FILE_SIZE = 15 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('Maximum file size is 15 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
  };

  const handleJumpToOriginalMessage = (targetMsgId: string) => {
    const el = document.getElementById(`msg-${targetMsgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(targetMsgId);
      setTimeout(() => {
        setHighlightedMsgId(null);
      }, 2000);
    } else {
      setToastMessage('Original message unavailable');
      setTimeout(() => {
        setToastMessage(null);
      }, 3000);
    }
  };

  const triggerReactionForMessage = (msgId: string, targetEl: HTMLElement | null) => {
    if (activeReactionMsgId === msgId) {
      setActiveReactionMsgId(null);
      setShowFullPicker(false);
      return;
    }

    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const shouldOpenBelow = rect.top < 220;
      setOpenBelowMsgIds((prev) => ({ ...prev, [msgId]: shouldOpenBelow }));
    }

    setActiveReactionMsgId(msgId);
    setShowFullPicker(false);
  };

  const handleSelectEmoji = (msgId: string, emoji: string) => {
    if (!roomId) return;
    syncEngine.sendReaction(roomId, msgId, emoji);
    handleDismissSelection();
  };

  const handleDismissSelection = () => {
    setSelectedMessage(null);
    setActiveReactionMsgId(null);
    setShowFullPicker(false);
    setIsInfoModalOpen(false);
  };

  const handlePressStart = (msg: ChatMessage, targetEl: HTMLElement | null) => {
    isPressDraggingRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

    longPressTimerRef.current = setTimeout(() => {
      if (!isPressDraggingRef.current) {
        if (targetEl) {
          const rect = targetEl.getBoundingClientRect();
          const shouldOpenBelow = rect.top < 220;
          setOpenBelowMsgIds((prev) => ({ ...prev, [msg.id]: shouldOpenBelow }));
        }
        setIsInfoModalOpen(false);
        setShowFullPicker(false);
        setSelectedMessage(msg);
        setActiveReactionMsgId(msg.id);
      }
    }, 400);
  };

  const handlePressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  };

  const handlePressMove = () => {
    isPressDraggingRef.current = true;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  };

  // ── Actions ──

  const handleJoinFromModal = async () => {
    if (roomId && nickname) {
      setPageState('connecting');
      setInitStatusText('Joining workspace session...');
      await syncEngine.initializeRoomSequence(roomId, nickname);
      setPageState('room');
    }
  };

  const handleCopyLink = () => {
    if (!roomId) return;
    const fullUrl = window.location.origin + `/room/${roomId}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyRoomCode = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleBack = () => {
    navigate('/');
  };

  const handleLeave = async () => {
    if (roomId) {
      await syncEngine.leaveRoom(roomId);
    } else {
      clearRoomState();
      navigate('/');
    }
  };

  const handleEndRoom = async () => {
    if (roomId) {
      await syncEngine.endRoom(roomId);
    }
    clearRoomState();
    navigate('/');
  };

  const handleToggleRoomLock = async () => {
    if (!roomId || !currentRoom) return;
    try {
      const nextState = !currentRoom.isLocked;
      await syncEngine.toggleRoomLock(roomId, nextState);
      setIsConfirmLockOpen(false);
      setToastMessage(nextState ? 'Group locked by Host' : 'Group unlocked by Host');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      setToastMessage(err.message || 'Failed to toggle lock state');
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const handleConfirmKick = async () => {
    if (!roomId || !memberToKick) return;
    try {
      await syncEngine.kickMember(roomId, memberToKick.memberId, memberToKick.nickname);
      setIsConfirmKickOpen(false);
      setToastMessage(`Removed "${memberToKick.nickname}" from group`);
      setMemberToKick(null);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      setToastMessage(err.message || 'Failed to kick member');
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && !selectedFile) || !roomId || !isChatReady) return;

    if (typingTimeoutRef.current && nickname) {
      clearTimeout(typingTimeoutRef.current);
      syncEngine.sendTyping(roomId, nickname, false);
    }

    const messageText = message.trim();
    const replyMeta: ReplyMetadata | undefined = replyingTo
      ? {
          messageId: replyingTo.id,
          senderId: replyingTo.senderId,
          senderNickname: replyingTo.senderNickname,
          messagePreview: replyingTo.content.slice(0, 100),
        }
      : undefined;

    setMessage('');
    setReplyingTo(null);

    if (selectedFile) {
      try {
        setIsUploadingFile(true);
        const clientMsgId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const senderId = messageManager.getMemberId();

        await apiService.uploadFile(roomId, selectedFile, {
          clientMsgId,
          senderId,
          senderNickname: nickname || 'Anonymous',
          content: messageText,
          replyTo: replyMeta,
        });

        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err: any) {
        setUploadError(err.message || 'File upload failed.');
      } finally {
        setIsUploadingFile(false);
      }
    } else {
      await syncEngine.sendMessage(roomId, messageText, replyMeta);
    }
  };

  const renderAvatar = (userNick: string, avatarSize = 28) => {
    const isMe = userNick === nickname;
    const participantObj = currentRoom?.participants.find((p) => p.nickname === userNick);
    const avatarUrl = isMe ? userAvatar : participantObj?.avatar || roomAvatars[userNick];

    if (avatarUrl) {
      return (
        <img
          src={avatarUrl}
          alt={userNick}
          style={{ width: `${avatarSize}px`, height: `${avatarSize}px` }}
          className="rounded-full object-cover border border-outline-variant/40 shrink-0 shadow-sm"
        />
      );
    }
    return <DefaultAvatar size={avatarSize} />;
  };

  const renderMessageReactions = (msgId: string) => {
    const msgReactions: ReactionEvent[] = reactions[msgId] || [];
    if (msgReactions.length === 0) return null;

    const groupedMap: Record<string, ReactionEvent[]> = {};
    for (const r of msgReactions) {
      if (!groupedMap[r.emoji]) groupedMap[r.emoji] = [];
      groupedMap[r.emoji].push(r);
    }

    return (
      <div className="flex flex-wrap gap-1.5 mt-1 relative z-10">
        {Object.entries(groupedMap).map(([emoji, list]) => {
          const hasReacted = list.some((r) => r.memberId === myMemberId);

          return (
            <motion.button
              key={emoji}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                e.stopPropagation();
                handleSelectEmoji(msgId, emoji);
              }}
              className={`px-2 py-0.5 rounded-full text-xs font-mono flex items-center space-x-1 border transition-all cursor-pointer ${
                hasReacted
                  ? 'bg-primary/20 border-primary text-primary font-bold shadow-sm'
                  : 'bg-surface-container-high/80 border-outline-variant/40 text-on-surface-variant hover:border-outline-variant'
              }`}
              title={list.map((r) => r.senderNickname || 'Member').join(', ')}
            >
              <span>{emoji}</span>
              <span className="text-[10px]">{list.length}</span>
            </motion.button>
          );
        })}
      </div>
    );
  };

  // ── Render: mandatory nickname check ──
  if (pageState === 'check_nickname' || !nickname) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background cyber-grid px-4">
        <NicknameModal
          isOpen={true}
          isMandatory={true}
          noticeMessage="Choose a nickname to join this workspace."
          onSave={(name) => setNickname(name)}
        />
      </div>
    );
  }

  // ── Render: checking status / connecting ──
  if (pageState === 'checking_status' || pageState === 'connecting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background cyber-grid px-4">
        <div className="flex flex-col items-center space-y-4 text-on-surface-variant max-w-md text-center p-6 bg-surface-container/80 border border-outline-variant/50 rounded-xl shadow-2xl backdrop-blur-md">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-on-surface">Connecting to Tempora V2 Channel</h3>
            <p className="body-md text-xs text-secondary leading-relaxed">{initStatusText}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: not found / expired ──
  if (pageState === 'not_found') {
    return <RoomNotFoundView roomId={roomId} reason="not_found" />;
  }

  if (pageState === 'expired') {
    return <RoomNotFoundView roomId={roomId} reason="expired" />;
  }

  // ── Render: room ended ──
  if (pageState === 'room_ended') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background cyber-grid px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-sm w-full mx-4 p-6 sm:p-8 bg-surface-container border border-outline-variant/60 rounded-lg text-center space-y-4 shadow-2xl"
        >
          <div className="w-12 h-12 rounded-full bg-error/10 border border-error/20 flex items-center justify-center text-error mx-auto">
            <Trash2 className="w-6 h-6" />
          </div>
          <h2 className="headline-md text-on-surface text-lg sm:text-xl">Room Ended</h2>
          <p className="body-md text-xs sm:text-sm text-on-surface-variant leading-relaxed">
            The workspace has been permanently ended. All temporary data has been removed.
          </p>
          <p className="text-[11px] text-on-surface-variant/60">Redirecting to home…</p>
        </motion.div>
      </div>
    );
  }

  // ── Render: preview modal ──
  if (pageState === 'preview') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background cyber-grid px-4">
        <JoinRoomPreviewModal
          isOpen={true}
          preview={preview}
          onJoin={handleJoinFromModal}
          onCancel={() => navigate('/')}
        />
      </div>
    );
  }

  const roomData = currentRoom;
  const roomName = roomData?.name || preview?.name || 'Workspace Room';
  const isTwoPeopleRoom = (roomData?.type || preview?.type) === 'two-people';
  const isGroupRoom = !isTwoPeopleRoom;
  const roomTypeLabel = isTwoPeopleRoom ? 'Two People' : 'Group';
  const participants = roomData?.participants || [];

  const onlineParticipants = participants.filter((p) => p.online);
  const offlineParticipants = participants.filter((p) => !p.online);

  const me = participants.find((p) => p.nickname === nickname);
  const isHost = me?.role === 'host' || false;
  const canEndRoom = isTwoPeopleRoom || isHost;
  const isLocked = Boolean(currentRoom?.isLocked || preview?.isLocked);

  return (
    <div className="min-h-screen flex flex-col relative cyber-grid h-screen overflow-hidden bg-background text-on-background">

      <AnimatePresence>
        {selectedMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleDismissSelection}
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-30 pointer-events-auto"
          />
        )}
      </AnimatePresence>

      <header className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-outline-variant/30 relative z-20 glass-layer bg-surface-container/60">
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <button
            onClick={handleBack}
            className="p-1.5 sm:p-2 rounded bg-surface-container border border-outline-variant/60 hover:border-primary hover:text-primary transition-all cursor-pointer text-on-surface-variant shrink-0"
            aria-label="Back to home"
            title="Back to dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="p-1.5 sm:p-2 rounded bg-surface-container-high border border-outline-variant/40 text-primary shrink-0 hidden xs:block">
            {isLocked ? <Lock className="w-4 h-4 text-amber-400" /> : <Lock className="w-4 h-4 text-primary" />}
          </div>

          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <h1 className="text-xs sm:text-base font-bold tracking-tight text-on-surface truncate max-w-[130px] sm:max-w-xs md:max-w-md">
                {decodeHtmlEntities(roomName)}
              </h1>
              {isLocked && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold shrink-0">
                  LOCKED
                </span>
              )}
            </div>
            <div className="flex items-center space-x-1.5 text-[10px] sm:text-xs text-on-surface-variant font-mono mt-0.5">
              <span className="font-semibold">{roomId}</span>
              <button
                onClick={handleCopyRoomCode}
                className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition cursor-pointer flex items-center space-x-1"
                title="Copy room code"
              >
                {codeCopied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                {codeCopied && <span className="text-[10px] text-primary font-mono font-medium">Copied!</span>}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyLink}
            className="text-xs py-1 px-2 border border-outline-variant/40 hover:border-primary"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline ml-1.5">{copied ? 'Copied Link' : 'Share Link'}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 sm:p-2 text-on-surface-variant hover:text-on-surface"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </Button>

          {canEndRoom ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsConfirmEndOpen(true)}
              className="text-xs py-1 px-2 text-error border-error/30 hover:bg-error/10 hover:border-error"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline ml-1">End Workspace</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsConfirmLeaveOpen(true)}
              className="text-xs py-1 px-2 text-on-surface-variant hover:text-error"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline ml-1">Leave</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
            className="p-1.5 sm:p-2 text-on-surface-variant hover:text-primary lg:hidden shrink-0"
            aria-label="Toggle Room Information Drawer"
          >
            {isMobileDrawerOpen ? <X className="w-5 h-5 text-primary" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </header>

      <AnimatePresence>
        {selectedMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-surface-container-high/95 border border-outline-variant/60 shadow-2xl backdrop-blur-md flex items-center space-x-3 text-xs font-medium text-on-surface tempora-action-bar"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setReplyingTo({
                  id: selectedMessage.id,
                  senderNickname: selectedMessage.senderNickname,
                  senderId: selectedMessage.senderId,
                  content: selectedMessage.file
                    ? `[Attachment: ${selectedMessage.file.filename}] ${selectedMessage.content || ''}`
                    : selectedMessage.content,
                });
                handleDismissSelection();
              }}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full hover:bg-surface-container text-primary transition cursor-pointer"
            >
              <Reply className="w-4 h-4" />
              <span>Reply</span>
            </button>

            <div className="w-px h-4 bg-outline-variant/40" />

            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsInfoModalOpen(true);
              }}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full hover:bg-surface-container text-secondary transition cursor-pointer"
            >
              <Info className="w-4 h-4" />
              <span>Info</span>
            </button>

            <div className="w-px h-4 bg-outline-variant/40" />

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDismissSelection();
              }}
              className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition cursor-pointer"
              title="Dismiss selection"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!isChatReady && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-center text-xs text-amber-400 font-mono flex items-center justify-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>Reconnecting to server... Chat session active</span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        <main className="flex-1 flex flex-col min-w-0 bg-background/50 overflow-hidden">
          <div className="flex-1 overflow-y-auto overflow-x-hidden max-w-full p-3 sm:p-5 space-y-3.5 sm:space-y-4 custom-scrollbar">
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 my-auto">
                <div className="p-3.5 rounded-full bg-primary/10 border border-primary/20 text-primary">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-on-surface">Tempora V2 Channel Active</h3>
                <p className="text-xs text-on-surface-variant max-w-sm leading-relaxed">
                  Reliable temporary chat session with sequence-based offline synchronization.
                </p>
              </div>
            ) : (
              chatMessages.map((msg) => {
                const isMe = msg.senderNickname === nickname;
                const isHighlighted = highlightedMsgId === msg.id;
                const isSelected = selectedMessage?.id === msg.id;
                const isReactionActive = activeReactionMsgId === msg.id || isSelected;
                const openBelow = openBelowMsgIds[msg.id] || false;

                return (
                  <div key={msg.id} className={`w-full touch-pan-y relative ${isSelected ? 'z-40' : 'z-1'}`}>
                    <motion.div
                      id={`msg-${msg.id}`}
                      initial={{ opacity: 0, y: 6, x: 0 }}
                      animate={{ opacity: 1, y: 0, x: 0 }}
                      drag="x"
                      dragConstraints={{ left: 0, right: 52 }}
                      dragElastic={{ left: 0, right: 0.1 }}
                      dragDirectionLock={true}
                      dragPropagation={false}
                      dragSnapToOrigin={true}
                      onPointerDown={(e) => handlePressStart(msg, e.currentTarget)}
                      onPointerUp={handlePressEnd}
                      onPointerMove={handlePressMove}
                      onPointerCancel={handlePressEnd}
                      onTouchStart={(e) => handlePressStart(msg, e.currentTarget)}
                      onTouchEnd={handlePressEnd}
                      onTouchMove={handlePressMove}
                      onTouchCancel={handlePressEnd}
                      onDragEnd={(_event, info) => {
                        handlePressEnd();
                        if (info.offset.x >= 38) {
                          setReplyingTo({
                            id: msg.id,
                            senderNickname: msg.senderNickname,
                            senderId: msg.senderId,
                            content: msg.file ? `[Attachment: ${msg.file.filename}] ${msg.content || ''}` : msg.content,
                          });
                        }
                      }}
                      transition={{ type: 'spring', stiffness: 700, damping: 35, mass: 0.5 }}
                      className={`flex items-start space-x-2 sm:space-x-2.5 transition-all duration-200 p-1 rounded-lg ${
                        isSelected
                          ? 'scale-[1.02] shadow-2xl ring-2 ring-primary bg-primary/10'
                          : isHighlighted
                          ? 'ring-2 ring-primary bg-primary/10 shadow-lg scale-[1.01]'
                          : ''
                      } ${isMe ? 'flex-row-reverse space-x-reverse' : ''}`}
                    >
                      {renderAvatar(msg.senderNickname, 30)}

                      <div className={`max-w-[85%] sm:max-w-[75%] space-y-1 relative ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className={`flex items-center space-x-2 text-[10px] text-on-surface-variant px-1 font-mono ${isMe ? 'flex-row-reverse space-x-reverse' : ''}`}>
                          <span className="font-semibold text-on-surface">{msg.senderNickname}</span>
                          <span>{formatTime(msg.createdAt)}</span>
                        </div>

                        {msg.replyTo && (
                          <button
                            type="button"
                            onClick={() => handleJumpToOriginalMessage(msg.replyTo!.messageId)}
                            className={`w-full text-left p-2 rounded-lg border text-xs mb-1.5 backdrop-blur-xs flex items-center space-x-2 group cursor-pointer transition-all hover:bg-surface-container-high/80 ${
                              isMe
                                ? 'bg-primary-container/30 border-primary/30 text-on-surface'
                                : 'bg-surface-container-high/60 border-outline-variant/40 text-on-surface-variant'
                            }`}
                            title="Click to view original message"
                          >
                            <div className="w-1 self-stretch bg-primary rounded-full shrink-0 group-hover:bg-secondary transition-colors" />

                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex items-center space-x-1 text-primary font-semibold text-[11px]">
                                <Reply className="w-3 h-3 text-primary shrink-0" />
                                <span>{msg.replyTo.senderNickname}</span>
                              </div>
                              <p className="truncate text-on-surface-variant/90 text-[11px] font-mono leading-tight">
                                "{msg.replyTo.messagePreview}"
                              </p>
                            </div>
                          </button>
                        )}

                        <div
                          className={`p-3 rounded-xl text-xs sm:text-sm leading-relaxed shadow-sm relative group ${
                            isMe
                              ? 'bg-primary text-on-primary rounded-tr-none'
                              : 'bg-surface-container border border-outline-variant/50 text-on-surface rounded-tl-none'
                          }`}
                        >
                          {msg.file && <FileAttachmentCard file={msg.file} roomId={roomId} isMe={isMe} />}
                          {msg.content && !msg.content.startsWith('{"ciphertext":') && (
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          )}

                          <div className={`absolute top-2 ${isMe ? '-left-14' : '-right-14'} opacity-0 group-hover:opacity-100 transition flex items-center space-x-1 bg-surface-container-high/90 p-0.5 rounded-lg border border-outline-variant/40 backdrop-blur-xs shadow-md z-20`}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReplyingTo({
                                  id: msg.id,
                                  senderNickname: msg.senderNickname,
                                  senderId: msg.senderId,
                                  content: msg.file ? `[Attachment: ${msg.file.filename}] ${msg.content || ''}` : msg.content,
                                });
                              }}
                              className="p-1 rounded hover:bg-surface-container text-on-surface-variant hover:text-primary transition cursor-pointer"
                              title="Reply"
                            >
                              <Reply className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerReactionForMessage(msg.id, e.currentTarget);
                              }}
                              className="p-1 rounded hover:bg-surface-container text-on-surface-variant hover:text-amber-400 transition cursor-pointer"
                              title="React with emoji"
                            >
                              <Smile className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {renderMessageReactions(msg.id)}

                        <AnimatePresence>
                          {isReactionActive && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.85, y: openBelow ? -5 : 5 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.85, y: openBelow ? -5 : 5 }}
                              transition={{ duration: 0.15, ease: 'easeOut' }}
                              className={`absolute tempora-interactive-popup ${
                                openBelow ? 'top-full mt-2' : '-top-12'
                              } ${isMe ? 'right-0' : 'left-0'} z-50 p-1.5 rounded-full bg-surface-container-high/95 border border-outline-variant/50 shadow-2xl backdrop-blur-md flex items-center space-x-1`}
                            >
                              {QUICK_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectEmoji(msg.id, emoji);
                                  }}
                                  className="w-7 h-7 rounded-full hover:bg-surface-container flex items-center justify-center text-sm transition hover:scale-125 cursor-pointer"
                                >
                                  {emoji}
                                </button>
                              ))}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowFullPicker(!showFullPicker);
                                }}
                                className="w-7 h-7 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-primary transition cursor-pointer border-l border-outline-variant/30 ml-0.5"
                                title="More emojis"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <AnimatePresence>
                          {isReactionActive && showFullPicker && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9, y: openBelow ? -5 : 5 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.9, y: openBelow ? -5 : 5 }}
                              className={`absolute tempora-interactive-popup ${
                                openBelow ? 'top-full mt-14' : '-top-56'
                              } ${
                                isMe ? 'right-0' : 'left-0'
                              } z-50 p-3 rounded-2xl bg-surface-container-high/95 border border-outline-variant/60 shadow-2xl backdrop-blur-md w-64 max-w-[85vw] max-h-52 overflow-y-auto custom-scrollbar`}
                            >
                              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                {EXTENDED_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectEmoji(msg.id, emoji);
                                    }}
                                    className="w-9 h-9 rounded-xl hover:bg-surface-container flex items-center justify-center text-lg transition hover:scale-125 cursor-pointer bg-surface/40 border border-outline-variant/20 shadow-xs"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  </div>
                );
              })
            )}

            {activeTypingNames.length > 0 && (
              <div className="flex items-center space-x-2 text-xs text-secondary italic font-mono px-2 py-1">
                <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce" />
                  <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce [animation-delay:0.4s]" />
                </div>
                <span>{activeTypingNames.join(', ')} {activeTypingNames.length === 1 ? 'is' : 'are'} typing...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <AnimatePresence>
            {selectedFile && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 py-2 bg-surface-container-high border-t border-outline-variant/40 flex items-center justify-between text-xs"
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <Paperclip className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <span className="font-semibold text-primary">Attachment Ready</span>
                    <p className="text-on-surface-variant truncate text-[11px]">
                      {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="p-1 text-on-surface-variant hover:text-on-surface rounded cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {replyingTo && (
              <motion.div
                initial={{ opacity: 0, y: 10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: 0, height: 'auto' }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="px-4 py-2.5 bg-surface-container-high/90 border-t border-outline-variant/40 flex items-center justify-between text-xs backdrop-blur-md"
              >
                <button
                  type="button"
                  onClick={() => handleJumpToOriginalMessage(replyingTo.id)}
                  className="flex items-center space-x-2.5 min-w-0 flex-1 text-left cursor-pointer group"
                  title="Click to jump to original message"
                >
                  <div className="w-1 h-8 bg-primary rounded-full shrink-0 group-hover:bg-secondary transition-colors" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-1.5 text-primary font-semibold text-xs">
                      <Reply className="w-3.5 h-3.5 shrink-0" />
                      <span>{replyingTo.senderNickname}</span>
                    </div>
                    <p className="text-on-surface-variant truncate text-[11px] font-mono mt-0.5">
                      "{replyingTo.content}"
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => setReplyingTo(null)}
                  className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-full transition shrink-0 cursor-pointer ml-2"
                  aria-label="Cancel reply"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {toastMessage && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-surface-container-high border border-outline-variant/60 text-xs font-mono text-amber-400 shadow-2xl flex items-center space-x-2"
              >
                <Info className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{toastMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {uploadError && (
            <div className="px-4 py-1.5 bg-error/10 border-t border-error/20 text-xs text-error font-mono flex items-center justify-between">
              <span>{uploadError}</span>
              <button onClick={() => setUploadError(null)} className="p-0.5 hover:text-on-surface">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <form onSubmit={handleSend} className="p-2.5 sm:p-4 border-t border-outline-variant/30 bg-surface-container/40">
            <div className="flex items-center space-x-2">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 sm:p-2.5 rounded-lg bg-surface-container border border-outline-variant/60 hover:border-primary hover:text-primary text-on-surface-variant transition shrink-0 cursor-pointer"
                title="Attach file (Max 15 MB)"
              >
                <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <input
                type="text"
                value={message}
                onChange={handleInputChange}
                placeholder="Type message..."
                className="flex-1 bg-surface-container border border-outline-variant/60 rounded-lg px-3.5 py-2.5 text-xs sm:text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition"
              />
              <Button
                type="submit"
                disabled={(!message.trim() && !selectedFile) || isUploadingFile}
                className="px-4 py-2.5 text-xs sm:text-sm shrink-0"
              >
                <Send className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">{isUploadingFile ? 'Uploading...' : 'Send'}</span>
              </Button>
            </div>
          </form>
        </main>

        <aside className="w-60 sm:w-68 border-l border-outline-variant/30 flex-col hidden lg:flex">
          <RoomInfoContent
            remainingTimeText={remainingTimeText}
            expiresAt={expiresAt}
            roomTypeLabel={roomTypeLabel}
            isGroupRoom={isGroupRoom}
            isHost={isHost}
            isLocked={isLocked}
            participants={participants}
            onlineParticipants={onlineParticipants}
            offlineParticipants={offlineParticipants}
            renderAvatar={renderAvatar}
            onToggleLockClick={() => setIsConfirmLockOpen(true)}
            onKickMemberClick={(m) => {
              setMemberToKick(m);
              setIsConfirmKickOpen(true);
            }}
          />
        </aside>

        <AnimatePresence>
          {isMobileDrawerOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileDrawerOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden"
              />

              <motion.aside
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 26, stiffness: 260 }}
                className="fixed top-0 right-0 bottom-0 w-[85%] max-w-sm bg-background border-l border-outline-variant/40 z-50 lg:hidden shadow-2xl flex flex-col"
              >
                <RoomInfoContent
                  remainingTimeText={remainingTimeText}
                  expiresAt={expiresAt}
                  roomTypeLabel={roomTypeLabel}
                  isGroupRoom={isGroupRoom}
                  isHost={isHost}
                  isLocked={isLocked}
                  participants={participants}
                  onlineParticipants={onlineParticipants}
                  offlineParticipants={offlineParticipants}
                  renderAvatar={renderAvatar}
                  onToggleLockClick={() => setIsConfirmLockOpen(true)}
                  onKickMemberClick={(m) => {
                    setMemberToKick(m);
                    setIsConfirmKickOpen(true);
                  }}
                  onClose={() => setIsMobileDrawerOpen(false)}
                />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

      </div>

      <MessageInfoModal
        isOpen={isInfoModalOpen}
        onClose={handleDismissSelection}
        message={selectedMessage}
        reactions={selectedMessage ? reactions[selectedMessage.id] || [] : []}
        participants={participants}
        roomAvatars={roomAvatars}
        userAvatar={userAvatar}
        myNickname={nickname}
      />

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <ConfirmDialog
        isOpen={isConfirmLeaveOpen}
        onCancel={() => setIsConfirmLeaveOpen(false)}
        onConfirm={handleLeave}
        title="Leave Workspace"
        description="Are you sure you want to leave this workspace session?"
        confirmLabel="Leave Workspace"
        variant="primary"
      />

      <ConfirmDialog
        isOpen={isConfirmEndOpen}
        onCancel={() => setIsConfirmEndOpen(false)}
        onConfirm={handleEndRoom}
        title="End Workspace"
        description="Are you sure you want to end this workspace? All temporary messages will be permanently deleted for all participants."
        confirmLabel="End Workspace"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={isConfirmLockOpen}
        onCancel={() => setIsConfirmLockOpen(false)}
        onConfirm={handleToggleRoomLock}
        title={isLocked ? 'Unlock Group' : 'Lock Group'}
        description={
          isLocked
            ? 'Are you sure you want to unlock this group? New members will be able to join using the invite link.'
            : 'Are you sure you want to lock this group? New members will be blocked from joining.'
        }
        confirmLabel={isLocked ? 'Unlock Group' : 'Lock Group'}
        variant={isLocked ? 'primary' : 'danger'}
      />

      <ConfirmDialog
        isOpen={isConfirmKickOpen}
        onCancel={() => {
          setIsConfirmKickOpen(false);
          setMemberToKick(null);
        }}
        onConfirm={handleConfirmKick}
        title={`Remove "${memberToKick?.nickname || 'Member'}"`}
        description={`Are you sure you want to remove ${memberToKick?.nickname || 'this member'} from this group workspace?`}
        confirmLabel="Kick Member"
        variant="danger"
      />

    </div>
  );
};

export default RoomPage;
