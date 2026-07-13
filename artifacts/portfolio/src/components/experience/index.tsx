import { Text, useScroll } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { usePortalStore } from "@stores";
import { useRef } from "react";
import * as THREE from 'three';
import GridTile from "./GridTile";
import Projects from "./projects";
import Work from "./work";
import { MOBILE_BREAKPOINT } from "../../hooks/useBreakpoint";

const Experience = () => {
  const { size } = useThree();
  const isMobile = size.width < MOBILE_BREAKPOINT;
  const titleRef = useRef<THREE.Group>(null);
  const groupRef = useRef<THREE.Group>(null);
  const data = useScroll();
  const isActive = usePortalStore((state) => !!state.activePortalId);

  const fontProps = {
    font: "./soria-font.ttf",
    fontSize: 0.4,
    color: 'white',
  };

  useFrame((sate, delta) => {
    const d = data.range(0.8, 0.2);
    const e = data.range(0.7, 0.2);

    if (groupRef.current && !isActive) {
      groupRef.current.position.y = d > 0 ? (isMobile ? -2.5 : -1) : -30;
      groupRef.current.visible = d > 0;
    }

    if (titleRef.current) {
      titleRef.current.children.forEach((text, i) => {
        const y =  Math.max(Math.min((1 - d) * (10 - i), 10), 0.5);
        text.position.y = THREE.MathUtils.damp(text.position.y, y, 7, delta);
        /* eslint-disable  @typescript-eslint/no-explicit-any */
        (text as any).fillOpacity = e;
      });
    }
  });

  const getTitle = () => {
    const title = 'experience'.toUpperCase();
    return title.split('').map((char, i) => {
      const diff = isMobile ? 0.4 : 0.8;
      return (
        <Text key={i} {...fontProps} position={[i * diff, 2, 1]}>{char}</Text>
      );
    });
  };

  return (
    <group position={[0, -41.5, 5]} rotation={[-Math.PI / 2, 0 ,-Math.PI / 2]} scale={isMobile ? 0.63 : 1}>
      <group rotation={[0, 0, Math.PI / 2]}>
        <group ref={titleRef} position={[isMobile ? -1.8 : -3.6, 2, -2]}>
          {getTitle()}
        </group>

        <group position={[0, -1, 0]} ref={groupRef}>
          <GridTile title='WORK AND EDUCATION'
            id="work"
            color='#b9c6d6'
            textAlign='left'
            position={new THREE.Vector3(isMobile ? 0 : -2, isMobile ? -0.9 : 0, 0)}>
            <Work/>
          </GridTile>
          <GridTile title='SIDE PROJECTS'
            id="projects"
            color='#bdd1e3'
            textAlign='right'
            position={new THREE.Vector3(isMobile ? 0 : 2, isMobile ? 0.9 : 0, 0)}>
            <Projects/>
          </GridTile>
        </group>
      </group>
    </group>
  );
};

export default Experience;
