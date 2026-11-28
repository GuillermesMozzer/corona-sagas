export type LeadInstrument =
  | 'lyre'
  | 'harp'
  | 'flute'
  | 'celesta'
  | 'lute'
  | 'tagelharpa'
  | 'horn_soft';

export type PercHit = 'kick' | 'rim' | 'shaker';

export interface MusicTrack {
  id: string;
  number: number;
  title: string;
  mood: string;
  subtitle: string;
  accentColor: string;
  stepMs: number;
  leadVoice: LeadInstrument;
  harmonyVoice: LeadInstrument;
  filterDayHz: number;
  filterNightHz: number;
  leadGain: number;
  harmonyGain: number;
  droneGain: number;
  /** Note pool for daytime (index 0..11) */
  scaleDay: number[];
  /** Slightly darker nocturnal variation (index 0..11) */
  scaleNight: number[];
  /** Bass/drone root notes in Hz */
  bassPoolDay: number[];
  bassPoolNight: number[];
  /** 32-step melody line (indexes into scaleDay/scaleNight, null = rest) */
  lead: (number | null)[];
  /** 32-step counter-melody / arpeggio accompaniment */
  harmony: (number | null)[];
  /** 32-step bass/drone progression (indexes into bassPool, null = hold/rest) */
  bass: (number | null)[];
  /** Optional 32-step subtle Nordic frame-drum / bodhrán percussion */
  perc?: (PercHit | null)[];
}

/**
 * 10 original Nordic pixel-art compositions in the signature Corona — Sagas do Norte style.
 * Each track features a 32-step A/B phrase structure, modal Nordic scales, warm acoustic timbres,
 * and tailored day/night harmonic shading.
 */
export const MUSIC_TRACKS: MusicTrack[] = [
  {
    id: 'aurora_dorian',
    number: 1,
    title: 'Alvorada do Fiorde',
    mood: 'Clássica',
    subtitle: 'Tema original expandido: lira dourada e quintas nórdicas em Ré Dórico',
    accentColor: '#efc462',
    stepMs: 680,
    leadVoice: 'lyre',
    harmonyVoice: 'harp',
    filterDayHz: 940,
    filterNightHz: 560,
    leadGain: 0.044,
    harmonyGain: 0.022,
    droneGain: 0.032,
    // D3 E3 F3 G3 A3 B3 C4 D4 E4 F4 G4 A4 (D Dorian)
    scaleDay: [146.83, 164.81, 174.61, 196.0, 220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0],
    // D3 E3 F3 G3 A3 Bb3 C4 D4 E4 F4 G4 A4 (D Aeolian)
    scaleNight: [146.83, 164.81, 174.61, 196.0, 220.0, 233.08, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0],
    bassPoolDay: [73.42, 87.31, 98.0, 110.0, 65.41], // D2, F2, G2, A2, C2
    bassPoolNight: [73.42, 87.31, 98.0, 110.0, 58.27], // D2, F2, G2, A2, Bb1
    lead: [
      // Phrase A (signature motif)
      0, 4, 7, 4, 6, 8, 7, 2,
      4, null, 7, 9, 8, 7, 4, null,
      // Phrase B (soaring answer)
      7, 9, 11, 9, 8, 7, 6, 4,
      5, 7, 8, 6, 4, 2, 0, null,
    ],
    harmony: [
      null, null, 4, null, null, 4, null, null,
      2, null, 4, null, 6, null, 2, 4,
      null, 4, 7, null, 4, null, 2, null,
      3, null, 4, null, 2, null, 4, null,
    ],
    bass: [
      0, null, null, null, 4, null, null, null,
      1, null, null, null, 3, null, null, null,
      2, null, null, null, 0, null, null, null,
      4, null, null, null, 0, null, null, null,
    ],
  },
  {
    id: 'fjord_mist',
    number: 2,
    title: 'Névoa de Álfheim',
    mood: 'Mística',
    subtitle: 'Flauta de madeira nórdica e sinos de névoa sobre o fiorde ao amanhecer',
    accentColor: '#7cf7ff',
    stepMs: 740,
    leadVoice: 'flute',
    harmonyVoice: 'celesta',
    filterDayHz: 1120,
    filterNightHz: 720,
    leadGain: 0.036,
    harmonyGain: 0.022,
    droneGain: 0.028,
    // E3 F#3 G3 A3 B3 C4 D4 E4 F#4 G4 A4 B4 (E Aeolian)
    scaleDay: [164.81, 185.0, 196.0, 220.0, 246.94, 261.63, 293.66, 329.63, 369.99, 392.0, 440.0, 493.88],
    scaleNight: [164.81, 174.61, 196.0, 220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88],
    bassPoolDay: [82.41, 98.0, 110.0, 123.47, 73.42], // E2, G2, A2, B2, D2
    bassPoolNight: [82.41, 98.0, 110.0, 123.47, 65.41],
    lead: [
      7, null, 8, 9, null, 7, 4, null,
      6, 7, 9, 11, null, 9, 8, null,
      7, null, 9, 10, 11, null, 9, 7,
      6, 4, 2, null, 4, null, 7, null,
    ],
    harmony: [
      null, 4, null, null, 7, null, null, 4,
      null, 2, null, 6, null, null, 4, null,
      null, 4, null, 7, null, 9, null, 4,
      null, 2, null, 4, null, 7, null, null,
    ],
    bass: [
      0, null, null, null, 1, null, null, null,
      4, null, null, null, 2, null, null, null,
      0, null, null, null, 3, null, null, null,
      4, null, null, null, 0, null, null, null,
    ],
  },
  {
    id: 'hearth_and_mead',
    number: 3,
    title: 'Brinde na Cervejaria',
    mood: 'Taverna',
    subtitle: 'Alaúde saltitante em compasso 6/8 e tambor leve ao calor da fogueira',
    accentColor: '#f5a647',
    stepMs: 360,
    leadVoice: 'lute',
    harmonyVoice: 'lyre',
    filterDayHz: 1240,
    filterNightHz: 860,
    leadGain: 0.044,
    harmonyGain: 0.022,
    droneGain: 0.026,
    // G3 A3 B3 C4 D4 E4 F4 G4 A4 B4 C5 D5 (G Mixolydian)
    scaleDay: [196.0, 220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25, 587.33],
    scaleNight: [196.0, 220.0, 233.08, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 466.16, 523.25, 587.33],
    bassPoolDay: [98.0, 87.31, 130.81, 146.83], // G2, F2, C3, D3
    bassPoolNight: [98.0, 87.31, 130.81, 146.83],
    lead: [
      // Lively 6/8 folk dance in 32 steps
      7, 4, 7, 8, 7, 6, 4, null,
      6, 4, 2, 4, 6, 7, 4, null,
      7, 8, 9, 11, 9, 8, 7, 6,
      8, 7, 6, 4, 2, 4, 7, null,
    ],
    harmony: [
      4, null, 2, null, 4, null, 0, null,
      2, null, 0, null, 2, null, 4, null,
      4, null, 6, null, 4, null, 2, null,
      3, null, 2, null, 0, null, 4, null,
    ],
    bass: [
      0, null, null, 3, null, null, 0, null,
      1, null, null, 2, null, null, 3, null,
      0, null, null, 2, null, null, 0, null,
      1, null, null, 3, null, null, 0, null,
    ],
    perc: [
      'kick', null, 'shaker', 'rim', null, 'shaker', 'kick', null,
      'kick', null, 'shaker', 'rim', null, 'shaker', 'rim', null,
      'kick', null, 'shaker', 'rim', null, 'shaker', 'kick', 'rim',
      'kick', null, 'shaker', 'rim', null, 'shaker', 'kick', null,
    ],
  },
  {
    id: 'drakkar_winds',
    number: 4,
    title: 'Ventos do Drakkar',
    mood: 'Aventura',
    subtitle: 'Tagelharpa vibrante e cadência de remos cortando os mares do norte',
    accentColor: '#5ce1e6',
    stepMs: 440,
    leadVoice: 'tagelharpa',
    harmonyVoice: 'harp',
    filterDayHz: 1080,
    filterNightHz: 700,
    leadGain: 0.036,
    harmonyGain: 0.025,
    droneGain: 0.03,
    // A3 B3 C4 D4 E4 F#4 G4 A4 B4 C5 D5 E5 (A Dorian)
    scaleDay: [220.0, 246.94, 261.63, 293.66, 329.63, 369.99, 392.0, 440.0, 493.88, 523.25, 587.33, 659.25],
    scaleNight: [220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25, 587.33, 659.25],
    bassPoolDay: [110.0, 98.0, 146.83, 130.81, 82.41], // A2, G2, D3, C3, E2
    bassPoolNight: [110.0, 98.0, 146.83, 130.81, 82.41],
    lead: [
      0, null, 4, null, 6, 7, 6, 4,
      2, 4, 6, null, 4, null, null, null,
      7, null, 9, 10, 9, 7, 6, 4,
      5, 7, 6, 4, 2, 0, null, null,
    ],
    harmony: [
      0, 4, 7, 4, 0, 4, 7, 4,
      2, 6, 9, 6, 4, 7, 11, 7,
      0, 4, 7, 4, 2, 6, 9, 6,
      3, 7, 10, 7, 4, 2, 0, null,
    ],
    bass: [
      0, null, null, null, 1, null, null, null,
      3, null, null, null, 4, null, null, null,
      0, null, null, null, 2, null, null, null,
      1, null, null, null, 0, null, null, null,
    ],
    perc: [
      'kick', null, null, 'rim', 'kick', null, 'shaker', null,
      'kick', null, null, 'rim', 'kick', null, 'rim', null,
      'kick', null, 'shaker', 'rim', 'kick', null, 'shaker', null,
      'kick', null, 'rim', null, 'kick', null, null, null,
    ],
  },
  {
    id: 'runes_of_ice',
    number: 5,
    title: 'Runas de Gelo',
    mood: 'Inverno',
    subtitle: 'Sinos cristalinos de celesta e harpa gelada sob a aurora boreal',
    accentColor: '#a8e8ff',
    stepMs: 780,
    leadVoice: 'celesta',
    harmonyVoice: 'harp',
    filterDayHz: 1450,
    filterNightHz: 1050,
    leadGain: 0.036,
    harmonyGain: 0.022,
    droneGain: 0.026,
    // F#3 A3 B3 C#4 E4 F#4 G#4 A4 B4 C#5 E5 F#5 (F# Minor / Pentatonic color)
    scaleDay: [185.0, 220.0, 246.94, 277.18, 329.63, 369.99, 415.3, 440.0, 493.88, 554.37, 659.25, 739.99],
    scaleNight: [185.0, 220.0, 246.94, 277.18, 329.63, 369.99, 415.3, 440.0, 493.88, 554.37, 659.25, 739.99],
    bassPoolDay: [92.5, 110.0, 123.47, 82.41], // F#2, A2, B2, E2
    bassPoolNight: [92.5, 110.0, 123.47, 82.41],
    lead: [
      5, null, 7, null, 9, null, 8, 7,
      5, null, 3, null, 4, null, null, null,
      9, null, 10, 11, null, 9, 8, 7,
      5, 4, 3, null, 5, null, null, null,
    ],
    harmony: [
      null, 3, null, 5, null, 7, null, null,
      null, 1, null, 3, null, 5, null, 3,
      null, 5, null, 7, null, 5, null, 3,
      null, 1, null, 4, null, 3, null, null,
    ],
    bass: [
      0, null, null, null, null, null, null, null,
      1, null, null, null, 3, null, null, null,
      2, null, null, null, 0, null, null, null,
      3, null, null, null, 0, null, null, null,
    ],
  },
  {
    id: 'valkyrie_vigil',
    number: 6,
    title: 'Vigília das Valquírias',
    mood: 'Heroica',
    subtitle: 'Trompas nórdicas nobres e marcha firme para defender as muralhas',
    accentColor: '#ff7d7d',
    stepMs: 490,
    leadVoice: 'horn_soft',
    harmonyVoice: 'lyre',
    filterDayHz: 960,
    filterNightHz: 680,
    leadGain: 0.038,
    harmonyGain: 0.025,
    droneGain: 0.034,
    // D3 E3 F3 G3 A3 Bb3 C4 D4 E4 F4 G4 A4 (D Minor)
    scaleDay: [146.83, 164.81, 174.61, 196.0, 220.0, 233.08, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0],
    scaleNight: [146.83, 164.81, 174.61, 196.0, 220.0, 233.08, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0],
    bassPoolDay: [73.42, 58.27, 65.41, 87.31, 110.0], // D2, Bb1, C2, F2, A2
    bassPoolNight: [73.42, 58.27, 65.41, 87.31, 110.0],
    lead: [
      0, null, 4, null, 5, 4, 2, null,
      4, null, 6, 7, 6, null, 4, null,
      7, null, 9, null, 11, 9, 7, 6,
      5, 4, 6, 4, 2, 0, null, null,
    ],
    harmony: [
      0, 4, 7, 4, 5, 2, 4, 2,
      2, 6, 9, 6, 4, 7, 4, 2,
      0, 4, 7, 9, 4, 7, 6, 4,
      5, 2, 6, 4, 0, 4, 7, null,
    ],
    bass: [
      0, null, null, null, 1, null, null, null,
      2, null, null, null, 4, null, null, null,
      0, null, null, null, 3, null, null, null,
      1, null, 2, null, 0, null, null, null,
    ],
    perc: [
      'kick', null, 'rim', null, 'kick', null, 'kick', 'rim',
      'kick', null, 'rim', null, 'kick', 'shaker', 'rim', null,
      'kick', null, 'rim', null, 'kick', null, 'kick', 'rim',
      'kick', 'rim', 'kick', null, 'kick', null, null, null,
    ],
  },
  {
    id: 'skald_ballad',
    number: 7,
    title: 'Balada do Escaldo',
    mood: 'Serena',
    subtitle: 'Dueto poético de harpa e alaúde contando sagas antigas sob as estrelas',
    accentColor: '#c39bff',
    stepMs: 640,
    leadVoice: 'harp',
    harmonyVoice: 'lute',
    filterDayHz: 1020,
    filterNightHz: 680,
    leadGain: 0.044,
    harmonyGain: 0.024,
    droneGain: 0.028,
    // C3 D3 E3 F#3 G3 A3 B3 C4 D4 E4 G4 A4 (C Lydian / Am lyrical)
    scaleDay: [130.81, 146.83, 164.81, 185.0, 196.0, 220.0, 246.94, 261.63, 293.66, 329.63, 392.0, 440.0],
    scaleNight: [130.81, 146.83, 164.81, 174.61, 196.0, 220.0, 246.94, 261.63, 293.66, 329.63, 392.0, 440.0],
    bassPoolDay: [110.0, 65.41, 98.0, 73.42, 82.41], // A2, C2, G2, D2, E2
    bassPoolNight: [110.0, 65.41, 98.0, 73.42, 82.41],
    lead: [
      5, 7, 9, null, 10, 9, 8, 7,
      5, null, 4, 5, 7, null, null, null,
      9, 10, 11, null, 10, 9, 7, 5,
      6, 7, 8, 6, 5, null, null, null,
    ],
    harmony: [
      2, null, 5, null, 4, null, 2, null,
      0, null, 2, null, 4, 2, 0, null,
      4, null, 7, null, 5, null, 4, null,
      2, null, 4, null, 2, 5, null, null,
    ],
    bass: [
      0, null, null, null, 1, null, null, null,
      2, null, null, null, 3, null, null, null,
      0, null, null, null, 4, null, null, null,
      3, null, 2, null, 0, null, null, null,
    ],
  },
  {
    id: 'amber_harvest',
    number: 8,
    title: 'Colheita de Âmbar',
    mood: 'Outono',
    subtitle: 'Flauta acolhedora e arpejos quentes de outono nas fazendas do vale',
    accentColor: '#e89d54',
    stepMs: 560,
    leadVoice: 'flute',
    harmonyVoice: 'lute',
    filterDayHz: 980,
    filterNightHz: 650,
    leadGain: 0.036,
    harmonyGain: 0.025,
    droneGain: 0.028,
    // F3 G3 Ab3 Bb3 C4 D4 Eb4 F4 G4 Ab4 Bb4 C5 (F Dorian)
    scaleDay: [174.61, 196.0, 207.65, 233.08, 261.63, 293.66, 311.13, 349.23, 392.0, 415.3, 466.16, 523.25],
    scaleNight: [174.61, 196.0, 207.65, 233.08, 261.63, 277.18, 311.13, 349.23, 392.0, 415.3, 466.16, 523.25],
    bassPoolDay: [87.31, 77.78, 116.54, 130.81], // F2, Eb2, Bb2, C3
    bassPoolNight: [87.31, 77.78, 116.54, 130.81],
    lead: [
      4, 6, 7, null, 8, 7, 6, 4,
      5, 7, 6, 4, 2, null, null, null,
      7, 8, 10, 11, 10, 8, 7, 6,
      4, 5, 7, 6, 4, null, null, null,
    ],
    harmony: [
      0, 4, 2, 4, 6, 4, 2, 4,
      3, 5, 7, 5, 2, 4, 0, null,
      0, 4, 7, 4, 3, 6, 8, 6,
      2, 4, 6, 4, 0, 4, 7, null,
    ],
    bass: [
      0, null, null, null, 1, null, null, null,
      2, null, null, null, 3, null, null, null,
      0, null, null, null, 2, null, null, null,
      1, null, null, null, 0, null, null, null,
    ],
    perc: [
      'kick', null, null, 'shaker', null, null, 'rim', null,
      'kick', null, null, 'shaker', null, null, 'shaker', null,
      'kick', null, null, 'shaker', null, null, 'rim', null,
      'kick', null, 'shaker', null, 'rim', null, null, null,
    ],
  },
  {
    id: 'blood_moon_omen',
    number: 9,
    title: 'Presságio da Lua de Sangue',
    mood: 'Sombria',
    subtitle: 'Escala frígia misteriosa, arco tenso e pulsação grave antes da invasão',
    accentColor: '#e05a6d',
    stepMs: 520,
    leadVoice: 'tagelharpa',
    harmonyVoice: 'celesta',
    filterDayHz: 760,
    filterNightHz: 520,
    leadGain: 0.036,
    harmonyGain: 0.02,
    droneGain: 0.036,
    // D3 Eb3 F3 G3 A3 Bb3 C4 D4 Eb4 F4 G4 A4 (D Phrygian)
    scaleDay: [146.83, 155.56, 174.61, 196.0, 220.0, 233.08, 261.63, 293.66, 311.13, 349.23, 392.0, 440.0],
    scaleNight: [146.83, 155.56, 174.61, 196.0, 220.0, 233.08, 261.63, 293.66, 311.13, 349.23, 392.0, 440.0],
    bassPoolDay: [73.42, 77.78, 65.41, 58.27], // D2, Eb2, C2, Bb1
    bassPoolNight: [73.42, 77.78, 65.41, 58.27],
    lead: [
      0, null, 1, null, 0, null, 4, 5,
      4, null, 2, 1, 0, null, null, null,
      7, null, 8, 7, 5, 4, 5, 4,
      2, 1, 0, null, 1, 0, null, null,
    ],
    harmony: [
      null, null, 7, null, null, 8, null, null,
      null, 7, null, null, null, 4, null, null,
      null, 11, null, 8, null, 7, null, null,
      null, 8, null, 7, null, null, 4, null,
    ],
    bass: [
      0, null, null, null, 1, null, null, null,
      2, null, null, null, 0, null, null, null,
      3, null, null, null, 1, null, null, null,
      2, null, 1, null, 0, null, null, null,
    ],
    perc: [
      'kick', null, null, null, 'kick', null, 'rim', null,
      'kick', null, null, 'shaker', 'kick', null, null, null,
      'kick', null, 'rim', null, 'kick', null, 'kick', null,
      'kick', null, 'rim', null, 'kick', null, null, null,
    ],
  },
  {
    id: 'hall_of_kings',
    number: 10,
    title: 'Salão dos Reis',
    mood: 'Majestosa',
    subtitle: 'Coroação real em Ré Maior: harpa dourada, trompas e glória do Norte',
    accentColor: '#ffe58a',
    stepMs: 540,
    leadVoice: 'horn_soft',
    harmonyVoice: 'harp',
    filterDayHz: 1180,
    filterNightHz: 820,
    leadGain: 0.038,
    harmonyGain: 0.026,
    droneGain: 0.032,
    // D3 E3 F#3 G3 A3 B3 C#4 D4 E4 F#4 G4 A4 (D Major)
    scaleDay: [146.83, 164.81, 185.0, 196.0, 220.0, 246.94, 277.18, 293.66, 329.63, 369.99, 392.0, 440.0],
    // D Mixolydian subtle royal evening warmth
    scaleNight: [146.83, 164.81, 185.0, 196.0, 220.0, 246.94, 261.63, 293.66, 329.63, 369.99, 392.0, 440.0],
    bassPoolDay: [73.42, 98.0, 110.0, 123.47, 82.41], // D2, G2, A2, B2, E2
    bassPoolNight: [73.42, 98.0, 110.0, 123.47, 82.41],
    lead: [
      0, null, 2, 4, 7, null, 9, 8,
      7, null, 4, 5, 4, null, null, null,
      7, 8, 9, 11, null, 9, 8, 7,
      5, 7, 8, 6, 7, null, null, null,
    ],
    harmony: [
      0, 4, 7, 4, 2, 4, 7, 9,
      3, 5, 7, 5, 4, 6, 8, 4,
      0, 4, 7, 9, 3, 5, 8, 7,
      4, 6, 8, 6, 0, 4, 7, null,
    ],
    bass: [
      0, null, null, null, 1, null, null, null,
      3, null, null, null, 2, null, null, null,
      0, null, null, null, 1, null, null, null,
      4, null, 2, null, 0, null, null, null,
    ],
    perc: [
      'kick', null, null, null, 'rim', null, null, null,
      'kick', null, 'shaker', null, 'rim', null, null, null,
      'kick', null, null, 'rim', 'kick', null, 'shaker', null,
      'kick', null, 'rim', null, 'kick', null, null, null,
    ],
  },
];

export const DEFAULT_TRACK_ID = MUSIC_TRACKS[0].id;

export function getMusicTrackById(id: string | null | undefined): MusicTrack {
  return MUSIC_TRACKS.find((tr) => tr.id === id) ?? MUSIC_TRACKS[0];
}
