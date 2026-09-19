import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  Animated,
  PanResponder,
  Modal,
  AppState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  format,
  isToday,
  isYesterday,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
} from "date-fns";
import {
  Send,
  Mic,
  Play,
  Pause,
  Smile,
  Heart,
  X,
  CornerDownLeft,
  Pencil,
} from "lucide-react-native";
import { Image } from "expo-image";
import {
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
  RecordingPresets,
  createAudioPlayer,
} from "expo-audio";
import useUpload from "@/utils/useUpload";
import KeyboardAvoidingAnimatedView from "@/components/KeyboardAvoidingAnimatedView";

const PRIMARY = "#FF6B6B";
const ONLINE_GREEN = "#22C55E";
const REACTION_EMOJIS = ["❤️", "😂", "😮", "🥰", "😢", "👍", "🔥", "💯"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatMsgTime(dateStr) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
  return format(d, "MMM d, h:mm a");
}

function formatDuration(secs) {
  if (!secs || isNaN(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Returns a human-readable presence string.
 * Online  → null (caller shows green dot + "Online")
 * Offline → "Last seen today at 3:45 PM" | "Last seen yesterday" | "Last seen 3 days ago"
 */
function formatLastSeen(lastSeenStr, isOnline) {
  if (isOnline) return null;
  if (!lastSeenStr) return "Last seen a while ago";
  const d = new Date(lastSeenStr);
  const now = new Date();
  const mins = differenceInMinutes(now, d);
  if (mins < 2) return "Just now";
  if (isToday(d)) return `Last seen today at ${format(d, "h:mm a")}`;
  if (isYesterday(d)) return "Last seen yesterday";
  const days = differenceInDays(now, d);
  if (days < 8) return `Last seen ${days} days ago`;
  return `Last seen ${format(d, "MMM d")}`;
}

// ─── Presence Dot ─────────────────────────────────────────────────────────────
function OnlineDot({ size = 10 }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: ONLINE_GREEN,
        borderWidth: 1.5,
        borderColor: "#FFF",
      }}
    />
  );
}

// ─── Voice Note Player ────────────────────────────────────────────────────────
function VoiceNotePlayer({ url, isMe }) {
  const playerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const intervalRef = useRef(null);

  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;
  const fg = isMe ? "#FFF" : PRIMARY;
  const trackBg = isMe ? "rgba(255,255,255,0.25)" : "rgba(255,107,107,0.15)";

  const stopPolling = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const startPolling = (player) => {
    stopPolling();
    intervalRef.current = setInterval(() => {
      try {
        const ct = player.currentTime ?? 0;
        const dur = player.duration ?? 0;
        setPosition(ct);
        if (dur > 0) setDuration(dur);
        if (!player.playing && ct > 0 && ct >= dur - 0.1 && dur > 0) {
          setIsPlaying(false);
          setPosition(0);
          stopPolling();
        }
      } catch (_) {}
    }, 100);
  };

  const toggle = async () => {
    if (isLoading) return;
    if (!playerRef.current) {
      setIsLoading(true);
      try {
        const p = createAudioPlayer({ uri: url });
        playerRef.current = p;
        p.play();
        setIsPlaying(true);
        startPolling(p);
      } catch (e) {
        console.error("Playback error:", e);
        Alert.alert("Playback error", "Could not play voice note.");
      } finally {
        setIsLoading(false);
      }
    } else if (isPlaying) {
      playerRef.current.pause();
      setIsPlaying(false);
      stopPolling();
    } else {
      playerRef.current.seekTo(0);
      playerRef.current.play();
      setIsPlaying(true);
      startPolling(playerRef.current);
    }
  };

  useEffect(() => {
    return () => {
      stopPolling();
      playerRef.current?.remove?.();
    };
  }, []);

  return (
    <View style={{ minWidth: 190 }}>
      {/* Play button + waveform */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <TouchableOpacity
          onPress={toggle}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: isMe
              ? "rgba(255,255,255,0.22)"
              : "rgba(255,107,107,0.14)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={fg} />
          ) : isPlaying ? (
            <Pause size={17} color={fg} />
          ) : (
            <Play size={17} color={fg} />
          )}
        </TouchableOpacity>

        {/* Waveform bars — taller when playing */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          {[10, 18, 26, 16, 22, 12, 24, 14, 20, 10].map((h, i) => {
            const filled = progress > 0 && i / 10 < progress;
            return (
              <View
                key={i}
                style={{
                  width: 3,
                  height: isPlaying ? h + 6 : h,
                  borderRadius: 2,
                  backgroundColor: filled
                    ? fg
                    : isMe
                      ? "rgba(255,255,255,0.38)"
                      : "rgba(255,107,107,0.32)",
                }}
              />
            );
          })}
        </View>
      </View>

      {/* Progress bar — thick, high-contrast */}
      <View
        style={{
          marginTop: 9,
          height: 5,
          borderRadius: 3,
          backgroundColor: trackBg,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: 5,
            borderRadius: 3,
            backgroundColor: fg,
            width: `${Math.round(progress * 100)}%`,
          }}
        />
      </View>

      {/* Time — bold, fully opaque, high contrast */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 6,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: "900",
            color: fg,
            letterSpacing: 0.3,
          }}
        >
          {formatDuration(position)}
        </Text>
        <Text
          style={{ fontSize: 12, fontWeight: "700", color: fg, opacity: 0.7 }}
        >
          {formatDuration(duration)}
        </Text>
      </View>
    </View>
  );
}

// ─── Reply Context ─────────────────────────────────────────────────────────────
function ReplyContext({ replyContent, replyType, replySender, isMe }) {
  return (
    <View
      style={{
        backgroundColor: isMe
          ? "rgba(255,255,255,0.2)"
          : "rgba(255,107,107,0.1)",
        borderLeftWidth: 3,
        borderLeftColor: isMe ? "rgba(255,255,255,0.6)" : PRIMARY,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        marginBottom: 8,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: isMe ? "#FFF" : PRIMARY,
          marginBottom: 2,
        }}
      >
        {replySender}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: isMe ? "rgba(255,255,255,0.88)" : "#4B5563",
        }}
        numberOfLines={2}
      >
        {replyType === "voice" ? "🎤 Voice note" : replyContent}
      </Text>
    </View>
  );
}

// ─── Reaction Pills ────────────────────────────────────────────────────────────
function ReactionRow({ reactions, myId, messageId, onToggle }) {
  if (!reactions || Object.keys(reactions).length === 0) return null;
  return (
    <View
      style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 }}
    >
      {Object.entries(reactions).map(([emoji, users]) => {
        if (!users || users.length === 0) return null;
        const mine = users.includes(myId);
        return (
          <TouchableOpacity
            key={emoji}
            onPress={() => onToggle(messageId, emoji)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: mine ? "#FFF0F0" : "#F3F4F6",
              borderRadius: 12,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderWidth: 1,
              borderColor: mine ? "#FED7D7" : "#E5E7EB",
              gap: 3,
            }}
          >
            <Text style={{ fontSize: 14 }}>{emoji}</Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "800",
                color: mine ? PRIMARY : "#6B7280",
              }}
            >
              {users.length}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Swipeable Message Bubble ──────────────────────────────────────────────────
function SwipeableBubble({
  msg,
  isMe,
  myId,
  onReply,
  onEdit,
  onLongPress,
  onReactionToggle,
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [swipeIndicator, setSwipeIndicator] = useState(null);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dx > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      onPanResponderMove: (_, g) => {
        if (g.dx <= 0) return;
        const clamped = Math.min(g.dx, 150);
        translateX.setValue(clamped);
        if (clamped > 120 && isMe) setSwipeIndicator("edit");
        else if (clamped > 50) setSwipeIndicator("reply");
        else setSwipeIndicator(null);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > 120 && isMe) onEdit(msg);
        else if (g.dx > 50) onReply(msg);
        setSwipeIndicator(null);
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }).start();
      },
      onPanResponderTerminate: () => {
        setSwipeIndicator(null);
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  const hasReply = !!msg.reply_to_id && !!msg.reply_to_content;

  return (
    <View
      style={{
        alignSelf: isMe ? "flex-end" : "flex-start",
        maxWidth: "82%",
        marginBottom: 6,
      }}
    >
      {!isMe && (
        <Text
          style={{
            fontSize: 11,
            color: "#9CA3AF",
            marginBottom: 3,
            marginLeft: 2,
          }}
        >
          {msg.sender_name}
        </Text>
      )}

      <View style={{ position: "relative" }}>
        {/* Swipe action indicator */}
        {swipeIndicator && (
          <View
            style={{
              position: "absolute",
              [isMe ? "right" : "left"]: "102%",
              top: 0,
              bottom: 0,
              justifyContent: "center",
              paddingHorizontal: 8,
            }}
          >
            {swipeIndicator === "edit" ? (
              <Pencil size={18} color={PRIMARY} />
            ) : (
              <CornerDownLeft size={18} color={PRIMARY} />
            )}
          </View>
        )}

        <Animated.View
          style={{ transform: [{ translateX }] }}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity
            onLongPress={() => onLongPress(msg)}
            delayLongPress={320}
            activeOpacity={0.92}
          >
            <View
              style={{
                backgroundColor: isMe ? PRIMARY : "#F3F4F6",
                borderRadius: 20,
                borderBottomRightRadius: isMe ? 4 : 20,
                borderBottomLeftRadius: isMe ? 20 : 4,
                paddingHorizontal: 15,
                paddingVertical: 11,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 3,
                elevation: 1,
              }}
            >
              {hasReply && (
                <ReplyContext
                  replyContent={msg.reply_to_content}
                  replyType={msg.reply_to_type}
                  replySender={msg.reply_to_sender_name || "Them"}
                  isMe={isMe}
                />
              )}
              {msg.message_type === "voice" ? (
                <VoiceNotePlayer url={msg.voice_url} isMe={isMe} />
              ) : (
                <Text
                  style={{
                    color: isMe ? "#FFF" : "#1A1A1A",
                    fontSize: 15,
                    lineHeight: 22,
                  }}
                >
                  {msg.content}
                </Text>
              )}
              {msg.edited_at && (
                <Text
                  style={{
                    fontSize: 10,
                    color: isMe ? "rgba(255,255,255,0.5)" : "#9CA3AF",
                    marginTop: 3,
                    fontStyle: "italic",
                  }}
                >
                  edited
                </Text>
              )}
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <ReactionRow
        reactions={msg.reactions}
        myId={myId}
        messageId={msg.id}
        onToggle={onReactionToggle}
      />

      <Text
        style={{
          fontSize: 10,
          color: "#C4C4C4",
          marginTop: 3,
          marginHorizontal: 4,
          textAlign: isMe ? "right" : "left",
        }}
      >
        {formatMsgTime(msg.created_at)}
        {isMe ? (msg.is_read ? "  ✓✓" : "  ✓") : ""}
      </Text>
    </View>
  );
}

// ─── Main Chat Screen ──────────────────────────────────────────────────────────
export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const flatRef = useRef(null);

  const [user, setUser] = useState(null);
  const [me, setMe] = useState(null);
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [reactionTarget, setReactionTarget] = useState(null);

  const [upload, { loading: uploading }] = useUpload();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const recPulse = useRef(new Animated.Value(1)).current;
  const recLoop = useRef(null);
  const heartbeatRef = useRef(null);

  // ── Recording pulse ──────────────────────────────────────────────────────
  useEffect(() => {
    if (recorderState.isRecording) {
      recLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(recPulse, {
            toValue: 1.4,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(recPulse, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );
      recLoop.current.start();
    } else {
      recLoop.current?.stop();
      recPulse.setValue(1);
    }
  }, [recorderState.isRecording]);

  // ── Load stored user ─────────────────────────────────────────────────────
  useEffect(() => {
    SecureStore.getItemAsync("couple_app_user").then((s) => {
      if (s) setUser(JSON.parse(s));
    });
  }, []);

  // ── Fetch full profile (polls every 8s for presence updates) ─────────────
  const { data: meData } = useQuery({
    queryKey: ["me-chat", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/users/me?userId=${user.id}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user?.id,
    refetchInterval: 8000,
    onSuccess: (data) => setMe(data),
  });

  // Also set me from meData when it arrives
  useEffect(() => {
    if (meData) setMe(meData);
  }, [meData]);

  // ── Heartbeat — mark self as online every 25s while chat is open ─────────
  useEffect(() => {
    if (!user?.id) return;

    const sendHeartbeat = () => {
      fetch("/api/users/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      }).catch(() => {});
    };

    sendHeartbeat(); // immediately on mount
    heartbeatRef.current = setInterval(sendHeartbeat, 25000);

    // Mark offline when app goes to background
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        fetch("/api/users/heartbeat", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id }),
        }).catch(() => {});
        clearInterval(heartbeatRef.current);
      } else if (state === "active") {
        sendHeartbeat();
        heartbeatRef.current = setInterval(sendHeartbeat, 25000);
      }
    });

    return () => {
      clearInterval(heartbeatRef.current);
      sub.remove();
      // Mark offline on unmount
      fetch("/api/users/heartbeat", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      }).catch(() => {});
    };
  }, [user?.id]);

  // ── Fetch messages every 3s ──────────────────────────────────────────────
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["chat", user?.id, me?.partner_id],
    queryFn: async () => {
      const res = await fetch(
        `/api/chat?userId=${user.id}&partnerId=${me.partner_id}`,
      );
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!user?.id && !!me?.partner_id,
    refetchInterval: 3000,
  });

  // ── Auto-scroll to bottom ────────────────────────────────────────────────
  const lastMsgCount = useRef(0);
  useEffect(() => {
    if (messages.length > lastMsgCount.current) {
      lastMsgCount.current = messages.length;
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 350);
    }
  }, [messages.length]);

  // ── Send text ────────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || "Send failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat"] });
      setText("");
      setReplyingTo(null);
      setShowEmoji(false);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 120);
    },
    onError: (e) =>
      Alert.alert("Oops", e.message || "Message couldn't be sent."),
  });

  // ── Edit message ─────────────────────────────────────────────────────────
  const editMutation = useMutation({
    mutationFn: async ({ messageId, content }) => {
      const res = await fetch("/api/chat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, senderId: user.id, content }),
      });
      if (!res.ok) throw new Error("Edit failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat"] });
      setEditingMsg(null);
      setText("");
    },
    onError: (e) => Alert.alert("Oops", e.message),
  });

  // ── Emoji reaction ───────────────────────────────────────────────────────
  const reactionMutation = useMutation({
    mutationFn: async ({ messageId, emoji }) => {
      const res = await fetch("/api/chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, userId: user.id, emoji }),
      });
      if (!res.ok) throw new Error("Reaction failed");
      return res.json();
    },
    onMutate: async ({ messageId, emoji }) => {
      await queryClient.cancelQueries({ queryKey: ["chat"] });
      const prev = queryClient.getQueryData(["chat", user?.id, me?.partner_id]);
      queryClient.setQueryData(["chat", user?.id, me?.partner_id], (old) =>
        (old || []).map((m) => {
          if (m.id !== messageId) return m;
          const reactions = { ...(m.reactions || {}) };
          const users = reactions[emoji] || [];
          if (users.includes(user.id)) {
            reactions[emoji] = users.filter((u) => u !== user.id);
            if (!reactions[emoji].length) delete reactions[emoji];
          } else reactions[emoji] = [...users, user.id];
          return { ...m, reactions };
        }),
      );
      return { prev };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev)
        queryClient.setQueryData(["chat", user?.id, me?.partner_id], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["chat"] }),
  });

  const handleSend = () => {
    if (editingMsg) {
      if (!text.trim()) return;
      editMutation.mutate({ messageId: editingMsg.id, content: text.trim() });
      return;
    }
    const trimmed = text.trim();
    if (!trimmed || !me?.partner_id) return;
    sendMutation.mutate({
      senderId: user.id,
      receiverId: me.partner_id,
      content: trimmed,
      messageType: "text",
      replyToId: replyingTo?.id || null,
    });
  };

  const handleReply = useCallback((msg) => {
    setReplyingTo(msg);
    setEditingMsg(null);
    setShowEmoji(false);
  }, []);
  const handleEdit = useCallback((msg) => {
    setEditingMsg(msg);
    setReplyingTo(null);
    setText(msg.content || "");
    setShowEmoji(false);
  }, []);
  const handleLongPress = useCallback((msg) => {
    setReactionTarget(msg);
  }, []);
  const handleReactionToggle = useCallback((messageId, emoji) => {
    reactionMutation.mutate({ messageId, emoji });
  }, []);

  // ── Voice recording ──────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert(
          "Permission needed",
          "Allow microphone access to send voice notes.",
        );
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      console.error("Recording start error:", e);
      Alert.alert("Error", "Could not start recording.");
    }
  };

  const stopAndSend = async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        Alert.alert("Error", "No recording found.");
        return;
      }
      const { url, error } = await upload({
        reactNativeAsset: {
          uri,
          mimeType: "audio/m4a",
          name: `voice_${Date.now()}.m4a`,
        },
      });
      if (error || !url) {
        Alert.alert("Upload failed", "Couldn't upload your voice note.");
        return;
      }
      sendMutation.mutate({
        senderId: user.id,
        receiverId: me.partner_id,
        messageType: "voice",
        voiceUrl: url,
        replyToId: replyingTo?.id || null,
      });
    } catch (e) {
      console.error("Stop recording error:", e);
    }
  };

  const cancelRecording = async () => {
    try {
      await recorder.stop();
    } catch {}
  };

  const isRecording = recorderState.isRecording;

  // ── Presence display ─────────────────────────────────────────────────────
  const partnerIsOnline = me?.partner_is_online ?? false;
  const presenceText = formatLastSeen(me?.partner_last_seen, partnerIsOnline);

  const renderItem = useCallback(
    ({ item }) => (
      <SwipeableBubble
        msg={item}
        isMe={item.sender_id === user?.id}
        myId={user?.id}
        onReply={handleReply}
        onEdit={handleEdit}
        onLongPress={handleLongPress}
        onReactionToggle={handleReactionToggle}
      />
    ),
    [user?.id, handleReply, handleEdit, handleLongPress, handleReactionToggle],
  );

  if (!user) return null;

  return (
    <KeyboardAvoidingAnimatedView
      style={{ flex: 1, backgroundColor: "#FFF" }}
      behavior="padding"
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View
        style={{
          paddingTop: insets.top + 10,
          paddingHorizontal: 18,
          paddingBottom: 12,
          backgroundColor: "#FFF",
          borderBottomWidth: 1,
          borderColor: "#F0F0F0",
        }}
      >
        {/* Boundless branding row */}
        <View style={{ alignItems: "center", marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Heart size={15} color={PRIMARY} fill={PRIMARY} />
            <Text
              style={{
                fontSize: 15,
                fontWeight: "900",
                color: PRIMARY,
                letterSpacing: 1.2,
              }}
            >
              BOUNDLESS
            </Text>
            <Heart size={15} color={PRIMARY} fill={PRIMARY} />
          </View>
        </View>

        {/* Partner row */}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {/* Avatar with online dot */}
          <View style={{ position: "relative", marginRight: 12 }}>
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: "#FFF5F5",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 2,
                borderColor: partnerIsOnline ? ONLINE_GREEN : "#FED7D7",
                overflow: "hidden",
              }}
            >
              {me?.partner_avatar_url ? (
                <Image
                  source={{ uri: me.partner_avatar_url }}
                  style={{ width: 46, height: 46 }}
                  contentFit="cover"
                />
              ) : (
                <Heart size={20} color={PRIMARY} fill={PRIMARY} />
              )}
            </View>
            {/* Online indicator dot on avatar */}
            {partnerIsOnline && (
              <View style={{ position: "absolute", bottom: 0, right: 0 }}>
                <OnlineDot size={13} />
              </View>
            )}
          </View>

          {/* Name + presence */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#1A1A1A" }}>
              {me?.partner_name || "My Love"}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                marginTop: 2,
              }}
            >
              {partnerIsOnline ? (
                <>
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: ONLINE_GREEN,
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      color: ONLINE_GREEN,
                      fontWeight: "700",
                    }}
                  >
                    Online
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 11, color: "#9CA3AF" }}>
                  {presenceText || me?.partner_home_city || "Boundless ❤️"}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* ── Messages ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator color={PRIMARY} />
        </View>
      ) : messages.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
          }}
        >
          <Text style={{ fontSize: 48 }}>💌</Text>
          <Text
            style={{
              fontSize: 17,
              fontWeight: "700",
              color: "#1A1A1A",
              marginTop: 16,
              textAlign: "center",
            }}
          >
            No messages yet
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: "#9CA3AF",
              marginTop: 8,
              textAlign: "center",
              lineHeight: 22,
            }}
          >
            Send {me?.partner_name || "your love"} the first message — they'll
            cherish it forever.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 8,
          }}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            flatRef.current?.scrollToEnd({ animated: false })
          }
          onLayout={() => flatRef.current?.scrollToEnd({ animated: false })}
          removeClippedSubviews={false}
        />
      )}

      {/* ── Emoji Picker ───────────────────────────────────────────────── */}
      {showEmoji && (
        <View
          style={{
            backgroundColor: "#FFF",
            borderTopWidth: 1,
            borderColor: "#F3F4F6",
            paddingHorizontal: 8,
            paddingVertical: 10,
            flexDirection: "row",
            flexWrap: "wrap",
          }}
        >
          {[
            "❤️",
            "💕",
            "😘",
            "😍",
            "🥰",
            "💋",
            "🤗",
            "😊",
            "😂",
            "😭",
            "🥺",
            "💀",
            "😤",
            "🙏",
            "✨",
            "🔥",
            "💯",
            "👏",
            "🫶",
            "🥹",
            "😅",
            "😏",
            "🤔",
            "👀",
            "💬",
            "🎉",
            "🌹",
            "🌸",
            "🍓",
            "☀️",
            "🌙",
            "⭐",
            "💫",
            "🫙",
            "🤝",
            "💪",
            "😴",
            "🤍",
            "💌",
            "🫠",
          ].map((e) => (
            <TouchableOpacity
              key={e}
              onPress={() => {
                setText((t) => t + e);
                setShowEmoji(false);
              }}
              style={{ padding: 7 }}
            >
              <Text style={{ fontSize: 24 }}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Reply / Edit Banner ─────────────────────────────────────────── */}
      {(replyingTo || editingMsg) && !isRecording && (
        <View
          style={{
            backgroundColor: "#FFF5F5",
            borderTopWidth: 1,
            borderColor: "#FED7D7",
            paddingHorizontal: 16,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 3,
              backgroundColor: PRIMARY,
              borderRadius: 2,
              alignSelf: "stretch",
              marginRight: 10,
            }}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: PRIMARY,
                marginBottom: 2,
              }}
            >
              {editingMsg
                ? "✏️ Editing message"
                : `↩️ Replying to ${replyingTo?.sender_name}`}
            </Text>
            <Text style={{ fontSize: 13, color: "#6B7280" }} numberOfLines={1}>
              {editingMsg
                ? editingMsg.content
                : replyingTo?.message_type === "voice"
                  ? "🎤 Voice note"
                  : replyingTo?.content}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setReplyingTo(null);
              setEditingMsg(null);
              setText("");
            }}
            style={{ padding: 6 }}
          >
            <X size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Recording Banner ────────────────────────────────────────────── */}
      {isRecording && (
        <View
          style={{
            backgroundColor: "#FFF5F5",
            paddingHorizontal: 20,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            borderTopWidth: 1,
            borderColor: "#FED7D7",
          }}
        >
          <Animated.View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: PRIMARY,
              marginRight: 12,
              transform: [{ scale: recPulse }],
            }}
          />
          <Text
            style={{ flex: 1, color: PRIMARY, fontWeight: "600", fontSize: 13 }}
          >
            Recording… tap ✓ to send
          </Text>
          <TouchableOpacity
            onPress={cancelRecording}
            style={{ padding: 8, marginRight: 6 }}
          >
            <X size={18} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={stopAndSend}
            disabled={uploading || sendMutation.isPending}
            style={{
              backgroundColor: PRIMARY,
              borderRadius: 18,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            {uploading || sendMutation.isPending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 13 }}>
                ✓ Send
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── Input Bar ───────────────────────────────────────────────────── */}
      {!isRecording && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            paddingHorizontal: 12,
            paddingVertical: 10,
            paddingBottom: Math.max(insets.bottom, 14),
            borderTopWidth: 1,
            borderColor: "#F3F4F6",
            backgroundColor: "#FFF",
          }}
        >
          <TouchableOpacity
            onPress={() => setShowEmoji((v) => !v)}
            style={{ paddingBottom: 12, paddingRight: 6 }}
          >
            <Smile size={24} color={showEmoji ? PRIMARY : "#9CA3AF"} />
          </TouchableOpacity>

          <View
            style={{
              flex: 1,
              backgroundColor: "#F3F4F6",
              borderRadius: 22,
              paddingHorizontal: 16,
              paddingVertical: 10,
              marginRight: 8,
              maxHeight: 120,
              borderWidth: editingMsg ? 1.5 : 0,
              borderColor: editingMsg ? PRIMARY : "transparent",
            }}
          >
            <TextInput
              placeholder={
                editingMsg
                  ? "Edit your message…"
                  : replyingTo
                    ? `Reply to ${replyingTo.sender_name}…`
                    : `Message ${me?.partner_name || "your love"}…`
              }
              placeholderTextColor="#9CA3AF"
              value={text}
              onChangeText={setText}
              multiline
              style={{ fontSize: 15, color: "#1A1A1A", maxHeight: 100 }}
              onFocus={() => setShowEmoji(false)}
            />
          </View>

          {text.trim() ? (
            <TouchableOpacity
              onPress={handleSend}
              disabled={sendMutation.isPending || editMutation.isPending}
              style={{
                backgroundColor: editingMsg ? "#22C55E" : PRIMARY,
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: PRIMARY,
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.3,
                shadowRadius: 6,
                elevation: 4,
              }}
            >
              {sendMutation.isPending || editMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : editingMsg ? (
                <Pencil size={18} color="#FFF" />
              ) : (
                <Send size={18} color="#FFF" />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={startRecording}
              disabled={!me?.partner_id}
              style={{
                backgroundColor: me?.partner_id ? "#FFF5F5" : "#F3F4F6",
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: me?.partner_id ? "#FED7D7" : "#E5E7EB",
              }}
            >
              <Mic size={20} color={me?.partner_id ? PRIMARY : "#D1D5DB"} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Reaction Picker Modal ────────────────────────────────────────── */}
      <Modal
        visible={!!reactionTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionTarget(null)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.38)",
            justifyContent: "center",
            alignItems: "center",
          }}
          activeOpacity={1}
          onPress={() => setReactionTarget(null)}
        >
          <View
            style={{
              backgroundColor: "#FFF",
              borderRadius: 26,
              paddingHorizontal: 22,
              paddingVertical: 18,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.2,
              shadowRadius: 24,
              elevation: 14,
              width: "88%",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: "#9CA3AF",
                textAlign: "center",
                marginBottom: 12,
                letterSpacing: 0.5,
              }}
            >
              React to message
            </Text>
            {/* Message preview */}
            {reactionTarget && (
              <View
                style={{
                  backgroundColor: "#F9FAFB",
                  borderRadius: 14,
                  padding: 12,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                }}
              >
                <Text
                  style={{ fontSize: 14, color: "#4B5563" }}
                  numberOfLines={2}
                >
                  {reactionTarget.message_type === "voice"
                    ? "🎤 Voice note"
                    : reactionTarget.content}
                </Text>
              </View>
            )}
            <View
              style={{ flexDirection: "row", justifyContent: "space-around" }}
            >
              {REACTION_EMOJIS.map((emoji) => {
                const already = reactionTarget?.reactions?.[emoji]?.includes(
                  user?.id,
                );
                return (
                  <TouchableOpacity
                    key={emoji}
                    onPress={() => {
                      if (reactionTarget)
                        handleReactionToggle(reactionTarget.id, emoji);
                      setReactionTarget(null);
                    }}
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 25,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: already ? "#FFF0F0" : "#F9FAFB",
                      borderWidth: already ? 2 : 0,
                      borderColor: already ? "#FED7D7" : "transparent",
                    }}
                  >
                    <Text style={{ fontSize: 27 }}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingAnimatedView>
  );
}
