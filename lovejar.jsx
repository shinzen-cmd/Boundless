import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, Send, Trash2, Sparkles, Lock } from "lucide-react-native";
import { formatDistanceToNow } from "date-fns";
import { Image } from "expo-image";

const PRIMARY = "#FF6B6B";

export default function LoveJarScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [me, setMe] = useState(null);
  const [note, setNote] = useState("");
  const [tab, setTab] = useState("received"); // 'received' | 'write'
  const inputRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    SecureStore.getItemAsync("couple_app_user").then((stored) => {
      if (stored) setUser(JSON.parse(stored));
    });
  }, []);

  // Load my full profile (for partner_id + partner_name)
  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/users/me?userId=${user.id}`)
      .then((r) => r.json())
      .then(setMe)
      .catch(console.error);
  }, [user?.id]);

  // Animate in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  // Fetch notes received (my jar)
  const {
    data: receivedNotes = [],
    isLoading: loadingNotes,
    refetch: refetchNotes,
  } = useQuery({
    queryKey: ["loveJar", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/love-jar?userId=${user.id}`);
      if (!res.ok) throw new Error("Failed to load jar");
      return res.json();
    },
    enabled: !!user?.id,
    refetchInterval: 8000,
  });

  // Send a note
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!me?.partner_id) throw new Error("Not paired");
      const res = await fetch("/api/love-jar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: user.id,
          receiverId: me.partner_id,
          content: note.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send");
      }
      return res.json();
    },
    onSuccess: () => {
      setNote("");
      setTab("received");
      queryClient.invalidateQueries({ queryKey: ["loveJar"] });
      Alert.alert(
        "Dropped! 💌",
        `Your note is now in ${me?.partner_name || "their"} jar.`,
      );
    },
    onError: (e) => {
      Alert.alert("Couldn't send", e.message);
    },
  });

  // Delete a note — now includes userId for ownership verification
  const deleteMutation = useMutation({
    mutationFn: async (noteId) => {
      const res = await fetch(
        `/api/love-jar?noteId=${noteId}&userId=${user.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loveJar"] });
    },
  });

  const handleDelete = (noteId) => {
    Alert.alert(
      "Remove note?",
      "This will permanently delete this note from your jar.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => deleteMutation.mutate(noteId),
        },
      ],
    );
  };

  const unreadCount = receivedNotes.filter((n) => !n.is_read).length;
  const charCount = note.length;
  const maxChars = 1000;

  if (!user) return null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#FFF" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + 16,
            paddingHorizontal: 20,
            paddingBottom: 0,
            backgroundColor: "#FFF",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <Sparkles size={20} color={PRIMARY} />
            <Text
              style={{
                fontSize: 22,
                fontWeight: "800",
                color: "#1A1A1A",
                marginLeft: 8,
              }}
            >
              Love Jar
            </Text>
            {unreadCount > 0 && (
              <View
                style={{
                  marginLeft: 8,
                  backgroundColor: PRIMARY,
                  borderRadius: 10,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}
              >
                <Text
                  style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}
                >
                  {unreadCount} new
                </Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 14, color: "#9CA3AF", marginBottom: 8 }}>
            Sweet notes, just for the two of you 🫙
          </Text>
          <Text
            style={{
              fontSize: 9,
              color: "#E5E7EB",
              fontStyle: "italic",
              marginBottom: 12,
            }}
          >
            Boundless · Made by Tayyab Khokhar💓
          </Text>

          {/* Tab Switcher */}
          <View
            style={{
              flexDirection: "row",
              backgroundColor: "#F3F4F6",
              borderRadius: 14,
              padding: 3,
              marginBottom: 16,
            }}
          >
            {["received", "write"].map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 11,
                  backgroundColor: tab === t ? "#FFF" : "transparent",
                  alignItems: "center",
                  shadowColor: tab === t ? "#000" : "transparent",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.08,
                  shadowRadius: 4,
                  elevation: tab === t ? 2 : 0,
                }}
              >
                <Text
                  style={{
                    fontWeight: "700",
                    fontSize: 14,
                    color: tab === t ? PRIMARY : "#9CA3AF",
                  }}
                >
                  {t === "received"
                    ? `My Jar (${receivedNotes.length})`
                    : "Write a Note"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── RECEIVED TAB ── */}
        {tab === "received" && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: insets.bottom + 24,
            }}
            showsVerticalScrollIndicator={false}
          >
            {loadingNotes ? (
              <View style={{ padding: 60, alignItems: "center" }}>
                <ActivityIndicator color={PRIMARY} />
              </View>
            ) : receivedNotes.length === 0 ? (
              <EmptyJar
                partnerName={me?.partner_name}
                onWrite={() => setTab("write")}
              />
            ) : (
              receivedNotes.map((n) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  onDelete={() => handleDelete(n.id)}
                />
              ))
            )}
          </ScrollView>
        )}

        {/* ── WRITE TAB ── */}
        {tab === "write" && (
          <View style={{ flex: 1, paddingHorizontal: 20 }}>
            {!me?.partner_id ? (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Lock size={40} color="#E5E7EB" />
                <Text
                  style={{
                    color: "#9CA3AF",
                    marginTop: 16,
                    textAlign: "center",
                    fontSize: 15,
                  }}
                >
                  Link with your partner first to send notes.
                </Text>
              </View>
            ) : (
              <>
                {/* Recipient chip */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "#FFF5F5",
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    marginBottom: 14,
                    borderWidth: 1,
                    borderColor: "#FED7D7",
                  }}
                >
                  {me?.partner_avatar_url ? (
                    <Image
                      source={{ uri: me.partner_avatar_url }}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        marginRight: 10,
                      }}
                      contentFit="cover"
                    />
                  ) : (
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: "#FED7D7",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 10,
                      }}
                    >
                      <Heart size={14} color={PRIMARY} fill={PRIMARY} />
                    </View>
                  )}
                  <Text style={{ fontSize: 14, color: "#4B5563" }}>
                    To:{" "}
                    <Text style={{ fontWeight: "700", color: "#1A1A1A" }}>
                      {me?.partner_name || "your love"}
                    </Text>
                  </Text>
                </View>

                {/* Text area */}
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "#FFF9F9",
                    borderRadius: 20,
                    borderWidth: 1.5,
                    borderColor: "#FED7D7",
                    padding: 16,
                    marginBottom: 14,
                  }}
                >
                  <TextInput
                    ref={inputRef}
                    multiline
                    placeholder={`Write something sweet for ${me?.partner_name || "them"}…`}
                    placeholderTextColor="#C9A9A9"
                    value={note}
                    onChangeText={(t) => setNote(t.slice(0, maxChars))}
                    style={{
                      flex: 1,
                      fontSize: 16,
                      color: "#1A1A1A",
                      lineHeight: 24,
                      textAlignVertical: "top",
                    }}
                    autoFocus={false}
                  />
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: insets.bottom + 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: charCount > maxChars * 0.9 ? PRIMARY : "#9CA3AF",
                    }}
                  >
                    {charCount}/{maxChars}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      if (!note.trim()) {
                        Alert.alert("Empty note", "Write something first!");
                        return;
                      }
                      sendMutation.mutate();
                    }}
                    disabled={sendMutation.isPending || !note.trim()}
                    style={{
                      backgroundColor: !note.trim() ? "#E5E7EB" : PRIMARY,
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 24,
                      paddingVertical: 14,
                      borderRadius: 16,
                      shadowColor: PRIMARY,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: !note.trim() ? 0 : 0.3,
                      shadowRadius: 8,
                      elevation: !note.trim() ? 0 : 4,
                    }}
                    activeOpacity={0.8}
                  >
                    {sendMutation.isPending ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <Send size={16} color="#FFF" />
                        <Text
                          style={{
                            color: "#FFF",
                            fontWeight: "700",
                            fontSize: 15,
                            marginLeft: 8,
                          }}
                        >
                          Drop it in
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

function NoteCard({ note, onDelete }) {
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 18,
      bounciness: 6,
    }).start();
  }, []);

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
        backgroundColor: "#FFF",
        borderRadius: 20,
        padding: 18,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: note.is_read ? "#F3F4F6" : "#FED7D7",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      {/* Unread dot */}
      {!note.is_read && (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: PRIMARY,
            position: "absolute",
            top: 16,
            right: 16,
          }}
        />
      )}

      {/* Sender row */}
      <View
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
      >
        {note.sender_avatar ? (
          <Image
            source={{ uri: note.sender_avatar }}
            style={{ width: 28, height: 28, borderRadius: 14, marginRight: 10 }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: "#FFF5F5",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 10,
            }}
          >
            <Heart size={13} color={PRIMARY} fill={PRIMARY} />
          </View>
        )}
        <Text style={{ fontSize: 13, fontWeight: "700", color: "#4B5563" }}>
          {note.sender_name}
        </Text>
        <Text style={{ fontSize: 12, color: "#9CA3AF", marginLeft: "auto" }}>
          {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
        </Text>
      </View>

      {/* Note content */}
      <Text
        style={{
          fontSize: 16,
          color: "#1A1A1A",
          lineHeight: 25,
          fontStyle: "italic",
        }}
      >
        "{note.content}"
      </Text>

      {/* Delete */}
      <TouchableOpacity
        onPress={onDelete}
        style={{ marginTop: 14, alignSelf: "flex-end", padding: 4 }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Trash2 size={16} color="#D1D5DB" />
      </TouchableOpacity>
    </Animated.View>
  );
}

function EmptyJar({ partnerName, onWrite }) {
  return (
    <View
      style={{ alignItems: "center", paddingTop: 60, paddingHorizontal: 24 }}
    >
      <Text style={{ fontSize: 52 }}>🫙</Text>
      <Text
        style={{
          fontSize: 18,
          fontWeight: "700",
          color: "#1A1A1A",
          marginTop: 16,
        }}
      >
        Your jar is empty
      </Text>
      <Text
        style={{
          fontSize: 15,
          color: "#9CA3AF",
          textAlign: "center",
          marginTop: 8,
          lineHeight: 22,
        }}
      >
        {partnerName
          ? `Waiting for ${partnerName} to drop a note in.`
          : "Once your partner sends you notes, they'll appear here."}
      </Text>
      <TouchableOpacity
        onPress={onWrite}
        style={{
          marginTop: 24,
          backgroundColor: PRIMARY,
          paddingHorizontal: 28,
          paddingVertical: 14,
          borderRadius: 16,
          shadowColor: PRIMARY,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 4,
        }}
        activeOpacity={0.8}
      >
        <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 15 }}>
          Write them a note first 💌
        </Text>
      </TouchableOpacity>
    </View>
  );
}
