import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function InlineNotice({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.notice, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      <Feather name="info" size={18} color={colors.primary} />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} style={styles.action}>
            <Text style={[styles.actionText, { color: colors.primary }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', gap: 10, marginTop: 14 },
  copy: { flex: 1, gap: 4 },
  title: { fontFamily: 'Jakarta-SemiBold', fontSize: 14 },
  message: { fontFamily: 'Jakarta', fontSize: 13, lineHeight: 19 },
  action: { alignSelf: 'flex-start', marginTop: 4 },
  actionText: { fontFamily: 'Jakarta-SemiBold', fontSize: 13 },
});