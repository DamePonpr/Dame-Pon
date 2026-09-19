import { Text, View } from 'react-native';

import { useColors } from '@/hooks/useColors';

function buildStampText() {
  const tag = process.env.EXPO_PUBLIC_BUILD_TAG;
  const sha = process.env.EXPO_PUBLIC_BUILD_SHA;
  const date = process.env.EXPO_PUBLIC_BUILD_DATE;

  if (!tag || !sha || !date) return 'Build local';
  return `Build ${tag} · ${sha} · ${date}`;
}

export function BuildStamp() {
  const colors = useColors();

  return (
    <View className="items-center" accessibilityLabel={buildStampText()}>
      <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
        {buildStampText()}
      </Text>
    </View>
  );
}