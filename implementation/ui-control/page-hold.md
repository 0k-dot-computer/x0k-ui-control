# The page's hold: one page state for one capture

```turtle folio:document
implementation:ui-control\/page-hold a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "The in-page library's hold and epoch: a page names its frame by an epoch that rises whenever its state may have changed, and holds its own frame producers still while its host captures, so the capture and the read come from one page state. A probe page test holds this in headless Chromium over CDP and in WebKitGTK, and is red without the hold." ;
    x0k:concerns "ui-control", "webview", "frame", "hold", "conformance" ;
    x0k:motivatedBy intent:30ebc190-f09e-020f-3bc8-7ccc941f5128 ;
    x0k:implements architecture:ui-control-channel ;
    x0k:cites implementation:ui-control\/webview,
        implementation:ui-control\/shell-endpoint,
        implementation:ui-control\/protocol ;
    folio:tangleCrate "substrate/apps/ui-control-page" ;
    folio:tangleRoot "src/hold.ts" .
```

`x0k:architecture/ui-control-channel` §8 says that every part of one
observation comes from one presented frame. A web page cannot read its own
pixels, and its host cannot stop the page while it captures. So a capture and
a read made beside it can show two different page states. The webview design
(`x0k:implementation/ui-control/webview`, §1 and §2) answers this with a
**hold**: the page holds its own frame producers still, the host captures the
still page, and the page checks that nothing moved meanwhile. This chapter is
that hold, in the in-page library, and the test that shows it works.

The library is TypeScript in `substrate/apps/ui-control-page`, a directory of
its own so that no one app owns it, as the surface loader is
(`x0k:implementation/0k.computer/motif-loader`). 0k.computer's web UI is its
first user. This chapter holds the mechanism the rest of the library rests on.
The layout walk is `x0k:implementation/ui-control/page-walk`, and the actions,
the state and the page's answers are `x0k:implementation/ui-control/page-answer`.

The carried example is the **probe page**. It paints a frame counter into a
patch of pixels on every animation frame, moves one element by script, and
slides another by a CSS animation. A capture of it shows at once which page
state it holds. A host holds the probe page, captures it, and compares the
pixels with what the hold read: the counter, and where each element lies.

## What holds

These are §1 and §2 of the webview design, as this code keeps them:

- A frame is named by an **epoch**, an integer the library raises whenever the
  page state may have changed. An idle page keeps its epoch.
- While the page is held, no animation-frame callback of the page runs, and no
  Web Animation advances.
- The page is held through two rendering updates before it is read, so the
  held state has reached the screen and any snapshot.
- The epoch and the read come from one script task.
- The epoch read after the capture equals the epoch read before it, or the
  host holds again, up to three times, and then refuses the capture as
  `page_unsettled`, naming the epochs it saw.
- No wait on a rendering update goes on `FRAME_WAIT_MS` past the last one it
  heard, and a page that is or becomes hidden ends every wait at once with its
  reason. A page whose rendering updates come, however late, is painting. A
  hold that could not paint is not captured: its host refuses the capture as
  `cannot_paint` and answers the read.
- A release resumes each paused animation at the time it would have reached
  unheld, and runs each deferred callback in the next rendering update.

**Cost bound.** The hold costs at most 100 ms at the 90th percentile on the
probe page. Measured on arca, its median is 41 to 42 ms.

The hold changes no state of the page. A person sees the page's motion stall
for two or three rendering updates on each observation that holds a capture.

The contract a host speaks to is small: hold with a reader, then verify.

<a name="chunk-hold-contract"></a><sub>`src/hold.ts` · `#hold-contract`</sub>

```typescript {#hold-contract}
/** What the page answers when it is held: the epoch it was held at, what the
 * reader read in the same task, and how long the hold took to settle. */
export interface Held<T> {
  epoch: number;
  read: T;
  holdMs: number;
  /** Why the page could not paint while it was held, when it could not: the
   * hold ended its wait, so no capture shows the read. */
  unpainted?: string;
}

/** The page's hold: its epoch, and the hold a host asks for around a capture. */
export interface Hold {
  /** The epoch now: it rises whenever the page state may have changed. */
  epoch(): number;
  /** The page's word that it changed in a way the library cannot see. */
  changed(): void;
  /** Hold the page still, let it settle, then read the epoch and `read()` in
   * one task. With `frameOnly`, the host's drawing of input is hidden from the
   * hold until the release, so the capture is the page's frame alone. */
  hold<T>(read: () => T, options?: HoldOptions): Promise<Held<T>>;
  /** Why the page cannot paint now, when it cannot: it is hidden, or a wait
   * on a rendering update ran out and no update has come since. */
  unpainted(): string | undefined;
  /** Answer once one rendering update has run, after the callbacks the page
   * asked for first; or answer why the page cannot paint. */
  rendered(): Promise<string | undefined>;
  /** Answer once the page has handled the input queued for it: three
   * rendering updates in a row with no input event between, or `SETTLE_MS`;
   * or answer why the page cannot paint. */
  settled(): Promise<string | undefined>;
  /** The epoch now, and release the page. */
  verify(): number;
  /** Whether the page is held. */
  held(): boolean;
  /** The shadow root the library saw made on `element`, open or closed. */
  shadowRoot(element: Element): ShadowRoot | null;
  /** The layer the host draws drivers' input on, which nothing else of the
   * library sees. */
  drawn: DrawnLayer;
  /** The clock a host steps for a stepped screencast
   * (`x0k:implementation/ui-control/page-clock`). */
  steppedClock: SteppedClock;
}

/** How a hold treats the host's drawing of input. */
export interface HoldOptions {
  frameOnly?: boolean;
}

/** How many rendering updates the page is held through before it is read. */
export const SETTLE_UPDATES = 2;
/** How long a hold may stand after it answered before the page lets itself go. */
export const HOLD_LAPSE_MS = 1000;
/** How long any wait on a rendering update may go without hearing one before
 * the page answers that it cannot paint. */
export const FRAME_WAIT_MS = 1000;
/** How long input may keep arriving before the page counts as settled. */
export const SETTLE_MS = 1000;
```

The reader is the caller's. The probe test reads the counter and two boxes.
The layout walk and the page's state will be read the same way, inside the
same task as the epoch.

## Installing before the page

The hold works only if every animation-frame callback the page asks for passes
through the library. So the library installs before the page's own scripts
run, and replaces `requestAnimationFrame` and `cancelAnimationFrame` on the
window. A second install in the same window answers the first, so a host that
injects the library and a page that imports it share one hold.

The hold installs its stepped clock first
(`x0k:implementation/ui-control/page-clock`), which wraps the page's timers,
`performance.now` and `Date`. Every wait of the library's own uses the wall's
functions the clock kept, `native`, so no screencast stops the library's
bounds.

<a name="chunk-hold-file"></a><sub>`src/hold.ts` · `#hold-file` · assembles [hold-contract](#chunk-hold-contract) · [epoch-event-names](#chunk-epoch-event-names) · [watch-mutations](#chunk-watch-mutations) · [watch-events](#chunk-watch-events) · [watch-animations](#chunk-watch-animations) · [defer-frame-callbacks](#chunk-defer-frame-callbacks) · [bounded-waits](#chunk-bounded-waits) · [hold-and-release](#chunk-hold-and-release) · [bind-clock](#chunk-bind-clock)</sub>

```typescript {#hold-file file="src/hold.ts"}
import { type SteppedClock, installClock } from './clock.ts';
import { type DrawnLayer, makeLayer } from './drawn-layer.ts';

<<hold-contract>>

const INSTALLED = Symbol.for('x0k.ui-control.hold');

<<epoch-event-names>>

/** Install the hold in `win` before the page's own scripts run, so that every
 * animation-frame callback the page asks for passes through it. A second
 * install in the same window answers the first. */
export function installHold(win: Window = window): Hold {
  const existing = (win as any)[INSTALLED] as Hold | undefined;
  if (existing) return existing;
  const doc = win.document;
  // The clock first, so the library's own waits keep the wall's time functions.
  const clock = installClock(win);
  const native = clock.native;
  const nativeRaf = win.requestAnimationFrame.bind(win);
  const nativeCancel = win.cancelAnimationFrame.bind(win);

  let epoch = 0;
  const bump = () => { epoch += 1; };
  // The host's drawing layer, made before anything is watched, so its making
  // is no change of the page's and its shadow root is not recorded.
  const layer = makeLayer(win);
  <<watch-mutations>>
  <<watch-events>>
  <<watch-animations>>
  <<defer-frame-callbacks>>
  <<bounded-waits>>
  <<hold-and-release>>
  <<bind-clock>>

  const api: Hold = { epoch: epochNow, changed: bump, hold, verify, held: () => held, unpainted, rendered, settled, shadowRoot: (element) => shadows.get(element) ?? null, drawn: layer, steppedClock: clock.stepped };
  (win as any)[INSTALLED] = api;
  return api;
}
```

## The epoch

A browser gives a page no identity for a presented frame (webview §1). So the
page's frame is named by its state, and the epoch rises on each thing that may
change that state. The first is the DOM. A `MutationObserver` on the document
counts each batch of records. Shadow roots are outside the document's subtree,
so the library wraps `attachShadow` and observes each root as it is made, open
or closed. It keeps each root by its host, so the layout walk reaches a closed
root too. Records still queued when the epoch is read count as one batch.

A same-origin frame's document is outside the subtree too. Each time a frame
loads, the library observes its document, listens for its scrolling, and
moves the epoch, since the frame now shows a new page. A frame's `load` event
does not bubble, and an element's `load` never reaches its window, so the
listener captures on the document, and on each frame's document, which
reaches frames inside frames. A frame of another origin
gives no document, and nothing in it moves the epoch.

<a name="chunk-watch-mutations"></a><sub>`src/hold.ts` · `#watch-mutations`</sub>

```typescript {#watch-mutations}
// Every batch of DOM mutations, in the document, in each shadow root and in
// each same-origin frame's document.
const observer = new MutationObserver(bump);
const watch = (root: Node) => observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
watch(doc);
const shadows = new WeakMap<Element, ShadowRoot>();
const attachShadow = win.Element.prototype.attachShadow;
win.Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit): ShadowRoot {
  const root = attachShadow.call(this, init);
  shadows.set(this, root);
  watch(root);
  return root;
};
const frames = new WeakSet<Document>();
const onFrameLoad = (e: Event) => {
  const frame = e.target as Element;
  if (frame.localName !== 'iframe' && frame.localName !== 'frame') return;
  let inner: Document | null = null;
  try { inner = (frame as HTMLIFrameElement).contentDocument; } catch { inner = null; }
  if (inner && !frames.has(inner)) {
    frames.add(inner);
    watch(inner);
    inner.defaultView?.addEventListener('scroll', bump, { capture: true, passive: true });
    inner.addEventListener('load', onFrameLoad, { capture: true });
  }
  bump();
};
doc.addEventListener('load', onFrameLoad, { capture: true });
// The epoch now: records not yet delivered count as a batch.
const epochNow = () => {
  if (observer.takeRecords().length > 0) bump();
  return epoch;
};
```

The rest of §1's list are events: a scroll anywhere (scroll events do not
bubble, so the listener captures), a new size of the window or the visual
viewport, a trusted input event, a change of focus, and an animation or a
transition that starts, ends or is cancelled. Input that script made is not
input a person made, so only a trusted event moves the epoch.

<a name="chunk-epoch-event-names"></a><sub>`src/hold.ts` · `#epoch-event-names`</sub>

```typescript {#epoch-event-names}
/** Trusted input that moves the epoch: what a person does to a page. */
const INPUT_EVENTS = ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'keydown', 'keyup', 'input', 'compositionend', 'focusin', 'focusout'];
/** An animation or a transition that starts, ends or is cancelled. */
const ANIMATION_EVENTS = ['animationstart', 'animationend', 'animationcancel', 'transitionstart', 'transitionend', 'transitioncancel'];
```

<a name="chunk-watch-events"></a><sub>`src/hold.ts` · `#watch-events`</sub>

```typescript {#watch-events}
// Scrolling, a new size, and what a person does.
win.addEventListener('scroll', bump, { capture: true, passive: true });
win.addEventListener('resize', bump, { passive: true });
win.visualViewport?.addEventListener('resize', bump, { passive: true });
win.visualViewport?.addEventListener('scroll', bump, { passive: true });
for (const type of INPUT_EVENTS) win.addEventListener(type, (e) => { if (e.isTrusted) bump(); }, { capture: true, passive: true });
for (const type of ANIMATION_EVENTS) win.addEventListener(type, bump, { capture: true, passive: true });
```

A Web Animation that script makes with `element.animate()` fires no event when
it starts. The library wraps `animate` so that a new animation moves the epoch,
and so does its finish or its cancel. While the stepped clock steps, the
wrapper hands it each new animation at once, so it is caught at its time when
made.

<a name="chunk-watch-animations"></a><sub>`src/hold.ts` · `#watch-animations`</sub>

```typescript {#watch-animations}
// An animation made by script: its start, its finish and its cancel.
const animate = win.Element.prototype.animate;
win.Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>): Animation {
  const animation = animate.apply(this, args);
  bump();
  clock.created(animation);
  animation.addEventListener('finish', bump);
  animation.addEventListener('cancel', bump);
  return animation;
};
```

What the library cannot see, a page tells it with `changed()`: a canvas drawn
from a timer, a video frame, a style that follows the pointer's hover. A
same-origin frame's own animation-frame callbacks and animations are not held:
the library holds the window it is installed in.

## Holding the frame callbacks

The page's own animation-frame callbacks are its fastest producers of change.
The library gives each callback an id of its own. When the page is not held,
the callback goes to the browser at once. When it is held, the callback waits,
and the release hands it to the browser, so it runs in the first rendering
update after the release with that update's timestamp. While the stepped clock
steps, a callback waits for the clock instead, which runs it once in the next
frame with the screencast time. `cancelAnimationFrame` works on every kind.

<a name="chunk-defer-frame-callbacks"></a><sub>`src/hold.ts` · `#defer-frame-callbacks`</sub>

```typescript {#defer-frame-callbacks}
// The page's animation-frame callbacks, by the id the page was given. While
// the page is held a callback waits here, and runs in the first update after
// the release with that update's timestamp.
let held = false;
let lastId = 0;
const waiting = new Map<number, FrameRequestCallback>();
// The callbacks the stepped clock runs, while it steps.
const stepped = new Map<number, FrameRequestCallback>();
const scheduled = new Map<number, { native: number; cb: FrameRequestCallback }>();
const schedule = (id: number, cb: FrameRequestCallback) => {
  scheduled.set(id, { native: nativeRaf((t) => { scheduled.delete(id); cb(t); }), cb });
};
win.requestAnimationFrame = (cb: FrameRequestCallback): number => {
  const id = ++lastId;
  if (clock.stepping()) stepped.set(id, cb);
  else if (held) waiting.set(id, cb);
  else schedule(id, cb);
  return id;
};
win.cancelAnimationFrame = (id: number): void => {
  waiting.delete(id);
  stepped.delete(id);
  const pending = scheduled.get(id);
  if (pending !== undefined) { nativeCancel(pending.native); scheduled.delete(id); }
};
const updates = (n: number) => new Promise<void>((done) => {
  const step = (left: number) => (left === 0 ? done() : nativeRaf(() => step(left - 1)));
  step(n);
});
```

## When the page cannot paint

A page whose window is not on the screen gets no rendering updates: a
minimised or unmapped window, a tab behind another, and on macOS a window
WebKit counts as occluded (`x0k:implementation/ui-control/tauri-plugin`, "The
macOS host"). Its `document.visibilityState` reads `hidden`, and its
animation frames stop until it is shown. A host that waited on a frame then
heard nothing until its own wait ran out, 5 s in the Tauri plugin, and learned
nothing from it. So no wait of the library's on a rendering update is open
ended:

- **Hidden, it answers at once.** A wait that starts while the page is hidden
  answers why at once, and one already running ends when the page becomes
  hidden, by its `visibilitychange` event. Each answers the reason, never a
  frame.
- **A frame that does not come is a bound.** A wait that has heard no
  rendering update for `FRAME_WAIT_MS`, since it began or since the last it
  heard, ends, answers why, and leaves the page marked as not painting until
  its next rendering update. A page busy in a long frame is not one that
  cannot paint: the update comes late, the wait hears it, and its bound
  starts again from there.
- **The page says so.** `unpainted()` answers either reason, or nothing while
  the page paints. It waits on nothing, so a host can ask it before every call
  at the cost of a round trip.
- **A stepped page still renders.** While the stepped clock steps, the
  page's own callbacks run only when the host advances the clock, but the
  engine's rendering updates go on. So `rendered` waits on the engine's next
  one, which no callback of the page's rides, bounded as every wait is. The
  settle after input then still hears the input the engine has yet to hand
  the page: a perform answers once the page has handled it, and the frame the
  host's next step draws shows what it did. An answer names the epoch as it
  stands.

Four waits use it: the hold's wait for its pauses and its settle, an answer's
wait for the rendering update after an action, a `present` or a `release`
(`rendered`), and the settle after input (`settled`). The settle was the Tauri
plugin's, a script of its own; it is the library's now, so one rule bounds
every wait. It answers once three rendering updates in a row have heard no
input event, or after `SETTLE_MS`, as before.

`FRAME_WAIT_MS` is a second. Measured on arca, WebKitGTK's first animation
frame after a page loaded under Xvfb came more than 500 ms later, so a shorter
bound would call a page that paints one that cannot. A hidden page is told
apart at once by its visibility; only a page that reads visible and paints
nothing pays the bound, once.

The bound counts from the last rendering update the wait heard, not from its
start, because a page can be slow without being stuck. A wait listens to
every rendering update while it runs, and when its bound runs out with an
update heard within it, it waits on from that update. Counted from the start,
a hold that began just before a frame which ran 1.2 s, its update coming late
but coming, was refused as `cannot_paint` in WebKitGTK in 5 of 10 holds, and
in every hold asked for in the same task as the slow frame: "no rendering
update has come for 1000 ms". A loaded machine makes such frames.

<a name="chunk-bounded-waits"></a><sub>`src/hold.ts` · `#bounded-waits`</sub>

```typescript {#bounded-waits}
const HIDDEN = 'the page is hidden: document.visibilityState is hidden, as for a minimised, unmapped or covered window';
const hiddenNow = () => (doc.visibilityState === 'hidden' ? HIDDEN : undefined);
// Since when no rendering update had come, when a wait last ran out, until
// the next one comes.
let stalledAt: number | undefined;
const stalled = (since: number) => {
  stalledAt ??= since;
  nativeRaf(() => { stalledAt = undefined; });
};
const unpainted = (): string | undefined => hiddenNow()
  ?? (stalledAt === undefined ? undefined : `no rendering update has come for ${Math.round(native.now() - stalledAt)} ms`);
/** `wait`, or why the page cannot paint: it is or becomes hidden, or
 * `FRAME_WAIT_MS` pass with `wait` unanswered and no rendering update heard. */
const whilePainting = (wait: Promise<unknown>): Promise<string | undefined> => new Promise((done) => {
  const now = unpainted();
  if (now) return done(now);
  let finished = false;
  // The last rendering update heard while the wait runs, or its start.
  let heard = native.now();
  let hearing = nativeRaf(function hear() { heard = native.now(); hearing = nativeRaf(hear); });
  const finish = (why?: string) => {
    if (finished) return;
    finished = true;
    native.clearTimeout(timer);
    nativeCancel(hearing);
    doc.removeEventListener('visibilitychange', onVisibility);
    done(why);
  };
  const onVisibility = () => { const why = hiddenNow(); if (why) finish(why); };
  doc.addEventListener('visibilitychange', onVisibility);
  // The bound runs from the last rendering update heard: a page whose
  // updates come, however late, is painting.
  const bound = () => {
    const quiet = native.now() - heard;
    if (quiet < FRAME_WAIT_MS) {
      timer = native.setTimeout(bound, FRAME_WAIT_MS - quiet);
      return;
    }
    stalled(heard);
    finish(unpainted());
  };
  let timer = native.setTimeout(bound, FRAME_WAIT_MS);
  wait.then(() => finish(), () => finish());
});
// The next rendering update: the page's own, or while the clock steps, the
// engine's, which goes on while the page's frames wait for the host.
const nextUpdate = (done: () => void) => (clock.stepping() ? nativeRaf(() => done()) : win.requestAnimationFrame(() => done()));
const rendered = () => whilePainting(new Promise<void>(nextUpdate));
const SETTLE_EVENTS = ['pointermove', 'pointerdown', 'pointerup', 'mousemove', 'mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'input', 'wheel'];
const settled = async (): Promise<string | undefined> => {
  let quiet = 0;
  const heard = () => { quiet = 0; };
  for (const kind of SETTLE_EVENTS) win.addEventListener(kind, heard, { capture: true, passive: true });
  try {
    const until = native.now() + SETTLE_MS;
    do {
      const why = await rendered();
      if (why) return why;
      quiet += 1;
    } while (quiet <= 2 && native.now() < until);
    return undefined;
  } finally {
    for (const kind of SETTLE_EVENTS) win.removeEventListener(kind, heard, { capture: true });
  }
};
```

## The hold and its release

A hold does four things in order. It stops the frame callbacks. It pauses
every running animation in `document.getAnimations()`, which holds the page's
CSS animations and transitions too. It waits for each pause to take hold: a
pause is pending until its animation is ready, which is when the compositor
has it. Then it waits through `SETTLE_UPDATES` rendering updates, and reads
the epoch and the caller's reader in the same task.

A running animation's time is its timeline's time less its start time. So the
release gives each paused animation back the start time it ran from, and the
animation is at once where it would be had it never been held. Setting a start
time plays a paused animation with no pending play, and that matters twice.

- No frame is lost to the resume. Measuring the hold by the wall clock and
  seeking forward left an animation off by up to a frame, by a different amount
  in each engine: a pause takes hold at the call in WebKitGTK, and only at
  `ready` in Chromium.
- The main thread and the compositor agree on the animation's start. A release
  by `play()` leaves the animation pending, and the compositor then starts it
  on its own clock. In Chromium at a ratio of 1, the next hold's pause was then
  painted a frame ahead of its layout read in 6 to 10 of 40 trials, which is
  the gap webview §2 names. With the start time given back, it agreed in every
  trial, on Chromium's default compositor thread. That the pending play is the
  cause is inferred from this: with Chromium's `--disable-threaded-animation`,
  the release by `play()` agreed in every trial too.

An animation the page cancelled or finished meanwhile is no longer paused,
and the release leaves it alone. A host that never verifies does not leave the
page held forever: `HOLD_LAPSE_MS` after the hold answered, the page lets
itself go and moves its epoch, so that host's verify cannot match. The lapse
runs from the answer, since the host's part starts there: counted from the
hold's start, a hold whose settle took 1.2 s had already let the page go when
its host captured, and every such capture was refused as `page_unsettled`
in Chromium.

<a name="chunk-hold-and-release"></a><sub>`src/hold.ts` · `#hold-and-release`</sub>

```typescript {#hold-and-release}
// The animations the hold paused, each with the start time it ran from.
let paused: { animation: Animation; startTime: CSSNumberish | null }[] = [];
// Whether this hold hid the host's drawing, for the frame alone.
let hidDrawn = false;
// Why this hold's pauses did not take hold, when the page could not paint.
let unheld: string | undefined;
let lapse: number | undefined;
const release = () => {
  if (!held) return;
  held = false;
  if (hidDrawn) {
    layer.hide(false);
    hidDrawn = false;
  }
  native.clearTimeout(lapse);
  for (const { animation, startTime } of paused) {
    if (animation.playState !== 'paused') continue;
    // Its old start time puts it where it would be unheld; one not yet started starts now.
    if (startTime === null) animation.play();
    else animation.startTime = startTime;
  }
  paused = [];
  for (const [id, cb] of waiting) schedule(id, cb);
  waiting.clear();
};
const hold = async <T>(read: () => T, options: HoldOptions = {}): Promise<Held<T>> => {
  const start = native.now();
  if (!held) {
    held = true;
    paused = doc.getAnimations().filter((a) => a.playState === 'running').map((animation) => ({ animation, startTime: animation.startTime }));
    for (const { animation } of paused) animation.pause();
    // A pause takes hold, on the compositor too, when its animation is ready.
    if (paused.length > 0) unheld = await whilePainting(Promise.all(paused.map(({ animation }) => animation.ready)));
  }
  if (options.frameOnly && !hidDrawn) {
    layer.hide(true);
    hidDrawn = true;
  }
  const why = unheld ?? (await whilePainting(updates(SETTLE_UPDATES)));
  unheld = undefined;
  const epoch = epochNow();
  const answered: Held<T> = { epoch, read: read(), holdMs: native.now() - start };
  // A host that never verifies does not leave the page held: from the
  // answer, the page lets itself go, and the epoch moves so the host's check
  // fails. However long the hold took to settle, its host has the whole lapse.
  native.clearTimeout(lapse);
  lapse = native.setTimeout(() => { release(); bump(); }, HOLD_LAPSE_MS);
  return why ? { ...answered, unpainted: why } : answered;
};
const verify = (): number => {
  const epoch = epochNow();
  release();
  return epoch;
};
```

The hold cannot stop a task that no animation frame scheduled: a timer, a
network reply, a message, a person's input. Each of those that changes the
page moves the epoch, and the host's check catches it. While the stepped
clock steps, a hold pauses nothing, since the clock has paused every
animation, and its release gives nothing back; the timers are the clock's.

The hold gives the clock its side: the page's callbacks taken from the
browser and run when the clock says, the settle of a frame, the epoch and
whether a hold stands. A settle is a hold's: each animation the clock paused
since the last settle takes hold, and `SETTLE_UPDATES` rendering updates run.

<a name="chunk-bind-clock"></a><sub>`src/hold.ts` · `#bind-clock`</sub>

```typescript {#bind-clock}
clock.bind({
  take() {
    for (const [id, { native: frame, cb }] of scheduled) { nativeCancel(frame); stepped.set(id, cb); }
    scheduled.clear();
    for (const [id, cb] of waiting) stepped.set(id, cb);
    waiting.clear();
  },
  run(timestamp) {
    const due = [...stepped.values()];
    stepped.clear();
    for (const cb of due) {
      try { cb(timestamp); } catch (e) { native.setTimeout(() => { throw e; }); }
    }
    return due.length;
  },
  give() {
    for (const [id, cb] of stepped) schedule(id, cb);
    stepped.clear();
  },
  settle: (ready) => whilePainting(Promise.allSettled(ready).then(() => updates(SETTLE_UPDATES))),
  epoch: epochNow,
  held: () => held,
});
```

## The host's drawing layer

A host draws each sequence of input a driver sends over the page, so a person
watching sees what an agent does (`x0k:architecture/ui-control-channel` §10).
The library holds the layer it draws on, because only the library can keep the
drawing out of everything it reads. The layer is one element, made before the
page's scripts run, with its contents in a closed shadow root the library keeps
to itself. So:

- the epoch never moves for it once the page has loaded: its element is placed
  before the library watches the document, and a change inside a closed shadow
  root reaches no observer of the document, the library's or the page's. An
  engine that runs the library before the document has its root element, as
  Chromium does, gets the element when the root appears, which the library
  sees as one change while the page loads;
- the layout walk finds nothing of it (`x0k:implementation/ui-control/page-walk`):
  its element carries no role, name or id, and the walk reaches into a closed
  shadow root only when the library recorded its making, which it does not
  for its own;
- it takes no input: `pointer-events: none` and `inert` leave every hit test,
  `elementFromPoint` included, and every focus to the page, and `aria-hidden`
  keeps it out of the accessibility tree;
- it stays above the page: it is a manual popover in the top layer, raised
  again at each paint above anything the page put there since, with the
  largest `z-index` where the engine has no top layer;
- it runs no animation, so the hold pauses nothing of it; the host paints each
  fade itself;
- a hold for the frame alone hides it until the release, so a capture taken in
  that hold is the page's frame alone.

The layer lives in the page's own realm, so a page can remove it or cover it.
A paint puts it back when the page removed it, which the library's watcher sees
as one change. A page that keeps hiding it cannot be stopped from here.

The host sends a drawing in its own units, with its view's width in them, and
the layer places it in CSS pixels by the viewport's width over that. Each
pointer, ring and caption carries its requester's colour index, which the host's
drawing gave it (`x0k:implementation/ui-control/protocol`, "What a host draws
of input").

The layer draws in a look: the protocol's `InputLook` as JSON, which the page
declares when it installs the library (`x0k:implementation/ui-control/page-answer`).
It picks each mark's colour from the look's palette by its index, or from the
host's own palette when the look gives none, whose first colour is the ink the
tests read. It draws an arrow or a dot, a ring of the look's radius, captions
only when the look keeps them, and labels of its size naming each requester.
A label says the look's name for the requester, else the name the requester's
sequence gives itself, which the host sends with its pointer as `name`
(`Perform::requester_name`), else the requester as it is: the order of the
protocol's `InputLook::name_given`, so a person's own naming outranks what a
driver calls itself. In a page the library draws the label, so this is the
rule's home for every host that paints on the layer, the Tauri plugin among
them; the host passes the given name and resolves none. The colour stays the
requester's, never the name's. A colour reaches the stylesheet as the mark's
`--ink`, so the stylesheet stays one.

A drawing may also carry a takeover the host asks the person for or holds
(`x0k:architecture/ui-control-channel` §10). A hold is a band in the
requester's colour around the page and a notice at its top, "*name* has
taken over · Esc to end"; an ask dims the page and shows a card naming the
requester, with an Allow and a Refuse button. The name is the label's,
by the same rule. The host places the card and its buttons, in its own
units, because the host is what reads the person's click on them; the
layer draws them where it is told and writes their words. Like every mark,
neither takes input, and a hold for the frame alone hides both.

A drawing may carry the fixture mark too, naming the state fixture it marks
(`x0k:architecture/ui-interfaces` §4): a band around the page in the
protocol's `FIXTURE_INK`, `FIXTURE_BAND` of the host's units wide, and the
protocol's `FIXTURE_NOTICE` on a small label at three quarters' opacity in
the page's bottom right corner, drawn alike in every look, so a person learns
one mark for every app
(`x0k:implementation/ui-control/protocol`, "What a host draws of input"). The
host decides when a fixture is marked, since only it knows what `present`
asked, but the page may end a fixture itself (`ui.endFixture`,
`x0k:implementation/ui-control/page-answer`) between two of the host's
paints. So the library tells the layer which fixture stands each time that
changes, `standing(handle)`, and the layer draws the host's mark only while
the fixture it names is the one standing, redrawing at once when it goes. A
person never sees a mark over the live page for a fixture already gone, and a
host need not hear of the end before the mark leaves. A hold for the frame
alone hides the mark with the rest, so a capture of the frame alone shows
none.

The band is drawn a whole number of device pixels wide, the nearest to its
units at the page's scale and never fewer than one. A page whose viewport is
narrower than the host's units, such as a Tauri page beside a scrollbar,
scales the band below its width, and an engine draws a border a fraction of a
pixel wide as the whole pixels under it: WebKit draws a 2-unit band on a page
383 CSS pixels wide under 400 units one pixel wide, which leaves the band's
middle, where a capture reads its ink, to the page.

<a name="chunk-drawn-layer"></a><sub>`src/drawn-layer.ts` · `#drawn-layer`</sub>

```typescript {#drawn-layer file="src/drawn-layer.ts"}
/** How the layer draws drivers' input: `x0k-ui-protocol`'s `InputLook` as
 * JSON, each field at its default when a page leaves it out. */
export interface InputLook {
  colors?: string[];
  pointer?: 'arrow' | 'dot';
  ring?: number;
  captions?: boolean;
  label_size?: number;
  names?: Record<string, string>;
}

/** What a host draws of drivers' input, in its own units, with its view's
 * width in those units: the protocol's `InputPresentation` as of one paint,
 * each mark with its requester's colour index. */
export interface Drawing {
  units: number;
  pointers: { requester: string; name?: string; at: [number, number]; pressed: boolean; hue?: number }[];
  clicks: { at: [number, number]; gone: number; hue?: number }[];
  keys?: { requester: string; text: string; gone: number; hue?: number };
  takeover?: Takeover | null;
  /** The state fixture the host marks over the page, by its handle. */
  fixture?: string | null;
}

/** A rectangle in the host's units: its left, top, width and height. */
export type Rect = [number, number, number, number];

/** A takeover the host asks the person for, or holds: who for, the name
 * its sequence gives, its colour index, and for an ask, where the host
 * placed its card and its Allow and Refuse buttons. */
export interface Takeover {
  asked: boolean;
  requester: string;
  name?: string;
  hue?: number;
  card?: Rect;
  allow?: Rect;
  refuse?: Rect;
}

/** The layer a host draws drivers' input on. */
export interface DrawnLayer {
  /** Draw `drawing` over the page, in place of what was drawn. */
  paint(drawing: Drawing): void;
  /** Hide the drawing, or show it again. */
  hide(hidden: boolean): void;
  /** Draw in `look` from the next paint. */
  look(look: InputLook): void;
  /** The state fixture that stands in the page now, or none: the layer
   * draws a host's fixture mark only while the fixture it names stands. */
  standing(handle: string | null): void;
}

/** The host's own colours, picked by each requester's colour index. */
const PALETTE = ['#7c3aed', '#0891b2', '#d97706', '#db2777'];
/** The fixture mark's ink, `x0k-ui-protocol`'s `FIXTURE_INK`, in every look. */
export const FIXTURE_INK = '#f59e0b';
/** The fixture mark's band, `FIXTURE_BAND`, in the host's units. */
const FIXTURE_BAND = 2;
/** What the fixture mark says, `FIXTURE_NOTICE`. */
const FIXTURE_NOTICE = 'Fixture, not the live state';
/** The layer's stylesheet: each mark's colour is its `--ink`. */
const LOOK = `
  .drawn { position: fixed; inset: 0; pointer-events: none; }
  .ring { position: absolute; border: 3px solid var(--ink); border-radius: 50%; box-sizing: border-box; }
  .pointer { position: absolute; width: 13px; height: 20px; overflow: visible; }
  .pointer polygon { fill: var(--ink); stroke: white; stroke-width: 1.5; }
  .pointer.pressed polygon { fill: white; stroke: var(--ink); }
  .dot { position: absolute; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; box-sizing: border-box;
         background: var(--ink); border: 1.5px solid white; }
  .dot.pressed { background: white; border: 3px solid var(--ink); }
  .label { position: absolute; font-weight: 500; font-family: system-ui, sans-serif; color: white; background: var(--ink);
           padding: 1px 4px; border-radius: 4px; white-space: pre; }
  .band { position: absolute; inset: 0; border: 4px solid var(--ink); box-sizing: border-box; }
  .notice { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); }
  .dim { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.25); }
  .card { position: absolute; box-sizing: border-box; padding: 12px 16px; background: white; color: #111;
          border: 2px solid var(--ink); border-radius: 8px; font-family: system-ui, sans-serif; }
  .card p { margin: 0 0 4px; }
  .button { position: absolute; box-sizing: border-box; display: flex; align-items: center; justify-content: center;
            border-radius: 6px; font-weight: 500; font-family: system-ui, sans-serif; white-space: pre; }
  .allow { background: var(--ink); color: white; }
  .refuse { background: white; color: #111; border: 1.5px solid #111; }
  .fixture { position: absolute; inset: 0; border-style: solid; border-color: var(--ink); box-sizing: border-box; }
  .fixture-notice { position: absolute; bottom: 8px; right: 10px; opacity: 0.75; }
`;
/** How near the viewport's right edge, in CSS pixels, a pointer's labels go to its left. */
const LABEL_ROOM = 160;
/** An arrow pointer's outline, its tip at the origin, in CSS pixels. */
const ARROW = '0,0 0,17 4.5,13 8,20 11,19 7.5,12 13,12';
const SVG = 'http://www.w3.org/2000/svg';
/** The element's style, set so the page's own styles cannot move it. */
const PLACED: [string, string][] = [['display', 'block'], ['position', 'fixed'], ['inset', '0'], ['width', '100vw'],
  ['height', '100vh'], ['margin', '0'], ['padding', '0'], ['border', '0'], ['background', 'transparent'],
  ['pointer-events', 'none'], ['overflow', 'visible'], ['z-index', '2147483647'], ['contain', 'strict']];

/** Make the layer in `win`. The library calls it before it records the
 * shadow roots a page makes, so its record never holds the layer's. */
export function makeLayer(win: Window): DrawnLayer {
  const doc = win.document;
  const host = doc.createElement('x0k-drawn-input');
  for (const [name, value] of PLACED) host.style.setProperty(name, value, 'important');
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  const root = host.attachShadow({ mode: 'closed' });
  const look = new win.CSSStyleSheet();
  look.replaceSync(LOOK);
  root.adoptedStyleSheets = [look];
  const drawn = doc.createElement('div');
  drawn.className = 'drawn';
  root.append(drawn);
  host.setAttribute('popover', 'manual');
  const raise = () => {
    if (typeof host.showPopover !== 'function') return;
    try {
      if (host.matches(':popover-open')) host.hidePopover();
      host.showPopover();
    } catch { /* an engine with no top layer keeps the z-index */ }
  };
  // Whether the layer is in the document, placing it under the root element
  // when it is not and the root is there.
  const attach = () => {
    if (!host.isConnected && doc.documentElement) {
      doc.documentElement.append(host);
      raise();
    }
    return host.isConnected;
  };
  if (!attach()) {
    const rooted = new win.MutationObserver(() => { if (attach()) rooted.disconnect(); });
    rooted.observe(doc, { childList: true });
  }
  let declared: InputLook = {};
  const at = (x: number, y: number, k: number) => ({ left: `${x * k}px`, top: `${y * k}px` });
  const ink = (el: Element, hue = 0) => {
    const palette = declared.colors?.length ? declared.colors : PALETTE;
    (el as HTMLElement).style.setProperty('--ink', palette[hue % palette.length]);
  };
  // The label for `requester`, whose sequence names it `given`: the look's
  // name for it, an exact key's, else the longest prefix key's, else `given`,
  // else the requester as it is.
  const named = (requester: string, given?: string) => {
    const names = declared.names ?? {};
    if (requester in names) return names[requester];
    const prefixes = Object.keys(names).filter((key) => key.endsWith('*') && requester.startsWith(key.slice(0, -1)));
    const longest = prefixes.sort((a, b) => b.length - a.length)[0];
    return longest ? names[longest] : given || requester;
  };
  // A label beside a pointer at (`x`, `y`) in CSS pixels, `down` below its tip:
  // to its right, or to its left where it would run past the viewport's edge.
  const beside = (label: HTMLElement, x: number, y: number, down: number) => {
    const right = x > win.innerWidth - LABEL_ROOM;
    Object.assign(label.style, right ? { right: `${win.innerWidth - x + 4}px` } : { left: `${x + 16}px` }, { top: `${y + down}px` });
  };
  // An element of `kind` in the host's rectangle `rect`, at `k` CSS pixels a unit.
  const boxed = (kind: string, [left, top, width, height]: Rect, k: number, text?: string) => {
    const el = doc.createElement('div');
    el.className = kind;
    Object.assign(el.style, { left: `${left * k}px`, top: `${top * k}px`, width: `${width * k}px`, height: `${height * k}px` });
    if (text) el.textContent = text;
    return el;
  };
  // A takeover's marks: an ask's dimmed page, its card and its two buttons,
  // or a hold's band around the page and its notice, naming the requester
  // by the label's rule.
  const takeover = (held: Takeover, k: number, size: number): Element[] => {
    const name = named(held.requester, held.name);
    if (!held.asked) {
      const band = doc.createElement('div');
      band.className = 'band';
      const notice = doc.createElement('div');
      notice.className = 'label notice';
      notice.textContent = `${name} has taken over · Esc to end`;
      notice.style.fontSize = `${size}px`;
      for (const el of [band, notice]) ink(el, held.hue);
      return [band, notice];
    }
    if (!held.card || !held.allow || !held.refuse) return [];
    const dim = doc.createElement('div');
    dim.className = 'dim';
    const card = boxed('card', held.card, k);
    card.style.fontSize = `${size}px`;
    for (const line of [`${name} asks to take over this window's input`, 'Your clicks and keys wait until its sequence ends.']) {
      const p = doc.createElement('p');
      p.textContent = line;
      card.append(p);
    }
    const allow = boxed('button allow', held.allow, k, 'Allow');
    const refuse = boxed('button refuse', held.refuse, k, 'Refuse (Esc)');
    for (const el of [card, allow, refuse]) {
      ink(el, held.hue);
      (el as HTMLElement).style.fontSize = `${size}px`;
    }
    return [dim, card, allow, refuse];
  };
  // The fixture mark: a band in the fixture's ink around the page, `band`
  // CSS pixels wide to the nearest device pixel, and its notice in the page's
  // bottom right corner.
  const fixtureMark = (band: number, size: number): Element[] => {
    const edge = doc.createElement('div');
    edge.className = 'fixture';
    const pixel = 1 / (win.devicePixelRatio || 1);
    edge.style.borderWidth = `${Math.max(1, Math.round(band / pixel)) * pixel}px`;
    const notice = doc.createElement('div');
    notice.className = 'label fixture-notice';
    notice.textContent = FIXTURE_NOTICE;
    notice.style.fontSize = `${size}px`;
    for (const el of [edge, notice]) (el as HTMLElement).style.setProperty('--ink', FIXTURE_INK);
    return [edge, notice];
  };
  // The fixture standing in the page, as the library last said, and the
  // host's last drawing, kept to draw again when the fixture changes.
  let stands: string | null = null;
  let last: Drawing | null = null;
  const layer: DrawnLayer = {
    paint(drawing) {
      last = drawing;
      if (!attach()) return;
      raise();
      const k = win.innerWidth / (drawing.units || win.innerWidth);
      const [ringAt, captions, size] = [declared.ring ?? 8, declared.captions ?? true, declared.label_size ?? 12];
      const parts: Element[] = [];
      if (drawing.fixture && drawing.fixture === stands) parts.push(...fixtureMark(FIXTURE_BAND * k, size));
      for (const click of drawing.clicks) {
        const ring = doc.createElement('div');
        const across = (2 * ringAt + 28 * click.gone) * k;
        ring.className = 'ring';
        ink(ring, click.hue);
        Object.assign(ring.style, at(click.at[0], click.at[1], k), { width: `${across}px`, height: `${across}px`,
          marginLeft: `${-across / 2}px`, marginTop: `${-across / 2}px`, opacity: String(1 - click.gone) });
        parts.push(ring);
      }
      for (const pointer of drawing.pointers) {
        let mark: Element;
        if (declared.pointer === 'dot') {
          mark = doc.createElement('div');
          mark.className = pointer.pressed ? 'dot pressed' : 'dot';
        } else {
          mark = doc.createElementNS(SVG, 'svg');
          mark.setAttribute('class', pointer.pressed ? 'pointer pressed' : 'pointer');
          mark.setAttribute('viewBox', '0 0 13 20');
          const polygon = doc.createElementNS(SVG, 'polygon');
          polygon.setAttribute('points', ARROW);
          mark.append(polygon);
        }
        Object.assign((mark as HTMLElement).style, at(pointer.at[0], pointer.at[1], k));
        ink(mark, pointer.hue);
        const name = doc.createElement('div');
        name.className = 'label';
        name.textContent = named(pointer.requester, pointer.name);
        name.style.fontSize = `${size}px`;
        ink(name, pointer.hue);
        beside(name, pointer.at[0] * k, pointer.at[1] * k, 18);
        parts.push(mark, name);
        if (captions && drawing.keys && drawing.keys.requester === pointer.requester) {
          const keys = doc.createElement('div');
          keys.className = 'label';
          keys.textContent = drawing.keys.text;
          keys.style.fontSize = `${size}px`;
          ink(keys, drawing.keys.hue);
          beside(keys, pointer.at[0] * k, pointer.at[1] * k, 28 + size);
          keys.style.opacity = String(1 - drawing.keys.gone * 0.5);
          parts.push(keys);
        }
      }
      if (drawing.takeover) parts.push(...takeover(drawing.takeover, k, size));
      drawn.replaceChildren(...parts);
    },
    hide(hidden) {
      drawn.style.display = hidden ? 'none' : '';
    },
    look(look) {
      declared = look;
    },
    standing(handle) {
      if (stands === handle) return;
      stands = handle;
      if (last?.fixture) layer.paint(last);
    },
  };
  return layer;
}
```

## The host's side

The host holds, captures and verifies, and each step is a round trip: to the
page for the hold and the verify, to the platform for the capture.
`heldCapture` is that loop for any host. It knows nothing of an engine. A
moved epoch drops the capture and holds again, up to `HOLD_TRIES` times. Then
the capture is refused as `page_unsettled`, naming each pair of epochs it saw,
and the last read is answered with the frame it was read at. A capture that
fails is refused with the platform's reason. A hold that answers the page
could not paint is not captured: the host verifies, which releases the page,
and refuses the capture as `cannot_paint` with the hold's reason, and its read
is answered. The refusal is the protocol's `PartRefused` for the `capture`
part (`x0k:implementation/ui-control/protocol`), with the protocol's code when
one says why. `page_unsettled` has none: the page kept changing, and the next
observation may well settle, so it is a reason for a person and the host's
own word.

<a name="chunk-held-capture"></a><sub>`src/held-capture.ts` · `#held-capture`</sub>

```typescript {#held-capture file="src/held-capture.ts"}
/** What a host does to a page around one capture: the page's hold, the
 * platform's capture and the page's verify, each a round trip to the page or
 * to the platform. */
export interface HoldingHost<R, C> {
  hold(): Promise<{ epoch: number; read: R; holdMs: number; unpainted?: string }>;
  capture(): Promise<C>;
  verify(): Promise<number>;
}

/** One observation held around a capture. `frame` names the epoch the page was
 * held at; `refused` is set when the capture could not be tied to it. */
export interface HeldCapture<R, C> {
  frame: string;
  read: R;
  capture?: C;
  refused?: { part: 'capture'; code?: 'cannot_paint'; why: string };
  /** The hold's cost on each try, in ms. */
  holdMs: number[];
}

/** How many times a host holds the page before it refuses the capture. */
export const HOLD_TRIES = 3;

/** Hold, capture and verify, and hold again while the epoch moved, up to
 * `tries` times. Then the capture is refused as `page_unsettled`, naming the
 * epochs seen, and the last read is answered. */
export async function heldCapture<R, C>(host: HoldingHost<R, C>, tries = HOLD_TRIES): Promise<HeldCapture<R, C>> {
  const seen: string[] = [];
  const holdMs: number[] = [];
  let last: { epoch: number; read: R } | undefined;
  for (let i = 0; i < tries; i++) {
    const held = await host.hold();
    holdMs.push(held.holdMs);
    if (held.unpainted !== undefined) {
      await host.verify();
      return { frame: String(held.epoch), read: held.read, holdMs, refused: { part: 'capture', code: 'cannot_paint', why: held.unpainted } };
    }
    let capture: C | undefined;
    let failure: unknown;
    try { capture = await host.capture(); } catch (e) { failure = e; }
    const after = await host.verify();
    if (failure !== undefined) {
      return { frame: String(held.epoch), read: held.read, holdMs, refused: { part: 'capture', why: `capture failed: ${String(failure)}` } };
    }
    if (after === held.epoch) return { frame: String(held.epoch), read: held.read, capture, holdMs };
    seen.push(`${held.epoch}→${after}`);
    last = held;
  }
  return { frame: String(last!.epoch), read: last!.read, holdMs, refused: { part: 'capture', why: `page_unsettled: epochs ${seen.join(', ')}` } };
}
```

A host injects the library as a classic script before the page's scripts: CDP
with `Page.addScriptToEvaluateOnNewDocument`, WebKitGTK with a user script at
document start, Tauri with an initialization script. A module script would run
too late, because an inline module is deferred until the document is parsed.
`pageScript` makes that classic script for a host written for Node: esbuild
bundles `src/page.ts`, the library's entry, with what it imports, into one
script that runs at once. The entry installs the hold at
`globalThis.__x0kUiHold` and the layout walk beside it
(`x0k:implementation/ui-control/page-walk`). esbuild is a pinned development
dependency of the package, in its `package-lock.json`.

The script carries no WebAssembly. The protocol's values and checks are its
host's (`x0k:implementation/ui-control/page-answer`), so a page whose content
security policy forbids WebAssembly runs it as any other. `node
src/page-script.ts <file>` writes the script to a file for a host that carries
it built, as the Tauri plugin does, under a first line that says where it came
from, so nobody edits the copy.

<a name="chunk-page-script"></a><sub>`src/page-script.ts` · `#page-script`</sub>

```typescript {#page-script file="src/page-script.ts"}
import { buildSync } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export { PAGE_GLOBAL, UI_GLOBAL, WALK_GLOBAL } from './page-globals.ts';

/** The repository's root, which the bundle's path comments are relative to,
 * so the script is the same from any working directory. */
const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

let built: string | undefined;

/** The library as a classic script a host injects before the page's own
 * scripts: `src/page.ts` and what it imports, bundled to run at once, once
 * for each process. */
export function pageScript(): string {
  built ??= bundle();
  return built;
}

function bundle(): string {
  const entry = fileURLToPath(new URL('./page.ts', import.meta.url));
  const out = buildSync({ entryPoints: [entry], bundle: true, format: 'iife', target: 'es2022', write: false, logLevel: 'silent', absWorkingDir: REPO });
  return out.outputFiles[0].text;
}

/** The first line of a carried copy. */
export const CARRIED = '// Written by substrate/apps/ui-control-page/src/page-script.ts from the in-page library\'s sources; regenerate it, never edit it.\n';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('usage: node src/page-script.ts <file>');
  writeFileSync(process.argv[2], CARRIED + pageScript());
}
```

## The probe page

The probe page is the carried example in full. Each animation frame paints the
count into the counter's pixels, red for the count mod 256 and green for the
count div 256, and moves the mover by script to the count mod 200 CSS pixels.
The slider moves by a CSS transform animation, which an engine may run on its
compositor. The page also gives the reader the test holds it with.

<a name="chunk-probe-page"></a><sub>`tests/probe-page.html` · `#probe-page`</sub>

```html {#probe-page file="tests/probe-page.html"}
<!doctype html>
<html><head><meta charset="utf-8"><title>hold probe</title><style>
html, body { margin: 0; background: #fff; overflow: hidden; }
#counter { position: absolute; left: 0; top: 0; width: 64px; height: 64px; background: rgb(0, 0, 0); }
#mover { position: absolute; left: 0; top: 100px; width: 40px; height: 40px; background: rgb(0, 0, 255); }
#slider { position: absolute; left: 0; top: 200px; width: 20px; height: 20px; background: rgb(0, 255, 0); animation: slide 1s linear infinite; }
@keyframes slide { from { transform: translateX(0); } to { transform: translateX(300px); } }
</style></head><body>
<div id="counter"></div><div id="mover"></div><div id="slider"></div>
<script>
// Each animation frame paints its count into the counter's pixels (red is the
// count mod 256, green the count div 256) and moves the mover by script to
// the count mod 200 CSS pixels. The slider moves by a CSS animation.
let count = 0;
const counter = document.getElementById('counter');
const mover = document.getElementById('mover');
const slider = document.getElementById('slider');
function tick() {
  count += 1;
  counter.style.background = `rgb(${count & 255}, ${(count >> 8) & 255}, 0)`;
  mover.style.left = `${count % 200}px`;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
// What the probe test reads in the hold: the count, both elements' left
// edges and the viewport's width in CSS pixels, and the device pixel ratio.
window.probeRead = () => ({
  count,
  mover: mover.getBoundingClientRect().left,
  slider: slider.getBoundingClientRect().left,
  width: innerWidth,
  ratio: devicePixelRatio,
});
</script></body></html>
```

## The probe test

The test runs the probe page in four engines: WebKitGTK with compositing and
without, and headless Chromium at a device pixel ratio of 1 and of 2. In each
it takes 80 held captures, with a random gap of 0 to 40 ms before each, and
judges each capture against its read. Six claims are tested per engine:

1. Every capture is held still: no capture is refused as `page_unsettled`.
2. The counter painted in the capture is the count the hold read.
3. The mover's painted left edge lies where the hold laid it out.
4. The slider's painted left edge lies where the hold laid it out.
5. A release leaves no animation behind its timeline.
6. The hold costs at most 100 ms at the 90th percentile.
7. The host's drawing is no part of the page: painted in a hold, it moves no
   epoch, changes no layout walk and answers no hit test.
8. A hold for the frame alone captures none of the drawing, and an ordinary
   hold captures it where it lies.
9. A page's declared look colours its drivers' input: a requester's mark takes
   the palette's colour for its index, and with no look declared it takes the
   host's own first colour again.
10. The host's fixture mark is drawn only while the fixture it names stands:
    its band's ink, read at the middle of the band's width at the page's left
    edge, is in an ordinary hold's capture while the library says
    that fixture stands, in no hold for the frame alone, and in no capture
    once the library says none stands, with no paint from the host between.
11. A page that renders slowly is captured, never refused: a hold whose
    first rendering update runs longer than `FRAME_WAIT_MS` and
    `HOLD_LAPSE_MS` captures the page as it read it, in each of four trials.

The judge maps CSS pixels to capture pixels by the capture's width over the
viewport's. That ratio, and not `devicePixelRatio`, is what the pixels show:
WebKitGTK 2.50 under Xvfb answered a ratio of 1 and captured at 1.0444. The
layout walk scales its bounds the same way
(`x0k:implementation/ui-control/page-walk`). Here the claim is only that the pixels and the read are one state. An
edge may lie 1.5 capture pixels from its laid-out place, for antialiasing.
The judge is a module of its own, `tests/hosts/probe-judge.ts`, so another
host's probe test, such as the Tauri plugin's, judges by the same code; the
X server the WebKitGTK host starts is exported from it for the same reason.

Claim 7 runs in the page, inside one hold, since the probe page changes at
every frame: with the page held, it paints nothing and walks the layout, paints
a pointer and a ring and walks it again, and asks what lies under the pointer.
Then it verifies. The two walks must agree, the hit must be the page's element,
and the verified epoch must be the held one. The same script serves the
plugin's test, at a control of its own page.

<a name="chunk-test-judge"></a><sub>`tests/hosts/probe-judge.ts` · `#test-judge`</sub>

```typescript {#test-judge file="tests/hosts/probe-judge.ts"}
import type { Image } from './engine.ts';

/** How far, in capture pixels, an element's painted edge may lie from its laid-out edge. */
export const EDGE_SLACK = 1.5;

/** What the probe page reads in a hold: its count, where its mover and its
 * slider lie, and its viewport's width, in CSS pixels. */
export interface ProbeRead { count: number; mover: number; slider: number; width: number; ratio: number }

/** The colour the drawing layer inks a driver's pointer in. */
export const DRAWN_INK = [124, 58, 237];

/** The colour of the fixture mark's band: `x0k-ui-protocol`'s `FIXTURE_INK`. */
export const FIXTURE_INK = [245, 158, 11];

/** A script that, in one hold, paints the host's drawing with a pointer at
 * (`x`, `y`) in CSS pixels and answers what the page made of it: whether the
 * layer is in the document, whether the layout walk was the same with the
 * drawing and without, which element lies under the pointer, and whether the
 * epoch moved before the verify. */
export function drawnApart(x: number, y: number): string {
  return `const hold = globalThis.__x0kUiHold, walk = globalThis.__x0kUiWalk;
  const held = await hold.hold(() => {
    hold.drawn.paint({ units: 0, pointers: [], clicks: [] });
    const bare = JSON.stringify(walk.layout());
    hold.drawn.paint({ units: 0, pointers: [{ requester: 'probe', at: [${x}, ${y}], pressed: false }], clicks: [{ at: [${x}, ${y}], gone: 0 }] });
    const drawn = JSON.stringify(walk.layout());
    const hit = document.elementFromPoint(${x} + 3, ${y} + 8);
    return { layer: document.querySelector('x0k-drawn-input') !== null, walked: bare === drawn, hit: hit?.id || hit?.localName || null };
  });
  return JSON.stringify({ ...held.read, moved: hold.verify() !== held.epoch });`;
}

/** The first pixel in row `y` whose colour `is`, from the left. */
function firstIn(image: Image, y: number, is: (rgb: [number, number, number]) => boolean): number | null {
  for (let x = 0; x < image.width; x++) if (is(image.rgb(x, Math.round(y)))) return x;
  return null;
}
const blue = ([r, g, b]: number[]) => b > 200 && r < 60 && g < 60;
const green = ([r, g, b]: number[]) => g > 200 && r < 60 && b < 60;

/** What one held capture showed, against what the library read in the hold.
 * CSS pixels reach the capture's at the capture's width over the viewport's. */
export function judge(read: ProbeRead, image: Image) {
  const k = image.width / read.width;
  const [r, g] = image.rgb(Math.round(10 * k), Math.round(10 * k));
  const mover = firstIn(image, 120 * k, blue);
  const slider = firstIn(image, 210 * k, green);
  return {
    counter: r + 256 * g === (read.count & 0xffff),
    mover: mover !== null && Math.abs(mover - read.mover * k) <= EDGE_SLACK,
    slider: slider !== null && Math.abs(slider - read.slider * k) <= EDGE_SLACK,
    seen: { painted: r + 256 * g, mover, slider, scale: k },
  };
}
```

A host may be quick or slow, so the test takes its 40 trials twice: once with
the capture at once, and once with the host waiting 25 ms between the hold and
the capture. A real host's round trip can span a rendering update: the Tauri
plugin evaluates a script, hears back over IPC, then asks for a snapshot. With
no wait, WebKitGTK's round trips are shorter than a frame, and the probe page
agreed there in every trial without any hold. With the wait, a page that is
not held moves between the read and the capture, in every engine. The wait
also settles a held page, so the trials with no wait are the ones that show
whether the hold settles it itself.

<a name="chunk-test-host"></a><sub>`src/hold.ts` · `#test-host`</sub>

```typescript {#test-host}
/** The host's side of one observation: hold, capture after `latency` ms, verify. */
const host = (engine: Engine, latency: number) => ({
  hold: async () => JSON.parse(await engine.evaluate(`return JSON.stringify(await globalThis.${PAGE_GLOBAL}.hold(() => window.probeRead()));`)),
  capture: async () => { await sleep(latency); return engine.capture(); },
  verify: async () => Number(await engine.evaluate(`return String(globalThis.${PAGE_GLOBAL}.verify());`)),
});
```

Claim 5 reads the slider's animation clock before and after each held
capture. Its drift is the animation time gained, less the wall time passed. A
read of an animation's time is quantized to a frame, so one trial is off by up
to a frame either way. An animation left behind by the hold is behind by the
whole hold, on every trial. So the claim is on the mean: under one frame.

<a name="chunk-test-trials"></a><sub>`src/hold.ts` · `#test-trials` · assembles [test-claims](#chunk-test-claims)</sub>

```typescript {#test-trials}
for (const [name, start] of ENGINES.filter(([name]) => !only || only.some((o) => name.includes(o)))) {
  describe(`the probe page in ${name}`, () => {
    let engine: Engine;
    const rows: { latency: number; judged: ReturnType<typeof judge>; read: ProbeRead; refused?: string; holdMs: number[]; drift: number }[] = [];
    before(async () => {
      engine = await start();
      await sleep(300);
      for (const latency of HOST_LATENCIES_MS) for (let i = 0; i < TRIALS; i++) {
        await sleep(Math.floor(Math.random() * 40));
        const clock0 = JSON.parse(await engine.evaluate(ANIMATION_CLOCK));
        const held = await heldCapture(host(engine, latency));
        const clock1 = JSON.parse(await engine.evaluate(ANIMATION_CLOCK));
        const drift = (clock1.time - clock0.time) - (clock1.at - clock0.at);
        rows.push({ latency, judged: judge(held.read, held.capture ?? NO_IMAGE), read: held.read, refused: held.refused?.why, holdMs: held.holdMs, drift });
      }
    });
    after(async () => { await engine?.close(); });
    <<test-claims>>
  });
}
```

A refused trial counts as a miss for every pixel claim, since it has no
capture to judge. Each failure names how many trials agreed at each host
latency, and shows the first three misses with what was read and what was
seen.

<a name="chunk-test-claims"></a><sub>`src/hold.ts` · `#test-claims` · assembles [test-drawn-claims](#chunk-test-drawn-claims)</sub>

```typescript {#test-claims}
type Part = 'counter' | 'mover' | 'slider';
const agreedAt = (part: Part, latency: number) => rows.filter((r) => r.latency === latency && !r.refused && r.judged[part]).length;
const agreed = (part: Part) => HOST_LATENCIES_MS.map((l) => `${agreedAt(part, l)}/${TRIALS} at ${l} ms`).join(', ');
const misses = (part: Part) =>
  JSON.stringify(rows.filter((r) => r.refused || !r.judged[part]).slice(0, 3).map((r) => ({ read: r.read, seen: r.judged.seen, refused: r.refused })));

test('every capture is held still: the epoch after it is the epoch it was held at', () => {
  const refused = rows.filter((r) => r.refused);
  assert.equal(refused.length, 0, `${refused.length}/${rows.length} refused: ${refused.slice(0, 3).map((r) => r.refused).join('; ')}`);
});
test('the counter painted in the capture is the count the hold read', () => {
  assert.ok(rows.every((r) => !r.refused && r.judged.counter), `agreed ${agreed('counter')}, ${engine.version}; first misses ${misses('counter')}`);
});
test('the element moved by script lies in the capture where the hold laid it out', () => {
  assert.ok(rows.every((r) => !r.refused && r.judged.mover), `agreed ${agreed('mover')}; first misses ${misses('mover')}`);
});
test('the element moved by a CSS animation lies in the capture where the hold laid it out', () => {
  assert.ok(rows.every((r) => !r.refused && r.judged.slider), `agreed ${agreed('slider')}; first misses ${misses('slider')}`);
});
test('a release leaves no animation behind its timeline', (t) => {
  const drift = rows.reduce((sum, r) => sum + r.drift, 0) / rows.length;
  const held = rows.reduce((sum, r) => sum + r.holdMs.reduce((a, b) => a + b, 0), 0) / rows.length;
  t.diagnostic(`mean drift ${drift.toFixed(1)} ms over a mean hold of ${held.toFixed(1)} ms`);
  assert.ok(Math.abs(drift) < FRAME_MS, `mean drift ${drift.toFixed(1)} ms`);
});
test(`the hold costs at most ${HOLD_P90_MS} ms at the 90th percentile`, (t) => {
  const costs = rows.flatMap((r) => r.holdMs);
  const p90 = percentile(costs, 0.9);
  t.diagnostic(`${engine.version}: hold median ${percentile(costs, 0.5).toFixed(1)} ms, p90 ${p90.toFixed(1)} ms, max ${Math.max(...costs).toFixed(1)} ms; scale ${rows[0]?.judged.seen.scale.toFixed(4)}, devicePixelRatio ${rows[0]?.read.ratio}`);
  assert.ok(p90 <= HOLD_P90_MS, `p90 ${p90.toFixed(1)} ms`);
});
<<test-drawn-claims>>
```

The drawing's two claims paint a pointer over the counter, which never shows
the drawing's ink, since its blue is always 0. A capture's pixel inside the
pointer, 3 and 8 CSS pixels from its tip, is the ink in an ordinary hold and
the counter in a hold for the frame alone.

<a name="chunk-test-drawn-claims"></a><sub>`src/hold.ts` · `#test-drawn-claims` · assembles [test-slow-claims](#chunk-test-slow-claims)</sub>

```typescript {#test-drawn-claims}
test('the host\'s drawing is no part of the page: painted in a hold, it moves no epoch, changes no layout walk and answers no hit test', async () => {
  const apart = JSON.parse(await engine.evaluate(drawnApart(20, 20)));
  assert.deepEqual(apart, { layer: true, walked: true, hit: 'counter', moved: false });
});
test('a hold for the frame alone captures none of the drawing, and an ordinary hold captures it where it lies', async (t) => {
  await engine.evaluate(`globalThis.${PAGE_GLOBAL}.drawn.paint({ units: 0, pointers: [{ requester: 'probe', at: [20, 20], pressed: false }], clicks: [] }); return '';`);
  const inside = async (frameOnly: boolean) => {
    const held = await heldCapture({
      hold: async () => JSON.parse(await engine.evaluate(`return JSON.stringify(await globalThis.${PAGE_GLOBAL}.hold(() => window.probeRead(), { frameOnly: ${frameOnly} }));`)),
      capture: async () => engine.capture(),
      verify: async () => Number(await engine.evaluate(`return String(globalThis.${PAGE_GLOBAL}.verify());`)),
    });
    assert.ok(held.capture, held.refused?.why);
    const k = held.capture.width / held.read.width;
    return held.capture.rgb(Math.round(23 * k), Math.round(28 * k));
  };
  const [shown, alone] = [await inside(false), await inside(true)];
  t.diagnostic(`inside the pointer: drawn ${shown}, frame alone ${alone}`);
  assert.deepEqual(shown, DRAWN_INK);
  assert.notDeepEqual(alone, DRAWN_INK);
});
test('the host\'s fixture mark is drawn only while the fixture it names stands, and never in the frame alone', async (t) => {
  const bandAt = async (frameOnly: boolean) => {
    const held = await heldCapture({
      hold: async () => JSON.parse(await engine.evaluate(`return JSON.stringify(await globalThis.${PAGE_GLOBAL}.hold(() => window.probeRead(), { frameOnly: ${frameOnly} }));`)),
      capture: async () => engine.capture(),
      verify: async () => Number(await engine.evaluate(`return String(globalThis.${PAGE_GLOBAL}.verify());`)),
    });
    assert.ok(held.capture, held.refused?.why);
    const k = held.capture.width / held.read.width;
    return held.capture.rgb(Math.round(1 * k), Math.round(150 * k));
  };
  const drawn = `globalThis.${PAGE_GLOBAL}.drawn`;
  await engine.evaluate(`${drawn}.standing('x1'); ${drawn}.paint({ units: 0, pointers: [], clicks: [], fixture: 'x1' }); return '';`);
  const [standing, alone] = [await bandAt(false), await bandAt(true)];
  await engine.evaluate(`${drawn}.standing(null); return '';`);
  const gone = await bandAt(false);
  await engine.evaluate(`${drawn}.paint({ units: 0, pointers: [], clicks: [] }); return '';`);
  t.diagnostic(`at the band: standing ${standing}, frame alone ${alone}, after the fixture went ${gone}`);
  assert.deepEqual(standing, FIXTURE_INK, 'no band while the fixture stood');
  assert.notDeepEqual(alone, FIXTURE_INK, 'the frame alone showed the band');
  assert.notDeepEqual(gone, FIXTURE_INK, 'the band outlived the fixture');
});
test('a page\'s declared look colours its drivers\' input, and the host\'s own colour returns with none', async (t) => {
  const inked = async (look: string, hue: number) => {
    await engine.evaluate(`globalThis.${UI_GLOBAL}.install({ app: 'probe', look: ${look} });
      globalThis.${PAGE_GLOBAL}.drawn.paint({ units: 0, pointers: [{ requester: 'probe', at: [20, 20], pressed: false, hue: ${hue} }], clicks: [] }); return '';`);
    const held = await heldCapture({
      hold: async () => JSON.parse(await engine.evaluate(`return JSON.stringify(await globalThis.${PAGE_GLOBAL}.hold(() => window.probeRead()));`)),
      capture: async () => engine.capture(),
      verify: async () => Number(await engine.evaluate(`return String(globalThis.${PAGE_GLOBAL}.verify());`)),
    });
    assert.ok(held.capture, held.refused?.why);
    const k = held.capture.width / held.read.width;
    return held.capture.rgb(Math.round(23 * k), Math.round(28 * k));
  };
  const palette = `{ colors: ['#ff00ff', '#10b981'] }`;
  const [second, none] = [await inked(palette, 1), await inked('undefined', 1)];
  t.diagnostic(`inside the pointer: declared ${second}, none ${none}`);
  assert.deepEqual(second, [16, 185, 129]);
  assert.deepEqual(await inked('undefined', 0), DRAWN_INK);
  assert.notDeepEqual(none, [16, 185, 129]);
});
<<test-slow-claims>>
```

Claim 11 makes a page busy, not unable: in the task that asks for the hold,
the page asks for an animation frame whose callback spins for
`SLOW_FRAME_MS`, longer than both bounds. That rendering update comes, late,
and the page paints in it. A hold that took it for a page that cannot paint
would refuse the capture as `cannot_paint`; one that let itself go while it
waited would see the epoch move and refuse it as `page_unsettled`.

<a name="chunk-test-slow-claims"></a><sub>`src/hold.ts` · `#test-slow-claims`</sub>

```typescript {#test-slow-claims}
test('a page whose rendering update runs past the frame bound and the lapse is captured, never refused', async (t) => {
  const slow = `requestAnimationFrame(() => { const from = performance.now(); while (performance.now() - from < ${SLOW_FRAME_MS}); });`;
  const seen: { refused?: string; holdMs: number[]; counter: boolean }[] = [];
  for (let i = 0; i < SLOW_TRIALS; i++) {
    const held = await heldCapture({
      hold: async () => JSON.parse(await engine.evaluate(`${slow} return JSON.stringify(await globalThis.${PAGE_GLOBAL}.hold(() => window.probeRead()));`)),
      capture: async () => engine.capture(),
      verify: async () => Number(await engine.evaluate(`return String(globalThis.${PAGE_GLOBAL}.verify());`)),
    });
    seen.push({ refused: held.refused?.why, holdMs: held.holdMs.map(Math.round), counter: held.capture ? judge(held.read, held.capture).counter : false });
  }
  t.diagnostic(JSON.stringify(seen));
  assert.ok(seen.every((s) => !s.refused && s.counter), JSON.stringify(seen));
});
```

The rest of the test file is its constants and imports. `HOLD_ENGINES` narrows
a run to the engines whose names hold one of its comma-separated words, and
`HOLD_TRIALS` sets the trial count at each latency.

<a name="chunk-test-file"></a><sub>`tests/probe.test.ts` · `#test-file` · assembles [test-host](#chunk-test-host) · [test-trials](#chunk-test-trials)</sub>

```typescript {#test-file file="tests/probe.test.ts"}
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { heldCapture } from '../src/held-capture.ts';
import { FRAME_WAIT_MS, HOLD_LAPSE_MS } from '../src/hold.ts';
import { PAGE_GLOBAL, UI_GLOBAL, pageScript } from '../src/page-script.ts';
import { chromium } from './hosts/chromium.ts';
import type { Engine, Image } from './hosts/engine.ts';
import { DRAWN_INK, FIXTURE_INK, drawnApart, judge, type ProbeRead } from './hosts/probe-judge.ts';
import { webkitgtk } from './hosts/webkitgtk.ts';

const PAGE = fileURLToPath(new URL('./probe-page.html', import.meta.url));
const SIZE = { width: 400, height: 300 };
const TRIALS = Number(process.env.HOLD_TRIALS ?? 40);
/** How long the probe's host waits between the hold and the capture: a quick
 * host, and one whose round trip to the page spans more than a rendering update. */
const HOST_LATENCIES_MS = [0, 25];
/** One rendering update at 60 Hz. */
const FRAME_MS = 1000 / 60;
/** The hold's cost bound on the probe page, at the 90th percentile. */
const HOLD_P90_MS = 100;
const NO_IMAGE: Image = { width: 0, height: 0, rgb: () => [0, 0, 0], png: Buffer.alloc(0) };
const ANIMATION_CLOCK = `const a = document.getAnimations()[0]; return JSON.stringify({ time: Number(a.currentTime), at: performance.now() });`;
/** How long claim 11's slow rendering update runs: past the frame bound and the hold's lapse. */
const SLOW_FRAME_MS = Math.max(FRAME_WAIT_MS, HOLD_LAPSE_MS) + 200;
/** How many held captures claim 11 takes. */
const SLOW_TRIALS = 4;

<<test-host>>

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

const ENGINES: [string, () => Promise<Engine>][] = [
  ['webkitgtk composited', () => webkitgtk(PAGE, pageScript(), { ...SIZE, compositing: true })],
  ['webkitgtk not composited', () => webkitgtk(PAGE, pageScript(), { ...SIZE, compositing: false })],
  ['chromium at ratio 1', () => chromium(PAGE, pageScript(), { ...SIZE, ratio: 1 })],
  ['chromium at ratio 2', () => chromium(PAGE, pageScript(), { ...SIZE, ratio: 2 })],
];

/** HOLD_ENGINES narrows the run to the engines whose names hold one of its words. */
const only = process.env.HOLD_ENGINES?.split(',');
<<test-trials>>
```

## The engines

An engine is a browser with the probe page loaded and the hold injected before
it. The test needs three things of it: evaluate an async function in the page,
capture the page as it shows, and close. Each engine runs with a scratch home
and without `X0K_RUNTIME_DIR`, so nothing it starts reaches the live runtime.
Each process it starts dies with the test however the test ends, through
`tools/owned-process.mjs`.

<a name="chunk-engine-contract"></a><sub>`src/hold.ts` · `#engine-contract`</sub>

```typescript {#engine-contract}
/** A captured image: its size in pixels, the colour at a pixel, and the PNG
 * the protocol carries. */
export interface Image {
  width: number;
  height: number;
  rgb(x: number, y: number): [number, number, number];
  png: Buffer;
}

/** A browser engine with a page loaded, from a file or a URL, and the library
 * injected before it. */
export interface Engine {
  name: string;
  version: string;
  /** Run `body` as an async function in the page; it answers a string. */
  evaluate(body: string): Promise<string>;
  /** The platform's capture of the page as it shows now. */
  capture(): Promise<Image>;
  /** Hide the page from the screen, as a window that does not present it,
   * and answer once its `document.visibilityState` reads `hidden`. */
  hide(): Promise<void>;
  /** Show the page again after `hide`, and answer once it reads `visible`. */
  show(): Promise<void>;
  close(): Promise<void>;
}

/** How long a page may take to read the visibility its engine gave it. */
const VISIBILITY_MS = 5000;

/** Answer once the page, asked through `evaluate`, reads `state` as its
 * `document.visibilityState`, or fail after `VISIBILITY_MS`. */
export async function readsVisibility(evaluate: (body: string) => Promise<string>, state: 'hidden' | 'visible'): Promise<void> {
  const until = Date.now() + VISIBILITY_MS;
  while ((await evaluate('return document.visibilityState;')) !== state) {
    if (Date.now() > until) throw new Error(`the page did not read ${state} within ${VISIBILITY_MS} ms`);
    await sleep(10);
  }
}

/** The environment a browser runs in: a scratch home, and none of the live runtime's. */
export function scratchEnv(dir: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: dir, XDG_CACHE_HOME: `${dir}/cache`, XDG_CONFIG_HOME: `${dir}/config`,
    XDG_DATA_HOME: `${dir}/data`, XDG_RUNTIME_DIR: dir, ...extra };
  delete env.X0K_RUNTIME_DIR;
  return env;
}
```

**Chromium** is the host a tab under test has: a relay that holds a CDP
session to the browser (webview §2). It injects the library with
`Page.addScriptToEvaluateOnNewDocument`, sets the viewport and its ratio with
`Emulation.setDeviceMetricsOverride`, and captures with
`Page.captureScreenshot`.

Chromium runs with its default compositor: the hold needs no flag of it. The
host could instead freeze the page's animations from outside with CDP's
`Animation.setPlaybackRate` at 0. That was tried around a hold whose release
used `play()`, and the slider then agreed in only 2 of 40 trials.

<a name="chunk-chromium-file"></a><sub>`tests/hosts/chromium.ts` · `#chromium-file` · assembles [cdp-session](#chunk-cdp-session)</sub>

```typescript {#chromium-file file="tests/hosts/chromium.ts"}
import { existsSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { ownedTempDir, spawnBrowser } from '../../../../../tools/owned-process.mjs';
import { type Engine, pngImage, readsVisibility, scratchEnv } from './engine.ts';

<<cdp-session>>

/** Headless Chromium at `width` by `height` CSS pixels and `ratio` device
 * pixels to each, on `page`, a file or a URL, with `script` injected before the
 * page's own scripts. */
export async function chromium(page: string, script: string, { width, height, ratio }: { width: number; height: number; ratio: number }): Promise<Engine> {
  const home = ownedTempDir('x0k-hold-home-');
  const browser = spawnBrowser(['--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--no-first-run',
    '--no-default-browser-check', '--remote-debugging-port=0',
    `--window-size=${width},${height}`, 'about:blank'], { env: scratchEnv(home) });
  try {
    const portFile = `${browser.profile}/DevToolsActivePort`;
    for (let i = 0; i < 600 && !existsSync(portFile); i++) await sleep(50);
    if (!existsSync(portFile)) throw new Error('chromium did not open its DevTools port within 30 s');
    const port = readFileSync(portFile, 'utf8').split('\n')[0];
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const cdp = await devtools(targets.find((t: any) => t.type === 'page').webSocketDebuggerUrl);
    const version = (await cdp.send('Browser.getVersion')).product;
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: ratio, mobile: false });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: script });
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: page.includes('://') ? page : pathToFileURL(page).href });
    await loaded;
    /** The tab opened in front of the page to hide it, while one is. */
    let covering: string | undefined;
    const evaluate = async (body: string) => {
      const r = await cdp.send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    return {
      name: `chromium at ratio ${ratio}`,
      version,
      evaluate,
      capture: async () => pngImage(Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')),
      hide: async () => {
        covering ??= (await cdp.send('Target.createTarget', { url: 'about:blank' })).targetId;
        await readsVisibility(evaluate, 'hidden');
      },
      show: async () => {
        if (covering) await cdp.send('Target.closeTarget', { targetId: covering });
        covering = undefined;
        await readsVisibility(evaluate, 'visible');
      },
      close: async () => { cdp.close(); await browser.stop(); },
    };
  } catch (e) {
    await browser.stop();
    throw e;
  }
}
```

The CDP session needs no package: Node's own `WebSocket` speaks it. A call
waits for the answer with its id, and an event waits for its method.

<a name="chunk-cdp-session"></a><sub>`src/hold.ts` · `#cdp-session`</sub>

```typescript {#cdp-session}
/** A CDP session over the browser's WebSocket: calls by id, and events by method. */
async function devtools(url: string) {
  const ws = new WebSocket(url);
  await new Promise((open, fail) => { ws.addEventListener('open', open); ws.addEventListener('error', fail); });
  let last = 0;
  const calls = new Map<number, (m: any) => void>();
  const events = new Map<string, ((p: any) => void)[]>();
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(String(m.data));
    if (msg.id !== undefined) { calls.get(msg.id)?.(msg); calls.delete(msg.id); }
    else for (const cb of events.get(msg.method) ?? []) cb(msg.params);
  });
  const send = (method: string, params: object = {}) => new Promise<any>((done, fail) => {
    const id = ++last;
    calls.set(id, (msg) => (msg.error ? fail(new Error(`${method}: ${msg.error.message}`)) : done(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const once = (method: string) => new Promise<any>((done) => events.set(method, [...(events.get(method) ?? []), done]));
  return { send, once, close: () => ws.close() };
}
```

Each engine can also hide its page, for the claims of a page that cannot
paint. Chromium opens a second tab in front of the page with
`Target.createTarget` and closes it to show the page again. Measured on arca
in headless Chromium 148: behind the tab the page's `visibilityState` reads
`hidden` and no animation frame comes within 500 ms; with the tab closed it
reads `visible` and frames come again. WebKitGTK unmaps its window
(`gtk_widget_hide`) and maps it again. Measured under Xvfb with WebKitGTK
2.50: unmapped, the page reads `hidden` and no frame comes within 500 ms, while
its timers still run on time. Iconifying the window changes nothing there,
since Xvfb has no window manager to minimise it.

The page learns its new visibility from its engine a moment after the engine
hides or shows it, and on a loaded machine that moment can outlast the test's
next request. So each engine's `hide` and `show` answer only once the page
reads `hidden` or `visible`, which is what a claim about a hidden page
presupposes.

**WebKitGTK** is the webview Tauri 2 uses on Linux, the `webkit2gtk-4.1` ABI.
It has no protocol a test can speak to from outside, so a small GTK program
holds it: `tests/hosts/webkitgtk_host.py`, in Python over GObject
introspection. It injects the library as a user script at document start,
loads the page, connects back to the test over a unix socket, and answers one
request at a time: evaluate a function body, or snapshot the visible region
with `webkit_web_view_get_snapshot`.

It runs under `x0k-webkitgtk-python`, which the dev shell's browser layer
gives. That is Python with the GTK 3 and WebKitGTK typelibs, with this pin's
Mesa as its EGL vendor and its GLX vendor, and with none of the dev shell's
library path. Mesa's llvmpipe then renders for both. arca's own Mesa, in
`/run/opengl-driver/lib`, needs a newer glibc than this pin's. As the EGL
vendor, WebKitGTK 2.50 aborted with "Could not create default EGL display:
EGL_BAD_PARAMETER". As the GLX vendor, which glvnd opens by name as
`libGLX_mesa.so.0` from that directory, it failed to load, so GTK found no GL
configuration on Xvfb. WebKitGTK then logged "Disabled hardware acceleration
because GTK failed to initialize GL" and ran with the policy `never`, whatever
the view asked: the engine named composited was not. With the pin's Mesa on
the library path, `webkit://gpu` reports the policy `always` and the render
process's `GL_RENDERER` as llvmpipe, and the engine composites. The no-pause
mutation below shows it.

<a name="chunk-webkitgtk-host"></a><sub>`tests/hosts/webkitgtk_host.py` · `#webkitgtk-host` · assembles [webkitgtk-host-requests](#chunk-webkitgtk-host-requests)</sub>

```python {#webkitgtk-host file="tests/hosts/webkitgtk_host.py"}
"""A WebKitGTK webview for the hold's probe test, driven over a unix socket.

Usage: webkitgtk_host.py <socket> <page> <script.js> <width> <height> <policy>
<page> is a file or a URL.
<policy> is a WebKit2.HardwareAccelerationPolicy name: ALWAYS or NEVER composites.
It injects <script.js> before the page's own scripts, loads the page, connects
to the unix socket <socket> (a leading @ names an abstract one) and sends
{"ready": <WebKitGTK version>}. Then each line it reads is a request and each
line it sends an answer, with the request's id:
  {"id", "op": "eval", "body"}  the body of an async function; its value, a string
  {"id", "op": "snap"}          the visible region: width, height, stride, BGRA bytes and a PNG, in base64
  {"id", "op": "hide"}          unmap the window, so the page is hidden
  {"id", "op": "show"}          map it again
The test sends one request at a time and waits for its answer.
"""
import base64
import io
import json
import socket
import sys

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import GLib, Gtk, WebKit2  # noqa: E402

address, page, script = sys.argv[1], sys.argv[2], sys.argv[3]
width, height, policy = int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
link = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
requests = link.makefile("r")


def answer(message):
    link.sendall((json.dumps(message) + "\n").encode())


content = WebKit2.UserContentManager()
content.add_script(WebKit2.UserScript.new(
    open(script).read(),
    WebKit2.UserContentInjectedFrames.TOP_FRAME,
    WebKit2.UserScriptInjectionTime.START,
    None, None))
view = WebKit2.WebView(user_content_manager=content)
view.get_settings().set_hardware_acceleration_policy(getattr(WebKit2.HardwareAccelerationPolicy, policy))
window = Gtk.Window()
window.set_default_size(width, height)
window.add(view)
window.show_all()
<<webkitgtk-host-requests>>
```

The requests, and the loop that reads them, are GTK's callback style: each
request starts an asynchronous call, and its callback sends the answer. So a
request can be answered while another waits, and the test's side gives each
answer to the request with its id.

<a name="chunk-webkitgtk-host-requests"></a><sub>`src/hold.ts` · `#webkitgtk-host-requests`</sub>

```python {#webkitgtk-host-requests}


def evaluate(id_, body):
    def done(v, result):
        try:
            answer({"id": id_, "value": v.call_async_javascript_function_finish(result).to_string()})
        except GLib.Error as e:
            answer({"id": id_, "error": e.message})
    view.call_async_javascript_function(body, -1, None, None, None, None, done)


def snap(id_):
    def done(v, result):
        try:
            surface = v.get_snapshot_finish(result)
        except GLib.Error as e:
            answer({"id": id_, "error": e.message})
            return
        surface.flush()
        png = io.BytesIO()
        surface.write_to_png(png)
        answer({"id": id_, "width": surface.get_width(), "height": surface.get_height(),
                "stride": surface.get_stride(), "bgra": base64.b64encode(bytes(surface.get_data())).decode(),
                "png": base64.b64encode(png.getvalue()).decode()})
    view.get_snapshot(WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, done)


def on_line(channel, condition):
    line = requests.readline()
    if not line:
        Gtk.main_quit()
        return False
    request = json.loads(line)
    if request["op"] == "eval":
        evaluate(request["id"], request["body"])
    elif request["op"] == "snap":
        snap(request["id"])
    elif request["op"] == "hide":
        window.hide()
        answer({"id": request["id"]})
    elif request["op"] == "show":
        window.show_all()
        answer({"id": request["id"]})
    else:
        answer({"id": request["id"], "error": "unknown op " + request["op"]})
    return True


def on_load(v, event):
    if event == WebKit2.LoadEvent.FINISHED:
        link.connect("\0" + address[1:] if address.startswith("@") else address)
        GLib.io_add_watch(link.fileno(), GLib.IO_IN | GLib.IO_HUP, on_line)
        answer({"ready": "%d.%d.%d" % (WebKit2.get_major_version(), WebKit2.get_minor_version(), WebKit2.get_micro_version())})


view.connect("load-changed", on_load)
view.load_uri(page if "://" in page else GLib.filename_to_uri(page, None))
Gtk.main()
```

The test's side of WebKitGTK starts an X server of its own with Xvfb, listens
on an abstract unix socket, and starts the GTK program on that display. A web
process that dies leaves its GTK program running and silent, so every answer
has a deadline. Whatever started stops when the engine cannot stand.

<a name="chunk-webkitgtk-file"></a><sub>`tests/hosts/webkitgtk.ts` · `#webkitgtk-file` · assembles [webkitgtk-connect](#chunk-webkitgtk-connect)</sub>

```typescript {#webkitgtk-file file="tests/hosts/webkitgtk.ts"}
import { writeFileSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { ownedTempDir, spawnOwned } from '../../../../../tools/owned-process.mjs';
import { bgraImage, type Engine, readsVisibility, scratchEnv } from './engine.ts';

/** The Python with GTK 3 and WebKitGTK 4.1 bindings the dev shell names. */
const PYTHON = process.env.X0K_WEBKITGTK_PYTHON ?? 'x0k-webkitgtk-python';
const HOST = fileURLToPath(new URL('./webkitgtk_host.py', import.meta.url));
/** How long the host may take to answer one request, its first load included. */
const ANSWER_MS = 20_000;

const deadline = (what: string) => new Promise<never>((_, fail) =>
  setTimeout(() => fail(new Error(`the WebKitGTK host did not ${what} within ${ANSWER_MS} ms`)), ANSWER_MS).unref());

/** An X server of its own, at `dpi` dots per inch or its default, and the display it answers on. */
export async function display(env: NodeJS.ProcessEnv, dpi?: number) {
  const server = spawnOwned('Xvfb', ['-displayfd', '1', '-screen', '0', '1280x800x24', '-nolisten', 'tcp', ...(dpi ? ['-dpi', String(dpi)] : [])], { env, stdout: 'pipe' });
  const line = await new Promise<string>((done, fail) => {
    createInterface({ input: server.stdout! }).once('line', done);
    server.once('exit', () => fail(new Error('Xvfb ended before it named its display')));
  });
  return { server, name: `:${line.trim()}` };
}

/** A WebKitGTK webview at `width` by `height`, in a GTK window on an X server
 * of its own at `dpi` or its default, composited or not, with `script` injected
 * before the page's own scripts. */
export async function webkitgtk(page: string, script: string, { width, height, compositing, dpi }: { width: number; height: number; compositing: boolean; dpi?: number }): Promise<Engine> {
  const home = ownedTempDir('x0k-hold-home-');
  const scriptFile = `${home}/hold.js`;
  writeFileSync(scriptFile, script);
  const env = scratchEnv(home, { LIBGL_ALWAYS_SOFTWARE: '1', NO_AT_BRIDGE: '1', GDK_BACKEND: 'x11' });
  const x = await display(env, dpi);
  const stops: (() => Promise<void>)[] = [() => x.server.stop()];
  const stopAll = async () => { for (const stop of stops.reverse()) await stop(); };
  try {
    <<webkitgtk-connect>>
    return {
      name: `webkitgtk ${compositing ? 'composited' : 'not composited'}${dpi ? ` at ${dpi} dpi` : ''}`,
      version: `WebKitGTK ${version}`,
      evaluate,
      capture: async () => {
        const r = await call({ op: 'snap' });
        return bgraImage(r.width, r.height, r.stride, Buffer.from(r.bgra, 'base64'), Buffer.from(r.png, 'base64'));
      },
      hide: async () => {
        await call({ op: 'hide' });
        await readsVisibility(evaluate, 'hidden');
      },
      show: async () => {
        await call({ op: 'show' });
        await readsVisibility(evaluate, 'visible');
      },
      close: async () => { link.destroy(); await stopAll(); },
    };
  } catch (e) {
    await stopAll();
    throw e;
  }
}
```

<a name="chunk-webkitgtk-connect"></a><sub>`src/hold.ts` · `#webkitgtk-connect`</sub>

```typescript {#webkitgtk-connect}
const address = `@x0k-hold-${process.pid}-${Date.now()}`;
const server = createServer();
const accepted = new Promise<Socket>((done) => server.once('connection', done));
await new Promise<void>((done) => server.listen(`\0${address.slice(1)}`, done));
const host = spawnOwned(PYTHON, [HOST, address, page, scriptFile, String(width), String(height), compositing ? 'ALWAYS' : 'NEVER'],
  { env: { ...env, DISPLAY: x.name }, stderr: 'inherit' });
stops.push(async () => { server.close(); }, () => host.stop());
const ended = new Promise<never>((_, fail) => host.once('exit', (code) => fail(new Error(`the WebKitGTK host ended (${code})`))));
const link = await Promise.race([accepted, ended, deadline('load the page')]);
const lines = createInterface({ input: link })[Symbol.asyncIterator]();
const next = async () => JSON.parse((await Promise.race([lines.next(), ended, deadline('answer')])).value);
const version = (await next()).ready;
// Each answer goes to the request with its id, so a request may wait while another is answered.
const waiting = new Map<number, (reply: any) => void>();
void (async () => {
  for (let line = await lines.next(); !line.done; line = await lines.next()) {
    const reply = JSON.parse(line.value);
    waiting.get(reply.id)?.(reply);
    waiting.delete(reply.id);
  }
})();
let last = 0;
const call = async (request: object) => {
  const id = ++last;
  const answered = new Promise<any>((done) => waiting.set(id, done));
  link.write(JSON.stringify({ id, ...request }) + '\n');
  const reply = await Promise.race([answered, ended, deadline('answer')]);
  if (reply.error) throw new Error(reply.error);
  return reply;
};
const evaluate = async (body: string): Promise<string> => (await call({ op: 'eval', body })).value;
```

The images are plain byte-shuffling: a cairo surface's BGRA rows for
WebKitGTK, and a PNG decoded with Node's zlib for Chromium, with PNG's five
row filters undone.

<a name="chunk-engine-file"></a><sub>`tests/hosts/engine.ts` · `#engine-file` · assembles [engine-contract](#chunk-engine-contract)</sub>

```typescript {#engine-file file="tests/hosts/engine.ts"}
import { setTimeout as sleep } from 'node:timers/promises';
import { inflateSync } from 'node:zlib';

<<engine-contract>>

/** An image from BGRA rows, as a cairo surface holds them, and its PNG. */
export function bgraImage(width: number, height: number, stride: number, bytes: Buffer, png: Buffer): Image {
  return { width, height, png, rgb: (x, y) => { const o = y * stride + x * 4; return [bytes[o + 2], bytes[o + 1], bytes[o]]; } };
}

/** An image from a PNG of 8-bit RGB or RGBA, as CDP answers a screenshot. */
export function pngImage(png: Buffer): Image {
  let off = 8, width = 0, height = 0, kind = 0;
  const idat: Buffer[] = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('ascii', off + 4, off + 8);
    const data = png.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); kind = data[9]; }
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const bpp = kind === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 255;
    }
  }
  return { width, height, png, rgb: (x, y) => { const o = y * stride + x * bpp; return [out[o], out[o + 1], out[o + 2]]; } };
}
```

## Running it

From the repository root, in the dev shell:

```
nix develop /home/lsp/src/l30/main -c node --test substrate/apps/ui-control-page/tests/probe.test.ts
```

It needs the package's pinned dependencies (`npm ci` in
`substrate/apps/ui-control-page`), Node 24 or later, for its type stripping and
its `WebSocket`, and the
dev shell's Chromium, Xvfb and `x0k-webkitgtk-python`. It takes about a
minute for all four engines.

## What the test shows

Measured on arca with Chromium 148.0.7778.178 and WebKitGTK 2.50.4, 80 trials
per engine. With the hold, all 44 claims hold:

```
✔ the probe page in webkitgtk composited
✔ the probe page in webkitgtk not composited
✔ the probe page in chromium at ratio 1
✔ the probe page in chromium at ratio 2
ℹ pass 44
ℹ fail 0
```

Inside the drawn pointer, every engine's capture shows the ink, (124, 58, 237),
in an ordinary hold, and the counter's own colour in a hold for the frame
alone.

At the fixture mark's band, every engine's capture shows `FIXTURE_INK`,
(245, 158, 11), while the library says the fixture the mark names stands, the
page's own white in a hold for the frame alone, and white again once the
library says none stands, with no paint from the host between (claim 10, run
alone with `--test-name-pattern="fixture mark"`).

The hold's median was 41 to 42 ms in every engine, its 90th percentile 47 to
49 ms, and its maximum under 50 ms. The slider's mean drift was within 6 ms of its
timeline.

Through claim 11's 1.2 s frame, every engine captured all four holds, each
taking 1.21 to 1.24 s, with the counter painted as read.

Each mutation of the hold below turns the test red for its own reason. Each
was made in this chapter and tangled, and the test run on the projection:

| The hold with | What goes red | Seen |
|---|---|---|
| no hold: the read runs at once | claims 1 to 4 in all four engines | Chromium `80/80 refused: page_unsettled: epochs 23→26, 26→29, 29→32`; WebKitGTK composited `71/80 refused: page_unsettled: epochs 15→16, 16→17, 17→18`, and the slider `agreed 0/40 at 0 ms, 0/40 at 25 ms`, painted at 73 where the read said 115 |
| no pause of animations | claim 4 in all four engines | Chromium `agreed 0/40 at 0 ms, 0/40 at 25 ms`; WebKitGTK composited `agreed 2/40 at 0 ms, 0/40 at 25 ms`, the slider painted at 53 in each miss while the read said 117, 147, 171; not composited `agreed 40/40 at 0 ms, 0/40 at 25 ms` |
| a release by `play()` | claim 5 in all four engines; claim 4 in Chromium at ratio 1 | `mean drift -42.3 ms` to `-82.8 ms`; `agreed 33/40 at 0 ms, 30/40 at 25 ms`, the slider at 180 where the hold read 175 |
| a release by `play()`, in Chromium with `--disable-threaded-animation` | claim 5 only | `mean drift -62.9 ms`; the slider agreed in every trial |
| a hold that ignores `frameOnly` | claim 8 in all four engines | `frame alone 124,58,237` |
| the layer drawing the host's fixture mark whatever stands | claim 10 in all four engines | `after the fixture went 245,158,11` |
| the layer taking input: `pointer-events: auto`, not `inert` | claim 7 in all four engines | `hit: 'x0k-drawn-input'` where the page's is `counter` |
| the layer made after the library records the shadow roots a page makes | claim 7 in all four engines | `walked: false`, `moved: true`: the walk reaches into the layer's root, and a paint moves the epoch |
| a wait's bound counted from its start, not from the last rendering update heard | claim 11 in WebKitGTK | `no rendering update has come for 1 ms` in every hold: the bound ran out over a frame that came |
| the lapse counted from the hold's start, not its answer | claim 11 in all four engines | `page_unsettled: epochs 46→47, 49→51, 53→55`: the page let itself go before its host captured |
| both, as the library had them | claim 11 in all four engines | WebKitGTK `no rendering update has come for 1000 ms`; Chromium `page_unsettled: epochs 65→70, 73→79, 82→88` |

Without compositing and with no wait before the capture, WebKitGTK agreed
on the slider in every trial with its animations running. Its snapshot paints
the page afresh as it stands, and its round trips are shorter than a frame.
With compositing it draws a running CSS transform animation at one fixed
place, as the webview design measured, so only the pause puts the slider
where the read says. That row is red at both latencies. While the dev shell's
WebKitGTK ran without GL, the composited engine was not composited, and this
row was red only at 25 ms, the same as without compositing: `agreed 40/40 at
0 ms, 1/40 at 25 ms`.

Two parts of the hold are not shown necessary here. With `SETTLE_UPDATES` at
0, all 24 claims still held, and WebKitGTK's 12 held with compositing on:
waiting for each pause's `ready` already passes a rendering update in both
engines. The two updates stay for a host whose
snapshot is the compositor's last frame, which webview §2 holds them for and
which no engine on arca is. And the epoch's sources beyond the DOM, such as
scrolling, input and new animations, are not moved by the probe page; the
layout walk's tests and the input tests drive them.

## What is open

The ratio-1 gap in Chromium closes with a release that gives back each
animation's start time. That the pending play caused it is inferred, and
WebView2 is the engine that tests it next. A same-origin frame's own
animation-frame callbacks and animations are not held. The change the library
cannot see without the page's word stays the page's to report.
