;

import { useScroll } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { usePortalStore, useScrollStore } from "@stores";
import TiltGroup from "./TiltGroup";
import { MOBILE_BREAKPOINT } from "../../hooks/useBreakpoint";

const ScrollWrapper = (props: { children: React.ReactNode | React.ReactNode[]}) => {
  const { camera, size } = useThree();
  const data = useScroll();
  const isActive = usePortalStore((state) => !!state.activePortalId);
  const setScrollProgress = useScrollStore((state) => state.setScrollProgress);
  const lastProgressRef = useRef(-1);

  useFrame((state, delta) => {
    if (data) {
      const isMobile = size.width < MOBILE_BREAKPOINT;
      const a = data.range(0, 0.3);
      const b = data.range(0.3, 0.5);
      const d = data.range(0.85, 0.18);

      if (!isActive) {
        // Ease the rotation curve (a^1.6) so the first 30% of scroll doesn't
        // produce a jarring 90° whip-pan on fast trackpad flicks. Combined
        // with a lower damp rate (3 instead of 5) this smooths the catch-up.
        const easedA = Math.pow(a, 1.6);
        camera.rotation.x = THREE.MathUtils.damp(camera.rotation.x, -0.5 * Math.PI * easedA, 3, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, -37 * b, 7, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, 5 + 10 * d, 7, delta);

        // Throttle store updates — only write when progress changes by >0.005
        // to avoid triggering React re-renders (Timeline etc.) every frame.
        const p = data.range(0, 1);
        if (Math.abs(p - lastProgressRef.current) > 0.005) {
          lastProgressRef.current = p;
          setScrollProgress(p);
        }
      }

      // Move camera slightly on mouse movement.
      if (!isMobile && !isActive) {
        camera.rotation.y = THREE.MathUtils.lerp(camera.rotation.y, -(state.pointer.x * Math.PI) / 90, 0.05);
      }
    }
  });

  const children = Array.isArray(props.children) ? props.children : [props.children];

  return <TiltGroup>
    {children.map((child, index) => {
      return <group key={index}>
        {child}
      </group>
    })}
  </TiltGroup>
}

export default ScrollWrapper;
