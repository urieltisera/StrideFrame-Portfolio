export type LandingSport = {
  id: "running" | "cycling" | "motorsport";
  label: string;
  requiredPath: string;
  src: string | null;
};

/**
 * Static replacement contract for the first curated landing visuals.
 * Keep the paths here so authorized photography can replace them without
 * changing the landing component or introducing a database dependency.
 */
export const LANDING_SPORTS: readonly LandingSport[] = [
  { id: "running", label: "Running", requiredPath: "/images/landing/sport-running.webp", src: null },
  { id: "cycling", label: "Cycling", requiredPath: "/images/landing/sport-cycling.webp", src: null },
  { id: "motorsport", label: "Motorsport", requiredPath: "/images/landing/sport-motorsport.webp", src: null },
];

export const LANDING_TICKER_ITEMS = [
  "Find your moment",
  "Own the frame",
  "Every finish has a frame",
  "Race",
  "Shoot",
  "Find",
  "Choose",
  "Own",
] as const;
