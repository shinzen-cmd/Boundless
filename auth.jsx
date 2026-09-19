import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { Heart } from "lucide-react-native";
import KeyboardAvoidingAnimatedView from "@/components/KeyboardAvoidingAnimatedView";

const PRIMARY_COLOR = "#FF6B6B";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState("register"); // 'register' or 'pair'
  const [loading, setLoading] = useState(false);

  // Registration state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // Pairing state
  const [pairingCodeInput, setPairingCodeInput] = useState("");
  const [myCode, setMyCode] = useState("");
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    // Check if we already have a user but just need pairing
    const checkUser = async () => {
      const stored = await SecureStore.getItemAsync("couple_app_user");
      if (stored) {
        const user = JSON.parse(stored);
        setUserId(user.id);
        setMyCode(user.pairing_code);
        if (user.partner_id) {
          router.replace("/(tabs)/home");
        } else {
          setStep("pair");
        }
      }
    };
    checkUser();
  }, []);

  const handleRegister = async () => {
    if (!name || !email) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        await SecureStore.setItemAsync("couple_app_user", JSON.stringify(data));
        setUserId(data.id);
        setMyCode(data.pairing_code);
        setStep("pair");
      } else {
        Alert.alert("Error", data.error || "Registration failed");
      }
    } catch (error) {
      Alert.alert("Error", "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handlePair = async () => {
    if (!pairingCodeInput) {
      Alert.alert("Error", "Please enter a pairing code");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          pairingCode: pairingCodeInput.toUpperCase(),
        }),
      });
      const data = await response.json();
      if (response.ok) {
        // Refresh user info to get partner_id
        const meResponse = await fetch(`/api/users/me?userId=${userId}`);
        const meData = await meResponse.json();
        await SecureStore.setItemAsync(
          "couple_app_user",
          JSON.stringify(meData),
        );
        router.replace("/(tabs)/home");
      } else {
        Alert.alert("Error", data.error || "Pairing failed");
      }
    } catch (error) {
      Alert.alert("Error", "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingAnimatedView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior="padding"
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 60,
          paddingHorizontal: 30,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <View style={{ alignItems: "center", marginBottom: 40 }}>
          <Heart size={60} color={PRIMARY_COLOR} fill={PRIMARY_COLOR} />
          <Text
            style={{
              fontSize: 32,
              fontWeight: "700",
              color: "#333",
              marginTop: 20,
            }}
          >
            Boundless
          </Text>
          <Text style={{ fontSize: 16, color: "#666", marginTop: 8 }}>
            Love knows no distance.
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: "#D1D5DB",
              marginTop: 6,
              fontStyle: "italic",
            }}
          >
            Made by Tayyab Khokhar💓
          </Text>
        </View>

        {step === "register" ? (
          <View>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 24,
                color: "#333",
              }}
            >
              Create your account
            </Text>
            <TextInput
              style={{
                backgroundColor: "#F9FAFB",
                padding: 16,
                borderRadius: 12,
                marginBottom: 16,
                fontSize: 16,
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
              placeholder="Your Name"
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={{
                backgroundColor: "#F9FAFB",
                padding: 16,
                borderRadius: 12,
                marginBottom: 24,
                fontSize: 16,
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
              placeholder="Email Address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={handleRegister}
              disabled={loading}
              style={{
                backgroundColor: PRIMARY_COLOR,
                paddingVertical: 16,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  style={{ color: "#fff", fontSize: 18, fontWeight: "600" }}
                >
                  Get Started
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 8,
                color: "#333",
              }}
            >
              Link with your partner
            </Text>
            <Text style={{ color: "#666", marginBottom: 32 }}>
              Share your code or enter theirs to pair up.
            </Text>

            <View
              style={{
                backgroundColor: "#FFF5F5",
                padding: 24,
                borderRadius: 16,
                alignItems: "center",
                marginBottom: 32,
                borderWidth: 1,
                borderColor: "#FED7D7",
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: "#C53030",
                  fontWeight: "600",
                  marginBottom: 8,
                  textTransform: "uppercase",
                }}
              >
                Your Pairing Code
              </Text>
              <Text
                style={{
                  fontSize: 40,
                  fontWeight: "800",
                  color: PRIMARY_COLOR,
                  letterSpacing: 4,
                }}
              >
                {myCode}
              </Text>
            </View>

            <TextInput
              style={{
                backgroundColor: "#F9FAFB",
                padding: 16,
                borderRadius: 12,
                marginBottom: 16,
                fontSize: 20,
                fontWeight: "600",
                textAlign: "center",
                borderWidth: 1,
                borderColor: "#E5E7EB",
                letterSpacing: 2,
              }}
              placeholder="ENTER PARTNER'S CODE"
              value={pairingCodeInput}
              onChangeText={setPairingCodeInput}
              autoCapitalize="characters"
            />

            <TouchableOpacity
              onPress={handlePair}
              disabled={loading}
              style={{
                backgroundColor: PRIMARY_COLOR,
                paddingVertical: 16,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  style={{ color: "#fff", fontSize: 18, fontWeight: "600" }}
                >
                  Link Hearts
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace("/(tabs)/home")}
              style={{ marginTop: 20, alignItems: "center" }}
            >
              <Text style={{ color: "#9CA3AF" }}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      <Text
        style={{
          textAlign: "center",
          fontSize: 10,
          color: "#E5E7EB",
          marginTop: 32,
          fontStyle: "italic",
        }}
      >
        Boundless · Made by Tayyab Khokhar💓
      </Text>
    </KeyboardAvoidingAnimatedView>
  );
}
