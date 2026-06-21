export type EmoteMode = 'status' | 'quick';

export interface EmoteConfig {
    id: string;
    label: string;
    mode: EmoteMode;
    emoji?: string; // required for mode: 'quick' (sent in the 'emote' WS payload)
}

// status → persistent toggle via 'status-emote' WS type
// quick  → 5-second burst via 'emote' WS type (needs emoji for the floating bubble)
export const EMOTES: EmoteConfig[] = [
    { id: 'coffee',    label: 'Coffee',    mode: 'status' },
    { id: 'tea',       label: 'Tea',       mode: 'status' },
    { id: 'yawn',      label: 'Yawn',      mode: 'status' },
    { id: 'stretch',   label: 'Stretch',   mode: 'status' },
    { id: 'afk',       label: 'AFK',       mode: 'status' },
    { id: 'brb',       label: 'BRB',       mode: 'status' },
    { id: 'wave',      label: 'Wave',      mode: 'quick', emoji: '👋' },
    { id: 'dance',     label: 'Dance',     mode: 'quick', emoji: '💃' },
    { id: 'meditate',  label: 'Meditate',  mode: 'quick', emoji: '🧘' },
    { id: 'sleep',     label: 'Sleep',     mode: 'quick', emoji: '😴' },
    { id: 'celebrate', label: 'Celebrate', mode: 'quick', emoji: '🎉' },
    { id: 'love',      label: 'Love',      mode: 'quick', emoji: '❤️' },
];

export const EMOTE_FRAMES: Record<string, number> = {
    afk: 3, brb: 1, celebrate: 3, coffee: 3, dance: 3,
    love: 3, meditate: 2, sleep: 3, stretch: 2, tea: 3, wave: 2, yawn: 2,
};

// Crop origin within 32×48 frame — matches avatar character position
export const EMOTE_CROP: Record<string, [number, number, number, number]> = {
    coffee:    [16, 15, 32, 48],
    tea:       [16, 15, 32, 48],
    yawn:      [16, 15, 32, 48],
    stretch:   [16, 15, 32, 48],
    afk:       [16, 15, 32, 48],
    sleep:     [16, 15, 32, 48],
    brb:       [16, 15, 32, 48],
    celebrate: [16, 15, 32, 48],
    dance:     [16, 15, 32, 48],
    love:      [16, 15, 32, 48],
    wave:      [16, 15, 32, 48],
    meditate:  [16, 15, 32, 48],
};

export const ALL_EMOTE_IDS = Object.keys(EMOTE_FRAMES);
