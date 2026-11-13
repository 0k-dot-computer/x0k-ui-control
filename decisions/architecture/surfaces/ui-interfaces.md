
# UI Interfaces

```turtle folio:document
architecture:ui-interfaces a x0k:Architecture ;
    x0k:status "accepted" ;
    x0k:concerns "ui-control", "protocol", "conformance", "introspection", "replay" ;
    x0k:supports design:ui-driver ;
    x0k:motivatedBy intent:6344de4f-dbb9-3302-09f1-f7a05689aa64,
        architecture:core-and-edges,
        architecture:ui-control-channel ;
    x0k:dependsOn architecture:graded-introspection ;
    x0k:mentions architecture:ui-screencast,
        architecture:operation-surface,
        architecture:fleet-streams,
        architecture:value-shapes,
        architecture:service-authorization,
        design:inspect-and-rewind .
```

## Brief

A driver that reaches an app holds up to four interfaces to it. It can look
at the app (`ui/observe`) and run the app's own named actions (`ui/act`). It
can send pointer and key input as a person at the screen would (`ui/input`),
and go back through what the app has shown (`ui/history`). A grant names the
interfaces it holds, so an agent can be allowed to look without pressing
anything, or to look back without acting. Where an app can, a driver may
also record a run of it as a screencast (`ui/screencast`), an interface of its
own because only some apps can.

Going back is for looking. A developer takes an app to the frame before a
bug, sees what was on the screen, and follows that frame's trace ids into the
timeline. The app performs nothing while it shows the past, and it refuses
input to the live surface until it is live again, so nobody acts on a screen
that is not current. A test can also give the app a state to show, such as
the live state with two fields changed, and drive the app in it. Anything the
app would then do to the world is simulated or sent to a sandbox the app
names, never performed against the real target. When the driver's session
ends, the app shows its live state again.

An app that does not speak x0k's endpoint protocol is reached by an edge
that knows its platform. That is the Chrome DevTools Protocol for a browser,
the platform's accessibility API on a desktop, and XCUITest on an iPhone. Every edge
answers the same interfaces and is held to the same conformance suite. A
procedure that needs an interface its target cannot answer is refused before
it runs, never partway through a run.

## Context

`core-and-edges` §2 names the four UI interfaces and the edges by how they
reach an app. `ui-control-channel` decides the endpoint protocol (its §7),
`ui/observe` (its §8), `ui/act` (its §9) and `ui/input` (its §10). Those sections stand,
and this decision restates none of them. In this decision a bare section
number, such as §2, names a section of this decision. It decides what they leave:

- `ui/history`, which needs the decision about effects when going back
  (`graded-introspection` §9);
- state fixtures, a state a driver gives an app to show;
- the offer's fields for introspection grades, replay policy and sandboxes,
  which `graded-introspection` §2 and its open questions leave to the
  protocol's public surface;
- the frame bound, the trace context and the requester on the endpoint, which
  `ui-driver` lists as public surface still to decide;
- which interfaces each edge answers, and how a driver falls back from one
  edge to another;
- the conformance obligation, and refusal at installation.

This decision stands beside `ui-control-channel` instead of inside it because
`ui/history` and state fixtures rest on `graded-introspection` §9, which
awaits the operator's acceptance (intent `4c394ad8`). Kept apart,
`graded-introspection` §9 can change without an edit to an accepted decision.

### Adopted patterns

- **One wire protocol, one driver per platform.** W3C WebDriver defines the
  protocol, and Appium supplies a driver per platform behind it (its XCUITest,
  Mac2 and Chromium drivers). The edges by reach adopt that split: the four
  interfaces are the protocol, and each edge is a driver. The reason is that a
  procedure written once runs on every platform an edge exists for.
- **A history of states, a jump, and a lock.** Redux DevTools keeps a store's
  history of states, jumps to any of them, and can lock changes while a past
  state is shown. `ui/history` adopts the list, the jump and the lock, and the
  lock becomes a refusal by name.
- **JSON Merge Patch** (RFC 7396) spells a state fixture as the live state
  with some fields changed, because a merge patch names only the fields it
  changes.
- **Conditional requests** (RFC 9110 §13.1.1, `If-Match`) let a fixture name
  the state head it was written against, so a patch over a state that has
  since moved is refused.
- **Chain of responsibility** (Gamma, Helm, Johnson and Vlissides, *Design
  Patterns*, 1994) is the fallback between edges: an ordered list of
  handlers, and the first that can answer a call answers it.
- **W3C Trace Context** carries a call's `traceparent` as given, as
  `ui-control-channel` §7 already decides.

Two things are new here. A state fixture is a `vary` trip, so the app's
replay policy decides what its effects do while the fixture stands. A handler
that fails the suite for an interface it claims is refused when it is
installed.

### Terms

- A **history position** is the number an app gives each change of its
  presentable state, increasing with each change. Where the app runs as a
  journaled x0k unit, a history position maps to an execution position
  (`graded-introspection` §4).
- The **shown state** is what an app presents at one time: its live state, a
  past history position, or a state fixture.
- A **state fixture** is a presentable state a driver gives an app to show in
  place of its live state. The word is qualified because a cell's fixtures
  (`cell-substrate`) are test inputs of a cell, a different thing.
- The **fixture mark** is what a host draws over an app's window while a
  state fixture stands (§4).
- A **dev instance** is an instance of an app that the app itself started
  for development, and that its offer says is one (§5).

## Decision

### 1. The UI interfaces, and the side-effect class of each operation

**Decides:** the operations of the four UI interfaces and of `ui/screencast`,
and the side-effect class (`operation-surface` §12) each operation declares.
**Invariants:** every operation of a UI interface declares one side-effect
class; a grant holds an interface whole; a capability only some targets have
is an interface of its own.
**On failure:** a call to an interface the grant does not hold is refused by
name before the app hears it. A call to an interface the offer does not name
is refused by name (`ui-control-channel` §7).
**Checked by:** the per-interface conformance suite (intent 1f4dc28c), §8.

| Interface | Operation | Side-effect class | Decided in |
|---|---|---|---|
| `ui/observe` | `offer` | `read_only` | `ui-control-channel` §8; §5 below adds fields |
| `ui/observe` | `observe` | `read_only` | `ui-control-channel` §8; §3 below adds a field |
| `ui/act` | `invoke` | the class the invoked action declares | `ui-control-channel` §9 |
| `ui/input` | `perform` | `non_idempotent` | `ui-control-channel` §10 |
| `ui/history` | `history` | `read_only` | §2 |
| `ui/history` | `navigate` | `idempotent_write` | §2 |
| `ui/history` | `present` | `idempotent_write` | §4 |
| `ui/history` | `release` | `idempotent_write` | §4 |
| `ui/screencast` | `cast` | the highest class among the run's steps; a run with no steps is `idempotent_write` at the `stepped` clock and `read_only` otherwise | `ui-screencast` §2 |
| `ui/screencast` | `frames` | `read_only` | `ui-screencast` §2 |
| `ui/screencast` | `discard` | `idempotent_write` | `ui-screencast` §2 |

`navigate` is a write although its purpose is `inspect` and it performs
nothing in the world. It changes what the app shows, and while a past
position is shown the app refuses a person's input (§2). So an agent holding
`ui/observe` alone cannot freeze the screen of a person using the app. Each
call names where to go, so calling it twice leaves the app where calling it
once does.

`ui/screencast` is an interface of its own because only some apps can make a
screencast (`ui-screencast` §3), and a step of its run needs the interface
that step's operation belongs to (`ui-screencast` §2). A stepped `cast` with
no steps is a write for the reason `navigate` is one: it holds the app's
clock, so what a person sees stops moving while it plays.

The narrow extras `core-and-edges` §2 names (`web/network` for a browser,
`device/lifecycle` and `device/orientation` for a phone) are interfaces of
their own, each with its operations, their classes and its part of the suite.
This decision does not decide their operations.

### 2. `ui/history` shows a past state and performs nothing

> **Rests on `graded-introspection` §9.** This section applies its purposes
> and floors and decides nothing about them; a change there rewrites this
> section and leaves the others as they stand.

**Decides:** what `ui/history` lists, how a driver takes an app to a past
history position and back, and what the app refuses while it shows one.
**Invariants:**

- navigating performs no effect outside the app's own presentation
  (`graded-introspection` §9, first floor: `inspect` performs nothing);
- the app shows one shown state at a time;
- the app's history records changes to its live state only, and never records
  a past position or a state fixture it shows as a new position;
- while a past position is shown, the app refuses every `ui/input` call and
  every `ui/act` action whose class is above `read_only`;
- when a session ends, the app returns to its live state if that session
  changed what it shows;
- a `history` answer holds no more positions than the limit its call gives.

**On failure:** a navigation to a position the app no longer holds is refused
as unavailable at the app's grade, naming the oldest position it does hold
(`graded-introspection` §2). A navigation to a position the app never had is
refused by name. Input and actuating actions while a past position is shown
are refused as `showing_past`, naming the position, before the app runs
anything.
**Checked by:** the `ui/history` vectors of the conformance suite (intent
1f4dc28c), among them that a navigation to a past position performs no effect
and that input while it is shown is refused.

`ui/history` has two operations of its own here, and the two of §4:

- **`history`** takes an optional range of positions, a limit, and whether to
  include each position's state. It answers the oldest and the newest position
  the app holds, the shown state, and the positions in the range, newest
  first. Each position has its number, its time and the descriptions of the
  changes that made it. It has the trace and span ids active when the app
  recorded it, the grade it is answered at, and its state when asked. A
  driver finds the event that caused a state by querying the timeline for
  those trace ids.
- **`navigate`** takes a position or `live`. The app shows the state at that
  position and answers the first frame it presented showing it. `live`
  returns the app to its live state. A relative step, such as three back, is
  the driver's arithmetic over `history`.

A position is answered at the grade of what the app still holds for it
(`graded-introspection` §2). A position whose state the app holds is
`captured` and can be shown. A position the app has dropped but whose trace
ids it kept is `emitted`, and `navigate` to it is refused as unavailable at
that grade.

The app's live state keeps changing while a past position is shown, and
returning to `live` shows where it stands then. A `read_only` action runs as
it does when the app is live.

Driving onward from a past position is a `continue` fork
(`graded-introspection` §9): a new
instance of the app, started at that position, with its own endpoint and its
own offer. The live app never goes back.

<a name="folio-instance-78306b3a6f70656e2d7175657374696f6e2f636f6e74696e75652d66726f6d2d612d75692d706f736974696f6e-1"></a><sub data-instance-iri="x0k:open-question/continue-from-a-ui-position" data-concept-iri="https://0k.computer/ontology#OpenQuestion" data-source-document="corpora/x0k/decisions/architecture/surfaces/ui-interfaces.md"><strong>OpenQuestion</strong> · Unresolved instance · <code>x0k:open-question/continue-from-a-ui-position</code> · <a href="#folio-source-78306b3a6f70656e2d7175657374696f6e2f636f6e74696e75652d66726f6d2d612d75692d706f736974696f6e-1">source declaration</a> · the graph block at line 226 is not Turtle: The prefix open-question: has not been declared at corpora/x0k/decisions/architecture/surfaces/ui-interfaces.md:225</sub><a name="folio-source-78306b3a6f70656e2d7175657374696f6e2f636f6e74696e75652d66726f6d2d612d75692d706f736974696f6e-1"></a>

```turtle folio:graph
@prefix open-question: <https://0k.computer/ontology#open-question/> .
open-question:continue-from-a-ui-position a x0k:OpenQuestion ;
    x0k:text "How does a driver ask for a new instance of an app started at a past history position?" ;
    x0k:description """A continue fork is a new instance with its own endpoint and offer. Whether the driver asks the live app over ui/history, asks the app's host, or asks the daemon is undecided, and so is how the offer says an app can be forked. It needs an app whose state is a value and whose effects are journaled, so only an app offering the captured and recorded grades can answer it.""" ;
    x0k:status "open" .
```

<a name="folio-instance-78306b3a746563686e652f73686f772d612d706173742d75692d7374617465-2"></a><sub data-instance-iri="x0k:techne/show-a-past-ui-state" data-concept-iri="https://0k.computer/ontology#Techne" data-source-document="corpora/x0k/decisions/architecture/surfaces/ui-interfaces.md"><strong>Techne</strong> · Unresolved instance · <code>x0k:techne/show-a-past-ui-state</code> · <a href="#folio-source-78306b3a746563686e652f73686f772d612d706173742d75692d7374617465-2">source declaration</a> · the graph block at line 226 is not Turtle: The prefix open-question: has not been declared at corpora/x0k/decisions/architecture/surfaces/ui-interfaces.md:225</sub><a name="folio-source-78306b3a746563686e652f73686f772d612d706173742d75692d7374617465-2"></a>

```turtle folio:graph
@prefix techne: <https://0k.computer/ontology#techne/> .
techne:show-a-past-ui-state a x0k:Techne ;
    x0k:status "proposed" .
```

### 3. An observation names what its frame shows

**Decides:** one field of the answer `observe` gives (`ui-control-channel`
§8).
**Invariants:** every observation names its shown state: `live`, a past
position by its number, or a state fixture by its handle; every part of the
observation comes from that shown state, as every part comes from one frame
(`ui-control-channel` §8).
**On failure:** an observation that does not name its shown state is broken
under the suite; a driver never assumes `live` for it.
**Checked by:** the `ui/observe` vectors of the conformance suite (intent
1f4dc28c).

An app that does not offer `ui/history` always shows its live state, and its
observations say `live`. This field adds to the answer the accepted
`ui-control-channel` §8 decides, so accepting this decision accepts the addition.

### 4. A state fixture shows a state the driver gives

> **Rests on `graded-introspection` §9.** It applies that section's `vary`
> purpose and its fourth floor; a change there rewrites this section.

**Decides:** how a driver has an app show a state the driver gives, and what
the app's effects do while that state is shown.
**Invariants:**

- a state fixture never changes the app's live state, and releasing it shows
  the live state as it stands then;
- the app checks a fixture against the shape fingerprint the call names
  before it shows anything;
- one state fixture stands at a time, and a `present` or a `navigate` while
  one stands replaces it;
- while a fixture stands, the trip's purpose is `vary`, so the app's replay
  policy for `vary` answers each effect that leaves the app's own state;
- no effect under a fixture is a `non_idempotent` effect against a real
  target (`graded-introspection` §9, fourth floor);
- the app may end a fixture that stands itself, for a reason it gives, and
  then shows its live state; the session that presented it is told why
  before any call it makes under that fixture runs against the live state;
- when the session that presented a fixture ends, the app releases it;
- while a state fixture stands, the app's host draws the fixture mark over
  the window, outside the app's frame, layout and state, as it draws a
  driver's input (`ui-control-channel` §10), so a capture of the frame alone
  does not show it;
- a `present` may ask for `mark: false`; a dev instance (§5) honours it, and
  any other instance refuses it.

**On failure:** each of these is refused by name before the app shows
anything:

- a fingerprint that differs from the app's state shape, naming both;
- a patch whose result does not fit the shape, naming the place
  (`value-shapes`);
- a call naming a head the live state has moved past, naming the current
  head;
- `present` to an app whose offer does not say it takes state fixtures;
- `present` asking `mark: false` of an instance that is not a dev instance,
  as `mark_required`.

The app may decline a `present`, and while a fixture stands an `invoke` or a
`perform`, for now and with the reason it gives, such as an approval that
waits for a person. It refuses the call as `declined` before it shows or runs
anything, because the state fits and the app's own condition refuses it.
`release` of a handle that does not stand answers that it does not stand.

The app may also end a fixture that stands, for the reason it gives, such as
an approval that arrives for a person, since a fixture never stands over an
approval. It shows its live state again, as after a `release`. The session
that presented the fixture learns this on its next call. An observation names
`live` as its shown state (§3). The session's next `invoke` or `perform` is
refused as `fixture_ended` before anything runs, naming the handle and the
app's reason, and its later calls run against the live state. A `release` of
that handle answers that the app ended it, with the reason, not that it does
not stand. While the fixture stood, the replay policy's `vary` column
answered the driver's effects; once the app ends it, nothing answers them
that way, so the first call the driver made expecting it is refused rather
than performed against the live state. A session that ends after the app
ended its fixture has nothing left to release.
**Checked by:** the `ui/history` vectors of the conformance suite (intent
1f4dc28c), among them that presenting and releasing a fixture leaves the live
state head where it was, and that after the app ends a fixture its
observation shows `live`, the presenter's next action is refused as
`fixture_ended` with the app's reason, and its `release` names that reason;
that `mark: false` is refused outside a dev instance; and, by the probe
page's ink test, that a capture of the frame alone under a fixture shows no
mark and a capture with the host's drawing shows it.

- **`present`** takes either a full state or a JSON Merge Patch over the live
  state. It also takes the shape fingerprint the driver read with the state
  (`ui-control-channel` §8, the `state` part), and optionally the head it
  read the state at, and may ask for `mark: false`. It answers a fixture
  handle and the first frame presented showing the fixture.
- **`release`** takes the handle and answers the first frame presented
  showing the live state.

`ui/input` and `ui/act` work while a fixture stands, because driving the app
in a given state is what a fixture is for. What they change lands in the
fixture's state. Under the defaults of the `vary` column of
`graded-introspection` §9:

- a `read_only` effect is performed against today's world, since a fixture has
  no record to answer it from;
- an `idempotent_write` effect is sandboxed where the app declares a sandbox
  for it, and otherwise simulated;
- a `non_idempotent` effect is simulated.

A replay policy may refuse any of them instead. Every disposition taken is
traced on the timeline (`graded-introspection` §9;
`ui-control-channel` §3).

**The fixture mark.** A person must never take a fixture for the live screen,
so the host marks the window while one stands. The mark is the host's
drawing, as a driver's input is, and never the app's frame. A recording of
the frame alone, such as a stepped screencast's (`ui-screencast` §5), carries
no mark without removing anything from the app, and the person watching
still sees one. Only a dev instance, which no one's live work runs in, may
leave the mark off what the person sees, so that a recording of what the
person sees shows the app as it will look.

<a name="folio-instance-78306b3a746563686e652f6d61726b2d612d75692d73746174652d66697874757265-3"></a><sub data-instance-iri="x0k:techne/mark-a-ui-state-fixture" data-concept-iri="https://0k.computer/ontology#Techne" data-source-document="corpora/x0k/decisions/architecture/surfaces/ui-interfaces.md"><strong>Techne</strong> · Unresolved instance · <code>x0k:techne/mark-a-ui-state-fixture</code> · <a href="#folio-source-78306b3a746563686e652f6d61726b2d612d75692d73746174652d66697874757265-3">source declaration</a> · the graph block at line 226 is not Turtle: The prefix open-question: has not been declared at corpora/x0k/decisions/architecture/surfaces/ui-interfaces.md:225</sub><a name="folio-source-78306b3a746563686e652f6d61726b2d612d75692d73746174652d66697874757265-3"></a>

```turtle folio:graph
@prefix techne: <https://0k.computer/ontology#techne/> .
techne:mark-a-ui-state-fixture a x0k:Techne ;
    x0k:status "proposed" .
```

<a name="folio-instance-78306b3a746563686e652f70726573656e742d612d75692d73746174652d66697874757265-4"></a><sub data-instance-iri="x0k:techne/present-a-ui-state-fixture" data-concept-iri="https://0k.computer/ontology#Techne" data-source-document="corpora/x0k/decisions/architecture/surfaces/ui-interfaces.md"><strong>Techne</strong> · Unresolved instance · <code>x0k:techne/present-a-ui-state-fixture</code> · <a href="#folio-source-78306b3a746563686e652f70726573656e742d612d75692d73746174652d66697874757265-4">source declaration</a> · the graph block at line 226 is not Turtle: The prefix open-question: has not been declared at corpora/x0k/decisions/architecture/surfaces/ui-interfaces.md:225</sub><a name="folio-source-78306b3a746563686e652f70726573656e742d612d75692d73746174652d66697874757265-4"></a>

```turtle folio:graph
@prefix techne: <https://0k.computer/ontology#techne/> .
techne:present-a-ui-state-fixture a x0k:Techne ;
    x0k:status "proposed" ;
    x0k:dependsOn techne:show-a-past-ui-state .
```

### 5. The offer states grades, history, replay policy, sandboxes, the dev instance and screencasts

**Decides:** the fields the offer (`ui-control-channel` §8) carries so an
app outside x0k's runtimes states how deeply it can be looked into, what
going back does to its effects, whether it runs for development, and how it
keeps time for a screencast.
**Invariants:**

- `grades` lists the introspection grades the app supplies
  (`graded-introspection` §1): `emitted`, `recorded`, `retained`, `captured`,
  `re_executable`;
- `history` is present when the offer names `ui/history`, and holds the oldest
  and newest position the app holds and whether the app takes state fixtures;
- `replay_policy` gives, per side-effect class and per action by name, the
  disposition for `vary` and for `continue` after the cut, in the vocabulary of
  `graded-introspection` §9;
- a class or action the replay policy does not name takes that section's
  default;
- `sandboxes` names each stand-in target the app declares, with the classes
  or actions it serves;
- the offer's instance (`ui-control-channel` §8) says whether it is a dev
  instance, and only the app decides that, when it starts;
- `screencast` is present when the offer names `ui/screencast`, and lists the
  clocks the app answers, its longest screencast in frames and in time, and
  the sources of motion its stepped clock does not step (`ui-screencast` §3);
- no replay policy lowers a floor of `graded-introspection` §9.

**On failure:** the driver's end refuses an offer whose replay policy lowers
a floor as unreadable, naming the entry. One example is `performed` for a
`non_idempotent` effect under `vary`. A `sandboxed` disposition that names no
declared sandbox is refused the same way.
**Checked by:** the offer vectors of the conformance suite (intent 1f4dc28c).

> `replay_policy` and `sandboxes` **rest on `graded-introspection` §9**:
> their vocabulary and floors are that section's.
> `grades` and `history` rest on its §1 and §2.

An edge that reaches an app from outside (§7 below) supplies no grade, so its
offer lists none. An app that only emits traces lists `emitted`: it is an
Emitted unit, and its past is a timeline query.

### 6. The endpoint's frames carry a bound, a trace and a requester

**Decides:** what an outside implementation of the endpoint relies on, beyond
the frames `ui-control-channel` §7 decides.
**Invariants:**

- a frame is the operation wire's (`operation-surface` §1): a four-byte
  big-endian length, then one canonical CBOR map, the same bytes on every
  carrier; on a WebSocket each binary message carries frame bytes;
- an endpoint takes frames up to 10 MiB (10,485,760 bytes) unless its host
  configures a larger bound;
- a call may carry a W3C `traceparent` in its `trace` field, and the app
  answers it as a child of that trace;
- the app knows each call's requester; on a local socket it takes the
  requester from the peer's credentials;
- a call the daemon forwards names its requester in `on_behalf_of`, honoured
  only on the daemon's connection (`operation-surface` §1);
- a `perform` may carry `requester_name`, the name the requester gives
  itself for a person to read, such as Apollo or a person's driver. The
  client sets it on each call that carries it. It is a label and never
  authority: the requester stays the one the peer's credentials or
  `on_behalf_of` name, and the grant, the host's configuration of who
  allows a takeover (`ui-control-channel` §10), a takeover's ask of the
  person and every tier read that requester, never the name. The app may show the name,
  as its host's drawing of input does (`ui-control-channel` §10);

<!-- inferred: the endpoint does not yet read peer credentials, and x0k's shell
grants every class until connections carry their own grants; the requester
items are direction. -->
- an operation's shapes are agreed by fingerprint when a session opens
  (`ui-control-channel` §7), and the protocol has no version number.

**On failure:** a frame over the bound closes the connection it came on, and
the app goes on serving its other connections. An answer part that would put
the answer over the bound is refused, naming the bound, and the other parts
are kept (`ui-control-channel` §8). The driver then asks for a region or a
smaller scale.
**Checked by:** the conformance program's oversized-frame case, run on the
app's socket; the suite's trace claim, which a witness of the app's spans
decides; the `ui/input` vectors, among them that a `requester_name` changes
nothing a check refuses or lets through.

### 7. Edges answer by reach, and fall back call by call

**Decides:** which interfaces each edge answers, and how a driver falls back
from one edge to another.
**Invariants:**

- every edge answers in the capture's pixel coordinates
  (`ui-control-channel` §8), converting from its platform's own;
- an edge that reaches an app from outside answers `offer` on the app's
  behalf, naming only what it can answer for that app;
- one handler answers each call, and the record of the call names it;
- a combinator falls to the next handler only on a refusal saying the
  handler cannot answer: the interface, the operation or the part is not one
  it answers;
- a combinator never falls through on a refusal about the call (outside the
  grant, misfit arguments, an unknown action, `showing_past`), and never once
  a handler may have acted.

**On failure:** a call that no handler in the list can answer is refused with
each handler's refusal, by name.
**Checked by:** each edge runs the suite part of every interface it answers
(§8); a combinator test holds that a refusal about the call does not fall
through.

| Edge | Reaches | `ui/observe` | `ui/input` | `ui/act` | `ui/history` | Extras |
|---|---|---|---|---|---|---|
| `ui-control` | an app that speaks the endpoint protocol: x0k's shell, a desktop app through a source patch, a debug build linked with the library, a web or Tauri app through its shell | as offered | as offered | as offered | as offered | as offered |
| `cdp` | browsers and web pages, over the Chrome DevTools Protocol | capture and layout; no `state` | yes | no | no | `web/network` |
| `accessibility` | the platform's accessibility API, macOS first | capture and layout; no `state` | yes | the platform's element actions | no | none |
| `xcuitest` | iOS apps that do not speak the protocol | capture and layout; no `state` | yes | the platform's element actions | no | `device/lifecycle`, `device/orientation` |

An edge without a presentable state refuses the `state` part by name and keeps
the other parts (`ui-control-channel` §8). A platform's element action, such
as a press through the accessibility API, declares no side-effect class, so the edge offers it as
`non_idempotent`. That is the bias `ui-control-channel` gives an action with
no published spec. A web page that wants named actions or a history speaks the
protocol over a WebSocket (`ui-control-channel` §7) and is reached by
`ui-control`.

Fallback is call by call because one observation comes from one frame
(`ui-control-channel` §8).
For an app that answers actions over the protocol and reports no layout, a
combinator of `ui-control` then `accessibility` answers `invoke` from the
first and a layout from the second. The two answers name different frames,
so a driver that needs a capture and a layout that line up asks one handler
for both.

<a name="folio-instance-78306b3a746563686e652f66616c6c2d6261636b2d6265747765656e2d75692d6564676573-5"></a><sub data-instance-iri="x0k:techne/fall-back-between-ui-edges" data-concept-iri="https://0k.computer/ontology#Techne" data-source-document="corpora/x0k/decisions/architecture/surfaces/ui-interfaces.md"><strong>Techne</strong> · Unresolved instance · <code>x0k:techne/fall-back-between-ui-edges</code> · <a href="#folio-source-78306b3a746563686e652f66616c6c2d6261636b2d6265747765656e2d75692d6564676573-5">source declaration</a> · the graph block at line 226 is not Turtle: The prefix open-question: has not been declared at corpora/x0k/decisions/architecture/surfaces/ui-interfaces.md:225</sub><a name="folio-source-78306b3a746563686e652f66616c6c2d6261636b2d6265747765656e2d75692d6564676573-5"></a>

```turtle folio:graph
@prefix techne: <https://0k.computer/ontology#techne/> .
techne:fall-back-between-ui-edges a x0k:Techne ;
    x0k:status "proposed" .
```

### 8. Every edge is held to its interfaces' suite, and refused at installation if it fails

**Decides:** what holds an edge or an app to the interfaces it claims.
**Invariants:**

- each interface has its own part of the UI-control conformance suite
  (intent 1f4dc28c), driven through that interface alone;
- the `ui-control` edge's part also holds the offer, the frames, the frame
  bound and the trace carriage (§6);
- every edge runs the part of each interface it claims;
- a handler is installed for an interface (`core-and-edges` §5) only with a
  passing run of that interface's part recorded against the handler's pin;
- a procedure that needs an interface its target has no handler for is
  refused when it is installed (`core-and-edges` §2).

**On failure:** a handler that claims an interface it fails is refused at
installation, naming the interface and the claims that broke; the procedure
never runs.
**Checked by:** the suite's own tests, which see it red against a
deliberately broken app before its green counts.

The `ui-control` edge passes its part by its own pin. Each app behind it is
held by the same suite run against the app over its endpoint, which is how an
app in another language shows it speaks the protocol.

<a name="folio-instance-78306b3a6f70656e2d7175657374696f6e2f6e616d696e672d616e2d617070732d636f6e666f726d616e63652d72756e-6"></a><sub data-instance-iri="x0k:open-question/naming-an-apps-conformance-run" data-concept-iri="https://0k.computer/ontology#OpenQuestion" data-source-document="corpora/x0k/decisions/architecture/surfaces/ui-interfaces.md"><strong>OpenQuestion</strong> · Unresolved instance · <code>x0k:open-question/naming-an-apps-conformance-run</code> · <a href="#folio-source-78306b3a6f70656e2d7175657374696f6e2f6e616d696e672d616e2d617070732d636f6e666f726d616e63652d72756e-6">source declaration</a> · the graph block at line 226 is not Turtle: The prefix open-question: has not been declared at corpora/x0k/decisions/architecture/surfaces/ui-interfaces.md:225</sub><a name="folio-source-78306b3a6f70656e2d7175657374696f6e2f6e616d696e672d616e2d617070732d636f6e666f726d616e63652d72756e-6"></a>

```turtle folio:graph
@prefix open-question: <https://0k.computer/ontology#open-question/> .
open-question:naming-an-apps-conformance-run a x0k:OpenQuestion ;
    x0k:text "Against what is an app's passing conformance run recorded?" ;
    x0k:description """The offer carries an app's identity and instance but no build identity, so a passing run cannot yet be tied to the build that passed it. The recommended default is that the offer gains the app's build identity and a run is recorded against app and build; the alternative is to run the suite when a driver first connects to an instance, which costs a suite run per connection.""" ;
    x0k:status "open" .
```

<a name="folio-instance-78306b3a746563686e652f7265667573652d612d6e6f6e636f6e666f726d696e672d75692d68616e646c6572-7"></a><sub data-instance-iri="x0k:techne/refuse-a-nonconforming-ui-handler" data-concept-iri="https://0k.computer/ontology#Techne" data-source-document="corpora/x0k/decisions/architecture/surfaces/ui-interfaces.md"><strong>Techne</strong> · Unresolved instance · <code>x0k:techne/refuse-a-nonconforming-ui-handler</code> · <a href="#folio-source-78306b3a746563686e652f7265667573652d612d6e6f6e636f6e666f726d696e672d75692d68616e646c6572-7">source declaration</a> · the graph block at line 226 is not Turtle: The prefix open-question: has not been declared at corpora/x0k/decisions/architecture/surfaces/ui-interfaces.md:225</sub><a name="folio-source-78306b3a746563686e652f7265667573652d612d6e6f6e636f6e666f726d696e672d75692d68616e646c6572-7"></a>

```turtle folio:graph
@prefix techne: <https://0k.computer/ontology#techne/> .
techne:refuse-a-nonconforming-ui-handler a x0k:Techne ;
    x0k:status "proposed" ;
    x0k:dependsOn techne:fall-back-between-ui-edges .
```

## Rationale

- **Navigating is a write.** It changes what a person sees and blocks their
  input. Putting it under `ui/observe` as `read_only` would let an
  observe-only grant freeze a shared app, which the observe-only grant exists
  to rule out.
- **Input is refused while the past is shown.** Applying it to the past state
  would run the app's code from a changed input under the name `inspect`,
  which `graded-introspection` §9 reserves for performing nothing. A driver
  that wants to act from the past forks (`continue`) or presents a fixture (`vary`). Redux DevTools locks
  changes for the same reason.
- **A state fixture is `vary`.** Driving an app in a given state runs its code
  against an input the world never produced, which is what `vary` names. The
  rejected alternative, a fixture under `inspect`, would have to refuse all
  input and lose the fixture's use.
- **The session's end returns the app to live.** A driver that dies would
  otherwise leave a person's app refusing their input, with nobody left to
  release it.
- **Fallback is per call.** Mixing two handlers in one answer would break
  `ui-control-channel` §8's one-frame rule, and a driver could not tell
  which parts line up.
- **Refusal at installation.** Handlers are arguments applied before a
  procedure runs (`core-and-edges` §5), so a missing or failing handler is
  known then. A run refused partway may already have acted.

## Consequences

- An app that keeps no history answers `ui/observe`, `ui/act` and `ui/input`
  and leaves `ui/history` out of its offer. A procedure that needs history
  for it is refused at installation.
- An app's own time-travel actions, where it has them, answer `ui/history`'s
  operations, so a driver's steps run on any app that offers the interface.
- A scenario engine can put an app into a given state, drive it, and release
  it, with no write reaching a real target and the live state untouched.
- An outside app that only emits traces is still debuggable, through the
  timeline, at the Emitted grade.
- The edges outside the protocol never answer `ui/history`, so time-travel
  debugging needs an app that speaks the protocol.

## Related Decisions

This decision connects its neighbours and amends none. It adds one field to
the observation `ui-control-channel` §8 decides (§3 above).

- [ui-screencast](ui-screencast.md) — `ui/screencast`, whose operations §1
  classes, whose run presents fixtures (§4) and whose clocks the offer states
  (§5).

- [ui-control-channel](ui-control-channel.md) — the endpoint protocol,
  `ui/observe`, `ui/act` and `ui/input`, which this decision adds to.
- core-and-edges — §2 names the UI interfaces and the
  edges by reach; its §5, installation as partial application, is where
  this decision's §8 refusal happens.
- graded-introspection — §1's grades
  and §2's degradation for the offer; §9's purposes, dispositions and floors
  for `ui/history`, state fixtures and the replay policy.
- operation-surface — §1's frames and
  `on_behalf_of`; §12's side-effect classes.
- [value-shapes](https://github.com/0k-dot-computer/x0k-datum/blob/main/decisions/architecture/surfaces/value-shapes.md) — the shape a state fixture is checked
  against.
- fleet-streams — the carrier to an app on
  another node.
- service-authorization — the grants
  whose interfaces a call is checked against.
- `ui-driver` — the design this supports; `inspect-and-rewind` faces a person
  with the same going back.

## Notes

- Motivated by intent `6344de4f-dbb9-3302-09f1-f7a05689aa64`. `ui/observe`
  and the endpoint's frames were decided ahead of it under intent `396792f0`,
  and `ui/act` and `ui/input` under intent `761c189e`, both in
  `ui-control-channel`.
- The sections resting on `graded-introspection` §9 are §2, §4 and the
  `replay_policy` and `sandboxes` fields of §5. §3's values for a past
  position and a state fixture follow §2 and §4. A change to that section
  rewrites those and leaves §1, §6, §7 and §8 as they stand.
- `ui-driver` declares no affordances yet, so the technai here realize none.
- No wiki page yet reads the adopted sources (WebDriver and Appium, Redux
  DevTools, RFC 7396, RFC 9110) against x0k.
