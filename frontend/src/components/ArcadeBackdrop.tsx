import { Image } from "expo-image";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { arcadeArt, arcadeColors } from "@/src/theme/arcade";

type Props = {
  scene?: "setup" | "gameplay";
  intensity?: number;
};

export function ArcadeBackdrop({ scene = "setup", intensity = 0.48 }: Props) {
  const { width, height } = useWindowDimensions();
  const position = scene === "setup" && width < height ? "left" : "center";
  return (
    <View pointerEvents="none" accessible={false} style={styles.backdrop}>
      <Image
        source={arcadeArt[scene]}
        contentFit="cover"
        contentPosition={position}
        style={[StyleSheet.absoluteFillObject, { opacity: intensity }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: arcadeColors.ink },
});
