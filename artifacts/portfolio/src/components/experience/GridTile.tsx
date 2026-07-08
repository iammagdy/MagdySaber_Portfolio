
import { Edges, MeshPortalMaterial, Text, TextProps, useScroll } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { usePortalStore } from '@stores';
import gsap from "gsap";
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { MOBILE_BREAKPOINT } from '../../hooks/useBreakpoint';

interface GridTileProps {
  id: string;
  title: string;
  textAlign: TextProps['textAlign'];
  children: React.ReactNode;
  color: string;
  position: THREE.Vector3;
}

// TODO: Rename this
const GridTile = (props: GridTileProps) => {
  const titleRef = useRef<THREE.Group>(null);
  const gridRef = useRef<THREE.Group>(null);
  const hoverBoxRef = useRef<THREE.Mesh>(null);
  const portalRef = useRef(null);
  const { title, textAlign, children, color, position, id } = props;
  const { camera, size, gl } = useThree();
  const isMobile = size.width < MOBILE_BREAKPOINT;
  // Scale portal FBO with the device pixel ratio so retina displays get
  // crisp portal scenes; capped (1024 mobile / 2048 desktop) to keep
  // per-frame fill-rate and memory in check.
  const portalResolution = useMemo(() => {
    const dpr = typeof gl?.getPixelRatio === 'function' ? gl.getPixelRatio() : 1;
    const base = isMobile ? 512 : 1024;
    const cap = isMobile ? 1024 : 2048;
    return Math.min(cap, Math.round(base * Math.max(1, dpr)));
  }, [gl, isMobile]);
  const setActivePortal = usePortalStore((state) => state.setActivePortal);
  const isActive = usePortalStore((state) => state.activePortalId === id);
  const activePortalId = usePortalStore((state) => state.activePortalId);
  const data = useScroll();

  useEffect(() => {
    // Handle the hover box and title animation for mobile.
    if (isMobile && titleRef.current) {
      const isWork = id === 'work';
      gsap.to(titleRef.current, {
        fontSize: 0.18,
        maxWidth: 2.2,
        color: '#FFF',
        letterSpacing: 0.05,
        textAlign: 'center',
      });
      gsap.to(titleRef.current.position, {
        x: 0,
        y: isWork ? -0.92 : 0.82,
        duration: 0.5,
      });
    }
  }, [isMobile]);

  // Defer mounting the portal scene until the visitor approaches the
  // experience section. MeshPortalMaterial renders its children into an
  // FBO every frame, so without this gate both portal scenes (Work +
  // Projects) were rendered off-screen during the entire hero scroll,
  // causing lag before the window/door even appeared.
  const [portalReady, setPortalReady] = useState(false);
  const portalReadyRef = useRef(false);

  useFrame(() => {
    const d = data.range(0.95, 0.05);
    if (isMobile && titleRef.current) {
      /* eslint-disable  @typescript-eslint/no-explicit-any */
      (titleRef.current as any).fillOpacity = d;
    }
    if (!portalReadyRef.current && data.offset > 0.55) {
      portalReadyRef.current = true;
      setPortalReady(true);
    }
  });

  const portalInto = (e: React.MouseEvent) => {
    if (isActive || activePortalId) return;
    e.stopPropagation();
    setActivePortal(id);
  };

  // Portal entry/exit driven by store state so click, Esc, and the
  // PortalCloseButton all share one code path.
  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (isActive) {
      wasActiveRef.current = true;
      document.body.style.cursor = 'auto';
      gsap.to(portalRef.current, { blend: 1, duration: 0.5 });
      return;
    }
    if (!wasActiveRef.current) return;
    wasActiveRef.current = false;
    if (portalRef.current) {
      gsap.killTweensOf(camera.position);
      gsap.killTweensOf(camera.rotation);
      gsap.to(camera.position, { x: 0, duration: 0.8 });
      gsap.to(portalRef.current, { blend: 0, duration: 1 });
    }
  }, [isActive, camera]);

  const fontProps: Partial<TextProps> = {
    font: "./soria-font.ttf",
    maxWidth: 2,
    anchorX: 'center',
    anchorY: 'bottom',
    fontSize: 0.7,
    color: 'white',
    textAlign: isMobile ? 'center' : textAlign,
    fillOpacity: 0,
  };

  const onPointerOver = () => {
    if (isActive || isMobile) return;
    document.body.style.cursor = 'pointer';
    gsap.to(titleRef.current, {
      fillOpacity: 1
    });
    if (gridRef.current && hoverBoxRef.current) {
      gsap.to(gridRef.current.position, { z: 0.5, duration: 0.4});
      gsap.to(hoverBoxRef.current.scale, { x: 1, y: 1, z: 1, duration: 0.4 });
    }
  };

  const onPointerOut = () => {
    if (isMobile) return;
    document.body.style.cursor = 'auto';
    gsap.to(titleRef.current, {
      fillOpacity: 0
    });
    if (gridRef.current && hoverBoxRef.current) {
      gsap.to(gridRef.current.position, { z: 0, duration: 0.4});
      gsap.to(hoverBoxRef.current.scale, { x: 0, y: 0, z: 0, duration: 0.4 });
    }
  };

  const getGeometry = () => {
    if (!isMobile) {
      return <planeGeometry args={[4, 4, 1]} />
    }
    return <planeGeometry args={[3.0, 1.5, 1]} />;
  };

  return (
    <mesh ref={gridRef}
      position={position}
      onClick={portalInto}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}>
      { getGeometry() }
      <group>
        <mesh position={[0, 0, -0.01]} ref={hoverBoxRef} scale={[0, 0, 0]}>
          <boxGeometry args={[4, 4, 0.5]}/>
          <meshPhysicalMaterial
            color="#444"
            transparent={true}
            opacity={0.3}
          />
          <Edges color="white" lineWidth={3}/>
        </mesh>
        <Text position={[0, -1.8, 0.4]} {...fontProps} ref={titleRef}>
          {title}
        </Text>
      </group>
      <MeshPortalMaterial ref={portalRef} blend={0} resolution={portalResolution} blur={0}>
        <color attach="background" args={[color]} />
        {(portalReady || isActive) && (
          <Suspense fallback={null}>
            {children}
          </Suspense>
        )}
      </MeshPortalMaterial>
    </mesh>
  );
}

export default GridTile;