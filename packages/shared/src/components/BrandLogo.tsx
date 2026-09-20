import Constants from 'expo-constants';
import {
  Image,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useColors } from '../hooks/useColors';

const passengerMark = require('../assets/dame-pon-mark-passenger-tile.png');
const driverMark = require('../assets/dame-pon-mark-conductor-tile.png');

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
  const showDarkModeEdge = isPassenger && colors.isDark;

  return (
    <View
      accessibilityLabel={`Logo de Dame Pon ${isPassenger ? 'pasajero' : 'conductor'}`}
      style={[
        styles.container,
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: isPassenger ? '#081321' : '#FFFFFF',
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
        source={isPassenger ? passengerMark : driverMark}
        resizeMode="stretch"
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
      />
      {showDarkModeEdge ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderColor: 'rgba(255,255,255,0.15)',
              borderRadius: radius,
              borderWidth: 1,
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