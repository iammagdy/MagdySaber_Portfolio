import gsap from "gsap";

import { useEffect, useState } from "react";

import { usePortalStore, useScrollStore } from "@stores";

export const ScrollHint = () => {
  const [hintText, setHintText] = useState('');
  const [showScrollHint, setShowScrollHint] = useState(false);
  const portal = usePortalStore((state) => state.activePortalId);
  const scrollProgress = useScrollStore((state) => state.scrollProgress);

  // Show 'Scroll' for Hero and work portals, 'Pan' for Projects portal.
  useEffect(() => {
    if (!portal) {
      if (scrollProgress === 0) {
        setHintText('SCROLL');
        setShowScrollHint(true);
      } else {
        setShowScrollHint(false);
      }
    } else {
      if (portal === 'work') {
        setHintText('SCROLL');
        setShowScrollHint(scrollProgress === 0);
      } else {
        setHintText('PAN');
        setShowScrollHint(true);
      }
    }
  }, [portal, scrollProgress]);

  useEffect(() => {
    if (showScrollHint) {
      gsap.to('.scroll-hint', {
        opacity: 1,
        duration: 1.5,
        delay: 1.5,
      });
    } else {
      gsap.killTweensOf('.scroll-hint');
      gsap.to('.scroll-hint', {
        opacity: 0,
        duration: 0.5,
      });
    }
  }, [showScrollHint]);

  const svgSrc = hintText === 'PAN' ? '/icons/chevrons-left-right.svg' : '/icons/chevrons-up-down.svg';

  return (
    <div className="fixed w-full bottom-5 scroll-hint pointer-events-none" style={{ opacity: 0, zIndex: 2 }}>
      <div className="flex items-center justify-center gap-2 animate-pulse">
        <img src={svgSrc} width={18} height={18} alt={hintText.toLowerCase() + " hint"} loading="lazy" />
        <span className="text-white text-xs sm:text-sm tracking-widest" style={{ fontFamily: "Vercetti, Arial, sans-serif" }}>{hintText}</span>
      </div>
    </div>
  );
}