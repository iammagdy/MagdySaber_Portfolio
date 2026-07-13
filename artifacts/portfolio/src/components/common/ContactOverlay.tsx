import { usePortalStore, useScrollStore, useSettingsStore } from "@stores";

const ContactOverlay = () => {
  const scrollProgress = useScrollStore((s) => s.scrollProgress);
  const portalActive = usePortalStore((s) => !!s.activePortalId);
  const footerLinks = useSettingsStore((s) => s.footerLinks);
  const isVisible = !portalActive && scrollProgress >= 0.96;

  return (
    <footer
      aria-label="Contact"
      style={{
        position: "fixed",
        bottom: "clamp(0.5rem, 1.5vh, 1rem)",
        left: "50%",
        zIndex: 8,
        width: "min(92vw, 54rem)",
        padding: "1rem",
        pointerEvents: "none",
        opacity: isVisible ? 1 : 0,
        transform: `translate(-50%, ${isVisible ? "0" : "1.25rem"})`,
        transition: "opacity 300ms ease, transform 300ms ease",
      }}
    >
      <div style={{ textAlign: "center", color: "white" }}>
        <h2
          style={{
            margin: 0,
            fontFamily: "Soria, Georgia, serif",
            fontSize: "clamp(2rem, 4vw, 3.5rem)",
            fontWeight: 400,
          }}
        >
          LET&apos;S CONNECT
        </h2>
        <p style={{ margin: "0.55rem 0 1.15rem", opacity: 0.78, letterSpacing: "0.1em", fontSize: "clamp(0.7rem, 1.25vw, 0.9rem)" }}>
          OPEN TO COLLABORATION AND NEW IDEAS
        </p>
        <nav aria-label="Contact links" style={{ display: "flex", justifyContent: "center", gap: "clamp(1.25rem, 4vw, 3rem)", flexWrap: "wrap", pointerEvents: "auto" }}>
          {footerLinks.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target={link.url.startsWith("mailto:") ? undefined : "_blank"}
              rel={link.url.startsWith("mailto:") ? undefined : "noreferrer"}
              style={{ color: "white", fontFamily: "Vercetti, Arial, sans-serif", letterSpacing: "0.08em", textDecoration: "none" }}
            >
              {link.name.toUpperCase()}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
};

export default ContactOverlay;
