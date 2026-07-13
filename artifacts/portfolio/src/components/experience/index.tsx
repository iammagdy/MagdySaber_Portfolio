import { useScroll } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { usePortalStore } from "@stores";
import { useRef } from "react";
import * as THREE from 'three';
import GridTile from "./GridTile";
import Projects from "./projects";
import Work from "./work";
import { MOBILE_BREAKPOINT } from "../../hooks/useBreakpoint";

const Experience = () => {
  const { camera, size } = useThree();
  const isMobile = size.width < MOBILE_BREAKPOINT;
  const experienceRef = useRef<THREE.Group>(null);
  const groupRef = useRef<THREE.Group>(null);
  const data = useScroll();
  const isActive = usePortalStore((state) => !!state.activePortalId);

  useFrame((_, delta) => {
    const d = data.range(0.8, 0.2);

    // The camera moves back for the contact continuation near the end of the
    // scroll. Keep the experience panels with it so their previews remain in
    // view instead of slipping behind the visitor.
    if (experienceRef.current && d > 0) {
      experienceRef.current.position.z = THREE.MathUtils.damp(
        experienceRef.current.position.z,
        camera.position.z,
        8,
        delta,
      );

      // Preserve both panels as the contact content enters, while reducing
      // their footprint enough to create a clear reading area underneath.
      const contactProgress = data.range(0.9, 0.1);
      const baseScale = isMobile ? 0.63 : 1;
      const targetScale = baseScale * THREE.MathUtils.lerp(1, 0.55, contactProgress);
      const nextScale = THREE.MathUtils.damp(
        experienceRef.current.scale.x,
        targetScale,
        8,
        delta,
      );
      experienceRef.current.scale.setScalar(nextScale);
    }

    if (groupRef.current && !isActive) {
      groupRef.current.position.y = d > 0 ? (isMobile ? -2.5 : -1) : -30;
      groupRef.current.visible = d > 0;
    }

  });

  return (
    <group ref={experienceRef} position={[0, -41.5, 5]} rotation={[-Math.PI / 2, 0 ,-Math.PI / 2]} scale={isMobile ? 0.63 : 1}>
      <group rotation={[0, 0, Math.PI / 2]}>
        <group position={[0, -1, 0]} ref={groupRef}>
          <GridTile title='WORK AND EDUCATION'
            id="work"
            color='#b9c6d6'
            textAlign='left'
            position={new THREE.Vector3(isMobile ? 0 : -2.15, isMobile ? -0.9 : 0, 0)}>
            <Work/>
          </GridTile>
          <GridTile title='SIDE PROJECTS'
            id="projects"
            color='#bdd1e3'
            textAlign='right'
            position={new THREE.Vector3(isMobile ? 0 : 2.15, isMobile ? 0.9 : 0, 0)}>
            <Projects/>
          </GridTile>
        </group>
      </group>
    </group>
  );
};

export default Experience;
