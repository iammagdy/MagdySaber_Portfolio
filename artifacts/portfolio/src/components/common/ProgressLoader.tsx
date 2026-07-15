import { useEffect, useState } from 'react';
import { MOBILE_BREAKPOINT } from '../../hooks/useBreakpoint';

const useViewportSize = () => {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return windowSize;
};

/** The frame is always mounted; only its loading stroke changes. */
export const ProgressFrame = ({ progress }: { progress: number }) => {
  const windowSize = useViewportSize();
  const strokeWidth = 3;
  const halfStroke = 1;
  const svgWidth = Math.max(0, windowSize.width - 16);
  const svgHeight = Math.max(0, windowSize.height - 16);
  const rectWidth = Math.max(0, svgWidth - strokeWidth);
  const rectHeight = Math.max(0, svgHeight - strokeWidth);
  const perimeter = rectWidth > 0 && rectHeight > 0 ? (rectWidth * 2) + (rectHeight * 2) : 0;
  const clampedProgress = Math.max(0, Math.min(100, progress));

  if (svgWidth <= strokeWidth || svgHeight <= strokeWidth) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 w-full h-full flex items-center justify-center pointer-events-none"
      style={{ boxSizing: 'border-box', zIndex: 20, padding: '1rem' }}
    >
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
        <rect
          x={halfStroke}
          y={halfStroke}
          width={rectWidth}
          height={rectHeight}
          fill="none"
          strokeWidth={strokeWidth}
          stroke="rgba(0, 0, 0, 0.2)"
        />
        <rect
          x={halfStroke}
          y={halfStroke}
          width={rectWidth}
          height={rectHeight}
          fill="none"
          strokeWidth={strokeWidth}
          stroke="rgba(255, 255, 255, 0.7)"
          style={{
            strokeDasharray: perimeter,
            strokeDashoffset: perimeter - (perimeter * clampedProgress) / 100,
            transition: 'stroke-dashoffset 1s ease-in-out',
          }}
        />
      </svg>
    </div>
  );
};

const ProgressLoader = ({
  progress,
  phase,
}: {
  progress: number;
  phase: 'visible' | 'fading' | 'hidden';
}) => {
  const { width } = useViewportSize();

  // Desktop progress is the frame itself. Mobile retains its compact loading
  // label, which fades away without affecting the permanent frame.
  if (phase === 'hidden' || width >= MOBILE_BREAKPOINT) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 w-full h-full flex items-center justify-center pointer-events-none"
      style={{
        boxSizing: 'border-box',
        zIndex: 21,
        opacity: phase === 'fading' ? 0 : 1,
        transition: 'opacity 450ms ease',
      }}
    >
      <div className="relative w-[100px] transition-all duration-500 font-sans font-bold"
        style={{ opacity: 0.7, fontSize: '0.6rem' }}>
        <div className="absolute w-[100px] bg-black opacity-30 h-[2px]" />
        <div
          className="absolute transition-all duration-500 ease-in-out"
          style={{ height: '2px', width: `${progress}%`, backgroundColor: 'white' }}
        />
        <div className="mt-2 text-white">{`${progress.toFixed(2)}%`}</div>
      </div>
    </div>
  );
};

export default ProgressLoader;
