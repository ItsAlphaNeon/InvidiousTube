import type { CSSProperties } from 'react';

export function Spinner({ size = 32, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg className="spinner" viewBox="0 0 50 50" style={{ width: size, height: size, ...style }} aria-label="Loading">
      <circle cx="25" cy="25" r="20" />
    </svg>
  );
}
