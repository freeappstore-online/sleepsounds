// The shape of the sleep timer's fade-out. Loudness falls evenly in decibels
// (down 48 dB) with a final taper to exact silence, so it sounds like a
// steady, gentle drift away rather than a slow start and a sudden drop.

export function fadeGainAt(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return Math.pow(10, (-48 * x) / 20) * (1 - x * x * x * x)
}

/**
 * The fade as `points` gain values, from `from` (0–1, how far through the
 * fade we already are) to the end, for AudioParam.setValueCurveAtTime.
 */
export function fadeCurve(points: number, from = 0): Float32Array {
  const n = Math.max(2, Math.floor(points))
  const start = Math.min(1, Math.max(0, from))
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) curve[i] = fadeGainAt(start + ((1 - start) * i) / (n - 1))
  return curve
}
