import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Animated,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  formatDistanceToNow,
  format,
  differenceInDays,
  differenceInHours,
} from "date-fns";
import {
  Heart,
  Clock,
  MapPin,
  CalendarDays,
  MessageSquare,
  Send,
} from "lucide-react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import {
  registerForLocalNotifications,
  sendMissYouLocalNotification,
} from "@/utils/notifications";
import { getTodaysQuestion, getTodayDateKey } from "@/data/questions";

const PRIMARY_COLOR = "#FF6B6B";
const TODAY_QUESTION = getTodaysQuestion();
const TODAY_DATE = getTodayDateKey();

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { width: screenWidth } = useWindowDimensions();

  // Responsive sizing derived from screen width
  const imgHeight = useMemo(
    () => Math.min(screenWidth * 0.65, 300),
    [screenWidth],
  );
  const avatarSize = useMemo(
    () => Math.min(screenWidth * 0.14, 64),
    [screenWidth],
  );

  const [currentUser, setCurrentUser] = useState(null);
  const [pingPressed, setPingPressed] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const lastPingIdRef = useRef(null);
  const notificationsReady = useRef(false);

  // Load user from SecureStore
  useEffect(() => {
    const loadUser = async () => {
      const stored = await SecureStore.getItemAsync("couple_app_user");
      if (stored) {
        setCurrentUser(JSON.parse(stored));
      }
    };
    loadUser();
  }, []);

  // Request local notification permissions once
  useEffect(() => {
    registerForLocalNotifications().then((granted) => {
      notificationsReady.current = granted;
    });
  }, []);

  // Fetch my profile
  const { data: me } = useQuery({
    queryKey: ["me", currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/users/me?userId=${currentUser.id}`);
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
    enabled: !!currentUser?.id,
    refetchInterval: 10000,
  });

  // Fetch partner's status feed
  const { data: partnerStatuses = [], isLoading: loadingStatus } = useQuery({
    queryKey: ["partnerStatus", me?.partner_id],
    queryFn: async () => {
      const res = await fetch(`/api/status/partner?partnerId=${me.partner_id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!me?.partner_id,
    refetchInterval: 5000,
  });

  // Fetch recent pings (received by me)
  const { data: pings = [] } = useQuery({
    queryKey: ["pings", currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/interaction/ping?userId=${currentUser.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentUser?.id,
    refetchInterval: 4000,
  });

  // Detect new incoming ping → trigger local notification
  useEffect(() => {
    if (!pings || pings.length === 0) return;

    const latestPing = pings[0];

    SecureStore.getItemAsync("last_ping_id").then((storedId) => {
      if (!storedId) {
        // First time — just store current, don't notify (stale pings)
        lastPingIdRef.current = latestPing.id;
        SecureStore.setItemAsync("last_ping_id", latestPing.id);
        return;
      }
      if (
        latestPing.id !== storedId &&
        latestPing.id !== lastPingIdRef.current
      ) {
        // A genuinely new ping arrived!
        lastPingIdRef.current = latestPing.id;
        SecureStore.setItemAsync("last_ping_id", latestPing.id);
        if (notificationsReady.current) {
          sendMissYouLocalNotification(me?.partner_name || "Your love");
        }
      }
    });
  }, [pings, me?.partner_name]);

  // Send Miss You ping
  const sendPingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/interaction/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: currentUser.id,
          receiverId: me.partner_id,
        }),
      });
      if (!res.ok) throw new Error("Failed to send");
      return res.json();
    },
    onMutate: () => {
      setPingPressed(true);
      Animated.sequence([
        Animated.spring(heartScale, {
          toValue: 1.35,
          useNativeDriver: true,
          speed: 30,
        }),
        Animated.spring(heartScale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 20,
        }),
      ]).start();
    },
    onSuccess: () => {
      Alert.alert(
        "Sent! 💌",
        `${me?.partner_name || "Your love"} will know you're thinking of them.`,
      );
      setTimeout(() => setPingPressed(false), 1500);
    },
    onError: () => {
      setPingPressed(false);
      Alert.alert("Oops", "Couldn't send the ping. Try again!");
    },
  });

  // Partner's local time
  const getPartnerLocalTime = () => {
    if (!me?.partner_timezone) return "--:--";
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: me.partner_timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(new Date());
    } catch {
      return "--:--";
    }
  };

  // Reunion countdown
  const getCountdown = () => {
    if (!me?.reunion_date) return null;
    const reunion = new Date(me.reunion_date);
    const now = new Date();
    // Normalize to start of day
    reunion.setHours(23, 59, 59, 0);
    const diff = reunion - now;
    if (diff <= 0) return { text: "Today is the day! 🎉", isToday: true };
    const days = differenceInDays(reunion, now);
    const hours = differenceInHours(reunion, now) % 24;
    if (days === 0)
      return { text: `${hours}h until you reunite! 🥰`, isToday: false };
    return {
      text: `${days} day${days !== 1 ? "s" : ""} until you reunite`,
      isToday: false,
      days,
      hours,
    };
  };

  const countdown = getCountdown();
  const partnerTime = getPartnerLocalTime();

  if (!currentUser) return null;

  return (
    <View style={{ flex: 1, backgroundColor: "#FFF" }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 20,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => queryClient.invalidateQueries()}
            tintColor={PRIMARY_COLOR}
          />
        }
      >
        {/* App Brand */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <Heart size={20} color={PRIMARY_COLOR} fill={PRIMARY_COLOR} />
          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: PRIMARY_COLOR,
              marginLeft: 7,
              letterSpacing: 0.5,
            }}
          >
            Boundless
          </Text>
        </View>

        {/* ── Partner Header Card ── */}
        <View style={styles.headerCard}>
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            {me?.partner_avatar_url ? (
              <Image
                source={{ uri: me.partner_avatar_url }}
                style={styles.partnerAvatar}
                contentFit="cover"
              />
            ) : (
              <View
                style={[styles.partnerAvatar, styles.partnerAvatarPlaceholder]}
              >
                <Heart size={22} color={PRIMARY_COLOR} fill={PRIMARY_COLOR} />
              </View>
            )}
            <View style={{ marginLeft: 14, flex: 1 }}>
              <Text style={styles.partnerNameText}>
                {me?.partner_name || "My Partner"}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 3,
                }}
              >
                <Clock size={13} color="#9CA3AF" />
                <Text style={styles.localTimeText}>{partnerTime}</Text>
              </View>
              {me?.partner_home_city ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 2,
                  }}
                >
                  <MapPin size={12} color="#9CA3AF" />
                  <Text
                    style={{ fontSize: 13, color: "#9CA3AF", marginLeft: 4 }}
                  >
                    {me.partner_home_city}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Miss You Button */}
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <TouchableOpacity
              onPress={() => {
                if (!me?.partner_id) {
                  Alert.alert("Not paired", "Link with your partner first!");
                  return;
                }
                sendPingMutation.mutate();
              }}
              disabled={sendPingMutation.isPending || pingPressed}
              style={[
                styles.pingButton,
                (sendPingMutation.isPending || pingPressed) && { opacity: 0.7 },
              ]}
              activeOpacity={0.8}
            >
              <Heart
                size={26}
                color="#FFF"
                fill={pingPressed ? "#FFF" : "transparent"}
              />
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* ── Reunion Countdown ── */}
        {countdown && (
          <View style={styles.countdownCard}>
            <CalendarDays size={20} color={PRIMARY_COLOR} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.countdownLabel}>Reunion Countdown</Text>
              <Text style={styles.countdownText}>{countdown.text}</Text>
            </View>
            {countdown.days > 0 && (
              <View style={styles.countdownBadge}>
                <Text style={styles.countdownBadgeNum}>{countdown.days}</Text>
                <Text style={styles.countdownBadgeUnit}>days</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Daily Question ── */}
        {me?.id && (
          <DailyQuestionCard
            userId={me.id}
            partnerId={me.partner_id}
            partnerName={me.partner_name}
          />
        )}

        {/* ── Partner Status Feed ── */}
        <View style={{ marginTop: 28 }}>
          <Text style={styles.sectionTitle}>
            What {me?.partner_name || "they"}'re up to
          </Text>

          {loadingStatus ? (
            <View style={styles.emptyStatus}>
              <ActivityIndicator color={PRIMARY_COLOR} />
            </View>
          ) : partnerStatuses.length > 0 ? (
            partnerStatuses.map((status) => (
              <StatusCard
                key={status.id}
                status={status}
                imgHeight={imgHeight}
              />
            ))
          ) : (
            <View style={styles.emptyStatus}>
              <Heart size={38} color="#E5E7EB" />
              <Text style={styles.emptyText}>
                No updates yet.{"\n"}Tell them to post something! 📸
              </Text>
            </View>
          )}
        </View>

        {/* ── Recent Miss You Pings ── */}
        {pings.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <Text style={styles.sectionTitle}>Miss You Pings</Text>
            {pings.map((ping) => (
              <View key={ping.id} style={styles.pingCard}>
                <View style={styles.pingIcon}>
                  <Heart size={15} color={PRIMARY_COLOR} fill={PRIMARY_COLOR} />
                </View>
                <Text style={styles.pingText}>
                  <Text style={{ fontWeight: "700" }}>{ping.sender_name}</Text>
                  {" is thinking of you!"}
                </Text>
                <Text style={styles.pingTime}>
                  {formatDistanceToNow(new Date(ping.created_at), {
                    addSuffix: true,
                  })}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Not Paired Warning ── */}
        {!me?.partner_id && (
          <TouchableOpacity
            onPress={() => router.push("/auth")}
            style={styles.pairBanner}
          >
            <Heart size={18} color="#fff" />
            <Text style={styles.pairBannerText}>
              Link with your partner to start sharing
            </Text>
          </TouchableOpacity>
        )}

        {/* Bottom watermark */}
        <Text
          style={{
            textAlign: "center",
            fontSize: 9,
            color: "#E5E7EB",
            marginTop: 24,
            fontStyle: "italic",
          }}
        >
          Boundless · Made by Tayyab Khokhar💓
        </Text>
      </ScrollView>
    </View>
  );
}

function StatusCard({ status, imgHeight }) {
  const timeAgo = formatDistanceToNow(new Date(status.created_at), {
    addSuffix: true,
  });
  const expiresIn = format(new Date(status.expires_at), "h:mm a");

  return (
    <View style={styles.statusCard}>
      {status.content_image_url ? (
        <Image
          source={{ uri: status.content_image_url }}
          style={[styles.statusImage, { height: imgHeight }]}
          contentFit="cover"
        />
      ) : null}
      <View style={{ padding: 16 }}>
        {status.content_text ? (
          <Text style={styles.statusText}>{status.content_text}</Text>
        ) : null}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 10,
          }}
        >
          <Text style={styles.statusMeta}>{timeAgo}</Text>
          <Text style={styles.statusMeta}>expires {expiresIn}</Text>
        </View>
      </View>
    </View>
  );
}

function DailyQuestionCard({ userId, partnerId, partnerName }) {
  const queryClient = useQueryClient();
  const [myAnswer, setMyAnswer] = useState("");
  const [editing, setEditing] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const { data: answers } = useQuery({
    queryKey: ["dailyQuestion", userId, TODAY_DATE],
    queryFn: async () => {
      const params = new URLSearchParams({ userId, date: TODAY_DATE });
      if (partnerId) params.set("partnerId", partnerId);
      const res = await fetch(`/api/daily-question?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!userId,
    refetchInterval: 12000,
    onSuccess: (data) => {
      if (data?.myAnswer?.answer && !initialized) {
        setMyAnswer(data.myAnswer.answer);
        setInitialized(true);
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/daily-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, date: TODAY_DATE, answer: myAnswer }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["dailyQuestion"] });
    },
    onError: () => Alert.alert("Oops", "Couldn't save your answer."),
  });

  const savedMyAnswer = answers?.myAnswer?.answer;
  const partnerAnswer = answers?.partnerAnswer;

  return (
    <View
      style={{
        marginTop: 20,
        backgroundColor: "#FFF",
        borderRadius: 22,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "#FED7D7",
        shadowColor: PRIMARY_COLOR,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 10,
        elevation: 2,
      }}
    >
      {/* Question header */}
      <View
        style={{
          backgroundColor: "#FFF5F5",
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: "#FED7D7",
          flexDirection: "row",
          alignItems: "flex-start",
        }}
      >
        <MessageSquare
          size={17}
          color={PRIMARY_COLOR}
          style={{ marginTop: 2 }}
        />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text
            style={{
              fontSize: 10,
              fontWeight: "700",
              color: PRIMARY_COLOR,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 5,
            }}
          >
            Today's Question
          </Text>
          <Text
            style={{
              fontSize: 15,
              color: "#1A1A1A",
              fontWeight: "600",
              lineHeight: 22,
            }}
          >
            {TODAY_QUESTION}
          </Text>
        </View>
      </View>

      <View style={{ padding: 16 }}>
        {/* My answer */}
        {editing ? (
          <View>
            <TextInput
              value={myAnswer}
              onChangeText={setMyAnswer}
              placeholder="Share your thoughts…"
              placeholderTextColor="#C9A9A9"
              multiline
              style={{
                fontSize: 15,
                color: "#1A1A1A",
                lineHeight: 22,
                backgroundColor: "#FFF9F9",
                borderRadius: 14,
                padding: 12,
                borderWidth: 1,
                borderColor: "#FED7D7",
                minHeight: 80,
                textAlignVertical: "top",
                marginBottom: 10,
              }}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <TouchableOpacity
                onPress={() => {
                  setEditing(false);
                  setMyAnswer(savedMyAnswer || "");
                }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: "#F3F4F6",
                  marginRight: 8,
                }}
              >
                <Text style={{ color: "#6B7280", fontWeight: "600" }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => myAnswer.trim() && saveMutation.mutate()}
                disabled={saveMutation.isPending || !myAnswer.trim()}
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: myAnswer.trim() ? PRIMARY_COLOR : "#E5E7EB",
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                {saveMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Send size={13} color="#FFF" />
                    <Text
                      style={{
                        color: "#FFF",
                        fontWeight: "700",
                        marginLeft: 6,
                      }}
                    >
                      Save
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setEditing(true)}
            activeOpacity={0.7}
            style={{ marginBottom: partnerAnswer ? 12 : 0 }}
          >
            <View
              style={{
                backgroundColor: "#F9FAFB",
                borderRadius: 14,
                padding: 14,
                borderWidth: 1,
                borderColor: savedMyAnswer ? "#F3F4F6" : "#FED7D7",
                borderStyle: savedMyAnswer ? "solid" : "dashed",
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: "#9CA3AF",
                  marginBottom: 4,
                }}
              >
                YOUR ANSWER
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  color: savedMyAnswer ? "#1A1A1A" : "#C9A9A9",
                  lineHeight: 22,
                  fontStyle: savedMyAnswer ? "normal" : "italic",
                }}
              >
                {savedMyAnswer || "Tap to share your answer…"}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Partner answer */}
        {partnerAnswer && (
          <View
            style={{
              backgroundColor: "#FFF5F5",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: "#FED7D7",
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: PRIMARY_COLOR,
                marginBottom: 4,
              }}
            >
              {(
                partnerAnswer.author_name ||
                partnerName ||
                "PARTNER"
              ).toUpperCase()}
              'S ANSWER
            </Text>
            <Text
              style={{
                fontSize: 15,
                color: "#1A1A1A",
                lineHeight: 22,
                fontStyle: "italic",
              }}
            >
              "{partnerAnswer.answer}"
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    backgroundColor: "#FFF5F5",
    borderRadius: 24,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FED7D7",
  },
  partnerAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: "#FED7D7",
  },
  partnerAvatarPlaceholder: {
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  partnerNameText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  localTimeText: {
    fontSize: 13,
    color: "#9CA3AF",
    marginLeft: 5,
  },
  pingButton: {
    backgroundColor: PRIMARY_COLOR,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
    shadowColor: PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  countdownCard: {
    marginTop: 16,
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FED7D7",
    shadowColor: PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  countdownLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  countdownText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    marginTop: 2,
  },
  countdownBadge: {
    backgroundColor: "#FFF5F5",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FED7D7",
  },
  countdownBadgeNum: {
    fontSize: 22,
    fontWeight: "800",
    color: PRIMARY_COLOR,
  },
  countdownBadgeUnit: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 14,
  },
  statusCard: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F3F4F6",
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  statusImage: {
    width: "100%",
    height: 260,
  },
  statusText: {
    fontSize: 16,
    color: "#333",
    lineHeight: 23,
  },
  statusMeta: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  emptyStatus: {
    padding: 40,
    backgroundColor: "#F9FAFB",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderStyle: "dashed",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  emptyText: {
    color: "#9CA3AF",
    marginTop: 12,
    textAlign: "center",
    lineHeight: 22,
    fontSize: 15,
  },
  pingCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFF",
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  pingIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFF5F5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  pingText: {
    flex: 1,
    fontSize: 14,
    color: "#4B5563",
  },
  pingTime: {
    fontSize: 12,
    color: "#9CA3AF",
    marginLeft: 8,
  },
  pairBanner: {
    marginTop: 24,
    backgroundColor: PRIMARY_COLOR,
    padding: 18,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  pairBannerText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 15,
    marginLeft: 10,
  },
});
