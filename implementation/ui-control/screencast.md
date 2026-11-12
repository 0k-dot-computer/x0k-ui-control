# A screencast: the values of ui/screencast and the checks before anything plays

```turtle folio:document
implementation:ui-control\/screencast a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "x0k-ui-protocol's ui/screencast: cast a run of timed invoke, perform, present and release steps at a frame rate, read chosen frames of the screencast the endpoint holds, and discard it; the offer's screencast field; the frame each step first shows in; the rows and their trace hash; and the checks that refuse a cast by name before anything plays, held to conformance vectors." ;
    x0k:concerns "ui-control", "protocol", "conformance", "screencast", "publication" ;
    x0k:cites implementation:ui-control\/protocol,
        implementation:ui-control\/endpoint,
        implementation:ui-control\/page-clock,
        implementation:ui-control\/record-script ;
    x0k:implements architecture:ui-screencast,
        architecture:ui-interfaces ;
    x0k:motivatedBy intent:f0f368f7-5c8f-e64a-26b7-27f62a8718a7 ;
    folio:tangleCrate "crates/x0k-ui-protocol" ;
    folio:tangleRoot "src/screencast.rs" .
```

A screenshot shows where a motion ended. A **screencast** shows the motion: the
frames an app showed during one run, at one frame rate, with each frame's time
(`x0k:architecture/ui-screencast`). A driver asks for one with `cast`, reads
chosen frames with `frames`, and drops the frames with `discard`. This chapter
holds what those three operations carry and the checks the endpoint makes
before anything plays. The endpoint that plays a run is
`x0k:implementation/ui-control/endpoint` ("A screencast"); the driver's file and
summary are other units.

The carried example is chariot's: a run of two fixture states 100 ms apart, at
60 fps, settling after 300 ms. The second `present` takes effect before frame
6, whose time is 100 ms. At 120 fps it takes effect before frame 12.

## What holds

These are §2, §3, §4 and §9 of the decision, as this crate keeps them:

- **One interface, three operations.** `cast` plays a run and answers once,
  after the screencast ends, with a handle and a row per frame from frame 0 to
  the last with none missing, and the trace hash over the rows. `frames` reads
  chosen frames of a screencast the endpoint holds and changes nothing.
  `discard` drops one. `cast`'s side-effect class is the highest among its
  run's steps; a run with no steps is `idempotent_write` at the stepped clock,
  because it holds the app's clock, and `read_only` otherwise.
- **A step needs its own interface.** `invoke` needs `ui/act` covering the
  action's class, `perform` needs `ui/input`, and `present` and `release` need
  `ui/history`. `ui/screencast` itself must be held too.
- **The offer bounds the cast.** The offer's `screencast` field lists the
  clocks the app answers, `stepped` and `streamed`, never `sampled`, which a
  driver makes from repeated observations. A cast names one or asks for the
  best, which is `stepped` where the offer lists it, else `streamed`. A cast's
  longest time and its frame count stay within the offer's.
- **A frame is a function of its index.** Frame *n* is drawn at *n* × 1000 /
  fps ms after the run started, and a step at *t* ms takes effect before the
  first frame whose time is *t* or later.
- **Refused by name before anything plays.** An offer without
  `ui/screencast` (`no_screencast_interface`), a clock the offer does not list
  or `sampled` (`unoffered_clock`), a frame rate outside 1 to 240, steps out of
  time order, a step past the longest time, a step the grant or the offer does
  not cover, and a `present` that asks `mark: false` of an instance that is
  not a dev instance.
- **A stepped screencast starts at its date.** A cast may name the date its
  time 0 reads, in milliseconds since the Unix epoch; the app's clock reads
  that date plus the screencast's time, so a run shows a real date and two
  casts of one run from one date draw the same frames. A cast that names none
  starts at the epoch.

What this crate cannot check it leaves to the endpoint: a `present` step
against the app's state shape and live head, a `perform` step against the
frames the app holds, and the hold of the window.

## Clocks and the offer

A screencast's **clock** says who decides each frame's time. At `stepped` the
app advances its own clock by exactly one frame per frame
(`x0k:implementation/ui-control/page-clock` for a page). At `streamed` the
platform captures the window as it presents on the wall's clock. At `sampled`
the driver observes again and again; an app never offers it, and a cast that
names it is refused as `unoffered_clock`, so the word is on the wire only for
a driver's own summary to name.

<a name="chunk-screencast"></a><sub>[`src/screencast.rs`](../../crates/x0k-ui-protocol/src/screencast.rs) · `#screencast`</sub>

```rust {#screencast file="src/screencast.rs"}
//! A screencast of a run (`ui-screencast` §2 to §5 and §9): the values of
//! `ui/screencast`, and the checks made on a cast before anything plays.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use x0k_datum::shape::Shape;
use x0k_datum::Datum;

use crate::act::{check_invoke, Grant, Invoke};
use crate::fixture::PresentCall;
use crate::history::Shown;
use crate::input::Perform;
use crate::observe::{Observation, Region};
use crate::offer::{Offer, SideEffect, UI_ACT, UI_HISTORY, UI_INPUT, UI_SCREENCAST};
use crate::{Refused, RefusalCode};

#[cfg(test)]
mod tests;

/// The lowest and highest frame rate a cast may name (`ui-screencast` §4).
pub const MIN_FPS: u32 = 1;
pub const MAX_FPS: u32 = 240;

/// Who decides each frame's time (§3).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum Clock {
    /// The app advances its own clock by exactly one frame per frame.
    Stepped,
    /// The platform captures the window as it presents on the wall's clock.
    Streamed,
    /// The driver observes again and again. Never offered.
    Sampled,
}

/// What the offer says of screencasts, when it names `ui/screencast`
/// (`ui-interfaces` §5).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
pub struct ScreencastOffer {
    /// The clocks the app answers: `stepped`, `streamed`, or both.
    pub clocks: Vec<Clock>,
    /// The longest screencast the app makes, in frames.
    pub max_frames: u64,
    /// The longest screencast the app makes, in milliseconds.
    pub max_ms: u64,
    /// The sources of motion its stepped clock does not step, such as media
    /// playback.
    #[serde(default)]
    pub unstepped: Vec<String>,
}
```

`check_screencast_offer` holds an offer to §3 and `ui-interfaces` §5: the field
is there exactly when the offer names `ui/screencast`, it lists at least one
clock, and it never lists `sampled`.

<a name="chunk-screencast-2"></a><sub>[`src/screencast.rs`](../../crates/x0k-ui-protocol/src/screencast.rs) · `#screencast` · continues</sub>

```rust {#screencast}
/// How an offer's screencast field breaks `ui-screencast` §3.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScreencastOfferFault {
    /// The offer names `ui/screencast` and says nothing of its clocks.
    Missing,
    /// The offer says how it keeps time and does not name `ui/screencast`.
    Unasked,
    /// It lists no clock.
    NoClock,
    /// It lists `sampled`, which a driver makes and an app never offers.
    SampledOffered,
}

/// Whether `offer`'s screencast field is there exactly when it names
/// `ui/screencast`, and lists only clocks an app keeps.
pub fn check_screencast_offer(offer: &Offer) -> Result<(), ScreencastOfferFault> {
    match (offer.answers(UI_SCREENCAST), &offer.screencast) {
        (true, None) => Err(ScreencastOfferFault::Missing),
        (false, Some(_)) => Err(ScreencastOfferFault::Unasked),
        (_, Some(held)) if held.clocks.is_empty() => Err(ScreencastOfferFault::NoClock),
        (_, Some(held)) if held.clocks.contains(&Clock::Sampled) => Err(ScreencastOfferFault::SampledOffered),
        _ => Ok(()),
    }
}
```

## A run

A **run** is the list of timed steps a screencast plays (§4). Each step names
its time in milliseconds from the run's start and one operation, carried as
that operation's own call: an `invoke`, a `perform`, a `present`, or a
`release` of the fixture the run presented. A `perform`'s pauses run on the
screencast's clock, so at a stepped clock a pause of 50 ms is 50 ms of the
app's time.

A `present` replaces the fixture that stands, so a list of them is a fixture
sequence. The fixture the run presented is released when the screencast ends,
unless the run's last step is a `present` that says `keep`. A `release` step
releases the run's own fixture, so one with no `present` before it is
refused.

A record script's events at frame *k* become a `perform` step at ⌊*k* × 1000
/ fps⌋ ms, which lands before frame *k* and after frame *k* − 1 at every frame
rate up to 1000; that conversion is the driver's, and `first_frame_at` is what
it rests on.

<a name="chunk-screencast-3"></a><sub>[`src/screencast.rs`](../../crates/x0k-ui-protocol/src/screencast.rs) · `#screencast` · continues</sub>

```rust {#screencast}
/// One operation of a run, carried as its own call.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
#[serde(tag = "do", rename_all = "snake_case")]
pub enum RunStep {
    /// `ui/act`'s `invoke`.
    Invoke { invoke: Invoke },
    /// `ui/input`'s `perform`, its pauses on the screencast's clock.
    Perform { perform: Perform },
    /// `ui/history`'s `present`. `keep`, on the run's last step, leaves the
    /// fixture standing after the screencast ends.
    Present {
        present: PresentCall,
        #[serde(default)]
        keep: bool,
    },
    /// `ui/history`'s `release`, of the fixture the run presented.
    Release,
}

/// A step and its time, in milliseconds from the run's start.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
pub struct TimedStep {
    pub at_ms: u64,
    pub step: RunStep,
}

impl RunStep {
    /// The interface the step's operation belongs to (§2).
    pub fn interface(&self) -> &'static str {
        match self {
            RunStep::Invoke { .. } => UI_ACT,
            RunStep::Perform { .. } => UI_INPUT,
            RunStep::Present { .. } | RunStep::Release => UI_HISTORY,
        }
    }
}
```

## The frame a step shows in

Frame *n* is drawn at *n* × 1000 / fps ms. A step at *t* takes effect before the
first frame whose time is *t* or later, which is ⌈*t* × fps / 1000⌉. The times
are kept in whole microseconds for a row and whole nanoseconds for a host's
tick, both rounded down, so a host that steps its clock by the difference
between two frames' times never drifts from the frame's own time.

<a name="chunk-screencast-4"></a><sub>[`src/screencast.rs`](../../crates/x0k-ui-protocol/src/screencast.rs) · `#screencast` · continues</sub>

```rust {#screencast}
/// The first frame whose time is `at_ms` or later, at `fps`: the frame a
/// step at `at_ms` first shows in.
pub fn first_frame_at(at_ms: u64, fps: u32) -> u64 {
    (at_ms * u64::from(fps)).div_ceil(1000)
}

/// Frame `index`'s time from the run's start, in nanoseconds, rounded down.
pub fn frame_time_ns(index: u64, fps: u32) -> u64 {
    let time = u128::from(index) * 1_000_000_000 / u128::from(fps.max(1));
    u64::try_from(time).unwrap_or(u64::MAX)
}

/// The last frame whose time is `max_ms` or earlier.
pub fn last_frame_within(max_ms: u64, fps: u32) -> u64 {
    max_ms * u64::from(fps) / 1000
}
```

## Casting

`cast` takes the run, the frame rate, the longest time, the settle time, the
clock asked for or none for the best, the parts the endpoint keeps of each
frame for `frames` to read, a capture region and scale, and whether the frames
carry the host's drawing of input and of the fixture mark. They do not unless
the call asks: a stepped screencast's frames are the frame alone (§5). And it
takes the date the stepped clock's time 0 reads, `Date.now()` in a page, in
milliseconds since the Unix epoch; with none, the epoch itself, so a page that
shows the date shows 1970 and still draws the same frames on a rerun. A
streamed screencast runs on the wall's clock and reads no date.

The parts are an observation's three, and `animations`: what the app knows of
the animations each frame shows, for the driver to report a declared easing
instead of fitting one (§7).

The screencast ends at the first frame, after the run's last step, that ends a
settle time of unchanged frames, or at the longest time, or when a step or the
person ends it. A run with no steps plays for its longest time.

<a name="chunk-screencast-5"></a><sub>[`src/screencast.rs`](../../crates/x0k-ui-protocol/src/screencast.rs) · `#screencast` · continues</sub>

```rust {#screencast}
/// A part the endpoint keeps of each frame (`ui-screencast` §2, §7).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum FramePart {
    Capture,
    Layout,
    State,
    /// The animations the app knows the frame shows.
    Animations,
}

/// `cast`'s argument.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
pub struct CastCall {
    pub run: Vec<TimedStep>,
    /// Frames per second, 1 to 240.
    pub fps: u32,
    /// The longest the screencast may last, in milliseconds.
    pub max_ms: u64,
    /// How long the frames stay unchanged after the run's last step before
    /// the screencast ends, in milliseconds.
    pub settle_ms: u64,
    /// The clock asked for; the best the offer lists when left out.
    #[serde(default)]
    pub clock: Option<Clock>,
    /// The parts the endpoint keeps of each frame.
    pub parts: Vec<FramePart>,
    #[serde(default)]
    pub region: Option<Region>,
    #[serde(default)]
    pub scale: Option<f64>,
    /// Whether each frame carries the host's drawing of input and of the
    /// fixture mark. The frame alone unless this is `true`.
    #[serde(default)]
    pub presented: bool,
    /// The date a stepped clock's time 0 reads, in milliseconds since the
    /// Unix epoch; the epoch when left out.
    #[serde(default)]
    pub date: Option<u64>,
}
```

The answer is the handle, the clock used, the frame rate, the frame count, how
it ended, whether a rerun would draw the same frames and why not, the trace
hash, and a row per frame. A row names its index, its time, what the frame
shows, the blake3 of its capture's bytes and of its state, and, by clock, how
long the app took to compose it or when the platform presented it. A row the
app or the platform reports as unchanged from the one before says so.

A screencast ends `settled`, at `max_time`, or `failed`. A failed one names the
step that was refused and its refusal, or, with no step, why it ended, such as
the person's exit; its rows are the frames already drawn, which the endpoint
holds.

<a name="chunk-screencast-6"></a><sub>[`src/screencast.rs`](../../crates/x0k-ui-protocol/src/screencast.rs) · `#screencast` · continues</sub>

```rust {#screencast}
/// One frame of a screencast, as `cast` answers it (§2, §8).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
pub struct FrameRow {
    pub index: u64,
    /// The frame's time from the run's start, in microseconds.
    pub time_us: u64,
    /// What the frame shows (`ui-interfaces` §3).
    #[serde(default)]
    pub shown: Option<Shown>,
    /// The head of the state the frame shows.
    #[serde(default)]
    pub state_head: Option<String>,
    /// blake3 of the capture's bytes, in hex.
    #[serde(default)]
    pub png_hash: Option<String>,
    /// blake3 of the state's canonical CBOR, in hex.
    #[serde(default)]
    pub state_hash: Option<String>,
    /// At `stepped`, how long the app took to compose the frame.
    #[serde(default)]
    pub compose_us: Option<u64>,
    /// At `streamed`, when the platform presented the frame, from the run's start.
    #[serde(default)]
    pub presented_us: Option<u64>,
    /// The app or the platform reports the frame unchanged from the one before.
    #[serde(default)]
    pub unchanged: bool,
}

/// How a screencast ended (§2, §4).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CastEnd {
    /// Its frames stayed unchanged for the settle time after the run's last step.
    Settled,
    /// It reached the longest time the call allows.
    MaxTime,
    /// A step was refused as it played, or something else ended it, such as
    /// the person's exit.
    Failed {
        #[serde(default)]
        step: Option<u64>,
        why: String,
        #[serde(default)]
        refused: Option<Refused>,
    },
}

/// A screencast the endpoint holds, as `cast` answers it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
pub struct Screencast {
    pub handle: String,
    pub clock: Clock,
    pub fps: u32,
    pub frame_count: u64,
    pub ended: CastEnd,
    /// Whether a rerun from the same start would draw the same frames (§5).
    pub same_on_rerun: bool,
    /// Why not, when not.
    #[serde(default)]
    pub not_same: Vec<String>,
    /// The sources of motion the app had during the run that its clock did
    /// not step.
    #[serde(default)]
    pub unstepped: Vec<String>,
    pub trace_hash: String,
    pub rows: Vec<FrameRow>,
}

/// `cast`'s answer.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum CastAnswer {
    Refused(Refused),
    Cast(Screencast),
}
```

A row hashes the capture's bytes and the state's canonical CBOR, so two
implementations that show the same frame write the same row. The trace hash
folds every row's state hash and capture hash in frame order, `-` for one a
row lacks, as `x0k.record-script/1`'s does
(`x0k:implementation/ui-control/record-script`).

<a name="chunk-screencast-7"></a><sub>[`src/screencast.rs`](../../crates/x0k-ui-protocol/src/screencast.rs) · `#screencast` · continues</sub>

```rust {#screencast}
impl FrameRow {
    /// The row of frame `index` at `fps`, from the observation the app drew it as.
    pub fn of(index: u64, fps: u32, observation: &Observation) -> FrameRow {
        let png_hash = observation.capture.as_ref().map(|capture| blake3::hash(&capture.png).to_hex().to_string());
        let state_hash = observation
            .state
            .as_ref()
            .map(|state| blake3::hash(&Datum::from_json(&state.value).to_cbor()).to_hex().to_string());
        FrameRow {
            index,
            time_us: frame_time_ns(index, fps) / 1000,
            shown: observation.shown.clone(),
            state_head: observation.state.as_ref().map(|state| state.head.clone()),
            png_hash,
            state_hash,
            compose_us: None,
            presented_us: None,
            unchanged: false,
        }
    }

    /// Whether the frame looks as `before` did: by the app's own word, or by
    /// the same capture and state.
    pub fn same_as(&self, before: &FrameRow) -> bool {
        self.unchanged || (self.png_hash == before.png_hash && self.state_hash == before.state_hash)
    }
}

/// blake3 over every row's state hash and capture hash in frame order, hex.
pub fn screencast_trace_hash(rows: &[FrameRow]) -> String {
    let mut hasher = blake3::Hasher::new();
    for row in rows {
        hasher.update(row.state_hash.as_deref().unwrap_or("-").as_bytes());
        hasher.update(row.png_hash.as_deref().unwrap_or("-").as_bytes());
    }
    hasher.finalize().to_hex().to_string()
}
```

## Reading and dropping frames

`frames` takes a handle, the frame indices wanted and the parts, and answers
each frame as the observation the app drew it as, with the animations part
beside it. It answers as many as fit under the endpoint's frame bound
(`ui-interfaces` §6), and the index of the first frame it left out, for the
next call to start from. `discard` drops a screencast. The endpoint holds one
screencast per session and any session of the endpoint may read it, so a
driver can pull frames on a second connection; a handle whose session has
ended, or that was discarded or replaced by its session's next cast, is
`unknown_screencast`.

The endpoint keeps each frame's capture at the cast's region and scale. A
`frames` call that asks another region or scale has its capture refused as a
part, and the driver crops the frame it already pulled.

<a name="chunk-screencast-8"></a><sub>[`src/screencast.rs`](../../crates/x0k-ui-protocol/src/screencast.rs) · `#screencast` · continues</sub>

```rust {#screencast}
/// An animation the app knows a frame shows (§7): what it moves, how long,
/// after what delay, and with what easing, in CSS's words.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
pub struct FrameAnimation {
    /// The layout node it moves.
    pub target: String,
    pub property: String,
    pub duration_ms: f64,
    pub delay_ms: f64,
    /// A CSS easing, such as `cubic-bezier(0, 0, 0.2, 1)`.
    pub easing: String,
    /// Its keyframes, as the app holds them.
    #[serde(default)]
    pub keyframes: Value,
}

/// One frame of a screencast the endpoint holds.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
pub struct CastFrame {
    pub index: u64,
    /// The frame's capture, layout, state and what it shows, as the app drew it.
    pub observation: Observation,
    #[serde(default)]
    pub animations: Option<Vec<FrameAnimation>>,
}

/// `frames`' argument.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
pub struct FramesCall {
    pub handle: String,
    pub indices: Vec<u64>,
    pub parts: Vec<FramePart>,
    #[serde(default)]
    pub region: Option<Region>,
    #[serde(default)]
    pub scale: Option<f64>,
}

/// `frames`' answer.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum FramesAnswer {
    Refused(Refused),
    /// The frames that fit under the bound, in the order asked, and the first
    /// index asked for that did not fit.
    Frames {
        frames: Vec<CastFrame>,
        #[serde(default)]
        next: Option<u64>,
    },
}

/// `discard`'s argument.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
pub struct DiscardCall {
    pub handle: String,
}

/// `discard`'s answer.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum DiscardAnswer {
    Refused(Refused),
    Discarded { handle: String },
}

/// The refusal of a handle the endpoint does not hold.
pub fn unknown_screencast(handle: &str) -> Refused {
    let why = format!("the endpoint holds no screencast {handle}");
    Refused::new(RefusalCode::UnknownScreencast, handle, why)
}
```

## The checks before anything plays

`check_cast` admits a cast, or refuses it by name, before anything plays. It
reads the offer, the interfaces the connection's grant holds, and `ui/act`'s
classes, in this order:

1. `ui/screencast` is held, else `outside_grant`; and the offer names it with
   its field, else `no_screencast_interface` naming `ui/screencast`.
2. The frame rate is 1 to 240, else `misfit_arguments` naming `fps`.
3. The clock asked for is one the offer lists, and `sampled` never is; with
   none asked, the best the offer lists. Else `unoffered_clock` naming the
   clock, or `clock` when none was asked.
4. The longest time and its frame count are within the offer's, else
   `misfit_arguments` naming `max_ms`.
5. Each step is at or after the one before and at or before the longest
   time, else `misfit_arguments` naming the step as `run/<index>`.
6. Each step's interface is held, else `outside_grant` naming the interface,
   and the offer answers the step: an `invoke` by `check_invoke`, a `perform`
   by `ui/input`, a `present` by `ui/history` and fixtures, a `release` after a
   `present` of the run. A `present` that asks `mark: false` of an instance
   that is not a dev instance is `mark_required`.

Steps 2, 4 and 5 are the call's arguments not fitting what the app offers, so
they answer `misfit_arguments` (`x0k:implementation/ui-control/protocol`,
"Why a call was refused"). Steps 1 and 3 have words of their own, so a driver
that asked for a clock can tell an app that keeps another, and fall back to
it or to `sampled`, from a cast it must fix. A step's own refusal is its
operation's word, so a driver reads `no_fixtures` the same from a `present`
and from a cast's `present` step. The date is any the call names: it moves
what the app's clock reads, never what a cast may do.

The admitted cast names its clock, its side-effect class, its last frame and
the frame each step first shows in.

<a name="chunk-screencast-9"></a><sub>[`src/screencast.rs`](../../crates/x0k-ui-protocol/src/screencast.rs) · `#screencast` · continues</sub>

```rust {#screencast}
/// A cast `check_cast` admits.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Admitted {
    pub clock: Clock,
    /// The highest class among the run's steps (`ui-interfaces` §1).
    pub class: SideEffect,
    /// The last frame the screencast may draw.
    pub last_frame: u64,
    /// The frame each step first shows in, in the run's order.
    pub step_frames: Vec<u64>,
}

/// The clock a cast plays at: the one it names, or the best the offer lists.
pub fn cast_clock(offer: &ScreencastOffer, asked: Option<Clock>) -> Result<Clock, Refused> {
    let offered = |clock: &Clock| *clock != Clock::Sampled && offer.clocks.contains(clock);
    let chosen = match asked {
        Some(clock) => Some(clock).filter(offered),
        None => [Clock::Stepped, Clock::Streamed].into_iter().find(offered),
    };
    chosen.ok_or_else(|| {
        let named = asked.map_or("clock".to_string(), |clock| format!("{clock:?}").to_lowercase());
        let why = match asked {
            Some(Clock::Sampled) => "sampled is a driver's clock, which no app offers".to_string(),
            Some(_) => format!("the offer lists no {named} clock"),
            None => "the offer lists no clock".to_string(),
        };
        Refused::new(RefusalCode::UnofferedClock, &named, why)
    })
}

/// The side-effect class of a cast of `run` at `clock` (`ui-interfaces` §1).
/// `classes` gives each `invoke` step's action class, in the run's order.
pub fn cast_class(run: &[TimedStep], clock: Clock, classes: &[SideEffect]) -> SideEffect {
    let mut invoked = classes.iter();
    let of_step = |step: &TimedStep, invoked: &mut std::slice::Iter<SideEffect>| match step.step {
        RunStep::Invoke { .. } => invoked.next().copied().unwrap_or(SideEffect::NonIdempotent),
        RunStep::Perform { .. } => SideEffect::NonIdempotent,
        RunStep::Present { .. } | RunStep::Release => SideEffect::IdempotentWrite,
    };
    let highest = run.iter().map(|step| of_step(step, &mut invoked)).max();
    highest.unwrap_or(match clock {
        Clock::Stepped => SideEffect::IdempotentWrite,
        Clock::Streamed | Clock::Sampled => SideEffect::ReadOnly,
    })
}

/// The cast `call` may play, or why it may not, before anything plays.
/// `holds` is the interfaces the connection's grant holds and `grant` the
/// classes it allows `ui/act`.
pub fn check_cast(offer: &Offer, holds: &[String], grant: &Grant, call: &CastCall) -> Result<Admitted, Refused> {
    let held = |interface: &str| holds.iter().any(|held| held == interface);
    let outside = |interface: &str| {
        Refused::new(RefusalCode::OutsideGrant, interface, format!("the grant does not hold {interface}"))
    };
    let misfit = |subject: &str, why: String| Refused::new(RefusalCode::MisfitArguments, subject, why);
    if !held(UI_SCREENCAST) {
        return Err(outside(UI_SCREENCAST));
    }
    let Some(screencasts) = offer.screencast.as_ref().filter(|_| offer.answers(UI_SCREENCAST)) else {
        let why = "the offer does not name ui/screencast";
        return Err(Refused::new(RefusalCode::NoScreencastInterface, UI_SCREENCAST, why));
    };
    if !(MIN_FPS..=MAX_FPS).contains(&call.fps) {
        return Err(misfit("fps", format!("a frame rate is {MIN_FPS} to {MAX_FPS}, and the cast asks {}", call.fps)));
    }
    let clock = cast_clock(screencasts, call.clock)?;
    let last_frame = last_frame_within(call.max_ms, call.fps);
    if call.max_ms > screencasts.max_ms || last_frame >= screencasts.max_frames {
        let why = format!(
            "the app casts at most {} ms and {} frames, and the cast asks {} ms, {} frames",
            screencasts.max_ms,
            screencasts.max_frames,
            call.max_ms,
            last_frame + 1
        );
        return Err(misfit("max_ms", why));
    }
    let mut classes = Vec::new();
    let mut step_frames = Vec::new();
    let mut presented = false;
    let mut before = 0;
    for (index, timed) in call.run.iter().enumerate() {
        let at = format!("run/{index}");
        if timed.at_ms < before {
            return Err(misfit(&at, format!("step {index} at {} ms comes before the step before it", timed.at_ms)));
        }
        if timed.at_ms > call.max_ms {
            return Err(misfit(&at, format!("step {index} at {} ms is past the longest time", timed.at_ms)));
        }
        before = timed.at_ms;
        let interface = timed.step.interface();
        if !held(interface) {
            return Err(outside(interface));
        }
        match &timed.step {
            RunStep::Invoke { invoke } => classes.push(check_invoke(offer, grant, invoke)?.side_effect),
            RunStep::Perform { .. } if !offer.answers(UI_INPUT) => {
                let why = "the offer does not name ui/input";
                return Err(Refused::new(RefusalCode::NoInputInterface, UI_INPUT, why));
            }
            RunStep::Perform { .. } => {}
            RunStep::Present { .. } | RunStep::Release if !offer.answers(UI_HISTORY) => {
                let why = "the offer does not name ui/history";
                return Err(Refused::new(RefusalCode::NoHistoryInterface, UI_HISTORY, why));
            }
            RunStep::Present { .. } if !offer.history.as_ref().is_some_and(|history| history.fixtures) => {
                return Err(Refused::new(RefusalCode::NoFixtures, UI_HISTORY, "the app takes no state fixtures"));
            }
            RunStep::Present { present, .. } if !present.marked() && !offer.dev_instance => {
                let why = format!("step {index} asks mark: false, and only a dev instance shows a fixture without its mark");
                return Err(Refused::new(RefusalCode::MarkRequired, UI_HISTORY, why));
            }
            RunStep::Present { .. } => presented = true,
            RunStep::Release if !presented => {
                return Err(misfit(&at, format!("step {index} releases, and the run presented no fixture before it")));
            }
            RunStep::Release => presented = false,
        }
        step_frames.push(first_frame_at(timed.at_ms, call.fps));
    }
    let class = cast_class(&call.run, clock, &classes);
    Ok(Admitted { clock, class, last_frame, step_frames })
}
```

## Holding the values

The shapes test holds `shapes.json` to these types
(`x0k:implementation/ui-control/protocol`, "The shapes of the operations"); this
test holds that a cast, its answer, a frames answer and a discard fit the
shapes their operations declare, and that the trace hash reads the rows in
order.

<a name="chunk-screencast-test"></a><sub>[`src/screencast/tests.rs`](../../crates/x0k-ui-protocol/src/screencast/tests.rs) · `#screencast-test`</sub>

```rust {#screencast-test file="src/screencast/tests.rs"}
//! `ui/screencast`'s values fit their operations' shapes, and the rows fold in order.

use serde_json::{json, Value};
use x0k_datum::shape::{Shaped, Use};
use x0k_datum::Datum;
use crate::act::Invoke;
use crate::fixture::{Fixture, PresentCall};
use crate::history::Shown;
use crate::observe::{Capture, Observation, StatePart};
use crate::screencast::{
    screencast_trace_hash, CastAnswer, CastCall, CastEnd, CastFrame, Clock, DiscardAnswer, FrameRow, FramePart, FramesAnswer,
    FramesCall, RunStep, Screencast, TimedStep,
};
use crate::shapes::{operation_shapes, CAST, DISCARD, FRAMES};

fn fits(operation: &str, argument: bool, value: &Value) -> bool {
    let shapes = operation_shapes();
    let shape = shapes.iter().find(|shape| shape.operation == operation).expect("the operation");
    let (spelling, use_) = match argument {
        true => (&shape.argument, Use::Argument),
        false => (&shape.answer, Use::Answer),
    };
    let compiled = Shaped::read(spelling).expect("a shape").compile(use_).expect("it compiles");
    compiled.check(&Datum::from_json(value)).is_ok()
}

fn frame(png: &[u8], count: u64) -> Observation {
    Observation {
        frame: Some(format!("f{count}")),
        capture: Some(Capture { png: png.to_vec(), width: 4, height: 2, scale_factor: 1.0, presented: false }),
        layout: None,
        state: Some(StatePart { value: json!({"count": count}), head: format!("s{count}"), fingerprint: "p".to_string() }),
        refused: Vec::new(),
        shown: Some(Shown::Fixture { handle: "x1".to_string() }),
    }
}

#[test]
fn a_cast_its_answer_its_frames_and_a_discard_fit_their_shapes() {
    let present = PresentCall {
        fixture: Fixture::State { state: json!({"count": 1}) },
        fingerprint: "p".to_string(),
        if_match: None,
        mark: Some(false),
    };
    let run = vec![
        TimedStep { at_ms: 0, step: RunStep::Present { present, keep: false } },
        TimedStep { at_ms: 100, step: RunStep::Invoke { invoke: Invoke { action: "a".to_string(), args: json!(null) } } },
        TimedStep { at_ms: 200, step: RunStep::Release },
    ];
    let call = CastCall {
        run,
        fps: 60,
        max_ms: 1000,
        settle_ms: 300,
        clock: None,
        parts: vec![FramePart::Capture, FramePart::State],
        region: None,
        scale: Some(0.5),
        presented: false,
        date: Some(1_794_500_000_000),
    };
    let call = serde_json::to_value(&call).expect("JSON");
    assert!(fits(CAST, true, &call), "{call}");
    let mut misdated = call.clone();
    misdated["date"] = json!("today");
    assert!(!fits(CAST, true, &misdated), "a cast's date is milliseconds since the epoch");

    let rows = vec![FrameRow::of(0, 60, &frame(b"a", 0)), FrameRow::of(1, 60, &frame(b"b", 1))];
    let failed = CastEnd::Failed { step: Some(1), why: "declined".to_string(), refused: None };
    for ended in [CastEnd::Settled, CastEnd::MaxTime, failed] {
        let cast = CastAnswer::Cast(Screencast {
            handle: "sc1".to_string(),
            clock: Clock::Stepped,
            fps: 60,
            frame_count: 2,
            ended,
            same_on_rerun: false,
            not_same: vec!["an effect performed".to_string()],
            unstepped: vec!["media playback".to_string()],
            trace_hash: screencast_trace_hash(&rows),
            rows: rows.clone(),
        });
        let answer = serde_json::to_value(&cast).expect("JSON");
        assert!(fits(CAST, false, &answer), "{answer}");
    }

    let call = FramesCall { handle: "sc1".to_string(), indices: vec![0, 1], parts: vec![FramePart::Layout], region: None, scale: None };
    assert!(fits(FRAMES, true, &serde_json::to_value(&call).expect("JSON")));
    let mut observation = frame(b"", 0);
    observation.capture = None;
    let frames = FramesAnswer::Frames { frames: vec![CastFrame { index: 0, observation, animations: None }], next: Some(1) };
    let answer = serde_json::to_value(&frames).expect("JSON");
    assert!(fits(FRAMES, false, &answer), "{answer}");
    let discarded = DiscardAnswer::Discarded { handle: "sc1".to_string() };
    assert!(fits(DISCARD, true, &json!({"handle": "sc1"})));
    assert!(fits(DISCARD, false, &serde_json::to_value(&discarded).expect("JSON")));
    assert!(!fits(CAST, true, &json!({"fps": 60})), "a cast names its run");
}

#[test]
fn a_row_hashes_its_frame_and_the_trace_reads_rows_in_order() {
    let a = FrameRow::of(0, 60, &frame(b"png a", 0));
    let b = FrameRow::of(1, 60, &frame(b"png b", 1));
    assert_eq!(a.png_hash.as_deref(), Some(blake3::hash(b"png a").to_hex().as_str()));
    assert_eq!(b.time_us, 16_666);
    assert_eq!(b.state_head.as_deref(), Some("s1"));
    assert!(!b.same_as(&a));
    assert!(FrameRow::of(1, 60, &frame(b"png a", 0)).same_as(&a));
    assert_ne!(screencast_trace_hash(&[a.clone(), b.clone()]), screencast_trace_hash(&[b, a]));
}
```

## The vectors

Four files hold these checks for any implementation, in the format of
`vectors/README.md`:

| File | Check | Clause |
|---|---|---|
| `screencast-cast.json` | `screencast.cast`: what an endpoint does with a `cast` before anything plays | `ui-screencast` §2 to §4, §9 |
| `screencast-frame.json` | `screencast.frame`: the frame a step at a time first shows in, at a frame rate | `ui-screencast` §4 |
| `screencast-offer.json` | `screencast.offer`: whether an offer says how it keeps time exactly when it names `ui/screencast` | `ui-screencast` §3, `ui-interfaces` §5 |
| `screencast-class.json` | `screencast.class`: a cast's side-effect class, from its run and clock | `ui-interfaces` §1 |

Among them, as §2, §3, §4 and §9's checks name: a run with a `perform` step
is refused under a grant that does not hold `ui/input`; a cast to an offer
without `ui/screencast` is refused as `no_screencast_interface`, and one
naming `sampled` or a clock the offer does not list as `unoffered_clock`; a
`present` at 100 ms is first shown in frame 6 at 60 fps and in frame 12 at
120 fps; and a `present` step asking `mark: false` is refused as
`mark_required` outside a dev instance. That a handle is unknown after its session ends is the endpoint's,
and its test is there (`x0k:implementation/ui-control/endpoint`, "A
screencast").

## What is open

- A host that shows no window to a person takes no hold for a stepped
  screencast (§5); the offer has no word yet for such a host, so the endpoint
  asks the takeover configuration of every stepped cast.
- `frames` gives captures at the cast's region and scale only; a frame cut
  again is the driver's, from the frame it pulled.
