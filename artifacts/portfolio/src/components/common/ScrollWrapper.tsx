;

import { useScroll } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

import { usePortalStore, useScrollStore } from "@stores";
import { SCROLL_TIMELINE } from "@constants/scrollTimeline";
import TiltGroup from "./TiltGroup";
import { MOBILE_BREAKPOINT } from "../../hooks/useBreakpoint";

const ScrollWrapper = (props: { children: React.ReactNode | React.ReactNode[]}) => {
  const { camera, size } = useThree();
  const data = useScroll();
  const isActive = usePortalStore((state) => !!state.activePortalId);
  const setScrollProgress = useScrollStore((state) => state.setScrollProgress);
  const lastProgressRef = useRef(-1);

  useEffect(() => {
    const element = data.el;
    let animationFrame = 0;
    const previous = {
      zIndex: element.style.zIndex,
      pointerEvents: element.style.pointerEvents,
      overflow: element.style.overflow,
    };

    // Drei does not update the ScrollControls style prop after mount. Manage
    // the actual outer scroll element here so portal scroll never competes
    // with the landing-page scroll, and restore it without resetting scrollTop.
    element.style.zIndex = isActive ? "-1" : "1";
    element.style.pointerEvents = isActive ? "none" : "auto";
    element.style.overflow = isActive ? "hidden" : "auto";

    const syncOuterScroll = () => {
      animationFrame = 0;
      const scrollableHeight = Math.max(1, element.scrollHeight - element.clientHeight);
      const progress = Math.min(1, Math.max(0, element.scrollTop / scrollableHeight));

      // Nested portal controls can leave Drei's damped outer offset stale.
      // Keep the shared scroll state aligned with the real scrollbar so the
      // camera, door and DOM overlays all recover immediately after closing.
      data.offset = progress;
      data.delta = 0;
      lastProgressRef.current = progress;
      setScrollProgress(progress);
    };

    const handleOuterScroll = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(syncOuterScroll);
    };

    if (!isActive) {
      syncOuterScroll();
      element.addEventListener("scroll", handleOuterScroll, { passive: true });
    }

    return () => {
      element.removeEventListener("scroll", handleOuterScroll);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      element.style.zIndex = previous.zIndex;
      element.style.pointerEvents = previous.pointerEvents;
      element.style.overflow = previous.overflow;
    };
  }, [data, data.el, isActive, setScrollProgress]);

  useFrame((state, delta) => {
    if (data) {
      const isMobile = size.width < MOBILE_BREAKPOINT;
      const scrollableHeight = Math.max(1, data.el.scrollHeight - data.el.clientHeight);
      const p = Math.min(1, Math.max(0, data.el.scrollTop / scrollableHeight));
      data.offset = p;
      data.delta = 0;

      const range = (start: number, length: number) =>
        THREE.MathUtils.clamp((p - start) / length, 0, 1);
      const a = range(
        SCROLL_TIMELINE.cameraRotation.start,
        SCROLL_TIMELINE.cameraRotation.end - SCROLL_TIMELINE.cameraRotation.start,
      );
      // Keep the camera in the cloud field while the window begins opening.
      // This preserves the intended sky-to-door reveal instead of racing past
      // the clouds as soon as the handle animates.
      const b = range(
        SCROLL_TIMELINE.cameraDescent.start,
        SCROLL_TIMELINE.cameraDescent.end - SCROLL_TIMELINE.cameraDescent.start,
      );
      const d = range(0.85, 0.18);

      if (!isActive) {
        const easedA = Math.pow(a, 1.6);
        camera.rotation.x = THREE.MathUtils.damp(camera.rotation.x, -0.5 * Math.PI * easedA, 6, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, -37 * b, 5, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, 5 + 10 * d, 10, delta);

        // Throttle store updates — only write when progress changes by >0.005
        // to avoid triggering React re-renders (Timeline etc.) every frame.
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
