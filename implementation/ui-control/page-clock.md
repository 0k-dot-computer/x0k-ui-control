# The page's stepped clock: one screencast time for every source of motion

```turtle folio:document
implementation:ui-control\/page-clock a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "The in-page library's stepped clock: a screencast time the host advances by one frame per frame, which every Web Animation, CSS transition, animation-frame callback, timer, performance.now, Date and SVG animation of the page follows, with the page's fetches and IPC counted as work a frame waits for within a bound, so a stepped run draws the same frames on a rerun, at any frame rate and under any load. A probe page test holds this in WebKitGTK and headless Chromium, and is red with one timer the clock does not step." ;
    x0k:concerns "ui-control", "webview", "screencast", "motion", "clock" ;
    x0k:motivatedBy intent:fa5761a4-c6f6-df42-2fc7-2dabeaba34a7 ;
    x0k:implements architecture:ui-screencast ;
    x0k:cites implementation:ui-control\/page-hold,
        implementation:ui-control\/page-answer,
        implementation:ui-control\/page-walk,
        implementation:ui-control\/tauri-plugin ;
    folio:tangleCrate "substrate/apps/ui-control-page" ;
    folio:tangleRoot "src/clock.ts" .
```

A screencast that steps its app's clock draws frame *n* at time *n* × 1000 /
fps after the run started, whatever each frame cost to draw
(`x0k:architecture/ui-screencast` §5). The page's hold
(`x0k:implementation/ui-control/page-hold`) already stops a page: it pauses
every animation, defers the page's animation-frame callbacks, and gives each
animation back its start time at the release. This chapter makes the stopped
page move again, by a time the host gives it. The library keeps a
**screencast time** *t*, and every source of motion it steps reads *t* and not
the wall clock.

The clock lives in the hold. The hold installs it before anything else, so
the library's own waits use the wall's time functions while the page's read
the screencast's, and the hold's animation-frame wrapper hands the page's
callbacks to the clock while it steps. A page's own code needs nothing new:
the host begins the clock, advances it once per frame, captures, and ends it.

The carried example is the **clock page**. At screencast time 0 it builds a
stage of five moving things: a box slid by a CSS animation, a box that a CSS
transition moves when a timer changes its class 250 ms in, a box faded by
`element.animate`, a line of text a second timer changes at 400 ms, and an
SVG rectangle moved by SMIL. Each animation frame paints the time since the
stage was built into a patch of pixels. A host runs the page twice and
compares the frames.

## What holds

These are §5's invariants, as the library keeps them:

- While the clock steps, `requestAnimationFrame`, `setTimeout`,
  `setInterval`, `requestIdleCallback`, `performance.now` and `Date` read the
  screencast time. `performance.now()` answers the wall's reading at the
  begin plus *t*, and `Date.now()` the date the begin names, or the wall's,
  plus *t*, in whole milliseconds as the wall's answers.
- Every Web Animation on the document's timeline that runs when the clock
  begins, or is made while it steps, is paused and seeked to where *t* puts
  it. One made during the run starts where it was caught: a CSS animation or
  transition at its start, a script's `animate()` at its time when made.
- A timer fires when the clock passes its due time, in order of due time and
  then of setting, with the screencast time at its due time while it runs.
- Each animation-frame callback the page asked for runs once in the frame
  after, with the screencast time as its timestamp.
- Each outermost SVG element's animations are paused and set to where *t*
  puts them.
- A frame is drawn only after each timer due by its time has fired, and the
  page's fetches, response bodies, `XMLHttpRequest`s and Tauri IPC calls the
  run started have answered, or reached the frame's bound, `PENDING_MS` by
  default. Work that reached its bound is named, and not waited on again.
- `advanceTo(t)` answers once the frame for *t* has settled through
  `SETTLE_UPDATES` rendering updates, as a hold does, so a capture taken next
  shows it.
- `end()` gives every animation it paused the start time that puts it where
  the wall clock does, sets each SVG to the wall's time, hands each pending
  timer and animation-frame callback back to the browser at its wall due
  time, and says whether a rerun would draw the same frames, and if not, why.
- After `end()`, `performance.now()` and `Date.now()` follow the wall again,
  never answering less than the last screencast time they answered.
- A host that begins the clock and never steps it again does not leave the
  page stopped: after `STEP_LAPSE_MS` with no step the clock ends itself.

**Cost bound.** One step costs its timers, its callbacks, its pending work up
to its bound, and one settle of the hold's, which the hold measured at 41 to
42 ms at the median on arca.

What the clock cannot step it names. `UNSTEPPED` is the offer's list
(§3), and each step names those the page has now:

- **Media playback.** A playing `<video>` or `<audio>` keeps the wall's time.
- **Frames.** A frame of another origin gives no document, and a same-origin
  frame's own timers, callbacks and animations are its window's.
- **A canvas drawn from a worker,** after `transferControlToOffscreen`, and any
  worker's timers.
- **The caret's blink and native smooth scrolling,** which the engine runs.
- **Script that reads `document.timeline.currentTime`** or an event's
  `timeStamp`, which the clock does not fake.
- **An idle callback's deadline,** which counts the wall's time within its
  callback, and an idle callback asked for before the clock began.
- **A timer with a string handler,** which stays the browser's.

## The clock's contract

A host reaches the clock as `steppedClock` on the hold's global,
`globalThis.__x0kUiHold.steppedClock`. Its words are its own: `begin`,
`advanceTo` and `end`, beside the hold's `hold`, `verify`, `rendered` and
`settled`, which they do not replace.

<a name="chunk-clock-contract"></a><sub>`src/clock.ts` · `#clock-contract`</sub>

```typescript {#clock-contract}
/** The stepped clock a host drives for a stepped screencast. */
export interface SteppedClock {
  /** Stop the page's time at screencast time 0: from now on it moves only
   * by `advanceTo`. Refused while a hold stands or the clock already steps. */
  begin(options?: BeginOptions): Begun;
  /** Advance the screencast time to `ms` from the begin, firing each timer
   * due on the way, running the page's animation-frame callbacks once, and
   * seeking every animation; answer once the frame for `ms` is ready to
   * capture. Refused for a time earlier than the clock's. */
  advanceTo(ms: number): Promise<Stepped>;
  /** Give the page back to the wall clock, and say whether a rerun would
   * draw the same frames. */
  end(): Ended;
  /** The screencast time, or `null` while the clock does not step. */
  time(): number | null;
  /** The sources of motion the clock never steps, as the offer names them. */
  unstepped(): string[];
}

/** How a host begins the clock. */
export interface BeginOptions {
  /** The `Date.now()` screencast time 0 reads, in ms since the epoch; the
   * wall's at the begin when left out. */
  date?: number;
  /** How long one step waits on the run's pending work before it draws
   * anyway, in ms. */
  pendingMs?: number;
}

/** What `begin` answers: the sources the page has now that the clock does
 * not step. */
export interface Begun { unstepped: string[] }

/** One frame, ready to capture. */
export interface Stepped {
  /** Its screencast time, in ms. */
  time: number;
  /** The page's epoch, read once the frame settled. */
  epoch: number;
  /** How many timers fired, and how many animation-frame callbacks ran. */
  timers: number;
  frames: number;
  /** How many animations the clock holds. */
  animations: number;
  /** The run's pending work that reached its bound in this step. */
  overBound?: string[];
  /** The sources the page has now that the clock does not step. */
  unstepped: string[];
  /** Why the frame could not paint, as the hold says. */
  unpainted?: string;
}

/** What `end` answers. */
export interface Ended {
  /** The screencast time the clock ended at. */
  time: number;
  /** Whether a rerun of the same run from the same start would draw the
   * same frames, as far as the clock can tell, and why not. */
  sameOnRerun: boolean;
  why: string[];
}

/** How long one step waits for the run's pending work by default. */
export const PENDING_MS = 2000;
/** How long the clock may go without a step before it ends itself. */
export const STEP_LAPSE_MS = 10_000;
/** What the clock never steps: the offer's list. */
export const UNSTEPPED = ['media playback', 'frames from other origins', 'the clocks of same-origin frames',
  'canvas drawn from a worker', 'timers in workers', "the caret's blink", 'native smooth scrolling',
  'document.timeline.currentTime read by script', 'event timestamps', "an idle callback's deadline"];
```

`PENDING_MS` is two seconds so that a step, its pending work and its settle
answer inside the Tauri plugin's five-second wait for a page's answer
(`x0k:implementation/ui-control/tauri-plugin`).

The hold gives the clock what only the hold has: the page's animation-frame
callbacks, its settle, its epoch and whether it is held.

<a name="chunk-clock-frames"></a><sub>`src/clock.ts` · `#clock-frames`</sub>

```typescript {#clock-frames}
/** The wall's time functions, as the page had them before the library
 * wrapped them. The library's own waits use these. */
export interface Natives {
  setTimeout(cb: () => void, ms?: number): number;
  clearTimeout(id?: number): void;
  now(): number;
}

/** What the clock asks of the hold. */
export interface ClockFrames {
  /** Take every animation-frame callback the page has asked for from the
   * browser, to run when the clock says. */
  take(): void;
  /** Run the callbacks taken so far with `timestamp`, and answer how many. */
  run(timestamp: number): number;
  /** Hand the callbacks still taken back to the browser. */
  give(): void;
  /** Answer once each of `ready` has settled and the hold's settle has run,
   * or why the page cannot paint. */
  settle(ready: Promise<unknown>[]): Promise<string | undefined>;
  epoch(): number;
  held(): boolean;
}

/** The clock as the hold holds it. */
export interface Clock {
  native: Natives;
  stepped: SteppedClock;
  /** Whether the clock steps now. */
  stepping(): boolean;
  /** An animation a script made with `animate()`, which the clock catches at once. */
  created(animation: Animation): void;
  /** Give the clock the hold's side. */
  bind(frames: ClockFrames): void;
}
```

## Installing before the page

The clock wraps the page's time functions when the library installs, before
the page's scripts run, not when a screencast begins. A page that keeps its
own reference to `setTimeout` or `performance.now` keeps the wrapper. And a
timer set before the begin is the clock's to move: the begin takes it from
the browser and the end hands it back.

<a name="chunk-clock-install"></a><sub>`src/clock.ts` · `#clock-install` · assembles [clock-time](#chunk-clock-time) · [clock-timers](#chunk-clock-timers) · [clock-pending](#chunk-clock-pending) · [clock-animations](#chunk-clock-animations) · [clock-svg](#chunk-clock-svg) · [clock-unstepped](#chunk-clock-unstepped) · [clock-steps](#chunk-clock-steps)</sub>

```typescript {#clock-install}
/** Install the clock in `win`, before the page's own scripts run. */
export function installClock(win: Window): Clock {
  const w = win as any;
  const nativeSetTimeout = win.setTimeout.bind(win);
  const nativeSetInterval = win.setInterval.bind(win);
  const nativeClearTimeout = win.clearTimeout.bind(win);
  const perf = win.performance;
  const nativeNow = perf.now.bind(perf);
  const NativeDate = win.Date;
  const nativeDateNow = NativeDate.now.bind(NativeDate);
  const native: Natives = { setTimeout: (cb, ms) => nativeSetTimeout(cb, ms), clearTimeout: (id) => nativeClearTimeout(id), now: nativeNow };

  let frames: ClockFrames | undefined;
  /** The run while the clock steps, and `null` while it does not. */
  let run: Run | null = null;
  /** After a run, the wall's time never answers less than the run's last. */
  let floorNow = -Infinity, floorDate = -Infinity;
  const report = (e: unknown) => { nativeSetTimeout(() => { throw e; }); };
  /** Let the page's promise continuations run, inside the task the clock runs. */
  const turns = async () => { for (let i = 0; i < MICROTASK_TURNS; i++) await undefined; };

  <<clock-time>>
  <<clock-timers>>
  <<clock-pending>>
  <<clock-animations>>
  <<clock-svg>>
  <<clock-unstepped>>
  <<clock-steps>>

  return { native, stepped, stepping: () => run !== null, created, bind: (given) => { frames = given; } };
}
```

A run keeps the screencast time and where time 0 lies on each of the wall's
clocks.

<a name="chunk-clock-run"></a><sub>`src/clock.ts` · `#clock-run`</sub>

```typescript {#clock-run}
/** One stepped run. */
interface Run {
  /** The screencast time, in ms from the begin. */
  t: number;
  /** `performance.now()`, `Date.now()` and the document timeline's time at
   * screencast time 0. */
  perf0: number;
  date0: number;
  timeline0: number;
  /** Whether the begin named the date, so the end need not keep it monotonic. */
  dateNamed: boolean;
  pendingMs: number;
  /** Why a rerun would draw other frames. */
  why: Set<string>;
}

/** How many microtask turns the clock gives a page's promise continuations
 * after each timer and each frame, inside the clock's own task. */
const MICROTASK_TURNS = 16;
/** How many timers one step may fire before the clock calls them runaway. */
const MAX_TIMERS_PER_STEP = 10_000;
/** An idle callback's period, in ms. */
const IDLE_PERIOD_MS = 50;
```

## Time

`performance.now` and `Date` answer the screencast time while the clock
steps. Off a run they are the wall's, floored at the last time a run
answered, since a host that steps faster than the wall would otherwise end a
run with time going back. `Date` stays a constructor: called with no
arguments it reads the clock, with arguments it is the native `Date`, and
`instanceof Date` holds for either.

<a name="chunk-clock-time"></a><sub>`src/clock.ts` · `#clock-time`</sub>

```typescript {#clock-time}
const nowAt = () => (run ? run.perf0 + run.t : Math.max(nativeNow(), floorNow));
const dateAt = () => (run ? Math.floor(run.date0 + run.t) : Math.max(nativeDateNow(), floorDate));
Object.defineProperty(perf, 'now', { value: function now() { return nowAt(); }, configurable: true, writable: true });
function SteppedDate(this: unknown, ...args: unknown[]) {
  if (!new.target) return new NativeDate(dateAt()).toString();
  return Reflect.construct(NativeDate, args.length === 0 ? [dateAt()] : args, new.target);
}
SteppedDate.prototype = NativeDate.prototype;
Object.setPrototypeOf(SteppedDate, NativeDate);
Object.defineProperty(SteppedDate, 'name', { value: 'Date' });
(SteppedDate as any).now = () => dateAt();
Object.defineProperty(win, 'Date', { value: SteppedDate, configurable: true, writable: true });
```

## Timers

Every timer the page sets with a function goes through the clock, by the id
the page was given. Off a run it is the browser's timer, and the page's id is
the browser's, so a page that never steps runs its timers as before. On a run
a timer is the clock's: its due time is screencast time, and it fires when a
step passes it. The begin takes each of the browser's timers back, its due
time moved onto screencast time, and the end hands each back with the wall's
time left to its due time, firing at once one the run has passed.

Timers nest as HTML says: a timer set while another fires, or in that
timer's promise continuations, nests one deeper, and past four levels its
delay is at least 4 ms. So a chain of zero-delay timers, or an interval of 0,
moves the clock on instead of firing forever at one time.

<a name="chunk-clock-timers"></a><sub>`src/clock.ts` · `#clock-timers` · assembles [clock-idle](#chunk-clock-idle)</sub>

```typescript {#clock-timers}
/** A timer the page holds, by the id it was given. Off a run `native` is the
 * browser's timer and `due` is on the wall's `performance.now`; on a run `due`
 * is screencast time. */
interface Timer { id: number; handler: (...args: unknown[]) => unknown; args: unknown[]; due: number; every?: number; nesting: number; seq: number; native?: number }
const timers = new Map<number, Timer>();
let seq = 0, lastVirtual = 1 << 30;
/** The timer whose handler, or whose promise continuations, run now. */
let running: Timer | undefined;
/** Hand `timer` to the browser, to fire after `delay` ms. */
const armNative = (timer: Timer, delay: number): number => {
  timer.due = nativeNow() + delay;
  if (timer.every === undefined) return nativeSetTimeout(() => { timers.delete(timer.id); timer.handler.apply(win, timer.args); }, delay);
  if (delay === timer.every) return nativeSetInterval(() => { timer.due = nativeNow() + timer.every!; timer.handler.apply(win, timer.args); }, timer.every);
  // An interval handed back part-way runs once after `delay`, then every `every`.
  return nativeSetTimeout(() => { timer.native = armNative(timer, timer.every!); timer.handler.apply(win, timer.args); }, delay);
};
const nested = (nesting: number, delay: number) => (nesting > 4 ? Math.max(delay, 4) : delay);
const add = (handler: unknown, ms: unknown, args: unknown[], every: boolean): number => {
  // A string handler stays the browser's: the clock does not step it.
  if (typeof handler !== 'function') return (every ? nativeSetInterval : nativeSetTimeout)(handler as any, ms as number, ...args);
  const delay = Math.max(0, Number(ms) || 0);
  const timer: Timer = { id: 0, handler: handler as Timer['handler'], args, due: 0, every: every ? delay : undefined, nesting: running ? running.nesting + 1 : 0, seq: ++seq };
  if (run) {
    timer.id = ++lastVirtual;
    timer.due = run.t + nested(timer.nesting, delay);
  } else {
    timer.id = timer.native = armNative(timer, delay);
  }
  timers.set(timer.id, timer);
  return timer.id;
};
win.setTimeout = ((handler: unknown, ms?: unknown, ...args: unknown[]) => add(handler, ms, args, false)) as any;
win.setInterval = ((handler: unknown, ms?: unknown, ...args: unknown[]) => add(handler, ms, args, true)) as any;
win.clearTimeout = win.clearInterval = ((id?: number) => {
  const timer = id === undefined ? undefined : timers.get(id);
  if (!timer) return nativeClearTimeout(id);
  timers.delete(timer.id);
  if (timer.native !== undefined) nativeClearTimeout(timer.native);
}) as any;
<<clock-idle>>
/** The timer due first by `target`: the earliest due time, then the first set. */
const nextDue = (target: number) => {
  let first: Timer | undefined;
  for (const timer of timers.values()) {
    if (timer.native !== undefined || timer.due > target) continue;
    if (!first || timer.due < first.due || (timer.due === first.due && timer.seq < first.seq)) first = timer;
  }
  return first;
};
/** Fire `timer` at the run's time, which the caller set to its due time. */
const fire = (timer: Timer, at: number) => {
  if (timer.every === undefined) timers.delete(timer.id);
  else {
    timer.nesting += 1;
    timer.due = at + nested(timer.nesting, timer.every);
    timer.seq = ++seq;
  }
  try { timer.handler.apply(win, timer.args); } catch (e) { report(e); }
};
```

An idle callback the page asks for while the clock steps is a timer due at
once, so it runs in the step that asked or the next. Its deadline counts the
wall's time from the callback's start to the end of an idle period, so a page
that does its work until the deadline runs out does a wall-dependent share of
it in each callback. One asked for off a run is the browser's, and the clock
does not take it at the begin.

<a name="chunk-clock-idle"></a><sub>`src/clock.ts` · `#clock-idle`</sub>

```typescript {#clock-idle}
const nativeIdle = w.requestIdleCallback?.bind(win), nativeCancelIdle = w.cancelIdleCallback?.bind(win);
if (nativeIdle) {
  w.requestIdleCallback = (cb: IdleRequestCallback, options?: IdleRequestOptions) => {
    if (!run) return nativeIdle(cb, options);
    return add(() => {
      const started = nativeNow();
      cb({ didTimeout: false, timeRemaining: () => Math.max(0, IDLE_PERIOD_MS - (nativeNow() - started)) });
    }, 0, [], false);
  };
  w.cancelIdleCallback = (id: number) => (timers.has(id) ? win.clearTimeout(id) : nativeCancelIdle(id));
}
```

## Pending work

Chromium's virtual time does not advance while a fetch is pending, under its
`pauseIfNetworkFetchesPending` policy. The clock does the same for the work
of the page's own that a step can see leave the window: a `fetch`, the read
of a response's body, an `XMLHttpRequest`, and a Tauri IPC call. Each one the
run starts is counted until it answers, and a step draws its frame only after
all have answered, or its bound has passed. Work still pending then is named
in the step's answer and in the end's reasons, and later steps no longer wait
on it, so a long poll costs one bound and not one per frame.

Tauri's IPC is `window.__TAURI_INTERNALS__.invoke`, which `@tauri-apps/api`
calls at each call, so the clock wraps it at the begin. The Tauri plugin's
own channel, through which the page answers its host, is not the run's work
and is not counted.

<a name="chunk-clock-pending"></a><sub>`src/clock.ts` · `#clock-pending`</sub>

```typescript {#clock-pending}
/** The run's pending work, by what it is. */
const pending = new Map<Promise<unknown>, string>();
/** Pending work that reached a step's bound, which no later step waits on. */
const gaveUp = new Set<Promise<unknown>>();
const counted = (what: string, work: Promise<unknown>) => {
  if (!run) return;
  pending.set(work, what);
  const done = () => { pending.delete(work); gaveUp.delete(work); };
  work.then(done, done);
};
const nativeFetch = win.fetch?.bind(win);
if (nativeFetch) {
  win.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const answer = nativeFetch(input, init);
    counted(`fetch ${input instanceof win.Request ? input.url : String(input)}`, answer);
    return answer;
  }) as typeof win.fetch;
}
for (const method of ['arrayBuffer', 'blob', 'formData', 'json', 'text'] as const) {
  const read = win.Response?.prototype[method];
  if (!read) continue;
  (win.Response.prototype as any)[method] = function (this: Response) {
    const body = (read as () => Promise<unknown>).call(this);
    counted(`the body of ${this.url}`, body);
    return body;
  };
}
const send = win.XMLHttpRequest?.prototype.send;
if (send) {
  win.XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    if (run) counted('an XMLHttpRequest', new Promise((done) => this.addEventListener('loadend', done, { once: true })));
    return send.call(this, body);
  };
}
/** The Tauri plugin's own channel, by its commands' prefix. */
const HOST_CHANNEL = 'plugin:x0k-ui-tauri|';
const COUNTING = Symbol.for('x0k.ui-control.clock.ipc');
/** Count the page's Tauri IPC calls, once the page has Tauri's. */
const countIpc = () => {
  const internals = w.__TAURI_INTERNALS__;
  const invoke = internals?.invoke;
  if (typeof invoke !== 'function' || invoke[COUNTING]) return;
  const counting = (cmd: unknown, ...rest: unknown[]) => {
    const answer = invoke.call(internals, cmd, ...rest);
    if (!(typeof cmd === 'string' && cmd.startsWith(HOST_CHANNEL))) counted(`ipc ${String(cmd)}`, Promise.resolve(answer));
    return answer;
  };
  (counting as any)[COUNTING] = true;
  try { internals.invoke = counting; } catch { /* a frozen object: its calls are not counted */ }
};
/** Wait until the run's pending work has answered, or `until` on the wall's
 * clock has passed; name what still waits then in `over`. */
const quiet = async (until: number, over: string[]) => {
  for (;;) {
    const waiting = [...pending.keys()].filter((work) => !gaveUp.has(work));
    if (waiting.length === 0 || !run) return;
    const left = until - nativeNow();
    const timedOut = left <= 0 || await new Promise<boolean>((done) => {
      const timer = nativeSetTimeout(() => done(true), left);
      Promise.allSettled(waiting).then(() => { nativeClearTimeout(timer); done(false); });
    });
    if (timedOut) {
      for (const work of waiting) {
        const what = pending.get(work);
        if (what === undefined) continue;
        gaveUp.add(work);
        over.push(what);
        run.why.add(`pending work reached its bound: ${what}`);
      }
      return;
    }
    // The replies' continuations run, and may start more work.
    await turns();
  }
};
```

## Animations

This is timeweb's detection (`timeweb` 0.3.2 and later, the library under
timesnap and timecut), as `x0k:architecture/ui-screencast` adopts it: the
clock catches every animation through `document.getAnimations()`, through the
hold's wrapper of `Element.prototype.animate`, which hands it each animation a
script makes at once, and through the `transitionrun` and `animationstart`
events timeweb's source listens for. timeweb freezes an animation by a
playback rate of 0; the clock pauses it instead, since the hold's measurements
show a pause is what both engines' compositors hold to.

`getAnimations()` brings the document's style up to date before it answers,
so a CSS transition a class change starts exists by the time the clock asks.
The clock asks right after each timer and after the frame's callbacks, in the
same task, and, while it steps, after each batch of DOM mutations, in the
microtasks of the task that made them. So an animation a change starts is
caught before any rendering update could start it on the wall, whichever task
made the change: a timer's, a host's call, a fetch's reply. Without the
mutation watch, the clock page's spinner, made by a host's call before frame
0, was missing from frame 0 of the first run in headless Chromium in 1 of 3
sessions on arca. That the browser had started its animation on the
compositor before the step caught it is inferred: a call of `go()` from a
timer the clock ran, where nothing renders before the catch, showed no miss. A CSS animation or transition caught later still
is caught at its start, where §5 puts it.

Each animation the clock holds keeps where it was caught, so its time at
screencast time *t* is `offset + (t − base) × rate`. One running at the begin
is placed by its start time on the document timeline at the begin. The end
gives each back the start time that puts it where the wall clock does,
reading screencast time *t* as the wall's begin plus *t*: one that ran before
the begin gets its own start time back, as the hold's release gives it.

<a name="chunk-clock-animations"></a><sub>`src/clock.ts` · `#clock-animations`</sub>

```typescript {#clock-animations}
/** Where an animation the clock holds was caught: its time at screencast
 * time `t` is `offset + (t - base) * rate`. */
interface Kept { offset: number; base: number; rate: number }
const kept = new Map<Animation, Kept>();
/** The `ready` of each animation paused since the last settle. */
let fresh: Promise<unknown>[] = [];
const keep = (animation: Animation, at: Kept) => {
  animation.pause();
  kept.set(animation, at);
  // One cancelled before it settles rejects its `ready`, which is no fault of the page's.
  fresh.push(animation.ready.catch(() => undefined));
};
const onDocument = (animation: Animation) => animation.timeline === win.document.timeline;
const isCss = (animation: Animation) => (w.CSSAnimation && animation instanceof w.CSSAnimation) || (w.CSSTransition && animation instanceof w.CSSTransition);
/** Catch each running animation not yet caught, or set running again by the page. */
const catchAnimations = () => {
  if (!run) return;
  for (const animation of win.document.getAnimations()) {
    if (!onDocument(animation) || animation.playState !== 'running') continue;
    const offset = kept.has(animation) || !isCss(animation) ? Number(animation.currentTime ?? 0) : 0;
    keep(animation, { offset, base: run.t, rate: animation.playbackRate });
  }
};
const created = (animation: Animation) => {
  if (run && onDocument(animation)) keep(animation, { offset: Number(animation.currentTime ?? 0), base: run.t, rate: animation.playbackRate });
};
for (const type of ['transitionrun', 'animationstart']) win.addEventListener(type, catchAnimations, { capture: true, passive: true });
/** While the clock steps, each batch of DOM mutations is caught in the task that made it. */
const mutations = new win.MutationObserver(() => catchAnimations());
/** Hold each animation running at the begin, placed by its start time. */
const keepRunning = (r: Run) => {
  let running = 0;
  for (const animation of win.document.getAnimations()) {
    if (!onDocument(animation) || animation.playState !== 'running') continue;
    const rate = animation.playbackRate;
    const offset = animation.startTime === null ? Number(animation.currentTime ?? 0) : (r.timeline0 - Number(animation.startTime)) * rate;
    keep(animation, { offset, base: 0, rate });
    running += 1;
  }
  if (running > 0) r.why.add(`${running} animations ran when the clock began, where the wall had put them`);
};
const seekAnimations = (t: number) => {
  for (const [animation, at] of kept) {
    if (animation.playState === 'idle') kept.delete(animation);
    else if (animation.playState === 'paused') animation.currentTime = at.offset + (t - at.base) * at.rate;
  }
};
/** Give each animation still paused the start time that puts it where the wall does. */
const giveAnimations = (r: Run) => {
  for (const [animation, at] of kept) {
    if (animation.playState !== 'paused') continue;
    if (at.rate === 0) animation.play();
    else animation.startTime = r.timeline0 + at.base - at.offset / at.rate;
  }
  kept.clear();
  fresh = [];
};
```

## SVG

An SVG element's SMIL animations run on its own time container, the outermost
`<svg>`'s, which `pauseAnimations` stops and `setCurrentTime` sets in seconds.
The clock pauses each outermost SVG it finds running, at the begin and after
each timer and frame, and sets it to its time when caught plus the screencast
time since. The end sets each to where the wall puts it and lets it run. An
SVG the page paused itself is the page's.

One SVG made during the run starts at its start, time 0, as a CSS animation
does. Measured on arca, a new SVG's time reads 0 in Chromium and 0.2 ms in
WebKitGTK when made, so 0 is where it was. And the clock catches an SVG before
a script begins one of its animations, through `beginElement` and
`beginElementAt`: caught after, an animation begun in the same task begins
some microseconds of the wall into the SVG's time, and its edges were drawn a
few levels of antialiasing apart in two runs in WebKitGTK.

<a name="chunk-clock-svg"></a><sub>`src/clock.ts` · `#clock-svg`</sub>

```typescript {#clock-svg}
/** Each outermost SVG the clock holds: its time when caught, in s, and the
 * screencast time it was caught at. */
const svgs = new Map<SVGSVGElement, { from: number; at: number }>();
/** Hold `svg`, at the begin at its time, or during the run at its start. */
const catchSvg = (svg: SVGSVGElement, atBegin: boolean) => {
  if (!run || svg.ownerSVGElement || svgs.has(svg) || typeof svg.pauseAnimations !== 'function' || svg.animationsPaused()) return;
  svg.pauseAnimations();
  if (!atBegin) svg.setCurrentTime(0);
  svgs.set(svg, { from: atBegin ? svg.getCurrentTime() : 0, at: run.t });
};
const catchSvgs = (atBegin = false) => { for (const svg of win.document.querySelectorAll('svg')) catchSvg(svg, atBegin); };
const svgAnimation = w.SVGAnimationElement?.prototype;
for (const name of ['beginElement', 'beginElementAt'] as const) {
  const begin = svgAnimation?.[name];
  if (!begin) continue;
  svgAnimation[name] = function (this: SVGAnimationElement, ...args: unknown[]) {
    let outer = this.ownerSVGElement;
    while (outer?.ownerSVGElement) outer = outer.ownerSVGElement;
    if (outer) catchSvg(outer, false);
    return begin.apply(this, args);
  };
}
const seekSvgs = (t: number) => {
  for (const [svg, { from, at }] of svgs) {
    if (svg.isConnected) svg.setCurrentTime(from + (t - at) / 1000);
    else svgs.delete(svg);
  }
};
const giveSvgs = (r: Run) => {
  for (const [svg, { from, at }] of svgs) {
    svg.setCurrentTime(from + (nativeNow() - r.perf0 - at) / 1000);
    svg.unpauseAnimations();
  }
  svgs.clear();
};
```

## What the clock cannot step

The offer names the sources the clock never steps (`UNSTEPPED`). Each step
names those the page has now, so a host can say why a rerun differs: a
playing medium, frames, and canvases handed to a worker, which the library
counts as the page hands them.

<a name="chunk-clock-unstepped"></a><sub>`src/clock.ts` · `#clock-unstepped`</sub>

```typescript {#clock-unstepped}
let workerCanvases = 0;
const transfer = w.HTMLCanvasElement?.prototype.transferControlToOffscreen;
if (transfer) {
  w.HTMLCanvasElement.prototype.transferControlToOffscreen = function (this: HTMLCanvasElement) { workerCanvases += 1; return transfer.call(this); };
}
/** The sources the page has now that the clock does not step. */
const unsteppedNow = (): string[] => {
  const doc = win.document;
  const found: string[] = [];
  const playing = [...doc.querySelectorAll('video, audio')].filter((media) => !(media as HTMLMediaElement).paused).length;
  if (playing) found.push(`media playback: ${playing} playing`);
  let other = 0, same = 0;
  for (const frame of doc.querySelectorAll('iframe, frame')) {
    let inner: Document | null = null;
    try { inner = (frame as HTMLIFrameElement).contentDocument; } catch { inner = null; }
    if (inner) same += 1; else other += 1;
  }
  if (other) found.push(`frames from other origins: ${other}`);
  if (same) found.push(`the clocks of same-origin frames: ${same}`);
  if (workerCanvases) found.push(`canvas drawn from a worker: ${workerCanvases} handed over`);
  return found;
};
```

## A step

A step runs in an order a rerun repeats. It waits on the run's pending work.
It fires each timer due by its time, earliest first, with the screencast time
at the timer's due time, and after each catches what the timer started and
waits on what it set off. It sets the time to the step's, runs the page's
animation-frame callbacks once with that time, and catches again. Then it
seeks every animation and SVG to the time, and lets the hold settle the frame.

A step never runs inside another, and never goes back in time. The begin is
refused while a hold stands, since the hold's release would give its paused
animations back to the wall. While the clock steps, a hold pauses nothing,
since the clock has paused it all, and its release gives nothing back.

<a name="chunk-clock-steps"></a><sub>`src/clock.ts` · `#clock-steps`</sub>

```typescript {#clock-steps}
let busy = false;
let lapse: number | undefined;
/** Why the clock ended itself, until it begins again. */
let lapsed: string | undefined;
const relapse = () => {
  nativeClearTimeout(lapse);
  lapse = nativeSetTimeout(() => {
    if (!run || busy) return;
    stepped.end();
    lapsed = `the stepped clock ended itself after ${STEP_LAPSE_MS} ms with no step`;
  }, STEP_LAPSE_MS);
};
/** Catch what a timer or the frame's callbacks started. */
const caught = () => { catchAnimations(); catchSvgs(); };
const stepped: SteppedClock = {
  begin(options = {}) {
    if (!frames) throw new Error('the stepped clock has no hold');
    if (run) throw new Error('the stepped clock already steps');
    if (frames.held()) throw new Error('the page is held: verify the hold before the clock begins');
    const perf0 = nativeNow();
    const r: Run = { t: 0, perf0, date0: options.date ?? nativeDateNow(), dateNamed: options.date !== undefined,
      timeline0: Number(win.document.timeline.currentTime ?? perf0), pendingMs: options.pendingMs ?? PENDING_MS, why: new Set() };
    run = r;
    lapsed = undefined;
    for (const timer of timers.values()) {
      if (timer.native === undefined) continue;
      nativeClearTimeout(timer.native);
      timer.native = undefined;
      timer.due -= perf0;
      timer.nesting = 0;
    }
    frames.take();
    keepRunning(r);
    catchSvgs(true);
    mutations.observe(win.document, { subtree: true, childList: true, attributes: true, characterData: true });
    countIpc();
    relapse();
    return { unstepped: unsteppedNow() };
  },
  async advanceTo(ms) {
    const r = run;
    if (!r || !frames) throw new Error(lapsed ?? 'the stepped clock does not step: begin it first');
    if (busy) throw new Error('a step is already running');
    if (!Number.isFinite(ms) || ms < r.t) throw new Error(`a step goes forward: the clock is at ${r.t} ms, and the step asked for ${ms} ms`);
    busy = true;
    nativeClearTimeout(lapse);
    try {
      const until = nativeNow() + r.pendingMs;
      const over: string[] = [];
      let fired = 0;
      await quiet(until, over);
      for (let timer = nextDue(ms); timer && run === r; timer = nextDue(ms)) {
        if (fired === MAX_TIMERS_PER_STEP) {
          r.why.add(`timers ran away: ${MAX_TIMERS_PER_STEP} fired in one step`);
          break;
        }
        r.t = Math.max(r.t, timer.due);
        running = timer;
        fire(timer, r.t);
        fired += 1;
        caught();
        await turns();
        running = undefined;
        caught();
        await quiet(until, over);
      }
      r.t = ms;
      const ran = frames.run(r.perf0 + ms);
      caught();
      await turns();
      caught();
      await quiet(until, over);
      seekAnimations(ms);
      seekSvgs(ms);
      const ready = fresh;
      fresh = [];
      const unpainted = await frames.settle(ready);
      const found = unsteppedNow();
      for (const source of found) r.why.add(`an unstepped source: ${source}`);
      const step: Stepped = { time: ms, epoch: frames.epoch(), timers: fired, frames: ran, animations: kept.size, unstepped: found };
      if (over.length) step.overBound = over;
      if (unpainted) step.unpainted = unpainted;
      return step;
    } finally {
      running = undefined;
      busy = false;
      if (run === r) relapse();
    }
  },
  end() {
    const r = run;
    if (!r) return { time: 0, sameOnRerun: false, why: [lapsed ?? 'the stepped clock did not step'] };
    run = null;
    mutations.disconnect();
    nativeClearTimeout(lapse);
    floorNow = r.perf0 + r.t;
    floorDate = r.dateNamed ? -Infinity : r.date0 + r.t;
    giveAnimations(r);
    giveSvgs(r);
    for (const timer of timers.values()) {
      if (timer.native === undefined) timer.native = armNative(timer, Math.max(0, r.perf0 + timer.due - nativeNow()));
    }
    frames?.give();
    pending.clear();
    gaveUp.clear();
    return { time: r.t, sameOnRerun: r.why.size === 0, why: [...r.why] };
  },
  time: () => run?.t ?? null,
  unstepped: () => [...UNSTEPPED],
};
```

The file:

<a name="chunk-clock-file"></a><sub>`src/clock.ts` · `#clock-file` · assembles [clock-contract](#chunk-clock-contract) · [clock-frames](#chunk-clock-frames) · [clock-run](#chunk-clock-run) · [clock-install](#chunk-clock-install)</sub>

```typescript {#clock-file file="src/clock.ts"}
<<clock-contract>>

<<clock-frames>>

<<clock-run>>

<<clock-install>>
```

## The clock page

The carried example in full. `go()` builds the stage afresh, so each run
starts from the same state, and starts its motion: the CSS animation and the
script's animation on new elements, the SVG animation by `beginElement`, the
animation-frame loop that paints the time since `go()` into the counter's
pixels (red the ms mod 256, green the ms div 256), and the two timers. A host
calls `go()` right after the begin, as a run's step at time 0 takes effect
before frame 0, in a task the clock does not run: what it starts is caught at
time 0 all the same.

The counter paints time, not a count of frames, so its pixels are a function
of the time alone. A loop that counted its frames would paint frame *n* at
30 fps unlike frame 2*n* at 60 fps, though the clock gave each the same time.

`slide()` starts a CSS animation outside the stage, on the wall, for the
claims of the end.

<a name="chunk-clock-page"></a><sub>`tests/clock-page.html` · `#clock-page`</sub>

```html {#clock-page file="tests/clock-page.html"}
<!doctype html>
<html><head><meta charset="utf-8"><title>clock probe</title><style>
html, body { margin: 0; background: #fff; overflow: hidden; font: 16px sans-serif; }
#counter { position: absolute; left: 0; top: 0; width: 64px; height: 64px; background: rgb(0, 0, 0); }
#spinner { position: absolute; left: 0; top: 80px; width: 30px; height: 30px; background: rgb(0, 0, 255); animation: spin 1s linear infinite; }
@keyframes spin { from { transform: translateX(0); } to { transform: translateX(300px); } }
#mover { position: absolute; left: 0; top: 120px; width: 30px; height: 30px; background: rgb(0, 160, 0); transition: transform 300ms ease-in-out; }
#mover.moved { transform: translateX(240px); }
#fader { position: absolute; left: 340px; top: 80px; width: 40px; height: 70px; background: rgb(255, 128, 0); }
#said { position: absolute; left: 100px; top: 20px; color: rgb(0, 0, 0); }
#stage svg { position: absolute; left: 0; top: 160px; }
#slider { position: absolute; left: 0; top: 220px; width: 20px; height: 20px; background: rgb(120, 120, 120); }
.sliding #slider { animation: spin 2s linear infinite; }
</style></head><body>
<div id="counter"></div><div id="stage"></div><div id="slider"></div>
<script>
let loop = 0, timers = [];
/** Build the stage afresh and start its motion, from the time it is called. */
window.go = () => {
  cancelAnimationFrame(loop);
  for (const timer of timers) clearTimeout(timer);
  const stage = document.getElementById('stage');
  stage.innerHTML = '<div id="spinner"></div><div id="mover"></div><div id="fader"></div><div id="said">waiting</div>'
    + '<svg width="400" height="40"><rect x="0" y="5" width="30" height="30" fill="rgb(255, 0, 0)">'
    + '<animate attributeName="x" from="0" to="300" dur="1s" begin="indefinite" repeatCount="indefinite"/></rect></svg>';
  stage.querySelector('animate').beginElement();
  document.getElementById('fader').animate([{ opacity: 1 }, { opacity: 0.2 }], { duration: 800, iterations: Infinity, direction: 'alternate' });
  const counter = document.getElementById('counter');
  const start = performance.now();
  const tick = (now) => {
    const ms = Math.round(now - start);
    counter.style.background = `rgb(${ms & 255}, ${(ms >> 8) & 255}, 0)`;
    window.painted = ms;
    loop = requestAnimationFrame(tick);
  };
  loop = requestAnimationFrame(tick);
  timers = [
    setTimeout(() => document.getElementById('mover').classList.add('moved'), 250),
    setTimeout(() => { const said = document.getElementById('said'); said.textContent = 'said'; said.style.color = 'rgb(200, 0, 200)'; }, 400),
  ];
};
/** Start the slider's CSS animation, on the wall. */
window.slide = () => document.body.classList.add('sliding');
</script></body></html>
```

## The test

The test runs the clock page in WebKitGTK composited and in headless Chromium
over CDP, the hold's engines (`x0k:implementation/ui-control/page-hold`, "The
engines"). A stepped run begins the clock, calls `go()`, and for each frame advances the clock to *n* × 1000 / fps, captures, and
hashes the capture's pixels. Then it ends the clock. Its claims:

1. **Rerun.** Two stepped runs at 30 fps for a second give equal hashes in
   every frame, and the end says a rerun would.
2. **Rate.** Frame *n* at 30 fps is the same image as frame 2*n* at 60 fps.
3. **Load.** A run while the test keeps every core busy gives the same
   hashes as one without.
4. **Motion.** The run moved: its first and last frames differ, and the
   transition, the text and the SVG each changed in it.
5. **Time.** While the clock steps, `performance.now()` and `Date.now()` read
   the screencast time.
6. **Timers wait.** A timer set before the begin waits for the screencast
   time, however long the wall waits, and fires in the step that passes it.
7. **End.** After the end, an animation that ran before the begin is where
   the wall clock puts it, within a frame, `performance.now()` follows the
   wall, a timer pending at the end fires on the wall, and the page's
   animation frames run again.

A frame's time is computed as *n* × 1000 / fps, so frame *n* at 30 fps and
frame 2*n* at 60 fps ask for the same floating-point time.

<a name="chunk-clock-test-run"></a><sub>`src/clock.ts` · `#clock-test-run`</sub>

```typescript {#clock-test-run}
const CLOCK = `globalThis.${PAGE_GLOBAL}.steppedClock`;
/** One stepped run of `count` frames at `fps`: each frame's hash, and how the end answered. */
async function steppedRun(engine: Engine, fps: number, count: number) {
  const started = performance.now();
  await engine.evaluate(`${CLOCK}.begin({ date: 0 }); window.go(); return '';`);
  const hashes: string[] = [];
  const steps: any[] = [];
  for (let n = 0; n < count; n++) {
    steps.push(JSON.parse(await engine.evaluate(`return JSON.stringify(await ${CLOCK}.advanceTo(${n} * 1000 / ${fps}));`)));
    hashes.push(pixelHash(await engine.capture()));
  }
  const ended = JSON.parse(await engine.evaluate(`return JSON.stringify(${CLOCK}.end());`));
  return { hashes, steps, ended, wallMs: performance.now() - started };
}
/** A hash of an image's pixels, row by row. */
function pixelHash(image: Image) {
  const hash = createHash('sha256');
  const row = Buffer.alloc(image.width * 3);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) row.set(image.rgb(x, y), x * 3);
    hash.update(row);
  }
  return hash.digest('hex').slice(0, 16);
}
/** The frames at which two runs' hashes differ. */
const differ = (a: string[], b: string[]) => a.map((h, i) => (h === b[i] ? -1 : i)).filter((i) => i >= 0);
```

The load is the test's own: one worker thread spinning per core, for as long
as the run lasts.

<a name="chunk-clock-test-load"></a><sub>`src/clock.ts` · `#clock-test-load`</sub>

```typescript {#clock-test-load}
/** Keep every core busy until the answer of `work` settles. */
async function underLoad<T>(work: () => Promise<T>): Promise<T> {
  const spin = 'const { workerData } = require("node:worker_threads"); const until = Date.now() + workerData; while (Date.now() < until) {}';
  const workers = Array.from({ length: availableParallelism() }, () => new Worker(spin, { eval: true, workerData: 120_000 }));
  try {
    return await work();
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
}
```

The claims, in one engine. The runs are made once, before the claims read
them.

<a name="chunk-clock-test-claims"></a><sub>`src/clock.ts` · `#clock-test-claims` · assembles [clock-test-time](#chunk-clock-test-time) · [clock-test-end](#chunk-clock-test-end)</sub>

```typescript {#clock-test-claims}
describe(`the clock page in ${name}`, () => {
  let engine: Engine;
  let first: Awaited<ReturnType<typeof steppedRun>>, second: typeof first, fast: typeof first, loaded: typeof first;
  before(async () => {
    engine = await start();
    await sleep(300);
    first = await steppedRun(engine, 30, FRAMES_AT_30);
    second = await steppedRun(engine, 30, FRAMES_AT_30);
    fast = await steppedRun(engine, 60, 2 * FRAMES_AT_30 - 1);
    loaded = await underLoad(() => steppedRun(engine, 30, FRAMES_AT_30));
  });
  after(async () => { await engine?.close(); });

  test('two stepped runs give the same frames, and the end says a rerun would', (t) => {
    t.diagnostic(`a second at 30 fps took ${first.wallMs.toFixed(0)} and ${second.wallMs.toFixed(0)} ms of the wall, ${loaded.wallMs.toFixed(0)} ms under load; at 60 fps ${fast.wallMs.toFixed(0)} ms`);
    assert.deepEqual(differ(first.hashes, second.hashes), [], `frames that differ, of ${first.hashes.length}`);
    assert.deepEqual([first.ended.sameOnRerun, first.ended.why], [true, []]);
  });
  test('frame n at 30 fps is frame 2n at 60 fps', () => {
    const doubled = first.hashes.map((_, n) => fast.hashes[2 * n]);
    assert.deepEqual(differ(first.hashes, doubled), [], 'frames n that differ');
  });
  test('a run under load gives the same frames', () => {
    assert.deepEqual(differ(first.hashes, loaded.hashes), [], 'frames that differ under load');
  });
  test('the run moved: the transition, the text and the SVG changed in it', () => {
    const changes = first.hashes.filter((h, i) => i > 0 && h !== first.hashes[i - 1]).length;
    assert.ok(changes >= FRAMES_AT_30 - 2, `${changes} frames changed of ${FRAMES_AT_30}`);
    assert.ok(first.steps.some((s) => s.timers > 0) && first.steps.every((s) => s.frames > 0 || s.time === 0), JSON.stringify(first.steps.slice(0, 3)));
    assert.ok(first.steps.at(-1).animations >= 3, `the clock holds ${first.steps.at(-1).animations} animations`);
  });
  <<clock-test-time>>
  <<clock-test-end>>
});
```

The time claims read the page's clocks in a run of their own. A timer the
page sets before the begin, 50 ms ahead, must not fire while the wall waits a
third of a second with no step, and must fire in the step to 100 ms.

<a name="chunk-clock-test-time"></a><sub>`src/clock.ts` · `#clock-test-time`</sub>

```typescript {#clock-test-time}
test('while the clock steps, performance.now and Date.now read the screencast time', async () => {
  const read = await engine.evaluate(`${CLOCK}.begin({ date: 1000 }); const p0 = performance.now();
    await ${CLOCK}.advanceTo(1000 / 3); const p1 = performance.now(), d1 = Date.now(), d2 = new Date().getTime();
    ${CLOCK}.end(); return JSON.stringify({ perf: p1 - p0, date: d1, made: d2, instance: new Date(5) instanceof Date });`);
  const { perf, ...rest } = JSON.parse(read);
  assert.ok(Math.abs(perf - 1000 / 3) < 1e-6, `performance.now moved ${perf} ms`);
  assert.deepEqual(rest, { date: 1333, made: 1333, instance: true });
});
test('a timer set before the begin waits for the screencast time', async () => {
  await engine.evaluate(`window.fired = []; setTimeout(() => window.fired.push(${CLOCK}.time()), 50); ${CLOCK}.begin(); return '';`);
  await sleep(300);
  const waited = await engine.evaluate('return JSON.stringify(window.fired);');
  const stepped = await engine.evaluate(`await ${CLOCK}.advanceTo(100); ${CLOCK}.end(); return JSON.stringify(window.fired);`);
  assert.deepEqual([JSON.parse(waited), JSON.parse(stepped).length], [[], 1]);
  assert.ok(JSON.parse(stepped)[0] <= 50, `fired at ${stepped}`);
});
```

The end's claims start the slider on the wall, let it run, read its time and
the page's clock, step a third of a second in ten frames, wait half a second
of the wall with no step, and end. The slider's drift is its time gained less
the wall's time passed, as the hold's claim 5 reads it: an end that gave the
slider no start time back would leave it behind by the run's wall time less
its screencast time, more than half a second. A read of an animation's time
is quantized to a frame, so one read of each side is off by up to a frame,
and the claim allows two. A timer set
in the run for a second ahead is pending at the end and fires on the wall.

<a name="chunk-clock-test-end"></a><sub>`src/clock.ts` · `#clock-test-end`</sub>

```typescript {#clock-test-end}
test('after the end, the wall resumes: an animation where the wall puts it, the wall\'s time, a pending timer and the frames', async () => {
  await engine.evaluate('window.slide(); return "";');
  await sleep(300);
  const clock = `const a = document.getAnimations().find((x) => x.animationName === 'spin' && x.effect.target.id === 'slider');
    return JSON.stringify({ time: Number(a.currentTime), at: performance.now(), painted: window.painted });`;
  const before = JSON.parse(await engine.evaluate(clock));
  await engine.evaluate(`${CLOCK}.begin(); window.late = false; setTimeout(() => { window.late = true; }, 1000); return '';`);
  for (let n = 1; n <= 10; n++) await engine.evaluate(`await ${CLOCK}.advanceTo(${n} * 1000 / 30); return '';`);
  await sleep(500);
  await engine.evaluate(`${CLOCK}.end(); return '';`);
  const ended = JSON.parse(await engine.evaluate(clock));
  const drift = (ended.time - before.time) - (ended.at - before.at);
  const wall0 = performance.now();
  const page0 = Number(await engine.evaluate('return String(performance.now());'));
  await sleep(1200);
  const page1 = Number(await engine.evaluate('return String(performance.now());'));
  const wall = performance.now() - wall0;
  const after = JSON.parse(await engine.evaluate(clock));
  assert.ok(Math.abs(drift) < 2 * FRAME_MS, `drift ${drift.toFixed(1)} ms`);
  assert.ok(Math.abs((page1 - page0) - wall) < WALL_SLACK_MS, `the page's clock moved ${(page1 - page0).toFixed(0)} ms in ${wall.toFixed(0)} ms of the wall`);
  assert.equal(await engine.evaluate('return String(window.late);'), 'true');
  assert.notEqual(after.painted, ended.painted, 'the animation frames did not run again');
});
```

The test file, its constants and its imports. `HOLD_ENGINES` narrows the run
to the engines whose names hold one of its words, as in the hold's tests.

<a name="chunk-clock-test-file"></a><sub>`tests/clock.test.ts` · `#clock-test-file` · assembles [clock-test-run](#chunk-clock-test-run) · [clock-test-load](#chunk-clock-test-load) · [clock-test-claims](#chunk-clock-test-claims)</sub>

```typescript {#clock-test-file file="tests/clock.test.ts"}
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { after, before, describe, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { PAGE_GLOBAL, pageScript } from '../src/page-script.ts';
import { chromium } from './hosts/chromium.ts';
import type { Engine, Image } from './hosts/engine.ts';
import { webkitgtk } from './hosts/webkitgtk.ts';

const PAGE = fileURLToPath(new URL('./clock-page.html', import.meta.url));
const SIZE = { width: 400, height: 260 };
/** A second at 30 fps, both ends included. */
const FRAMES_AT_30 = 31;
/** One rendering update at 60 Hz. */
const FRAME_MS = 1000 / 60;
/** How far the page's clock and the test's may part over a second of the wall, for the round trips between. */
const WALL_SLACK_MS = 150;

<<clock-test-run>>

<<clock-test-load>>

const ENGINES: [string, () => Promise<Engine>][] = [
  ['webkitgtk composited', () => webkitgtk(PAGE, pageScript(), { ...SIZE, compositing: true })],
  ['chromium at ratio 1', () => chromium(PAGE, pageScript(), { ...SIZE, ratio: 1 })],
];
/** HOLD_ENGINES narrows the run to the engines whose names hold one of its words. */
const only = process.env.HOLD_ENGINES?.split(',');

for (const [name, start] of ENGINES.filter(([name]) => !only || only.some((o) => name.includes(o)))) {
  <<clock-test-claims>>
}
```

## Running it

From the repository root, in the dev shell, with the package's dependencies
installed:

```
nix develop /home/lsp/src/l30/main -c env -u X0K_RUNTIME_DIR node --test substrate/apps/ui-control-page/tests/clock.test.ts
```

It needs what the hold's probe test needs: Node 24 or later, the dev shell's
Chromium, Xvfb and `x0k-webkitgtk-python`.

## What the test shows

Measured on arca with Chromium 148 and WebKitGTK 2.50.4, composited, with
arca loaded by other work. All 14 claims hold:

```
✔ the clock page in webkitgtk composited
✔ the clock page in chromium at ratio 1
ℹ pass 14
ℹ fail 0
```

A second at 30 fps, 31 frames, took 1.5 to 1.9 s of the wall in Chromium
and 1.0 to 1.9 s in WebKitGTK, and 2.6 to 3.8 s while the test kept every
core busy; 61 frames at 60 fps took 2.9 to 4.5 s. Every frame of the 30 fps
run but the first differs from the one before it, and the frames were the
same image in both runs, in the run under load, and at 60 fps at twice the
frame number. The library's whole suite, the answer, probe, walk and clock
tests in one run: 126 of 127 pass and one is skipped by name, the policy
claim in WebKitGTK (`x0k:implementation/ui-control/page-answer`).

Each mutation below was made in this chapter and tangled, and the test run
in both engines:

| The clock with | What goes red | Seen |
|---|---|---|
| `setTimeout` left unwrapped: the page's timers fire on the wall | the rerun and rate claims in both engines, the timer and motion claims | `frames that differ, of 31`: from frame 3 on in WebKitGTK, from frame 4 on in Chromium, as the page's timers fired on the wall |
| a host's tick of a fixed 16 ms per frame | the rate claim in both engines, and the time and timer claims; the rerun and load claims hold | `frames n that differ` from frame 1 on |
| the animation-frame callbacks given the wall's time | the rerun, rate and load claims in both engines | `frames that differ under load` from frame 0 on |
| an end that resumes each animation by `play()` | the end's claim alone, in both engines | `drift -476.7 ms` in WebKitGTK, `drift -498.2 ms` in Chromium |
| no watch on DOM mutations while stepping | the rerun, rate and load claims at frame 0, in Chromium, in 1 of 3 sessions | `frames that differ … [ 0 ]`: the first run's frame 0 lacks the spinner |

Before the clock caught an SVG ahead of `beginElement`, WebKitGTK's frames
all differed between two runs, and only in the SVG rectangle's edges: 64
pixels a frame, a few levels of antialiasing apart (`[255,116,116]` and
`[255,110,110]`). With the catch they are equal.

## What is open

- The ui/screencast wire, its endpoint and the driver's tools are other
  units: they read `begin`, `advanceTo` and `end` here, carry `Ended`'s reasons
  into the answer's `same frames on rerun`, and list `UNSTEPPED` in the offer.
- The Tauri plugin carries the clock in its page script, and its host's
  snapshot draws each frame (§5); no test of the plugin steps the clock yet.
- `invoke`, `present` and `release` answer at once while the clock steps
  (`x0k:implementation/ui-control/page-hold`, "When the page cannot paint"),
  so the frame they name is the epoch as it stands, not the frame the next
  step draws.
- A page whose frame callbacks count frames draws differently at each frame
  rate though the clock gives each frame its time: the rate claim holds for
  a page that draws from the time, as the clock page does.
- Same-origin frames, workers, media and the engine's own motion are named,
  not stepped. An SVG inside a shadow root is not found by the clock's catch.
- An animation the page itself pauses while the clock steps is seeked with
  the rest.
