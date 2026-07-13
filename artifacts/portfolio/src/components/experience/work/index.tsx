import { ScrollControls, useScroll, useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { usePortalStore } from "@stores";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Memory } from "../../models/Memory";
import Timeline from "./Timeline";
import { MOBILE_BREAKPOINT } from "../../../hooks/useBreakpoint";

const MemoryTile = () => {
  const texture = useTexture('/images/memory-tile.png');

  useEffect(() => {
    const image = texture.image as { width?: number; height?: number } | undefined;
    if (!image?.width || !image.height) return;

    const aspect = image.width / image.height;
    const repeatX = Math.min(1, 1 / aspect);
    const repeatY = Math.min(1, aspect);
    texture.repeat.set(repeatX, repeatY);
    texture.offset.set((1 - repeatX) / 2, (1 - repeatY) / 2);
    texture.needsUpdate = true;
  }, [texture]);

  return (
    <mesh position={[0, 0, 0.01]}>
      <planeGeometry args={[4, 4]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
};

useTexture.preload('/images/memory-tile.png');

const WorkTimeline = () => {
  const data = useScroll();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const element = data.el;
    let animationFrame = 0;

    const syncProgress = () => {
      animationFrame = 0;
      const scrollableHeight = Math.max(1, element.scrollHeight - element.clientHeight);
      setProgress(Math.min(1, Math.max(0, element.scrollTop / scrollableHeight)));
    };

    const handleScroll = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(syncProgress);
    };

    syncProgress();
    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", handleScroll);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [data.el]);

  return <Timeline progress={progress} />;
};

const Work = () => {
  const { size } = useThree();
  const isMobile = size.width < MOBILE_BREAKPOINT;
  const isActive = usePortalStore((state) => state.activePortalId === 'work');
  const [showModel, setShowModel] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isActive) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setShowModel(true);
    } else {
      timerRef.current = setTimeout(() => setShowModel(false), 1200);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isActive]);

  return (
    <group>
      <mesh receiveShadow>
        <planeGeometry args={[4, 4, 1]} />
        <shadowMaterial opacity={0.1} />
      </mesh>
      {isMobile ? (
        // On mobile: show preview tile when inactive; when active the
        // <MobileWorkOverlay/> DOM component takes over with a clean,
        // fully-visible vertical timeline (no 3D camera flight, no
        // windowed rendering, no fade-out). This avoids the
        // "cards disappear while scrolling" issue on small screens.
        !isActive ? <MemoryTile /> : null
      ) : isActive ? (
        <ScrollControls style={{ zIndex: 2 }} pages={7} damping={0.18} maxSpeed={1}>
          {showModel ? (
            <Suspense fallback={null}>
              <Memory scale={new THREE.Vector3(5, 5, 5)} position={new THREE.Vector3(0, -6, 1)} />
            </Suspense>
          ) : (
            <Suspense fallback={null}>
              <MemoryTile />
            </Suspense>
          )}
          <WorkTimeline />
        </ScrollControls>
      ) : (
        <Suspense fallback={null}>
          <MemoryTile />
        </Suspense>
      )}
    </group>
  );
};

export default Work;
