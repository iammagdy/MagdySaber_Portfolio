import { Edges, Text, TextProps } from "@react-three/drei";
import { ThreeEvent, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { usePortalStore } from "@stores";
import { Project, ProjectUrl } from "@types";
import { track } from "../../../lib/devkitTracker";

interface ProjectTileProps {
  project: Project;
  index: number;
  position: [number, number, number];
  rotation: [number, number, number];
  activeId: number | null;
  onClick: () => void;
}

const ProjectTile = ({ project, index, position, rotation, activeId, onClick }: ProjectTileProps) => {
  const { size } = useThree();
  const isMobile = size.width < 768;
  const projectRef = useRef<THREE.Group>(null);
  const buttonsGroupRef = useRef<THREE.Group>(null);
  const hoverAnimRef = useRef<gsap.core.Timeline | null>(null);
  const [hovered, setHovered] = useState(false);
  const isProjectSectionActive = usePortalStore((state) => state.activePortalId === "projects");

  const buttons: ProjectUrl[] = useMemo(() => {
    if (project.urls && project.urls.length > 0) return project.urls;
    if (project.url) return [{ text: 'VIEW ↗', url: project.url }];
    return [];
  }, [project.urls, project.url]);

  const buttonXPositions: number[] = useMemo(() => {
    if (buttons.length <= 1) return [0];
    return [-0.7, 0.7];
  }, [buttons.length]);

  const titleProps = useMemo(() => ({
    font: "./soria-font.ttf",
    color: "black",
  }), []);

  const subtitleProps: Partial<TextProps> = useMemo(() => ({
    font: "./Vercetti-Regular.woff",
    color: "black",
    anchorX: "left",
    anchorY: "top",
  }), []);

  useEffect(() => {
    if (!projectRef.current) return;
    hoverAnimRef.current?.kill();

    const [mesh, title, dateGroup, textBox] = projectRef.current.children;

    hoverAnimRef.current = gsap.timeline();
    hoverAnimRef.current
      .to(projectRef.current.position, { z: hovered ? 1 : 0, duration: 0.2 }, 0)
      .to(projectRef.current.position, { y: hovered ? 0.4 : 0 }, 0)
      .to(projectRef.current.scale, {
        x: hovered ? 1.3 : 1,
        y: hovered ? 1.3 : 1,
        z: hovered ? 1.3 : 1,
      }, 0)
      .to(title.position, { y: hovered ? 1.2 : -0.8 }, 0)
      .to(textBox.position, { y: hovered ? 1.2 : 0 }, 0)
      .to(textBox, { fillOpacity: hovered ? 1 : 0, duration: 0.4 }, 0)
      .to(dateGroup.position, { y: hovered ? 2.7 : 1.4 }, 0)
      .to(mesh.scale, { y: hovered ? 2 : 1 }, 0)
      .to((mesh as THREE.Mesh).material, { opacity: hovered ? 0.98 : 0.82 }, 0)
      .to(mesh.position, { y: hovered ? 1 : 0 }, 0);

    if (buttonsGroupRef.current) {
      buttonsGroupRef.current.children.forEach((btn, i) => {
        const isDisabled = !!buttons[i]?.disabled || !buttons[i]?.url;
        hoverAnimRef.current!
          .to(btn.scale, { x: hovered ? 1 : 0, y: hovered ? 1 : 0 }, 0);
        if (!isDisabled) {
          hoverAnimRef.current!
            .to(btn.position, { z: hovered ? 0.3 : -1 }, 0);
        }
      });
    }
  }, [hovered, buttons]);

  // A tile is "expanded" if it's the actively-selected one (click-locked on
  // desktop, tap-selected on mobile) or, on desktop only, when no tile is
  // selected and the pointer is hovering it. The pointer handlers below
  // cooperate with this effect so a clicked tile stays expanded even when
  // the pointer leaves, and another tile being clicked collapses it.
  useEffect(() => {
    if (activeId !== null) {
      setHovered(activeId === index);
    } else if (isMobile) {
      setHovered(false);
    }
  }, [isMobile, activeId, index]);

  useEffect(() => {
    if (projectRef.current) {
      gsap.to(projectRef.current.position, {
        y: isProjectSectionActive ? 0 : -10,
        duration: 1,
        delay: isProjectSectionActive ? index * 0.1 : 0,
      });
    }
  }, [isProjectSectionActive]);

  const handleButtonClick = (button: ProjectUrl) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!button.url || button.disabled) return;
    const btn = e.eventObject;
    gsap.to(btn.position, { z: 0, duration: 0.1 })
      .then(() => gsap.to(btn.position, { z: 0.3, duration: 0.3 }));
    track({ kind: "click", target: `project:${project.title}`, label: button.text });
    setTimeout(() => window.open(button.url, '_blank'), 50);
  };

  return (
    <group
      position={position}
      rotation={rotation}
      onClick={() => {
        track({ kind: "click", target: `project-tile:${project.title}`, label: "select" });
        onClick();
      }}
      onPointerOver={() => {
        if (isMobile || !isProjectSectionActive) return;
        // If a different tile is locked, don't react to hover.
        if (activeId !== null && activeId !== index) return;
        setHovered(true);
      }}
      onPointerOut={() => {
        if (isMobile || !isProjectSectionActive) return;
        // Don't collapse a tile that the visitor explicitly clicked.
        if (activeId === index) return;
        setHovered(false);
      }}>
      <group ref={projectRef}>
        <mesh>
          <planeGeometry args={[4.2, 2, 1]} />
          <meshBasicMaterial color="#FFF" transparent opacity={0.82}/>
          <Edges color="black" lineWidth={1.5} />
        </mesh>
        <Text
          {...titleProps}
          position={[-1.9, -0.8, 0.101]}
          anchorX="left"
          anchorY="bottom"
          maxWidth={4}
          fontSize={0.6}>
          {project.title}
        </Text>
        <group position={[-1.25, 1.4, 0.01]}>
          <mesh>
            <planeGeometry args={[1.7, 0.4, 1]} />
            <meshBasicMaterial color="#777" opacity={0} wireframe />
            <Edges color="black" lineWidth={1} />
          </mesh>
          <Text
            {...subtitleProps}
            position={[-0.7, 0.2, 0]}
            fontSize={0.3}>
            {project.date.toUpperCase()}
          </Text>
        </group>
        <Text
          {...subtitleProps}
          maxWidth={3.7}
          position={[-1.9, 2.3, 0.1]}
          fontSize={0.14}
          lineHeight={1.2}>
          {project.subtext}
        </Text>
        <group ref={buttonsGroupRef}>
          {buttons.map((button, i) => {
            const isDisabled = !!button.disabled || !button.url;
            const x = buttonXPositions[i] ?? 1.3;
            const baseLabel = button.text.replace(/\s*↗\s*$/, '');
            const label = isDisabled ? `${baseLabel} • SOON` : button.text;
            const handleDisabledClick = (e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
            };
            return (
              <group
                key={`${i}-${button.text}`}
                position={[x, -0.78, isDisabled ? 0 : -1]}
                scale={[0, 0, 1]}
                onClick={isDisabled ? handleDisabledClick : handleButtonClick(button)}
                onPointerDown={isDisabled ? handleDisabledClick : undefined}
                onPointerOver={isDisabled ? undefined : () => { document.body.style.cursor = 'pointer'; }}
                onPointerOut={isDisabled ? undefined : () => { document.body.style.cursor = 'auto'; }}>
                <mesh>
                  <boxGeometry args={[1.2, 0.4, 0.2]} />
                  <meshBasicMaterial
                    color={isDisabled ? "#555" : "#222"}
                    transparent
                    opacity={isDisabled ? 0.85 : 1}
                  />
                  <Edges color={isDisabled ? "#ddd" : "white"} lineWidth={1} />
                </mesh>
                <Text
                  {...subtitleProps}
                  anchorX="center"
                  anchorY="middle"
                  color="white"
                  fillOpacity={isDisabled ? 0.9 : 1}
                  position={[0, 0, 0.2]}
                  maxWidth={1.1}
                  fontSize={
                    isDisabled
                      ? 0.15
                      : label.length > 12
                        ? 0.13
                        : label.length > 8
                          ? 0.17
                          : 0.22
                  }>
                  {label}
                </Text>
              </group>
            );
          })}
        </group>
      </group>
    </group>
  );
};

export default ProjectTile;
