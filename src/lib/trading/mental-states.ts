export const MENTAL_STATES = [
  'calm',
  'focused',
  'confident',
  'slightly_anxious',
  'anxious',
  'fatigued',
  'fomo',
  'avoid',
] as const;

export type MentalState = (typeof MENTAL_STATES)[number];

export const MENTAL_STATE_LABELS: Record<MentalState, string> = {
  calm: 'Tranquilo',
  focused: 'Enfocado',
  confident: 'Confiado',
  slightly_anxious: 'Leve Ansiedad',
  anxious: 'Ansioso',
  fatigued: 'Fatigado',
  fomo: 'FOMO',
  avoid: 'Mejor No Operar',
};
