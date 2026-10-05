import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../icons';
import './chipbar.css';

export interface ChipDef {
  id: string;
  label: string;
}

interface Props {
  chips: ChipDef[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

/** Horizontally scrolling chip row with YouTube's fading arrow buttons. */
export function ChipBar({ chips, active, onChange, className }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = () => {
    const el = scroller.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };

  useEffect(() => {
    update();
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [chips]);

  const scrollBy = (dir: number) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' });
  };

  return (
    <div className={'chipbar' + (className ? ' ' + className : '')}>
      {canLeft && (
        <div className="chipbar-arrow left">
          <button className="icon-btn" onClick={() => scrollBy(-1)} aria-label="Previous">
            <Icon name="chevronLeft" />
          </button>
        </div>
      )}
      <div className="chipbar-scroll" ref={scroller} onScroll={update}>
        {chips.map((c) => (
          <button key={c.id} className={'chip' + (c.id === active ? ' active' : '')} onClick={() => onChange(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      {canRight && (
        <div className="chipbar-arrow right">
          <button className="icon-btn" onClick={() => scrollBy(1)} aria-label="Next">
            <Icon name="chevronRight" />
          </button>
        </div>
      )}
    </div>
  );
}
