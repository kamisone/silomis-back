/**
 * The boxes of a stored design, as everything outside production reads them.
 *
 * A position's row keeps a flat summary (the first box's face, every box's
 * words joined, every spool used); the boxes themselves live in the frozen
 * design document. This is the one place that document is opened for display,
 * so a basket, an order email, the tracking page and the admin card all read
 * the same thing — and a row written before boxes existed reads as one box.
 */

export interface DesignElementView {
  contentType: 'text' | 'monogram' | 'motif';
  /** Verbatim, lines joined by newlines. Empty for a shape. */
  text: string;
  lineCount: number;
  fontName: string;
  fontWeight: number;
  heightMm: number;
  curveDeg: number;
  isPuff: boolean;
  motifName: string | null;
  motifSizeMm: number | null;
  thread: { brand: string; code: string; name: string; hex: string };
  /** From the area's centre, in millimetres, and the box's own angle. */
  offsetXMm: number;
  offsetYMm: number;
  rotationDeg: number;
  stitchEstimate: number;
}

interface StoredRow {
  designJson: unknown;
  contentType: 'text' | 'monogram' | 'motif';
  text: string;
  lineCount: number;
  fontName: string;
  fontWeight: number;
  heightMm: number;
  curveDeg: number;
  isPuff: boolean;
  motifName: string | null;
  motifSizeMm: number | null;
  threadColors: unknown;
  rotationDeg: number;
  stitchEstimate: number;
}

export function designElementsOf(row: StoredRow): DesignElementView[] {
  const doc = row.designJson as { version?: number; elements?: Record<string, unknown>[] } | null;
  if (doc?.version === 2 && Array.isArray(doc.elements) && doc.elements.length) {
    return doc.elements.map((el) => {
      const motif = el.motif as { name?: string; sizeMm?: number } | null | undefined;
      const font = el.font as { name?: string } | undefined;
      const thread = (el.thread as DesignElementView['thread'] | undefined) ?? { brand: '', code: '', name: '', hex: '#000000' };
      return {
        contentType: (el.contentType as DesignElementView['contentType']) ?? 'text',
        text: String(el.text ?? ''),
        lineCount: Array.isArray(el.lines) ? el.lines.length : el.text ? String(el.text).split('\n').length : 0,
        fontName: font?.name ?? row.fontName,
        fontWeight: Number(el.fontWeight ?? 400),
        heightMm: Number(el.heightMm ?? row.heightMm),
        curveDeg: Number(el.curveDeg ?? 0),
        isPuff: !!el.isPuff,
        motifName: motif?.name ?? null,
        motifSizeMm: motif?.sizeMm ?? null,
        thread,
        offsetXMm: Number(el.offsetXMm ?? 0),
        offsetYMm: Number(el.offsetYMm ?? 0),
        rotationDeg: Number(el.rotationDeg ?? 0),
        stitchEstimate: Number(el.stitchEstimate ?? 0),
      };
    });
  }
  const threads = (row.threadColors as DesignElementView['thread'][] | null) ?? [];
  return [
    {
      contentType: row.contentType,
      text: row.text,
      lineCount: row.lineCount,
      fontName: row.fontName,
      fontWeight: row.fontWeight,
      heightMm: row.heightMm,
      curveDeg: row.curveDeg,
      isPuff: row.isPuff,
      motifName: row.motifName,
      motifSizeMm: row.motifSizeMm,
      thread: threads[0] ?? { brand: '', code: '', name: '', hex: '#000000' },
      offsetXMm: 0,
      offsetYMm: 0,
      rotationDeg: row.rotationDeg,
      stitchEstimate: row.stitchEstimate,
    },
  ];
}
