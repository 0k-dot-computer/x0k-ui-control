# The page's layout walk: nodes, ids and bounds

```turtle folio:document
implementation:ui-control\/page-walk a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "The in-page library's layout walk: which DOM elements become layout nodes, with roles and names from dom-accessibility-api, how a node keeps its id while its element stands, and how bounds reach the capture's pixels at the scale the capture shows. A test holds the walk's observations of a probe page and of 0k.computer's web UI to the conformance suite's observation claims, in WebKitGTK and headless Chromium." ;
    x0k:concerns "ui-control", "webview", "layout", "conformance" ;
    x0k:motivatedBy intent:30ebc190-f09e-020f-3bc8-7ccc941f5128,
        intent:339ff3c1-44b7-c6c5-9c8c-41dafbaec3a0 ;
    x0k:implements architecture:ui-control-channel ;
    x0k:cites implementation:ui-control\/webview,
        implementation:ui-control\/page-hold,
        implementation:ui-control\/protocol,
        implementation:ui-control\/conformance ;
    folio:tangleCrate "substrate/apps/ui-control-page" ;
    folio:tangleRoot "src/walk.ts" .
```

An observation's layout is a tree of nodes, each with an id, a role and
bounds in the capture's pixels (`x0k:implementation/ui-control/protocol`, "One
observation"). The webview design says which DOM elements become nodes and
how a node keeps its id (`x0k:implementation/ui-control/webview` §3). This
chapter is that walk, in the in-page library beside the hold
(`x0k:implementation/ui-control/page-hold`), and the test that holds it.

The walk runs inside the hold, so the layout it reads is the page state the
capture shows. It reads in CSS pixels. The host scales the read into the
capture's pixels once it has the capture, because only the capture says what
scale its pixels are at.

## What holds

- A node's bounds are its box cut to its clipping ancestors and to the capture,
  in the capture's pixels. `laid_out` is the uncut box, present only when a cut
  changed it.
- A capture's `scale_factor` is its width in pixels over the viewport's width
  in CSS pixels, read in the same hold. Every bound is scaled by it.
- No two nodes of a frame share an id.
- A node keeps its id while its element stands. A sibling inserted before it
  does not move it.
- An element with an author key (`data-ui-id` or `id`) is an anchor: its id is
  the anchor above it, then its key, so an element a framework replaces with
  an equal one keeps the id.
- Open shadow roots, closed ones made after the library was installed, slotted
  children and same-origin frames are walked. A frame of another origin is one
  leaf node whose `source` names why it is opaque.

The walk's observations are held by the conformance suite's own claims, in
Rust: each observation answers its call (`check_observation`, and a capture
that is a PNG of its size), and a node keeps its id from frame to frame.
Neither is ported to TypeScript (webview §5, "One home for the checks"). The
test runs the whole suite against each page, through the page's entry and a
JSON-lines link (`x0k:implementation/ui-control/page-answer`), so the walk is
held as a live run holds any app.

## The scale of a capture

`devicePixelRatio` is what a page says about its pixels. It is not always what
its capture shows. WebKitGTK 2.50 under Xvfb answers a ratio of 1, and takes
the X server's dots per inch as a zoom of about 1.0427: a 1000-pixel-wide
window shows a viewport 959 CSS pixels wide, and its snapshot is 1000 pixels
wide. So the scale comes from the capture: its pixel width over the viewport's
CSS width, read in the hold that the capture is tied to. An observation with
no capture has nothing better than `devicePixelRatio`, and uses it.

The cut to the viewport is made in the capture's pixels, against the capture's
own size. A viewport's CSS size is a whole number the engine rounded down, so
a box cut to it in CSS pixels and then scaled can end a fraction of a pixel
past the capture's edge.

<a name="chunk-observation-file"></a><sub>`src/observation.ts` · `#observation-file` · assembles [observation-scale](#chunk-observation-scale)</sub>

```typescript {#observation-file file="src/observation.ts"}
import type { HeldCapture } from './held-capture.ts';
import type { Box, PageLayout, PageNode } from './walk.ts';

/** A capture as the protocol carries it: a PNG, and its size in pixels. */
export interface Png { png: Uint8Array; width: number; height: number }

/** A layout node as the protocol spells it, in the capture's pixels. */
export interface LayoutNode extends Omit<PageNode, 'box' | 'clipped' | 'children'> {
  bounds: Box;
  laid_out?: Box;
  children: LayoutNode[];
}

/** A part of an observation. */
export type Part = 'capture' | 'layout' | 'state';
/** `observe`'s argument. */
export interface ObserveCall { parts: Part[]; region?: { x: number; y: number; width: number; height: number }; scale?: number }
/** The presentable state, as an observation carries it. */
export interface StatePart { value: unknown; head: string; fingerprint: string }

/** The state as a page declares it: `x0k-ui-protocol`'s `page::DeclaredState`. */
export interface DeclaredState { shape: unknown; value: unknown; head?: string }

/** What a frame shows (`ui-interfaces` §3): the live state, or a state
 * fixture by its handle. */
export type Shown = { kind: 'live' } | { kind: 'fixture'; handle: string };

/** What the page reads in one task for an observation: its layout, always,
 * since the viewport sets the scale, what it shows, and its state as declared
 * when the call asks for it. */
export interface PageRead {
  layout: PageLayout;
  shown?: Shown;
  state?: DeclaredState;
}

/** A page's read with its state made the protocol's state part by its host. */
export interface PinnedRead {
  layout: PageLayout;
  shown?: Shown;
  state?: StatePart;
}

/** `observe`'s answer. */
export interface Observation {
  frame: string;
  capture?: { png: number[]; width: number; height: number; scale_factor: number };
  layout?: LayoutNode;
  state?: StatePart;
  refused: { part: Part; code?: string; why: string }[];
  shown: Shown;
}

/** The call the walk's own test makes. */
export const CAPTURE_AND_LAYOUT: ObserveCall = { parts: ['capture', 'layout'] };

<<observation-scale>>
```

<a name="chunk-observation-scale"></a><sub>`src/walk.ts` · `#observation-scale`</sub>

```typescript {#observation-scale}
const intersect = (a: Box, b: Box): Box => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
};
const same = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** Why a host that captures the whole page at its own scale cannot answer
 * `call`'s capture, when it cannot: a call that names a region or a scale. */
export function wholeCaptureOnly(call: ObserveCall): string | undefined {
  if (call.region) return 'this host captures the whole page, not a region';
  if (call.scale !== undefined && call.scale !== null && call.scale !== 1) return 'this host captures at the page\'s own scale';
  return undefined;
}

/** The observation a held capture makes for `call`: the walk's read in the
 * capture's pixels, at the scale the capture shows, with the parts it asks
 * for, the state as the host pinned it, and what the page showed when it was
 * read, live unless the read names a fixture. */
export function observation(held: HeldCapture<PinnedRead, Png>, call: ObserveCall = CAPTURE_AND_LAYOUT): Observation {
  const { viewport, ratio, root } = held.read.layout;
  const capture = held.capture;
  const scale = capture ? capture.width / viewport.width : ratio;
  const frame: Box = { x: 0, y: 0, width: capture?.width ?? viewport.width * scale, height: capture?.height ?? viewport.height * scale };
  const scaled = (b: Box): Box => ({ x: b.x * scale, y: b.y * scale, width: b.width * scale, height: b.height * scale });
  const node = ({ box, clipped, children, ...rest }: PageNode): LayoutNode => {
    const bounds = intersect(scaled(clipped), frame);
    const laidOut = scaled(box);
    return { ...rest, bounds, laid_out: same(bounds, laidOut) ? undefined : laidOut, visible: rest.visible && bounds.width > 0 && bounds.height > 0, children: children.map(node) };
  };
  const asked = (part: Part) => call.parts.includes(part);
  const refused: Observation['refused'] = [];
  if (asked('capture') && held.refused) refused.push(held.refused);
  if (asked('state') && !held.read.state) refused.push({ part: 'state', why: 'the page declares no state' });
  return {
    frame: held.frame,
    capture: asked('capture') && capture ? { png: [...capture.png], width: capture.width, height: capture.height, scale_factor: scale } : undefined,
    layout: asked('layout') ? node(root) : undefined,
    state: asked('state') ? held.read.state : undefined,
    refused,
    shown: held.read.shown ?? { kind: 'live' },
  };
}
```

## Which elements become nodes

The DOM holds many wrappers that mean nothing to a person. The walk keeps an
element that has any of these, and promotes the children of the rest to the
nearest node above:

- a role other than `generic`, `none` or `presentation`, explicit or implied
  by its tag;
- an accessible name;
- a place in the tab order, or editable content;
- a declared action, `data-ui-action`;
- text of its own, in a child text node;
- an author key;
- a frame.

An element the page does not render (`display: none`) is not walked, nor is
anything under it. Role and name come from `dom-accessibility-api`, which
implements the ARIA role mapping and the accessible-name computation. It is a
pinned dependency of the package, and esbuild bundles it into the page script.

<a name="chunk-walk-node"></a><sub>`src/walk.ts` · `#walk-node`</sub>

```typescript {#walk-node}
const INTERACTIVE_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'textbox', 'searchbox', 'combobox',
  'listbox', 'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'slider', 'spinbutton', 'treeitem', 'gridcell']);
const UNNAMED_ROLES = new Set(['generic', 'none', 'presentation']);
const SKIPPED = new Set(['head', 'script', 'style', 'template', 'noscript']);

const isFrame = (el: Element) => el.localName === 'iframe' || el.localName === 'frame';
const frameDocument = (el: Element): Document | null => {
  if (!isFrame(el)) return null;
  try { return (el as HTMLIFrameElement).contentDocument; } catch { return null; }
};
const ownText = (el: Element) => [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
const focusable = (el: Element) => ((el as HTMLElement).tabIndex ?? -1) >= 0 || (el as HTMLElement).isContentEditable === true;
const valueOf = (el: Element): string | undefined => {
  if (el.localName === 'input' || el.localName === 'textarea' || el.localName === 'select') return String((el as HTMLInputElement).value);
  return el.getAttribute('aria-valuetext') ?? el.getAttribute('aria-valuenow') ?? undefined;
};
/** The deepest focused element, through shadow roots and frames. */
const deepestFocus = (doc: Document): Element | null => {
  let at = doc.activeElement;
  for (;;) {
    const inner = at?.shadowRoot?.activeElement ?? (at ? frameDocument(at)?.activeElement : null) ?? null;
    if (!inner || inner === at) return at;
    at = inner;
  }
};
```

## Ids

An anchor's id is the anchor above it, then its key. Beneath an anchor, an
element's id is its parent node's id, then its role, with its index among its
parent's nodes of that role when it is not the first: `toolbar/button[2]`.
The library remembers each element's id while the element stands, so a
sibling inserted before it, which shifts its index, does not move its id. An
element first seen whose id an element still standing holds, or a node of this
walk already has, takes the first free suffix, `~2`, `~3` and on. The root is
`document`.

An anchored element takes the id its key gives, remembered or not, so one a
framework replaced with an equal element has its old id. As in the shell, an
unanchored element that is replaced takes the path it is found at.

<a name="chunk-walk-ids"></a><sub>`src/walk.ts` · `#walk-ids`</sub>

```typescript {#walk-ids}
// Each element's id, while it stands, and the element that holds each id.
const remembered = new WeakMap<Element, string>();
const owners = new Map<string, WeakRef<Element>>();
const heldByAnother = (id: string, el: Element) => {
  const owner = owners.get(id)?.deref();
  return owner !== undefined && owner !== el && owner.isConnected;
};
/** The id of `el`, found at `path`: its remembered id while it stands, unless
 * it is anchored, and a suffixed one when another standing element holds it. */
const idFor = (el: Element, path: string, anchored: boolean, used: Set<string>): string => {
  const kept = remembered.get(el);
  const base = !anchored && kept !== undefined ? kept : path;
  let id = base;
  for (let n = 2; used.has(id) || heldByAnother(id, el); n++) id = `${base}~${n}`;
  used.add(id);
  remembered.set(el, id);
  owners.set(id, new WeakRef(el));
  return id;
};
```

## Boxes

A box is read with `getBoundingClientRect`, which answers the axis-aligned box
of a transformed element, and shifted by the offsets of the frames it sits in.
An element whose overflow is not `visible` cuts what is under it to its padding
box, its border box less its borders, read from the same fractional box as
everything else, since `clientWidth` is rounded to a whole CSS pixel. A
scrollbar inside the padding box is painted, and the cut keeps it. CSS makes
both axes clip when either does, so the cut is a rectangle. A
cut reaches only the descendants whose containing block it holds: an
absolutely positioned element escapes the cuts of the unpositioned ancestors
between it and its containing block, and a fixed one escapes every cut but one
made inside a transformed ancestor. So the walk carries three cuts down: one
for elements in flow, one for absolutely positioned ones, and one for fixed
ones. The root element's overflow applies to the viewport, and so does the
body's when the root's is `visible`, so neither cuts like an element's.

<a name="chunk-walk-boxes"></a><sub>`src/walk.ts` · `#walk-boxes`</sub>

```typescript {#walk-boxes}
const intersect = (a: Box, b: Box): Box => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
};
const boxOf = (el: Element, by: Offset): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.x + by.x, y: r.y + by.y, width: r.width, height: r.height };
};
const overflows = (style: CSSStyleDeclaration) => style.overflowX !== 'visible' || style.overflowY !== 'visible';
/** The box `el` cuts its descendants to: its padding box, when its overflow clips. */
const clipOf = (el: Element, style: CSSStyleDeclaration, by: Offset): Box | null => {
  const doc = el.ownerDocument;
  if (!overflows(style) || el === doc.documentElement) return null;
  if (el === doc.body && !overflows(doc.defaultView!.getComputedStyle(doc.documentElement))) return null;
  const r = boxOf(el, by);
  const [left, top, right, bottom] = [style.borderLeftWidth, style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth].map(parseFloat);
  return { x: r.x + left, y: r.y + top, width: r.width - left - right, height: r.height - top - bottom };
};
/** The cuts `el`'s descendants take: its own, cut by its overflow, for those
 * in flow, and the cut of their containing block for those positioned. */
const cutsBelow = (el: Element, style: CSSStyleDeclaration, at: Cuts, own: Box, by: Offset): Cuts => {
  const cut = clipOf(el, style, by);
  const flow = cut ? intersect(own, cut) : own;
  const transformed = style.transform !== 'none';
  return { flow, absolute: style.position !== 'static' || transformed ? flow : at.absolute, fixed: transformed ? flow : at.fixed };
};
/** The cut `el` itself takes, by how it is positioned. */
const cutFor = (style: CSSStyleDeclaration, at: Cuts): Box =>
  style.position === 'fixed' ? at.fixed : style.position === 'absolute' ? at.absolute : at.flow;
/** Where a frame's own viewport lies in the top window, and the box it shows. */
const frameView = (el: Element, style: CSSStyleDeclaration, by: Offset): { by: Offset; box: Box } => {
  const r = boxOf(el, by);
  const [left, top, right, bottom] = [style.paddingLeft, style.paddingTop, style.paddingRight, style.paddingBottom].map(parseFloat);
  const at = { x: r.x + el.clientLeft + left, y: r.y + el.clientTop + top };
  return { by: at, box: { ...at, width: el.clientWidth - left - right, height: el.clientHeight - top - bottom } };
};
```

## The walk

The walk follows the flat tree: a shadow root's children in place of its
host's, a slot's assigned elements where it shows them, and a frame's document
under the frame's node. Each node records its box, the box cut to what clips
it, and the rest of the fields of the protocol's `LayoutNode`:

- `value`: an input's value, or `aria-valuetext`, or `aria-valuenow`;
- `visible`: `checkVisibility` with `visibility` taken into account, and a cut
  box of some area;
- `enabled`: not `:disabled`, and no ancestor with `aria-disabled="true"`;
- `focused`: the deepest focused element, through shadow roots and frames;
- `interactive`: in the tab order, an interactive role, or a declared action;
- `action`: `data-ui-action`;
- `source`: set on a frame of another origin, which is opaque.

<a name="chunk-walk-tree"></a><sub>`src/walk.ts` · `#walk-tree`</sub>

```typescript {#walk-tree}
const flatChildren = (el: Element): Element[] => {
  if (el.localName === 'slot') {
    const shown = (el as HTMLSlotElement).assignedElements({ flatten: true });
    return shown.length > 0 ? shown : [...el.children];
  }
  return [...(hold.shadowRoot(el) ?? el.shadowRoot ?? el).children];
};

const layout = (): PageLayout => {
  for (const [id, owner] of owners) if (owner.deref() === undefined) owners.delete(id);
  const doc = win.document;
  const viewport = { x: 0, y: 0, width: win.innerWidth, height: win.innerHeight };
  const root: PageNode = { id: ROOT_ID, role: 'document', label: doc.title || undefined, box: viewport, clipped: viewport,
    visible: true, enabled: true, focused: false, interactive: false, children: [] };
  const used = new Set([ROOT_ID]);
  const focus = deepestFocus(doc);

  const visit = (el: Element, at: Place) => {
    if (SKIPPED.has(el.localName)) return;
    const style = el.ownerDocument.defaultView!.getComputedStyle(el);
    if (style.display === 'none') return;
    const role = getRole(el);
    const label = computeAccessibleName(el) || undefined;
    const action = el.getAttribute('data-ui-action') ?? undefined;
    const key = el.getAttribute('data-ui-id') ?? (el.id || null);
    const keep = key !== null || (role !== null && !UNNAMED_ROLES.has(role)) || label !== undefined || focusable(el)
      || action !== undefined || ownText(el) || isFrame(el);
    let here = at;
    if (keep) {
      const nodeRole = role ?? 'generic';
      const index = (at.roles.get(nodeRole) ?? 0) + 1;
      at.roles.set(nodeRole, index);
      const segment = index > 1 ? `${nodeRole}[${index}]` : nodeRole;
      const path = key !== null ? (at.anchor ? `${at.anchor}/${key}` : key) : (at.parent === root ? segment : `${at.parent.id}/${segment}`);
      const id = idFor(el, path, key !== null, used);
      const box = boxOf(el, at.by);
      const clipped = intersect(box, cutFor(style, at.cuts));
      const shown = typeof el.checkVisibility !== 'function' || el.checkVisibility({ visibilityProperty: true } as CheckVisibilityOptions);
      const node: PageNode = { id, role: nodeRole, label, value: valueOf(el), box, clipped,
        visible: shown && clipped.width > 0 && clipped.height > 0,
        enabled: !el.matches(':disabled') && el.closest('[aria-disabled="true"]') === null,
        focused: el === focus, interactive: focusable(el) || INTERACTIVE_ROLES.has(nodeRole) || action !== undefined,
        action, children: [] };
      at.parent.children.push(node);
      here = { ...at, anchor: key !== null ? id : at.anchor, parent: node, roles: new Map() };
    }
    here = { ...here, cuts: cutsBelow(el, style, at.cuts, cutFor(style, at.cuts), at.by) };
    if (isFrame(el)) {
      const inner = frameDocument(el);
      if (!inner?.documentElement) {
        here.parent.source = 'opaque: a frame of another origin';
        return;
      }
      const view = frameView(el, style, at.by);
      const shows = intersect(here.cuts.flow, view.box);
      const inFrame = { ...here, by: view.by, cuts: { flow: shows, absolute: shows, fixed: shows } };
      for (const child of [...inner.documentElement.children]) visit(child, inFrame);
      return;
    }
    for (const child of flatChildren(el)) visit(child, here);
  };

  const top: Place = { anchor: '', parent: root, cuts: { flow: viewport, absolute: viewport, fixed: viewport }, by: { x: 0, y: 0 }, roles: new Map() };
  for (const child of [...doc.documentElement.children]) visit(child, top);
  return { root, viewport: { width: viewport.width, height: viewport.height }, ratio: win.devicePixelRatio };
};
```

The walk's file holds its types and installs it beside a hold, whose shadow
roots it reaches.

<a name="chunk-walk-file"></a><sub>`src/walk.ts` · `#walk-file` · assembles [walk-node](#chunk-walk-node) · [walk-boxes](#chunk-walk-boxes) · [walk-ids](#chunk-walk-ids) · [walk-tree](#chunk-walk-tree)</sub>

```typescript {#walk-file file="src/walk.ts"}
import { computeAccessibleName, getRole } from 'dom-accessibility-api';
import type { Hold } from './hold.ts';

/** A rectangle, in CSS pixels of the top window's viewport. */
export interface Box { x: number; y: number; width: number; height: number }

/** One node of the page's layout, as the walk reads it in CSS pixels. */
export interface PageNode {
  id: string;
  role: string;
  label?: string;
  value?: string;
  /** The box the node was laid out in. */
  box: Box;
  /** That box cut to what clips it in the page. */
  clipped: Box;
  visible: boolean;
  enabled: boolean;
  focused: boolean;
  interactive: boolean;
  action?: string;
  source?: string;
  children: PageNode[];
}

/** What one walk reads: the tree, the viewport's size in CSS pixels, and the
 * device pixel ratio the page answers. */
export interface PageLayout {
  root: PageNode;
  viewport: { width: number; height: number };
  ratio: number;
}

/** The page's layout walk. */
export interface Walk {
  layout(): PageLayout;
}

/** The root node's id. */
export const ROOT_ID = 'document';

type Offset = { x: number; y: number };
/** What cuts an element in flow, an absolutely positioned one and a fixed one. */
interface Cuts { flow: Box; absolute: Box; fixed: Box }
/** Where the walk is: the anchor above, the node children join, what cuts
 * them, the frame offset, and how many of each role the node has so far. */
interface Place { anchor: string; parent: PageNode; cuts: Cuts; by: Offset; roles: Map<string, number> }

<<walk-node>>

<<walk-boxes>>

/** Install the walk in `win`, beside `hold`, whose shadow roots it reaches. */
export function installWalk(win: Window, hold: Hold): Walk {
  <<walk-ids>>
  <<walk-tree>>
  return { layout };
}
```

The library's entry installs both, and the page's answers
(`x0k:implementation/ui-control/page-answer`), and names the globals a host
reaches them by.

<a name="chunk-page-globals"></a><sub>`src/page-globals.ts` · `#page-globals`</sub>

```typescript {#page-globals file="src/page-globals.ts"}
/** The global a host reaches the injected hold through. */
export const PAGE_GLOBAL = '__x0kUiHold';
/** The global a host reaches the injected layout walk through. */
export const WALK_GLOBAL = '__x0kUiWalk';
/** The global a page installs the library through, and a host asks its answers through. */
export const UI_GLOBAL = '__x0kUi';
```

<a name="chunk-page-entry"></a><sub>`src/page.ts` · `#page-entry`</sub>

```typescript {#page-entry file="src/page.ts"}
import { installAnswers } from './answer.ts';
import { installHold } from './hold.ts';
import { PAGE_GLOBAL, UI_GLOBAL, WALK_GLOBAL } from './page-globals.ts';
import { installWalk } from './walk.ts';

const hold = installHold(window);
const walk = installWalk(window, hold);
(globalThis as any)[PAGE_GLOBAL] = hold;
(globalThis as any)[WALK_GLOBAL] = walk;
(globalThis as any)[UI_GLOBAL] = installAnswers(window, hold, walk);
```

## The walk page

The test's own page has one of each thing the walk must get right, and a
mover painted by script on every animation frame, as the hold's probe page
has, so its pixels show whether a node's bounds lie on them.

<a name="chunk-walk-page"></a><sub>`tests/walk-page.html` · `#walk-page`</sub>

```html {#walk-page file="tests/walk-page.html"}
<!doctype html>
<html><head><meta charset="utf-8"><title>walk probe</title><style>
html, body { margin: 0; background: #fff; overflow: hidden; }
#mover { position: absolute; left: 0; top: 10px; width: 40px; height: 40px; background: rgb(0, 0, 255); }
#bar { position: absolute; left: 100px; top: 60px; width: 1200px; height: 10px; background: #ccc; }
#box { position: absolute; left: 10px; top: 80px; width: 100px; height: 40px; overflow: hidden; }
#box button { width: 200px; }
[data-ui-id="toolbar"] { position: absolute; left: 10px; top: 130px; }
.twin { position: absolute; left: 10px; top: 170px; }
#hosts { position: absolute; left: 10px; top: 210px; }
iframe { position: absolute; left: 300px; top: 130px; width: 160px; height: 80px; border: 2px solid #000; }
</style></head><body>
<div id="mover"></div>
<div id="bar"></div>
<div id="box"><button>clipped</button></div>
<div data-ui-id="toolbar" role="toolbar"><button>alpha</button><button>beta</button><button>gamma</button></div>
<div class="twin" data-ui-id="twin">one twin</div><div class="twin" data-ui-id="twin" style="left: 100px">other twin</div>
<div id="hosts"><span id="open-host"></span><span id="closed-host"></span></div>
<iframe srcdoc="<button>inside</button>"></iframe>
<script>
// The mover moves by script to the count mod 200 CSS pixels on each frame.
let count = 0;
const mover = document.getElementById('mover');
function tick() {
  count += 1;
  mover.style.left = `${count % 200}px`;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
// One open shadow root and one closed one, made after the library installed.
document.getElementById('open-host').attachShadow({ mode: 'open' }).innerHTML = '<button>in open shadow</button>';
document.getElementById('closed-host').attachShadow({ mode: 'closed' }).innerHTML = '<button>in closed shadow</button>';
</script></body></html>
```

## The test

The test runs the walk page and 0k.computer's web UI in the four engines the
hold's test uses, and in WebKitGTK on an X server at 144 dots per inch, which
WebKitGTK takes as a zoom of 1.5 while it answers a `devicePixelRatio` of 1.
In each it takes eight held observations of the capture and
the layout, for the claims on pixels. The claims:

1. The page holds to the conformance suite:
   `ui-conformance --json-lines` runs against the page and finds no claim
   broken, the node-id claim among those held.
2. A node's bounds lie on its pixels: the mover's left edge in the capture is
   its bounds' left edge, within 1.5 capture pixels, at the scale the capture
   shows.
3. Bounds are cut to clipping ancestors, and `laid_out` keeps the uncut box.
4. A node keeps its id when a sibling is inserted before it.
5. Open and closed shadow roots and a same-origin frame are walked, and a
   frame's nodes lie inside the frame.
6. A mutation inside a same-origin frame moves the epoch.
7. On 0k.computer, the walk finds the page's controls: more than ten
   interactive nodes.

Claim 1 quotes the suite's report when it fails.

<a name="chunk-walk-test-file"></a><sub>`tests/walk.test.ts` · `#walk-test-file` · assembles [walk-test-helpers](#chunk-walk-test-helpers) · [walk-test-page](#chunk-walk-test-page) · [walk-test-zerok](#chunk-walk-test-zerok)</sub>

```typescript {#walk-test-file file="tests/walk.test.ts"}
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { heldCapture } from '../src/held-capture.ts';
import { CAPTURE_AND_LAYOUT, type LayoutNode, type Observation, observation } from '../src/observation.ts';
import { PAGE_GLOBAL, UI_GLOBAL, WALK_GLOBAL, pageScript } from '../src/page-script.ts';
import { chromium } from './hosts/chromium.ts';
import type { Engine, Image } from './hosts/engine.ts';
import { suite } from './hosts/suite.ts';
import { webkitgtk } from './hosts/webkitgtk.ts';
import { ZEROK_HERE, zeroKComputer } from './hosts/zerok.ts';

const WALK_PAGE = fileURLToPath(new URL('./walk-page.html', import.meta.url));
const SIZE = { width: 800, height: 500 };
const OBSERVATIONS = 8;
/** How far, in capture pixels, an element's painted edge may lie from its bounds. */
const EDGE_SLACK = 1.5;
const CALL = CAPTURE_AND_LAYOUT;

<<walk-test-helpers>>

const ENGINES: [string, (page: string) => Promise<Engine>][] = [
  ['webkitgtk composited', (page) => webkitgtk(page, pageScript(), { ...SIZE, compositing: true })],
  ['webkitgtk not composited', (page) => webkitgtk(page, pageScript(), { ...SIZE, compositing: false })],
  ['webkitgtk at 144 dpi', (page) => webkitgtk(page, pageScript(), { ...SIZE, compositing: true, dpi: 144 })],
  ['chromium at ratio 1', (page) => chromium(page, pageScript(), { ...SIZE, ratio: 1 })],
  ['chromium at ratio 2', (page) => chromium(page, pageScript(), { ...SIZE, ratio: 2 })],
];
/** HOLD_ENGINES narrows the run to the engines whose names hold one of its words. */
const only = process.env.HOLD_ENGINES?.split(',');
const zerok = ZEROK_HERE ? zeroKComputer() : undefined;
after(async () => { await (await zerok)?.close(); });

for (const [name, start] of ENGINES.filter(([name]) => !only || only.some((o) => name.includes(o)))) {
  <<walk-test-page>>
  <<walk-test-zerok>>
}
```

The host's side is the hold's, with the walk as the reader. Each observation
keeps the image it was judged against.

<a name="chunk-walk-test-helpers"></a><sub>`src/walk.ts` · `#walk-test-helpers`</sub>

```typescript {#walk-test-helpers}
type Observed = { observation: Observation; image: Image };

/** Hold the page with the walk as its reader, capture, verify, and make the observation. */
async function observe(engine: Engine): Promise<Observed> {
  let image: Image | undefined;
  const held = await heldCapture({
    hold: async () => JSON.parse(await engine.evaluate(`return JSON.stringify(await globalThis.${PAGE_GLOBAL}.hold(() => globalThis.${UI_GLOBAL}.read(${JSON.stringify(CALL)})));`)),
    capture: async () => { image = await engine.capture(); return image; },
    verify: async () => Number(await engine.evaluate(`return String(globalThis.${PAGE_GLOBAL}.verify());`)),
  });
  return { observation: observation(held, CALL), image: image! };
}

async function observations(engine: Engine): Promise<Observed[]> {
  const seen: Observed[] = [];
  for (let i = 0; i < OBSERVATIONS; i++) {
    await sleep(Math.floor(Math.random() * 40));
    seen.push(await observe(engine));
  }
  return seen;
}

const nodes = (root: LayoutNode): LayoutNode[] => [root, ...root.children.flatMap(nodes)];
const named = (root: LayoutNode, label: string) => nodes(root).find((n) => n.label === label);
const blue = ([r, g, b]: number[]) => b > 200 && r < 60 && g < 60;
/** The first pixel in row `y` whose colour `is`, from the left. */
function firstIn(image: Image, y: number, is: (rgb: [number, number, number]) => boolean): number | null {
  for (let x = 0; x < image.width; x++) if (is(image.rgb(x, Math.round(y)))) return x;
  return null;
}
const within = (inner: { x: number; y: number; width: number; height: number }, outer: typeof inner) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
const evaluateJson = async (engine: Engine, body: string) => JSON.parse(await engine.evaluate(body));
```

The walk page's claims, in one engine:

<a name="chunk-walk-test-page"></a><sub>`src/walk.ts` · `#walk-test-page`</sub>

```typescript {#walk-test-page}
describe(`the walk page in ${name}`, () => {
  let engine: Engine;
  let seen: Observed[];
  before(async () => {
    engine = await start(WALK_PAGE);
    await sleep(300);
    seen = await observations(engine);
  });
  after(async () => { await engine?.close(); });

  test('the page holds to the conformance suite', async () => {
    const { held, report } = await suite(engine, []);
    assert.ok(held, report);
    assert.match(report, /holds +§8 a node keeps its id from frame to frame/, report);
  });
  test('a node\'s bounds lie on its pixels, at the scale the capture shows', async (t) => {
    const ratio = Number(await engine.evaluate('return String(devicePixelRatio)'));
    const misses = seen.map(({ observation, image }) => {
      const mover = nodes(observation.layout).find((n) => n.id === 'mover')!;
      const k = observation.capture!.scale_factor;
      const painted = firstIn(image, (10 + 20) * k, blue);
      return { bounds: mover.bounds.x, painted, scale: k };
    }).filter(({ bounds, painted }) => painted === null || Math.abs(painted - bounds) > EDGE_SLACK);
    t.diagnostic(`scale_factor ${seen[0].observation.capture!.scale_factor.toFixed(4)}, devicePixelRatio ${ratio}, capture ${seen[0].image.width} wide`);
    assert.deepEqual(misses, []);
  });
  test('bounds are cut to clipping ancestors, and laid_out keeps the uncut box', () => {
    const { layout, capture } = seen[0].observation;
    const clipped = named(layout, 'clipped')!;
    const box = nodes(layout).find((n) => n.id === 'box')!;
    assert.ok(clipped.laid_out && clipped.laid_out.width > clipped.bounds.width, JSON.stringify(clipped));
    assert.ok(within(clipped.bounds, box.bounds), JSON.stringify({ clipped, box: box.bounds }));
    const bar = nodes(layout).find((n) => n.id === 'bar')!;
    assert.equal(bar.bounds.x + bar.bounds.width, capture!.width, JSON.stringify(bar));
  });
  test('a node keeps its id when a sibling is inserted before it', async () => {
    const before = await evaluateJson(engine, `return JSON.stringify(globalThis.${WALK_GLOBAL}.layout());`);
    await engine.evaluate(`const b = document.createElement('button'); b.textContent = 'new'; document.querySelector('[data-ui-id=toolbar]').prepend(b); return '';`);
    const after = await evaluateJson(engine, `return JSON.stringify(globalThis.${WALK_GLOBAL}.layout());`);
    const ids = (layout: any) => Object.fromEntries(nodes(layout.root as LayoutNode).filter((n) => n.label).map((n) => [n.label, n.id]));
    const [was, now] = [ids(before), ids(after)];
    for (const label of ['alpha', 'beta', 'gamma']) assert.equal(now[label], was[label], `${label}: ${JSON.stringify({ was, now })}`);
    assert.ok(now.new && !Object.values(was).includes(now.new), JSON.stringify(now));
  });
  test('open and closed shadow roots and a same-origin frame are walked', () => {
    const { layout } = seen[0].observation;
    for (const label of ['in open shadow', 'in closed shadow', 'inside']) assert.ok(named(layout, label), `${label} not walked`);
    const frame = nodes(layout).find((n) => n.children.some((c) => nodes(c).some((d) => d.label === 'inside')))!;
    assert.ok(within(named(layout, 'inside')!.bounds, frame.bounds), JSON.stringify(frame));
  });
  test('a mutation inside a same-origin frame moves the epoch', async () => {
    const { before, after } = await evaluateJson(engine, `
      const hold = globalThis.${PAGE_GLOBAL};
      await hold.hold(() => 0);
      const before = hold.epoch();
      const inner = document.querySelector('iframe').contentDocument;
      inner.body.append(inner.createElement('p'));
      const after = hold.epoch();
      hold.verify();
      return JSON.stringify({ before, after });`);
    assert.ok(after > before, `the epoch was ${before} and then ${after}`);
  });
});
```

0k.computer's web UI is built and served by the test (`tests/hosts/zerok.ts`,
below). With no daemon behind it, it shows its shell and its controls and
says it cannot reach its daemon, which is a page like any other to the walk.

<a name="chunk-walk-test-zerok"></a><sub>`src/walk.ts` · `#walk-test-zerok`</sub>

```typescript {#walk-test-zerok}
describe(`0k.computer in ${name}`, { skip: !ZEROK_HERE && '0k.computer is not part of this repository' }, () => {
  let engine: Engine;
  let seen: Observed[];
  before(async () => {
    engine = await start((await zerok)!.url);
    await sleep(2000);
    seen = await observations(engine);
  });
  after(async () => { await engine?.close(); });

  test('the page holds to the conformance suite', async () => {
    const { held, report } = await suite(engine, []);
    assert.ok(held, report);
    assert.match(report, /holds +§8 a node keeps its id from frame to frame/, report);
  });
  test('the walk finds the page\'s controls', (t) => {
    const interactive = nodes(seen[0].observation.layout).filter((n) => n.interactive);
    t.diagnostic(`${nodes(seen[0].observation.layout).length} nodes, ${interactive.length} interactive, scale_factor ${seen[0].observation.capture?.scale_factor.toFixed(4)}`);
    assert.ok(interactive.length > 10, JSON.stringify(interactive.map((n) => n.id)));
  });
});
```

## Serving 0k.computer

In the published cut, which holds the library and not 0k.computer, the
0k.computer pages are skipped by name; the walk page holds the same claims.

The test builds 0k.computer as its own `vite build` does, into a scratch
directory, and serves it over HTTP on a port of its own, since its bundle
names its assets from the root. Two things differ from the app's build. Its
renderer is a WebAssembly module that `wasm-pack` builds from a Rust crate,
and the walk reads the DOM and not the canvas, so the import resolves to a
module whose `init` refuses, and the app takes its path for a missing
renderer. And the server answers every request it has no file for with 404,
the app's API calls among them, so nothing reaches a daemon. The app's own
dependencies are its `package-lock.json`'s: `npm ci` in
`substrate/apps/0k.computer` installs them.

<a name="chunk-zerok-file"></a><sub>`tests/hosts/zerok.ts` · `#zerok-file`</sub>

```typescript {#zerok-file file="tests/hosts/zerok.ts"}
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ownedTempDir } from '../../../../../tools/owned-process.mjs';

const APP = fileURLToPath(new URL('../../../0k.computer/', import.meta.url));
/** Whether this repository holds 0k.computer: x0k's does, the published cut does not. */
export const ZEROK_HERE = existsSync(join(APP, 'package.json'));
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.json': 'application/json' };

/** 0k.computer's web UI, built into a scratch directory and served on a port of its own. */
export async function zeroKComputer(): Promise<{ url: string; close(): Promise<void> }> {
  const vite = join(APP, 'node_modules/vite/dist/node/index.js');
  if (!existsSync(vite)) throw new Error(`0k.computer's dependencies are not installed: npm ci in ${APP}`);
  const { build } = await import(pathToFileURL(vite).href);
  const out = ownedTempDir('x0k-walk-0k-computer-');
  const noRenderer = {
    name: 'no-renderer', enforce: 'pre',
    resolveId: (id: string) => (id.includes('wasm/render-vello/') ? '\0no-renderer' : undefined),
    load: (id: string) => (id === '\0no-renderer' ? 'export default async function init() { throw new Error("no renderer in this build"); }' : undefined),
  };
  await build({ root: APP, configFile: join(APP, 'vite.config.ts'), plugins: [noRenderer], logLevel: 'error', build: { outDir: out, emptyOutDir: true } });
  const server = createServer((req, res) => {
    let file = join(out, decodeURIComponent(new URL(req.url ?? '/', 'http://page').pathname));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(out) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}/`, close: () => new Promise<void>((done) => server.close(() => done())) };
}
```

## Running it

From the repository root, in the dev shell, with both packages' dependencies
installed and the suite's program built:

```
npm ci --prefix substrate/apps/0k.computer && npm ci --prefix substrate/apps/ui-control-page
tools/build-run -- nix develop /home/lsp/src/l30/main -c cargo build -p x0k-ui-endpoint --bin ui-conformance
nix develop /home/lsp/src/l30/main -c node --test substrate/apps/ui-control-page/tests/walk.test.ts
```

It needs Node 24 or later, the dev shell's Chromium, Xvfb and
`x0k-webkitgtk-python`, and takes about 25 seconds for all five engines.

## What the test shows

Measured on arca with Chromium 148.0.7778.178 and WebKitGTK 2.50.4, eight
observations per page and engine. All 40 claims hold:

```
✔ the walk page in webkitgtk composited
✔ 0k.computer in webkitgtk composited
✔ the walk page in webkitgtk not composited
✔ 0k.computer in webkitgtk not composited
✔ the walk page in webkitgtk at 144 dpi
✔ 0k.computer in webkitgtk at 144 dpi
✔ the walk page in chromium at ratio 1
✔ 0k.computer in chromium at ratio 1
✔ the walk page in chromium at ratio 2
✔ 0k.computer in chromium at ratio 2
ℹ pass 40
ℹ fail 0
```

The suite found no claim broken on any page. On 0k.computer the
walk found 37 nodes, 14 of them interactive, in every engine. WebKitGTK under
Xvfb answered a `devicePixelRatio` of 1, and its 800-pixel capture showed a
viewport 767 CSS pixels wide, a `scale_factor` of 1.0430. At 144 dots per
inch it answered 1 again, and its capture showed a viewport 532 CSS pixels
wide, a `scale_factor` of 1.5038. At both, the mover's bounds lay on its
pixels in every observation. Chromium's scale was 1 and 2, its
`devicePixelRatio`.

Each mutation below turns the test red for its own reason. Claim 1 then
held the observations the test recorded to the suite's observation claims;
it now runs the whole suite live, and the uncut bounds were measured red
again that way, with the same `NodeOutsideCapture` faults. Each was made in
this chapter or the hold's, tangled, and run in WebKitGTK composited and
Chromium at ratio 1:

| The walk with | What goes red | Seen |
|---|---|---|
| bounds scaled by `devicePixelRatio` | claims 2 and 3, in WebKitGTK only | `{ bounds: 76.99, painted: 80, scale: 1 }`, and the bar ending at 767 of 800; at 144 dpi `{ bounds: 32.99, painted: 50, scale: 1 }` |
| bounds not cut | claims 1 and 3; claim 1 on 0k.computer in WebKitGTK | `BROKEN §8 an observation of [Capture, Layout] answers its call: NodeOutsideCapture { id: "bar" }`; on 0k.computer `NodeOutsideCapture { id: "root" }` |
| no suffix for an id another element holds | claims 1 and 4 | `DuplicateNode { id: "twin" }`; the new button and alpha both `toolbar/button` |
| no remembered ids | claim 4 | alpha `toolbar/button` became `toolbar/button[2]` |
| ids that last one walk | claim 1 on both pages | `BROKEN §8 a node keeps its id from frame to frame: Some("making-root#0.47…") was gone a frame later` |
| no watch on frames, in the hold | claim 6 | `the epoch was 50 and then 50` |
| closed shadow roots not kept, in the hold | claim 5 | `in closed shadow not walked` |

## What is open

- Elements under a transform other than translation get the axis-aligned box
  `getBoundingClientRect` answers; a visual viewport that is pinch-zoomed is
  not modelled.
- A frame of another origin is an opaque leaf. Its graft through
  `postMessage`, and the walk of closed shadow roots and frames inside a
  same-origin frame, are not built.
- The host that scales the walk's read is TypeScript here. The Tauri plugin
  takes its capture natively, and scales the same read the same way.
- 0k.computer is walked with no renderer and no daemon: its shell and
  controls, not its canvas's content, which the canvas's own semantics carry.
