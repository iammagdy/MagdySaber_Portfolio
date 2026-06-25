import { useGSAP } from "@gsap/react";
import { AdaptiveDpr, Environment, ScrollControls, useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import gsap from "gsap";
import { Suspense, useEffect, useRef, useState } from "react";

import { useThemeStore } from "@stores";
import { SMALL_BREAKPOINT, TABLET_BREAKPOINT } from "../../hooks/useBreakpoint";

import PortalCloseButton from "./PortalCloseButton";
import Preloader from "./Preloader";
import ProgressLoader from "./ProgressLoader";
import { ScrollHint } from "./ScrollHint";
import SectionIndicator from "./SectionIndicator";
import ThemeSwitcher from "./ThemeSwitcher";

const getResponsiveBorder = (width: number) => {
  if (width < SMALL_BREAKPOINT) return { inset: 0, width: "100%", height: "100%" };
  if (width < TABLET_BREAKPOINT)
    return { inset: "0.5rem", width: "calc(100% - 1rem)", height: "calc(100% - 1rem)" };
  return { inset: "1rem", width: "calc(100% - 2rem)", height: "calc(100% - 2rem)" };
};

const NOISE_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'%3E%3Cfilter id='a'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23a)'/%3E%3C/svg%3E\")";

const CanvasLoader = (props: { children: React.ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundColor = useThemeStore((state) => state.theme.color);
  const { progress } = useProgress();
  const [canvasStyle, setCanvasStyle] = useState<React.CSSProperties>(() => ({
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    opacity: 0,
    overflow: "hidden",
    ...getResponsiveBorder(typeof window !== "undefined" ? window.innerWidth : 1280),
  }));

  useEffect(() => {
    const handleResize = () => {
      setCanvasStyle((prev) => ({ ...prev, ...getResponsiveBorder(window.innerWidth) }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useGSAP(() => {
    if (progress === 100) {
      gsap.to('.base-canvas', { opacity: 1, duration: 3, delay: 1 });
      gsap.to('.grain-overlay', { opacity: 0.18, duration: 3, delay: 1.4 });
    }
  }, [progress]);

  useGSAP(() => {
    gsap.to(ref.current, {
      backgroundColor: backgroundColor,
      duration: 1,
    });
    gsap.to(canvasRef.current, {
      backgroundColor: backgroundColor,
      duration: 1,
    });
  }, [backgroundColor]);

  return (
    <div className="h-[100dvh] wrapper relative">
      <div className="h-[100dvh] relative" ref={ref}>
        <Canvas className="base-canvas"
          shadows="soft"
          style={canvasStyle}
          ref={canvasRef}
          gl={{ antialias: true, toneMappingExposure: 1.05 }}
          dpr={[1, 1.5]}>
          <Suspense fallback={null}>
            {/* Soft IBL for the window's physical material. */}
            <Environment preset="sunset" environmentIntensity={0.45} background={false} />
            <ambientLight intensity={0.55} />
            <directionalLight position={[-6, 4, 8]} intensity={0.35} color={'#cfe6ff'} />

            <ScrollControls pages={4} damping={0.25} maxSpeed={1} distance={1} style={{ zIndex: 1 }}>
              {props.children}
              <Preloader />
            </ScrollControls>
          </Suspense>
          <AdaptiveDpr pixelated/>
        </Canvas>
        <div
          aria-hidden="true"
          className="grain-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: 0,
            mixBlendMode: 'overlay',
            backgroundImage: NOISE_SVG,
            backgroundRepeat: 'repeat',
            backgroundSize: '180px',
            zIndex: 2,
          }}
        />
        <ProgressLoader progress={progress} />
      </div>
      <ThemeSwitcher />
      <ScrollHint />
      <SectionIndicator />
      <PortalCloseButton />
    </div>
  );
};

export default CanvasLoader;
