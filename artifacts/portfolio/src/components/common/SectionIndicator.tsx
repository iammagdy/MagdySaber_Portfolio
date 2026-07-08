import { usePortalStore, useScrollStore } from '@stores';

const SECTIONS = ['Hero', 'Experience', 'Projects', 'Contact'];

const SectionIndicator = () => {
  const scrollProgress = useScrollStore((s) => s.scrollProgress);
  const portalActive = usePortalStore((s) => !!s.activePortalId);

  if (portalActive) return null;

  const activeIndex = Math.min(
    SECTIONS.length - 1,
    Math.floor(scrollProgress * SECTIONS.length + 0.001),
  );

  return (
    <nav
      aria-label="Page sections"
      style={{
        position: 'fixed',
        right: 'max(1.25rem, env(safe-area-inset-right))',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        zIndex: 5,
        pointerEvents: 'none',
        opacity: 0.85,
      }}
    >
      {SECTIONS.map((label, i) => {
        const isActive = i === activeIndex;
        return (
          <span
            key={label}
            aria-label={label}
            aria-current={isActive ? 'true' : undefined}
            style={{
              display: 'block',
              width: isActive ? '10px' : '6px',
              height: isActive ? '10px' : '6px',
              borderRadius: '50%',
              background: isActive ? '#ffffff' : 'rgba(255,255,255,0.55)',
              boxShadow: isActive
                ? '0 0 8px rgba(255,255,255,0.6), 0 0 0 1px rgba(0,0,0,0.35)'
                : '0 0 0 1px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.35)',
              transition: 'all 0.35s ease',
            }}
          />
        );
      })}
    </nav>
  );
};

export default SectionIndicator;
