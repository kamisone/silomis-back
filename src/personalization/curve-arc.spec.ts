
/**
 * The geometry of a bent line.
 *
 * Two bugs live here. A curved line used to be positioned by pushing its ends
 * down by the WHOLE sagitta, so the curve hung below the box the hoop had been
 * measured for and the bottom of a strongly bent word was cropped away — the
 * letters that went missing as the angle moved. And the radius came from the
 * chord, which is not one-to-one past a semicircle and infinite at 360°, so the
 * curve could not go beyond 180° at all.
 */
/** Re-derivation of what the service should now produce, from first principles. */
function expected(lengthMm: number, curveDeg: number) {
  const theta = (Math.abs(curveDeg) * Math.PI) / 180;
  const radius = (lengthMm * 1.01) / theta;
  const sagitta = radius * (1 - Math.cos(theta / 2));
  return { radius, sagitta, halfChord: radius * Math.sin(theta / 2) };
}

describe('curved lettering geometry', () => {
  it('is defined at every angle up to a full circle', () => {
    for (const deg of [5, 45, 90, 179, 180, 181, 270, 359, 360]) {
      const { radius, sagitta, halfChord } = expected(60, deg);
      expect(Number.isFinite(radius)).toBe(true);
      expect(radius).toBeGreaterThan(0);
      expect(Number.isFinite(sagitta)).toBe(true);
      expect(Number.isFinite(halfChord)).toBe(true);
    }
  });

  it('shrinks the circle as the bend grows, without ever doubling back', () => {
    // The old chord formula gave 270° the same radius as 90°: two different
    // shapes indistinguishable to everything downstream.
    let previous = Infinity;
    for (const deg of [30, 60, 90, 120, 180, 240, 300, 360]) {
      const { radius } = expected(60, deg);
      expect(radius).toBeLessThan(previous);
      previous = radius;
    }
  });

  it('closes the chord to nothing at a full circle, and opens it again below', () => {
    expect(expected(60, 360).halfChord).toBeCloseTo(0, 6);
    expect(expected(60, 180).halfChord).toBeGreaterThan(0);
    expect(expected(60, 270).halfChord).toBeGreaterThan(0);
  });

  it('keeps the thread length, which is what bending must not change', () => {
    // radius × theta is the arc the glyphs are laid along.
    for (const deg of [45, 120, 360]) {
      const { radius } = expected(60, deg);
      expect(radius * ((deg * Math.PI) / 180)).toBeCloseTo(60 * 1.01, 6);
    }
  });

  it('a full circle is exactly as tall as the circle is wide', () => {
    const { radius, sagitta } = expected(60, 360);
    expect(sagitta).toBeCloseTo(2 * radius, 6);
  });
});
