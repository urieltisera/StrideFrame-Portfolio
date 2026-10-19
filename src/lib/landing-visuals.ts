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
  { id: "running", label: "Running", requiredPath: "/images/landing/sport-running.webp", src: "/images/landing/sport-running.webp" },
  { id: "cycling", label: "Cycling", requiredPath: "/images/landing/sport-cycling.webp", src: "/images/landing/sport-cycling.webp" },
  { id: "motorsport", label: "Motorsport", requiredPath: "/images/landing/sport-motorsport.webp", src: "/images/landing/sport-motorsport.webp" },
];

export const LANDING_TICKER_ITEMS = [
  "The race ends. The frame stays.",
  "Find your frame.",
  "Keep the finish.",
  "StrideFrame.",
] as const;
