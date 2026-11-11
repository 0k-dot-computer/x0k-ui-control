# The page's answers: offer, observe and invoke

```turtle folio:document
implementation:ui-control\/page-answer a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "The in-page library's entry: a page installs the library with its app name and its state, declares its named actions, and hands its host what it declared, what it reads and the run of an action, raw. The host makes the protocol's values: the offer, the state part and the checks, with x0k-ui-protocol's page module, natively in a Rust host and through x0k-ui-protocol-wasm in a JavaScript one. A page that gives present and release hooks takes state fixtures: the library keeps the fixture's handle and the live state as it stood, answers what the page shows while a fixture stands, and lets the page's own code ask whether one stands and hear it change, while the fixture checks stay its host's. The page loads no WebAssembly, so a page whose content security policy forbids it answers every call. A test runs the conformance suite itself against the page in WebKitGTK and headless Chromium, through a JSON-lines link, on a page that allows WebAssembly and on one that forbids it." ;
    x0k:concerns "ui-control", "webview", "protocol", "conformance" ;
    x0k:motivatedBy intent:30ebc190-f09e-020f-3bc8-7ccc941f5128 ;
    x0k:implements architecture:ui-control-channel,
        architecture:ui-interfaces ;
    x0k:cites implementation:ui-control\/webview,
        implementation:ui-control\/page-checks,
        implementation:ui-control\/page-hold,
        implementation:ui-control\/page-walk,
        implementation:ui-control\/protocol,
        implementation:ui-control\/endpoint,
        implementation:ui-control\/conformance,
        implementation:platform\/datum ;
    folio:tangleCrate "substrate/apps/ui-control-page" ;
    folio:tangleRoot "src/answer.ts" .
```

A driver asks an app three things before anything else: what it offers, what
it shows, and to run one of its named actions
(`x0k:architecture/ui-control-channel` §8 and §9). The hold
(`x0k:implementation/ui-control/page-hold`) and the layout walk
(`x0k:implementation/ui-control/page-walk`) give a page the parts of an
observation. This chapter gives it the rest of webview §5: a page declares its
app, its state and its actions, and its host answers `offer`, `observe` and
`invoke` as the protocol's values from what the page declared. A page that
says how to show a state it is given also takes state fixtures, and its host
answers `present` and `release` (`x0k:architecture/ui-interfaces` §4).

The carried example is the **answer page**, a counter. Its state is the count.
It offers `counter.bump`, which raises the count by a number its arguments
give and draws the new count in the next animation frame, as a framework that
batches its rendering does. It offers `counter.read`, which changes nothing,
and `counter.fail`, which throws.

## What holds

- An action declared with no side-effect class is `non_idempotent`.
- An action the offer does not list, or whose arguments misfit its shape, is
  refused before the page's function hears it, by `x0k-ui-protocol`'s own
  `check_invoke`, which the host runs.
- An action that throws answers `failed` with the error's message.
- `invoke` waits for the action's promise and then for one rendering update,
  and answers the epoch then: the frame of the first page state rendered after
  the action took effect (`ui-control-channel` §9).
- The state part is the page's value, its head, and its shape's fingerprint.
  The head is the page's `head()`, or else a pin of the state's canonical
  encoding, so it moves only when the state does.
- The offer's interfaces carry their fingerprints from `x0k-ui-protocol`.
- A page answers every operation the endpoint serves. Those it does not offer
  (`ui/input`, `ui/history` and its fixtures) are refused by the protocol's own
  checks, with the codes the endpoint gives.
- A page takes state fixtures exactly when its state declaration gives both
  `present` and `release`.
- While a fixture stands, an observation's state is what the page shows, the
  fixture as a driver has changed it, and names the fixture's handle; the
  declaration answers the live state and its head as they stood when the first
  fixture was presented.
- `present` and `release` answer the frame of the first page state rendered
  after the page's own hook, as `invoke` does.
- The page's own code can ask which fixture stands, `fixture()`, and hear it
  change, `onFixture`. The handle stands from before the page's `present` runs
  until after its `release` has.
- The library checks no fixture: the fingerprint, the head and the shape are
  its host's checks.
- The page loads no WebAssembly. A page whose content security policy forbids
  it (`'wasm-unsafe-eval'` absent from `script-src`) answers every call.
- A page that cannot paint says so: `cannotPaint()` answers why while the page
  is hidden, or while a wait on a rendering update ran out with none since,
  and `null` while it paints (`x0k:implementation/ui-control/page-hold`, "When
  the page cannot paint"). It waits on nothing. A host asks it before an
  action, and refuses the action as `cannot_paint` (`ui-control-channel` §8
  to §10).
- `invoke`, `present` and `release` never wait on a frame that cannot come:
  a page hidden or not painting answers at once with no frame and the reason,
  `unpainted`, and its host's next call is refused as `cannot_paint`.
- A page may decline a `present` for now, for a reason of its own, by
  throwing or returning `ui.decline(reason)`. It answers `declined`, naming
  `ui/history`, with the reason, and what stood before still stands. Any other
  throw goes to the host, which answers `misfit_state`.
- A page may decline an action or input for now while a fixture stands, by
  its declaration's `declines(call)`, which `declines` on the library's global
  answers to its host (`ui-interfaces` §4).
- A page may end the fixture that stands itself, for a reason of its own, by
  `ui.endFixture(reason)` (`ui-interfaces` §4). Its `release` hook runs, it
  shows its live state, and `onFixture` hears `null`. The library keeps the
  handle it ended and the reason: `fixtureEnded(handle)` answers the reason to
  its host, and a `release` of that handle answers `ended` with it.

The cost bound: an answer that holds no capture runs in one script task plus,
for `invoke`, the action and one rendering update.

## What a page gives its host

A page gives its host three things, raw, on the library's global:

- `declared()`: its app, an instance name for this load, its actions as the
  offer lists them, and its state's shape, value and own head if it gives one
  (`x0k-ui-protocol`'s `page::Declared`).
- `read(call)`: what an observation of `call` reads in one task, its layout
  and, when the call asks for it, its state as declared.
- `run(name, args)`: the run of a declared action, with its outcome and the
  frame of the first page state rendered after it.
- `present(state)` and `release(handle)`: a state fixture shown and released,
  each with the frame of the first page state rendered after it, and
  `fixture()`, the handle of the fixture that stands. `declared()` says
  whether the page takes fixtures at all.
- `cannotPaint()`: why the page cannot paint now, or `null`.
- `declines(call)`: why the page declines an action, `{ kind: 'invoke',
  action }`, or input, `{ kind: 'perform' }`, for now, or `null`. Its host
  asks only while a fixture stands, as the endpoint does.
- `fixtureEnded(handle)`: why the page ended the fixture `handle` itself, or
  `null` while it stands and for a fixture the page did not end. The Tauri
  plugin answers the endpoint's `fixture_ended` hook with it.

The host makes the protocol's values from them (`x0k:implementation/ui-control/protocol`,
"What a web page declares"): the offer with `page_offer`, the state part with
`state_part`, and, when no endpoint stands in front of the page, the checks
with `page_check`. So every check is made where the protocol's code already
runs, and the page carries none of it:

- The Tauri plugin's endpoint checks every call before its app hears it, so it
  makes the offer and the state part natively and runs an action the endpoint
  let through (`x0k:implementation/ui-control/tauri-plugin`).
- A host written in JavaScript answers with `hostAnswer` in `src/host.ts`,
  which loads `x0k-ui-protocol-wasm` in the host and not in the page. The test
  below is one.
- The WebSocket dial-out will run the session's callee beside the page, and
  that callee answers as a host does.

One part a page cannot make: its capture. A host that captures holds the page
(webview §2): it holds with `read(call)` as the hold's reader, takes its
capture, verifies, pins the state it read, and makes the observation with
`observation(held, call)` (`x0k:implementation/ui-control/page-walk`, "The
scale of a capture"). A call that names a region or a scale is refused its
capture by `wholeCaptureOnly(call)`'s reason, by a host that captures the
whole page at its own scale. A host in another language reaches both functions
on the library's global, beside `read`, so the rule that turns a CSS box into
capture pixels stays the library's alone.

## The checks for a host in JavaScript

A host in JavaScript makes the values and the checks with
`x0k-ui-protocol-wasm`, the page module compiled to WebAssembly, a crate of its
own beside the library's sources (`x0k:implementation/ui-control/page-checks`).
The page never loads it.

## The library's side

A page installs the library with its app's name and its state, and declares
each action with its shapes, its class and its description. An action with no
argument shape takes `null`, one with no result shape answers anything, and one
with no class is `non_idempotent`. A page may also declare its look, how its
host draws a driver's input over it (`x0k:implementation/ui-control/page-hold`,
"The host's drawing layer"); the library hands it to the drawing layer, which
draws in it from the next paint. A look changes how input is drawn, never when
it is delivered.

<a name="chunk-declare"></a><sub>`src/answer.ts` · `#declare`</sub>

```typescript {#declare}
/** How reversible an action's effect is. */
export type SideEffect = 'read_only' | 'idempotent_write' | 'non_idempotent';
/** What a page says of one action. Shapes are x0k-datum's spelling as JSON. */
export interface ActionSpec { args?: unknown; result?: unknown; effect?: SideEffect; description?: string }
/** What a page says of its state. */
export interface StateDeclaration {
  /** The state's shape, in x0k-datum's spelling as JSON. */
  shape: unknown;
  /** The state the page shows: its live state, or the fixture that stands. */
  read: () => unknown;
  /** The live state's head, when the page keeps one. */
  head?: () => string;
  /** Show `state` in place of what the page shows, replacing any fixture
   * that stands. Its host has checked `state` against `shape`. It may decline
   * for now by throwing or returning `ui.decline(reason)`. */
  present?: (state: unknown) => unknown;
  /** Show the live state again. */
  release?: () => unknown;
}
/** What a page says of itself when it installs the library. */
export interface Declaration {
  app: string;
  state?: StateDeclaration;
  /** How the page's host draws a driver's input over it. */
  look?: InputLook;
  /** Why the page declines `call` for now while a fixture stands, such as
   * an approval that waits for a person; nothing lets it run. */
  declines?: (call: Declinable) => string | null | undefined;
}
/** A call a page may decline while a fixture stands: an action by its name,
 * or a sequence of input. */
export type Declinable = { kind: 'invoke'; action: string } | { kind: 'perform' };
/** A page's word that it declines a call for now, and why. */
export interface Decline { readonly reason: string }
/** The page's handle on the library. */
export interface Ui {
  /** Declare the action `name`, run by `run` with its arguments. */
  action(name: string, spec: ActionSpec, run: (args: any) => unknown): Ui;
  /** The page's word that it changed in a way the library cannot see. */
  changed(): void;
  /** The handle of the state fixture that stands, or `null` while the page
   * shows its live state. */
  fixture(): string | null;
  /** Hear `fixture()` change: `listener` is called with the new handle, or
   * `null` when the page shows its live state again. Answers the function
   * that stops it hearing. */
  onFixture(listener: (handle: string | null) => void): () => void;
  /** A decline for `reason`, which a `present` hook throws or returns to
   * decline the fixture for now. */
  decline(reason: string): Decline & Error;
  /** End the fixture that stands, for `reason`, such as an approval that
   * arrives for a person: the page's `release` hook runs and it shows its
   * live state again. The session that presented the fixture is told why on
   * its next call. Settles once one rendering update has run after it; does
   * nothing while no fixture stands. */
  endFixture(reason: string): Promise<void>;
}
/** An action as the offer lists it. */
export interface Offered { name: string; description: string; args: unknown; result: unknown; side_effect: SideEffect }
/** What a page declares of itself: `x0k-ui-protocol`'s `page::Declared`,
 * and whether the page takes state fixtures, which a host that makes the
 * fixture checks reads beside it. */
export interface Declared { app: string; instance: string; actions: Offered[]; state?: DeclaredState; fixtures: boolean }
/** The run of an action: its outcome and the frame after it, or `null` and
 * why when the page could not paint one. */
export type Ran = { done: { result: unknown; frame: string | null; unpainted?: string } } | { failed: { reason: string; frame: string | null; unpainted?: string } };
/** A call refused, as the protocol spells a refusal. */
export interface Refusal { code: string; subject?: string; why: string }
/** `present`'s answer, as the protocol spells it. */
export type Presented = { presented: { handle: string; frame: string | null; unpainted?: string } } | { refused: Refusal };
/** `release`'s answer, as the protocol spells it. */
export type Released = { released: { frame: string | null; unpainted?: string } } | { not_standing: { handle: string } } | { ended: { handle: string; reason: string } };
/** The library as a page and its host reach it. */
export interface Answers {
  /** Declare the page's app and state. */
  install(declaration: Declaration): Ui;
  /** What the page declares now. */
  declared(): Declared;
  /** What an observation of `call` reads in one task: for a host's hold. */
  read(call: ObserveCall): PageRead;
  /** Run the declared action `name` with `args`, and answer once one
   * rendering update has run after it. */
  run(name: string, args: unknown): Promise<Ran>;
  /** Have the page show `state`, a fixture its host checked, and answer once
   * one rendering update has run after it. */
  present(state: unknown): Promise<Presented>;
  /** Release the fixture `handle`, and answer once one rendering update has
   * run after the page shows its live state again. */
  release(handle: string): Promise<Released>;
  /** The handle of the fixture that stands, or `null`: the page's own `fixture()`. */
  fixture(): string | null;
  /** Why the page cannot paint now, or `null` while it paints. */
  cannotPaint(): string | null;
  /** Why the page declines `call` for now, or `null`: its declaration's `declines`. */
  declines(call: Declinable): string | null;
  /** Why the page ended the fixture `handle` itself, or `null`. */
  fixtureEnded(handle: string): string | null;
  /** The observation of `call` a host's hold around its capture makes. */
  observation(held: HeldCapture<PinnedRead, Png>, call: ObserveCall): Observation;
  /** Why a host that captures the whole page at its own scale cannot answer
   * `call`'s capture, when it cannot. */
  wholeCaptureOnly(call: ObserveCall): string | undefined;
}

/** An action as the offer lists it, and the function that runs it. */
interface Kept { offered: Offered; run: (args: any) => unknown }

const UNDECLARED_EFFECT: SideEffect = 'non_idempotent';
const DECLINE = Symbol.for('x0k.ui-control.decline');
/** A decline for `reason`, as `ui.decline` makes it. */
const decline = (reason: string): Decline & Error => Object.assign(new Error(reason), { reason, [DECLINE]: true });
const declined = (value: unknown): value is Decline => typeof value === 'object' && value !== null && (value as any)[DECLINE] === true;
/** A frame named, or `null` and why when the page could not paint it. */
const frameOr = (unpainted: string | undefined, epoch: number) => (unpainted ? { frame: null, unpainted } : { frame: String(epoch) });
const kept = (name: string, spec: ActionSpec, run: (args: any) => unknown): Kept => ({
  offered: { name, description: spec.description ?? '', args: spec.args ?? { kind: 'null' }, result: spec.result ?? { kind: 'any' }, side_effect: spec.effect ?? UNDECLARED_EFFECT },
  run,
});
```

The page's side of an answer. What it declared and what it reads are read
now, in the task that asks. The frame after an action is the epoch after its
promise settled and one rendering update ran: the page's own animation-frame
callbacks, which a framework renders in, run in that update before the library
reads it. An action that throws is a failure with its message. A name the
page did not declare is a failure too, though a host's checks refuse it before
it gets here.

<a name="chunk-answers"></a><sub>`src/answer.ts` · `#answers` · assembles [fixture-kept](#chunk-fixture-kept) · [fixture-present](#chunk-fixture-present)</sub>

```typescript {#answers}
const instanceId = () => `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** The library's answers in `win`, beside its hold and its walk. */
export function installAnswers(win: Window, hold: Hold, walk: Walk): Answers {
  let declaration: Declaration = { app: win.location.host || win.document.title || 'page' };
  const actions = new Map<string, Kept>();
  const instance = instanceId();

  <<fixture-kept>>

  const declared = (): Declared => ({
    app: declaration.app,
    instance,
    actions: [...actions.values()].map(({ offered }) => offered),
    state: liveNow(),
    fixtures: takesFixtures(),
  });
  const read = (call: ObserveCall): PageRead => ({ layout: walk.layout(), shown: shownNow(), state: call.parts.includes('state') ? showingNow() : undefined });
  const rendered = () => hold.rendered();
  const run = async (name: string, args: unknown): Promise<Ran> => {
    let outcome: { result: unknown } | { reason: string };
    try {
      const action = actions.get(name);
      if (!action) throw new Error(`the page declares no action ${name}`);
      outcome = { result: (await action.run(args)) ?? null };
    } catch (e) {
      outcome = { reason: e instanceof Error ? e.message : String(e) };
    }
    const frame = frameOr(await rendered(), hold.epoch());
    return 'result' in outcome ? { done: { result: outcome.result, ...frame } } : { failed: { reason: outcome.reason, ...frame } };
  };
  const cannotPaint = () => hold.unpainted() ?? null;
  const declines = (call: Declinable) => declaration.declines?.(call) ?? null;

  <<fixture-present>>

  const ui: Ui = {
    action(name, spec, run_) { actions.set(name, kept(name, spec, run_)); hold.changed(); return ui; },
    changed: () => hold.changed(),
    fixture,
    onFixture(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    decline,
    endFixture,
  };
  return {
    install(given) { declaration = given; hold.drawn.look(given.look ?? {}); hold.changed(); return ui; },
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
    wholeCaptureOnly,
  };
}
```

### A state fixture

A driver may have the page show a state it gives, a **state fixture**
(`x0k:architecture/ui-interfaces` §4), and the library holds the page's half
of it. A page takes fixtures when its state declaration gives both `present`
and `release`; then `declared()` says so, and a host that makes the fixture
checks offers `ui/history` with fixtures. A page that gives neither, or only
one, takes none.

The checks are the host's, as they are for every other call
(`x0k:implementation/ui-control/protocol`, "A state the driver gives"): the
fingerprint against the shape, the head against the live state, the patch
merged over the live state and the result against the shape. By the time the
library hears `present`, the state is whole and fits. So the library keeps
three things and checks nothing:

- **The handle.** It stands from before the page's `present` runs until after
  its `release` has run, so an effect the page's own hooks set off is already
  under the fixture. A second `present` replaces the first under a handle of
  its own; the page's `present` is called again and swaps one fixture for the
  other.
- **The live state as it stood.** When the first fixture is presented, the
  library reads the live state and its head, and keeps them until the release.
  While a fixture stands, `declared()` answers that state, so the offer's head
  and the live state a host checks the next fixture against are the live
  state's, never the fixture's.
- **What is shown.** `read(call)` answers what the page's own `read()` reads,
  which is the fixture as the page shows it, changed by whatever a driver did
  to it, and names the fixture's handle as what the frame shows. A fixture's
  state carries no head of the page's: `head()` is the live state's, so a
  fixture's head is the pin of its value, which its host makes.

The page's side is to swap what it shows, and to keep the fixture from
reaching the world. `present(state)` puts the state where the page reads and
draws from, and `release()` puts the live state back. Between them the page
must not write into its live state, and anything that would write into what
it shows from outside, a poll or a push, must stop or go to the live state
the page keeps aside. An effect of the page's own that leaves the page, a
request to its back end say, must ask `ui.fixture()` and not leave while a
fixture stands. A driver's `ui/act` calls are answered by the app's replay
policy at the endpoint before the page hears them, but a person's click, or
the page's own code, runs inside the page, where only the page can stop it.
`ui.onFixture(listener)` lets a part of the page that holds no hook hear the
fixture stand and end.

An app with a store, in outline. Its `read` reads the store it draws from,
its hooks swap that store and stop what writes into it, and the one function
through which its requests leave the window asks first:

```text
const ui = globalThis.__x0kUi.install({
  app: 'chariot',
  state: {
    shape: STORE_SHAPE,
    read: () => store.get(),
    head: () => String(liveRevision),
    present: (state) => { live ??= store.get(); store.set(state); polling.stop(); },
    release: () => { store.set(live); live = undefined; polling.start(); },
  },
});
async function daemonRpc(method, params) {
  if (ui.fixture()) return simulated(method, params);
  return invoke('daemon_rpc', { method, params });
}
ui.onFixture((handle) => banner.show(handle ? 'showing a fixture' : null));
```

An app may decline for now, with its own reason. Chariot declines while an
approval waits for a person: a fixture would hide the request, and a driver's
action or input could answer it. Its `present` throws `ui.decline`, and its
declaration's `declines` answers the same reason for an action and for input:

```text
const approvalWaiting = () => approvals.pending().length > 0;
const ui = globalThis.__x0kUi.install({
  app: 'chariot',
  state: {
    ...,
    present: (state) => {
      if (approvalWaiting()) throw ui.decline('an approval waits for a person');
      live ??= store.get(); store.set(state); polling.stop();
    },
  },
  declines: (call) => (approvalWaiting() ? 'an approval waits for a person' : null),
});
```

A driver hears `declined` with that reason, never `misfit_state`, and knows
the state fit and the call may succeed once the person has answered.

An approval may also arrive while a fixture stands. A fixture never stands
over an approval, so the page ends it itself, `ui.endFixture(reason)`, and
shows its live state, where the person sees the request:

```text
approvals.onArrive(() => ui.endFixture('an approval arrived for a person'));
```

The driver that presented the fixture is told on its next call: its action or
input is refused as `fixture_ended`, naming the handle with the page's reason,
before anything runs, and its `release` answers `ended` with the reason
(`x0k:implementation/ui-control/endpoint`). The page keeps the last fixture it
ended and why, and answers its host's `fixtureEnded(handle)` from it.

<a name="chunk-fixture-kept"></a><sub>`src/answer.ts` · `#fixture-kept`</sub>

```typescript {#fixture-kept}
/** The fixture that stands: its handle, and the live state as it stood when
 * the first fixture was presented. */
let standing: { handle: string; live: DeclaredState | undefined } | null = null;
/** The fixture the page last ended itself, and why. */
let ended: { handle: string; reason: string } | null = null;
let presented = 0;
const listeners = new Set<(handle: string | null) => void>();

const takesFixtures = () => typeof declaration.state?.present === 'function' && typeof declaration.state?.release === 'function';
/** The state the page shows, as its `read()` reads it. */
const readNow = (head: boolean): DeclaredState | undefined => {
  const state = declaration.state;
  return state && { shape: state.shape, value: state.read() ?? null, head: head ? state.head?.() : undefined };
};
/** The live state: kept while a fixture stands, else what the page shows. */
const liveNow = () => (standing ? standing.live : readNow(true));
/** The state the page shows, with the live head only while it is live. */
const showingNow = () => readNow(!standing);
/** What the page shows, as an observation names it. */
const shownNow = (): Shown => (standing ? { kind: 'fixture', handle: standing.handle } : { kind: 'live' });
const fixture = () => standing?.handle ?? null;
/** Stand `next`, and tell the page's listeners when the handle changed. */
const stand = (next: typeof standing) => {
  const was = fixture();
  standing = next;
  if (fixture() === was) return;
  for (const listener of [...listeners]) {
    try { listener(fixture()); } catch (e) { win.setTimeout(() => { throw e; }); }
  }
};
```

`present` and `release` answer as `run` does: once one rendering update has
run after the page's hook, so the frame they name is the first that shows
what they asked for, and the page's own animation-frame callbacks have drawn
in it. Each moves the epoch, since what the page shows changed even when the
fixture draws as the live state did. A `present` whose hook throws leaves what
stood before standing and throws its error to the host. A `release` whose hook
throws leaves the fixture standing.

`endFixture` is the page's own `release`: it runs the same hook, and keeps the
handle and the reason before the handle stops standing, so a host that hears
no fixture stand can ask why at once. It records nothing when a `present`
replaced the fixture while the hook ran. A `release` of the handle it ended
answers `ended` with the reason, and of any other handle that does not stand,
`not_standing`.

<a name="chunk-fixture-present"></a><sub>`src/answer.ts` · `#fixture-present`</sub>

```typescript {#fixture-present}
const present = async (state: unknown): Promise<Presented> => {
  if (!takesFixtures()) return { refused: { code: 'no_fixtures', subject: 'ui/history', why: 'the page takes no state fixtures' } };
  const was = standing;
  const handle = `${instance}/fixture/${++presented}`;
  stand({ handle, live: was ? was.live : liveNow() });
  let answered: unknown;
  try {
    answered = await declaration.state!.present!(state);
  } catch (e) {
    answered = e;
    if (!declined(e)) {
      stand(was);
      throw e;
    }
  }
  if (declined(answered)) {
    stand(was);
    return { refused: { code: 'declined', subject: 'ui/history', why: answered.reason } };
  }
  hold.changed();
  return { presented: { handle, ...frameOr(await rendered(), hold.epoch()) } };
};
const release = async (handle: string): Promise<Released> => {
  if (standing?.handle !== handle) return ended?.handle === handle ? { ended: { ...ended } } : { not_standing: { handle } };
  await declaration.state!.release!();
  stand(null);
  hold.changed();
  return { released: frameOr(await rendered(), hold.epoch()) };
};
const endFixture = async (reason: string): Promise<void> => {
  const handle = standing?.handle;
  if (handle === undefined) return;
  await declaration.state!.release!();
  if (standing?.handle !== handle) return;
  ended = { handle, reason };
  stand(null);
  hold.changed();
  await rendered();
};
const fixtureEnded = (handle: string) => (ended?.handle === handle ? ended.reason : null);
```

The file:

<a name="chunk-answer-file"></a><sub>`src/answer.ts` · `#answer-file` · assembles [declare](#chunk-declare) · [answers](#chunk-answers)</sub>

```typescript {#answer-file file="src/answer.ts"}
import type { InputLook } from './drawn-layer.ts';
import type { HeldCapture } from './held-capture.ts';
import type { Hold } from './hold.ts';
import { type DeclaredState, type Observation, type ObserveCall, type PageRead, type PinnedRead, type Png, type Shown, observation, wholeCaptureOnly } from './observation.ts';
import type { Walk } from './walk.ts';

<<declare>>

<<answers>>
```

## A host in JavaScript

A host in JavaScript answers the protocol's calls with `hostAnswer`, from what
the page gives it, however it reaches the page: `declared`, `run` and the
observation it makes itself. It loads `x0k-ui-protocol-wasm` once, in the
host, and makes every value and check through it. The module compiles
asynchronously.

- The offer is `page_offer` of what the page declares now.
- An `invoke` is held to that offer by `page_check`: one the checks pass runs
  the action as the offer lists it, and any other call is the checks' answer.
  One the checks pass while the page cannot paint is refused as
  `cannot_paint`, naming the action, before it runs, as the endpoint refuses
  it (`x0k:implementation/ui-control/endpoint`).
- An observation is the host's own: it holds the page around its capture with
  `read(call)` as the reader, pins the state it read with `pinned`, and makes
  the observation with the library's `observation`.

<a name="chunk-host"></a><sub>`src/host.ts` · `#host`</sub>

```typescript {#host file="src/host.ts"}
import type { HeldCapture } from './held-capture.ts';
import type { Declared, Ran } from './answer.ts';
import type { PageRead, PinnedRead } from './observation.ts';

/** The page module's values and checks, loaded from `x0k-ui-protocol-wasm`. */
export interface Checks { call(request: object): any }

/** The checks in the module whose bytes are `module`. */
export async function loadChecks(module: Uint8Array): Promise<Checks> {
  const { instance } = await WebAssembly.instantiate(module, {});
  const exports = instance.exports as { memory: WebAssembly.Memory; ui_protocol_request(len: number): number; ui_protocol_answer(): number; ui_protocol_answered(): number };
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  return {
    call(request) {
      const bytes = encoder.encode(JSON.stringify(request));
      const at = exports.ui_protocol_request(bytes.length);
      new Uint8Array(exports.memory.buffer, at, bytes.length).set(bytes);
      const len = exports.ui_protocol_answer();
      const answer = JSON.parse(decoder.decode(new Uint8Array(exports.memory.buffer, exports.ui_protocol_answered(), len)));
      if (answer !== null && typeof answer === 'object' && typeof answer.fault === 'string') throw new Error(answer.fault);
      return answer;
    },
  };
}

/** What a host asks of the page, however it reaches it. */
export interface PageCalls {
  declared(): Promise<Declared>;
  run(name: string, args: unknown): Promise<Ran>;
  cannotPaint(): Promise<string | null>;
}

/** The endpoint's operations a host answers from what the page declares. */
const OFFER = 'ui/observe.offer', INVOKE = 'ui/act.invoke';

/** `held` with the state it read made the protocol's state part. */
export function pinned<C>(checks: Checks, held: HeldCapture<PageRead, C>): HeldCapture<PinnedRead, C> {
  const state = held.read.state && checks.call({ fn: 'state', ...held.read.state });
  return { ...held, read: { layout: held.read.layout, shown: held.read.shown, state } };
}

/** The answer to `operation` with `argument` other than an observation, for a
 * page with no endpoint in front of it. */
export async function hostAnswer(checks: Checks, page: PageCalls, operation: string, argument: unknown): Promise<unknown> {
  const offer = checks.call({ fn: 'offer', ...(await page.declared()) });
  if (operation === OFFER) return offer;
  const checked = checks.call({ fn: 'check', operation, argument, offer });
  if ('answer' in checked) return checked.answer;
  if (operation !== INVOKE) throw new Error(`the checks let ${operation} through to a page that does not answer it`);
  const unpainted = await page.cannotPaint();
  if (unpainted !== null) return { refused: { code: 'cannot_paint', subject: checked.run.name, why: unpainted } };
  return page.run(checked.run.name, (argument as { args?: unknown }).args ?? null);
}
```

## The answer page

The carried example in full. It installs the library with its count as its
state, and declares its three actions. `counter.bump` declares no class, so it
is offered as `non_idempotent`. It draws the new count in the next animation
frame, so an `invoke` that answered the epoch before a rendering update would
name a frame that does not show it. A button binds to it with
`data-ui-action`.

The page takes state fixtures, as an app with a store does. It keeps its live
count in one store and draws and acts on the store it shows: `present` makes a
fixture the store it shows, and `release` puts the live store back. Its head
is the live store's revision, which moves each time the live count is written,
so a `present` that wrote into the live store would move it. Its own code hears
each fixture stand and end, and keeps what it heard, as an app that gates its
effects on a fixture does.

<a name="chunk-answer-page"></a><sub>`tests/answer-page.html` · `#answer-page`</sub>

```html {#answer-page file="tests/answer-page.html"}
<!doctype html>
<html><head><meta charset="utf-8"><title>answer page</title><style>
html, body { margin: 0; background: #fff; font: 16px sans-serif; }
main { padding: 20px; }
</style></head><body><main>
<h2 id="count">count 0</h2>
<button data-ui-action="counter.bump">bump</button>
</main><script>
/** The live store, its revision, and the store the page shows: the live one, or a fixture. */
const live = { count: 0 };
let revision = 0;
let store = live;
const label = document.getElementById('count');
const draw = () => requestAnimationFrame(() => { label.textContent = `count ${store.count}`; });
const ui = globalThis.__x0kUi.install({
  app: 'answer page',
  state: {
    shape: { kind: 'struct', fields: { count: { shape: { kind: 'int' } } } },
    read: () => ({ count: store.count }),
    head: () => `r${revision}`,
    present: (state) => {
      if (window.approvalWaiting) throw ui.decline('an approval waits for a person');
      if (state.count < 0) throw new Error('the page shows no negative count');
      store = { count: state.count };
      draw();
    },
    release: () => { store = live; draw(); },
  },
  declines: () => (window.approvalWaiting ? 'an approval waits for a person' : null),
});
/** An approval arrives for a person: the page ends any fixture that stands. */
window.approvalArrives = (reason) => ui.endFixture(reason);
window.fixturesHeard = [];
ui.onFixture((handle) => { window.fixturesHeard.push(handle); });
ui.action('counter.bump', {
  description: 'Raise the count by `by`, and draw it in the next frame.',
  args: { kind: 'struct', fields: { by: { shape: { kind: 'int' } } } },
  result: { kind: 'int' },
}, ({ by }) => {
  store.count += by;
  if (store === live) revision += 1;
  draw();
  return store.count;
});
ui.action('counter.read', { description: 'The count.', result: { kind: 'int' }, effect: 'read_only' }, () => store.count);
ui.action('counter.fail', { description: 'Throw.', effect: 'idempotent_write' }, () => { throw new Error('the counter is broken'); });
</script></body></html>
```

## The test

The test holds the page to the conformance suite itself. It listens on a Unix
socket, runs `ui-conformance --json-lines` against it, and answers each call
as a host in JavaScript does: an observation through the hold around a
capture, and every other call with `hostAnswer`. So the offer, observation,
action, input and history claims a live run makes are all made of the page and
its host, in WebKitGTK and in headless Chromium, and none of them is ported.
Then it holds what the suite cannot see, through the same host:

1. The page holds to the suite: `0 broken`, and the four `ui/act` claims, the
   caller's `counter.bump` among them, hold rather than going unreachable.
2. An action declared with no class is offered as `non_idempotent`.
3. Arguments that misfit never reach the action: the count is unchanged.
4. An action that throws answers `failed` with its message.
5. `invoke` names the frame of the first page state rendered after the
   action: an observation made at once names the same frame, and its layout
   shows the new count.
6. A page whose content security policy forbids WebAssembly holds to the
   suite: the answer page with a policy whose `script-src` has no
   `'wasm-unsafe-eval'`. The page's own script first tries a compile, and the
   claim is made only where the engine refused it, so the policy is in force.
   Chromium refuses it. WebKitGTK 2.50 compiles it under that policy, though
   it refuses `eval`, so there the claim cannot be seen and is skipped by
   name.
7. The script a host injects holds no WebAssembly.
8. A page that gives `present` and `release` says it takes fixtures, and while
   a fixture stands an observation shows it: the frame `present` named, the
   fixture's count drawn, its state, and its handle as what the frame shows.
   The declaration still answers the live state and its head meanwhile.
9. `release` names the frame of the first page state rendered after it: an
   observation made at once names the same frame, shows the live count and
   says `live`, and its state part is the one read before the fixture. A
   second release answers that the fixture does not stand.
10. The page's own code hears the fixture stand and end, and `fixture()` names
    it while it stands.
11. A fixture the page ends itself, `ui.endFixture(reason)`: the page shows its
    live state and its own code hears the fixture end, `fixtureEnded` answers
    the reason for that handle and nothing for another, and a `release` of it
    answers `ended` with the reason.
12. A page that does not give both hooks takes no fixtures, and the library
    refuses a `present` to it by name.

The fixture claims call the library's `present` and `release` on its global,
as a host does once its checks pass. A host in JavaScript makes no fixture
checks, so its offer does not name `ui/history`, and the suite holds that a
`present` to it is refused by name.

The engines are WebKitGTK composited and Chromium at a ratio of 1, the hold's
own; `HOLD_ENGINES` narrows them as in the other tests.

<a name="chunk-answer-test-file"></a><sub>`tests/answer.test.ts` · `#answer-test-file` · assembles [answer-test-page](#chunk-answer-test-page) · [answer-test-strict](#chunk-answer-test-strict) · [answer-test-unpainted](#chunk-answer-test-unpainted)</sub>

```typescript {#answer-test-file file="tests/answer.test.ts"}
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { LayoutNode } from '../src/observation.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ownedTempDir } from '../../../../tools/owned-process.mjs';
import { pageScript } from '../src/page-script.ts';
import { chromium } from './hosts/chromium.ts';
import type { Engine } from './hosts/engine.ts';
import { hostAnswer, suite } from './hosts/suite.ts';
import { webkitgtk } from './hosts/webkitgtk.ts';

const ANSWER_PAGE = fileURLToPath(new URL('./answer-page.html', import.meta.url));
/** A policy that runs the page's own inline script and forbids WebAssembly. */
const NO_WASM = `default-src 'self'; script-src 'self' 'unsafe-inline'`;
/** What the page's own script records of a compile under its policy:
 * `compiled` or `refused`, at `window.compiledUnderPolicy`. */
const OWN_COMPILE = `<script>window.compiledUnderPolicy = 'pending';
WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]))
  .then(() => { window.compiledUnderPolicy = 'compiled'; }, () => { window.compiledUnderPolicy = 'refused'; });</script>`;
/** The answer page under `NO_WASM`, written beside the test's other scratch files. */
const STRICT_PAGE = (() => {
  const page = join(ownedTempDir('x0k-answer-strict-'), 'answer-page-strict.html');
  const policy = `<meta http-equiv="Content-Security-Policy" content="${NO_WASM}">${OWN_COMPILE}`;
  writeFileSync(page, readFileSync(ANSWER_PAGE, 'utf8').replace('<meta charset="utf-8">', `<meta charset="utf-8">${policy}`));
  return page;
})();
const SIZE = { width: 800, height: 500 };
const OFFER = 'ui/observe.offer', OBSERVE = 'ui/observe.observe', INVOKE = 'ui/act.invoke';
/** How long the Tauri plugin waits for the page's answer: a host that hears
 * nothing by then answers that the page did not answer. */
const UNANSWERED_MS = 5000;
/** How soon a hidden page's host refuses a call: the suite's `CANNOT_PAINT_WITHIN`. */
const REFUSED_WITHIN_MS = 1000;
/** The caller's action the suite runs, beside the ones it draws from the offer. */
const ACT = ['counter.bump', '{"by":1}'];
/** Why the answer page ends a fixture itself. */
const ARRIVED = 'an approval arrived for a person';
const ACT_CLAIMS = ['an action the offer does not list is refused', 'arguments that misfit the action\'s shape are refused',
  'a read-only action runs and answers its outcome', 'counter.bump runs and names the frame after it'];

const nodes = (root: LayoutNode): LayoutNode[] => [root, ...root.children.flatMap(nodes)];

const ENGINES: [string, (page: string) => Promise<Engine>][] = [
  ['webkitgtk composited', (page) => webkitgtk(page, pageScript(), { ...SIZE, compositing: true })],
  ['chromium at ratio 1', (page) => chromium(page, pageScript(), { ...SIZE, ratio: 1 })],
];
/** HOLD_ENGINES narrows the run to the engines whose names hold one of its words. */
const only = process.env.HOLD_ENGINES?.split(',');

for (const [name, start] of ENGINES.filter(([name]) => !only || only.some((o) => name.includes(o)))) {
  <<answer-test-page>>
  <<answer-test-strict>>
  <<answer-test-unpainted>>
}

test('the script a host injects holds no WebAssembly', () => {
  assert.doesNotMatch(pageScript(), /WebAssembly\./);
});
```

The host's side is a test host of its own, `tests/hosts/suite.ts`, which the
walk's test holds its pages with too
(`x0k:implementation/ui-control/page-walk`). It loads the checks from the
module cargo built, once. An observation is held, captured and verified, with
the page's `read` for that call as the hold's reader, and its state pinned;
every other call goes through `hostAnswer`, which reaches the page's
`declared` and `run` on its global. A capture the host cannot make, of a
region or at another scale, is refused by the host's reason, and the call's
other parts are answered.

<a name="chunk-suite-host"></a><sub>`tests/hosts/suite.ts` · `#suite-host`</sub>

```typescript {#suite-host file="tests/hosts/suite.ts"}
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { heldCapture } from '../../src/held-capture.ts';
import { type Checks, type PageCalls, hostAnswer as answerAsHost, loadChecks, pinned } from '../../src/host.ts';
import { type ObserveCall, type Observation, observation, wholeCaptureOnly } from '../../src/observation.ts';
import { PAGE_GLOBAL, UI_GLOBAL } from '../../src/page-script.ts';
import { ownedTempDir } from '../../../../../tools/owned-process.mjs';
import type { Engine } from './engine.ts';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const TARGET = process.env.CARGO_TARGET_DIR ?? `${REPO}target`;
/** The suite's program, which `cargo build -p x0k-ui-endpoint --bin ui-conformance` makes. */
export const UI_CONFORMANCE = process.env.UI_CONFORMANCE ?? `${TARGET}/debug/ui-conformance`;
/** The module `cargo build --target wasm32-unknown-unknown -p x0k-ui-protocol-wasm` makes. */
export const CHECKS_WASM = process.env.X0K_UI_PROTOCOL_WASM ?? `${TARGET}/wasm32-unknown-unknown/debug/x0k_ui_protocol_wasm.wasm`;
const OBSERVE = 'ui/observe.observe';

let loaded: Promise<Checks> | undefined;
/** The checks, loaded once for the process. */
function checks(): Promise<Checks> {
  if (!existsSync(CHECKS_WASM)) {
    throw new Error(`${CHECKS_WASM} is not built: tools/build-run -- nix develop ~/src/l30/main -c cargo build --target wasm32-unknown-unknown -p x0k-ui-protocol-wasm`);
  }
  loaded ??= loadChecks(readFileSync(CHECKS_WASM));
  return loaded;
}

/** The page's own answers, on its global. */
function page(engine: Engine): PageCalls {
  const asked = async (body: string) => JSON.parse(await engine.evaluate(`return JSON.stringify(await ${body});`));
  return {
    declared: () => asked(`globalThis.${UI_GLOBAL}.declared()`),
    run: (name, args) => asked(`globalThis.${UI_GLOBAL}.run(${JSON.stringify(name)}, ${JSON.stringify(args)})`),
    cannotPaint: () => asked(`globalThis.${UI_GLOBAL}.cannotPaint()`),
  };
}

/** The answer a host that captures gives to one call. */
export async function hostAnswer(engine: Engine, operation: string, argument: unknown): Promise<any> {
  const with_ = await checks();
  if (operation !== OBSERVE) return answerAsHost(with_, page(engine), operation, argument);
  const call = argument as ObserveCall;
  const held = pinned(with_, await heldCapture({
    hold: async () => JSON.parse(await engine.evaluate(`return JSON.stringify(await globalThis.${PAGE_GLOBAL}.hold(() => globalThis.${UI_GLOBAL}.read(${JSON.stringify(call)})));`)),
    capture: async () => engine.capture(),
    verify: async () => Number(await engine.evaluate(`return String(globalThis.${PAGE_GLOBAL}.verify());`)),
  }));
  const cannot = call.parts.includes('capture') ? wholeCaptureOnly(call) : undefined;
  if (!cannot) return observation(held, call);
  const answered: Observation = observation(held, { ...call, parts: call.parts.filter((part) => part !== 'capture') });
  return { ...answered, refused: [...answered.refused, { part: 'capture', why: cannot }] };
}

/** Run the suite against the page through a JSON-lines socket, and answer
 * its report and whether every claim held. */
export async function suite(engine: Engine, act: string[]): Promise<{ held: boolean; report: string }> {
  const socket = join(ownedTempDir('x0k-answer-'), 'suite.sock');
  const server = createServer((link) => {
    const lines = createInterface({ input: link });
    lines.on('line', async (line) => {
      const { id, operation, argument } = JSON.parse(line);
      const answered = await hostAnswer(engine, operation, argument).then((answer) => ({ id, answer }), (e) => ({ id, fault: String(e) }));
      link.write(`${JSON.stringify(answered)}\n`);
    });
  });
  await new Promise<void>((done) => server.listen(socket, done));
  try {
    return await new Promise((done, fail) => execFile(UI_CONFORMANCE, ['--json-lines', socket, ...act], { maxBuffer: 1 << 24 }, (e, stdout, stderr) => {
      if (e && e.code !== 1) fail(new Error(`${UI_CONFORMANCE} could not judge the page: ${stderr || e.message}`));
      else done({ held: !e, report: stdout });
    }));
  } finally {
    server.close();
  }
}
```

The page's claims, in one engine:

<a name="chunk-answer-test-page"></a><sub>`src/answer.ts` · `#answer-test-page` · assembles [answer-test-fixture](#chunk-answer-test-fixture) · [answer-test-no-fixtures](#chunk-answer-test-no-fixtures)</sub>

```typescript {#answer-test-page}
describe(`the answer page in ${name}`, () => {
  let engine: Engine;
  before(async () => {
    engine = await start(ANSWER_PAGE);
    await sleep(300);
  });
  after(async () => { await engine?.close(); });

  test('the page holds to the conformance suite', async (t) => {
    const { held, report } = await suite(engine, ACT);
    t.diagnostic(report.trim());
    assert.ok(held, report);
    for (const claim of ACT_CLAIMS) assert.match(report, new RegExp(`holds +§9 ${claim}`), report);
  });
  test('an action declared with no class is non_idempotent', async () => {
    const offer = await hostAnswer(engine, OFFER, {});
    const bump = offer.actions.find((a: any) => a.name === 'counter.bump');
    assert.equal(bump?.side_effect, 'non_idempotent', JSON.stringify(offer.actions));
  });
  test('arguments that misfit never reach the action', async () => {
    const count = async () => (await hostAnswer(engine, OBSERVE, { parts: ['state'] })).state.value.count;
    const was = await count();
    const answered = await hostAnswer(engine, INVOKE, { action: 'counter.bump', args: { by: 'two' } });
    assert.equal(answered.refused?.code, 'misfit_arguments', JSON.stringify(answered));
    assert.equal(await count(), was);
  });
  test('an action that throws answers failed with its message', async () => {
    const answered = await hostAnswer(engine, INVOKE, { action: 'counter.fail', args: null });
    assert.equal(answered.failed?.reason, 'the counter is broken', JSON.stringify(answered));
    assert.ok(answered.failed.frame, JSON.stringify(answered));
  });
  <<answer-test-fixture>>
  test('invoke names the frame of the first page state rendered after the action', async () => {
    const answered = await hostAnswer(engine, INVOKE, { action: 'counter.bump', args: { by: 2 } });
    const seen = await hostAnswer(engine, OBSERVE, { parts: ['layout', 'state'] });
    const label = nodes(seen.layout).find((n) => n.id === 'count')?.label;
    assert.equal(seen.frame, answered.done?.frame, JSON.stringify({ answered, frame: seen.frame }));
    assert.equal(label, `count ${answered.done.result}`);
    assert.equal(seen.state.value.count, answered.done.result);
  });
  <<answer-test-no-fixtures>>
});
```

The fixture claims. The fixture is the live count raised by 40, so the
fixture and the live state differ in what is drawn, in the state part and in
its head. A page that takes no fixture is the last claim, since it installs
the page afresh.

<a name="chunk-answer-test-fixture"></a><sub>`src/answer.ts` · `#answer-test-fixture`</sub>

```typescript {#answer-test-fixture}
  const asked = async (expression: string) => JSON.parse(await engine.evaluate(`return JSON.stringify(await globalThis.__x0kUi.${expression});`));
  const drawn = (seen: any) => nodes(seen.layout).find((n) => n.id === 'count')?.label;
  let live: any, handle: string;
  test('while a fixture stands, an observation shows it and the declaration keeps the live state', async () => {
    live = await hostAnswer(engine, OBSERVE, { parts: ['layout', 'state'] });
    assert.equal((await asked('declared()')).fixtures, true);
    const count = live.state.value.count + 40;
    const presented = await asked(`present({ count: ${count} })`);
    handle = presented.presented?.handle;
    assert.ok(handle, JSON.stringify(presented));
    const seen = await hostAnswer(engine, OBSERVE, { parts: ['layout', 'state'] });
    assert.deepEqual(seen.shown, { kind: 'fixture', handle });
    assert.equal(seen.frame, presented.presented.frame);
    assert.equal(drawn(seen), `count ${count}`);
    assert.equal(seen.state.value.count, count);
    assert.notEqual(seen.state.head, live.state.head);
    const during = (await asked('declared()')).state;
    assert.deepEqual([during.value, during.head], [live.state.value, live.state.head]);
  });
  test('release names the frame of the first page state rendered after it, showing the live state', async () => {
    const released = await asked(`release(${JSON.stringify(handle)})`);
    const seen = await hostAnswer(engine, OBSERVE, { parts: ['layout', 'state'] });
    assert.equal(seen.frame, released.released?.frame, JSON.stringify({ released, frame: seen.frame }));
    assert.deepEqual(seen.shown, { kind: 'live' });
    assert.equal(drawn(seen), `count ${live.state.value.count}`);
    assert.deepEqual(seen.state, live.state);
    assert.deepEqual(await asked(`release(${JSON.stringify(handle)})`), { not_standing: { handle } });
  });
  test('the page\'s own code hears a fixture stand and end', async () => {
    const heard = JSON.parse(await engine.evaluate('return JSON.stringify(window.fixturesHeard);'));
    assert.deepEqual(heard, [handle, null]);
    assert.equal(await asked('fixture()'), null);
  });
  test('a fixture the page ends itself shows the live state, is heard ended, and its release names why', async () => {
    const ended = (await asked(`present({ count: ${live.state.value.count + 7} })`)).presented?.handle;
    assert.ok(ended);
    assert.equal(await asked(`fixtureEnded(${JSON.stringify(ended)})`), null, 'a fixture that stands has not ended');
    await engine.evaluate(`await window.approvalArrives(${JSON.stringify(ARRIVED)}); return 'ok';`);
    assert.equal(await asked('fixture()'), null);
    const seen = await hostAnswer(engine, OBSERVE, { parts: ['layout', 'state'] });
    assert.deepEqual(seen.shown, { kind: 'live' });
    assert.equal(drawn(seen), `count ${live.state.value.count}`);
    assert.deepEqual(JSON.parse(await engine.evaluate('return JSON.stringify(window.fixturesHeard.slice(-2));')), [ended, null]);
    assert.equal(await asked(`fixtureEnded(${JSON.stringify(ended)})`), ARRIVED);
    assert.equal(await asked(`fixtureEnded(${JSON.stringify(handle)})`), null, 'a fixture released, not ended');
    assert.deepEqual(await asked(`release(${JSON.stringify(ended)})`), { ended: { handle: ended, reason: ARRIVED } });
  });
```

The page that takes none:

<a name="chunk-answer-test-no-fixtures"></a><sub>`src/answer.ts` · `#answer-test-no-fixtures`</sub>

```typescript {#answer-test-no-fixtures}
  test('a page that does not give both hooks takes no fixtures', async () => {
    const reinstall = `globalThis.__x0kUi.install({ app: 'answer page', state: { shape: { kind: 'int' }, read: () => 0, release: () => {} } });`;
    await engine.evaluate(`${reinstall} return 'ok';`);
    const declared = JSON.parse(await engine.evaluate('return JSON.stringify(globalThis.__x0kUi.declared());'));
    assert.equal(declared.fixtures, false);
    const presented = JSON.parse(await engine.evaluate('return JSON.stringify(await globalThis.__x0kUi.present(0));'));
    assert.equal(presented.refused?.code, 'no_fixtures', JSON.stringify(presented));
  });
```

The policy claim, in the same engine:

<a name="chunk-answer-test-strict"></a><sub>`src/answer.ts` · `#answer-test-strict`</sub>

```typescript {#answer-test-strict}
describe(`the answer page forbidding WebAssembly in ${name}`, () => {
  let engine: Engine;
  before(async () => {
    engine = await start(STRICT_PAGE);
    await sleep(300);
  });
  after(async () => { await engine?.close(); });

  test('a page whose policy forbids WebAssembly holds to the suite', async (t) => {
    const compiled = await engine.evaluate('return window.compiledUnderPolicy;');
    if (compiled === 'compiled') return t.skip(`${name} compiles WebAssembly under a policy that forbids it, so the claim cannot be seen in it`);
    assert.equal(compiled, 'refused', `the page's own compile is ${compiled}`);
    const { held, report } = await suite(engine, ACT);
    t.diagnostic(report.trim());
    assert.ok(held, report);
    for (const claim of ACT_CLAIMS) assert.match(report, new RegExp(`holds +§9 ${claim}`), report);
  });
});
```

The claims of a page that cannot paint, and of one that declines, run in a
page of their own, since hiding a page leaves its engine changed. The page is
hidden by the engine's own means (`x0k:implementation/ui-control/page-hold`,
"The engines"): a tab opened in front of it in Chromium, and its window
unmapped in WebKitGTK. Each claim of a hidden page is timed against the Tauri
plugin's 5 s wait for an answer, so a library that waits on a frame that never
comes reads as `did not answer within 5000 ms`, and each must answer within
the suite's second.

13. While the page is hidden, it says it cannot paint, and why.
14. While it is hidden, an observation refuses its capture as `cannot_paint`
    within a second, and answers its layout and its state.
15. While it is hidden, its host refuses an action as `cannot_paint` within a
    second, and the action never runs.
16. A wait already running when the page becomes hidden ends then, saying
    why: the settle after input, kept busy by events until it is hidden.
17. Shown again, the page paints, and an observation answers its capture.
18. A `present` the page declines answers `declined`, with the page's reason,
    and no fixture stands. Its `declines` answers the same reason for an
    action, and nothing once the approval no longer waits.
19. A `present` hook that throws anything but a decline throws to its host,
    which answers `misfit_state`.

<a name="chunk-answer-test-unpainted"></a><sub>`src/answer.ts` · `#answer-test-unpainted`</sub>

```typescript {#answer-test-unpainted}
describe(`the answer page hidden, and declining, in ${name}`, () => {
  let engine: Engine;
  before(async () => {
    engine = await start(ANSWER_PAGE);
    await sleep(300);
  });
  after(async () => { await engine?.close(); });
  const asked = async (expression: string) => JSON.parse(await engine.evaluate(`return JSON.stringify(await globalThis.__x0kUi.${expression});`));
  const count = async () => (await asked('declared()')).state.value.count;
  /** `answer`, and how long it took, or a failure once the plugin's wait has run out. */
  const timed = async <T>(answer: Promise<T>) => {
    const started = performance.now();
    const unanswered = sleep(UNANSWERED_MS).then(() => { throw new Error(`did not answer within ${UNANSWERED_MS} ms`); });
    const answered = await Promise.race([answer, unanswered]);
    return { answered, ms: performance.now() - started };
  };

  test('while the page is hidden, it says it cannot paint, and why', async () => {
    await engine.hide();
    const { answered, ms } = await timed(asked('cannotPaint()'));
    assert.match(String(answered), /hidden/);
    assert.ok(ms < REFUSED_WITHIN_MS, `answered in ${ms.toFixed(0)} ms`);
  });
  test('while the page is hidden, an observation refuses its capture as cannot_paint at once, and keeps its layout and state', async () => {
    const { answered: seen, ms } = await timed(hostAnswer(engine, OBSERVE, { parts: ['capture', 'layout', 'state'] }));
    assert.deepEqual(seen.refused.map((r: any) => [r.part, r.code]), [['capture', 'cannot_paint']], JSON.stringify(seen.refused));
    assert.equal(seen.capture, undefined);
    assert.ok(seen.layout && seen.state, JSON.stringify(seen));
    assert.ok(ms < REFUSED_WITHIN_MS, `answered in ${ms.toFixed(0)} ms`);
  });
  test('while the page is hidden, its host refuses an action as cannot_paint at once, and the action never runs', async () => {
    const was = await count();
    const { answered, ms } = await timed(hostAnswer(engine, INVOKE, { action: 'counter.bump', args: { by: 1 } }));
    assert.deepEqual([answered.refused?.code, answered.refused?.subject], ['cannot_paint', 'counter.bump'], JSON.stringify(answered));
    assert.equal(await count(), was, 'the action ran');
    assert.ok(ms < REFUSED_WITHIN_MS, `answered in ${ms.toFixed(0)} ms`);
  });
  test('a wait already running when the page becomes hidden ends then, saying why', async () => {
    await engine.show();
    await sleep(300);
    const busy = `const busy = setInterval(() => dispatchEvent(new Event('pointermove')), 5);
      try { return JSON.stringify({ why: (await globalThis.__x0kUiHold.settled()) ?? null }); } finally { clearInterval(busy); }`;
    const settling = timed(engine.evaluate(busy));
    await sleep(200);
    await engine.hide();
    const { answered } = await settling;
    assert.match(JSON.parse(answered).why ?? 'settled, saying nothing', /hidden/);
  });
  test('shown again, the page paints, and an observation answers its capture', async () => {
    await engine.show();
    await sleep(300);
    assert.equal(await asked('cannotPaint()'), null);
    const seen = await hostAnswer(engine, OBSERVE, { parts: ['capture', 'layout'] });
    assert.ok(seen.capture && seen.refused.length === 0, JSON.stringify(seen.refused));
  });
  test('a present the page declines answers declined with its reason, and no fixture stands', async () => {
    await engine.evaluate('window.approvalWaiting = true; return "ok";');
    const presented = await asked('present({ count: 7 })');
    assert.deepEqual(presented, { refused: { code: 'declined', subject: 'ui/history', why: 'an approval waits for a person' } });
    assert.equal(await asked('fixture()'), null);
    assert.equal(await asked(`declines({ kind: 'invoke', action: 'counter.bump' })`), 'an approval waits for a person');
    await engine.evaluate('window.approvalWaiting = false; return "ok";');
    assert.equal(await asked(`declines({ kind: 'invoke', action: 'counter.bump' })`), null);
  });
  test('a present hook that throws anything but a decline throws to its host', async () => {
    await assert.rejects(asked('present({ count: -1 })'), /the page shows no negative count/);
    assert.equal(await asked('fixture()'), null);
  });
});
```

## Running it

From the repository root, in the dev shell, with the package's dependencies
installed, the suite's program and the protocol's module built:

```
npm ci --prefix substrate/apps/ui-control-page
tools/build-run -- nix develop /home/lsp/src/l30/main -c cargo build -p x0k-ui-endpoint --bin ui-conformance
tools/build-run -- nix develop /home/lsp/src/l30/main -c cargo build --target wasm32-unknown-unknown -p x0k-ui-protocol-wasm
nix develop /home/lsp/src/l30/main -c node --test substrate/apps/ui-control-page/tests/answer.test.ts
```

The answer and walk tests' host loads the module; the page never does, so the
probe test needs only the script `pageScript` bundles.

## What the test shows

Measured on arca with WebKitGTK 2.50.4 and Chromium 148, in one run of all
three of the library's tests: the answer, probe and walk tests, 74 of 74
claims hold. On the answer page the suite reported `26 claims, 0 broken` in
both engines. One claim is unreachable, as on every app without a witness:
that the app's work joins the caller's trace. The four `ui/act` claims hold,
the caller's `counter.bump` among them, and so do `ui/input` and `ui/history`
refused by name, the state part, and observing changes nothing. The walk's
pages, the walk page and 0k.computer, hold to the same suite with no claim
broken.

The script a host injects is 52 KB and holds no WebAssembly. Measured on arca
in one run of the three tests with the page's checks moved to its host: 84 of
85 pass and one is skipped by name, the policy claim in WebKitGTK, which
compiles WebAssembly under a policy that forbids it. In Chromium the answer
page under that policy reports `26 claims, 0 broken`, as it does with no
policy in both engines.

Each mutation below, made in this chapter or the walk's, tangled and run in
both engines, turns the test red for its own reason:

| The library with | What goes red | Seen |
|---|---|---|
| an undeclared class taken as `idempotent_write` | claim 2 | `+ 'idempotent_write'` `- 'non_idempotent'` |
| `invoke` running a listed action without the host's checks | claims 1 and 3 | `BROKEN §9 arguments that misfit the action's shape are refused: asked for MisfitArguments, answered Done { result: Null, frame: Some("7") }`; the misfit reached the action: `{"done":{"result":"NaNtwo","frame":"9"}}` |
| `invoke` answering the epoch before a rendering update | claim 5 | the frame named shows the count before the action: `+ 'count 1'` `- 'count 3'` in WebKitGTK, `+ 'count 0'` in Chromium |
| an action that compiles WebAssembly before it runs | claim 6, in Chromium | `BROKEN §9 counter.bump runs and names the frame after it: Failed { reason: "WebAssembly.compile(): Compiling or instantiating WebAssembly module violates the following Content Security policy directive …" }` |
| the bundle carrying `WebAssembly.compile` | claim 7 | `The input was expected to not match the regular expression /WebAssembly\./` |
| bounds not cut, in the walk | the walk's claim 1, both pages | `BROKEN §8 an observation of [Capture, Layout] answers its call: NodeOutsideCapture { id: "bar" }`; on 0k.computer `NodeOutsideCapture { id: "root" }` |

The fixture claims, measured on arca with the same engines in one run of the
three tests: 96 of 97 pass and one is skipped by name, the policy claim in
WebKitGTK as above. The answer page takes fixtures and its JavaScript host
offers no `ui/history`, so the suite still reports `26 claims, 0 broken` and
holds that a `present` to it is refused by name. Over the Tauri plugin's
endpoint, which makes the fixture checks, the same page reaches every fixture
claim of the suite (`x0k:implementation/ui-control/tauri-plugin`, "What is
shown, and what is open"). Each mutation below, tangled and run in both
engines, turns its claim red for its reason:

| The library with | What goes red | Seen |
|---|---|---|
| `read` answering the live state while a fixture stands | claim 8 | the fixture's count: `actual: 1, expected: 41` |
| the declaration answering what is shown, not the live state kept | claim 8 | `actual: [ { count: 41 }, 'r1' ], expected: [ { count: 1 }, 'r1' ]` |
| `release` answering before a rendering update | claim 9 | the frame named precedes the live state's: `actual: '11', expected: '10'` |
| fixtures taken with a `release` hook alone | claim 12 | `actual: true, expected: false` |

Claims 13 to 19, the page that cannot paint and the page that declines,
measured on arca with the same engines. Run first against the library before
it bounded its waits, each was red: an observation and an action of the
hidden page each failed `did not answer within 5000 ms`, in WebKitGTK and in
Chromium; the others failed because `cannotPaint`, `settled` and
`ui.decline` did not exist. With the library as it is, all 14 hold. A hidden
page's observation refused its capture as `cannot_paint` in 23 ms in
WebKitGTK and 36 ms in Chromium, keeping its layout and state, and its action
was refused in 13 ms and 35 ms, the count unchanged. A settle kept busy by
events ended within 0.3 s of the page being hidden, saying why. The whole
library suite, the answer, probe and walk tests: 110 of 111 pass and one is
skipped by name, the policy claim in WebKitGTK.

Claim 11, a fixture the page ends itself, measured on arca with the same
engines in one run of the three tests, alone on the host: 112 of 113 pass
and one is skipped by name, the policy claim in WebKitGTK. With `endFixture`
keeping no reason, it is red in both engines: `fixtureEnded` answers `null`
for `'an approval arrived for a person'`. Over the Tauri plugin's endpoint the
same page reaches the suite's three claims of an app that ends a fixture
(`x0k:implementation/ui-control/tauri-plugin`).

## What is open

- The page's end of a session: `x0k-operation-wire` in WebAssembly as the
  callee beside the page, the dial-out over the WebSocket carrier, and its
  ticket (webview §6). That callee will answer as a host does, from what the
  page declares.
- 0k.computer declares no actions and no state yet; it answers with an empty
  offer.
- A capture of a region, or at another scale, is refused by this test's host.
  The Tauri plugin's host may crop and scale natively.
- A host in JavaScript makes no fixture checks, so `hostAnswer` offers no
  `ui/history` and a page behind it takes no fixture, whatever it declares.
  The Tauri plugin's endpoint makes them
  (`x0k:implementation/ui-control/tauri-plugin`).
- The library keeps the live state as it stood when the first fixture was
  presented. A page whose live state goes on changing behind a fixture, a
  store a poll still writes, say, is answered at that state until the release,
  so a fixture written against the newer head is refused as stale.
- A page holds no past positions, so `navigate` to a position and `history`
  name none.
