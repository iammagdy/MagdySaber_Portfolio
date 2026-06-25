import { ScrollControls, useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { usePortalStore, useScrollStore } from "@stores";
import { Suspense, useEffect } from "react";
import * as THREE from "three";
import { Memory } from "../../models/Memory";
import Timeline from "./Timeline";
import { MOBILE_BREAKPOINT } from "../../../hooks/useBreakpoint";
import { useScrollNear } from "../../../hooks/useScrollNear";

const MemoryTile = () => {
  const texture = useTexture('/images/memory-tile.png');
  return (
    <mesh position={[0, 0, 0.01]}>
      <planeGeometry args={[3.0, 2.05]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
};

const Work = () => {
  const { size } = useThree();
  const isMobile = size.width < MOBILE_BREAKPOINT;
  const isActive = usePortalStore((state) => state.activePortalId === 'work');
  const { scrollProgress, setScrollProgress } = useScrollStore();
  // Defer the Dali GLB until the visitor has scrolled near the experience
  // section, or the portal has been opened.
  const inRange = useScrollNear(0.4);
  const shouldRenderModel = inRange || isActive;

  const handleScroll = (event: Event) => {
    const target = event.target as HTMLElement;
    const scrollTop = target.scrollTop;
    const scrollHeight = target.scrollHeight - target.clientHeight;
    const progress = Math.min(Math.max(scrollTop / scrollHeight, 0), 1);
    setScrollProgress(progress);
  }

  // Hack: If the portal is active, add the scroll event listener to the scroll
  // wrapper div. If the portal is not active, remove the scroll event listener.
  // ScrollControls doesn't work out of the box, so we have to manually handle
  // the scroll event.
  useEffect(() => {
    // On mobile we use the DOM <MobileWorkOverlay/> instead of the 3D
    // ScrollControls timeline, so this z-index swap hack must be skipped —
    // the target divs don't exist and addEventListener would throw.
    if (isMobile) return;
    if (isActive) {
      const scrollWrapper = document.querySelector('div[style*="z-index: -1"]') as HTMLElement | null;
      const originalScrollWrapper = document.querySelector('div[style*="z-index: 1"]') as HTMLElement | null;
      if (!scrollWrapper || !originalScrollWrapper) return;
      setScrollProgress(0);
      scrollWrapper.addEventListener('scroll', handleScroll)
      scrollWrapper.style.zIndex = '1';
      originalScrollWrapper.style.zIndex = '-1';
    } else {
      const scrollWrapper = document.querySelector('div[style*="z-index: 1"]') as HTMLElement | null;
      const originalScrollWrapper = document.querySelector('div[style*="z-index: -1"]') as HTMLElement | null;

      if (scrollWrapper && originalScrollWrapper) {
        scrollWrapper.scrollTo({ top: 0, behavior: 'smooth' });
        setScrollProgress(0);
        scrollWrapper.removeEventListener('scroll', handleScroll);
        scrollWrapper.style.zIndex = '-1';
        originalScrollWrapper.style.zIndex = '1';
      }
    }
  }, [isActive, isMobile]);

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
      ) : (
        <ScrollControls style={{ zIndex: -1}} pages={7} maxSpeed={0.25}>
          {shouldRenderModel ? (
            <Suspense fallback={null}>
              <Memory scale={new THREE.Vector3(5, 5, 5)} position={new THREE.Vector3(0, -6, 1)}/>
            </Suspense>
          ) : (
            <Suspense fallback={null}>
              <MemoryTile />
            </Suspense>
          )}
          <Timeline progress={isActive ? scrollProgress : 0} />
        </ScrollControls>
      )}
    </group>
  );
};

export default Work;