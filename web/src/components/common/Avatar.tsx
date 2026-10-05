import { useState } from 'react';
import { avatarColor } from '../../api/format';

interface Props {
  src?: string;
  name: string;
  size: number;
  className?: string;
}

/** Round channel avatar with a coloured letter fallback (like YouTube's default avatars). */
export function Avatar({ src, name, size, className }: Props) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    const letter = (name || '?').replace(/^@/, '').charAt(0);
    return (
      <span
        className={'avatar-fallback' + (className ? ' ' + className : '')}
        style={{ width: size, height: size, background: avatarColor(name || '?'), fontSize: size * 0.5 }}
        aria-hidden="true"
      >
        {letter}
      </span>
    );
  }
  return (
    <img
      className={'avatar' + (className ? ' ' + className : '')}
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
    />
  );
}
