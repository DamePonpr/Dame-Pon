import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { InlineNotice } from '@/components/InlineNotice';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function savePushToken() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('trips', {
      name: 'Viajes',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#0B1C26',
      sound: 'default',
    });
  }

  const projectId = Constants.easConfig?.projectId
    ?? (Constants.expoConfig?.extra?.eas?.projectId as string | undefined);
  const tokenResult = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();
  const { error } = await supabase.rpc('set_my_push_token', {
    p_push_token: tokenResult.data,
  });
  if (error) throw error;
}

export function PushNotificationRegistration() {
  const { user } = useAuth();
  const [showPrompt, setShowPrompt] = useState(false);
  const [askedKey, setAskedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !Device.isDevice) return;
    let active = true;
      const notificationKey = `dame-pon:notifications-asked:${user.id}`;

    const registerIfAllowed = async () => {
      const permissions = await Notifications.getPermissionsAsync();
      if (permissions.granted) {
        try {
          await savePushToken();
        } catch (error) {
          console.error('[Dame Pon] push-token:', error);
        }
        return;
      }

      const alreadyAsked = await AsyncStorage.getItem(notificationKey);
      if (alreadyAsked || !active) return;
      setAskedKey(notificationKey);
      setShowPrompt(true);
    };

    void registerIfAllowed();
    return () => {
      active = false;
    };
  }, [user?.id]);

  async function allowNotifications() {
    if (askedKey) await AsyncStorage.setItem(askedKey, 'true');
    setShowPrompt(false);
    const result = await Notifications.requestPermissionsAsync();
    if (!result.granted) return;
    try {
      await savePushToken();
    } catch (error) {
      console.error('[Dame Pon] push-token:', error);
    }
  }

  async function dismissPrompt() {
    if (askedKey) await AsyncStorage.setItem(askedKey, 'true');
    setShowPrompt(false);
  }

  if (!showPrompt) return null;
  return (
    <View style={styles.overlay}>
      <InlineNotice
        title="Mantente al tanto de tu viaje"
        message="Dame Pon usa notificaciones para avisarte cuando aceptan tu viaje, el conductor inicia el recorrido o aparece una solicitud cercana."
        actionLabel="Permitir notificaciones"
        onAction={() => void allowNotifications()}
      />
      <Pressable onPress={() => void dismissPrompt()} style={styles.dismiss}>
        <Text style={styles.dismissText}>Ahora no</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 54, left: 14, right: 14, zIndex: 100 },
  dismiss: { alignSelf: 'flex-end', marginTop: 5, paddingHorizontal: 12, paddingVertical: 5 },
  dismissText: { color: '#FFFFFF', fontFamily: 'Jakarta-SemiBold', fontSize: 12 },
});