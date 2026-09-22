import Constants from 'expo-constants';
import {
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useEffect } from 'react';
import { useColors } from '../hooks/useColors';

const lightMark = require('../assets/dame-pon-mark-navy.png');
const darkMark = require('../assets/dame-pon-mark-white.png');

export type BrandLogoRole = 'pasajero' | 'conductor';

const LOGO_RADIUS_RATIO = 0.22;

export function BrandLogo({
  role: requestedRole,
  size = 128,
  style,
}: {
  role?: BrandLogoRole;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const configuredRole =
    Constants.expoConfig?.extra?.damePonRole ??
    process.env.EXPO_PUBLIC_DAME_PON_ROLE;
  const role: BrandLogoRole =
    requestedRole ?? (configuredRole === 'conductor' ? 'conductor' : 'pasajero');
  const flattenedStyle = StyleSheet.flatten(style) ?? {};
  const width = typeof flattenedStyle.width === 'number' ? flattenedStyle.width : size;
  const height = typeof flattenedStyle.height === 'number' ? flattenedStyle.height : size;
  const radius = Math.round(Math.min(width, height) * LOGO_RADIUS_RATIO);
  const isPassenger = role === 'pasajero';
  const showDarkModeEdge = colors.isDark;
  const logoSource = colors.isDark ? darkMark : lightMark;
  const imageApi = Image as typeof Image & {
    resolveAssetSource?: (source: unknown) => unknown;
  };
  const resolvedLogoSource = imageApi.resolveAssetSource?.(logoSource) ?? logoSource;

  useEffect(() => {
    console.info('[Dame Pon] BrandLogo asset resolved', {
      role,
      isDark: colors.isDark,
      source: (resolvedLogoSource as { uri?: string })?.uri ?? resolvedLogoSource,
    });
  }, [colors.isDark, resolvedLogoSource, role]);

  return (
    <View
      accessibilityLabel={`Logo de Dame Pon ${isPassenger ? 'pasajero' : 'conductor'}`}
      style={[
        styles.container,
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.background,
          borderColor: showDarkModeEdge
            ? 'rgba(255,255,255,0.15)'
            : 'transparent',
          borderWidth: showDarkModeEdge ? 1 : 0,
        },
        style,
        { borderRadius: radius },
      ]}
    >
      <Image
        accessible={false}
        source={logoSource}
        onError={(event) => {
          console.error('[Dame Pon] BrandLogo asset failed to load', {
            role,
            isDark: colors.isDark,
            source: (resolvedLogoSource as { uri?: string })?.uri ?? resolvedLogoSource,
            error: event.nativeEvent.error,
          });
        }}
        resizeMode="contain"
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
      />
      {showDarkModeEdge ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderColor: 'rgba(255,255,255,0.15)',
              borderRadius: radius,
              borderWidth: 1,
              pointerEvents: 'none',
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
});