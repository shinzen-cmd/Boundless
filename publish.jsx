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
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Camera, ImageIcon, Send, X, Sparkles } from "lucide-react-native";
import { Image } from "expo-image";
import useUpload from "@/utils/useUpload";
import KeyboardAvoidingAnimatedView from "@/components/KeyboardAvoidingAnimatedView";

const PRIMARY = "#FF6B6B";

export default function PublishScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState("");
  const [upload, { loading: uploading }] = useUpload();

  useEffect(() => {
    SecureStore.getItemAsync("couple_app_user")
      .then((s) => {
        if (s) setCurrentUser(JSON.parse(s));
      })
      .catch(console.error);
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Allow photo library access to share photos.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]) {
      setImage(result.assets[0]);
      setError("");
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow camera access to take photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]) {
      setImage(result.assets[0]);
      setError("");
    }
  };

  const handlePublish = async () => {
    if (!text.trim() && !image) {
      setError("Share a thought or a photo!");
      return;
    }
    if (!currentUser?.id) {
      setError("You are not signed in.");
      return;
    }

    setPublishing(true);
    setError("");

    try {
      let imageUrl = null;

      if (image) {
        const asset = {
          uri: image.uri,
          mimeType: image.mimeType || "image/jpeg",
          name: image.fileName || `photo_${Date.now()}.jpg`,
        };

        const uploadResult = await upload({ reactNativeAsset: asset });

        if (uploadResult.error) {
          throw new Error(uploadResult.error || "Image upload failed");
        }

        imageUrl = uploadResult.url;

        if (!imageUrl) {
          throw new Error("Upload succeeded but no URL was returned");
        }
      }

      const response = await fetch("/api/status/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          text: text.trim() || null,
          imageUrl,
          expiresHours: 24,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${response.status}`);
      }

      setText("");
      setImage(null);
      setError("");

      Alert.alert(
        "Published! ✨",
        "Your partner can see what you're up to now.",
        [{ text: "Great!", onPress: () => router.push("/(tabs)/home") }],
      );
    } catch (err) {
      console.error("Publish error:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  if (!currentUser) return null;

  const isLoading = publishing || uploading;

  return (
    <KeyboardAvoidingAnimatedView
      style={{ flex: 1, backgroundColor: "#FFF" }}
      behavior="padding"
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingHorizontal: 20,
          paddingBottom: 100,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 6,
          }}
        >
          <Sparkles size={24} color={PRIMARY} />
          <Text style={{ fontSize: 26, fontWeight: "900", color: "#1A1A1A" }}>
            Update Status
          </Text>
        </View>
        <Text
          style={{
            fontSize: 15,
            color: "#9CA3AF",
            marginBottom: 28,
            lineHeight: 22,
          }}
        >
          Let {currentUser.name ? "your love" : "them"} know what you're up to.
          Expires in 24 hours. 💕
        </Text>

        {/* Text input */}
        <View
          style={{
            backgroundColor: "#F9FAFB",
            borderRadius: 20,
            padding: 18,
            minHeight: 130,
            borderWidth: 1.5,
            borderColor: "#E5E7EB",
            marginBottom: 18,
          }}
        >
          <TextInput
            multiline
            placeholder="What are you up to? 🌟"
            placeholderTextColor="#9CA3AF"
            style={{
              fontSize: 17,
              color: "#1A1A1A",
              textAlignVertical: "top",
              minHeight: 90,
            }}
            value={text}
            onChangeText={(t) => {
              setText(t);
              setError("");
            }}
          />
        </View>

        {/* Image section */}
        {image ? (
          <View
            style={{
              width: "100%",
              height: 260,
              borderRadius: 20,
              overflow: "hidden",
              marginBottom: 18,
              position: "relative",
            }}
          >
            <Image
              source={{ uri: image.uri }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
            <TouchableOpacity
              onPress={() => setImage(null)}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                backgroundColor: "rgba(0,0,0,0.55)",
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 18 }}>
            <TouchableOpacity
              onPress={takePhoto}
              style={{
                flex: 1,
                backgroundColor: "#FFF5F5",
                borderRadius: 20,
                paddingVertical: 26,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor: "#FED7D7",
                gap: 8,
              }}
            >
              <Camera size={30} color={PRIMARY} />
              <Text
                style={{ fontSize: 14, fontWeight: "700", color: "#C53030" }}
              >
                Take Photo
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={pickImage}
              style={{
                flex: 1,
                backgroundColor: "#FFF5F5",
                borderRadius: 20,
                paddingVertical: 26,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor: "#FED7D7",
                gap: 8,
              }}
            >
              <ImageIcon size={30} color={PRIMARY} />
              <Text
                style={{ fontSize: 14, fontWeight: "700", color: "#C53030" }}
              >
                Library
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Error */}
        {!!error && (
          <View
            style={{
              backgroundColor: "#FFF5F5",
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: "#FED7D7",
              marginBottom: 16,
            }}
          >
            <Text
              style={{ color: "#C53030", fontSize: 14, textAlign: "center" }}
            >
              {error}
            </Text>
          </View>
        )}

        {/* Publish button */}
        <TouchableOpacity
          onPress={handlePublish}
          disabled={isLoading || (!text.trim() && !image)}
          style={{
            backgroundColor:
              isLoading || (!text.trim() && !image) ? "#F3F4F6" : PRIMARY,
            flexDirection: "row",
            paddingVertical: 18,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            shadowColor: PRIMARY,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isLoading || (!text.trim() && !image) ? 0 : 0.25,
            shadowRadius: 10,
            elevation: isLoading || (!text.trim() && !image) ? 0 : 4,
          }}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text
                style={{
                  color: !text.trim() && !image ? "#9CA3AF" : "#FFF",
                  fontSize: 17,
                  fontWeight: "800",
                }}
              >
                Share with my Love
              </Text>
              {text.trim() || image ? <Send size={20} color="#FFF" /> : null}
            </>
          )}
        </TouchableOpacity>

        {/* Footer */}
        <Text
          style={{
            textAlign: "center",
            fontSize: 11,
            color: "#D1D5DB",
            marginTop: 28,
            fontWeight: "700",
          }}
        >
          © copyright 2026 | Boundless
        </Text>
      </ScrollView>
    </KeyboardAvoidingAnimatedView>
  );
}
