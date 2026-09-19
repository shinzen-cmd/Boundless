import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  Camera,
  CalendarDays,
  MapPin,
  LogOut,
  Save,
  User,
  Link2Off,
} from "lucide-react-native";
import { Calendar } from "react-native-calendars";
import useUpload from "@/utils/useUpload";
import {
  scheduleReunionReminders,
  cancelAllBoundlessNotifications,
} from "@/utils/notifications";

const PRIMARY_COLOR = "#FF6B6B";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [currentUser, setCurrentUser] = useState(null);
  const [name, setName] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [avatarAsset, setAvatarAsset] = useState(null);
  const [saving, setSaving] = useState(false);

  const [upload, { loading: uploading }] = useUpload();

  useEffect(() => {
    const loadUser = async () => {
      const stored = await SecureStore.getItemAsync("couple_app_user");
      if (stored) {
        const user = JSON.parse(stored);
        setCurrentUser(user);
        setName(user.name || "");
        setHomeCity(user.home_city || "");
        if (user.reunion_date) {
          setSelectedDate(user.reunion_date.split("T")[0]);
        }
      }
    };
    loadUser();
  }, []);

  const { data: me, isLoading } = useQuery({
    queryKey: ["me", currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/users/me?userId=${currentUser.id}`);
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
    enabled: !!currentUser?.id,
  });

  useEffect(() => {
    if (me) {
      setName(me.name || "");
      setHomeCity(me.home_city || "");
      if (me.reunion_date) {
        setSelectedDate(me.reunion_date.split("T")[0]);
      }
    }
  }, [me]);

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) {
      setAvatarAsset(result.assets[0]);
    }
  };

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Missing info", "Your name is required.");
      return;
    }
    setSaving(true);
    try {
      let avatarUrl = me?.avatar_url || null;
      if (avatarAsset) {
        const { url, error } = await upload({ reactNativeAsset: avatarAsset });
        if (error) throw new Error(error);
        avatarUrl = url;
      }

      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          name: name.trim(),
          home_city: homeCity.trim() || null,
          avatar_url: avatarUrl,
          reunion_date: selectedDate || null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Save failed");
      }

      const updated = await res.json();
      const stored = await SecureStore.getItemAsync("couple_app_user");
      const base = stored ? JSON.parse(stored) : {};
      await SecureStore.setItemAsync(
        "couple_app_user",
        JSON.stringify({ ...base, ...updated }),
      );

      // Schedule reunion reminders if date is set
      await scheduleReunionReminders(selectedDate || null);

      queryClient.invalidateQueries(["me"]);
      Alert.alert("Saved!", "Your profile has been updated. ✨");
    } catch (err) {
      console.error(err);
      Alert.alert("Error", err.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  }, [name, homeCity, selectedDate, avatarAsset, me, currentUser, upload]);

  const handleDisconnect = () => {
    Alert.alert(
      "Disconnect Partner",
      "Are you sure? This will unlink you from your partner.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              await fetch("/api/users/me", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userId: currentUser.id,
                  reunion_date: null,
                }),
              });
              // We'll need a proper disconnect endpoint; for now just alert
              Alert.alert(
                "Note",
                "Please contact support to fully disconnect accounts.",
              );
            } catch (e) {
              console.error(e);
            }
          },
        },
      ],
    );
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await cancelAllBoundlessNotifications();
          await SecureStore.deleteItemAsync("couple_app_user");
          await SecureStore.deleteItemAsync("last_ping_id");
          queryClient.clear();
          router.replace("/auth");
        },
      },
    ]);
  };

  const formatDate = () => {
    if (!selectedDate) return "Not set — tap to pick a date";
    const d = new Date(selectedDate + "T12:00:00");
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const avatarSource = avatarAsset
    ? { uri: avatarAsset.uri }
    : me?.avatar_url
      ? { uri: me.avatar_url }
      : null;

  const todayStr = new Date().toISOString().split("T")[0];

  if (!currentUser) return null;

  return (
    <View style={{ flex: 1, backgroundColor: "#FFF" }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingHorizontal: 22,
          paddingBottom: insets.bottom + 48,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text
          style={{
            fontSize: 28,
            fontWeight: "700",
            color: "#1A1A1A",
            marginBottom: 6,
          }}
        >
          Settings
        </Text>
        <Text
          style={{
            fontSize: 10,
            color: "#E5E7EB",
            fontStyle: "italic",
            marginBottom: 26,
          }}
        >
          Boundless · Made by Tayyab Khokhar💓
        </Text>

        {/* Avatar */}
        <View style={{ alignItems: "center", marginBottom: 36 }}>
          <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8}>
            {avatarSource ? (
              <Image
                source={avatarSource}
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 50,
                  borderWidth: 3,
                  borderColor: "#FED7D7",
                }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 50,
                  backgroundColor: "#FFF5F5",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2,
                  borderColor: "#FED7D7",
                }}
              >
                <User size={44} color={PRIMARY_COLOR} />
              </View>
            )}
            <View
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                backgroundColor: PRIMARY_COLOR,
                borderRadius: 16,
                width: 32,
                height: 32,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: 3,
              }}
            >
              <Camera size={16} color="#FFF" />
            </View>
          </TouchableOpacity>
          <Text style={{ color: "#9CA3AF", marginTop: 10, fontSize: 13 }}>
            Tap to update your photo
          </Text>
        </View>

        {/* Pairing Code */}
        <View
          style={{
            backgroundColor: "#FFF5F5",
            borderRadius: 16,
            padding: 16,
            marginBottom: 28,
            borderWidth: 1,
            borderColor: "#FED7D7",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: "#C53030",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 6,
            }}
          >
            Your Pairing Code
          </Text>
          <Text
            style={{
              fontSize: 32,
              fontWeight: "800",
              color: PRIMARY_COLOR,
              letterSpacing: 6,
            }}
          >
            {me?.pairing_code || currentUser?.pairing_code || "——"}
          </Text>
          <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 6 }}>
            Share this with your partner
          </Text>
        </View>

        {/* Name */}
        <Text style={labelStyle}>Your Name</Text>
        <TextInput
          style={inputStyle}
          value={name}
          onChangeText={setName}
          placeholder="Your display name"
          placeholderTextColor="#9CA3AF"
        />

        {/* Home City */}
        <Text style={labelStyle}>Home City</Text>
        <View
          style={[
            inputStyle,
            { flexDirection: "row", alignItems: "center", paddingVertical: 0 },
          ]}
        >
          <MapPin size={17} color={PRIMARY_COLOR} style={{ marginRight: 8 }} />
          <TextInput
            style={{
              flex: 1,
              fontSize: 16,
              color: "#333",
              paddingVertical: 14,
            }}
            value={homeCity}
            onChangeText={setHomeCity}
            placeholder="e.g. Tokyo, London, NYC…"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Reunion Date */}
        <Text style={[labelStyle, { marginTop: 20 }]}>Reunion Date 🗓️</Text>
        <TouchableOpacity
          onPress={() => setShowCalendar(true)}
          style={{
            backgroundColor: "#FFF5F5",
            borderRadius: 14,
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 36,
            borderWidth: 1,
            borderColor: "#FED7D7",
          }}
          activeOpacity={0.75}
        >
          <CalendarDays size={20} color={PRIMARY_COLOR} />
          <Text
            style={{
              marginLeft: 12,
              fontSize: 16,
              color: selectedDate ? "#333" : "#9CA3AF",
              flex: 1,
            }}
          >
            {formatDate()}
          </Text>
        </TouchableOpacity>

        {/* Save Button */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || uploading}
          style={{
            backgroundColor: PRIMARY_COLOR,
            paddingVertical: 17,
            borderRadius: 18,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            marginBottom: 14,
            shadowColor: PRIMARY_COLOR,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
            elevation: 5,
            opacity: saving || uploading ? 0.7 : 1,
          }}
          activeOpacity={0.85}
        >
          {saving || uploading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Save size={20} color="#FFF" />
              <Text
                style={{
                  color: "#FFF",
                  fontSize: 17,
                  fontWeight: "700",
                  marginLeft: 10,
                }}
              >
                Save Changes
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Sign Out */}
        <TouchableOpacity
          onPress={handleSignOut}
          style={{
            paddingVertical: 16,
            borderRadius: 18,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            borderWidth: 1.5,
            borderColor: "#E5E7EB",
          }}
          activeOpacity={0.75}
        >
          <LogOut size={19} color="#6B7280" />
          <Text
            style={{
              color: "#6B7280",
              fontSize: 16,
              fontWeight: "600",
              marginLeft: 9,
            }}
          >
            Sign Out
          </Text>
        </TouchableOpacity>

        {/* Bottom watermark */}
        <Text
          style={{
            textAlign: "center",
            fontSize: 9,
            color: "#E5E7EB",
            marginTop: 20,
            fontStyle: "italic",
          }}
        >
          Made by Tayyab Khokhar💓
        </Text>
      </ScrollView>

      {/* Calendar Modal */}
      <Modal
        visible={showCalendar}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCalendar(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#FFF",
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 24,
              paddingBottom: insets.bottom + 24,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "700",
                color: "#1A1A1A",
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              When do you reunite? 💞
            </Text>
            <Calendar
              onDayPress={(day) => {
                setSelectedDate(day.dateString);
                setShowCalendar(false);
              }}
              markedDates={
                selectedDate
                  ? {
                      [selectedDate]: {
                        selected: true,
                        selectedColor: PRIMARY_COLOR,
                      },
                    }
                  : {}
              }
              minDate={todayStr}
              theme={{
                selectedDayBackgroundColor: PRIMARY_COLOR,
                todayTextColor: PRIMARY_COLOR,
                arrowColor: PRIMARY_COLOR,
                dotColor: PRIMARY_COLOR,
              }}
            />
            {selectedDate && (
              <TouchableOpacity
                onPress={() => {
                  setSelectedDate("");
                  setShowCalendar(false);
                }}
                style={{ marginTop: 12, alignItems: "center" }}
              >
                <Text style={{ color: "#9CA3AF", fontSize: 15 }}>
                  Clear date
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setShowCalendar(false)}
              style={{ marginTop: 8, alignItems: "center" }}
            >
              <Text
                style={{ color: "#6B7280", fontSize: 15, fontWeight: "600" }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const labelStyle = {
  fontSize: 12,
  fontWeight: "700",
  color: "#6B7280",
  textTransform: "uppercase",
  letterSpacing: 0.8,
  marginBottom: 8,
};

const inputStyle = {
  backgroundColor: "#F9FAFB",
  padding: 14,
  borderRadius: 14,
  marginBottom: 20,
  fontSize: 16,
  borderWidth: 1,
  borderColor: "#E5E7EB",
  color: "#333",
};
