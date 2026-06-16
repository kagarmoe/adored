"use client";

import { useState } from "react";
import Image from "next/image";

interface CardImageProps {
  /** Authenticated /file URL. Absent => fallback shows. */
  src?: string;
  alt: string;
  /** Shown when there is no photo OR the photo fails to load. */
  fallback: React.ReactNode;
}

// Client leaf: a photo that degrades to the calm fallback (the item's initial)
// when missing or on load error — never the browser's broken-image glyph.
// unoptimized so the browser sends auth cookies to the protected /file route.
export function CardImage({ src, alt, fallback }: CardImageProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback}</>;
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover"
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}
