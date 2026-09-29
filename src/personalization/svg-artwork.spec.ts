import { parseSvgArtwork, SvgArtworkError } from './svg-artwork';

const svg = (body: string, attrs = 'viewBox="0 0 100 100"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe('parseSvgArtwork', () => {
  it('reads paths with their fills', () => {
    const art = parseSvgArtwork(svg('<path d="M10 10H90V90H10Z" fill="#FF0000"/><path d="M20 20h10v10h-10z" fill="#00f"/>'));
    expect(art.viewBox).toBe('0 0 100 100');
    expect(art.shapes).toEqual([
      { d: 'M10 10H90V90H10Z', fill: '#ff0000' },
      { d: 'M20 20h10v10h-10z', fill: '#0000ff' },
    ]);
    expect(art.colorCount).toBe(2);
    // The silhouette is every shape in one `d` — concatenated subpaths.
    expect(art.path).toBe('M10 10H90V90H10Z M20 20h10v10h-10z');
  });

  it('falls back to width and height when there is no viewBox', () => {
    expect(parseSvgArtwork(svg('<path d="M0 0h10v10z" fill="#000"/>', 'width="64" height="48"')).viewBox).toBe('0 0 64 48');
  });

  it('refuses a file with no box at all — the size would be a guess', () => {
    expect(() => parseSvgArtwork(svg('<path d="M0 0h10v10z" fill="#000"/>', ''))).toThrow(SvgArtworkError);
  });

  describe('the basic shapes, which tools export as often as paths', () => {
    it('turns a rect into a path', () => {
      expect(parseSvgArtwork(svg('<rect x="10" y="20" width="30" height="40" fill="#000"/>')).shapes[0].d).toBe('M10 20H40V60H10Z');
    });

    it('rounds a rect with rx, and mirrors a lone rx into ry', () => {
      const d = parseSvgArtwork(svg('<rect width="40" height="40" rx="5" fill="#000"/>')).shapes[0].d;
      expect(d.startsWith('M5 0')).toBe(true);
      expect(d).toContain('A5 5 0 0 1');
    });

    it('clamps a corner radius to half the side, as the spec does', () => {
      expect(parseSvgArtwork(svg('<rect width="20" height="20" rx="999" fill="#000"/>')).shapes[0].d).toContain('A10 10');
    });

    it('draws a circle as two arcs, because one 360° arc is degenerate', () => {
      const d = parseSvgArtwork(svg('<circle cx="50" cy="50" r="25" fill="#000"/>')).shapes[0].d;
      expect(d).toBe('M25 50A25 25 0 0 1 75 50A25 25 0 0 1 25 50Z');
    });

    it('closes a polygon and a polyline', () => {
      expect(parseSvgArtwork(svg('<polygon points="0,0 10,0 5,10" fill="#000"/>')).shapes[0].d).toBe('M0 0L10 0L5 10Z');
    });

    it('drops a shape with no area', () => {
      expect(() => parseSvgArtwork(svg('<rect width="0" height="10" fill="#000"/>'))).toThrow(/nothing to stitch/i);
    });
  });

  describe('inheritance', () => {
    it('takes the fill from an ancestor group', () => {
      const art = parseSvgArtwork(svg('<g fill="#123456"><path d="M0 0h1v1z"/></g>'));
      expect(art.shapes[0].fill).toBe('#123456');
    });

    it("prefers the shape's own style over the attribute and the ancestor", () => {
      const art = parseSvgArtwork(svg('<g fill="#111111"><path d="M0 0h1v1z" fill="#222222" style="fill:#333333"/></g>'));
      expect(art.shapes[0].fill).toBe('#333333');
    });

    it('chains ancestor transforms outermost-first, which is SVG’s own order', () => {
      const art = parseSvgArtwork(svg('<g transform="translate(10,20)"><g transform="scale(2)"><path d="M0 0h1v1z" fill="#000" transform="rotate(45)"/></g></g>'));
      expect(art.shapes[0].transform).toBe('translate(10,20) scale(2) rotate(45)');
    });

    it('does not inherit a self-closing group', () => {
      const art = parseSvgArtwork(svg('<g fill="#ff0000"/><path d="M0 0h1v1z" fill="#00ff00"/>'));
      expect(art.shapes).toHaveLength(1);
      expect(art.shapes[0].fill).toBe('#00ff00');
    });

    it('drops a transform it cannot vouch for rather than refusing the file', () => {
      const art = parseSvgArtwork(svg('<path d="M0 0h1v1z" fill="#000" transform="url(#nope)"/>'));
      expect(art.shapes[0].transform).toBeUndefined();
    });
  });

  describe('what is skipped', () => {
    it('ignores definitions, which are not drawn where they sit', () => {
      const art = parseSvgArtwork(svg('<defs><path d="M9 9h9v9z" fill="#000"/></defs><path d="M0 0h1v1z" fill="#000"/>'));
      expect(art.shapes).toHaveLength(1);
      expect(art.shapes[0].d).toBe('M0 0h1v1z');
    });

    it('counts nesting inside a skipped subtree, so drawing does not resume early', () => {
      const art = parseSvgArtwork(svg('<defs><g><path d="M9 9h9v9z" fill="#000"/></g></defs><path d="M0 0h1v1z" fill="#000"/>'));
      expect(art.shapes).toHaveLength(1);
      expect(art.shapes[0].d).toBe('M0 0h1v1z');
    });

    it('skips an unfilled shape — a stroke is not a fill', () => {
      const art = parseSvgArtwork(svg('<path d="M9 9h9v9z" fill="none" stroke="#000"/><path d="M0 0h1v1z" fill="#000"/>'));
      expect(art.shapes).toHaveLength(1);
    });

    it('drops a comment before anything in it is read as a tag', () => {
      const art = parseSvgArtwork(svg('<!-- <path d="M9 9h9v9z" fill="#000"/> --><path d="M0 0h1v1z" fill="#000"/>'));
      expect(art.shapes).toHaveLength(1);
      expect(art.shapes[0].d).toBe('M0 0h1v1z');
    });
  });

  describe('what it refuses, by name', () => {
    it('a script', () => {
      expect(() => parseSvgArtwork(svg('<script>alert(1)</script><path d="M0 0h1v1z" fill="#000"/>'))).toThrow(/script/i);
    });

    it('an event handler, which needs no script tag', () => {
      expect(() => parseSvgArtwork(svg('<path d="M0 0h1v1z" fill="#000" onload="alert(1)"/>'))).toThrow(/script/i);
    });

    it('a gradient, which has no single colour to lay in one pass', () => {
      expect(() => parseSvgArtwork(svg('<path d="M0 0h1v1z" fill="url(#grad)"/>'))).toThrow(/gradient or a pattern/i);
    });

    it('live text, and says to convert it to outlines', () => {
      expect(() => parseSvgArtwork(svg('<text x="0" y="10" fill="#000">Maria</text>'))).toThrow(/outlines/i);
    });

    it('a photo wrapped in an SVG', () => {
      expect(() => parseSvgArtwork(svg('<image href="data:image/png;base64,AAA" width="10" height="10"/>'))).toThrow(/photo/i);
    });

    it('path data with anything unexpected in it', () => {
      expect(() => parseSvgArtwork(svg('<path d="M0 0 L url(#x)" fill="#000"/>'))).toThrow(/path data/i);
    });

    it('a colour it cannot read, quoting the value back', () => {
      expect(() => parseSvgArtwork(svg('<path d="M0 0h1v1z" fill="chartreuse-ish"/>'))).toThrow(/chartreuse-ish/);
    });

    /**
     * The bug this guards: a wide design was accepted at upload, then refused
     * the moment a customer clicked it — because the editor opens a shape at
     * 30mm wide and a 5:1 design is then 6mm tall, under the machine's 15mm.
     * The customer got the catch-all "that option is no longer available".
     */
    it('a design too far from square to be stitched at any size', () => {
      expect(() => parseSvgArtwork(svg('<rect width="200" height="20" fill="#000"/>', 'viewBox="0 0 200 20"'))).toThrow(/10\.0 times as wide/);
      expect(() => parseSvgArtwork(svg('<rect width="20" height="200" fill="#000"/>', 'viewBox="0 0 20 200"'))).toThrow(/10\.0 times as tall/);
    });

    it('accepts a ratio a customer can actually pick a size for', () => {
      // 5:1 — needs to open at 75mm wide rather than 30mm, which the editor does.
      expect(parseSvgArtwork(svg('<rect width="200" height="40" fill="#000"/>', 'viewBox="0 0 200 40"')).viewBox).toBe('0 0 200 40');
    });

    it('something that is not an SVG', () => {
      expect(() => parseSvgArtwork('not an svg at all')).toThrow(/does not look like/i);
      expect(() => parseSvgArtwork('')).toThrow(/empty/i);
    });
  });

  describe('colours', () => {
    it('expands a 3-digit hex and lower-cases, so one colour is never two spools', () => {
      const art = parseSvgArtwork(svg('<path d="M0 0h1v1z" fill="#ABC"/><path d="M1 1h1v1z" fill="#aabbcc"/>'));
      expect(art.shapes.map((s) => s.fill)).toEqual(['#aabbcc', '#aabbcc']);
      expect(art.colorCount).toBe(1);
    });

    it('reads rgb() and percentages', () => {
      expect(parseSvgArtwork(svg('<path d="M0 0h1v1z" fill="rgb(255, 0, 128)"/>')).shapes[0].fill).toBe('#ff0080');
      expect(parseSvgArtwork(svg('<path d="M0 0h1v1z" fill="rgb(100%,0%,0%)"/>')).shapes[0].fill).toBe('#ff0000');
    });

    it('reads the named colours a tool still emits', () => {
      expect(parseSvgArtwork(svg('<path d="M0 0h1v1z" fill="teal"/>')).shapes[0].fill).toBe('#008080');
    });

    it('defaults to black, which is what an SVG with no fill paints', () => {
      expect(parseSvgArtwork(svg('<path d="M0 0h1v1z"/>')).shapes[0].fill).toBe('#000000');
    });
  });

  it('builds the silhouette from the untransformed shapes, which can share one `d`', () => {
    const art = parseSvgArtwork(svg('<path d="M0 0h1v1z" fill="#000"/><path d="M5 5h1v1z" fill="#000" transform="translate(2,2)"/>'));
    expect(art.path).toBe('M0 0h1v1z');
  });

  it('decodes the XML entities a serialiser writes into an attribute', () => {
    const art = parseSvgArtwork('<svg viewBox="0 0 10 10"><path d="M0 0h1v1z" fill="#000" data-name="a &amp; b"/></svg>');
    expect(art.shapes).toHaveLength(1);
  });

  /**
   * Colour from a `<style>` sheet rather than a `fill` attribute. This is what
   * Illustrator, Affinity and Inkscape export by default, and reading only the
   * attribute stored every such design as a solid black blob — which is then
   * what got stitched.
   */
  describe('stylesheet fills', () => {
    const fills = (body: string, defs = '') => parseSvgArtwork(`<svg viewBox="0 0 10 10">${defs}${body}</svg>`).shapes.map((sh) => sh.fill);

    it('reads the internal CSS a drawing tool exports', () => {
      expect(
        fills('<path class="cls-1" d="M0 0h5v10H0z"/><path class="cls-2" d="M5 0h5v10H5z"/>', '<defs><style>.cls-1{fill:#e74c3c;}.cls-2{fill:#2980b9;}</style></defs>'),
      ).toEqual(['#e74c3c', '#2980b9']);
    });

    it('reads a sheet wrapped in CDATA, which older exports always are', () => {
      expect(fills('<path class="c" d="M0 0h1v1z"/>', '<style><![CDATA[.c{fill:#8e44ad;}]]></style>')).toEqual(['#8e44ad']);
    });

    it('inherits a rule that matched the group, not the shape', () => {
      expect(fills('<g class="g"><path d="M0 0h1v1z"/></g>', '<style>.g{fill:#c0392b}</style>')).toEqual(['#c0392b']);
    });

    it('resolves an element and an id selector too', () => {
      expect(fills('<path d="M0 0h1v1z"/>', '<style>path{fill:#16a085}</style>')).toEqual(['#16a085']);
      expect(fills('<path id="p1" d="M0 0h1v1z"/>', '<style>#p1{fill:#d35400}</style>')).toEqual(['#d35400']);
    });

    it('picks the right rule out of a declaration block and a selector list', () => {
      expect(fills('<path class="a b" d="M0 0h1v1z"/>', '<style>.a{fill-rule:evenodd}.b,.z{fill:#f39c12;stroke:none}</style>')).toEqual(['#f39c12']);
    });

    it('lets a rule beat the presentation attribute, the way a browser does', () => {
      // Not a preference: the admin previews the file itself in an <img>, so
      // these shapes have to end up the colour the browser draws.
      expect(fills('<path class="a" d="M0 0h1v1z" fill="#00ff00"/>', '<style>.a{fill:#ff0000}</style>')).toEqual(['#ff0000']);
    });

    it('lets the style attribute beat the sheet, and an id beat a class', () => {
      expect(fills('<path class="a" d="M0 0h1v1z" style="fill:#123456"/>', '<style>.a{fill:#ff0000}</style>')).toEqual(['#123456']);
      expect(fills('<path id="x" class="a" d="M0 0h1v1z"/>', '<style>#x{fill:#111111}.a{fill:#ff0000}</style>')).toEqual(['#111111']);
    });

    it('takes the later of two rules of equal weight', () => {
      expect(fills('<path class="a" d="M0 0h1v1z"/>', '<style>.a{fill:#ff0000}.a{fill:#0000ff}</style>')).toEqual(['#0000ff']);
    });

    it('leaves a selector it cannot resolve alone rather than guessing', () => {
      // A descendant selector is not resolved, so the shape keeps its attribute
      // — painting it from a rule that might not apply would be worse.
      expect(fills('<path class="a" d="M0 0h1v1z" fill="#00ff00"/>', '<style>g .a{fill:#ff0000}</style>')).toEqual(['#00ff00']);
    });

    it('ignores a rule shut inside an at-rule, whose colour depends on the viewer', () => {
      expect(fills('<path class="a" d="M0 0h1v1z" fill="#00ff00"/>', '<style>@media print{.a{fill:#ff0000}}</style>')).toEqual(['#00ff00']);
    });

    it('still refuses a gradient named by a rule, rather than storing a url', () => {
      expect(() => fills('<path class="a" d="M0 0h1v1z"/>', '<style>.a{fill:url(#grad)}</style>')).toThrow(SvgArtworkError);
    });

    it('does not read a sheet out of a comment', () => {
      expect(fills('<path class="a" d="M0 0h1v1z"/>', '<!-- <style>.a{fill:#ff0000}</style> -->')).toEqual(['#000000']);
    });
  });
});
