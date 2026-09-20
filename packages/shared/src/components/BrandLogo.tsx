import { Image, type ImageStyle, type StyleProp } from 'react-native';

const passengerLogo = require('../assets/dame-pon-logo-passenger.png');
const driverLogo = require('../assets/dame-pon-logo-driver.png');

export function BrandLogo({ style }: { style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      accessibilityLabel="Logo de Dame Pon"
      source={process.env.EXPO_PUBLIC_DAME_PON_ROLE === 'conductor' ? driverLogo : passengerLogo}
      resizeMode="contain"
      style={style}
    />
  );
}