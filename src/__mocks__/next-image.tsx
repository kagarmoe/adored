import React from "react";

// Minimal next/image stub for unit tests: renders a plain <img> so tests can
// assert on `src` and `alt` without Next's URL normalization.
const Image = ({
  src,
  alt,
  fill: _fill,
  className,
  unoptimized: _unoptimized,
  onError,
  ...rest
}: {
  src: string;
  alt: string;
  fill?: boolean;
  className?: string;
  unoptimized?: boolean;
  onError?: React.ReactEventHandler<HTMLImageElement>;
  [key: string]: unknown;
}) => <img src={src} alt={alt} className={className} onError={onError} {...rest} />;

export default Image;
