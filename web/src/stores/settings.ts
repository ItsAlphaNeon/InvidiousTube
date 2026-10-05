import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeSetting = 'dark' | 'light' | 'system';
export type SBAction = 'skip' | 'manual' | 'show' | 'off';
export type SBCategory =
  | 'sponsor'
  | 'selfpromo'
  | 'interaction'
  | 'intro'
  | 'outro'
  | 'preview'
  | 'music_offtopic'
  | 'filler'
  | 'poi_highlight';

export const SB_CATEGORIES: { id: SBCategory; label: string; color: string; description: string }[] = [
  { id: 'sponsor', label: 'Sponsor', color: '#00d400', description: 'Paid promotion, paid referrals and direct advertisements.' },
  { id: 'selfpromo', label: 'Unpaid/Self Promotion', color: '#ffff00', description: 'Promoting merch, donations or the creator\'s other channels.' },
  { id: 'interaction', label: 'Interaction Reminder', color: '#cc00ff', description: 'Reminders to like, subscribe or follow.' },
  { id: 'intro', label: 'Intermission/Intro Animation', color: '#00ffff', description: 'An interval without actual content.' },
  { id: 'outro', label: 'Endcards/Credits', color: '#0202ed', description: 'Credits or when the YouTube endcards appear.' },
  { id: 'preview', label: 'Preview/Recap', color: '#008fd6', description: 'Collection of clips that show what is coming up.' },
  { id: 'music_offtopic', label: 'Music: Non-Music Section', color: '#ff9900', description: 'Only for music videos: parts that are not music.' },
  { id: 'filler', label: 'Filler Tangent/Jokes', color: '#7300ff', description: 'Tangential scenes added only for filler or humor.' },
  { id: 'poi_highlight', label: 'Highlight', color: '#ff1684', description: 'The part of the video most people are looking for.' },
];

interface SettingsState {
  theme: ThemeSetting;
  region: string;
  autoplayNext: boolean;
  autoplayOnLoad: boolean;
  quality: 'auto' | number; // preferred max height
  volume: number;
  muted: boolean;
  captions: boolean;
  captionLang: string;
  theater: boolean;
  hoverPreview: boolean;
  ambientMode: boolean;
  sponsorblock: boolean;
  sbCategories: Record<SBCategory, SBAction>;
  ryd: boolean;
  brand: string;
  set: (patch: Partial<Omit<SettingsState, 'set' | 'setSB'>>) => void;
  setSB: (cat: SBCategory, action: SBAction) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      region: 'US',
      autoplayNext: true,
      autoplayOnLoad: true,
      quality: 'auto',
      volume: 1,
      muted: false,
      captions: false,
      captionLang: 'en',
      theater: false,
      hoverPreview: true,
      ambientMode: true,
      sponsorblock: true,
      sbCategories: {
        sponsor: 'skip',
        selfpromo: 'show',
        interaction: 'show',
        intro: 'show',
        outro: 'show',
        preview: 'show',
        music_offtopic: 'skip',
        filler: 'off',
        poi_highlight: 'show',
      },
      ryd: true,
      brand: 'YouTube',
      set: (patch) => set(patch),
      setSB: (cat, action) => set((s) => ({ sbCategories: { ...s.sbCategories, [cat]: action } })),
    }),
    { name: 'itube-settings', version: 1 },
  ),
);

export function resolveTheme(t: ThemeSetting): 'dark' | 'light' {
  if (t === 'system') return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  return t;
}
