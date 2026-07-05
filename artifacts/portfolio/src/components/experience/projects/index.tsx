import { useScroll, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { usePortalStore } from "@stores";
import { Wanderer } from "../../models/Wanderer";
import ProjectsCarousel from "./ProjectsCarousel";
import { MOBILE_BREAKPOINT } from "../../../hooks/useBreakpoint";

const WandererTile = () => {
  const texture = useTexture('/images/wanderer-tile.png');
  return (
    <mesh position={[0, 0, 0.01]}>
      <planeGeometry args={[3.0, 3.0]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
};

const Projects = () => {
  const { camera, size } = useThree();
  const isMobile = size.width < MOBILE_BREAKPOINT;
  const isActive = usePortalStore((state) => state.activePortalId === "projects");
  const data = useScroll();
  const [showModel, setShowModel] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isActive) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setShowModel(true);
    } else if (showModel) {
      timerRef.current = setTimeout(() => setShowModel(false), 1200);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isActive]);

  useEffect(() => {
    // Hide scrollbar when active.
    data.el.style.overflow = isActive ? 'hidden' : 'auto';
    if (isActive) {
      gsap.killTweensOf(camera.position);
      gsap.killTweensOf(camera.rotation);
      if (isMobile) {
        gsap.to(camera.position, { z: 11.5, y: -39, x: 0, duration: 1 });
      } else {
        gsap.to(camera.position, { y: -39, x: 2, duration: 1 });
      }
    }
  }, [isActive]);

  useFrame((state, delta) => {
    if (isActive) {
      if (!isMobile) {
        camera.rotation.y = THREE.MathUtils.lerp(camera.rotation.y, -(state.pointer.x * Math.PI) / 4, 0.03);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, 11.5 - state.pointer.y, 7, delta);
      }
    }
  });

  return (
    <group>
      {isMobile ? (
        <WandererTile />
      ) : (
        <>
          {showModel ? (
            <Suspense fallback={null}>
              <Wanderer
                rotation={new THREE.Euler(0, Math.PI / 6, 0)}
                scale={new THREE.Vector3(1.5, 1.5, 1.5)}
                position={new THREE.Vector3(0, -1, -1)}
              />
            </Suspense>
          ) : (
            <Suspense fallback={null}>
              <WandererTile />
            </Suspense>
          )}
          <ProjectsCarousel />
        </>
      )}
    </group>
  );
};

export default Projects;
