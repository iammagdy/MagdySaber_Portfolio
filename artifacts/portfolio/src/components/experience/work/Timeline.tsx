import { Box, Edges, Line, Text, TextProps } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { usePortalStore, useSettingsStore } from "@stores";
import gsap from "gsap";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { WorkTimelinePoint } from "@types";

const onTextSync = (text: { material?: THREE.Material }) => {
  if (text.material) {
    text.material.depthTest = false;
    text.material.depthWrite = false;
    text.material.transparent = true;
  }
};

const TimelinePoint = ({ point, diff }: { point: WorkTimelinePoint, diff: number }) => {
  const { size } = useThree();
  const isMobile = size.width < 768;

  const textProps: Partial<TextProps> = useMemo(() => ({
    font: "./Vercetti-Regular.woff",
    color: "white",
    anchorX: "center" as const,
    textAlign: "center" as const,
    fillOpacity: 2 - 2 * diff,
    renderOrder: 12,
    onSync: onTextSync,
  }), [diff]);

  const titleProps = useMemo(() => ({
    ...textProps,
    font: "./soria-font.ttf",
    fontSize: 0.34,
    maxWidth: 3.0,
    lineHeight: 1.15,
    overflowWrap: 'break-word' as const,
  }), [textProps]);

  const hasDescription = !!point.description;
  const panelWidth = 3.6;
  const panelHeight = hasDescription ? 3.4 : 2.7;
  const panelCenterY = hasDescription ? -1.35 : -1.0;
  const panelX = point.position === 'left'
    ? -0.3 - panelWidth / 2
    : 0.3 + panelWidth / 2;
  const panelOpacity = Math.min(1, Math.max(0, 2 - 2 * diff)) * 0.85;

  return (
    <group position={point.point} scale={isMobile ? 0.55 : 0.6}>
      <Box
        args={[0.2, 0.2, 0.2]}
        position={[0, 0, -0.1]}
        scale={[1 - diff, 1 - diff, 1 - diff]}
        renderOrder={10}
      >
        <meshBasicMaterial color="white" wireframe depthTest={false} />
        <Edges color="white" lineWidth={1.5} renderOrder={10}>
          <lineBasicMaterial color="white" depthTest={false} />
        </Edges>
      </Box>
      <group position={[panelX, 0, 0]}>
        <mesh position={[0, panelCenterY, -0.15]} renderOrder={11}>
          <planeGeometry args={[panelWidth, panelHeight]} />
          <meshBasicMaterial
            color="#0a0a18"
            transparent
            opacity={panelOpacity}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
        <Text {...textProps} fontSize={0.28} position={[0, -0.05, 0]}>
          {point.year}
        </Text>
        <Text {...titleProps} position={[0, -1.05 - diff / 2, 0]}>
          {point.title}
        </Text>
        <Text {...textProps} fontSize={0.2} maxWidth={3.0} position={[0, -2.15 - diff * 0.1, 0]}>
          {point.subtitle}
        </Text>
        {point.description && (
          <Text {...textProps} fontSize={0.18} maxWidth={3.0} lineHeight={1.3} textAlign="center" position={[0, -2.75 - diff * 0.1, 0]}>
            {point.description}
          </Text>
        )}
      </group>
    </group>
  );
};

const Timeline = ({ progress }: { progress: number }) => {
  const { camera, size } = useThree();
  const isMobile = size.width < 768;
  const isActive = usePortalStore((state) => state.activePortalId === 'work');
  const workTimeline = useSettingsStore((s) => s.workTimeline);
  const educationTimeline = useSettingsStore((s) => s.educationTimeline);
  const timeline = useMemo(() => [...workTimeline, ...educationTimeline], [workTimeline, educationTimeline]);
  const educationStartIndex = workTimeline.length;
  const educationMarkerZ = workTimeline.length > 0 && educationTimeline.length > 0
    ? (workTimeline[workTimeline.length - 1].point.z + educationTimeline[0].point.z) / 2
    : 0;

  const curve = useMemo(() => new THREE.CatmullRomCurve3(timeline.map(p => p.point), false), [timeline]);
  const curvePoints = useMemo(() => curve.getPoints(200), [curve]);
  const visibleCurvePoints = useMemo(() => curvePoints.slice(0, Math.max(1, Math.ceil(progress * curvePoints.length))), [curvePoints, progress]);
  const activeIndex = progress * (timeline.length - 1);
  const visibleTimelinePoints = useMemo(() => {
    const windowRadius = 1.2;
    return timeline
      .map((point, i) => ({ point, i }))
      .filter(({ i }) => i <= activeIndex + 0.05 && Math.abs(i - activeIndex) <= windowRadius);
  }, [timeline, activeIndex]);

  const [visibleDashedCurvePoints, setVisibleDashedCurvePoints] = useState<THREE.Vector3[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useFrame((_, delta) => {
    if (isActive) {
      const position = curve.getPoint(progress);
      camera.position.x = THREE.MathUtils.damp(camera.position.x, (isMobile ? 0 : -2) + position.x, 4, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, (isMobile ? -36 : -39) + position.z, 4, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, 6 - position.y, 4, delta);
    }
  });

  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const tl = gsap.timeline();
    if (groupRef.current) {
      tl.to(groupRef.current.scale, {
        x: isActive ? 1 : 0,
        y: isActive ? 1 : 0,
        z: isActive ? 1 : 0,
        duration: 1,
        delay: isActive ? 0.4 : 0,
      });
      tl.to(groupRef.current.position, {
        y: isActive ? 0 : -2,
        duration: 1,
        delay: isActive ? 0.4 : 0,
      }, 0);
    }

    if (isActive) {
      let i = 0;
      clearInterval(intervalRef.current!);
      setTimeout(() => {
        intervalRef.current = setInterval(() => {
          const p = i++ / 100;
          setVisibleDashedCurvePoints(curvePoints.slice(0, Math.max(1, Math.ceil(p * curvePoints.length))));
          if (i > 100 && intervalRef.current) clearInterval(intervalRef.current);
        }, 10);
      }, 1000);
    } else {
      setVisibleDashedCurvePoints([]);
      clearInterval(intervalRef.current!);
    }

    return () => clearInterval(intervalRef.current!);
  }, [isActive]);

  return (
    <group position={[0, -0.1, -0.1]}>
      <Line
        points={visibleCurvePoints}
        color="white"
        lineWidth={3}
        depthTest={false}
        renderOrder={9}
      />
      {visibleDashedCurvePoints.length > 0 && (
        <Line
          points={visibleDashedCurvePoints}
          color="white"
          lineWidth={0.5}
          dashed
          dashSize={0.25}
          gapSize={0.25}
          depthTest={false}
          renderOrder={9}
        />
      )}
      <group ref={groupRef}>
        {visibleTimelinePoints.map(({ point, i }) => {
          const diff = Math.min(Math.abs(i - activeIndex), 1);
          return <TimelinePoint point={point} key={i} diff={diff} />;
        })}
        {activeIndex >= educationStartIndex - 1.5 && (() => {
          const markerOpacity = Math.min(
            1,
            Math.max(0, 1 - Math.abs(activeIndex - (educationStartIndex - 0.5)) * 0.9),
          );
          return (
            <group position={[0, 0.7, educationMarkerZ]}>
              <Line
                points={[
                  new THREE.Vector3(-2.4, 0.85, 0),
                  new THREE.Vector3(2.4, 0.85, 0),
                ]}
                color="white"
                lineWidth={1.2}
                transparent
                opacity={markerOpacity * 0.7}
                depthTest={false}
                depthWrite={false}
                renderOrder={11}
              />
              <Text
                font="./soria-font.ttf"
                color="white"
                anchorX="center"
                anchorY="middle"
                textAlign="center"
                fontSize={1.0}
                letterSpacing={0.18}
                position={[0, 0, 0]}
                renderOrder={12}
                onSync={onTextSync}
                fillOpacity={markerOpacity}
              >
                EDUCATION
              </Text>
              <Line
                points={[
                  new THREE.Vector3(-2.4, -0.75, 0),
                  new THREE.Vector3(2.4, -0.75, 0),
                ]}
                color="white"
                lineWidth={1.2}
                transparent
                opacity={markerOpacity * 0.7}
                depthTest={false}
                depthWrite={false}
                renderOrder={11}
              />
            </group>
          );
        })()}
      </group>
    </group>
  );
};

export default Timeline;
