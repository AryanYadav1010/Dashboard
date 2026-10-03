// Maps a 0-1 indicator value onto a list of hex colour stops (low -> high).
// Pass invert=true for "lower is better" indicators so the best countries still get the top colour.
export function colorForValue(value, stops, invert = false) {
  const v = Math.max(0, Math.min(1, invert ? 1 - value : value));
  const pos = v * (stops.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return stops[lo];

  const t = pos - lo;
  const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const [r, g, b] = [0, 1, 2].map((i) =>
    Math.round(channel(stops[lo], i) + (channel(stops[hi], i) - channel(stops[lo], i)) * t)
  );
  return `rgb(${r}, ${g}, ${b})`;
}
