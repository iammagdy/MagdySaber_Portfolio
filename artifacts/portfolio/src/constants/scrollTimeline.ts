/**
 * Shared phases for the landing journey. Keep adjacent scenes overlapping so
 * the camera never exposes an empty transition between them.
 */
export const SCROLL_TIMELINE = {
  cloudJourney: { start: 0, end: 0.7 },
  cameraRotation: { start: 0, end: 0.3 },
  cameraDescent: { start: 0.3, end: 0.85 },
  doorOpening: { start: 0.52, end: 0.74 },
  doorExit: 0.86,
  tunnelAnimation: { start: 0.56, end: 0.8 },
  tunnelExit: 0.92,
  experienceTransition: { start: 0.8, end: 1 },
} as const;
