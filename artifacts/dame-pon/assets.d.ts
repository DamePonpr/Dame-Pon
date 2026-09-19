import type { ImageSourcePropType } from "react-native";

declare module "*.png" {
  const source: ImageSourcePropType;
  export default source;
}

declare module "*.jpg" {
  const source: ImageSourcePropType;
  export default source;
}