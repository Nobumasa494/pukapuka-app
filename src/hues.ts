export const HUES = {
  neutral: { label: '霧', dot: '#cfe3e6', glow: 'rgba(207,227,230,0.55)' },
  coral: { label: '珊瑚', dot: '#ff8f70', glow: 'rgba(255,143,112,0.55)' },
  violet: { label: '菫', dot: '#b98cff', glow: 'rgba(185,140,255,0.55)' },
  seafoam: { label: '潮', dot: '#6fe3c4', glow: 'rgba(111,227,196,0.55)' },
} as const;

export type HueKey = keyof typeof HUES;

export const HUE_ORDER: HueKey[] = ['neutral', 'coral', 'violet', 'seafoam'];
