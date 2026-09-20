import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../hooks/useColors';

export function ParticipantAvatar({
  colors,
  name,
  avatarUrl,
  fallback,
  size,
}: {
  colors: ReturnType<typeof useColors>;
  name: string;
  avatarUrl?: string | null;
  fallback: string;
  size: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || fallback;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.secondary }]}>
      {avatarUrl && !imageFailed ? (
        <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} onError={() => setImageFailed(true)} />
      ) : (
        <Text style={[styles.initials, { color: colors.primary, fontSize: size * 0.3 }]}>{initials}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { fontFamily: 'Inter_700Bold' },
});