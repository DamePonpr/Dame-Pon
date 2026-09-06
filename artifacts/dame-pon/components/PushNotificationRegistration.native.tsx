import React, { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

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

  useEffect(() => {
    if (!user?.id || !Device.isDevice) return;
    let active = true;
    const askedKey = `dame-pon:notifications-asked:${user.id}`;

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

      const alreadyAsked = await AsyncStorage.getItem(askedKey);
      if (alreadyAsked || !active) return;
      await AsyncStorage.setItem(askedKey, 'true');

      Alert.alert(
        'Mantente al tanto de tu viaje',
        'Dame Pon usa notificaciones para avisarte cuando aceptan tu viaje, el conductor inicia el recorrido o aparece una solicitud cercana.',
        [
          { text: 'Ahora no', style: 'cancel' },
          {
            text: 'Permitir notificaciones',
            onPress: () => {
              void Notifications.requestPermissionsAsync().then(async (result) => {
                if (!result.granted) return;
                try {
                  await savePushToken();
                } catch (error) {
                  console.error('[Dame Pon] push-token:', error);
                }
              });
            },
          },
        ],
      );
    };

    void registerIfAllowed();
    return () => {
      active = false;
    };
  }, [user?.id]);

  return null;
}