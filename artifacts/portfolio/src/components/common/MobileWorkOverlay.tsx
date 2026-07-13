import { useEffect, useRef, useState } from "react";

import { EDUCATION_TIMELINE, WORK_TIMELINE } from "@constants";
import { usePortalStore } from "@stores";
import { WorkTimelinePoint } from "@types";
import { useIsMobileDOM } from "../../hooks/useBreakpoint";

const TimelineEntry = ({ entry }: { entry: WorkTimelinePoint }) => (
  <li className="relative pl-10">
    <span
      aria-hidden
      className="absolute left-[11px] top-4 w-[10px] h-[10px] border border-white bg-black"
    />
    <div className="bg-white/95 border border-black/80 rounded-sm p-3 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
      <span className="inline-block font-vercetti text-[10px] tracking-wider border border-black/70 px-2 py-0.5 text-black">
        {entry.year}
      </span>
      <h3 className="font-soria text-black text-base leading-tight mt-2">
        {entry.title}
      </h3>
      {entry.subtitle && (
        <p className="font-vercetti text-black/70 text-[11px] mt-1 tracking-wide">
          {entry.subtitle}
        </p>
      )}
      {entry.description && (
        <p className="font-vercetti text-black/80 text-[11px] leading-snug mt-2">
          {entry.description}
        </p>
      )}
    </div>
  </li>
);

const MobileWorkOverlay = () => {
  const isMobile = useIsMobileDOM();
  const [showHint, setShowHint] = useState(true);
  const isActive = usePortalStore((s) => s.activePortalId === "work");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Reset scroll position and hint visibility every time the overlay opens.
  useEffect(() => {
    if (isActive && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setShowHint(true);
    }
  }, [isActive]);

  // Lock body scroll while the work overlay is open so swipes don't leak
  // through to the page underneath on small phones.
  useEffect(() => {
    if (!isActive) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [isActive]);

  // Hide the "scroll for more" hint as soon as the visitor scrolls a bit.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !isActive) return;
    const onScroll = () => {
      if (node.scrollTop > 24) setShowHint(false);
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, [isActive]);

  if (!isMobile || !isActive) return null;

  return (
    <div
      className="fixed inset-0 z-[5] flex flex-col pointer-events-none"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9,
        display: "flex",
        flexDirection: "column",
        pointerEvents: "none",
      }}
    >
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] pointer-events-auto"
        style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}
      />
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto px-4 pt-20 pb-24 pointer-events-auto md:px-10"
        style={{
          position: "relative",
          zIndex: 1,
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          pointerEvents: "auto",
          padding: "5rem 1rem 6rem",
        }}
      >
        <h2 className="font-soria text-white text-2xl md:text-4xl text-center mb-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
          Work &amp; Education
        </h2>
        <p className="font-vercetti text-white/70 text-[11px] text-center mb-6 tracking-wider">
          {WORK_TIMELINE.length} ROLES · 2008 — 2026
        </p>

        {/* WORK SECTION */}
        <div className="relative max-w-3xl mx-auto">
          <p className="font-vercetti text-white/80 text-[10px] tracking-[0.25em] mb-3 pl-10">
            EXPERIENCE
          </p>
          <div
            aria-hidden
            className="absolute left-4 top-8 bottom-2 w-px bg-white/40"
          />
          <ol className="flex flex-col gap-3">
            {WORK_TIMELINE.map((entry, i) => (
              <TimelineEntry key={`work-${entry.year}-${i}`} entry={entry} />
            ))}
          </ol>
        </div>

        {/* SECTION DIVIDER */}
        <div className="max-w-3xl mx-auto my-8 flex items-center gap-3 px-2">
          <span className="flex-1 h-px bg-white/30" />
          <span className="font-soria text-white text-sm tracking-widest">
            EDUCATION
          </span>
          <span className="flex-1 h-px bg-white/30" />
        </div>

        {/* EDUCATION SECTION */}
        <div className="relative max-w-3xl mx-auto">
          <div
            aria-hidden
            className="absolute left-4 top-2 bottom-2 w-px bg-white/40"
          />
          <ol className="flex flex-col gap-3">
            {EDUCATION_TIMELINE.map((entry, i) => (
              <TimelineEntry key={`edu-${entry.year}-${i}`} entry={entry} />
            ))}
          </ol>
        </div>

        <p className="font-vercetti text-white/60 text-[11px] text-center mt-8 drop-shadow">
          Tap × to close
        </p>
      </div>

      {/* SCROLL-FOR-MORE HINT */}
      <div
        aria-hidden
        className={`pointer-events-none absolute bottom-6 left-0 right-0 flex flex-col items-center gap-1 transition-opacity duration-500 ${
          showHint ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="font-vercetti text-white/85 text-[10px] tracking-[0.3em] drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
          SCROLL
        </span>
        <span className="block w-[1px] h-6 bg-white/70 animate-pulse" />
        <span className="text-white/85 text-base leading-none animate-bounce drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
          ▾
        </span>
      </div>
    </div>
  );
};

export default MobileWorkOverlay;
