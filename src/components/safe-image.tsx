"use client";

import { useState } from "react";
import type { ImgHTMLAttributes } from "react";

type SafeImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fallbackLabel?: string;
};

export function SafeImage({ fallbackLabel = "Preview unavailable", alt = "", className = "", onError, ...props }: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div role="img" aria-label={fallbackLabel} className={`sf-image-fallback ${className}`}><span>{fallbackLabel}</span></div>;
  }
  return <img {...props} alt={alt} className={className} onError={(event) => { setFailed(true); onError?.(event); }} />;
}
