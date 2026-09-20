import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { reloadAppAsync } from 'expo';

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const monoFont = Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
  });

  const errorDetails = [error.message, error.stack ? `\n${error.stack}` : '']
    .join('')
    .trim();

  const handleRestart = async () => {
    try {
      await reloadAppAsync();
    } catch (restartError) {
      console.error('[Dame Pon] Failed to restart app:', restartError);
      resetError();
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator
      >
        <Text style={[styles.title, { color: colors.foreground }]}>
          Dame Pon encontró un error
        </Text>

        <Text style={[styles.message, { color: colors.mutedForeground }]}>
          La app no se cerró para que puedas ver el mensaje y reportarlo.
        </Text>

        <View style={[styles.errorContainer, { backgroundColor: colors.card }]}>
          <Text
            selectable
            style={[
              styles.errorText,
              { color: colors.foreground, fontFamily: monoFont },
            ]}
          >
            {errorDetails || 'Error sin mensaje'}
          </Text>
        </View>

        <Pressable
          onPress={handleRestart}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Text
            style={[styles.buttonText, { color: colors.primaryForeground }]}
          >
            Intentar de nuevo
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    paddingHorizontal: 24,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    width: '100%',
    maxWidth: 600,
    paddingVertical: 24,
  },
  title: {
    fontSize: 25,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 34,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  errorContainer: {
    width: '100%',
    borderRadius: 8,
    padding: 16,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 8,
    paddingHorizontal: 24,
    minWidth: 200,
    elevation: 3,
  },
  buttonText: {
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 16,
  },
});