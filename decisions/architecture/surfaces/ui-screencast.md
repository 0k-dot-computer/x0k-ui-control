
# UI Screencasts

```turtle folio:document
architecture:ui-screencast a x0k:Architecture ;
    x0k:status "accepted" ;
    x0k:concerns "ui-control", "protocol", "conformance", "screencast", "motion" ;
    x0k:supports design:ui-driver ;
    x0k:motivatedBy intent:d334f411-c56e-0ea3-af48-70539ca7d660 ;
    x0k:dependsOn architecture:ui-interfaces,
        architecture:ui-control-channel ;
    x0k:mentions architecture:core-and-edges,
        architecture:graded-introspection,
        architecture:operation-surface,
        architecture:storage-inventory,
        architecture:content-fetch-plane .
```

## Brief

A screenshot shows where a motion ended, and a video's frames fill an
agent's context. So an agent asks for a **screencast** of a run: an action,
a sequence of fixture states, or input, recorded at a frame rate it names.
It gets a handle, a file that holds every frame as a PNG sequence the video
pipeline and ffmpeg read, and a summary of a few hundred words: the
movements in time order with when each settled, the eased path of each
element that moved, staggered starts, layout shifts, frame timing, and one
small contact sheet cropped to what changed. When the summary is not
enough, a second call reads chosen frames or regions from the file.

An app says in its offer how well it can do this. The best apps step their
own clock: the app pauses its animations and draws each frame at an exact
time. Its frames are the same on every run, at any frame rate and under any
load, and need no screen-recording permission. While an app steps its clock, its
window stops moving and the person's input to it waits, so a stepped
screencast holds the window as a takeover does: the host asks the person
first unless it is set up to allow or refuse without asking, and the person
always sees the hold and can end it. Where the app cannot step its
clock, the platform records the window as it runs, which needs the
platform's permission and depends on load. Any app that answers an
observation can be sampled by repeated captures at a low rate.

A person is never shown a fixture as if it were the live screen. The app
marks a fixture over its window, outside the frame. A screencast takes the
frame alone, so its frames carry no mark. Only an app's development
instance may also leave the mark off what the person sees.

## Context

`ui-control-channel` decides the endpoint, `ui/observe` (its §8), `ui/act`
(§9) and `ui/input` (§10). `ui-interfaces` decides `ui/history`, state
fixtures (its §4), the offer's grades and replay policy (§5) and the edges
by reach (§7). This decision adds one interface beside them. A bare section
number, such as §2, names a section of this decision.

`ui-interfaces` §1 holds that "a capability only some targets have is an
interface of its own". A screencast is such a capability, so it is the
interface `ui/screencast`. This decision holds what is the screencast's own:
its operations, clocks, runs, summary and file. What its neighbours must also
hold lives in them: the interface's operations and classes in
`ui-interfaces` §1 and `core-and-edges` §2, the fixture mark in
`ui-interfaces` §4, the offer's `screencast` field and dev instance in
`ui-interfaces` §5, a node's opacity in the layout of `ui-control-channel`
§8, and who allows a stepped screencast's hold of the window in
`ui-control-channel` §10.

### The built-in it replaces

x0k's shell already records a run. The built-in action `ui.record`
(`x0k:implementation/ui-control/record-actions`) plays an
`x0k.record-script/1` (`x0k:implementation/ui-control/record-script`): input
events named by frame index, a frame count and capture options. The shell
composes exactly one frame per index. For each frame it delivers one
animation tick of a fixed 16 ms to Masonry (`WindowEvent::AnimFrame`), redraws
once, and writes the captured PNG into an out directory. It answers once,
after the last frame, with a row per frame, a `frames.csv` and a trace hash
over every row. `record_ui` (`x0k:implementation/ui-control/record-driver`)
is the UI driver's face of it, and it checks that the reply covers every
frame the script asked for. The built-in `ui.*` action ids retire with
intent `fe4831b0`.

| Part of the old path | What this decision does with it |
|---|---|
| One composed frame per index, the host's animation tick supplied per frame | Kept as the stepped clock (§5), with the tick computed from the frame rate instead of a fixed 16 ms |
| `x0k.record-script/1` input by frame index | Kept as a file format. The driver converts it to a `perform` step (§4), so the wire keeps one input model (`ui-control-channel` §10) |
| The row per frame, `state_hash`, `png_hash`, the trace hash, `frames.csv` | Kept, extended with time, change and timing columns (§8) |
| A reply that covers every frame or fails | Kept as the coverage check (§2) |
| The out directory on the app's machine, named by the caller | Replaced: the endpoint holds the frames and the driver pulls them (§2, §8) |
| `ui.record`, `record_ui` | Replaced by `ui/screencast` `cast` and the driver's `ui_screencast` |
| Entity-canvas state in each row | Kept as the frame's presentable state head; the canvas fields become the canvas's own state |

### Adopted patterns

- **A frame is a function of its frame number.** Remotion renders a video
  by setting the composition's current frame and taking a screenshot in a
  headless browser, and its components read the frame number instead of the
  wall clock (`useCurrentFrame`). Because a frame depends only on its number,
  Remotion renders frames in any order and in parallel. A stepped screencast
  (§5) adopts the guarantee: frame *n* shows the app at time *n* / fps after
  the run started, whatever each frame cost to draw.
- **A frame waits until the app says it is ready.** Remotion's
  `delayRender` and `continueRender` hold a frame's capture until the
  component's asynchronous work completes. The stepped clock adopts the hold:
  it does not draw the next frame while the app's own pending work for the
  run is unanswered (§5).
- **Virtual time stops while a fetch is pending.** Chromium's
  `Emulation.setVirtualTimePolicy` replaces real time with a synthetic time
  source for every frame of a page, and its `pauseIfNetworkFetchesPending`
  policy does not advance that time while a resource fetch is pending. A
  stepped app's clock follows the same rule for the effects it awaits.
- **Fake timers.** Playwright's clock (`page.clock`), derived from Sinon's
  fake timers, overrides `Date`, `setTimeout`, `setInterval`,
  `requestAnimationFrame`, `requestIdleCallback`, `performance` and
  `Event.timeStamp`, and `runFor` advances the clock, firing every
  time-related callback on the way. The in-page library's stepped clock (§5)
  adopts that set and those semantics. Playwright's documentation names no
  control of CSS or Web Animations, so the clock leaves them on the document
  timeline.
- **Catch, pause and seek every animation.** timeweb (0.3.2 and later), the
  library under timesnap and timecut, overwrites a page's time functions with
  a virtual timeline and detects new animations through `transitionrun` and
  `animationstart` listeners, `document.getAnimations()` and an override of
  `Element.prototype.animate`; it pauses each and seeks it when needed. The
  stepped clock adopts that detection, on top of the hold the library already
  has.
- **A frame produced on request.** Chromium's
  `HeadlessExperimental.beginFrame` produces one frame at a given frame time,
  optionally with its screenshot, and reports `hasDamage`, whether the frame
  changed anything on the display. It and virtual time work only in
  `chrome-headless-shell`, which ships apart from Chrome since M132. The
  `cdp` edge answers a stepped screencast with it there (§3), and the damage
  flag is the model for each frame's change column (§8).
- **Window capture by the platform.** ScreenCaptureKit (macOS 12.3 and
  later) streams one window's frames through a filter for that window alone,
  at a minimum frame interval the caller sets. Each frame has its
  presentation time and a status; `idle` says the system made no new frame
  because the display did not change. It needs the person's Screen Recording
  permission. A streamed screencast (§6) adopts its frame times and its
  `idle` status.
- **Live video of a page.** Playwright's `recordVideo` records a browser
  context from Chromium's `Page.startScreencast` into a VP9 WebM at 25 fps,
  saved when the context closes. It is the streamed clock for a browser, and
  the reason a stepped clock is wanted: its frames arrive when the page
  paints, on the wall clock.
- **Stable until two captures agree.** Playwright's `toHaveScreenshot` takes
  screenshots until two in a row are the same. A screencast's `settle` (§4)
  is that rule stated in time: the run ends once its frames have not changed
  for the settle time.
- **Layout shift.** The Layout Instability API scores a shift as the
  fraction of the viewport the moved elements cover, times the distance they
  moved as a fraction of the viewport, and excludes shifts within 500 ms of
  input. The summary's layout shifts (§7) adopt that score and that
  exclusion.
- **Easing as a cubic Bézier.** CSS `cubic-bezier(x1, y1, x2, y2)` names an
  easing curve, and `x0k-tween`'s `Ease::CubicBezier` already reads it. A
  fitted easing (§7) is written in that form.
- **An image sequence at a constant rate.** ffmpeg assembles a video from a
  numbered PNG sequence at a given `-framerate`, and duplicates frames to
  hold a constant rate from variable-rate input. `x0k-render-media` writes
  its frames as `frame_%06d.png` and assembles them the same way. A
  screencast's file (§8) is that sequence.

Three things are new here. The offer grades how an app keeps time for a
screencast. The answer to an agent is a bounded summary, with the frames
kept in a file. And a fixture's mark is drawn outside the frame, so a
recording of a fixture never needs the mark removed from the app.

### Terms

- A **screencast** is the frames an app showed during one run, at one frame
  rate, with each frame's time. The word is chosen because *record*,
  *recorded* and *recording* already name the introspection grade and the
  journal in `graded-introspection` (whose grades the same offer lists), and
  *take* names an effect's outcome on a cell's tape.
- A screencast's **clock** says who decides each frame's time: `stepped`,
  `streamed` or `sampled` (§3).
- A **run** is the list of timed steps a screencast plays (§4).
- A **movement** is a stretch of consecutive changed frames, from the first
  frame that differs from the one before it to the frame after which nothing
  changes for the settle time (§7).
- An **element series** is one layout node's bounds and opacity at each
  frame of a movement, downsampled (§7).
- A **contact sheet** is one image of a movement's key frames side by side
  with a trail of what moved, cropped to the area that changed (§7).
- The **dev instance** and the **fixture mark** are `ui-interfaces`'
  (its §5 and §4).

## Decision

### 1. An agent reads a summary, and video-making reads the file

**Decides:** what a screencast gives an agent and what it gives the video
pipeline.
**Invariants:** an agent's answer holds the handle, the file's path and the
summary, never a frame's pixels beyond the one contact sheet; the summary is
at most 16 KiB of text and the contact sheet at most 1600 pixels on its
longer side, whatever the screencast's length; the file holds every frame of
the screencast.
**On failure:** a screencast whose summary would pass its bound drops
element series from the movements with the least change first, and says how
many it dropped.
**Checked by:** a property test over generated screencasts of up to 3600
frames that holds both bounds.

An agent working on chariot's approval list asks to see a new card arrive.
It calls `ui_screencast` with a run of two fixture states 100 ms apart, at
60 fps, with a settle time of 300 ms. It reads this answer:

```text
screencast sc_4f1a9c  chariot (dev instance)  stepped clock  60 fps
frames 0-43  (0-717 ms)  ended: settled at 717 ms
same frames on rerun: yes (trace hash 9e3b...)
file /…/screencasts/sc_4f1a9c/   contact sheet: contact.png  640x220

movement 1   100-417 ms   peak change 18% of the frame at 183 ms   region 24,180 640x220
  card c3   opacity 0 -> 1     ease-out cubic-bezier(0,0,0.2,1) 280 ms   declared
            y 212 -> 180       cubic-bezier(0.2,0.9,0.3,1.1) 300 ms   fitted, overshoot 6%
  card c2   y 180 -> 300       starts 40 ms after c3 (stagger 40 ms)   fitted, no overshoot
  layout shifts: none outside the movement

frame timing: compose p50 4.1 ms, p95 9.8 ms, max 21.3 ms at frame 7
  frame 7 took longer than one frame (16.7 ms): it would drop on a live clock
fixtures shown: s1 (0-99 ms), s2 (100-717 ms); unmarked frames
```

The agent learns the shape of the motion from this answer: a fade and a
slide with a small overshoot, a 40 ms stagger, and one slow frame. It reads
the contact sheet to see the three key frames and the trail. If it needs
frame 7, it asks for it, cropped to the card (§2).

A person making a video opens the directory. It holds
`frames/frame_000000.png` to `frame_000043.png`, the manifest, the frame
table and the summary (§8). `ffmpeg -framerate 60 -i
frames/frame_%06d.png` assembles it, and `x0k-render-media` takes the frames
as image assets of its media timeline.

### 2. `ui/screencast` casts a run, gives frames, and discards

**Decides:** the operations of `ui/screencast`, the side-effect class of each,
and what the grant must hold for each step of a run.
**Invariants:**

- `cast` plays a run and answers once, after the screencast ends, with a
  handle and a row per frame;
- the rows run from frame 0 to the last frame with none missing, and the
  answer names the frame count, the clock, the frame rate and the trace hash
  over the rows;
- a step of a run needs the interface that step's operation belongs to:
  `invoke` needs `ui/act` covering the action's class, `perform` needs
  `ui/input`, and `present` and `release` need `ui/history`;
- the endpoint holds at most one screencast per session, and drops it at
  `discard`, at the session's end, or when the next `cast` replaces it;
- `frames` reads only from a screencast the endpoint holds, and changes
  nothing.

**On failure:** a `cast` to an app whose offer does not name `ui/screencast`
is refused as `no_screencast_interface`. A step the grant does not cover, a
step the offer does not name, and a run past the offer's bounds are each
refused by name before anything plays. A step that is refused while the run plays ends the
screencast: `cast` answers `failed`, naming the step and its refusal, with
the rows of the frames already drawn, and the endpoint holds those frames. A
`frames` call for a handle the endpoint does not hold is refused as
`unknown_screencast`.
**Checked by:** the `ui/screencast` vectors of the UI-control conformance
suite (intent 1f4dc28c), among them that a run with a `perform` step is
refused under a grant without `ui/input`, and that a handle is unknown after
its session ends.

| Operation | Side-effect class |
|---|---|
| `cast` | the highest class among the run's steps; a run with no steps is `idempotent_write` when the clock is `stepped` and `read_only` otherwise |
| `frames` | `read_only` |
| `discard` | `idempotent_write` |

A stepped `cast` with no steps is still a write, for the reason `navigate` is
one (`ui-interfaces` §1): it holds the app's clock, so what a person sees
stops moving while it runs (§5).

- **`cast`** takes the run (§4), the frame rate, the longest time the
  screencast may last, the settle time, the clock the caller wants or the
  best the app offers, the parts each row carries (§8), an optional capture
  region and scale, and an optional date that a stepped clock's time 0 reads
  (§5). It answers the handle, the clock used, the
  frame count, how it ended (`settled`, `max_time` or `failed`), whether the
  frames are the same on a rerun and why not if not (§5), the trace hash, and
  the rows.
- **`frames`** takes a handle, a set of frame indices, and the parts it
  wants: `capture` with an optional region and scale, `layout`, `state` and
  `animations`. It answers each frame's parts, as many frames as fit under
  the endpoint's frame bound (`ui-interfaces` §6), and the index to continue
  from.
- **`discard`** takes a handle and drops its frames.

The driver's end pulls every frame into the file (§8) as soon as `cast`
answers, then discards. So the endpoint holds frames for seconds, and the
file is the lasting copy.

<a name="folio-instance-78306b3a746563686e652f636173742d612d75692d73637265656e63617374-1"></a><sub data-instance-iri="x0k:techne/cast-a-ui-screencast" data-concept-iri="https://0k.computer/ontology#Techne" data-source-document="corpora/x0k/decisions/architecture/surfaces/ui-screencast.md"><strong>Techne</strong> · Unresolved instance · <code>x0k:techne/cast-a-ui-screencast</code> · <a href="#folio-source-78306b3a746563686e652f636173742d612d75692d73637265656e63617374-1">source declaration</a> · the graph block at line 299 is not Turtle: The prefix techne: has not been declared at corpora/x0k/decisions/architecture/surfaces/ui-screencast.md:298</sub><a name="folio-source-78306b3a746563686e652f636173742d612d75692d73637265656e63617374-1"></a>

```turtle folio:graph
@prefix techne: <https://0k.computer/ontology#techne/> .
techne:cast-a-ui-screencast a x0k:Techne ;
    x0k:status "proposed" .
```

### 3. The offer states the clocks an app keeps for a screencast

**Decides:** how an app says how well it can make a screencast, and how a
driver falls back.
**Invariants:**

- the offer's `screencast` field lists the clocks the app answers, `stepped`
  and `streamed`, its longest screencast in frames and in time, and the
  sources of motion its stepped clock does not step;
- `sampled` is never offered: a driver makes it from repeated `observe`
  calls against any app that answers `ui/observe`;
- a `cast` that names a clock the offer does not list, or `sampled`, is
  refused as `unoffered_clock`, naming the clock;
- a `cast` that asks for the best clock gets the first the offer lists of
  `stepped`, then `streamed`.

**On failure:** a driver whose procedure needs a clock no handler offers is
refused when the procedure is installed (`ui-interfaces` §8).
**Checked by:** the offer vectors of the conformance suite (intent
1f4dc28c).

| Clock | Who decides each frame's time | Same frames on rerun | Permission | Frame rate |
|---|---|---|---|---|
| `stepped` | the app, which advances its own clock by exactly one frame per frame | yes, under §5's conditions | none | any the caller names |
| `streamed` | the platform's capture, as the window presents on the wall clock | no | the platform's screen capture, where it has one | up to the display's rate, lower under load |
| `sampled` | the driver, by repeated `observe` | no | none | as fast as observations return, about 10 to 20 per second for a web page |

<!-- inferred: 10 to 20 per second from the hold's measured median of 41 to
42 ms per observation (page-hold, "What the test shows") plus the snapshot -->

The edges answer by reach (`ui-interfaces` §7):

| Edge | `stepped` | `streamed` |
|---|---|---|
| `ui-control`, x0k's shell | yes: Masonry's animation tick is the host's to give | no |
| `ui-control`, a web or Tauri page with the in-page library | yes: the library's stepped clock (§5) | through the host's platform capture, where the host has it |
| `cdp` | yes, in `chrome-headless-shell` through `HeadlessExperimental.beginFrame` | through `Page.startScreencast`, as Playwright's video records |
| `accessibility` on macOS | no | ScreenCaptureKit, for any window |
| `xcuitest` | no | the device's screen recording |

A combinator falls from one handler to the next only on a refusal that says
the handler cannot answer the clock, as `ui-interfaces` §7 decides. A driver
that asked for the best clock and got `sampled` says so in the summary's
first line.

### 4. A run is a list of timed steps

**Decides:** what a screencast plays, and when it ends.
**Invariants:**

- a run is a list of steps, each at a time in milliseconds from the run's
  start, in non-decreasing order;
- a step is one of `invoke` (an action and its arguments), `perform` (an
  input sequence, `ui-control-channel` §10), `present` (a full state with
  its shape fingerprint, `ui-interfaces` §4) or `release`;
- frame *n* is drawn at time *n* × 1000 / fps, and a step at time *t* takes
  effect before the first frame whose time is *t* or later;
- the screencast ends at the first frame after the run's last step that
  begins a settle time of unchanged frames, or at the longest time the call
  allows, whichever comes first;
- a `present` in a run replaces the fixture that stands, so a list of
  `present` steps is a fixture sequence; a fixture the run presented is
  released when the screencast ends unless the run's last step says to keep
  it;
- a run with no steps records the app as it runs for its longest time.

**On failure:** steps out of time order, a step past the longest time, and a
frame rate outside 1 to 240 are refused by name before anything plays.
**Checked by:** the `ui/screencast` vectors: a `present` at 100 ms at 60 fps
is first shown in frame 6 (100 ms), and at 120 fps in frame 12.

A `perform` step's pauses run on the screencast's clock, so a pause of 50 ms
at a stepped clock is 50 ms of the app's time, not of the wall's. The watchable
pace (`ui-control-channel` §10) is the person's, and a screencast's `perform`
runs at the fast pace and is drawn only where the call asks for the frame
with the host's drawing.

The driver states a fixture sequence as states or as JSON Merge Patches
each over the state before it, and sends each `present` as the full state it
resolves to, so the endpoint's checks are those of `ui-interfaces` §4,
unchanged. Every `present` is checked against the live state's head when the
`cast` is admitted, before anything plays.

The record-script format stays a file a person or an agent can write. The
driver converts its events at frame *k* into a `perform` step whose time is
⌊*k* × 1000 / fps⌋ ms, which lands each event before frame *k* and after
frame *k* − 1 at every frame rate up to 1000 fps.

### 5. A stepped screencast is a function of its start and its run

**Decides:** what an app does to step its own clock, and when its frames are
the same on a rerun.
**Invariants:**

- while a stepped screencast plays, no source of motion the app steps reads
  the wall clock: each reads the screencast's time;
- frame *n* is drawn only after every step due by its time has taken effect
  and the app's pending work for the run has answered or reached the app's
  bound;
- the screencast's frames are captured as the frame alone, without the
  host's drawing of input or of the fixture mark, unless the call asks for
  that drawing;
- a stepped screencast's start is the fixture a `present` fixed and the date
  the `cast` names, in milliseconds since the Unix epoch; the app's clock
  reads that date at time 0, and the epoch itself when the `cast` names none;
- two stepped screencasts of one run, on one host and one build, from one
  start, with every effect of the run simulated or refused, have the same
  trace hash;
- for an app that draws each frame from the screencast's time, frame *n* at a
  frame rate *r* is the same image as frame 2*n* at rate 2*r*; a loop that
  counts its frames draws differently at each rate, though the clock gives
  both frames one time;
- while a stepped screencast plays, an `invoke`, `present` or `release`
  answers once its effect has run and names the app's epoch as it stands;
  the frame that shows the effect is the one the next step draws;
- while a stepped screencast plays, the host holds back a person's input to
  the window, shows that it does, naming the requester, and ends the
  screencast at the person's exit input, as a takeover does
  (`ui-control-channel` §10);
- the hold is asked of the person, allowed without asking or refused as the
  host's configuration of its endpoint says for a stepped screencast's hold
  (`ui-control-channel` §10, "Who allows a takeover"), when the `cast` is
  admitted and before anything plays; with nothing configured, the host asks.

**On failure:** a screencast whose start or run does not meet the rerun
condition answers `same frames on rerun: no`, naming why: no fixture at the
start, an effect performed, an unstepped source that moved, or pending work
that reached its bound. A stepped `cast` to a host whose offer does not say
it holds a takeover is refused as `takeover_unheld`, and one whose hold the
host's configuration refuses or the person does not grant is refused as
`takeover_not_granted`, naming the requester; each is refused before anything
plays. A screencast the person ended answers `failed`, naming the person's
exit, with the frames already drawn.
**Checked by:** the rerun test: cast one run twice from one fixture and
compare trace hashes, seen red on a probe page with one timer the clock does
not step; the rate test, seen red against a host that ticks a fixed 16 ms per
frame; the probe page's ink test that a stepped frame carries no mark; the
endpoint's tests that a stepped `cast` under a configuration that allows the
hold plays without an ask and still shows the hold, and that one it refuses
is refused before anything plays.

A host that shows no window to a person, such as `chrome-headless-shell`
under the `cdp` edge, holds back no one's input, so its stepped screencast
takes no hold and asks no one.

**What the in-page library adds to its hold.** The library's hold
(`x0k:implementation/ui-control/page-hold`) already pauses every animation in
`document.getAnimations()`, defers animation-frame callbacks, and gives each
animation back its start time at release. That holds the page still. To step
it, the library also:

- keeps a screencast time, and advances it by exactly one frame per frame;
- sets each paused animation's `currentTime` to where that time puts it, and
  catches each animation created during the run, CSS transitions included,
  at the step that created it, pausing it at its start;
- runs each deferred animation-frame callback once per frame with the
  screencast time as its timestamp;
- fakes `performance.now`, `Date`, `setTimeout`, `setInterval` and
  `requestIdleCallback` with the screencast time, and fires each due timer in
  order when the clock passes it;
- steps SVG animations with `pauseAnimations` and `setCurrentTime`;
- counts as pending work the page's own `fetch` calls, the reads of a
  response's body, `XMLHttpRequest`s and Tauri IPC calls that the run
  started; the clock wraps each of these itself when it begins, and asks no
  wrapper of the app's effects;
- names, in the offer, what it cannot step: media playback, the caret's
  blink, native smooth scrolling, and frames from other origins.

The host draws each frame with the platform's snapshot of the held page:
`webkit_web_view_get_snapshot` on Linux and `takeSnapshot` on macOS
(`x0k:implementation/ui-control/tauri-plugin`). The frame's wall cost is
about one hold, so a second at 60 fps takes about three seconds of the
wall's time.

<!-- inferred: three seconds from 60 holds at the measured median of 41 to
42 ms; not measured for a stepped screencast -->

**What x0k's shell adds.** Masonry already takes its animation tick from the
host (`WindowEvent::AnimFrame`), and `ui.record` already supplies one per
frame. The shell computes each tick as the difference between frame *n* and
frame *n* − 1 in nanoseconds, from the frame rate. Any widget that reads the
wall clock for motion, such as a caret blink, reads the tick instead or is
named in the offer as unstepped.

<a name="folio-instance-78306b3a746563686e652f737465702d616e2d617070732d636c6f636b2d666f722d612d73637265656e63617374-2"></a><sub data-instance-iri="x0k:techne/step-an-apps-clock-for-a-screencast" data-concept-iri="https://0k.computer/ontology#Techne" data-source-document="corpora/x0k/decisions/architecture/surfaces/ui-screencast.md"><strong>Techne</strong> · Unresolved instance · <code>x0k:techne/step-an-apps-clock-for-a-screencast</code> · <a href="#folio-source-78306b3a746563686e652f737465702d616e2d617070732d636c6f636b2d666f722d612d73637265656e63617374-2">source declaration</a> · the graph block at line 299 is not Turtle: The prefix techne: has not been declared at corpora/x0k/decisions/architecture/surfaces/ui-screencast.md:298</sub><a name="folio-source-78306b3a746563686e652f737465702d616e2d617070732d636c6f636b2d666f722d612d73637265656e63617374-2"></a>

```turtle folio:graph
@prefix techne: <https://0k.computer/ontology#techne/> .
techne:step-an-apps-clock-for-a-screencast a x0k:Techne ;
    x0k:status "proposed" ;
    x0k:dependsOn techne:cast-a-ui-screencast .
```

<a name="folio-instance-78306b3a6f70656e2d7175657374696f6e2f686f6c64696e672d612d706572736f6e732d696e7075742d647572696e672d612d737465707065642d73637265656e63617374-3"></a><sub data-instance-iri="x0k:open-question/holding-a-persons-input-during-a-stepped-screencast" data-concept-iri="https://0k.computer/ontology#OpenQuestion" data-source-document="corpora/x0k/decisions/architecture/surfaces/ui-screencast.md"><strong>OpenQuestion</strong> · Unresolved instance · <code>x0k:open-question/holding-a-persons-input-during-a-stepped-screencast</code> · <a href="#folio-source-78306b3a6f70656e2d7175657374696f6e2f686f6c64696e672d612d706572736f6e732d696e7075742d647572696e672d612d737465707065642d73637265656e63617374-3">source declaration</a> · the graph block at line 299 is not Turtle: The prefix techne: has not been declared at corpora/x0k/decisions/architecture/surfaces/ui-screencast.md:298</sub><a name="folio-source-78306b3a6f70656e2d7175657374696f6e2f686f6c64696e672d612d706572736f6e732d696e7075742d647572696e672d612d737465707065642d73637265656e63617374-3"></a>

```turtle folio:graph
@prefix open-question: <https://0k.computer/ontology#open-question/> .
open-question:holding-a-persons-input-during-a-stepped-screencast a x0k:OpenQuestion ;
    x0k:text "Does a stepped screencast ask the person before it holds their window?" ;
    x0k:description """A stepped screencast stops the window's motion and holds back the person's input while it plays, as a takeover does. The recommended default was that it asks the person as a takeover does, and plays without asking in a dev instance, where no one's live work is on the screen. The alternative was never to ask and only show that it holds the window, which makes a stepped screencast of a person's own window freeze it without consent for up to the longest screencast's wall time. Resolved 2026-11-12: it asks as a takeover does, and whether a takeover or a stepped screencast's hold asks, is allowed without asking or is refused is the host's configuration of its endpoint, with the dev instance one thing a rule may match on (operator: "the takeover should depend on how x0k-ui-control is configured, not just "dev instance" (e.g. for chariot, we might allow agents in a loop do whatever they want)"). Section 5 and ui-control-channel section 10 decide it.""" ;
    x0k:status "resolved" .
```

### 6. A streamed screencast takes the platform's capture of the window

**Decides:** what a streamed screencast holds, and who captures it.
**Invariants:**

- each frame carries the platform's presentation time for it, and the times
  increase;
- a frame the platform reports as unchanged is not stored again; the frame
  table repeats the frame before it at that time;
- the file's sequence is at the asked frame rate: each tick holds the latest
  frame presented at or before it, as ffmpeg's constant-rate output does;
- a frame's layout is read by `observe` beside the stream, and carries the
  time it was read at, never the time of a frame it does not belong to.

**On failure:** a capture the platform does not permit is refused as
`capture_not_permitted`, naming the permission and the process that needs it,
before anything plays. A window the platform cannot capture, such as a
minimised one, is refused as `cannot_paint` (`ui-control-channel` §8).
**Checked by:** on the Mac, a streamed screencast of the probe page holds
increasing frame times and repeats frames where ScreenCaptureKit says idle;
the refusal is seen against a build without the Screen Recording permission.

On macOS the capture is ScreenCaptureKit's stream for one window. The
permission belongs to the process that captures, so either the app's host
captures its own window, or the `accessibility` edge captures any window on
the node. A streamed screencast captures what a person sees, so it shows the
host's drawing of input and the fixture mark (§9).

### 7. The summary's parts, and what each needs from the app

**Decides:** what the summary holds, and what each part needs from the app.
**Invariants:**

- every part says which clock its frames came from;
- a value the app declared is marked declared, and a value the driver fitted
  is marked fitted, with its fit error;
- a part the app did not give what it needs for is left out and named as
  left out, never guessed.

**On failure:** not stated.
**Checked by:** the summary tests over the probe page: one element slides
100 px from 100 ms over 300 ms with a declared `cubic-bezier(0, 0, 0.2, 1)`;
the summary must report one movement starting at frame 6, a declared easing
equal to it, a fitted easing within 0.02 of it at every control point, and no
overshoot. Each test is seen red under a mutation of the segmenter and of the
fit.

| Part | What it says | What the app gives | Clock |
|---|---|---|---|
| Movements | each movement's start, end, settle time, peak change and the region that changed | captures | any |
| Element series | each moving node's bounds and opacity over the movement; its fitted or declared easing and duration; its overshoot; staggered starts among nodes that start within one movement | the layout of each frame (`ui-control-channel` §8), whose node ids name one part from frame to frame; each node's opacity; the animations the app knows, with target, property, duration, delay and easing | layout per frame at `stepped`; layout samples at their own times otherwise |
| Layout shifts | shifts scored as the Layout Instability API scores them, outside 500 ms of a step | the layout of each frame | `stepped` |
| Frame timing | at `stepped`, each frame's compose time and the frames that took longer than one frame; at `streamed` and `sampled`, the interval between frames and the frames dropped | compose time per frame at `stepped`; presentation times at `streamed` | any |
| Contact sheet | each movement's first, peak and last frame side by side, with a trail of the moving region over the movement, cropped to the region that changed | captures | any |

The change between two frames is the fraction of pixels that differ, and the
bounding box of those pixels. The driver's end computes it from the frames
in the file, so every app gets movements and a contact sheet from captures
alone. A frame that the app or the browser reports as undamaged counts as
unchanged without a comparison.

An element series needs the opacity a node shows. The layout of
`ui-control-channel` §8 gives each node's bounds and whether it is visible,
and no opacity. So the layout gains an optional `opacity` per node, the
product of its own and its ancestors'. An app that does not give it leaves
the opacity columns out.

An app that knows its animations gives them in the `animations` part: for a
web page, each `Animation` in `document.getAnimations()` with its effect's
target, keyframes and timing. The summary then reports the declared easing
and duration and fits only where nothing was declared. Easing is fitted as a
CSS cubic Bézier, the form `x0k-tween`'s `Ease::CubicBezier` reads, and
overshoot as the largest excursion past the end value, as a percentage of
the distance moved.

### 8. The file is a PNG sequence with its frame table

**Decides:** the file's layout, where it lives, and how long it is kept.
**Invariants:**

- a screencast's directory holds `screencast.json` (the manifest),
  `frames/frame_%06d.png` at the screencast's frame rate, `frames.csv` (the
  frame table), `summary.json` and `contact.png`;
- the manifest names the format `x0k.ui-screencast/1`, the app, its
  instance and build, the clock, the frame rate, the frame size and scale,
  the run, every fixture shown and whether it was marked, the trace ids of
  the call, and the trace hash;
- the frame table has a row per frame: its index, its time, its file, the
  file's blake3, the state head and shown state (`ui-interfaces` §3), the
  state's blake3, the changed fraction and box, and the compose time or
  presentation time;
- the trace hash folds every row's state and file hashes in frame order, as
  `x0k.record-script/1`'s trace hash does;
- the directory is written under the driver's profile, never under a live
  root from a scratch run (`docs/agent/rules/probes.md`).

**On failure:** a frame the driver could not pull ends the screencast as
`failed`, with the frames written so far and the manifest naming the gap.
**Checked by:** the driver's file test: the trace hash recomputed from the
files on disk equals the one `cast` answered, and ffmpeg assembles the
sequence to a video of the frame count.

A screencast's directory is observability data in `storage-inventory`'s
classes: its owner is the UI driver, and it is dropped after 7 days or when
the profile's screencasts pass 2 GiB, oldest first. An agent or a person
keeps one by asking for it to be kept. It is then a blob in the
content-fetch plane (`content-fetch-plane` §1), under the entry that asked for
it, and its retention is that entry's.

The `frames` operation of §2 reads from the endpoint, which holds a
screencast only until the driver has pulled it. The agent's second call,
`ui_screencast_frames`, reads from the file: it takes a handle, frames by
index or time, a region and a scale, and answers those frames as images with
their rows.

<a name="folio-instance-78306b3a6f70656e2d7175657374696f6e2f73637265656e636173742d726574656e74696f6e2d64656661756c7473-4"></a><sub data-instance-iri="x0k:open-question/screencast-retention-defaults" data-concept-iri="https://0k.computer/ontology#OpenQuestion" data-source-document="corpora/x0k/decisions/architecture/surfaces/ui-screencast.md"><strong>OpenQuestion</strong> · Unresolved instance · <code>x0k:open-question/screencast-retention-defaults</code> · <a href="#folio-source-78306b3a6f70656e2d7175657374696f6e2f73637265656e636173742d726574656e74696f6e2d64656661756c7473-4">source declaration</a> · the graph block at line 299 is not Turtle: The prefix techne: has not been declared at corpora/x0k/decisions/architecture/surfaces/ui-screencast.md:298</sub><a name="folio-source-78306b3a6f70656e2d7175657374696f6e2f73637265656e636173742d726574656e74696f6e2d64656661756c7473-4"></a>

```turtle folio:graph
@prefix open-question: <https://0k.computer/ontology#open-question/> .
open-question:screencast-retention-defaults a x0k:OpenQuestion ;
    x0k:text "How long does a profile keep screencasts it was not asked to keep?" ;
    x0k:description """The recommended default was 7 days or 2 GiB a profile, oldest first, because a screencast is evidence for the work of a session and a day of agent work makes tens of them. The alternatives were to drop a screencast at the end of the session that made it, which loses evidence an intent links to, or to keep every screencast as a blob, which grows without a bound the owner set. Resolved 2026-11-12 as recommended (operator: "i would say yes to all your recs"); section 8 decides it.""" ;
    x0k:status "resolved" .
```

### 9. A screencast's frames and the fixture mark

**Decides:** which of a screencast's frames show the fixture mark
(`ui-interfaces` §4), and what its manifest says of it.
**Invariants:**

- a stepped screencast's frames are the frame alone, so they show no mark in
  any instance, and the person watching still sees one;
- a streamed screencast captures the screen the person sees, mark included;
- the manifest of every screencast names each fixture it showed, and whether
  the person saw it marked.

**On failure:** a `present` step asking `mark: false` of an instance that is
not a dev instance is refused as `mark_required` when the `cast` is admitted,
before anything plays (§2).
**Checked by:** the `ui/screencast` vectors: a stepped screencast of a
fixture sequence shows no mark by the probe page's ink test, and its manifest
names each fixture as marked.

For a streamed screencast of a fixture sequence to show the app as it will
look, the app runs as a dev instance and the run's `present` steps ask
`mark: false`.

## Rationale

- **An interface of its own.** Only some apps can step their clock, and a
  procedure that needs a screencast must be refused at installation where no
  handler has one (`ui-interfaces` §8). An action on `ui/act` could not be
  refused that way, and it would also make the endpoint check a grant per
  step it cannot see. The rejected alternative keeps `ui.record` as a
  built-in action.
- **A summary, not the video.** An agent judges motion from times, curves
  and a few key frames. The rejected alternative returns frames, which costs
  the agent's context in proportion to the frame count.
- **The driver computes the summary.** Change, segmentation and fitting run
  once, in one place, for every app and edge. The rejected alternative has
  each app summarise its own frames, which puts the same mechanism in Rust,
  TypeScript and Swift.
- **The endpoint holds, the driver pulls.** An app on a phone or another
  node cannot write into the driver's directory. The rejected alternative,
  an out directory on the app's machine, works only beside the driver.
- **One input model.** `ui-control-channel` §10 holds that input is one
  sequence on one model. A record script by frame index converts to that
  model exactly, so a second model on the wire buys nothing.
- **The mark outside the frame.** A mark drawn by the app is part of the
  frame, so every recording would have to remove it from the app. Drawn by
  the host, it is left out by the frame-alone capture that already exists.
  The rejected alternative lets a driver turn the mark off in any instance,
  which shows a person a fixture as if it were live.
- **The hold is a takeover's.** A stepped screencast holds a person's window
  for seconds of the wall's time, which is what a takeover does, so it is
  answered by the same configuration, shown the same way and ended by the
  same input. The rejected alternative, playing without asking in a dev
  instance alone, gave a host one thing to choose by, and chariot, whose
  agents may run in a loop against its window, needs to choose by who asks.
- **Retention by age and size.** A screencast is evidence for a session's
  work, and a day of agent work makes tens of them, so the profile keeps them
  for 7 days or 2 GiB and an entry that cites one keeps it as a blob. The
  rejected alternatives drop a screencast with its session, which loses what
  an intent links to, or keep every one, which grows without a bound.

## Consequences

- Any app that answers `ui/observe` can be screencast at `sampled`, so a
  procedure that needs only a summary runs against every edge.
- A stepped screencast is a regression check for motion: two runs compare by
  trace hash, and a changed easing shows in the summary without opening an
  image.
- The video pipeline takes a screencast's frames as it takes any image
  sequence, with no capture step of its own.
- The offer, the layout, `present` and the refusal codes change shape, so the
  operation fingerprints change.
- An app that paints its own fixture banner today moves it to the host's
  drawing, or keeps it and accepts that its stepped frames show it.

### Chariot's part

Chariot is a Tauri app that uses `x0k-ui-tauri` and the in-page library.

1. **Fixtures without the mark, in a dev window.** Chariot's own banner
   (`ui.onFixture(handle => banner.show(...))`,
   `x0k:implementation/ui-control/page-answer`) is drawn in the page, so it is
   part of every frame. Chariot drops it for the library's fixture mark in
   the host's drawing layer. Its dev instance says so in its offer, so a run's
   `present` steps may ask `mark: false` there.
2. **A fixture sequence over time.** Chariot's `present` hook already swaps
   its store and stops its polling. A run of `present` steps needs nothing
   more of it, except that the hook takes effect before it returns, so the
   next frame shows it.
3. **Stepping its own clock.** The library's stepped clock (§5) steps the
   page. Chariot's motion that the page does not run, such as a timer on the
   Rust side that pushes an event to the page, either waits on the page's
   clock or is named as unstepped in the offer.

### Wire impact

`ui/screencast` is a new interface, and the offer, the layout node and
`present` gain fields, so the fingerprints change and the release is a minor
one: x0k-ui-control 0.3.0. The new refusal codes are `unknown_screencast`,
`capture_not_permitted`, `mark_required`, `no_screencast_interface` and
`unoffered_clock`, and `cast` takes a start date. The takeover's configuration
(`ui-control-channel` §10) adds none, and is the host's, so it changes no
fingerprint. Intent `98a87ce7`, input provenance for chariot, widens
`declined` to `ui/input` and also ships in 0.3.0, so the fingerprints change
once.

## Related Decisions

This decision adds an interface beside its neighbours, and what they hold
for it is stated in them.

- [ui-control-channel](ui-control-channel.md) — §8's one-frame observation
  and its frame-alone capture, which this decision's frames are, and its
  layout's opacity, which the element series read; §10's input model, which
  a run's `perform` follows, and its takeover and the host's configuration
  of who allows one, which a stepped screencast's hold follows.
- [ui-interfaces](ui-interfaces.md) — §1's rule that a capability only some
  targets have is its own interface, and the classes of `cast`, `frames` and
  `discard`; §4's fixtures, which a run presents, and the fixture mark; §5's
  offer, with `screencast` and the dev instance; §7's edges and fallback;
  §8's refusal at installation.
- [core-and-edges](core-and-edges.md) — §2's list of UI interfaces, which
  names `ui/screencast`.
- [graded-introspection](../substrate/graded-introspection.md) — §1's grades,
  whose names this decision's terms avoid; §9's `vary`, under which a run's
  fixtures play.
- [operation-surface](../platform/operation-surface.md) — §12's side-effect
  classes for `cast`, `frames` and `discard`.
- [storage-inventory](../substrate/storage-inventory.md) and
  [content-fetch-plane](../sync/content-fetch-plane.md) — the retention class
  of a screencast's directory, and the blob it becomes when kept.
- `ui-driver` — the design this supports.

## Notes

- Motivated by intent `d334f411`, the operator's proposed design of
  2026-11-11. Its record capability is `ui/screencast`; its three levels are
  the clocks `stepped`, `streamed` and `sampled`; its `ui_record { target,
  run, fps, max seconds, settle }` is `ui_screencast`; its second call is
  `ui_screencast_frames`.
- No wiki page yet reads the adopted sources (Remotion, Playwright's clock,
  video and `toHaveScreenshot`, timeweb, Chromium's virtual time and `beginFrame`,
  ScreenCaptureKit, the Layout Instability API) against x0k.
- `x0k-render-media` reads stills into its media timeline; a video asset is
  listed there but is not decoded. That it takes a PNG sequence as a clip is
  inferred from its loader, not measured.

The work is filed under intent `b55f7dfc`, which accepted this decision:

- `dabb635c` — the host's takeover configuration in the endpoint, the Tauri
  plugin's builder and the shell's configuration file (`ui-control-channel`
  §10);
- `f0f368f7` — `ui/screencast` in the wire types and the endpoint, with the
  offer's fields, the layout's opacity, the refusal codes and the
  conformance vectors of §2, §3, §4 and §9; it waits on `dabb635c`;
- `fa5761a4` — the in-page library's stepped clock (§5);
- `7e8d7cc4` — x0k's shell answers a stepped `cast`; `ui.record` retires
  with `fe4831b0`;
- `7abf5c5c` — the UI driver's `ui_screencast` and `ui_screencast_frames`,
  the file and its retention; `record_ui` retires;
- `04e104a3` — the summary, with the easing fit in `x0k-tween`; it waits on
  `7abf5c5c`;
- `4e78ba5c` — the fixture mark in the host's drawing layer and the dev
  instance in the offer;
- `29f32859` — the streamed clock on macOS through ScreenCaptureKit;
- `8c2c5aea` — the `cdp` edge's stepped and streamed clocks;
- `f98d16de` — `x0k-render-media` takes a screencast's directory as a clip;
  it waits on `7abf5c5c`;
- `6cbb328b` — chariot's part (Consequences); it waits on `4e78ba5c`,
  `dabb635c` and `fa5761a4`;
- `e7e4f3c1` — a wiki page on the prior art above.

Each host's and edge's part, and the driver's, waits on `f0f368f7`, which
holds the wire types. The release is x0k-ui-control 0.3.0, with intent
`98a87ce7`.
