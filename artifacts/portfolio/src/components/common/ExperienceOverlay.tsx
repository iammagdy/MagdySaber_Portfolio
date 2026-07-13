import { usePortalStore, useScrollStore } from "@stores";

const ExperienceOverlay = () => {
  const scrollProgress = useScrollStore((state) => state.scrollProgress);
  const portalActive = usePortalStore((state) => !!state.activePortalId);
  const setActivePortal = usePortalStore((state) => state.setActivePortal);
  // Keep the section heading present while the compact contact block enters
  // below it, so the final state remains part of Experience rather than
  // becoming a separate full-screen contact page.
  const isVisible = !portalActive && scrollProgress >= 0.8;
  const contactProgress = Math.min(Math.max((scrollProgress - 0.9) / 0.1, 0), 1);
  const labelWidth = 44 - 20 * contactProgress;

  const transition = "opacity 220ms ease, transform 220ms ease";

  return (
    <>
      <h2
        aria-hidden={!isVisible}
        style={{
          position: "fixed",
          top: "clamp(1.5rem, 7vh, 5rem)",
          left: "50%",
          zIndex: 7,
          margin: 0,
          color: "white",
          fontFamily: "Soria, serif",
          fontSize: "clamp(2.1rem, 5vw, 5.5rem)",
          fontWeight: 400,
          letterSpacing: "0.12em",
          lineHeight: 1,
          pointerEvents: isVisible ? "auto" : "none",
          opacity: isVisible ? 1 : 0,
          transform: `translate(-50%, ${isVisible ? "0" : "-0.75rem"})`,
          transition,
        }}
      >
        EXPERIENCE
      </h2>
      <div
        aria-hidden={!isVisible}
        style={{
          position: "fixed",
          top: "53%",
          left: "50%",
          zIndex: 7,
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          width: `${labelWidth}vw`,
          maxWidth: "38rem",
          color: "white",
          fontFamily: "Soria, serif",
          fontSize: "clamp(1.15rem, 2vw, 2.15rem)",
          lineHeight: 1.05,
          textAlign: "center",
          textShadow: "0 2px 10px rgba(0, 0, 0, 0.58)",
          pointerEvents: "none",
          opacity: isVisible ? 1 : 0,
          transform: `translate(-50%, ${isVisible ? "-50%" : "calc(-50% - 0.75rem)"})`,
          transition,
        }}
      >
        <button
          type="button"
          className="experience-card-action"
          aria-label="Open Work and Education"
          onClick={() => setActivePortal("work")}
        >
          WORK AND<br />EDUCATION
        </button>
        <button
          type="button"
          className="experience-card-action"
          aria-label="Open Side Projects"
          onClick={() => setActivePortal("projects")}
        >
          SIDE<br />PROJECTS
        </button>
      </div>
    </>
  );
};

export default ExperienceOverlay;
