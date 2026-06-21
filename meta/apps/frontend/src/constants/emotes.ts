export const EMOTES = [
    { id: 'coffee',    label: 'Coffee'    },
    { id: 'yawn',      label: 'Yawn'      },
    { id: 'stretch',   label: 'Stretch'   },
    { id: 'afk',       label: 'AFK'       },
    { id: 'brb',       label: 'BRB'       },
    { id: 'wave',      label: 'Wave'      },
    { id: 'dance',     label: 'Dance'     },
    { id: 'meditate',  label: 'Meditate'  },
    { id: 'sleep',     label: 'Sleep'     },
    { id: 'celebrate', label: 'Celebrate' },
    { id: 'love',      label: 'Love'      },
];

export const EMOTE_FRAMES: Record<string, number> = {
    afk: 3, brb: 1, celebrate: 3, coffee: 3, dance: 3,
    love: 3, meditate: 2, sleep: 3, stretch: 2, wave: 2, yawn: 2,
};

// Crop origin within 32×48 frame — matches avatar character position
export const EMOTE_CROP: Record<string, [number, number, number, number]> = {
    coffee:    [16, 15, 32, 48],
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
