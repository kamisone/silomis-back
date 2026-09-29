/**
 * Turns an SVG the admin uploaded into the flat shape list a design is stored
 * as: a viewBox, and one `{ d, fill }` per filled shape.
 *
 * Why parse it at all rather than store the file? Three reasons, in order of
 * how much trouble they save:
 *
 * 1. **Nothing is ever injected as markup.** The storefront draws a design as
 *    `<path d={…} fill={…} />` through React, and the production sheet writes
 *    the same two attributes with XML escaping. Storing the admin's file and
 *    inlining it would make every one of those a markup sink; storing only a
 *    `d` string and a colour means there is no sink to guard.
 * 2. **The estimator needs shapes, not a picture.** Stitch count comes from
 *    area, and the colour count is what a colour change is charged on — both
 *    read off this list.
 * 3. **It fails at upload instead of on the floor.** A file with live text, a
 *    gradient or an embedded bitmap cannot be sewn as it is. Saying so while
 *    the admin is looking at the file is worth far more than discovering it
 *    when a customer has already paid for it.
 *
 * Deliberately not a general SVG renderer. It reads what drawing tools
 * actually export — paths, the basic shapes, nested `<g>` with fills and
 * transforms — and refuses the rest by name.
 */

/** One drawn shape. `transform` is carried rather than folded into `d`: see `flatten`. */
export interface SvgShape {
  d: string;
  fill: string;
  transform?: string;
}

export interface SvgArtwork {
  /** "0 0 100 100" — the box `d` is drawn in, so it can be scaled to millimetres. */
  viewBox: string;
  shapes: SvgShape[];
  /**
   * Every shape's outline in one `d`, for the one-colour silhouette: the swatch
   * in the editor's grid, and what gets stitched when the design is sewn in a
   * single chosen spool. Subpaths concatenate, which is what a silhouette is.
   */
  path: string;
  /** Distinct fills — what a colour change is charged on. */
  colorCount: number;
}

/** Thrown with a message written for the admin looking at the file picker. */
export class SvgArtworkError extends Error {}

/** Elements whose contents are definitions or metadata, never drawn where they sit. */
const SKIPPED_SUBTREES = new Set(['defs', 'clippath', 'mask', 'marker', 'pattern', 'symbol', 'title', 'desc', 'metadata', 'style', 'filter', 'lineargradient', 'radialgradient']);

/** Named colours a drawing tool might still emit. Anything else is named back at the admin. */
const NAMED_COLORS: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', lime: '#00ff00', blue: '#0000ff',
  yellow: '#ffff00', cyan: '#00ffff', aqua: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff',
  silver: '#c0c0c0', gray: '#808080', grey: '#808080', maroon: '#800000', olive: '#808000',
  green: '#008000', purple: '#800080', teal: '#008080', navy: '#000080', orange: '#ffa500',
  pink: '#ffc0cb', brown: '#a52a2a', gold: '#ffd700', beige: '#f5f5dc', ivory: '#fffff0',
};

const DEFAULT_FILL = '#000000';

/** Only the transform functions, only numbers. Anything else is not carried through. */
const TRANSFORM_RE = /^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*[-+0-9eE.,\s]+\)\s*)+$/;

/** Path data: commands, numbers, separators. No parentheses, no url(), no entities. */
const PATH_DATA_RE = /^[MmZzLlHhVvCcSsQqTtAa0-9eE+\-.,\s]+$/;

const MAX_SHAPES = 400;
const MAX_PATH_CHARS = 200_000;

/**
 * How far from square a design may be.
 *
 * Only the width is ever chosen — the height follows the drawing — and both
 * sides have to land inside the machine's 15–120mm. So a 5:1 design has to be
 * at least 75mm wide to clear 15mm tall, and past 8:1 there is no width that
 * works at all: such a file can be uploaded but never picked, which is a
 * complaint from a customer rather than from the person who could fix it.
 */
const MAX_ASPECT_RATIO = 8;

/** Trims a generated coordinate to something readable — a stitch is 0.1mm, not 1e-14. */
function num(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/**
 * Attributes of one tag. Quoted values only, which is every serialiser's
 * output; an unquoted value simply does not match and the attribute is absent,
 * which fails closed.
 */
function attrsOf(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-\w:.]*)\s*=\s*"([^"]*)"|([a-zA-Z_:][-\w:.]*)\s*=\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const name = (m[1] ?? m[3]).toLowerCase();
    out[name] = decodeEntities(m[2] ?? m[4] ?? '');
  }
  return out;
}

/** The five XML entities. A numeric entity is left alone — it cannot appear in a `d` or a colour. */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** A `style="fill:#abc;…"` declaration, which wins over the `fill` attribute. */
function styleValue(style: string | undefined, property: string): string | undefined {
  if (!style) return undefined;
  for (const part of style.split(';')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    if (part.slice(0, at).trim().toLowerCase() === property) return part.slice(at + 1).trim();
  }
  return undefined;
}

/**
 * One `fill` declaration from a `<style>` sheet, with the selector it came from.
 *
 * Why any of this: Illustrator, Affinity and Inkscape all export colour as an
 * internal stylesheet by default — `<style>.cls-1{fill:#e74c3c}</style>` with
 * `class="cls-1"` on the shape — rather than as a `fill` attribute. Skipping the
 * sheet left every one of those shapes with no fill of its own, so it fell back
 * to black: a colourful logo was stored, and stitched, as a solid black blob.
 */
interface CssFillRule {
  kind: 'id' | 'class' | 'tag';
  name: string;
  fill: string;
  /** CSS specificity, coarsely: an id beats a class beats a bare tag. */
  spec: number;
  /** Position in the sheet, so the later of two equally specific rules wins. */
  order: number;
}

/**
 * The `fill` rules of every `<style>` element, flattened.
 *
 * Deliberately not a CSS engine. It resolves the three selectors a drawing tool
 * emits — `.class`, `#id`, `tag` — and ignores anything with a combinator,
 * pseudo-class or attribute selector, because guessing at those would paint a
 * shape a colour a browser would not. An ignored rule leaves its shape on
 * whatever its attributes say, which is the same place it was before.
 */
function readStylesheet(source: string): CssFillRule[] {
  const rules: CssFillRule[] = [];
  const styleRe = /<\s*style\b[^>]*>([\s\S]*?)<\s*\/\s*style\s*>/gi;
  let order = 0;
  let block: RegExpExecArray | null;
  while ((block = styleRe.exec(source))) {
    const css = block[1]
      .replace(/<!\[CDATA\[|\]\]>/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      // At-rules are dropped whole: what a `@media` or `@supports` block applies
      // depends on the viewer, and a design has one appearance.
      .replace(/@[^{;]*\{[^{}]*\{[\s\S]*?\}\s*\}/g, ' ')
      .replace(/@[^{;]*\{[^{}]*\}/g, ' ')
      .replace(/@[^;{}]*;/g, ' ');

    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let rule: RegExpExecArray | null;
    while ((rule = ruleRe.exec(css))) {
      const fill = styleValue(rule[2], 'fill');
      if (!fill) continue;
      for (const raw of rule[1].split(',')) {
        const sel = raw.trim();
        if (/^#[\w-]+$/.test(sel)) rules.push({ kind: 'id', name: sel.slice(1), fill, spec: 3, order: order++ });
        else if (/^\.[\w-]+$/.test(sel)) rules.push({ kind: 'class', name: sel.slice(1), fill, spec: 2, order: order++ });
        else if (/^[a-zA-Z][\w-]*$/.test(sel)) rules.push({ kind: 'tag', name: sel.toLowerCase(), fill, spec: 1, order: order++ });
      }
    }
  }
  return rules;
}

/** The winning stylesheet `fill` for one element, or undefined when no rule matches. */
function cssFill(rules: CssFillRule[], tag: string, a: Record<string, string>): string | undefined {
  if (!rules.length) return undefined;
  const classes = a.class ? new Set(a.class.split(/\s+/).filter(Boolean)) : null;
  let best: CssFillRule | undefined;
  for (const r of rules) {
    const hit = r.kind === 'id' ? r.name === a.id : r.kind === 'class' ? !!classes?.has(r.name) : r.name === tag;
    if (!hit) continue;
    if (!best || r.spec > best.spec || (r.spec === best.spec && r.order > best.order)) best = r;
  }
  return best?.fill;
}

/**
 * A paint value as a hex colour, or null when the shape is not filled.
 *
 * Throws rather than guessing for a paint that has no single colour: a gradient
 * or a pattern is not a thing a machine can lay in one pass, and quietly
 * flattening it to its first stop would put a design on the floor that does not
 * look like the file the shop approved.
 */
function parseFill(raw: string | undefined, inherited: string): string | null {
  const value = (raw ?? inherited).trim();
  if (!value || value.toLowerCase() === 'none' || value.toLowerCase() === 'transparent') return null;
  if (value.toLowerCase() === 'currentcolor') return inherited;

  const hex = value.toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;

  const rgb = /^rgba?\(\s*([0-9.]+%?)\s*[, ]\s*([0-9.]+%?)\s*[, ]\s*([0-9.]+%?)/.exec(hex);
  if (rgb) {
    const channel = (part: string) => {
      const n = parseFloat(part);
      const byte = part.endsWith('%') ? Math.round((n / 100) * 255) : Math.round(n);
      return Math.max(0, Math.min(255, byte)).toString(16).padStart(2, '0');
    };
    return `#${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`;
  }

  if (NAMED_COLORS[hex]) return NAMED_COLORS[hex];

  if (hex.startsWith('url(')) {
    throw new SvgArtworkError('This design is painted with a gradient or a pattern, which cannot be stitched as it is. Flatten it to solid colours and upload it again.');
  }
  throw new SvgArtworkError(`“${value}” is not a colour this can read. Use hex values like #1a2b3c.`);
}

/** Ancestor transforms, outermost first — which is exactly SVG's own order. */
function joinTransforms(chain: string[]): string | undefined {
  const parts = chain.filter(Boolean);
  if (!parts.length) return undefined;
  const joined = parts.join(' ');
  return joined.length > 400 ? undefined : joined;
}

function safeTransform(raw: string | undefined): string {
  if (!raw) return '';
  const value = raw.trim();
  if (!value) return '';
  // An unreadable transform is dropped rather than refused: it is usually an
  // identity or a rounding artefact, and refusing the file over one would be
  // worse than drawing the shape where its own coordinates put it.
  return TRANSFORM_RE.test(value) ? value : '';
}

/** `d` for one of the basic shapes, or null when it has no fillable area. */
function shapeToPath(tag: string, a: Record<string, string>): string | null {
  const n = (name: string, fallback = 0) => {
    const value = parseFloat(a[name]);
    return Number.isFinite(value) ? value : fallback;
  };

  if (tag === 'rect') {
    const x = n('x'), y = n('y'), w = n('width'), h = n('height');
    if (!(w > 0) || !(h > 0)) return null;
    // rx alone implies ry, and vice versa — the spec's "auto" behaviour.
    let rx = a.rx !== undefined ? n('rx') : a.ry !== undefined ? n('ry') : 0;
    let ry = a.ry !== undefined ? n('ry') : a.rx !== undefined ? n('rx') : 0;
    rx = Math.min(Math.max(rx, 0), w / 2);
    ry = Math.min(Math.max(ry, 0), h / 2);
    if (!rx || !ry) return `M${num(x)} ${num(y)}H${num(x + w)}V${num(y + h)}H${num(x)}Z`;
    return (
      `M${num(x + rx)} ${num(y)}` +
      `H${num(x + w - rx)}A${num(rx)} ${num(ry)} 0 0 1 ${num(x + w)} ${num(y + ry)}` +
      `V${num(y + h - ry)}A${num(rx)} ${num(ry)} 0 0 1 ${num(x + w - rx)} ${num(y + h)}` +
      `H${num(x + rx)}A${num(rx)} ${num(ry)} 0 0 1 ${num(x)} ${num(y + h - ry)}` +
      `V${num(y + ry)}A${num(rx)} ${num(ry)} 0 0 1 ${num(x + rx)} ${num(y)}Z`
    );
  }

  if (tag === 'circle' || tag === 'ellipse') {
    const cx = n('cx'), cy = n('cy');
    const rx = tag === 'circle' ? n('r') : n('rx');
    const ry = tag === 'circle' ? n('r') : n('ry');
    if (!(rx > 0) || !(ry > 0)) return null;
    // Two half arcs: one arc of 360° is degenerate (start === end), so it draws nothing.
    return (
      `M${num(cx - rx)} ${num(cy)}` +
      `A${num(rx)} ${num(ry)} 0 0 1 ${num(cx + rx)} ${num(cy)}` +
      `A${num(rx)} ${num(ry)} 0 0 1 ${num(cx - rx)} ${num(cy)}Z`
    );
  }

  if (tag === 'polygon' || tag === 'polyline') {
    const points = (a.points ?? '').trim().split(/[\s,]+/).map(Number).filter((v) => Number.isFinite(v));
    if (points.length < 6) return null;
    let d = `M${num(points[0])} ${num(points[1])}`;
    for (let i = 2; i + 1 < points.length; i += 2) d += `L${num(points[i])} ${num(points[i + 1])}`;
    // A polyline has no fill area of its own until it is closed, and an open
    // one is a stroke — which is not stitchable as a fill either way.
    return `${d}Z`;
  }

  return null;
}

/** The root `<svg>`'s own box, from viewBox or from width/height. */
function rootViewBox(a: Record<string, string>): string {
  const raw = (a.viewbox ?? '').trim();
  const parts = raw.split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every((v) => Number.isFinite(v)) && parts[2] > 0 && parts[3] > 0) {
    return parts.map(num).join(' ');
  }
  const w = parseFloat(a.width);
  const h = parseFloat(a.height);
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return `0 0 ${num(w)} ${num(h)}`;
  throw new SvgArtworkError('This file has no viewBox and no size, so there is no way to tell how big the design is.');
}

/**
 * Reads the file. Throws `SvgArtworkError` with something the admin can act on.
 */
export function parseSvgArtwork(raw: string): SvgArtwork {
  if (!raw || !raw.trim()) throw new SvgArtworkError('That file is empty.');

  // Comments go first: nothing inside one is part of the drawing, and one can
  // hold something that looks like a tag.
  const commented = raw.replace(/<!--[\s\S]*?-->/g, '');

  // CDATA goes too, contents and all, for the same reason — it can smuggle a
  // tag past the scanner. The one thing worth keeping out of it is a stylesheet,
  // which older exports wrap in CDATA as a matter of course, so the sheet is read
  // from `commented` instead. Safe because a rule yields nothing but a `fill`
  // value, and that value has to satisfy `parseFill` — a hex colour, an `rgb()`
  // or a colour name — before it is stored. Markup cannot survive the trip.
  const source = commented
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '');

  if (/<\s*script/i.test(source) || /\son[a-z]+\s*=/i.test(source)) {
    throw new SvgArtworkError('This file contains a script. Export it again as plain artwork.');
  }

  const rootMatch = /<\s*svg\b([^>]*)>/i.exec(source);
  if (!rootMatch) throw new SvgArtworkError('That does not look like an SVG file.');
  const viewBox = rootViewBox(attrsOf(rootMatch[1]));

  // Read before the scan, because a rule applies wherever in the file it sits.
  const sheet = readStylesheet(commented);

  const shapes: SvgShape[] = [];
  /** Inherited paint and transform, innermost last. The root seeds it. */
  const stack: { fill: string; transform: string; tag: string }[] = [];
  const rootAttrs = attrsOf(rootMatch[1]);
  stack.push({
    fill: styleValue(rootAttrs.style, 'fill') ?? cssFill(sheet, 'svg', rootAttrs) ?? rootAttrs.fill ?? DEFAULT_FILL,
    transform: safeTransform(rootAttrs.transform),
    tag: 'svg',
  });

  /** Depth of the nearest skipped subtree, or 0 when drawing. */
  let skipping = 0;
  let sawText = false;
  let sawRaster = false;

  const tagRe = /<\s*(\/?)\s*([a-zA-Z][\w:.-]*)([^>]*?)(\/?)\s*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(source))) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase().replace(/^.*:/, '');
    const selfClosing = m[4] === '/';

    if (closing) {
      if (skipping) {
        skipping -= 1;
        continue;
      }
      if (tag === 'g' || tag === 'svg') stack.pop();
      continue;
    }

    if (skipping) {
      // Nesting inside a skipped subtree still has to be counted, or its first
      // close tag would let drawing resume too early.
      if (!selfClosing) skipping += 1;
      continue;
    }

    if (SKIPPED_SUBTREES.has(tag)) {
      if (!selfClosing) skipping = 1;
      continue;
    }

    const a = attrsOf(m[3]);
    const inherited = stack[stack.length - 1];

    if (tag === 'g' || tag === 'svg') {
      const entry = {
        fill: styleValue(a.style, 'fill') ?? cssFill(sheet, tag, a) ?? a.fill ?? inherited.fill,
        transform: [inherited.transform, safeTransform(a.transform)].filter(Boolean).join(' '),
        tag,
      };
      // A self-closing group draws nothing and has no children to inherit it.
      if (!selfClosing) stack.push(entry);
      continue;
    }

    if (tag === 'text' || tag === 'tspan' || tag === 'textpath') {
      sawText = true;
      if (!selfClosing) skipping = 1;
      continue;
    }
    if (tag === 'image') {
      sawRaster = true;
      continue;
    }
    if (tag !== 'path' && tag !== 'rect' && tag !== 'circle' && tag !== 'ellipse' && tag !== 'polygon' && tag !== 'polyline') {
      continue;
    }

    // The cascade a browser applies, in its order: the `style` attribute, then
    // the stylesheet, then the `fill` presentation attribute — which loses to any
    // rule that matches — then whatever the parent group is filled with. It has
    // to be this order and not a simpler one, because the admin now previews the
    // file itself in an `<img>`: if these shapes did not follow the same cascade,
    // the preview and the stitching would disagree.
    const fill = parseFill(styleValue(a.style, 'fill') ?? cssFill(sheet, tag, a) ?? a.fill, inherited.fill);
    if (!fill) continue;

    let d: string | null;
    if (tag === 'path') {
      d = (a.d ?? '').trim();
      if (!d) continue;
      if (!PATH_DATA_RE.test(d)) {
        throw new SvgArtworkError('One of the shapes has path data this cannot read. Export the file again from your drawing tool.');
      }
    } else {
      d = shapeToPath(tag, a);
    }
    if (!d) continue;

    const transform = joinTransforms([inherited.transform, safeTransform(a.transform)]);
    shapes.push(transform ? { d, fill, transform } : { d, fill });

    if (shapes.length > MAX_SHAPES) {
      throw new SvgArtworkError(`This design has more than ${MAX_SHAPES} shapes. Simplify it — a stitched design is never that detailed.`);
    }
  }

  if (!shapes.length) {
    if (sawText) throw new SvgArtworkError('This design is made of live text. Convert the text to outlines and upload it again.');
    if (sawRaster) throw new SvgArtworkError('This file is a photo wrapped in an SVG. A design has to be drawn as shapes to be stitched.');
    throw new SvgArtworkError('Nothing in this file is filled with a colour, so there is nothing to stitch.');
  }

  // The silhouette. A transformed shape cannot join the others — one `d` takes
  // one transform — so the silhouette is built from the untransformed shapes
  // and falls back to the first shape when every one of them is placed by a
  // transform, which is only ever used for the small grid swatch.
  const plain = shapes.filter((s) => !s.transform);
  const path = (plain.length ? plain : shapes.slice(0, 1)).map((s) => s.d).join(' ');
  if (path.length > MAX_PATH_CHARS) {
    throw new SvgArtworkError('This design is too detailed to store. Simplify it in your drawing tool and upload it again.');
  }

  const [, , vw, vh] = viewBox.split(' ').map(Number);
  const ratio = vw > 0 && vh > 0 ? Math.max(vw / vh, vh / vw) : 1;
  if (ratio > MAX_ASPECT_RATIO) {
    const shape = vw > vh ? 'wide' : 'tall';
    throw new SvgArtworkError(
      `This design is ${ratio.toFixed(1)} times as ${shape} as it is ${vw > vh ? 'tall' : 'wide'}, which cannot be stitched at any size the hoop takes ` +
        `(both sides have to be between 15 mm and 120 mm). Crop the empty space around it, or split it into two designs.`,
    );
  }

  return { viewBox, shapes, path, colorCount: new Set(shapes.map((s) => s.fill)).size };
}
