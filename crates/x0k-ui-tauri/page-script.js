// Written by substrate/apps/ui-control-page/src/page-script.ts from the in-page library's sources; regenerate it, never edit it.
(() => {
  // substrate/apps/ui-control-page/src/observation.ts
  var CAPTURE_AND_LAYOUT = { parts: ["capture", "layout"] };
  var intersect = (a, b) => {
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
  };
  var same = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  function wholeCaptureOnly(call) {
    if (call.region) return "this host captures the whole page, not a region";
    if (call.scale !== void 0 && call.scale !== null && call.scale !== 1) return "this host captures at the page's own scale";
    return void 0;
  }
  function observation(held, call = CAPTURE_AND_LAYOUT) {
    const { viewport, ratio, root } = held.read.layout;
    const capture = held.capture;
    const scale = capture ? capture.width / viewport.width : ratio;
    const frame = { x: 0, y: 0, width: capture?.width ?? viewport.width * scale, height: capture?.height ?? viewport.height * scale };
    const scaled = (b) => ({ x: b.x * scale, y: b.y * scale, width: b.width * scale, height: b.height * scale });
    const node = ({ box, clipped, children, ...rest }) => {
      const bounds = intersect(scaled(clipped), frame);
      const laidOut = scaled(box);
      return { ...rest, bounds, laid_out: same(bounds, laidOut) ? void 0 : laidOut, visible: rest.visible && bounds.width > 0 && bounds.height > 0, children: children.map(node) };
    };
    const asked = (part) => call.parts.includes(part);
    const refused = [];
    if (asked("capture") && held.refused) refused.push(held.refused);
    if (asked("state") && !held.read.state) refused.push({ part: "state", why: "the page declares no state" });
    return {
      frame: held.frame,
      capture: asked("capture") && capture ? { png: [...capture.png], width: capture.width, height: capture.height, scale_factor: scale } : void 0,
      layout: asked("layout") ? node(root) : void 0,
      state: asked("state") ? held.read.state : void 0,
      refused,
      shown: held.read.shown ?? { kind: "live" }
    };
  }

  // substrate/apps/ui-control-page/src/answer.ts
  var UNDECLARED_EFFECT = "non_idempotent";
  var DECLINE = Symbol.for("x0k.ui-control.decline");
  var decline = (reason) => Object.assign(new Error(reason), { reason, [DECLINE]: true });
  var declined = (value) => typeof value === "object" && value !== null && value[DECLINE] === true;
  var frameOr = (unpainted, epoch) => unpainted ? { frame: null, unpainted } : { frame: String(epoch) };
  var kept = (name, spec, run) => ({
    offered: { name, description: spec.description ?? "", args: spec.args ?? { kind: "null" }, result: spec.result ?? { kind: "any" }, side_effect: spec.effect ?? UNDECLARED_EFFECT },
    run
  });
  var instanceId = () => `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  function installAnswers(win, hold2, walk2) {
    let declaration = { app: win.location.host || win.document.title || "page" };
    const actions = /* @__PURE__ */ new Map();
    const instance = instanceId();
    let standing = null;
    let ended = null;
    let presented = 0;
    const listeners = /* @__PURE__ */ new Set();
    const takesFixtures = () => typeof declaration.state?.present === "function" && typeof declaration.state?.release === "function";
    const readNow = (head) => {
      const state = declaration.state;
      return state && { shape: state.shape, value: state.read() ?? null, head: head ? state.head?.() : void 0 };
    };
    const liveNow = () => standing ? standing.live : readNow(true);
    const showingNow = () => readNow(!standing);
    const shownNow = () => standing ? { kind: "fixture", handle: standing.handle } : { kind: "live" };
    const fixture = () => standing?.handle ?? null;
    const stand = (next) => {
      const was = fixture();
      standing = next;
      if (fixture() === was) return;
      hold2.drawn.standing(fixture());
      for (const listener of [...listeners]) {
        try {
          listener(fixture());
        } catch (e) {
          win.setTimeout(() => {
            throw e;
          });
        }
      }
    };
    const declared = () => ({
      app: declaration.app,
      instance,
      actions: [...actions.values()].map(({ offered }) => offered),
      state: liveNow(),
      fixtures: takesFixtures()
    });
    const read = (call) => ({ layout: walk2.layout(), shown: shownNow(), state: call.parts.includes("state") ? showingNow() : void 0 });
    const rendered = () => hold2.rendered();
    const run = async (name, args) => {
      let outcome;
      try {
        const action = actions.get(name);
        if (!action) throw new Error(`the page declares no action ${name}`);
        outcome = { result: await action.run(args) ?? null };
      } catch (e) {
        outcome = { reason: e instanceof Error ? e.message : String(e) };
      }
      const frame = frameOr(await rendered(), hold2.epoch());
      return "result" in outcome ? { done: { result: outcome.result, ...frame } } : { failed: { reason: outcome.reason, ...frame } };
    };
    const cannotPaint = () => hold2.unpainted() ?? null;
    const declines = (call) => declaration.declines?.(call) ?? null;
    const present = async (state) => {
      if (!takesFixtures()) return { refused: { code: "no_fixtures", subject: "ui/history", why: "the page takes no state fixtures" } };
      const was = standing;
      const handle = `${instance}/fixture/${++presented}`;
      stand({ handle, live: was ? was.live : liveNow() });
      let answered;
      try {
        answered = await declaration.state.present(state);
      } catch (e) {
        answered = e;
        if (!declined(e)) {
          stand(was);
          throw e;
        }
      }
      if (declined(answered)) {
        stand(was);
        return { refused: { code: "declined", subject: "ui/history", why: answered.reason } };
      }
      hold2.changed();
      return { presented: { handle, ...frameOr(await rendered(), hold2.epoch()) } };
    };
    const release = async (handle) => {
      if (standing?.handle !== handle) return ended?.handle === handle ? { ended: { ...ended } } : { not_standing: { handle } };
      await declaration.state.release();
      stand(null);
      hold2.changed();
      return { released: frameOr(await rendered(), hold2.epoch()) };
    };
    const endFixture = async (reason) => {
      const handle = standing?.handle;
      if (handle === void 0) return;
      await declaration.state.release();
      if (standing?.handle !== handle) return;
      ended = { handle, reason };
      stand(null);
      hold2.changed();
      await rendered();
    };
    const fixtureEnded = (handle) => ended?.handle === handle ? ended.reason : null;
    const ui = {
      action(name, spec, run_) {
        actions.set(name, kept(name, spec, run_));
        hold2.changed();
        return ui;
      },
      changed: () => hold2.changed(),
      fixture,
      onFixture(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      decline,
      endFixture
    };
    return {
      install(given) {
        declaration = given;
        hold2.drawn.look(given.look ?? {});
        hold2.changed();
        return ui;
      },
      declared,
      read,
      run,
      present,
      release,
      fixture,
      cannotPaint,
      declines,
      fixtureEnded,
      observation,
      wholeCaptureOnly
    };
  }

  // substrate/apps/ui-control-page/src/clock.ts
  var PENDING_MS = 2e3;
  var STEP_LAPSE_MS = 1e4;
  var UNSTEPPED = [
    "media playback",
    "frames from other origins",
    "the clocks of same-origin frames",
    "canvas drawn from a worker",
    "timers in workers",
    "the caret's blink",
    "native smooth scrolling",
    "document.timeline.currentTime read by script",
    "event timestamps",
    "an idle callback's deadline"
  ];
  var MICROTASK_TURNS = 16;
  var MAX_TIMERS_PER_STEP = 1e4;
  var IDLE_PERIOD_MS = 50;
  function installClock(win) {
    const w = win;
    const nativeSetTimeout = win.setTimeout.bind(win);
    const nativeSetInterval = win.setInterval.bind(win);
    const nativeClearTimeout = win.clearTimeout.bind(win);
    const perf = win.performance;
    const nativeNow = perf.now.bind(perf);
    const NativeDate = win.Date;
    const nativeDateNow = NativeDate.now.bind(NativeDate);
    const native = { setTimeout: (cb, ms) => nativeSetTimeout(cb, ms), clearTimeout: (id) => nativeClearTimeout(id), now: nativeNow };
    let frames;
    let run = null;
    let floorNow = -Infinity, floorDate = -Infinity;
    const report = (e) => {
      nativeSetTimeout(() => {
        throw e;
      });
    };
    const turns = async () => {
      for (let i = 0; i < MICROTASK_TURNS; i++) await void 0;
    };
    const nowAt = () => run ? run.perf0 + run.t : Math.max(nativeNow(), floorNow);
    const dateAt = () => run ? Math.floor(run.date0 + run.t) : Math.max(nativeDateNow(), floorDate);
    Object.defineProperty(perf, "now", { value: function now() {
      return nowAt();
    }, configurable: true, writable: true });
    function SteppedDate(...args) {
      if (!new.target) return new NativeDate(dateAt()).toString();
      return Reflect.construct(NativeDate, args.length === 0 ? [dateAt()] : args, new.target);
    }
    SteppedDate.prototype = NativeDate.prototype;
    Object.setPrototypeOf(SteppedDate, NativeDate);
    Object.defineProperty(SteppedDate, "name", { value: "Date" });
    SteppedDate.now = () => dateAt();
    Object.defineProperty(win, "Date", { value: SteppedDate, configurable: true, writable: true });
    const timers = /* @__PURE__ */ new Map();
    let seq = 0, lastVirtual = 1 << 30;
    let running;
    const armNative = (timer, delay) => {
      timer.due = nativeNow() + delay;
      if (timer.every === void 0) return nativeSetTimeout(() => {
        timers.delete(timer.id);
        timer.handler.apply(win, timer.args);
      }, delay);
      if (delay === timer.every) return nativeSetInterval(() => {
        timer.due = nativeNow() + timer.every;
        timer.handler.apply(win, timer.args);
      }, timer.every);
      return nativeSetTimeout(() => {
        timer.native = armNative(timer, timer.every);
        timer.handler.apply(win, timer.args);
      }, delay);
    };
    const nested = (nesting, delay) => nesting > 4 ? Math.max(delay, 4) : delay;
    const add = (handler, ms, args, every) => {
      if (typeof handler !== "function") return (every ? nativeSetInterval : nativeSetTimeout)(handler, ms, ...args);
      const delay = Math.max(0, Number(ms) || 0);
      const timer = { id: 0, handler, args, due: 0, every: every ? delay : void 0, nesting: running ? running.nesting + 1 : 0, seq: ++seq };
      if (run) {
        timer.id = ++lastVirtual;
        timer.due = run.t + nested(timer.nesting, delay);
      } else {
        timer.id = timer.native = armNative(timer, delay);
      }
      timers.set(timer.id, timer);
      return timer.id;
    };
    win.setTimeout = ((handler, ms, ...args) => add(handler, ms, args, false));
    win.setInterval = ((handler, ms, ...args) => add(handler, ms, args, true));
    win.clearTimeout = win.clearInterval = ((id) => {
      const timer = id === void 0 ? void 0 : timers.get(id);
      if (!timer) return nativeClearTimeout(id);
      timers.delete(timer.id);
      if (timer.native !== void 0) nativeClearTimeout(timer.native);
    });
    const nativeIdle = w.requestIdleCallback?.bind(win), nativeCancelIdle = w.cancelIdleCallback?.bind(win);
    if (nativeIdle) {
      w.requestIdleCallback = (cb, options) => {
        if (!run) return nativeIdle(cb, options);
        return add(() => {
          const started = nativeNow();
          cb({ didTimeout: false, timeRemaining: () => Math.max(0, IDLE_PERIOD_MS - (nativeNow() - started)) });
        }, 0, [], false);
      };
      w.cancelIdleCallback = (id) => timers.has(id) ? win.clearTimeout(id) : nativeCancelIdle(id);
    }
    const nextDue = (target) => {
      let first;
      for (const timer of timers.values()) {
        if (timer.native !== void 0 || timer.due > target) continue;
        if (!first || timer.due < first.due || timer.due === first.due && timer.seq < first.seq) first = timer;
      }
      return first;
    };
    const fire = (timer, at) => {
      if (timer.every === void 0) timers.delete(timer.id);
      else {
        timer.nesting += 1;
        timer.due = at + nested(timer.nesting, timer.every);
        timer.seq = ++seq;
      }
      try {
        timer.handler.apply(win, timer.args);
      } catch (e) {
        report(e);
      }
    };
    const pending = /* @__PURE__ */ new Map();
    const gaveUp = /* @__PURE__ */ new Set();
    const counted = (what, work) => {
      if (!run) return;
      pending.set(work, what);
      const done = () => {
        pending.delete(work);
        gaveUp.delete(work);
      };
      work.then(done, done);
    };
    const nativeFetch = win.fetch?.bind(win);
    if (nativeFetch) {
      win.fetch = ((input, init) => {
        const answer = nativeFetch(input, init);
        counted(`fetch ${input instanceof win.Request ? input.url : String(input)}`, answer);
        return answer;
      });
    }
    for (const method of ["arrayBuffer", "blob", "formData", "json", "text"]) {
      const read = win.Response?.prototype[method];
      if (!read) continue;
      win.Response.prototype[method] = function() {
        const body = read.call(this);
        counted(`the body of ${this.url}`, body);
        return body;
      };
    }
    const send = win.XMLHttpRequest?.prototype.send;
    if (send) {
      win.XMLHttpRequest.prototype.send = function(body) {
        if (run) counted("an XMLHttpRequest", new Promise((done) => this.addEventListener("loadend", done, { once: true })));
        return send.call(this, body);
      };
    }
    const HOST_CHANNEL = "plugin:x0k-ui-tauri|";
    const COUNTING = Symbol.for("x0k.ui-control.clock.ipc");
    const countIpc = () => {
      const internals = w.__TAURI_INTERNALS__;
      const invoke = internals?.invoke;
      if (typeof invoke !== "function" || invoke[COUNTING]) return;
      const counting = (cmd, ...rest) => {
        const answer = invoke.call(internals, cmd, ...rest);
        if (!(typeof cmd === "string" && cmd.startsWith(HOST_CHANNEL))) counted(`ipc ${String(cmd)}`, Promise.resolve(answer));
        return answer;
      };
      counting[COUNTING] = true;
      try {
        internals.invoke = counting;
      } catch {
      }
    };
    const quiet = async (until, over) => {
      for (; ; ) {
        const waiting = [...pending.keys()].filter((work) => !gaveUp.has(work));
        if (waiting.length === 0 || !run) return;
        const left = until - nativeNow();
        const timedOut = left <= 0 || await new Promise((done) => {
          const timer = nativeSetTimeout(() => done(true), left);
          Promise.allSettled(waiting).then(() => {
            nativeClearTimeout(timer);
            done(false);
          });
        });
        if (timedOut) {
          for (const work of waiting) {
            const what = pending.get(work);
            if (what === void 0) continue;
            gaveUp.add(work);
            over.push(what);
            run.why.add(`pending work reached its bound: ${what}`);
          }
          return;
        }
        await turns();
      }
    };
    const kept2 = /* @__PURE__ */ new Map();
    let fresh = [];
    const keep = (animation, at) => {
      animation.pause();
      kept2.set(animation, at);
      fresh.push(animation.ready.catch(() => void 0));
    };
    const onDocument = (animation) => animation.timeline === win.document.timeline;
    const isCss = (animation) => w.CSSAnimation && animation instanceof w.CSSAnimation || w.CSSTransition && animation instanceof w.CSSTransition;
    const catchAnimations = () => {
      if (!run) return;
      for (const animation of win.document.getAnimations()) {
        if (!onDocument(animation) || animation.playState !== "running") continue;
        const offset = kept2.has(animation) || !isCss(animation) ? Number(animation.currentTime ?? 0) : 0;
        keep(animation, { offset, base: run.t, rate: animation.playbackRate });
      }
    };
    const created = (animation) => {
      if (run && onDocument(animation)) keep(animation, { offset: Number(animation.currentTime ?? 0), base: run.t, rate: animation.playbackRate });
    };
    for (const type of ["transitionrun", "animationstart"]) win.addEventListener(type, catchAnimations, { capture: true, passive: true });
    const mutations = new win.MutationObserver(() => catchAnimations());
    const keepRunning = (r) => {
      let running2 = 0;
      for (const animation of win.document.getAnimations()) {
        if (!onDocument(animation) || animation.playState !== "running") continue;
        const rate = animation.playbackRate;
        const offset = animation.startTime === null ? Number(animation.currentTime ?? 0) : (r.timeline0 - Number(animation.startTime)) * rate;
        keep(animation, { offset, base: 0, rate });
        running2 += 1;
      }
      if (running2 > 0) r.why.add(`${running2} animations ran when the clock began, where the wall had put them`);
    };
    const seekAnimations = (t) => {
      for (const [animation, at] of kept2) {
        if (animation.playState === "idle") kept2.delete(animation);
        else if (animation.playState === "paused") animation.currentTime = at.offset + (t - at.base) * at.rate;
      }
    };
    const giveAnimations = (r) => {
      for (const [animation, at] of kept2) {
        if (animation.playState !== "paused") continue;
        if (at.rate === 0) animation.play();
        else animation.startTime = r.timeline0 + at.base - at.offset / at.rate;
      }
      kept2.clear();
      fresh = [];
    };
    const svgs = /* @__PURE__ */ new Map();
    const catchSvg = (svg, atBegin) => {
      if (!run || svg.ownerSVGElement || svgs.has(svg) || typeof svg.pauseAnimations !== "function" || svg.animationsPaused()) return;
      svg.pauseAnimations();
      if (!atBegin) svg.setCurrentTime(0);
      svgs.set(svg, { from: atBegin ? svg.getCurrentTime() : 0, at: run.t });
    };
    const catchSvgs = (atBegin = false) => {
      for (const svg of win.document.querySelectorAll("svg")) catchSvg(svg, atBegin);
    };
    const svgAnimation = w.SVGAnimationElement?.prototype;
    for (const name of ["beginElement", "beginElementAt"]) {
      const begin = svgAnimation?.[name];
      if (!begin) continue;
      svgAnimation[name] = function(...args) {
        let outer = this.ownerSVGElement;
        while (outer?.ownerSVGElement) outer = outer.ownerSVGElement;
        if (outer) catchSvg(outer, false);
        return begin.apply(this, args);
      };
    }
    const seekSvgs = (t) => {
      for (const [svg, { from, at }] of svgs) {
        if (svg.isConnected) svg.setCurrentTime(from + (t - at) / 1e3);
        else svgs.delete(svg);
      }
    };
    const giveSvgs = (r) => {
      for (const [svg, { from, at }] of svgs) {
        svg.setCurrentTime(from + (nativeNow() - r.perf0 - at) / 1e3);
        svg.unpauseAnimations();
      }
      svgs.clear();
    };
    let workerCanvases = 0;
    const transfer = w.HTMLCanvasElement?.prototype.transferControlToOffscreen;
    if (transfer) {
      w.HTMLCanvasElement.prototype.transferControlToOffscreen = function() {
        workerCanvases += 1;
        return transfer.call(this);
      };
    }
    const unsteppedNow = () => {
      const doc = win.document;
      const found = [];
      const playing = [...doc.querySelectorAll("video, audio")].filter((media) => !media.paused).length;
      if (playing) found.push(`media playback: ${playing} playing`);
      let other = 0, same2 = 0;
      for (const frame of doc.querySelectorAll("iframe, frame")) {
        let inner = null;
        try {
          inner = frame.contentDocument;
        } catch {
          inner = null;
        }
        if (inner) same2 += 1;
        else other += 1;
      }
      if (other) found.push(`frames from other origins: ${other}`);
      if (same2) found.push(`the clocks of same-origin frames: ${same2}`);
      if (workerCanvases) found.push(`canvas drawn from a worker: ${workerCanvases} handed over`);
      return found;
    };
    let busy = false;
    let lapse;
    let lapsed;
    const relapse = () => {
      nativeClearTimeout(lapse);
      lapse = nativeSetTimeout(() => {
        if (!run || busy) return;
        stepped.end();
        lapsed = `the stepped clock ended itself after ${STEP_LAPSE_MS} ms with no step`;
      }, STEP_LAPSE_MS);
    };
    const caught = () => {
      catchAnimations();
      catchSvgs();
    };
    const stepped = {
      begin(options = {}) {
        if (!frames) throw new Error("the stepped clock has no hold");
        if (run) throw new Error("the stepped clock already steps");
        if (frames.held()) throw new Error("the page is held: verify the hold before the clock begins");
        const perf0 = nativeNow();
        const r = {
          t: 0,
          perf0,
          date0: options.date ?? nativeDateNow(),
          dateNamed: options.date !== void 0,
          timeline0: Number(win.document.timeline.currentTime ?? perf0),
          pendingMs: options.pendingMs ?? PENDING_MS,
          why: /* @__PURE__ */ new Set()
        };
        run = r;
        lapsed = void 0;
        for (const timer of timers.values()) {
          if (timer.native === void 0) continue;
          nativeClearTimeout(timer.native);
          timer.native = void 0;
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
        if (!r || !frames) throw new Error(lapsed ?? "the stepped clock does not step: begin it first");
        if (busy) throw new Error("a step is already running");
        if (!Number.isFinite(ms) || ms < r.t) throw new Error(`a step goes forward: the clock is at ${r.t} ms, and the step asked for ${ms} ms`);
        busy = true;
        nativeClearTimeout(lapse);
        try {
          const until = nativeNow() + r.pendingMs;
          const over = [];
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
            running = void 0;
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
          const step = { time: ms, epoch: frames.epoch(), timers: fired, frames: ran, animations: kept2.size, unstepped: found };
          if (over.length) step.overBound = over;
          if (unpainted) step.unpainted = unpainted;
          return step;
        } finally {
          running = void 0;
          busy = false;
          if (run === r) relapse();
        }
      },
      end() {
        const r = run;
        if (!r) return { time: 0, sameOnRerun: false, why: [lapsed ?? "the stepped clock did not step"] };
        run = null;
        mutations.disconnect();
        nativeClearTimeout(lapse);
        floorNow = r.perf0 + r.t;
        floorDate = r.dateNamed ? -Infinity : r.date0 + r.t;
        giveAnimations(r);
        giveSvgs(r);
        for (const timer of timers.values()) {
          if (timer.native === void 0) timer.native = armNative(timer, Math.max(0, r.perf0 + timer.due - nativeNow()));
        }
        frames?.give();
        pending.clear();
        gaveUp.clear();
        return { time: r.t, sameOnRerun: r.why.size === 0, why: [...r.why] };
      },
      time: () => run?.t ?? null,
      unstepped: () => [...UNSTEPPED]
    };
    return { native, stepped, stepping: () => run !== null, created, bind: (given) => {
      frames = given;
    } };
  }

  // substrate/apps/ui-control-page/src/drawn-layer.ts
  var PALETTE = ["#7c3aed", "#0891b2", "#d97706", "#db2777"];
  var FIXTURE_INK = "#f59e0b";
  var FIXTURE_BAND = 6;
  var FIXTURE_NOTICE = "A fixture, not the live state";
  var LOOK = `
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
  .fixture-notice { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); }
`;
  var LABEL_ROOM = 160;
  var ARROW = "0,0 0,17 4.5,13 8,20 11,19 7.5,12 13,12";
  var SVG = "http://www.w3.org/2000/svg";
  var PLACED = [
    ["display", "block"],
    ["position", "fixed"],
    ["inset", "0"],
    ["width", "100vw"],
    ["height", "100vh"],
    ["margin", "0"],
    ["padding", "0"],
    ["border", "0"],
    ["background", "transparent"],
    ["pointer-events", "none"],
    ["overflow", "visible"],
    ["z-index", "2147483647"],
    ["contain", "strict"]
  ];
  function makeLayer(win) {
    const doc = win.document;
    const host = doc.createElement("x0k-drawn-input");
    for (const [name, value] of PLACED) host.style.setProperty(name, value, "important");
    host.setAttribute("aria-hidden", "true");
    host.inert = true;
    const root = host.attachShadow({ mode: "closed" });
    const look = new win.CSSStyleSheet();
    look.replaceSync(LOOK);
    root.adoptedStyleSheets = [look];
    const drawn = doc.createElement("div");
    drawn.className = "drawn";
    root.append(drawn);
    host.setAttribute("popover", "manual");
    const raise = () => {
      if (typeof host.showPopover !== "function") return;
      try {
        if (host.matches(":popover-open")) host.hidePopover();
        host.showPopover();
      } catch {
      }
    };
    const attach = () => {
      if (!host.isConnected && doc.documentElement) {
        doc.documentElement.append(host);
        raise();
      }
      return host.isConnected;
    };
    if (!attach()) {
      const rooted = new win.MutationObserver(() => {
        if (attach()) rooted.disconnect();
      });
      rooted.observe(doc, { childList: true });
    }
    let declared = {};
    const at = (x, y, k) => ({ left: `${x * k}px`, top: `${y * k}px` });
    const ink = (el, hue = 0) => {
      const palette = declared.colors?.length ? declared.colors : PALETTE;
      el.style.setProperty("--ink", palette[hue % palette.length]);
    };
    const named = (requester, given) => {
      const names = declared.names ?? {};
      if (requester in names) return names[requester];
      const prefixes = Object.keys(names).filter((key) => key.endsWith("*") && requester.startsWith(key.slice(0, -1)));
      const longest = prefixes.sort((a, b) => b.length - a.length)[0];
      return longest ? names[longest] : given || requester;
    };
    const beside = (label, x, y, down) => {
      const right = x > win.innerWidth - LABEL_ROOM;
      Object.assign(label.style, right ? { right: `${win.innerWidth - x + 4}px` } : { left: `${x + 16}px` }, { top: `${y + down}px` });
    };
    const boxed = (kind, [left, top, width, height], k, text) => {
      const el = doc.createElement("div");
      el.className = kind;
      Object.assign(el.style, { left: `${left * k}px`, top: `${top * k}px`, width: `${width * k}px`, height: `${height * k}px` });
      if (text) el.textContent = text;
      return el;
    };
    const takeover = (held, k, size) => {
      const name = named(held.requester, held.name);
      if (!held.asked) {
        const band = doc.createElement("div");
        band.className = "band";
        const notice = doc.createElement("div");
        notice.className = "label notice";
        notice.textContent = `${name} has taken over \xB7 Esc to end`;
        notice.style.fontSize = `${size}px`;
        for (const el of [band, notice]) ink(el, held.hue);
        return [band, notice];
      }
      if (!held.card || !held.allow || !held.refuse) return [];
      const dim = doc.createElement("div");
      dim.className = "dim";
      const card = boxed("card", held.card, k);
      card.style.fontSize = `${size}px`;
      for (const line of [`${name} asks to take over this window's input`, "Your clicks and keys wait until its sequence ends."]) {
        const p = doc.createElement("p");
        p.textContent = line;
        card.append(p);
      }
      const allow = boxed("button allow", held.allow, k, "Allow");
      const refuse = boxed("button refuse", held.refuse, k, "Refuse (Esc)");
      for (const el of [card, allow, refuse]) {
        ink(el, held.hue);
        el.style.fontSize = `${size}px`;
      }
      return [dim, card, allow, refuse];
    };
    const fixtureMark = (band, size) => {
      const edge = doc.createElement("div");
      edge.className = "fixture";
      edge.style.borderWidth = `${band}px`;
      const notice = doc.createElement("div");
      notice.className = "label fixture-notice";
      notice.textContent = FIXTURE_NOTICE;
      notice.style.fontSize = `${size}px`;
      for (const el of [edge, notice]) el.style.setProperty("--ink", FIXTURE_INK);
      return [edge, notice];
    };
    let stands = null;
    let last = null;
    const layer = {
      paint(drawing) {
        last = drawing;
        if (!attach()) return;
        raise();
        const k = win.innerWidth / (drawing.units || win.innerWidth);
        const [ringAt, captions, size] = [declared.ring ?? 8, declared.captions ?? true, declared.label_size ?? 12];
        const parts = [];
        if (drawing.fixture && drawing.fixture === stands) parts.push(...fixtureMark(FIXTURE_BAND * k, size));
        for (const click of drawing.clicks) {
          const ring = doc.createElement("div");
          const across = (2 * ringAt + 28 * click.gone) * k;
          ring.className = "ring";
          ink(ring, click.hue);
          Object.assign(ring.style, at(click.at[0], click.at[1], k), {
            width: `${across}px`,
            height: `${across}px`,
            marginLeft: `${-across / 2}px`,
            marginTop: `${-across / 2}px`,
            opacity: String(1 - click.gone)
          });
          parts.push(ring);
        }
        for (const pointer of drawing.pointers) {
          let mark;
          if (declared.pointer === "dot") {
            mark = doc.createElement("div");
            mark.className = pointer.pressed ? "dot pressed" : "dot";
          } else {
            mark = doc.createElementNS(SVG, "svg");
            mark.setAttribute("class", pointer.pressed ? "pointer pressed" : "pointer");
            mark.setAttribute("viewBox", "0 0 13 20");
            const polygon = doc.createElementNS(SVG, "polygon");
            polygon.setAttribute("points", ARROW);
            mark.append(polygon);
          }
          Object.assign(mark.style, at(pointer.at[0], pointer.at[1], k));
          ink(mark, pointer.hue);
          const name = doc.createElement("div");
          name.className = "label";
          name.textContent = named(pointer.requester, pointer.name);
          name.style.fontSize = `${size}px`;
          ink(name, pointer.hue);
          beside(name, pointer.at[0] * k, pointer.at[1] * k, 18);
          parts.push(mark, name);
          if (captions && drawing.keys && drawing.keys.requester === pointer.requester) {
            const keys = doc.createElement("div");
            keys.className = "label";
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
        drawn.style.display = hidden ? "none" : "";
      },
      look(look2) {
        declared = look2;
      },
      standing(handle) {
        if (stands === handle) return;
        stands = handle;
        if (last?.fixture) layer.paint(last);
      }
    };
    return layer;
  }

  // substrate/apps/ui-control-page/src/hold.ts
  var SETTLE_UPDATES = 2;
  var HOLD_LAPSE_MS = 1e3;
  var FRAME_WAIT_MS = 1e3;
  var SETTLE_MS = 1e3;
  var INSTALLED = Symbol.for("x0k.ui-control.hold");
  var INPUT_EVENTS = ["pointerdown", "pointerup", "pointermove", "wheel", "keydown", "keyup", "input", "compositionend", "focusin", "focusout"];
  var ANIMATION_EVENTS = ["animationstart", "animationend", "animationcancel", "transitionstart", "transitionend", "transitioncancel"];
  function installHold(win = window) {
    const existing = win[INSTALLED];
    if (existing) return existing;
    const doc = win.document;
    const clock = installClock(win);
    const native = clock.native;
    const nativeRaf = win.requestAnimationFrame.bind(win);
    const nativeCancel = win.cancelAnimationFrame.bind(win);
    let epoch = 0;
    const bump = () => {
      epoch += 1;
    };
    const layer = makeLayer(win);
    const observer = new MutationObserver(bump);
    const watch = (root) => observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    watch(doc);
    const shadows = /* @__PURE__ */ new WeakMap();
    const attachShadow = win.Element.prototype.attachShadow;
    win.Element.prototype.attachShadow = function(init) {
      const root = attachShadow.call(this, init);
      shadows.set(this, root);
      watch(root);
      return root;
    };
    const frames = /* @__PURE__ */ new WeakSet();
    const onFrameLoad = (e) => {
      const frame = e.target;
      if (frame.localName !== "iframe" && frame.localName !== "frame") return;
      let inner = null;
      try {
        inner = frame.contentDocument;
      } catch {
        inner = null;
      }
      if (inner && !frames.has(inner)) {
        frames.add(inner);
        watch(inner);
        inner.defaultView?.addEventListener("scroll", bump, { capture: true, passive: true });
        inner.addEventListener("load", onFrameLoad, { capture: true });
      }
      bump();
    };
    doc.addEventListener("load", onFrameLoad, { capture: true });
    const epochNow = () => {
      if (observer.takeRecords().length > 0) bump();
      return epoch;
    };
    win.addEventListener("scroll", bump, { capture: true, passive: true });
    win.addEventListener("resize", bump, { passive: true });
    win.visualViewport?.addEventListener("resize", bump, { passive: true });
    win.visualViewport?.addEventListener("scroll", bump, { passive: true });
    for (const type of INPUT_EVENTS) win.addEventListener(type, (e) => {
      if (e.isTrusted) bump();
    }, { capture: true, passive: true });
    for (const type of ANIMATION_EVENTS) win.addEventListener(type, bump, { capture: true, passive: true });
    const animate = win.Element.prototype.animate;
    win.Element.prototype.animate = function(...args) {
      const animation = animate.apply(this, args);
      bump();
      clock.created(animation);
      animation.addEventListener("finish", bump);
      animation.addEventListener("cancel", bump);
      return animation;
    };
    let held = false;
    let lastId = 0;
    const waiting = /* @__PURE__ */ new Map();
    const stepped = /* @__PURE__ */ new Map();
    const scheduled = /* @__PURE__ */ new Map();
    const schedule = (id, cb) => {
      scheduled.set(id, { native: nativeRaf((t) => {
        scheduled.delete(id);
        cb(t);
      }), cb });
    };
    win.requestAnimationFrame = (cb) => {
      const id = ++lastId;
      if (clock.stepping()) stepped.set(id, cb);
      else if (held) waiting.set(id, cb);
      else schedule(id, cb);
      return id;
    };
    win.cancelAnimationFrame = (id) => {
      waiting.delete(id);
      stepped.delete(id);
      const pending = scheduled.get(id);
      if (pending !== void 0) {
        nativeCancel(pending.native);
        scheduled.delete(id);
      }
    };
    const updates = (n) => new Promise((done) => {
      const step = (left) => left === 0 ? done() : nativeRaf(() => step(left - 1));
      step(n);
    });
    const HIDDEN = "the page is hidden: document.visibilityState is hidden, as for a minimised, unmapped or covered window";
    const hiddenNow = () => doc.visibilityState === "hidden" ? HIDDEN : void 0;
    let stalledAt;
    const stalled = () => {
      stalledAt ??= native.now() - FRAME_WAIT_MS;
      nativeRaf(() => {
        stalledAt = void 0;
      });
    };
    const unpainted = () => hiddenNow() ?? (stalledAt === void 0 ? void 0 : `no rendering update has come for ${Math.round(native.now() - stalledAt)} ms`);
    const whilePainting = (wait) => new Promise((done) => {
      const now = unpainted();
      if (now) return done(now);
      let finished = false;
      const finish = (why) => {
        if (finished) return;
        finished = true;
        native.clearTimeout(timer);
        doc.removeEventListener("visibilitychange", onVisibility);
        done(why);
      };
      const onVisibility = () => {
        const why = hiddenNow();
        if (why) finish(why);
      };
      doc.addEventListener("visibilitychange", onVisibility);
      const timer = native.setTimeout(() => {
        stalled();
        finish(unpainted());
      }, FRAME_WAIT_MS);
      wait.then(() => finish(), () => finish());
    });
    const rendered = () => clock.stepping() ? Promise.resolve(unpainted()) : whilePainting(new Promise((done) => win.requestAnimationFrame(() => done())));
    const SETTLE_EVENTS = ["pointermove", "pointerdown", "pointerup", "mousemove", "mousedown", "mouseup", "click", "keydown", "keyup", "input", "wheel"];
    const settled = async () => {
      let quiet = 0;
      const heard = () => {
        quiet = 0;
      };
      for (const kind of SETTLE_EVENTS) win.addEventListener(kind, heard, { capture: true, passive: true });
      try {
        const until = native.now() + SETTLE_MS;
        do {
          const why = await rendered();
          if (why) return why;
          quiet += 1;
        } while (quiet <= 2 && native.now() < until);
        return void 0;
      } finally {
        for (const kind of SETTLE_EVENTS) win.removeEventListener(kind, heard, { capture: true });
      }
    };
    let paused = [];
    let hidDrawn = false;
    let unheld;
    let lapse;
    const release = () => {
      if (!held) return;
      held = false;
      if (hidDrawn) {
        layer.hide(false);
        hidDrawn = false;
      }
      native.clearTimeout(lapse);
      for (const { animation, startTime } of paused) {
        if (animation.playState !== "paused") continue;
        if (startTime === null) animation.play();
        else animation.startTime = startTime;
      }
      paused = [];
      for (const [id, cb] of waiting) schedule(id, cb);
      waiting.clear();
    };
    const hold2 = async (read, options = {}) => {
      const start = native.now();
      if (!held) {
        held = true;
        lapse = native.setTimeout(() => {
          release();
          bump();
        }, HOLD_LAPSE_MS);
        paused = doc.getAnimations().filter((a) => a.playState === "running").map((animation) => ({ animation, startTime: animation.startTime }));
        for (const { animation } of paused) animation.pause();
        if (paused.length > 0) unheld = await whilePainting(Promise.all(paused.map(({ animation }) => animation.ready)));
      }
      if (options.frameOnly && !hidDrawn) {
        layer.hide(true);
        hidDrawn = true;
      }
      const why = unheld ?? await whilePainting(updates(SETTLE_UPDATES));
      unheld = void 0;
      const epoch2 = epochNow();
      const answered = { epoch: epoch2, read: read(), holdMs: native.now() - start };
      return why ? { ...answered, unpainted: why } : answered;
    };
    const verify = () => {
      const epoch2 = epochNow();
      release();
      return epoch2;
    };
    clock.bind({
      take() {
        for (const [id, { native: frame, cb }] of scheduled) {
          nativeCancel(frame);
          stepped.set(id, cb);
        }
        scheduled.clear();
        for (const [id, cb] of waiting) stepped.set(id, cb);
        waiting.clear();
      },
      run(timestamp) {
        const due = [...stepped.values()];
        stepped.clear();
        for (const cb of due) {
          try {
            cb(timestamp);
          } catch (e) {
            native.setTimeout(() => {
              throw e;
            });
          }
        }
        return due.length;
      },
      give() {
        for (const [id, cb] of stepped) schedule(id, cb);
        stepped.clear();
      },
      settle: (ready) => whilePainting(Promise.allSettled(ready).then(() => updates(SETTLE_UPDATES))),
      epoch: epochNow,
      held: () => held
    });
    const api = { epoch: epochNow, changed: bump, hold: hold2, verify, held: () => held, unpainted, rendered, settled, shadowRoot: (element) => shadows.get(element) ?? null, drawn: layer, steppedClock: clock.stepped };
    win[INSTALLED] = api;
    return api;
  }

  // substrate/apps/ui-control-page/src/page-globals.ts
  var PAGE_GLOBAL = "__x0kUiHold";
  var WALK_GLOBAL = "__x0kUiWalk";
  var UI_GLOBAL = "__x0kUi";

  // substrate/apps/ui-control-page/node_modules/dom-accessibility-api/dist/polyfills/array.from.mjs
  var toStr = Object.prototype.toString;
  function isCallable(fn) {
    return typeof fn === "function" || toStr.call(fn) === "[object Function]";
  }
  function toInteger(value) {
    var number = Number(value);
    if (isNaN(number)) {
      return 0;
    }
    if (number === 0 || !isFinite(number)) {
      return number;
    }
    return (number > 0 ? 1 : -1) * Math.floor(Math.abs(number));
  }
  var maxSafeInteger = Math.pow(2, 53) - 1;
  function toLength(value) {
    var len = toInteger(value);
    return Math.min(Math.max(len, 0), maxSafeInteger);
  }
  function arrayFrom(arrayLike, mapFn) {
    var C = Array;
    var items = Object(arrayLike);
    if (arrayLike == null) {
      throw new TypeError("Array.from requires an array-like object - not null or undefined");
    }
    if (typeof mapFn !== "undefined") {
      if (!isCallable(mapFn)) {
        throw new TypeError("Array.from: when provided, the second argument must be a function");
      }
    }
    var len = toLength(items.length);
    var A = isCallable(C) ? Object(new C(len)) : new Array(len);
    var k = 0;
    var kValue;
    while (k < len) {
      kValue = items[k];
      if (mapFn) {
        A[k] = mapFn(kValue, k);
      } else {
        A[k] = kValue;
      }
      k += 1;
    }
    A.length = len;
    return A;
  }

  // substrate/apps/ui-control-page/node_modules/dom-accessibility-api/dist/polyfills/SetLike.mjs
  function _typeof(o) {
    "@babel/helpers - typeof";
    return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o2) {
      return typeof o2;
    } : function(o2) {
      return o2 && "function" == typeof Symbol && o2.constructor === Symbol && o2 !== Symbol.prototype ? "symbol" : typeof o2;
    }, _typeof(o);
  }
  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }
  function _defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor);
    }
  }
  function _createClass(Constructor, protoProps, staticProps) {
    if (protoProps) _defineProperties(Constructor.prototype, protoProps);
    if (staticProps) _defineProperties(Constructor, staticProps);
    Object.defineProperty(Constructor, "prototype", { writable: false });
    return Constructor;
  }
  function _defineProperty(obj, key, value) {
    key = _toPropertyKey(key);
    if (key in obj) {
      Object.defineProperty(obj, key, { value, enumerable: true, configurable: true, writable: true });
    } else {
      obj[key] = value;
    }
    return obj;
  }
  function _toPropertyKey(t) {
    var i = _toPrimitive(t, "string");
    return "symbol" == _typeof(i) ? i : i + "";
  }
  function _toPrimitive(t, r) {
    if ("object" != _typeof(t) || !t) return t;
    var e = t[Symbol.toPrimitive];
    if (void 0 !== e) {
      var i = e.call(t, r || "default");
      if ("object" != _typeof(i)) return i;
      throw new TypeError("@@toPrimitive must return a primitive value.");
    }
    return ("string" === r ? String : Number)(t);
  }
  var SetLike = /* @__PURE__ */ (function() {
    function SetLike2() {
      var items = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : [];
      _classCallCheck(this, SetLike2);
      _defineProperty(this, "items", void 0);
      this.items = items;
    }
    return _createClass(SetLike2, [{
      key: "add",
      value: function add(value) {
        if (this.has(value) === false) {
          this.items.push(value);
        }
        return this;
      }
    }, {
      key: "clear",
      value: function clear() {
        this.items = [];
      }
    }, {
      key: "delete",
      value: function _delete(value) {
        var previousLength = this.items.length;
        this.items = this.items.filter(function(item) {
          return item !== value;
        });
        return previousLength !== this.items.length;
      }
    }, {
      key: "forEach",
      value: function forEach(callbackfn) {
        var _this = this;
        this.items.forEach(function(item) {
          callbackfn(item, item, _this);
        });
      }
    }, {
      key: "has",
      value: function has(value) {
        return this.items.indexOf(value) !== -1;
      }
    }, {
      key: "size",
      get: function get() {
        return this.items.length;
      }
    }]);
  })();
  var SetLike_default = typeof Set === "undefined" ? Set : SetLike;

  // substrate/apps/ui-control-page/node_modules/dom-accessibility-api/dist/getRole.mjs
  function getLocalName(element) {
    var _element$localName;
    return (
      // eslint-disable-next-line no-restricted-properties -- actual guard for environments without localName
      (_element$localName = element.localName) !== null && _element$localName !== void 0 ? _element$localName : (
        // eslint-disable-next-line no-restricted-properties -- required for the fallback
        element.tagName.toLowerCase()
      )
    );
  }
  var localNameToRoleMappings = {
    article: "article",
    aside: "complementary",
    button: "button",
    datalist: "listbox",
    dd: "definition",
    details: "group",
    dialog: "dialog",
    dt: "term",
    fieldset: "group",
    figure: "figure",
    // WARNING: Only with an accessible name
    form: "form",
    footer: "contentinfo",
    h1: "heading",
    h2: "heading",
    h3: "heading",
    h4: "heading",
    h5: "heading",
    h6: "heading",
    header: "banner",
    hr: "separator",
    html: "document",
    legend: "legend",
    li: "listitem",
    math: "math",
    main: "main",
    menu: "list",
    nav: "navigation",
    ol: "list",
    optgroup: "group",
    // WARNING: Only in certain context
    option: "option",
    output: "status",
    progress: "progressbar",
    // WARNING: Only with an accessible name
    section: "region",
    summary: "button",
    table: "table",
    tbody: "rowgroup",
    textarea: "textbox",
    tfoot: "rowgroup",
    // WARNING: Only in certain context
    td: "cell",
    th: "columnheader",
    thead: "rowgroup",
    tr: "row",
    ul: "list"
  };
  var prohibitedAttributes = {
    caption: /* @__PURE__ */ new Set(["aria-label", "aria-labelledby"]),
    code: /* @__PURE__ */ new Set(["aria-label", "aria-labelledby"]),
    deletion: /* @__PURE__ */ new Set(["aria-label", "aria-labelledby"]),
    emphasis: /* @__PURE__ */ new Set(["aria-label", "aria-labelledby"]),
    generic: /* @__PURE__ */ new Set(["aria-label", "aria-labelledby", "aria-roledescription"]),
    insertion: /* @__PURE__ */ new Set(["aria-label", "aria-labelledby"]),
    none: /* @__PURE__ */ new Set(["aria-label", "aria-labelledby"]),
    paragraph: /* @__PURE__ */ new Set(["aria-label", "aria-labelledby"]),
    presentation: /* @__PURE__ */ new Set(["aria-label", "aria-labelledby"]),
    strong: /* @__PURE__ */ new Set(["aria-label", "aria-labelledby"]),
    subscript: /* @__PURE__ */ new Set(["aria-label", "aria-labelledby"]),
    superscript: /* @__PURE__ */ new Set(["aria-label", "aria-labelledby"])
  };
  function hasGlobalAriaAttributes(element, role) {
    return [
      "aria-atomic",
      "aria-busy",
      "aria-controls",
      "aria-current",
      "aria-description",
      "aria-describedby",
      "aria-details",
      // "disabled",
      "aria-dropeffect",
      // "errormessage",
      "aria-flowto",
      "aria-grabbed",
      // "haspopup",
      "aria-hidden",
      // "invalid",
      "aria-keyshortcuts",
      "aria-label",
      "aria-labelledby",
      "aria-live",
      "aria-owns",
      "aria-relevant",
      "aria-roledescription"
    ].some(function(attributeName) {
      var _prohibitedAttributes;
      return element.hasAttribute(attributeName) && !((_prohibitedAttributes = prohibitedAttributes[role]) !== null && _prohibitedAttributes !== void 0 && _prohibitedAttributes.has(attributeName));
    });
  }
  function ignorePresentationalRole(element, implicitRole) {
    return hasGlobalAriaAttributes(element, implicitRole);
  }
  function getRole(element) {
    var explicitRole = getExplicitRole(element);
    if (explicitRole === null || presentationRoles.indexOf(explicitRole) !== -1) {
      var implicitRole = getImplicitRole(element);
      if (presentationRoles.indexOf(explicitRole || "") === -1 || ignorePresentationalRole(element, implicitRole || "")) {
        return implicitRole;
      }
    }
    return explicitRole;
  }
  function getImplicitRole(element) {
    var mappedByTag = localNameToRoleMappings[getLocalName(element)];
    if (mappedByTag !== void 0) {
      return mappedByTag;
    }
    switch (getLocalName(element)) {
      case "a":
      case "area":
      case "link":
        if (element.hasAttribute("href")) {
          return "link";
        }
        break;
      case "img":
        if (element.getAttribute("alt") === "" && !ignorePresentationalRole(element, "img")) {
          return "presentation";
        }
        return "img";
      case "input": {
        var _ref = element, type = _ref.type;
        switch (type) {
          case "button":
          case "image":
          case "reset":
          case "submit":
            return "button";
          case "checkbox":
          case "radio":
            return type;
          case "range":
            return "slider";
          case "email":
          case "tel":
          case "text":
          case "url":
            if (element.hasAttribute("list")) {
              return "combobox";
            }
            return "textbox";
          case "search":
            if (element.hasAttribute("list")) {
              return "combobox";
            }
            return "searchbox";
          case "number":
            return "spinbutton";
          default:
            return null;
        }
      }
      case "select":
        if (element.hasAttribute("multiple") || element.size > 1) {
          return "listbox";
        }
        return "combobox";
    }
    return null;
  }
  function getExplicitRole(element) {
    var role = element.getAttribute("role");
    if (role !== null) {
      var explicitRole = role.trim().split(" ")[0];
      if (explicitRole.length > 0) {
        return explicitRole;
      }
    }
    return null;
  }

  // substrate/apps/ui-control-page/node_modules/dom-accessibility-api/dist/util.mjs
  var presentationRoles = ["presentation", "none"];
  function isElement(node) {
    return node !== null && node.nodeType === node.ELEMENT_NODE;
  }
  function isHTMLTableCaptionElement(node) {
    return isElement(node) && getLocalName(node) === "caption";
  }
  function isHTMLInputElement(node) {
    return isElement(node) && getLocalName(node) === "input";
  }
  function isHTMLOptGroupElement(node) {
    return isElement(node) && getLocalName(node) === "optgroup";
  }
  function isHTMLSelectElement(node) {
    return isElement(node) && getLocalName(node) === "select";
  }
  function isHTMLTableElement(node) {
    return isElement(node) && getLocalName(node) === "table";
  }
  function isHTMLTextAreaElement(node) {
    return isElement(node) && getLocalName(node) === "textarea";
  }
  function safeWindow(node) {
    var _ref = node.ownerDocument === null ? node : node.ownerDocument, defaultView = _ref.defaultView;
    if (defaultView === null) {
      throw new TypeError("no window available");
    }
    return defaultView;
  }
  function isHTMLFieldSetElement(node) {
    return isElement(node) && getLocalName(node) === "fieldset";
  }
  function isHTMLLegendElement(node) {
    return isElement(node) && getLocalName(node) === "legend";
  }
  function isHTMLSlotElement(node) {
    return isElement(node) && getLocalName(node) === "slot";
  }
  function isSVGElement(node) {
    return isElement(node) && node.ownerSVGElement !== void 0;
  }
  function isSVGSVGElement(node) {
    return isElement(node) && getLocalName(node) === "svg";
  }
  function isSVGTitleElement(node) {
    return isSVGElement(node) && getLocalName(node) === "title";
  }
  function queryIdRefs(node, attributeName) {
    if (isElement(node) && node.hasAttribute(attributeName)) {
      var ids = node.getAttribute(attributeName).split(" ");
      var root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
      return ids.map(function(id) {
        return root.getElementById(id);
      }).filter(
        function(element) {
          return element !== null;
        }
        // TODO: why does this not narrow?
      );
    }
    return [];
  }
  function hasAnyConcreteRoles(node, roles) {
    if (isElement(node)) {
      return roles.indexOf(getRole(node)) !== -1;
    }
    return false;
  }

  // substrate/apps/ui-control-page/node_modules/dom-accessibility-api/dist/accessible-name-and-description.mjs
  function asFlatString(s) {
    return s.trim().replace(/\s\s+/g, " ");
  }
  function isHidden(node, getComputedStyleImplementation) {
    if (!isElement(node)) {
      return false;
    }
    if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") {
      return true;
    }
    var style = getComputedStyleImplementation(node);
    return style.getPropertyValue("display") === "none" || style.getPropertyValue("visibility") === "hidden";
  }
  function isControl(node) {
    return hasAnyConcreteRoles(node, ["button", "combobox", "listbox", "textbox"]) || hasAbstractRole(node, "range");
  }
  function hasAbstractRole(node, role) {
    if (!isElement(node)) {
      return false;
    }
    switch (role) {
      case "range":
        return hasAnyConcreteRoles(node, ["meter", "progressbar", "scrollbar", "slider", "spinbutton"]);
      default:
        throw new TypeError("No knowledge about abstract role '".concat(role, "'. This is likely a bug :("));
    }
  }
  function querySelectorAllSubtree(element, selectors) {
    var elements = arrayFrom(element.querySelectorAll(selectors));
    queryIdRefs(element, "aria-owns").forEach(function(root) {
      elements.push.apply(elements, arrayFrom(root.querySelectorAll(selectors)));
    });
    return elements;
  }
  function querySelectedOptions(listbox) {
    if (isHTMLSelectElement(listbox)) {
      return listbox.selectedOptions || querySelectorAllSubtree(listbox, "[selected]");
    }
    return querySelectorAllSubtree(listbox, '[aria-selected="true"]');
  }
  function isMarkedPresentational(node) {
    return hasAnyConcreteRoles(node, presentationRoles);
  }
  function isNativeHostLanguageTextAlternativeElement(node) {
    return isHTMLTableCaptionElement(node);
  }
  function allowsNameFromContent(node) {
    return hasAnyConcreteRoles(node, ["button", "cell", "checkbox", "columnheader", "gridcell", "heading", "label", "legend", "link", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "radio", "row", "rowheader", "switch", "tab", "tooltip", "treeitem"]);
  }
  function isDescendantOfNativeHostLanguageTextAlternativeElement(node) {
    return false;
  }
  function getValueOfTextbox(element) {
    if (isHTMLInputElement(element) || isHTMLTextAreaElement(element)) {
      return element.value;
    }
    return element.textContent || "";
  }
  function getTextualContent(declaration) {
    var content = declaration.getPropertyValue("content");
    if (/^["'].*["']$/.test(content)) {
      return content.slice(1, -1);
    }
    return "";
  }
  function isLabelableElement(element) {
    var localName = getLocalName(element);
    return localName === "button" || localName === "input" && element.getAttribute("type") !== "hidden" || localName === "meter" || localName === "output" || localName === "progress" || localName === "select" || localName === "textarea";
  }
  function findLabelableElement(element) {
    if (isLabelableElement(element)) {
      return element;
    }
    var labelableElement = null;
    element.childNodes.forEach(function(childNode) {
      if (labelableElement === null && isElement(childNode)) {
        var descendantLabelableElement = findLabelableElement(childNode);
        if (descendantLabelableElement !== null) {
          labelableElement = descendantLabelableElement;
        }
      }
    });
    return labelableElement;
  }
  function getControlOfLabel(label) {
    if (label.control !== void 0) {
      return label.control;
    }
    var htmlFor = label.getAttribute("for");
    if (htmlFor !== null) {
      return label.ownerDocument.getElementById(htmlFor);
    }
    return findLabelableElement(label);
  }
  function getLabels(element) {
    var labelsProperty = element.labels;
    if (labelsProperty === null) {
      return labelsProperty;
    }
    if (labelsProperty !== void 0) {
      return arrayFrom(labelsProperty);
    }
    if (!isLabelableElement(element)) {
      return null;
    }
    var document = element.ownerDocument;
    return arrayFrom(document.querySelectorAll("label")).filter(function(label) {
      return getControlOfLabel(label) === element;
    });
  }
  function getSlotContents(slot) {
    var assignedNodes = slot.assignedNodes();
    if (assignedNodes.length === 0) {
      return arrayFrom(slot.childNodes);
    }
    return assignedNodes;
  }
  function computeTextAlternative(root) {
    var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
    var consultedNodes = new SetLike_default();
    var computedStyles = typeof Map === "undefined" ? void 0 : /* @__PURE__ */ new Map();
    var window2 = safeWindow(root);
    var _options$compute = options.compute, compute = _options$compute === void 0 ? "name" : _options$compute, _options$computedStyl = options.computedStyleSupportsPseudoElements, computedStyleSupportsPseudoElements = _options$computedStyl === void 0 ? options.getComputedStyle !== void 0 : _options$computedStyl, _options$getComputedS = options.getComputedStyle, uncachedGetComputedStyle = _options$getComputedS === void 0 ? window2.getComputedStyle.bind(window2) : _options$getComputedS, _options$hidden = options.hidden, hidden = _options$hidden === void 0 ? false : _options$hidden;
    var getComputedStyle = function getComputedStyle2(el, pseudoElement) {
      if (pseudoElement !== void 0) {
        throw new Error("use uncachedGetComputedStyle directly for pseudo elements");
      }
      if (computedStyles === void 0) {
        return uncachedGetComputedStyle(el);
      }
      var cachedStyles = computedStyles.get(el);
      if (cachedStyles) {
        return cachedStyles;
      }
      var style = uncachedGetComputedStyle(el, pseudoElement);
      computedStyles.set(el, style);
      return style;
    };
    function computeMiscTextAlternative(node, context) {
      var accumulatedText = "";
      if (isElement(node) && computedStyleSupportsPseudoElements) {
        var pseudoBefore = uncachedGetComputedStyle(node, "::before");
        var beforeContent = getTextualContent(pseudoBefore);
        accumulatedText = "".concat(beforeContent, " ").concat(accumulatedText);
      }
      var childNodes = isHTMLSlotElement(node) ? getSlotContents(node) : arrayFrom(node.childNodes).concat(queryIdRefs(node, "aria-owns"));
      childNodes.forEach(function(child) {
        var result = computeTextAlternative2(child, {
          isEmbeddedInLabel: context.isEmbeddedInLabel,
          isReferenced: false,
          recursion: true
        });
        var display = isElement(child) ? getComputedStyle(child).getPropertyValue("display") : "inline";
        var separator = display !== "inline" ? " " : "";
        accumulatedText += "".concat(separator).concat(result).concat(separator);
      });
      if (isElement(node) && computedStyleSupportsPseudoElements) {
        var pseudoAfter = uncachedGetComputedStyle(node, "::after");
        var afterContent = getTextualContent(pseudoAfter);
        accumulatedText = "".concat(accumulatedText, " ").concat(afterContent);
      }
      return accumulatedText.trim();
    }
    function useAttribute(element, attributeName) {
      var attribute = element.getAttributeNode(attributeName);
      if (attribute !== null && !consultedNodes.has(attribute) && attribute.value.trim() !== "") {
        consultedNodes.add(attribute);
        return attribute.value;
      }
      return null;
    }
    function computeTooltipAttributeValue(node) {
      if (!isElement(node)) {
        return null;
      }
      return useAttribute(node, "title");
    }
    function computeElementTextAlternative(node) {
      if (!isElement(node)) {
        return null;
      }
      if (isHTMLFieldSetElement(node)) {
        consultedNodes.add(node);
        var children = arrayFrom(node.childNodes);
        for (var i = 0; i < children.length; i += 1) {
          var child = children[i];
          if (isHTMLLegendElement(child)) {
            return computeTextAlternative2(child, {
              isEmbeddedInLabel: false,
              isReferenced: false,
              recursion: false
            });
          }
        }
      } else if (isHTMLTableElement(node)) {
        consultedNodes.add(node);
        var _children = arrayFrom(node.childNodes);
        for (var _i = 0; _i < _children.length; _i += 1) {
          var _child = _children[_i];
          if (isHTMLTableCaptionElement(_child)) {
            return computeTextAlternative2(_child, {
              isEmbeddedInLabel: false,
              isReferenced: false,
              recursion: false
            });
          }
        }
      } else if (isSVGSVGElement(node)) {
        consultedNodes.add(node);
        var _children2 = arrayFrom(node.childNodes);
        for (var _i2 = 0; _i2 < _children2.length; _i2 += 1) {
          var _child2 = _children2[_i2];
          if (isSVGTitleElement(_child2)) {
            return _child2.textContent;
          }
        }
        return null;
      } else if (getLocalName(node) === "img" || getLocalName(node) === "area") {
        var nameFromAlt = useAttribute(node, "alt");
        if (nameFromAlt !== null) {
          return nameFromAlt;
        }
      } else if (isHTMLOptGroupElement(node)) {
        var nameFromLabel = useAttribute(node, "label");
        if (nameFromLabel !== null) {
          return nameFromLabel;
        }
      }
      if (isHTMLInputElement(node) && (node.type === "button" || node.type === "submit" || node.type === "reset")) {
        var nameFromValue = useAttribute(node, "value");
        if (nameFromValue !== null) {
          return nameFromValue;
        }
        if (node.type === "submit") {
          return "Submit";
        }
        if (node.type === "reset") {
          return "Reset";
        }
      }
      var labels = getLabels(node);
      if (labels !== null && labels.length !== 0) {
        consultedNodes.add(node);
        return arrayFrom(labels).map(function(element) {
          return computeTextAlternative2(element, {
            isEmbeddedInLabel: true,
            isReferenced: false,
            recursion: true
          });
        }).filter(function(label) {
          return label.length > 0;
        }).join(" ");
      }
      if (isHTMLInputElement(node) && node.type === "image") {
        var _nameFromAlt = useAttribute(node, "alt");
        if (_nameFromAlt !== null) {
          return _nameFromAlt;
        }
        var nameFromTitle = useAttribute(node, "title");
        if (nameFromTitle !== null) {
          return nameFromTitle;
        }
        return "Submit Query";
      }
      if (hasAnyConcreteRoles(node, ["button"])) {
        var nameFromSubTree = computeMiscTextAlternative(node, {
          isEmbeddedInLabel: false,
          isReferenced: false
        });
        if (nameFromSubTree !== "") {
          return nameFromSubTree;
        }
      }
      return null;
    }
    function computeTextAlternative2(current, context) {
      if (consultedNodes.has(current)) {
        return "";
      }
      if (!hidden && isHidden(current, getComputedStyle) && !context.isReferenced) {
        consultedNodes.add(current);
        return "";
      }
      var labelAttributeNode = isElement(current) ? current.getAttributeNode("aria-labelledby") : null;
      var labelElements = labelAttributeNode !== null && !consultedNodes.has(labelAttributeNode) ? queryIdRefs(current, "aria-labelledby") : [];
      if (compute === "name" && !context.isReferenced && labelElements.length > 0) {
        consultedNodes.add(labelAttributeNode);
        return labelElements.map(function(element) {
          return computeTextAlternative2(element, {
            isEmbeddedInLabel: context.isEmbeddedInLabel,
            isReferenced: true,
            // this isn't recursion as specified, otherwise we would skip
            // `aria-label` in
            // <input id="myself" aria-label="foo" aria-labelledby="myself"
            recursion: false
          });
        }).join(" ");
      }
      var skipToStep2E = context.recursion && isControl(current) && compute === "name";
      if (!skipToStep2E) {
        var ariaLabel = (isElement(current) && current.getAttribute("aria-label") || "").trim();
        if (ariaLabel !== "" && compute === "name") {
          consultedNodes.add(current);
          return ariaLabel;
        }
        if (!isMarkedPresentational(current)) {
          var elementTextAlternative = computeElementTextAlternative(current);
          if (elementTextAlternative !== null) {
            consultedNodes.add(current);
            return elementTextAlternative;
          }
        }
      }
      if (hasAnyConcreteRoles(current, ["menu"])) {
        consultedNodes.add(current);
        return "";
      }
      if (skipToStep2E || context.isEmbeddedInLabel || context.isReferenced) {
        if (hasAnyConcreteRoles(current, ["combobox", "listbox"])) {
          consultedNodes.add(current);
          var selectedOptions = querySelectedOptions(current);
          if (selectedOptions.length === 0) {
            return isHTMLInputElement(current) ? current.value : "";
          }
          return arrayFrom(selectedOptions).map(function(selectedOption) {
            return computeTextAlternative2(selectedOption, {
              isEmbeddedInLabel: context.isEmbeddedInLabel,
              isReferenced: false,
              recursion: true
            });
          }).join(" ");
        }
        if (hasAbstractRole(current, "range")) {
          consultedNodes.add(current);
          if (current.hasAttribute("aria-valuetext")) {
            return current.getAttribute("aria-valuetext");
          }
          if (current.hasAttribute("aria-valuenow")) {
            return current.getAttribute("aria-valuenow");
          }
          return current.getAttribute("value") || "";
        }
        if (hasAnyConcreteRoles(current, ["textbox"])) {
          consultedNodes.add(current);
          return getValueOfTextbox(current);
        }
      }
      if (allowsNameFromContent(current) || isElement(current) && context.isReferenced || isNativeHostLanguageTextAlternativeElement(current) || isDescendantOfNativeHostLanguageTextAlternativeElement(current)) {
        var accumulatedText2F = computeMiscTextAlternative(current, {
          isEmbeddedInLabel: context.isEmbeddedInLabel,
          isReferenced: false
        });
        if (accumulatedText2F !== "") {
          consultedNodes.add(current);
          return accumulatedText2F;
        }
      }
      if (current.nodeType === current.TEXT_NODE) {
        consultedNodes.add(current);
        return current.textContent || "";
      }
      if (context.recursion) {
        consultedNodes.add(current);
        return computeMiscTextAlternative(current, {
          isEmbeddedInLabel: context.isEmbeddedInLabel,
          isReferenced: false
        });
      }
      var tooltipAttributeValue = computeTooltipAttributeValue(current);
      if (tooltipAttributeValue !== null) {
        consultedNodes.add(current);
        return tooltipAttributeValue;
      }
      consultedNodes.add(current);
      return "";
    }
    return asFlatString(computeTextAlternative2(root, {
      isEmbeddedInLabel: false,
      // by spec computeAccessibleDescription starts with the referenced elements as roots
      isReferenced: compute === "description",
      recursion: false
    }));
  }

  // substrate/apps/ui-control-page/node_modules/dom-accessibility-api/dist/accessible-name.mjs
  function prohibitsNaming(node) {
    return hasAnyConcreteRoles(node, ["caption", "code", "deletion", "emphasis", "generic", "insertion", "none", "paragraph", "presentation", "strong", "subscript", "superscript"]);
  }
  function computeAccessibleName(root) {
    var options = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
    if (prohibitsNaming(root)) {
      return "";
    }
    return computeTextAlternative(root, options);
  }

  // substrate/apps/ui-control-page/src/walk.ts
  var ROOT_ID = "document";
  var INTERACTIVE_ROLES = /* @__PURE__ */ new Set([
    "button",
    "link",
    "checkbox",
    "radio",
    "switch",
    "textbox",
    "searchbox",
    "combobox",
    "listbox",
    "option",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "tab",
    "slider",
    "spinbutton",
    "treeitem",
    "gridcell"
  ]);
  var UNNAMED_ROLES = /* @__PURE__ */ new Set(["generic", "none", "presentation"]);
  var SKIPPED = /* @__PURE__ */ new Set(["head", "script", "style", "template", "noscript"]);
  var isFrame = (el) => el.localName === "iframe" || el.localName === "frame";
  var frameDocument = (el) => {
    if (!isFrame(el)) return null;
    try {
      return el.contentDocument;
    } catch {
      return null;
    }
  };
  var ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
  var focusable = (el) => (el.tabIndex ?? -1) >= 0 || el.isContentEditable === true;
  var valueOf = (el) => {
    if (el.localName === "input" || el.localName === "textarea" || el.localName === "select") return String(el.value);
    return el.getAttribute("aria-valuetext") ?? el.getAttribute("aria-valuenow") ?? void 0;
  };
  var deepestFocus = (doc) => {
    let at = doc.activeElement;
    for (; ; ) {
      const inner = at?.shadowRoot?.activeElement ?? (at ? frameDocument(at)?.activeElement : null) ?? null;
      if (!inner || inner === at) return at;
      at = inner;
    }
  };
  var intersect2 = (a, b) => {
    const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
  };
  var boxOf = (el, by) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + by.x, y: r.y + by.y, width: r.width, height: r.height };
  };
  var overflows = (style) => style.overflowX !== "visible" || style.overflowY !== "visible";
  var clipOf = (el, style, by) => {
    const doc = el.ownerDocument;
    if (!overflows(style) || el === doc.documentElement) return null;
    if (el === doc.body && !overflows(doc.defaultView.getComputedStyle(doc.documentElement))) return null;
    const r = boxOf(el, by);
    const [left, top, right, bottom] = [style.borderLeftWidth, style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth].map(parseFloat);
    return { x: r.x + left, y: r.y + top, width: r.width - left - right, height: r.height - top - bottom };
  };
  var cutsBelow = (el, style, at, own, by) => {
    const cut = clipOf(el, style, by);
    const flow = cut ? intersect2(own, cut) : own;
    const transformed = style.transform !== "none";
    return { flow, absolute: style.position !== "static" || transformed ? flow : at.absolute, fixed: transformed ? flow : at.fixed };
  };
  var cutFor = (style, at) => style.position === "fixed" ? at.fixed : style.position === "absolute" ? at.absolute : at.flow;
  var frameView = (el, style, by) => {
    const r = boxOf(el, by);
    const [left, top, right, bottom] = [style.paddingLeft, style.paddingTop, style.paddingRight, style.paddingBottom].map(parseFloat);
    const at = { x: r.x + el.clientLeft + left, y: r.y + el.clientTop + top };
    return { by: at, box: { ...at, width: el.clientWidth - left - right, height: el.clientHeight - top - bottom } };
  };
  function installWalk(win, hold2) {
    const remembered = /* @__PURE__ */ new WeakMap();
    const owners = /* @__PURE__ */ new Map();
    const heldByAnother = (id, el) => {
      const owner = owners.get(id)?.deref();
      return owner !== void 0 && owner !== el && owner.isConnected;
    };
    const idFor = (el, path, anchored, used) => {
      const kept2 = remembered.get(el);
      const base = !anchored && kept2 !== void 0 ? kept2 : path;
      let id = base;
      for (let n = 2; used.has(id) || heldByAnother(id, el); n++) id = `${base}~${n}`;
      used.add(id);
      remembered.set(el, id);
      owners.set(id, new WeakRef(el));
      return id;
    };
    const flatChildren = (el) => {
      if (el.localName === "slot") {
        const shown = el.assignedElements({ flatten: true });
        return shown.length > 0 ? shown : [...el.children];
      }
      return [...(hold2.shadowRoot(el) ?? el.shadowRoot ?? el).children];
    };
    const layout = () => {
      for (const [id, owner] of owners) if (owner.deref() === void 0) owners.delete(id);
      const doc = win.document;
      const viewport = { x: 0, y: 0, width: win.innerWidth, height: win.innerHeight };
      const root = {
        id: ROOT_ID,
        role: "document",
        label: doc.title || void 0,
        box: viewport,
        clipped: viewport,
        visible: true,
        enabled: true,
        focused: false,
        interactive: false,
        children: []
      };
      const used = /* @__PURE__ */ new Set([ROOT_ID]);
      const focus = deepestFocus(doc);
      const visit = (el, at) => {
        if (SKIPPED.has(el.localName)) return;
        const style = el.ownerDocument.defaultView.getComputedStyle(el);
        if (style.display === "none") return;
        const role = getRole(el);
        const label = computeAccessibleName(el) || void 0;
        const action = el.getAttribute("data-ui-action") ?? void 0;
        const key = el.getAttribute("data-ui-id") ?? (el.id || null);
        const keep = key !== null || role !== null && !UNNAMED_ROLES.has(role) || label !== void 0 || focusable(el) || action !== void 0 || ownText(el) || isFrame(el);
        let here = at;
        if (keep) {
          const nodeRole = role ?? "generic";
          const index = (at.roles.get(nodeRole) ?? 0) + 1;
          at.roles.set(nodeRole, index);
          const segment = index > 1 ? `${nodeRole}[${index}]` : nodeRole;
          const path = key !== null ? at.anchor ? `${at.anchor}/${key}` : key : at.parent === root ? segment : `${at.parent.id}/${segment}`;
          const id = idFor(el, path, key !== null, used);
          const box = boxOf(el, at.by);
          const clipped = intersect2(box, cutFor(style, at.cuts));
          const shown = typeof el.checkVisibility !== "function" || el.checkVisibility({ visibilityProperty: true });
          const node = {
            id,
            role: nodeRole,
            label,
            value: valueOf(el),
            box,
            clipped,
            visible: shown && clipped.width > 0 && clipped.height > 0,
            enabled: !el.matches(":disabled") && el.closest('[aria-disabled="true"]') === null,
            focused: el === focus,
            interactive: focusable(el) || INTERACTIVE_ROLES.has(nodeRole) || action !== void 0,
            action,
            children: []
          };
          at.parent.children.push(node);
          here = { ...at, anchor: key !== null ? id : at.anchor, parent: node, roles: /* @__PURE__ */ new Map() };
        }
        here = { ...here, cuts: cutsBelow(el, style, at.cuts, cutFor(style, at.cuts), at.by) };
        if (isFrame(el)) {
          const inner = frameDocument(el);
          if (!inner?.documentElement) {
            here.parent.source = "opaque: a frame of another origin";
            return;
          }
          const view = frameView(el, style, at.by);
          const shows = intersect2(here.cuts.flow, view.box);
          const inFrame = { ...here, by: view.by, cuts: { flow: shows, absolute: shows, fixed: shows } };
          for (const child of [...inner.documentElement.children]) visit(child, inFrame);
          return;
        }
        for (const child of flatChildren(el)) visit(child, here);
      };
      const top = { anchor: "", parent: root, cuts: { flow: viewport, absolute: viewport, fixed: viewport }, by: { x: 0, y: 0 }, roles: /* @__PURE__ */ new Map() };
      for (const child of [...doc.documentElement.children]) visit(child, top);
      return { root, viewport: { width: viewport.width, height: viewport.height }, ratio: win.devicePixelRatio };
    };
    return { layout };
  }

  // substrate/apps/ui-control-page/src/page.ts
  var hold = installHold(window);
  var walk = installWalk(window, hold);
  globalThis[PAGE_GLOBAL] = hold;
  globalThis[WALK_GLOBAL] = walk;
  globalThis[UI_GLOBAL] = installAnswers(window, hold, walk);
})();
