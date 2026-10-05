import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface VideoFilters {
  brightness: number; // %
  contrast: number; // %
  saturate: number; // %
  hue: number; // deg
  grayscale: number; // %
  sepia: number; // %
  invert: number; // %
  blur: number; // px
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export const DEFAULT_FILTERS: VideoFilters = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hue: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0,
  blur: 0,
  rotate: 0,
  flipH: false,
  flipV: false,
};

interface ToolbarState {
  cinema: boolean;
  expanded: boolean;
  boost: boolean;
  boostLevel: number;
  filtersOn: boolean;
  filters: VideoFilters;
  set: (patch: Partial<Omit<ToolbarState, 'set' | 'setFilter'>>) => void;
  setFilter: <K extends keyof VideoFilters>(key: K, value: VideoFilters[K]) => void;
}

/** State of the experimental utility toolbar (modelled on Enhancer for YouTube's control bar). */
export const useToolbar = create<ToolbarState>()(
  persist(
    (set) => ({
      cinema: false,
      expanded: false,
      boost: false,
      boostLevel: 2,
      filtersOn: false,
      filters: DEFAULT_FILTERS,
      set: (patch) => set(patch),
      setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value }, filtersOn: true })),
    }),
    { name: 'itube-toolbar', version: 1 },
  ),
);

export function filterCss(f: VideoFilters): string {
  const parts = [
    f.brightness !== 100 && `brightness(${f.brightness}%)`,
    f.contrast !== 100 && `contrast(${f.contrast}%)`,
    f.saturate !== 100 && `saturate(${f.saturate}%)`,
    f.hue && `hue-rotate(${f.hue}deg)`,
    f.grayscale && `grayscale(${f.grayscale}%)`,
    f.sepia && `sepia(${f.sepia}%)`,
    f.invert && `invert(${f.invert}%)`,
    f.blur && `blur(${f.blur}px)`,
  ];
  return parts.filter(Boolean).join(' ');
}
