import { useGSAP } from "@gsap/react";
import { AdaptiveDpr, Environment, ScrollControls, useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import gsap from "gsap";
import { Suspense, useEffect, useRef, useState } from "react";

import { useThemeStore } from "@stores";
import { SMALL_BREAKPOINT, TABLET_BREAKPOINT } from "../../hooks/useBreakpoint";

import PortalCloseButton from "./PortalCloseButton";
import Preloader from "./Preloader";
import ProgressLoader, { ProgressFrame } from "./ProgressLoader";
import { ScrollHint } from "./ScrollHint";
import SectionIndicator from "./SectionIndicator";

const getCanvasBounds = (width: number) => {
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
  const loaderStartedAt = useRef(Date.now());
  const [loaderPhase, setLoaderPhase] = useState<"visible" | "fading" | "hidden">("visible");
  const [canvasStyle, setCanvasStyle] = useState<React.CSSProperties>(() => ({
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    opacity: 0,
    overflow: "hidden",
    ...getCanvasBounds(typeof window !== "undefined" ? window.innerWidth : 1280),
  }));

  useEffect(() => {
    const handleResize = () => {
      setCanvasStyle((prev) => ({ ...prev, ...getCanvasBounds(window.innerWidth) }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (progress < 100) return;

    // Keep the signature frame visible even when assets are cached, then
    // remove it completely so it cannot create a permanent border/scroll area.
    const minimumVisibleMs = 650;
    const fadeMs = 450;
    const fadeDelay = Math.max(0, minimumVisibleMs - (Date.now() - loaderStartedAt.current));
    const fadeTimer = window.setTimeout(() => setLoaderPhase("fading"), fadeDelay);
    const hideTimer = window.setTimeout(() => setLoaderPhase("hidden"), fadeDelay + fadeMs);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [progress]);

  useGSAP(() => {
    if (progress === 100) {
      gsap.to('.base-canvas', { opacity: 1, duration: 0.9, ease: "power2.out" });
      gsap.to('.grain-overlay', { opacity: 0.18, duration: 1, delay: 0.15 });
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
          style={canvasStyle}
          ref={canvasRef}
          gl={{ antialias: true, toneMappingExposure: 1.05 }}
          dpr={1}>
          <Suspense fallback={null}>
            <color attach="background" args={[backgroundColor]} />
            {/* Soft IBL for the window's physical material. */}
            <Environment preset="sunset" resolution={64} environmentIntensity={0.45} background={false} />
            <ambientLight intensity={0.55} />
            <directionalLight position={[-6, 4, 8]} intensity={0.35} color={'#cfe6ff'} />

            <ScrollControls
              pages={4}
              damping={0.22}
              maxSpeed={1}
              distance={1}
              style={{ zIndex: 1 }}
            >
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
        <ProgressFrame progress={progress} />
        <ProgressLoader progress={progress} phase={loaderPhase} />
      </div>
      <ScrollHint />
      <SectionIndicator />
      <PortalCloseButton />
    </div>
  );
};

export default CanvasLoader;
