# The page's answers: offer, observe and invoke

```turtle folio:document
implementation:ui-control\/page-answer a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "The in-page library's entry: a page installs the library with its app name and its state, declares its named actions, and hands its host what it declared, what it reads and the run of an action, raw. The host makes the protocol's values: the offer, the state part and the checks, with x0k-ui-protocol's page module, natively in a Rust host and through x0k-ui-protocol-wasm in a JavaScript one. The page loads no WebAssembly, so a page whose content security policy forbids it answers every call. A test runs the conformance suite itself against the page in WebKitGTK and headless Chromium, through a JSON-lines link, on a page that allows WebAssembly and on one that forbids it." ;
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
`invoke` as the protocol's values from what the page declared.

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
- The page loads no WebAssembly. A page whose content security policy forbids
  it (`'wasm-unsafe-eval'` absent from `script-src`) answers every call.

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
/** What a page says of itself when it installs the library. */
export interface Declaration {
  app: string;
  state?: { shape: unknown; read: () => unknown; head?: () => string };
  /** How the page's host draws a driver's input over it. */
  look?: InputLook;
}
/** The page's handle on the library. */
export interface Ui {
  /** Declare the action `name`, run by `run` with its arguments. */
  action(name: string, spec: ActionSpec, run: (args: any) => unknown): Ui;
  /** The page's word that it changed in a way the library cannot see. */
  changed(): void;
}
/** An action as the offer lists it. */
export interface Offered { name: string; description: string; args: unknown; result: unknown; side_effect: SideEffect }
/** What a page declares of itself: `x0k-ui-protocol`'s `page::Declared`. */
export interface Declared { app: string; instance: string; actions: Offered[]; state?: DeclaredState }
/** The run of an action: its outcome and the frame after it. */
export type Ran = { done: { result: unknown; frame: string } } | { failed: { reason: string; frame: string } };
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
  /** The observation of `call` a host's hold around its capture makes. */
  observation(held: HeldCapture<PinnedRead, Png>, call: ObserveCall): Observation;
  /** Why a host that captures the whole page at its own scale cannot answer
   * `call`'s capture, when it cannot. */
  wholeCaptureOnly(call: ObserveCall): string | undefined;
}

/** An action as the offer lists it, and the function that runs it. */
interface Kept { offered: Offered; run: (args: any) => unknown }

const UNDECLARED_EFFECT: SideEffect = 'non_idempotent';
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

<a name="chunk-answers"></a><sub>`src/answer.ts` · `#answers`</sub>

```typescript {#answers}
const instanceId = () => `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** The library's answers in `win`, beside its hold and its walk. */
export function installAnswers(win: Window, hold: Hold, walk: Walk): Answers {
  let declaration: Declaration = { app: win.location.host || win.document.title || 'page' };
  const actions = new Map<string, Kept>();
  const instance = instanceId();

  const stateNow = (): DeclaredState | undefined => {
    const state = declaration.state;
    return state && { shape: state.shape, value: state.read() ?? null, head: state.head?.() };
  };
  const declared = (): Declared => ({ app: declaration.app, instance, actions: [...actions.values()].map(({ offered }) => offered), state: stateNow() });
  const read = (call: ObserveCall): PageRead => ({ layout: walk.layout(), state: call.parts.includes('state') ? stateNow() : undefined });
  const rendered = () => new Promise<void>((done) => win.requestAnimationFrame(() => done()));
  const run = async (name: string, args: unknown): Promise<Ran> => {
    let outcome: { result: unknown } | { reason: string };
    try {
      const action = actions.get(name);
      if (!action) throw new Error(`the page declares no action ${name}`);
      outcome = { result: (await action.run(args)) ?? null };
    } catch (e) {
      outcome = { reason: e instanceof Error ? e.message : String(e) };
    }
    await rendered();
    const frame = String(hold.epoch());
    return 'result' in outcome ? { done: { result: outcome.result, frame } } : { failed: { reason: outcome.reason, frame } };
  };

  const ui: Ui = {
    action(name, spec, run_) { actions.set(name, kept(name, spec, run_)); hold.changed(); return ui; },
    changed: () => hold.changed(),
  };
  return {
    install(given) { declaration = given; hold.drawn.look(given.look ?? {}); hold.changed(); return ui; },
    declared,
    read,
    run,
    observation,
    wholeCaptureOnly,
  };
}
```

The file:

<a name="chunk-answer-file"></a><sub>`src/answer.ts` · `#answer-file` · assembles [declare](#chunk-declare) · [answers](#chunk-answers)</sub>

```typescript {#answer-file file="src/answer.ts"}
import type { InputLook } from './drawn-layer.ts';
import type { HeldCapture } from './held-capture.ts';
import type { Hold } from './hold.ts';
import { type DeclaredState, type Observation, type ObserveCall, type PageRead, type PinnedRead, type Png, observation, wholeCaptureOnly } from './observation.ts';
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
}

/** The endpoint's operations a host answers from what the page declares. */
const OFFER = 'ui/observe.offer', INVOKE = 'ui/act.invoke';

/** `held` with the state it read made the protocol's state part. */
export function pinned<C>(checks: Checks, held: HeldCapture<PageRead, C>): HeldCapture<PinnedRead, C> {
  const state = held.read.state && checks.call({ fn: 'state', ...held.read.state });
  return { ...held, read: { layout: held.read.layout, state } };
}

/** The answer to `operation` with `argument` other than an observation, for a
 * page with no endpoint in front of it. */
export async function hostAnswer(checks: Checks, page: PageCalls, operation: string, argument: unknown): Promise<unknown> {
  const offer = checks.call({ fn: 'offer', ...(await page.declared()) });
  if (operation === OFFER) return offer;
  const checked = checks.call({ fn: 'check', operation, argument, offer });
  if ('answer' in checked) return checked.answer;
  if (operation !== INVOKE) throw new Error(`the checks let ${operation} through to a page that does not answer it`);
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
let count = 0;
const shown = document.getElementById('count');
const ui = globalThis.__x0kUi.install({
  app: 'answer page',
  state: { shape: { kind: 'struct', fields: { count: { shape: { kind: 'int' } } } }, read: () => ({ count }) },
});
ui.action('counter.bump', {
  description: 'Raise the count by `by`, and draw it in the next frame.',
  args: { kind: 'struct', fields: { by: { shape: { kind: 'int' } } } },
  result: { kind: 'int' },
}, ({ by }) => {
  count += by;
  requestAnimationFrame(() => { shown.textContent = `count ${count}`; });
  return count;
});
ui.action('counter.read', { description: 'The count.', result: { kind: 'int' }, effect: 'read_only' }, () => count);
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

The engines are WebKitGTK composited and Chromium at a ratio of 1, the hold's
own; `HOLD_ENGINES` narrows them as in the other tests.

<a name="chunk-answer-test-file"></a><sub>`tests/answer.test.ts` · `#answer-test-file` · assembles [answer-test-page](#chunk-answer-test-page) · [answer-test-strict](#chunk-answer-test-strict)</sub>

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
/** The caller's action the suite runs, beside the ones it draws from the offer. */
const ACT = ['counter.bump', '{"by":1}'];
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

<a name="chunk-answer-test-page"></a><sub>`src/answer.ts` · `#answer-test-page`</sub>

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
  test('invoke names the frame of the first page state rendered after the action', async () => {
    const answered = await hostAnswer(engine, INVOKE, { action: 'counter.bump', args: { by: 2 } });
    const seen = await hostAnswer(engine, OBSERVE, { parts: ['layout', 'state'] });
    const label = nodes(seen.layout).find((n) => n.id === 'count')?.label;
    assert.equal(seen.frame, answered.done?.frame, JSON.stringify({ answered, frame: seen.frame }));
    assert.equal(label, `count ${answered.done.result}`);
    assert.equal(seen.state.value.count, answered.done.result);
  });
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

## What is open

- The page's end of a session: `x0k-operation-wire` in WebAssembly as the
  callee beside the page, the dial-out over the WebSocket carrier, and its
  ticket (webview §6). That callee will answer as a host does, from what the
  page declares.
- 0k.computer declares no actions and no state yet; it answers with an empty
  offer.
- A capture of a region, or at another scale, is refused by this test's host.
  The Tauri plugin's host may crop and scale natively.
- `ui/history` and state fixtures (`present`, `release`) are refused: the page
  takes none (webview §5).
