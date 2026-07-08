
import { useThemeStore } from '@stores';
import { Stars } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { MOBILE_BREAKPOINT } from "../../hooks/useBreakpoint";

const StarsContainer = () => {
  const isDarkTheme = useThemeStore((state) => state.theme.type === 'dark');
  const { size } = useThree();
  const isMobile = size.width < MOBILE_BREAKPOINT;

  if (!isDarkTheme) return null;

  return (
    <Stars radius={200} depth={100} count={isMobile ? 1500 : 3000} factor={10} saturation={10} fade={true} speed={1} />
  );
};

export default StarsContainer;