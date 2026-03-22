export const COLORS = ["red", "green", "yellow", "blue"];
export const GRID_SIZE = 15;

export const COLOR_HEX = {
  red: "#f43f5e",
  green: "#10b981",
  yellow: "#f59e0b",
  blue: "#2563eb",
};

export const START_INDEX = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

export const TRACK_GRID = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14], [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0], [6, 0],
];

export const HOME_GRID = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
};

export const YARD_GRID = {
  red: [[1.85, 1.85], [1.85, 3.15], [3.15, 1.85], [3.15, 3.15]],
  green: [[1.85, 10.85], [1.85, 12.15], [3.15, 10.85], [3.15, 12.15]],
  yellow: [[10.85, 10.85], [10.85, 12.15], [12.15, 10.85], [12.15, 12.15]],
  blue: [[10.85, 1.85], [10.85, 3.15], [12.15, 1.85], [12.15, 3.15]],
};

export const SAFE_TRACK_INDEXES = [0, 8, 13, 21, 26, 34, 39, 47];

function toPercent([row, col]) {
  return {
    x: ((col + 0.5) / 15) * 100,
    y: ((row + 0.5) / 15) * 100,
  };
}

export const TRACK_POSITIONS = TRACK_GRID.map(toPercent);
export const HOME_POSITIONS = Object.fromEntries(
  Object.entries(HOME_GRID).map(([color, arr]) => [color, arr.map(toPercent)]),
);
export const YARD_POSITIONS = Object.fromEntries(
  Object.entries(YARD_GRID).map(([color, arr]) => [color, arr.map(toPercent)]),
);

export const YARD_SLOT_GRID = YARD_GRID;

export function positionForToken(color, tokenIndex, progress) {
  if (progress === -1) {
    return YARD_POSITIONS[color][tokenIndex];
  }

  if (progress >= 0 && progress <= 51) {
    const globalIndex = (START_INDEX[color] + progress) % 52;
    return TRACK_POSITIONS[globalIndex];
  }

  if (progress >= 52 && progress <= 56) {
    return HOME_POSITIONS[color][progress - 52];
  }

  return HOME_POSITIONS[color][5];
}
