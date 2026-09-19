import React, { useEffect, useState, useRef } from "react";
import { View, Text, Animated, Easing, StyleSheet } from "react-native";
import { Image } from "expo-image";
import * as SecureStore from "expo-secure-store";
import { Redirect } from "expo-router";
import {
  registerForLocalNotifications,
  scheduleDailyQuestionReminder,
} from "@/utils/notifications";

const LOGO_URL =
  "https://raw.createusercontent.com/82cea336-29f8-4338-af24-32d40e496bf4/";

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [fadingOut, setFadingOut] = useState(false);

  const logoScale = useRef(new Animated.Value(0.65)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const heartBeat = useRef(new Animated.Value(1)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  const triggerFadeOut = () => {
    setFadingOut(true);
    Animated.timing(screenOpacity, {
      toValue: 0,
      duration: 600,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => setLoading(false));
  };

  useEffect(() => {
    // Entrance animations
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 55,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Gentle heartbeat loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(heartBeat, {
          toValue: 1.1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(heartBeat, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    const init = async () => {
      try {
        const stored = await SecureStore.getItemAsync("couple_app_user");
        if (stored) {
          const parsed = JSON.parse(stored);
          setUser(parsed);
          // Setup notifications for returning user
          const granted = await registerForLocalNotifications();
          if (granted) {
            await scheduleDailyQuestionReminder();
          }
        }
      } catch (e) {
        console.error("Splash init error:", e);
      } finally {
        // Exactly 5 seconds, then smooth fade out
        setTimeout(() => triggerFadeOut(), 5000);
      }
    };
    init();
  }, []);

  if (loading) {
    return (
      <Animated.View style={[s.container, { opacity: screenOpacity }]}>
        {/* Rich background layers */}
        <View style={s.bg1} />
        <View style={s.bg2} />

        {/* Decorative circles */}
        <View
          style={[
            s.circle,
            { width: 380, height: 380, top: -100, right: -130, opacity: 0.12 },
          ]}
        />
        <View
          style={[
            s.circle,
            { width: 260, height: 260, bottom: 80, left: -80, opacity: 0.1 },
          ]}
        />

        {/* Logo with heartbeat */}
        <Animated.View
          style={[
            s.logoWrap,
            {
              opacity: logoOpacity,
              transform: [{ scale: Animated.multiply(logoScale, heartBeat) }],
            },
          ]}
        >
          <Image
            source={{ uri: LOGO_URL }}
            style={s.logo}
            contentFit="contain"
          />
        </Animated.View>

        {/* App name */}
        <Animated.Text style={[s.appName, { opacity: textOpacity }]}>
          Boundless
        </Animated.Text>

        {/* Tagline */}
        <Animated.Text style={[s.tagline, { opacity: taglineOpacity }]}>
          Love knows no distance
        </Animated.Text>

        {/* Footer credit */}
        <View style={s.footer}>
          <Text style={s.credit}>Made by Tayyab Khokhar 💓</Text>
        </View>
      </Animated.View>
    );
  }

  if (!user) return <Redirect href="/auth" />;
  if (!user.partner_id) return <Redirect href="/auth" />;
  return <Redirect href="/(tabs)/home" />;
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF6B6B",
  },
  bg1: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FF6B6B",
  },
  bg2: {
    ...StyleSheet.absoluteFillObject,
    top: "55%",
    backgroundColor: "#BF3636",
    opacity: 0.5,
    borderTopLeftRadius: 180,
    borderTopRightRadius: 180,
  },
  circle: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "#FFF",
  },
  logoWrap: {
    width: 150,
    height: 150,
    borderRadius: 38,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 18,
    overflow: "hidden",
  },
  logo: {
    width: 150,
    height: 150,
    borderRadius: 38,
  },
  appName: {
    fontSize: 46,
    fontWeight: "900",
    color: "#FFF",
    letterSpacing: 1.2,
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  tagline: {
    fontSize: 16,
    color: "rgba(255,255,255,0.72)",
    marginTop: 12,
    fontStyle: "italic",
    letterSpacing: 0.5,
  },
  footer: {
    position: "absolute",
    bottom: 40,
    alignItems: "center",
  },
  credit: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    fontStyle: "italic",
    letterSpacing: 0.3,
  },
});
