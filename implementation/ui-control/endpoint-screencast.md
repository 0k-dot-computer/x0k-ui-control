# The endpoint plays a screencast: the hold, the run, the frames, and the app's hooks

```turtle folio:document
implementation:ui-control\/endpoint-screencast a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "x0k-ui-endpoint answers ui/screencast: it checks a cast before anything plays, asks the host's takeover configuration for a stepped cast's hold, plays the run's timed steps through the endpoint's own calls, draws each frame through the app's stepped or streamed hooks, ends the screencast when it settles, reaches its longest time or a step is refused, and holds one screencast per session for frames and discard." ;
    x0k:concerns "ui-control", "protocol", "screencast", "publication" ;
    x0k:cites implementation:ui-control\/endpoint,
        implementation:ui-control\/screencast,
        implementation:ui-control\/takeover,
        implementation:ui-control\/page-clock,
        implementation:ui-control\/record-actions ;
    x0k:implements architecture:ui-screencast,
        architecture:ui-control-channel ;
    x0k:motivatedBy intent:f0f368f7-5c8f-e64a-26b7-27f62a8718a7 ;
    folio:tangleCrate "crates/x0k-ui-endpoint" ;
    folio:tangleRoot "src/screencast.rs" .
```

`x0k:implementation/ui-control/screencast` says what a cast carries and what is
refused before anything plays. This chapter is the endpoint's part: it holds
the window, plays the run's steps, asks the app for each frame, and keeps the
frames until the driver has pulled them (`x0k:architecture/ui-screencast` §2,
§5 and §6). The app's part is a handful of hooks on `UiApp`
(`x0k:implementation/ui-control/endpoint`), each refusing by default, saying
the app offers no screencast.

## What holds

- **Nothing plays before every check passes.** The protocol's `check_cast`,
  then each `present` step against the app's state shape and live head, each
  `perform` step against the frames the app holds and the kinds its host
  delivers, whether the host can paint, and for a stepped cast the hold of the
  window: `takeover_unheld` when the offer does not say the host holds one,
  and the host's configuration (`Endpoint::hold_for`,
  `x0k:implementation/ui-control/takeover`) for the rest. A cast refused here
  leaves the app's clock and window as they were.
- **A step plays as its own call.** An `invoke` step is the endpoint's
  `invoke`, a `perform` step its `perform`, and so on, so the replay policy,
  what the app declines for now and a fixture the app ended answer a step as
  they answer the call. A step refused as it plays ends the screencast
  `failed`, naming the step, with the frames already drawn.
- **Frame *n* is the app at *n* × 1000 / fps.** At the stepped clock the
  endpoint asks the app for frame *n* only after every step due by its time
  has played, and gives the app its time and the tick since the frame before.
- **One screencast per session.** The next `cast` that is admitted, a
  `discard`, and the session's end each drop it. Any session of the endpoint
  reads a screencast by its handle, so a handle is unknown, as
  `unknown_screencast`, exactly when no session holds it.

## The app's hooks

The hooks are shaped so both of today's stepped hosts answer them without an
adapter. The page library's clock (`x0k:implementation/ui-control/page-clock`)
has `begin`, `advanceTo(ms)` and `end`; x0k's shell delivers one animation tick
to Masonry per frame and redraws (`x0k:implementation/ui-control/record-actions`).
So the endpoint calls `stepped_begin` once, `step_to` once per frame, and
`stepped_end` once, and `StepTo` carries both what the page reads, the frame's
time in milliseconds, and what the shell reads, the tick in nanoseconds since
the frame before.

| Hook | The page library | x0k's shell |
|---|---|---|
| `stepped_begin` | `steppedClock.begin({ date })`, answering `Begun.unstepped` | stop the wall's animation ticks |
| `step_to` | `steppedClock.advanceTo(to.time_ms())`, then the host's snapshot of the held page | one `WindowEvent::AnimFrame` of `to.tick_ns`, one redraw, one capture |
| `stepped_end` | `steppedClock.end()`, its `sameOnRerun` and `why` | give the wall's ticks back |

A frame answers the observation the app drew it as, with the parts
`stepped_begin` named, and optionally its animations, how long it took to
compose, whether the app knows it unchanged, and the pending work that
reached its bound, which the page's `Stepped.overBound` names.

A streamed screencast is the platform's capture of the window on the wall's
clock (§6): `stream_begin` starts it or refuses it as `capture_not_permitted`,
`stream_take` hands over the frames presented since the last take with their
presentation times, and `stream_end` stops it.

<a name="chunk-screencast-hooks"></a><sub>[`src/screencast.rs`](../../crates/x0k-ui-endpoint/src/screencast.rs) · `#screencast-hooks`</sub>

```rust {#screencast-hooks file="src/screencast.rs"}
//! What an app answers for a screencast (`ui-screencast` §5 and §6): the
//! values its `UiApp` hooks take and give, and a frames answer on the wire.

use std::collections::BTreeMap;

use x0k_datum::Datum;
use x0k_ui_protocol::observe::{Observation, Region};
use x0k_ui_protocol::screencast::{CastFrame, FrameAnimation, FramePart, FramesAnswer};

use crate::wire::{decode_observation, encode_observation, from_wire, to_wire, BadValue};

#[cfg(test)]
mod tests;

/// How a stepped screencast begins.
#[derive(Clone, Debug, PartialEq)]
pub struct SteppedBegin {
    pub fps: u32,
    /// The parts each frame answers.
    pub parts: Vec<FramePart>,
    pub region: Option<Region>,
    pub scale: Option<f64>,
    /// Whether each capture carries the host's drawing of input and of the
    /// fixture mark; the frame alone when false.
    pub presented: bool,
    /// For whom the window is held, as the connection names them.
    pub requester: String,
    /// The date the clock's time 0 reads, in milliseconds since the Unix
    /// epoch, as the cast names it; the epoch when it names none.
    pub date: u64,
}

/// What `stepped_begin` answers: the sources of motion the app has now that
/// its clock does not step.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Begun {
    pub unstepped: Vec<String>,
}

/// The frame the app steps its clock to.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StepTo {
    pub index: u64,
    /// The frame's time from the run's start, in nanoseconds.
    pub time_ns: u64,
    /// The time since the frame before, in nanoseconds; 0 for frame 0.
    pub tick_ns: u64,
}

impl StepTo {
    /// The frame's time in milliseconds, as a page's `advanceTo` reads it.
    pub fn time_ms(&self) -> f64 {
        self.time_ns as f64 / 1_000_000.0
    }
}

/// One frame the app drew at its stepped clock.
#[derive(Clone, Debug, PartialEq)]
pub struct SteppedFrame {
    pub observation: Observation,
    pub animations: Option<Vec<FrameAnimation>>,
    /// How long the app took to compose it.
    pub compose_us: Option<u64>,
    /// The app knows it unchanged from the frame before.
    pub unchanged: bool,
    /// The run's pending work that reached its bound before this frame.
    pub over_bound: Vec<String>,
}

/// Why the app answers no frame, which ends the screencast: the person's
/// exit, or a clock that could not step.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
#[error("{why}")]
pub struct FrameUnanswered {
    pub why: String,
}

impl SteppedFrame {
    /// The frame `observation` shows, with nothing else said of it.
    pub fn of(observation: Observation) -> Self {
        SteppedFrame { observation, animations: None, compose_us: None, unchanged: false, over_bound: Vec::new() }
    }
}

/// What `stepped_end` answers: whether a rerun from the same start would
/// draw the same frames, as far as the app can tell, and why not.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ClockEnded {
    pub same_on_rerun: bool,
    pub why: Vec<String>,
}

/// How a streamed screencast begins.
#[derive(Clone, Debug, PartialEq)]
pub struct StreamBegin {
    pub fps: u32,
    pub parts: Vec<FramePart>,
    pub region: Option<Region>,
    pub scale: Option<f64>,
    pub requester: String,
}

/// One frame the platform presented.
#[derive(Clone, Debug, PartialEq)]
pub struct StreamedFrame {
    /// When the platform presented it, from the stream's begin, in microseconds.
    pub presented_us: u64,
    pub observation: Observation,
    /// The platform says nothing changed on the display since the frame before.
    pub unchanged: bool,
}
```

A frames answer carries captures, and the wire binding spells a capture's
pixels as a CBOR byte string (`x0k:implementation/ui-control/endpoint`, "Values
on the wire"). Each frame's observation is encoded as an observation is.

<a name="chunk-screencast-hooks-2"></a><sub>[`src/screencast.rs`](../../crates/x0k-ui-endpoint/src/screencast.rs) · `#screencast-hooks` · continues</sub>

```rust {#screencast-hooks}
/// A frames answer as a `Datum`, each capture's pixels a byte string.
pub fn encode_frames(answer: &FramesAnswer) -> Result<Datum, BadValue> {
    let FramesAnswer::Frames { frames, next } = answer else { return to_wire(answer) };
    let mut encoded = Vec::new();
    for frame in frames {
        encoded.push(encode_cast_frame(frame)?);
    }
    let mut body = BTreeMap::from([("frames".to_string(), Datum::List(encoded))]);
    if let Some(next) = next {
        body.insert("next".to_string(), to_wire(next)?);
    }
    Ok(Datum::Map(BTreeMap::from([("frames".to_string(), Datum::Map(body))])))
}

/// One frame as a `Datum`, its capture's pixels a byte string.
pub fn encode_cast_frame(frame: &CastFrame) -> Result<Datum, BadValue> {
    let plain = CastFrame { observation: Observation { capture: None, ..frame.observation.clone() }, ..frame.clone() };
    let mut datum = to_wire(&plain)?;
    if let Datum::Map(fields) = &mut datum {
        fields.insert("observation".to_string(), encode_observation(&frame.observation)?);
    }
    Ok(datum)
}

/// The frames answer `datum` carries.
pub fn decode_frames(datum: &Datum) -> Result<FramesAnswer, BadValue> {
    let body = match datum {
        Datum::Map(fields) => fields.get("frames"),
        _ => None,
    };
    let Some(Datum::Map(body)) = body else { return from_wire(datum) };
    let mut frames = Vec::new();
    if let Some(Datum::List(listed)) = body.get("frames") {
        for frame in listed {
            let Datum::Map(fields) = frame else { return Err(BadValue("a frame is not a map".to_string())) };
            let mut plain = fields.clone();
            let Some(observation) = plain.remove("observation") else {
                return Err(BadValue("a frame names no observation".to_string()));
            };
            let observation = decode_observation(&observation)?;
            plain.insert("observation".to_string(), Datum::Map(BTreeMap::new()));
            let mut frame: CastFrame = from_wire(&Datum::Map(plain))?;
            frame.observation = observation;
            frames.push(frame);
        }
    }
    let next = body.get("next").map(from_wire).transpose()?;
    Ok(FramesAnswer::Frames { frames, next })
}
```

## Admitting a cast

`admit` makes every check in the order "What holds" names, then takes the
hold for a stepped cast. The interfaces the grant holds are
`Endpoint::holding`'s, or every UI interface, so that a cast to an app whose
offer does not name `ui/screencast` is refused for the offer, not the grant. A `present` step is
checked against the live state as it stands at admission, which is what a
driver resolving a fixture sequence against the live head expects
(`x0k:architecture/ui-screencast` §4).

The hold is asked last, once nothing else can refuse the cast, so the person
is never asked for a hold the endpoint would refuse anyway. A host whose offer
says it holds no takeover cannot hold a stepped screencast's window either,
and is refused as `takeover_unheld`.

<a name="chunk-cast"></a><sub>[`src/server/cast.rs`](../../crates/x0k-ui-endpoint/src/server/cast.rs) · `#cast`</sub>

```rust {#cast file="src/server/cast.rs"}
//! How the endpoint plays a screencast (`ui-screencast` §2 to §6), and holds
//! it for its session.

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use x0k_operation_wire::frame::DEFAULT_FRAME_CAP;
use x0k_ui_protocol::fixture::{check_present, ReleaseCall};
use x0k_ui_protocol::input::{check_delivers, check_perform, Pace, Perform};
use x0k_ui_protocol::observe::{Part, PartRefused, Region};
use x0k_ui_protocol::offer::{UI_ACT, UI_HISTORY, UI_INPUT, UI_OBSERVE, UI_SCREENCAST};
use x0k_ui_protocol::screencast::{
    check_cast, frame_time_ns, screencast_trace_hash, unknown_screencast, Admitted, CastAnswer, CastCall, CastEnd, CastFrame,
    Clock, DiscardAnswer, DiscardCall, FramePart, FrameRow, FramesAnswer, FramesCall, RunStep, Screencast,
};
use x0k_ui_protocol::{Refused, RefusalCode};

use super::{Endpoint, UiApp};
use crate::screencast::{encode_cast_frame, FrameUnanswered, StepTo, SteppedBegin, StreamBegin, StreamedFrame};
use crate::takeover::{HoldKind, Requester};
use crate::{InvokeAnswer, PerformAnswer, PresentAnswer, ReleaseAnswer};

/// What a frames answer leaves under the frame bound for the frame's own
/// fields and the session's envelope.
const FRAME_SLACK: usize = 64 * 1024;

/// A screencast the endpoint holds for one session.
struct Held {
    handle: String,
    region: Option<Region>,
    scale: Option<f64>,
    frames: Vec<CastFrame>,
}

/// The screencast each session holds, at most one.
#[derive(Default)]
pub(super) struct Casts {
    held: Mutex<BTreeMap<Option<u64>, Held>>,
    made: AtomicU64,
}

impl Casts {
    fn handle(&self, session: Option<u64>) -> String {
        let made = self.made.fetch_add(1, Ordering::Relaxed);
        match session {
            Some(session) => format!("sc_{session}_{made}"),
            None => format!("sc_{made}"),
        }
    }

    fn keep(&self, session: Option<u64>, held: Held) {
        if let Ok(mut casts) = self.held.lock() {
            casts.insert(session, held);
        }
    }

    /// Drop the screencast `session` holds, if it holds one.
    pub(super) fn drop_session(&self, session: Option<u64>) {
        if let Ok(mut casts) = self.held.lock() {
            casts.remove(&session);
        }
    }

    /// The session holding the screencast `handle`, if one does.
    fn holder(casts: &BTreeMap<Option<u64>, Held>, handle: &str) -> Option<Option<u64>> {
        casts.iter().find(|(_, held)| held.handle == handle).map(|(session, _)| *session)
    }
}

impl<A: UiApp> Endpoint<A> {
    async fn admit(&self, call: &CastCall, requester: &Requester) -> Result<Admitted, Refused> {
        let offer = self.app.offer().await;
        let every = [UI_OBSERVE, UI_ACT, UI_INPUT, UI_HISTORY, UI_SCREENCAST].map(String::from).to_vec();
        let holds = self.holds.clone().unwrap_or(every);
        let admitted = check_cast(&offer, &holds, &self.grant, call)?;
        let presents = call.run.iter().any(|timed| matches!(timed.step, RunStep::Present { .. }));
        let live = match presents {
            true => self.app.live_state().await,
            false => None,
        };
        let shape = self.app.state_shape();
        let frames = self.app.held_frames().await;
        for timed in &call.run {
            match &timed.step {
                RunStep::Present { present, .. } => {
                    check_present(&offer, live.as_ref(), shape.as_ref(), present)?;
                }
                RunStep::Perform { perform } => {
                    check_perform(&offer, &frames, perform)?;
                    check_delivers(perform, self.app.delivers())?;
                }
                RunStep::Invoke { .. } | RunStep::Release => {}
            }
        }
        if let Some(why) = self.app.cannot_paint().await {
            return Err(Refused::new(RefusalCode::CannotPaint, UI_SCREENCAST, why));
        }
        if admitted.clock == Clock::Stepped {
            if !offer.input.is_some_and(|input| input.takeover) {
                let why = "a stepped screencast holds the window, and the offer does not say the host holds one";
                return Err(Refused::new(RefusalCode::TakeoverUnheld, UI_SCREENCAST, why));
            }
            self.hold_for(HoldKind::SteppedScreencast, requester).await?;
        }
        Ok(admitted)
    }
}
```

## Playing the steps

A run's state is the next step to play, the fixture the run presented, and
what makes a rerun differ. A step is due before frame *n* when the frame it
first shows in is *n* or earlier. Each plays as the endpoint's own call, with
the session and requester of the cast, so a step is answered as the same call
outside a cast would be. A `perform` step plays at the fast pace and asks no
takeover of its own, since the cast already holds the window or does not need
it.

A rerun is the same only from a start a `present` fixed, with every effect
simulated or refused (§5). So a run that does not open with a `present` at 0 ms,
or one whose `invoke` step the app performed, says why not.

<a name="chunk-cast-2"></a><sub>[`src/screencast.rs`](../../crates/x0k-ui-endpoint/src/screencast.rs) · `#cast` · continues</sub>

```rust {#cast}
/// Where a run has got to.
struct RunState {
    next: usize,
    /// The fixture the run presented, while it stands.
    fixture: Option<String>,
    not_same: Vec<String>,
}

impl RunState {
    fn new(call: &CastCall) -> Self {
        let fixed = matches!(call.run.first(), Some(first) if first.at_ms == 0 && matches!(first.step, RunStep::Present { .. }));
        let not_same = match fixed {
            true => Vec::new(),
            false => vec!["no fixture at the start".to_string()],
        };
        RunState { next: 0, fixture: None, not_same }
    }

    /// The next step due before frame `index`, if one is.
    fn due(&mut self, admitted: &Admitted, index: u64) -> Option<usize> {
        let due = admitted.step_frames.get(self.next).is_some_and(|frame| *frame <= index);
        due.then(|| {
            self.next += 1;
            self.next - 1
        })
    }

    fn done(&self, call: &CastCall) -> bool {
        self.next >= call.run.len()
    }
}

impl<A: UiApp> Endpoint<A> {
    async fn play_step(
        &self,
        run: &mut RunState,
        index: usize,
        step: &RunStep,
        session: Option<u64>,
        requester: &Requester,
    ) -> Result<(), CastEnd> {
        let failed = |refused: Refused| CastEnd::Failed { step: Some(index as u64), why: refused.why.clone(), refused: Some(refused) };
        match step {
            RunStep::Invoke { invoke } => match self.invoke(invoke.clone(), session).await {
                InvokeAnswer::Refused(refused) => Err(failed(refused)),
                InvokeAnswer::Done { .. } => {
                    run.not_same.push(format!("an effect performed: {}", invoke.action));
                    Ok(())
                }
                _ => Ok(()),
            },
            RunStep::Perform { perform } => {
                let perform = Perform { takeover: false, pace: Pace::Fast, ..perform.clone() };
                match self.perform(perform, session, requester).await {
                    PerformAnswer::Refused(refused) => Err(failed(refused)),
                    PerformAnswer::Done { .. } => Ok(()),
                }
            }
            RunStep::Present { present, .. } => match self.present(present.clone(), session).await {
                PresentAnswer::Presented { handle, .. } => {
                    run.fixture = Some(handle);
                    Ok(())
                }
                PresentAnswer::Refused(refused) => Err(failed(refused)),
            },
            RunStep::Release => {
                let handle = run.fixture.take().unwrap_or_default();
                match self.release(ReleaseCall { handle }).await {
                    ReleaseAnswer::Released { .. } | ReleaseAnswer::Ended { .. } => Ok(()),
                    ReleaseAnswer::Refused(refused) => Err(failed(refused)),
                    ReleaseAnswer::NotStanding { handle } => {
                        let why = format!("the run's fixture {handle} no longer stands");
                        Err(failed(Refused::new(RefusalCode::MisfitArguments, &format!("run/{index}"), why)))
                    }
                }
            }
        }
    }
```

## The stepped clock

The endpoint begins the app's clock at the date the cast names, or at the
Unix epoch when it names none, so a rerun from one date reads one time. For
each frame from 0 to the last the call allows, the endpoint plays the steps
due, steps the app's clock to the frame and keeps what it drew. It ends
the screencast `settled` once every step has played and the frames have not
changed for the settle time, `max_time` at the last frame, and `failed` when a
step is refused or the app's `step_to` ends it. Whatever ended it, it then
calls `stepped_end`, so the app gives the page back to the wall's clock and
ends the hold.

A frame changed when its row differs from the row before by capture and state,
and the app has not said it is unchanged. A step's own frame counts as a
change, so the settle time runs from the later of the last step and the last
change.

<a name="chunk-cast-3"></a><sub>[`src/screencast.rs`](../../crates/x0k-ui-endpoint/src/screencast.rs) · `#cast` · continues</sub>

```rust {#cast}
    async fn play_stepped(
        &self,
        call: &CastCall,
        admitted: &Admitted,
        session: Option<u64>,
        requester: &Requester,
    ) -> Result<Played, Refused> {
        let begin = SteppedBegin {
            fps: call.fps,
            parts: call.parts.clone(),
            region: call.region,
            scale: call.scale,
            presented: call.presented,
            requester: requester.to_string(),
            date: call.date.unwrap_or(0),
        };
        let begun = match self.app.stepped_begin(&begin).await {
            Ok(begun) => begun,
            Err(refused) => {
                self.app.stepped_end().await;
                return Err(refused);
            }
        };
        let mut played = Played { unstepped: begun.unstepped, ..Played::default() };
        let mut run = RunState::new(call);
        let settle_ns = call.settle_ms.saturating_mul(1_000_000);
        let mut quiet_since = 0;
        'frames: for index in 0..=admitted.last_frame {
            let time_ns = frame_time_ns(index, call.fps);
            while let Some(step) = run.due(admitted, index) {
                if let Err(ended) = self.play_step(&mut run, step, &call.run[step].step, session, requester).await {
                    played.ended = ended;
                    break 'frames;
                }
                quiet_since = time_ns;
            }
            let tick_ns = index.checked_sub(1).map_or(0, |before| time_ns - frame_time_ns(before, call.fps));
            let frame = match self.app.step_to(StepTo { index, time_ns, tick_ns }).await {
                Ok(frame) => frame,
                Err(FrameUnanswered { why }) => {
                    played.ended = CastEnd::Failed { step: None, why, refused: None };
                    break;
                }
            };
            let mut row = FrameRow::of(index, call.fps, &frame.observation);
            row.compose_us = frame.compose_us;
            row.unchanged = frame.unchanged;
            if played.rows.last().is_none_or(|before| !row.same_as(before)) {
                quiet_since = quiet_since.max(time_ns);
            }
            run.not_same.extend(frame.over_bound.iter().map(|work| format!("pending work reached its bound: {work}")));
            played.rows.push(row);
            played.frames.push(CastFrame { index, observation: frame.observation, animations: frame.animations });
            if !call.run.is_empty() && run.done(call) && time_ns - quiet_since >= settle_ns {
                played.ended = CastEnd::Settled;
                break;
            }
        }
        let ended = self.app.stepped_end().await;
        run.not_same.extend(ended.why.into_iter().filter(|_| !ended.same_on_rerun));
        self.release_run(call, &mut run).await;
        played.not_same = run.not_same;
        Ok(played)
    }

    /// Release the fixture the run presented, unless its last step keeps it.
    async fn release_run(&self, call: &CastCall, run: &mut RunState) {
        let kept = matches!(call.run.last(), Some(last) if matches!(last.step, RunStep::Present { keep: true, .. }));
        if let (false, Some(handle)) = (kept, run.fixture.take()) {
            let answer = self.release(ReleaseCall { handle }).await;
            tracing::debug!(?answer, "ui endpoint: a screencast's end released the fixture its run presented");
        }
    }
```

## The streamed clock

A streamed screencast plays its steps on the wall's clock and takes the
platform's frames as they come, once per frame interval. Its frames follow
the wall, so a rerun never promises the same ones. When it ends, the endpoint
holds the frames at the asked rate: each frame *k* is the latest frame the
platform presented at or before *k*'s time, as ffmpeg's constant-rate output
is (§6), the first presented frame standing for any earlier, and a frame that
repeats the one before it says it is unchanged.

<a name="chunk-cast-4"></a><sub>[`src/screencast.rs`](../../crates/x0k-ui-endpoint/src/screencast.rs) · `#cast` · continues</sub>

```rust {#cast}
    async fn play_streamed(
        &self,
        call: &CastCall,
        admitted: &Admitted,
        session: Option<u64>,
        requester: &Requester,
    ) -> Result<Played, Refused> {
        let begin = StreamBegin {
            fps: call.fps,
            parts: call.parts.clone(),
            region: call.region,
            scale: call.scale,
            requester: requester.to_string(),
        };
        self.app.stream_begin(&begin).await?;
        let mut played = Played { not_same: vec!["a streamed clock follows the wall's".to_string()], ..Played::default() };
        let mut run = RunState::new(call);
        let start = Instant::now();
        let interval = Duration::from_nanos(frame_time_ns(1, call.fps).max(1));
        let (max_us, settle_us) = (call.max_ms.saturating_mul(1000), call.settle_ms.saturating_mul(1000));
        let mut taken: Vec<StreamedFrame> = Vec::new();
        let mut quiet_since = 0;
        let mut now_us = 0;
        loop {
            now_us = u64::try_from(start.elapsed().as_micros()).unwrap_or(u64::MAX).max(now_us);
            let frame_now = admitted.last_frame.min(now_us * u64::from(call.fps) / 1_000_000);
            while let Some(step) = run.due(admitted, frame_now) {
                if let Err(ended) = self.play_step(&mut run, step, &call.run[step].step, session, requester).await {
                    played.ended = ended;
                    break;
                }
                quiet_since = now_us;
            }
            if matches!(played.ended, CastEnd::Failed { .. }) {
                break;
            }
            for frame in self.app.stream_take().await {
                let row = FrameRow::of(0, call.fps, &frame.observation);
                let before = taken.last().map(|before| FrameRow::of(0, call.fps, &before.observation));
                if !frame.unchanged && before.is_none_or(|before| !row.same_as(&before)) {
                    quiet_since = quiet_since.max(frame.presented_us);
                }
                taken.push(frame);
            }
            if now_us >= max_us {
                break;
            }
            if !call.run.is_empty() && run.done(call) && now_us.saturating_sub(quiet_since) >= settle_us {
                played.ended = CastEnd::Settled;
                break;
            }
            tokio::time::sleep(interval).await;
        }
        self.app.stream_end().await;
        taken.extend(self.app.stream_take().await);
        self.release_run(call, &mut run).await;
        let last = admitted.last_frame.min(now_us.min(max_us) * u64::from(call.fps) / 1_000_000);
        let mut source = 0;
        for index in 0..=last {
            let Some(first) = taken.first() else { break };
            let time_us = frame_time_ns(index, call.fps) / 1000;
            let before = source;
            while taken.get(source + 1).is_some_and(|next| next.presented_us <= time_us) {
                source += 1;
            }
            let frame = taken.get(source).unwrap_or(first);
            let mut row = FrameRow::of(index, call.fps, &frame.observation);
            row.presented_us = Some(frame.presented_us);
            row.unchanged = index > 0 && (source == before || frame.unchanged);
            played.rows.push(row);
            played.frames.push(CastFrame { index, observation: frame.observation.clone(), animations: None });
        }
        if taken.is_empty() && !matches!(played.ended, CastEnd::Failed { .. }) {
            played.ended = CastEnd::Failed { step: None, why: "the platform presented no frame".to_string(), refused: None };
        }
        played.not_same.extend(run.not_same);
        Ok(played)
    }
```

## The cast, its frames and its discard

`cast` admits the call, drops the screencast the session held, plays the run at
its clock and keeps what it drew under a new handle. The answer's rows run
from frame 0 to the last drawn, and its trace hash is over them.

`frames` answers the frames asked for, in the order asked, with only the parts
asked for and what each frame shows. It stops before the frame that would put
the answer over the endpoint's frame bound (`ui-interfaces` §6) and names it as
the next to ask for; a frame that alone would pass the bound has its capture
refused, naming the bound, so the call still moves. A capture asked at another
region or scale than the cast's is refused as a part.

<a name="chunk-cast-5"></a><sub>[`src/screencast.rs`](../../crates/x0k-ui-endpoint/src/screencast.rs) · `#cast` · continues</sub>

```rust {#cast}
    /// Play `call`, and keep its frames for `session`.
    pub(super) async fn cast(&self, call: CastCall, session: Option<u64>, requester: &Requester) -> CastAnswer {
        let admitted = match self.admit(&call, requester).await {
            Ok(admitted) => admitted,
            Err(refused) => return CastAnswer::Refused(refused),
        };
        self.casts.drop_session(session);
        let played = match admitted.clock {
            Clock::Stepped => self.play_stepped(&call, &admitted, session, requester).await,
            Clock::Streamed | Clock::Sampled => self.play_streamed(&call, &admitted, session, requester).await,
        };
        let played = match played {
            Ok(played) => played,
            Err(refused) => return CastAnswer::Refused(refused),
        };
        let handle = self.casts.handle(session);
        tracing::info!(
            event_type = "ui_control.screencast",
            handle = %handle,
            clock = ?admitted.clock,
            fps = call.fps,
            frames = played.rows.len(),
            ended = ?played.ended,
            "ui endpoint: a screencast ended"
        );
        let screencast = Screencast {
            handle: handle.clone(),
            clock: admitted.clock,
            fps: call.fps,
            frame_count: played.rows.len() as u64,
            ended: played.ended,
            same_on_rerun: played.not_same.is_empty(),
            not_same: played.not_same,
            unstepped: played.unstepped,
            trace_hash: screencast_trace_hash(&played.rows),
            rows: played.rows,
        };
        self.casts.keep(session, Held { handle, region: call.region, scale: call.scale, frames: played.frames });
        CastAnswer::Cast(screencast)
    }

    /// The frames of the screencast `call` names that it asks for.
    pub(super) fn frames(&self, call: FramesCall) -> FramesAnswer {
        let Ok(casts) = self.casts.held.lock() else { return FramesAnswer::Refused(unknown_screencast(&call.handle)) };
        let Some(held) = Casts::holder(&casts, &call.handle).and_then(|session| casts.get(&session)) else {
            return FramesAnswer::Refused(unknown_screencast(&call.handle));
        };
        let budget = DEFAULT_FRAME_CAP - FRAME_SLACK;
        let (mut used, mut frames, mut next) = (0, Vec::new(), None);
        for (at, index) in call.indices.iter().enumerate() {
            let Some(frame) = usize::try_from(*index).ok().and_then(|index| held.frames.get(index)) else {
                let why = format!("the screencast has {} frames, and frame {index} is not one", held.frames.len());
                return FramesAnswer::Refused(Refused::new(RefusalCode::MisfitArguments, &format!("indices/{at}"), why));
            };
            let mut frame = only_parts(frame, &call, held);
            let mut size = encoded_size(&frame);
            if size > budget && frame.observation.capture.take().is_some() {
                let why = format!("the frame's capture would put the answer over the endpoint's bound of {DEFAULT_FRAME_CAP} bytes");
                frame.observation.refused.push(PartRefused { part: Part::Capture, code: None, why });
                size = encoded_size(&frame);
            }
            if used + size > budget && !frames.is_empty() {
                next = Some(*index);
                break;
            }
            used += size;
            frames.push(frame);
        }
        FramesAnswer::Frames { frames, next }
    }

    /// Drop the screencast `call` names.
    pub(super) fn discard(&self, call: DiscardCall) -> DiscardAnswer {
        let Ok(mut casts) = self.casts.held.lock() else { return DiscardAnswer::Refused(unknown_screencast(&call.handle)) };
        match Casts::holder(&casts, &call.handle) {
            Some(session) => {
                casts.remove(&session);
                DiscardAnswer::Discarded { handle: call.handle }
            }
            None => DiscardAnswer::Refused(unknown_screencast(&call.handle)),
        }
    }
}

/// What a screencast drew, as it plays.
struct Played {
    rows: Vec<FrameRow>,
    frames: Vec<CastFrame>,
    ended: CastEnd,
    not_same: Vec<String>,
    unstepped: Vec<String>,
}

impl Default for Played {
    fn default() -> Self {
        Played { rows: Vec::new(), frames: Vec::new(), ended: CastEnd::MaxTime, not_same: Vec::new(), unstepped: Vec::new() }
    }
}

/// `frame` with only the parts `call` asks for.
fn only_parts(frame: &CastFrame, call: &FramesCall, held: &Held) -> CastFrame {
    let wants = |part| call.parts.contains(&part);
    let mut observation = frame.observation.clone();
    let asked = [(FramePart::Capture, Part::Capture), (FramePart::Layout, Part::Layout), (FramePart::State, Part::State)];
    observation.refused.retain(|refusal| asked.iter().any(|(wanted, part)| wants(*wanted) && *part == refusal.part));
    if !wants(FramePart::Capture) {
        observation.capture = None;
    } else if (call.region, call.scale) != (held.region, held.scale) && call.region.is_some() | call.scale.is_some() {
        let why = "the endpoint keeps each capture at the cast's region and scale; cut it from the frame already pulled";
        if observation.capture.take().is_some() {
            observation.refused.push(PartRefused { part: Part::Capture, code: None, why: why.to_string() });
        }
    }
    if !wants(FramePart::Layout) {
        observation.layout = None;
    }
    if !wants(FramePart::State) {
        observation.state = None;
    }
    let animations = frame.animations.clone().filter(|_| wants(FramePart::Animations));
    CastFrame { index: frame.index, observation, animations }
}

fn encoded_size(frame: &CastFrame) -> usize {
    encode_cast_frame(frame).map_or(usize::MAX, |datum| datum.to_cbor().len())
}
```

## Holding it to the decision

The test is a small stepped app on an in-memory pipe, driven through the
client, as the endpoint's own test is. Its clock is the frame index it was
stepped to, and its state is the fixture that stands, so a row says which
fixture each frame showed. Each claim is one of §2, §4, §5 and §9's checks:

- a `present` at 100 ms is first shown in frame 6 at 60 fps and in frame 12 at
  120 fps, the app is stepped once per frame with the tick since the frame
  before, and the screencast settles;
- a run with a `perform` step is refused under a grant that does not hold
  `ui/input`, before the app's clock begins;
- a `present` step asking `mark: false` is refused as `mark_required` outside
  a dev instance, before anything plays;
- a handle is read from another session while its own lasts, and is unknown
  once its session ends;
- `frames` reads a frame the cast kept and `discard` drops it;
- a stepped cast under a configuration that allows the hold plays without an
  ask and still holds the window, and one the configuration refuses is refused
  as `takeover_not_granted` before anything plays;
- an app that names no screencast hook refuses a cast, saying it offers none.

<a name="chunk-screencast-test"></a><sub>[`src/screencast/tests.rs`](../../crates/x0k-ui-endpoint/src/screencast/tests.rs) · `#screencast-test`</sub>

```rust {#screencast-test file="src/screencast/tests.rs"}
//! A stepped app's screencasts, driven through the client.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use crate::client::UiClient;
use crate::screencast::{Begun, ClockEnded, FrameUnanswered, StepTo, SteppedBegin, SteppedFrame};
use crate::server::{serve_connection, Endpoint, UiApp};
use crate::takeover::{HoldAnswer, HoldMatch, TakeoverPolicy};
use crate::{CastAnswer, DiscardAnswer, FramesAnswer, ReleaseAnswer};
use x0k_ui_protocol::act::{Grant, Outcome};
use x0k_ui_protocol::fixture::{Fixture, PresentAnswer, PresentCall};
use x0k_ui_protocol::history::{HistoryOffer, Shown};
use x0k_ui_protocol::input::{HeldFrame, InputOffer, Perform, Resolved, Source, Step};
use x0k_ui_protocol::observe::{Capture, Observation, ObserveCall, StatePart};
use x0k_ui_protocol::offer::{Action, Offer, SideEffect, UI_HISTORY, UI_SCREENCAST};
use x0k_ui_protocol::screencast::{
    CastCall, CastEnd, Clock, DiscardCall, FramePart, FrameRow, FramesCall, RunStep, ScreencastOffer, TimedStep,
};
use x0k_ui_protocol::shapes::{interface, interfaces, shape_pin};
use x0k_ui_protocol::RefusalCode;

#[derive(Clone, Default)]
struct Stepped {
    /// Whether it names the screencast hooks at all.
    hooks: bool,
    dev_instance: bool,
    /// The fixture's state, while one stands.
    fixture: Arc<Mutex<Option<Value>>>,
    /// Each frame it was stepped to.
    steps: Arc<Mutex<Vec<StepTo>>>,
    begun: Arc<Mutex<usize>>,
    /// The date each begin named.
    dates: Arc<Mutex<Vec<u64>>>,
    ended: Arc<Mutex<usize>>,
    /// Whom the person was asked to grant a hold, and for whom it held one.
    asked: Arc<Mutex<Vec<String>>>,
    held_for: Arc<Mutex<Vec<String>>>,
}

fn any_shape() -> x0k_datum::Datum {
    x0k_datum::Datum::from_json(&json!({"kind": "any"}))
}

impl Stepped {
    fn observation(&self) -> Observation {
        let state = self.fixture.lock().expect("the app's lock").clone();
        let shown = match &state {
            Some(_) => Shown::Fixture { handle: "x1".to_string() },
            None => Shown::Live,
        };
        let value = state.unwrap_or(json!({"cards": 0}));
        let png = serde_json::to_vec(&value).expect("JSON");
        Observation {
            frame: Some("f".to_string()),
            capture: Some(Capture { png, width: 4, height: 2, scale_factor: 1.0, presented: false }),
            layout: None,
            state: Some(StatePart { value, head: "s1".to_string(), fingerprint: shape_pin(&any_shape()) }),
            refused: Vec::new(),
            shown: Some(shown),
        }
    }
}

impl UiApp for Stepped {
    async fn offer(&self) -> Offer {
        let screencast = interface(UI_SCREENCAST).filter(|_| self.hooks);
        Offer {
            app: "stepped".to_string(),
            instance: "1".to_string(),
            interfaces: interfaces().into_iter().chain(interface(UI_HISTORY)).chain(screencast).collect(),
            actions: Vec::new(),
            state_head: Some("s1".to_string()),
            history: Some(HistoryOffer { oldest: None, newest: None, fixtures: true }),
            grades: Vec::new(),
            replay_policy: Vec::new(),
            sandboxes: Vec::new(),
            input: Some(InputOffer { presents: false, takeover: true }),
            dev_instance: self.dev_instance,
            screencast: self.hooks.then(|| ScreencastOffer {
                clocks: vec![Clock::Stepped],
                max_frames: 3600,
                max_ms: 60_000,
                unstepped: Vec::new(),
            }),
        }
    }

    async fn observe(&self, _call: ObserveCall) -> Observation {
        self.observation()
    }

    async fn invoke(&self, _action: &Action, _args: Value) -> Outcome {
        Outcome::Done { result: Value::Null, frame: None }
    }

    async fn held_frames(&self) -> Vec<HeldFrame> {
        vec![HeldFrame { frame: "f".to_string(), width: 4, height: 2, layout: None }]
    }

    async fn perform(&self, _perform: Perform, _resolved: Vec<Resolved>) -> Option<String> {
        None
    }

    async fn grant_takeover(&self, requester: &str) -> bool {
        self.asked.lock().expect("the app's lock").push(requester.to_string());
        true
    }

    async fn hold_takeover(&self, requester: &str) -> bool {
        self.held_for.lock().expect("the app's lock").push(requester.to_string());
        true
    }

    async fn shown(&self) -> Shown {
        self.observation().shown.unwrap_or(Shown::Live)
    }

    fn state_shape(&self) -> Option<x0k_datum::Datum> {
        Some(any_shape())
    }

    async fn live_state(&self) -> Option<StatePart> {
        Some(StatePart { value: json!({"cards": 0}), head: "s1".to_string(), fingerprint: shape_pin(&any_shape()) })
    }

    async fn present(&self, state: Value, _marked: bool) -> PresentAnswer {
        *self.fixture.lock().expect("the app's lock") = Some(state);
        PresentAnswer::Presented { handle: "x1".to_string(), frame: None }
    }

    async fn release(&self, handle: String) -> ReleaseAnswer {
        match self.fixture.lock().expect("the app's lock").take() {
            Some(_) => ReleaseAnswer::Released { frame: None },
            None => ReleaseAnswer::NotStanding { handle },
        }
    }

    async fn stepped_begin(&self, begin: &SteppedBegin) -> Result<Begun, x0k_ui_protocol::Refused> {
        if !self.hooks {
            return Err(x0k_ui_protocol::Refused::new(RefusalCode::NoScreencastInterface, UI_SCREENCAST, "no hooks"));
        }
        *self.begun.lock().expect("the app's lock") += 1;
        self.dates.lock().expect("the app's lock").push(begin.date);
        Ok(Begun::default())
    }

    async fn step_to(&self, to: StepTo) -> Result<SteppedFrame, FrameUnanswered> {
        self.steps.lock().expect("the app's lock").push(to);
        Ok(SteppedFrame::of(self.observation()))
    }

    async fn stepped_end(&self) -> ClockEnded {
        *self.ended.lock().expect("the app's lock") += 1;
        ClockEnded { same_on_rerun: true, why: Vec::new() }
    }
}

fn every_class() -> Grant {
    Grant { classes: vec![SideEffect::ReadOnly, SideEffect::IdempotentWrite, SideEffect::NonIdempotent] }
}

async fn client(endpoint: Arc<Endpoint<Stepped>>) -> UiClient {
    let (near, far) = tokio::io::duplex(1 << 22);
    tokio::spawn(serve_connection(far, endpoint));
    UiClient::open(near).await.expect("the session opens")
}

fn present(state: Value, mark: Option<bool>) -> RunStep {
    let fixture = Fixture::State { state };
    RunStep::Present { present: PresentCall { fixture, fingerprint: shape_pin(&any_shape()), if_match: None, mark }, keep: false }
}

fn sequence(fps: u32) -> CastCall {
    CastCall {
        run: vec![
            TimedStep { at_ms: 0, step: present(json!({"cards": 1}), None) },
            TimedStep { at_ms: 100, step: present(json!({"cards": 2}), None) },
        ],
        fps,
        max_ms: 2000,
        settle_ms: 300,
        clock: None,
        parts: vec![FramePart::Capture, FramePart::State],
        region: None,
        scale: None,
        presented: false,
        date: None,
    }
}

const CAST_WAIT: Duration = Duration::from_secs(20);

fn allowing() -> TakeoverPolicy {
    TakeoverPolicy::default().otherwise(HoldAnswer::Allow)
}

fn screencast(answer: CastAnswer) -> x0k_ui_protocol::screencast::Screencast {
    match answer {
        CastAnswer::Cast(screencast) => screencast,
        CastAnswer::Refused(refused) => panic!("the cast was refused: {refused:?}"),
    }
}

/// The first frame whose row shows `cards`.
fn first_showing(screencast: &x0k_ui_protocol::screencast::Screencast, cards: u64) -> Option<u64> {
    let app = Stepped::default();
    *app.fixture.lock().expect("the app's lock") = Some(json!({"cards": cards}));
    let wanted = FrameRow::of(0, screencast.fps, &app.observation()).png_hash;
    screencast.rows.iter().find(|row| row.png_hash == wanted).map(|row| row.index)
}

#[tokio::test]
async fn a_present_at_100_ms_first_shows_in_frame_6_at_60_fps_and_frame_12_at_120() {
    for (fps, frame) in [(60, 6), (120, 12)] {
        let app = Stepped { hooks: true, ..Stepped::default() };
        let endpoint = Arc::new(Endpoint::new(app.clone(), every_class()).with_takeover(allowing()));
        let client = client(endpoint).await;
        let cast = screencast(client.cast(&sequence(fps), CAST_WAIT).await.expect("an answer"));
        assert_eq!(first_showing(&cast, 1), Some(0), "the first present shows in frame 0");
        assert_eq!(first_showing(&cast, 2), Some(frame), "at {fps} fps");
        assert_eq!(cast.ended, CastEnd::Settled);
        let rows: Vec<u64> = cast.rows.iter().map(|row| row.index).collect();
        assert_eq!(rows, (0..cast.frame_count).collect::<Vec<_>>(), "a row per frame, none missing");
        let settled = frame + u64::from(fps) * 300 / 1000;
        assert_eq!(cast.frame_count, settled + 1, "it ends once 300 ms pass unchanged after the last step");
        assert_eq!(cast.trace_hash, x0k_ui_protocol::screencast::screencast_trace_hash(&cast.rows));
        assert!(cast.same_on_rerun, "a run from a fixture with no effect: {:?}", cast.not_same);
        let steps = app.steps.lock().expect("the app's lock").clone();
        assert_eq!(steps.len() as u64, cast.frame_count, "one step of the clock per frame");
        assert_eq!(steps[1].tick_ns, 1_000_000_000 / u64::from(fps));
        assert_eq!(steps[frame as usize].time_ms(), 100.0);
        assert_eq!(*app.ended.lock().expect("the app's lock"), 1, "the clock is given back");
        assert!(app.fixture.lock().expect("the app's lock").is_none(), "the run's fixture is released at the end");
        assert_eq!(app.held_for.lock().expect("the app's lock").len(), 1, "the window was held without an ask");
        assert!(app.asked.lock().expect("the app's lock").is_empty());
    }
}

#[tokio::test]
async fn the_clock_begins_at_the_date_the_cast_names_and_at_the_epoch_with_none() {
    let app = Stepped { hooks: true, ..Stepped::default() };
    let endpoint = Arc::new(Endpoint::new(app.clone(), every_class()).with_takeover(allowing()));
    let client = client(endpoint).await;
    let dated = CastCall { date: Some(1_794_500_000_000), ..sequence(60) };
    screencast(client.cast(&dated, CAST_WAIT).await.expect("an answer"));
    screencast(client.cast(&sequence(60), CAST_WAIT).await.expect("an answer"));
    assert_eq!(*app.dates.lock().expect("the app's lock"), vec![1_794_500_000_000, 0]);
}

#[tokio::test]
async fn a_perform_step_is_refused_under_a_grant_without_ui_input_before_the_clock_begins() {
    let app = Stepped { hooks: true, ..Stepped::default() };
    let holds = ["ui/observe", "ui/act", "ui/history", "ui/screencast"];
    let endpoint = Arc::new(Endpoint::new(app.clone(), every_class()).holding(holds).with_takeover(allowing()));
    let client = client(endpoint).await;
    let pause = Source { id: "m".to_string(), kind: "mouse".to_string(), steps: vec![Step::Pause { ms: 50 }] };
    let mut call = sequence(60);
    call.run.push(TimedStep { at_ms: 200, step: RunStep::Perform { perform: Perform::of(vec![pause]) } });
    let CastAnswer::Refused(refused) = client.cast(&call, CAST_WAIT).await.expect("an answer") else {
        panic!("a perform step ran under a grant without ui/input");
    };
    assert_eq!((refused.code, refused.subject.as_deref()), (RefusalCode::OutsideGrant, Some("ui/input")));
    assert_eq!(*app.begun.lock().expect("the app's lock"), 0, "nothing played");
    assert!(app.held_for.lock().expect("the app's lock").is_empty(), "the window was not held");
}

#[tokio::test]
async fn mark_false_is_refused_outside_a_dev_instance_and_played_in_one() {
    for dev_instance in [false, true] {
        let app = Stepped { hooks: true, dev_instance, ..Stepped::default() };
        let endpoint = Arc::new(Endpoint::new(app.clone(), every_class()).with_takeover(allowing()));
        let client = client(endpoint).await;
        let mut call = sequence(60);
        call.run[1].step = present(json!({"cards": 2}), Some(false));
        match (dev_instance, client.cast(&call, CAST_WAIT).await.expect("an answer")) {
            (false, CastAnswer::Refused(refused)) => {
                assert_eq!(refused.code, RefusalCode::MarkRequired);
                assert_eq!(*app.begun.lock().expect("the app's lock"), 0, "nothing played");
            }
            (true, CastAnswer::Cast(cast)) => assert_eq!(cast.ended, CastEnd::Settled),
            (dev_instance, answer) => panic!("a dev instance {dev_instance}: {answer:?}"),
        }
    }
}

#[tokio::test]
async fn a_handle_is_read_from_another_session_and_unknown_once_its_session_ends() {
    let app = Stepped { hooks: true, ..Stepped::default() };
    let endpoint = Arc::new(Endpoint::new(app, every_class()).with_takeover(allowing()));
    let first = client(Arc::clone(&endpoint)).await;
    let cast = screencast(first.cast(&sequence(60), CAST_WAIT).await.expect("an answer"));
    let read = FramesCall { handle: cast.handle.clone(), indices: vec![6], parts: vec![FramePart::State], region: None, scale: None };
    let second = client(Arc::clone(&endpoint)).await;
    let FramesAnswer::Frames { frames, next } = second.frames(&read).await.expect("an answer") else {
        panic!("the handle was refused while its session lasts");
    };
    assert_eq!((frames.len(), next), (1, None));
    assert_eq!(frames[0].observation.state.as_ref().map(|state| state.value.clone()), Some(json!({"cards": 2})));
    assert!(frames[0].observation.capture.is_none(), "only the parts asked for");

    drop(first);
    let mut answer = second.frames(&read).await.expect("an answer");
    for _ in 0..100 {
        if matches!(answer, FramesAnswer::Refused(_)) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
        answer = second.frames(&read).await.expect("an answer");
    }
    let FramesAnswer::Refused(refused) = answer else { panic!("the handle outlived its session") };
    assert_eq!((refused.code, refused.subject.as_deref()), (RefusalCode::UnknownScreencast, Some(cast.handle.as_str())));
}

#[tokio::test]
async fn a_discard_drops_the_screencast() {
    let app = Stepped { hooks: true, ..Stepped::default() };
    let endpoint = Arc::new(Endpoint::new(app, every_class()).with_takeover(allowing()));
    let client = client(endpoint).await;
    let cast = screencast(client.cast(&sequence(60), CAST_WAIT).await.expect("an answer"));
    let discard = DiscardCall { handle: cast.handle.clone() };
    assert!(matches!(client.discard(&discard).await.expect("an answer"), DiscardAnswer::Discarded { .. }));
    let read = FramesCall { handle: cast.handle, indices: vec![0], parts: vec![FramePart::State], region: None, scale: None };
    let FramesAnswer::Refused(refused) = client.frames(&read).await.expect("an answer") else {
        panic!("a discarded screencast was read");
    };
    assert_eq!(refused.code, RefusalCode::UnknownScreencast);
}

#[tokio::test]
async fn the_configuration_answers_a_stepped_casts_hold_before_anything_plays() {
    let app = Stepped { hooks: true, ..Stepped::default() };
    let refusing = TakeoverPolicy::default()
        .rule(HoldMatch { hold: Some(crate::takeover::HoldKind::SteppedScreencast), ..HoldMatch::default() }, HoldAnswer::Refuse)
        .otherwise(HoldAnswer::Allow);
    let endpoint = Arc::new(Endpoint::new(app.clone(), every_class()).with_takeover(refusing));
    let client = client(endpoint).await;
    let CastAnswer::Refused(refused) = client.cast(&sequence(60), CAST_WAIT).await.expect("an answer") else {
        panic!("a hold the configuration refuses played");
    };
    assert_eq!(refused.code, RefusalCode::TakeoverNotGranted);
    assert_eq!(*app.begun.lock().expect("the app's lock"), 0, "nothing played");
    assert!(app.fixture.lock().expect("the app's lock").is_none(), "no fixture was presented");
    assert!(app.asked.lock().expect("the app's lock").is_empty() && app.held_for.lock().expect("the app's lock").is_empty());
}

/// An app that names `ui/screencast` and none of its hooks.
struct Bare(Stepped);

impl UiApp for Bare {
    async fn offer(&self) -> Offer {
        self.0.offer().await
    }

    async fn observe(&self, call: ObserveCall) -> Observation {
        self.0.observe(call).await
    }

    async fn invoke(&self, action: &Action, args: Value) -> Outcome {
        self.0.invoke(action, args).await
    }

    async fn held_frames(&self) -> Vec<HeldFrame> {
        self.0.held_frames().await
    }

    async fn perform(&self, perform: Perform, resolved: Vec<Resolved>) -> Option<String> {
        self.0.perform(perform, resolved).await
    }

    async fn hold_takeover(&self, requester: &str) -> bool {
        self.0.hold_takeover(requester).await
    }
}

#[tokio::test]
async fn an_app_without_the_hooks_refuses_a_cast() {
    let endpoint = Arc::new(Endpoint::new(Bare(Stepped { hooks: true, ..Stepped::default() }), every_class()).with_takeover(allowing()));
    let (near, far) = tokio::io::duplex(1 << 20);
    tokio::spawn(serve_connection(far, endpoint));
    let bare = UiClient::open(near).await.expect("the session opens");
    let call = CastCall { run: Vec::new(), ..sequence(60) };
    let CastAnswer::Refused(refused) = bare.cast(&call, CAST_WAIT).await.expect("an answer") else {
        panic!("an app that names no screencast hook cast one");
    };
    assert_eq!((refused.code, refused.subject.as_deref()), (RefusalCode::NoScreencastInterface, Some(UI_SCREENCAST)));
    assert!(refused.why.contains("offers no screencast"), "{}", refused.why);

    let without = Arc::new(Endpoint::new(Stepped::default(), every_class()).with_takeover(allowing()));
    let unoffered = client(without).await;
    let CastAnswer::Refused(refused) = unoffered.cast(&sequence(60), CAST_WAIT).await.expect("an answer") else {
        panic!("an app whose offer does not name ui/screencast cast one");
    };
    assert_eq!((refused.code, refused.subject.as_deref()), (RefusalCode::NoScreencastInterface, Some(UI_SCREENCAST)));
}
```

## What is open

- `frames` cuts no capture to another region or scale; the driver does, from
  the frame it pulled.
- A host that shows no window to a person, such as `chrome-headless-shell`,
  takes no hold (§5); until the offer can say so, the endpoint asks the
  configuration of every stepped cast, and such a host's configuration allows
  it.
- A `perform` step's pauses run on the screencast's clock only where the app
  delivers the sequence against its stepped clock; the endpoint hands the
  sequence over whole, as `perform` does.
- The streamed clock has no host yet (`29f32859` on macOS, `8c2c5aea` for
  `cdp`); its play is held here only by what the stepped test shares with it.
