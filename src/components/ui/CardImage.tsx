"use client";

import { useState } from "react";
import Image from "next/image";

interface CardImageProps {
  /** Authenticated /file URL. Absent => fallback shows. */
  src?: string;
  alt: string;
  /** Shown when there is no photo OR the photo keeps failing to load. */
  fallback: React.ReactNode;
}

/** One fresh request after a failure before the fallback: a phone on cellular, or a cold
 *  first resize of a large photo, drops a request now and then — that is not a lost photo. */
const MAX_ATTEMPTS = 2;

// Client leaf: a photo that degrades to the calm fallback (the item's initial)
// when missing or when it keeps failing — never the browser's broken-image glyph.
// unoptimized so the browser sends auth cookies to the protected /file route.
//
// A failure belongs to its photo, not to the component: the sort reuses one CardImage
// per slot as pieces advance (purses-d87z), so a failure stored without its src would
// blank every later photo in that slot. A late error from a previous src is ignored.
export function CardImage({ src, alt, fallback }: CardImageProps) {
  const [failure, setFailure] = useState<{ src: string; count: number } | null>(null);
  const failures = failure && failure.src === src ? failure.count : 0;
  if (!src || failures >= MAX_ATTEMPTS) return <>{fallback}</>;
  return (
    <Image
      // A new key remounts the <img>, so the retry is a fresh request.
      key={`${src}#${failures}`}
      src={src}
      alt={alt}
      fill
      className="object-cover"
      unoptimized
      onError={() =>
        setFailure((prev) => ({ src, count: prev && prev.src === src ? prev.count + 1 : 1 }))
      }
    />
  );
}
