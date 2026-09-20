import Constants from 'expo-constants';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

const passengerLogo = require('../assets/dame-pon-logo-passenger.png');
const driverLogo = require('../assets/dame-pon-logo-driver.png');

export function BrandLogo({ style }: { style?: StyleProp<ImageStyle> }) {
  const role = Constants.expoConfig?.extra?.damePonRole ?? process.env.EXPO_PUBLIC_DAME_PON_ROLE;
  return (
    <Image
      accessibilityLabel="Logo de Dame Pon"
      source={role === 'conductor' ? driverLogo : passengerLogo}
      resizeMode="contain"
      style={style}
    />
  );
}