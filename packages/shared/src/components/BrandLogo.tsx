import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { useColors } from '../hooks/useColors';

const logo = require('@/assets/images/dame-pon-logo.png');

export function BrandLogo({ style }: { style?: StyleProp<ImageStyle> }) {
  const colors = useColors();
  return (
    <Image
      accessibilityLabel="Logo de Dame Pon"
      source={logo}
      resizeMode="contain"
      tintColor={colors.isDark ? colors.foreground : undefined}
      style={style}
    />
  );
}