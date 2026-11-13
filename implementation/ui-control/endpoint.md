
# x0k-ui-endpoint: an app's end and a driver's end of the UI-control endpoint

```turtle folio:document
implementation:ui-control\/endpoint a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "x0k-ui-endpoint: the UI-control endpoint over the operation wire. An app implements its calls, the endpoint routes them and refuses a bad one before the app hears it, and a driver calls them through a client." ;
    x0k:concerns "ui-control", "protocol", "publication" ;
    x0k:cites implementation:ui-control\/protocol,
        implementation:sync\/operation-session ;
    x0k:implements architecture:ui-control-channel,
        architecture:ui-interfaces ;
    x0k:motivatedBy intent:92f84c75-af31-f9cd-2c7d-562143127bab,
        intent:9a9b3f4d-35b5-11fc-0143-7f250b849a3a,
        intent:2776ace9-bdc5-bc30-5b8b-1fa54a8cc19e ;
    folio:tangleCrate "crates/x0k-ui-endpoint" ;
    folio:tangleRoot "src/lib.rs" .
```

`x0k:architecture/ui-control-channel` §7 says the endpoint speaks the operation
set in canonical CBOR frames. `x0k:implementation/ui-control/protocol` holds the
values, and the operation session holds the frames, the agreement and the
deadlines. This crate joins them. An app implements `UiApp`, and `Endpoint`
answers a session's calls with it. The session comes up on any stream, so a
unix socket and a test's in-memory pipe are the same code.

A session agrees on the operations' shapes as it opens. They are the protocol's
(`x0k:implementation/ui-control/protocol`), so when two ends were built on different
values, a call on an operation they differ over is refused by name and never sent,
and the operations they share still work.

<a name="chunk-manifest"></a><sub>[`Cargo.toml`](../../crates/x0k-ui-endpoint/Cargo.toml) · `#manifest`</sub>

```toml {#manifest file="Cargo.toml"}
[package]
name = "x0k-ui-endpoint"
version = "0.3.1"
edition = { workspace = true }
license = "MIT"
description = "The UI-control endpoint over the operation wire: an app's calls, the checks made before the app hears them, and a driver's client."
repository = "https://github.com/0k-dot-computer/x0k-ui-control"
readme = "../../README.md"
keywords = ["ui", "testing", "automation", "agents", "protocol"]

[features]
default = []
# The frames over a WebSocket, for an app in a browser, a webview or on a phone.
websocket = ["x0k-operation-session/websocket"]

[dependencies]
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
tokio = { workspace = true, features = ["io-util", "net", "rt", "time"] }
tracing = { workspace = true }
# The value model the calls carry, and the side-effect class a call declares.
x0k-datum = { version = "0.1.0" }
x0k-operation-wire = { path = "../x0k-operation-wire", default-features = false , version = "0.1.0" }
# The session the calls run on.
x0k-operation-session = { path = "../x0k-operation-session", version = "0.2.0" }
x0k-ui-protocol = { path = "../x0k-ui-protocol", version = "0.3.1" }
# The profile's own runtime dir, where an endpoint binds.
x0k-runtime-dir = { path = "../x0k-runtime-dir", version = "0.1.0" }
# The conformance suite reads the fixture mark's ink in a capture's PNG.
png = "0.17"

[dev-dependencies]
tokio = { workspace = true, features = ["macros", "rt-multi-thread"] }
tracing-subscriber = { workspace = true }
```

## The operations

Each operation is one call with one answer. A refusal the decision names is a
value of the answer, so a driver in any language reads its code the same way it
reads a result. The wire's own refusal is left for a call the endpoint could
not read at all.

<a name="chunk-crate-root"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-endpoint/src/lib.rs) · `#crate-root`</sub>

```rust {#crate-root file="src/lib.rs"}
//! The UI-control endpoint over the operation wire (`ui-control-channel` §7).

pub mod address;
pub mod client;
pub mod conformance;
pub mod screencast;
pub mod server;
pub mod takeover;
pub mod wire;

use std::collections::BTreeMap;
use std::sync::Arc;

use x0k_datum::shape::{DeclaredShapes, Pinner, Unpinnable};
use x0k_datum::Datum;
use x0k_operation_session::session::{Shapes, ShapesFault};

pub use x0k_ui_protocol::act::InvokeAnswer;
pub use x0k_ui_protocol::fixture::{PresentAnswer, ReleaseAnswer};
pub use x0k_ui_protocol::history::{HistoryAnswer, NavigateAnswer};
pub use x0k_ui_protocol::input::PerformAnswer;
pub use x0k_ui_protocol::screencast::{CastAnswer, DiscardAnswer, FramesAnswer};
pub use x0k_ui_protocol::shapes::{
    CAST, DISCARD, FRAMES, HISTORY, INVOKE, NAVIGATE, OBSERVE, OFFER, OPERATIONS, PERFORM, PRESENT, RELEASE,
};

/// A shape's pin, as the protocol computes it.
struct Spelled;

impl Pinner for Spelled {
    fn pin(&self, value: &Datum) -> Result<String, Unpinnable> {
        Ok(x0k_ui_protocol::shapes::shape_pin(value))
    }
}

/// What both ends of a session agree on.
pub fn shapes() -> Result<Shapes, ShapesFault> {
    let declared: BTreeMap<String, DeclaredShapes> = x0k_ui_protocol::shapes::operation_shapes()
        .into_iter()
        .map(|shape| {
            let declared = DeclaredShapes {
                arg: Some(shape.argument),
                answer: Some(shape.answer),
                derived_answer: None,
            };
            (shape.operation.to_string(), declared)
        })
        .collect();
    Shapes::new(declared, Arc::new(Spelled))
}
```

## Values on the wire

The protocol's values are JSON's model, so they cross into a `Datum` through
serde. A capture does not, because JSON has no bytes: `png` leaves the value
first and comes back as a CBOR byte string.

<a name="chunk-wire"></a><sub>[`src/wire.rs`](../../crates/x0k-ui-endpoint/src/wire.rs) · `#wire`</sub>

```rust {#wire file="src/wire.rs"}
//! A protocol value as a `Datum`, and back.

use serde::de::DeserializeOwned;
use serde::Serialize;
use x0k_datum::Datum;
use x0k_ui_protocol::observe::Observation;

/// A value that does not read as what it should be.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
#[error("{0}")]
pub struct BadValue(pub String);

/// `value` as a `Datum`.
pub fn to_wire<T: Serialize>(value: &T) -> Result<Datum, BadValue> {
    let json = serde_json::to_value(value).map_err(|error| BadValue(error.to_string()))?;
    Ok(Datum::from_json(&json))
}

/// The value `datum` carries.
pub fn from_wire<T: DeserializeOwned>(datum: &Datum) -> Result<T, BadValue> {
    let json = datum.to_json().map_err(|fault| BadValue(fault.0.to_string()))?;
    serde_json::from_value(json).map_err(|error| BadValue(error.to_string()))
}

/// An observation as a `Datum`, its capture's pixels a byte string.
pub fn encode_observation(observation: &Observation) -> Result<Datum, BadValue> {
    let mut plain = observation.clone();
    let png = plain.capture.as_mut().map(|capture| std::mem::take(&mut capture.png));
    let mut datum = to_wire(&plain)?;
    if let (Some(png), Datum::Map(fields)) = (png, &mut datum) {
        if let Some(Datum::Map(capture)) = fields.get_mut("capture") {
            capture.insert("png".to_string(), Datum::Bytes(png));
        }
    }
    Ok(datum)
}

/// The observation `datum` carries.
pub fn decode_observation(datum: &Datum) -> Result<Observation, BadValue> {
    let mut plain = datum.clone();
    let mut png = Vec::new();
    if let Datum::Map(fields) = &mut plain {
        if let Some(Datum::Map(capture)) = fields.get_mut("capture") {
            if let Some(Datum::Bytes(bytes)) = capture.remove("png") {
                png = bytes;
            }
        }
    }
    let mut observation: Observation = from_wire(&plain)?;
    if let Some(capture) = &mut observation.capture {
        capture.png = png;
    }
    Ok(observation)
}
```

## An app's end

`UiApp` is what an app writes. `Endpoint` holds the app and the grant the
connection was given, and it makes the decision's checks before the app hears a
call: an action outside the offer or the grant, and a sequence that names
something the app does not hold, never reach it.

An app that holds no frames answers an empty list, and a sequence that names a
frame is then refused by name.

An app that keeps a history answers three more calls: what it shows, its
positions, and a navigation (`x0k:architecture/ui-interfaces` §2). An app that
keeps none leaves them as they are. It shows its live state, and its offer does
not name `ui/history`, so the endpoint refuses a history call before it reaches
the app. While the app shows a past position, the endpoint refuses `ui/input`
and every action above `read_only` as `showing_past`, after the call's own
checks. A navigation the offer rules out (a position never had, or one dropped)
never reaches the app.

A sequence of input reaches the app with its requester, so a host that draws
input (`x0k:architecture/ui-control-channel` §10) can label the drawing with
who asked. The sequence also carries the name the requester gives itself,
`Perform::requester_name`, if it gives one (`x0k:architecture/ui-interfaces`
§6); the host labels the drawing with the look's name for the requester, else
that name (`InputLook::name_given`). The name is the sequence's and the
requester is the connection's: the endpoint passes both, reads the name in
no check, and asks a takeover for the requester.

A sequence that asks for a takeover passes two checks before any of
it runs. `check_perform` refuses it as `takeover_unheld` when the offer does
not say the host holds one. Then, after what the app declines for now, the
host's configuration answers (`x0k:implementation/ui-control/takeover`): the
`TakeoverPolicy` the host built its endpoint with, `Endpoint::with_takeover`,
which asks the person when the host configured nothing.

- `ask`: the endpoint asks the app whether the person grants the requester the
  takeover (`grant_takeover`), and refuses it as `takeover_not_granted`,
  naming the requester, when they do not. A host where no person can answer
  grants none, so what its configuration says to ask, it refuses.
- `allow`: the endpoint tells the app to hold the window for the requester
  without asking (`hold_takeover`). The host shows the hold as it shows one the
  person granted, naming the requester and the exit input. A host that cannot
  hold the window now, because another takeover stands, answers false, and the
  takeover is refused as `takeover_not_granted`.
- `refuse`: the takeover is refused as `takeover_not_granted`, naming the
  requester and the host's configuration, and no one is asked.

The configuration is asked about the hold's kind, the connection's grant, the
connection's requester and whether the app runs as a dev instance (the
offer's `dev_instance`), and nothing else: never the sequence, so never
`requester_name`. `Endpoint::hold_for` is the one place that asks it, and
a stepped screencast's hold, once `ui/screencast` admits a `cast`, is answered
there too, with its own kind (below, "A screencast").

An app that names none of the hooks runs `perform` as before and holds no
takeover. A test drives one app twice over a connection that names its
requester: with the grant refused, the takeover is refused as
`takeover_not_granted`, naming the requester, and the app hears nothing; with
it given, the sequence runs and the app is told who asked.

An app that takes state fixtures (`x0k:architecture/ui-interfaces` §4) answers
four more: the spelling of its state shape, its live state, `present` and
`release`. The endpoint makes `check_present` before the app hears a `present`,
so the app is handed a whole state that fits its shape and never a patch, and
whether its host marks the fixture over the window while it stands. The call
asks `mark: false` to leave it off, which `check_present` refuses as
`mark_required` unless the offer says the app runs as a dev instance, so an app
told not to mark is always a dev instance. One
fixture stands at a time, and a `present` or a `navigate` while one stands
replaces it; the app keeps that, since only it knows what it shows.

While a fixture stands, the trip is `vary`, and the endpoint answers each
action as the offer's replay policy says (`x0k:architecture/graded-introspection`
§9). It reads the policy with `check_replay_policy` first, so a policy that
lowers a floor refuses the action and performs nothing. Then:

- `performed`: the app runs the action, as it would live;
- `simulated`: the app hears nothing, and the answer is the stand-in;
- `sandboxed`: the app runs the action against the sandbox the policy names;
- `refused`, or `recorded`, which a fixture has no record to answer from: the
  action is refused as `policy_refuses`.

Every disposition taken is an event on the timeline (`ui_control.disposition`),
with the action, its class, the disposition and the fixture. `ui/input` reaches
the app under a fixture, because driving the app in a given state is what a
fixture is for; what input does after the app's own hit-testing is the app's to
answer by the same policy.

Three hooks let an app name a condition of its own or its host's, and the
endpoint turns each into a refusal before the app runs anything
(`x0k:architecture/ui-control-channel` §8 to §10, `x0k:architecture/ui-interfaces`
§4). An app that names none answers as before.

- `cannot_paint` answers why the app's host cannot paint its window now, such
  as a minimised window or a sleeping display. The host decides at each call,
  so a host that keeps painting a covered window or one on another space
  answers `None` while it does. While the hook answers a
  reason, an `invoke` is refused as `cannot_paint`, naming the action, and a
  `perform` is refused the same way, naming `ui/input`, after each call's own
  checks. An `observe` reaches the app without its capture, and the endpoint
  adds the capture's refusal as `cannot_paint`, so the layout and the state
  still come back. The endpoint asks the hook at every call and waits for no
  frame, so the refusal comes back as fast as the hook answers. A host that
  paints answers `None`, and every call runs.
- `delivers` names the source kinds the app's host delivers, every kind the
  model has by default. A sequence with a source of any other kind the model
  has is refused as `undeliverable_source`, naming the kind (`check_delivers`),
  before any of it runs.
- `declines` answers why the app declines a call for now while a fixture
  stands, such as an approval that waits for a person. The endpoint asks it of
  an `invoke` and a `perform` under a fixture, and refuses the call as
  `declined` before the replay policy disposes of it. A `present` the app
  declines is the app's own answer: `PresentAnswer::Refused` with
  `RefusalCode::Declined`, naming `ui/history`, and with that refusal no
  fixture stands.
- `declines_input` answers why the app declines a sequence of input for
  now, whatever it shows, such as a person using the window
  (`x0k:architecture/ui-control-channel` §10, "Declining input for now"). The
  endpoint asks it of every sequence after `declines`, before a takeover is
  asked for, and refuses the sequence as `declined`, naming `ui/input`. The
  app may wait in it for its condition to pass; the sequence then runs whole,
  from its first tick.

Under one call, the order is the call's own checks, then what the host never
delivers, then whether the host can paint, then what the app shows, then
what the app declines. So a driver hears first what holds of the call wherever
it is sent, and last what may change by the next call.

An app may end a fixture that stands itself, such as when an approval arrives
for a person, and show its live state (`x0k:architecture/ui-interfaces` §4).
It keeps why, and answers it from a fourth hook, `fixture_ended`, by handle.
The endpoint asks it only when its own record says the calling session
presented a fixture that the app no longer shows. That session's next `invoke`
or `perform` is then refused as `fixture_ended`, naming the handle with the
app's reason, at the step for what the app shows; the record is cleared, so
the session hears it once and its later calls run live. A `release` the app
answers `not_standing` is answered `ended` with the reason when the app says
it ended that fixture. An app that names no reason keeps today's answers, and
a session that never presented the fixture is told nothing, since it sent
nothing expecting it. The endpoint asks at the call rather than the app
telling it when it ends the fixture, so no call can slip between the app's
ending and the endpoint's knowing.

Each connection is one session. The endpoint remembers which session last took
the app to a past position or presented a fixture, and when that session ends it
takes the app back to `live` or releases the fixture (§2, §4). A session that
only looked changes nothing when it ends. A raw `Callee` built on `Endpoint`
alone has no session, so nothing ends it: only `serve_connection` keeps that
promise.

Every call runs under a span named `ui.call`, carrying the caller's W3C
`traceparent` in a field of that name when the call has one (§7). A subscriber
that reads the field puts the app's work in the caller's trace; x0k's timeline
layer does, and any other sees an ordinary span.

**A screencast.** An app that makes screencasts names `ui/screencast` in its
offer with its `screencast` field, and answers a stepped cast with three
hooks or a streamed one with three more
(`x0k:implementation/ui-control/endpoint-screencast`). The endpoint checks a
cast, asks the host's configuration for a stepped cast's hold, plays the run's
steps through the calls above, and keeps the frames for the session until a
`discard`, the session's next `cast`, or its end. Each hook defaults to
refusing as `no_screencast_interface`, saying the app offers no screencast,
so an app that names none is unchanged. `Endpoint::holding` narrows the interfaces a connection's grant
holds, which a cast's steps are checked against.

`listen` binds and then serves. The two halves are also separate calls: an app
that must know it holds its path before it says anything else binds first,
reads the error there, and then serves the listener in a task of its own.

<a name="chunk-server"></a><sub>[`src/server.rs`](../../crates/x0k-ui-endpoint/src/server.rs) · `#server` · assembles [invoke-under-a-fixture](#chunk-invoke-under-a-fixture)</sub>

```rust {#server file="src/server.rs"}
//! An app's end of the endpoint.

use std::future::Future;
use std::path::Path;
use std::sync::Arc;

use serde_json::Value;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::UnixListener;
use tracing::Instrument;
use x0k_datum::Datum;
use x0k_operation_session::session::{serve, Answer, Callee, Heard, OpenFault, SessionPolicy, Shapes};
use x0k_ui_protocol::act::{check_invoke, Grant, Invoke, Outcome};
use x0k_ui_protocol::fixture::{check_present, PresentCall, ReleaseCall};
use x0k_ui_protocol::history::{
    check_navigate, check_while_shown, Destination, History, HistoryCall, NavigateCall, Shown,
};
use x0k_ui_protocol::input::{check_delivers, check_perform, HeldFrame, Perform, Resolved, SOURCE_KINDS};
use x0k_ui_protocol::observe::{while_cannot_paint, Observation, ObserveCall, StatePart};
use x0k_ui_protocol::offer::{Action, Offer, UI_HISTORY, UI_INPUT};
use x0k_ui_protocol::replay::{check_replay_policy, disposition, Purpose, ReplayDisposition};
use x0k_ui_protocol::{Refused, RefusalCode};

use crate::screencast::{encode_frames, Begun, ClockEnded, FrameUnanswered, StepTo, SteppedBegin, SteppedFrame, StreamBegin, StreamedFrame};
use crate::takeover::{HoldAnswer, HoldAsked, HoldKind, Requester, TakeoverPolicy};
use crate::wire::{from_wire, to_wire, encode_observation, BadValue};
use crate::{
    shapes, HistoryAnswer, InvokeAnswer, NavigateAnswer, PerformAnswer, PresentAnswer, ReleaseAnswer, CAST,
    DISCARD, FRAMES, HISTORY, INVOKE, NAVIGATE, OBSERVE, OFFER, PERFORM, PRESENT, RELEASE,
};

/// How the endpoint plays a screencast: `x0k:implementation/ui-control/endpoint-screencast`.
mod cast;

/// What an app answers. Each call reaches it only after the checks passed.
pub trait UiApp: Send + Sync + 'static {
    /// The app's standing.
    fn offer(&self) -> impl Future<Output = Offer> + Send;

    /// One observation, from one presented frame.
    fn observe(&self, call: ObserveCall) -> impl Future<Output = Observation> + Send;

    /// Run an action the offer lists, with arguments that fit its shape.
    fn invoke(&self, action: &Action, args: Value) -> impl Future<Output = Outcome> + Send;

    /// The frames input may name.
    fn held_frames(&self) -> impl Future<Output = Vec<HeldFrame>> + Send;

    /// Run a sequence through the app's own hit-testing and focus. `resolved`
    /// holds each pointer position in the frame's pixels. Answers the first
    /// frame presented after the app handled the whole sequence.
    fn perform(
        &self,
        perform: Perform,
        resolved: Vec<Resolved>,
    ) -> impl Future<Output = Option<String>> + Send;

    /// Run a sequence for `requester`, the requester its connection names. A
    /// host that draws input (`InputOffer::presents`) labels the drawing with
    /// it. An app that names no requester runs `perform`.
    fn perform_for(
        &self,
        requester: &str,
        perform: Perform,
        resolved: Vec<Resolved>,
    ) -> impl Future<Output = Option<String>> + Send {
        let _ = requester;
        self.perform(perform, resolved)
    }

    /// Whether the person grants `requester` the takeover a sequence asks
    /// for, asked before any of the sequence runs. The endpoint asks only an
    /// app whose offer says its host holds a takeover, and only where the
    /// host's configuration says to ask; a host that cannot ask the person
    /// grants none.
    fn grant_takeover(&self, _requester: &str) -> impl Future<Output = bool> + Send {
        async { false }
    }

    /// Hold the window for `requester` without asking, as the host's
    /// configuration allows, and show the hold with its exit. False while
    /// another takeover stands, or in a host that holds none.
    fn hold_takeover(&self, _requester: &str) -> impl Future<Output = bool> + Send {
        async { false }
    }

    /// What the app shows now (`ui-interfaces` §3).
    fn shown(&self) -> impl Future<Output = Shown> + Send {
        async { Shown::Live }
    }

    /// The positions `call` asks for, newest first (`ui-interfaces` §2).
    fn history(&self, _call: HistoryCall) -> impl Future<Output = History> + Send {
        async { History { oldest: None, newest: None, shown: Shown::Live, positions: Vec::new() } }
    }

    /// Show `to`, which the offer allows, and answer the first frame showing it.
    fn navigate(&self, _to: Destination) -> impl Future<Output = NavigateAnswer> + Send {
        async { NavigateAnswer::Refused(no_history()) }
    }

    /// The spelling of the presentable state's shape, for an app that takes
    /// state fixtures (`ui-interfaces` §4).
    fn state_shape(&self) -> Option<Datum> {
        None
    }

    /// The live state, whatever the app shows.
    fn live_state(&self) -> impl Future<Output = Option<StatePart>> + Send {
        async { None }
    }

    /// Show `state`, which fits the state shape, in place of the live state,
    /// replacing any fixture that stands, and have the host mark it over the
    /// window while it stands unless `marked` is false, which the endpoint lets
    /// through only for a dev instance (`ui-interfaces` §4). Answers its handle
    /// and first frame.
    fn present(&self, _state: Value, _marked: bool) -> impl Future<Output = PresentAnswer> + Send {
        async { PresentAnswer::Refused(no_fixtures()) }
    }

    /// Return from the fixture `handle` to the live state.
    fn release(&self, handle: String) -> impl Future<Output = ReleaseAnswer> + Send {
        async { ReleaseAnswer::NotStanding { handle } }
    }

    /// Run an action against `sandbox`, a stand-in target the offer declares.
    fn sandboxed(&self, _action: &Action, _args: Value, sandbox: &str) -> impl Future<Output = Outcome> + Send {
        let reason = format!("the app has no sandbox {sandbox}");
        async move { Outcome::Failed { reason, frame: None } }
    }

    /// Why the app's host cannot paint its window now, decided at the call:
    /// a minimised window, a sleeping display. `None` is a host that paints,
    /// covered or not.
    fn cannot_paint(&self) -> impl Future<Output = Option<String>> + Send {
        async { None }
    }

    /// The source kinds the app's host delivers.
    fn delivers(&self) -> &[&str] {
        SOURCE_KINDS
    }

    /// Why the app declines `call` for now while a fixture stands, such as an
    /// approval that waits for a person. `None` lets it run.
    fn declines(&self, _call: Declinable<'_>) -> impl Future<Output = Option<String>> + Send {
        async { None }
    }

    /// Why the app declines `perform`, `requester`'s sequence, for now,
    /// whatever it shows, such as a person using the window. Asked of every
    /// sequence after every other check and before a takeover is asked for;
    /// the app may wait in it for its condition to pass, and the sequence then
    /// runs whole. `None` lets it run.
    fn declines_input(&self, _requester: &str, _perform: &Perform) -> impl Future<Output = Option<String>> + Send {
        async { None }
    }

    /// Why the app ended the fixture `handle` itself and went back to its live
    /// state, as when an approval arrives for a person (`ui-interfaces` §4).
    /// `None` while it stands, and for a fixture the app did not end.
    fn fixture_ended(&self, _handle: &str) -> impl Future<Output = Option<String>> + Send {
        async { None }
    }

    /// Begin a stepped screencast (`ui-screencast` §5): hold the app's clock
    /// at screencast time 0, so that it moves only by `step_to`, and answer
    /// the sources of motion it does not step. The window is already held for
    /// `begin.requester`, by the host's configuration or the person. The
    /// default refuses: the app offers no screencast.
    fn stepped_begin(&self, _begin: &SteppedBegin) -> impl Future<Output = Result<Begun, Refused>> + Send {
        async { Err(no_screencast()) }
    }

    /// Advance the app's clock to `to`, after every step due by its time took
    /// effect, and answer the frame, with the parts `stepped_begin` named.
    /// `Err` ends the screencast for the reason it gives, such as the person's
    /// exit.
    fn step_to(&self, _to: StepTo) -> impl Future<Output = Result<SteppedFrame, FrameUnanswered>> + Send {
        async { Err(FrameUnanswered { why: no_screencast().why }) }
    }

    /// Give the app back to the wall clock, end the hold, and say whether a
    /// rerun from the same start would draw the same frames. The endpoint
    /// calls it after every `stepped_begin`, answered or refused.
    fn stepped_end(&self) -> impl Future<Output = ClockEnded> + Send {
        async { ClockEnded { same_on_rerun: false, why: vec![no_screencast().why] } }
    }

    /// Begin capturing the window as it presents, on the wall's clock
    /// (`ui-screencast` §6). A capture the platform does not permit is refused
    /// as `capture_not_permitted`, naming the permission and the process that
    /// needs it. The default refuses: the app offers no screencast.
    fn stream_begin(&self, _begin: &StreamBegin) -> impl Future<Output = Result<(), Refused>> + Send {
        async { Err(no_screencast()) }
    }

    /// The frames the platform presented since the begin or the last take,
    /// in order of their presentation times.
    fn stream_take(&self) -> impl Future<Output = Vec<StreamedFrame>> + Send {
        async { Vec::new() }
    }

    /// Stop capturing. The endpoint calls it after every `stream_begin` it
    /// was answered.
    fn stream_end(&self) -> impl Future<Output = ()> + Send {
        async {}
    }
}

/// A call an app may decline while a fixture stands (`ui-interfaces` §4).
#[derive(Clone, Copy, Debug)]
pub enum Declinable<'c> {
    Invoke(&'c Action),
    Perform(&'c Perform),
}

fn no_history() -> Refused {
    let why = "the app keeps no history".to_string();
    Refused { code: RefusalCode::NoHistoryInterface, subject: Some(UI_HISTORY.to_string()), why }
}

fn no_screencast() -> Refused {
    let why = "the app offers no screencast".to_string();
    Refused { code: RefusalCode::NoScreencastInterface, subject: Some(x0k_ui_protocol::offer::UI_SCREENCAST.to_string()), why }
}

fn no_fixtures() -> Refused {
    let why = "the app takes no state fixtures".to_string();
    Refused { code: RefusalCode::NoFixtures, subject: Some(UI_HISTORY.to_string()), why }
}

/// What a session left the app showing, for its end to undo.
#[derive(Clone, Debug, PartialEq)]
enum Left {
    Past { session: u64 },
    Fixture { session: Option<u64>, handle: String },
}

/// An app, the grant its connections hold, and who allows a takeover.
pub struct Endpoint<A> {
    app: A,
    grant: Grant,
    /// The interfaces the connections' grant holds; every one the offer
    /// names when `None`.
    holds: Option<Vec<String>>,
    takeover: TakeoverPolicy,
    /// What the last session to change what the app shows left it showing.
    left: std::sync::Mutex<Option<Left>>,
    sessions: std::sync::atomic::AtomicU64,
    /// The screencast each session holds, at most one (`ui-screencast` §2).
    casts: cast::Casts,
}

impl<A: UiApp> Endpoint<A> {
    pub fn new(app: A, grant: Grant) -> Self {
        Endpoint {
            app,
            grant,
            holds: None,
            takeover: TakeoverPolicy::default(),
            left: Default::default(),
            sessions: Default::default(),
            casts: Default::default(),
        }
    }

    /// Hold only `interfaces` for the connections, as their grant says
    /// (`ui-interfaces` §1). A screencast's step needs its own interface
    /// held. Without this, the grant holds every interface the offer names.
    pub fn holding(mut self, interfaces: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.holds = Some(interfaces.into_iter().map(Into::into).collect());
        self
    }

    /// Answer takeovers, and stepped screencasts' holds, by `policy`.
    pub fn with_takeover(mut self, policy: TakeoverPolicy) -> Self {
        self.takeover = policy;
        self
    }

    /// Whether `requester` may hold the window for `hold`, by the host's
    /// configuration and, where it asks, the person's answer; the refusal when
    /// not. Allowed, the app holds the window and shows it.
    pub async fn hold_for(&self, hold: HoldKind, requester: &Requester) -> Result<(), Refused> {
        let dev_instance = self.app.offer().await.dev_instance;
        let asked = HoldAsked { hold, grant: &self.grant, requester, dev_instance };
        let label = requester.to_string();
        let why = match self.takeover.answer(&asked) {
            HoldAnswer::Ask if self.app.grant_takeover(&label).await => return Ok(()),
            HoldAnswer::Ask => format!("the person did not grant {label} a takeover"),
            HoldAnswer::Allow if self.app.hold_takeover(&label).await => return Ok(()),
            HoldAnswer::Allow => format!("the host's configuration allows {label} a takeover, and the window holds another"),
            HoldAnswer::Refuse => format!("the host's configuration refuses {label} a takeover"),
        };
        Err(Refused { code: RefusalCode::TakeoverNotGranted, subject: Some(label), why })
    }

    fn leave(&self, left: Option<Left>) {
        if let Ok(mut slot) = self.left.lock() {
            *slot = left;
        }
    }

    /// The refusal `session` hears once when the app has ended the fixture
    /// the session presented: its record says the fixture stands, the app
    /// shows another state, and the app says why it ended it. Telling it
    /// clears the record, so the session's later calls run on what the app
    /// shows.
    async fn told_ended(&self, session: Option<u64>, shown: &Shown) -> Option<Refused> {
        let left = self.left.lock().ok()?.clone();
        let Some(Left::Fixture { session: by, handle: presented }) = left else { return None };
        if by != session {
            return None;
        }
        if matches!(shown, Shown::Fixture { handle } if *handle == presented) {
            return None;
        }
        let reason = self.app.fixture_ended(&presented).await?;
        let mut left = self.left.lock().ok()?;
        if !matches!(&*left, Some(Left::Fixture { handle, .. }) if *handle == presented) {
            return None;
        }
        *left = None;
        Some(Refused::new(RefusalCode::FixtureEnded, &presented, reason))
    }

    async fn invoke(&self, invoke: Invoke, session: Option<u64>) -> InvokeAnswer {
        let offer = self.app.offer().await;
        let action = match check_invoke(&offer, &self.grant, &invoke) {
            Ok(action) => action,
            Err(refused) => return InvokeAnswer::Refused(refused),
        };
        if let Some(why) = self.app.cannot_paint().await {
            return InvokeAnswer::Refused(Refused::new(RefusalCode::CannotPaint, &action.name, why));
        }
        let shown = self.app.shown().await;
        if let Some(refused) = self.told_ended(session, &shown).await {
            return InvokeAnswer::Refused(refused);
        }
        if let Err(refused) = check_while_shown(&shown, Some(action.side_effect)) {
            return InvokeAnswer::Refused(refused);
        }
        let Shown::Fixture { handle } = shown else {
            return outcome_answer(self.app.invoke(action, invoke.args).await);
        };
        <<invoke-under-a-fixture>>
    }

    /// One observation; while the host cannot paint the window, the app answers the
    /// call without its capture, and the capture is refused as `cannot_paint`.
    async fn observe(&self, call: ObserveCall) -> Observation {
        let Some(why) = self.app.cannot_paint().await else {
            return self.app.observe(call).await;
        };
        let (call, refused) = while_cannot_paint(&call, &why);
        let mut observation = self.app.observe(call).await;
        observation.refused.extend(refused);
        observation
    }

    async fn present(&self, call: PresentCall, session: Option<u64>) -> PresentAnswer {
        let offer = self.app.offer().await;
        let live = self.app.live_state().await;
        let state = match check_present(&offer, live.as_ref(), self.app.state_shape().as_ref(), &call) {
            Ok(state) => state,
            Err(refused) => return PresentAnswer::Refused(refused),
        };
        let answer = self.app.present(state, call.marked()).await;
        if let PresentAnswer::Presented { handle, .. } = &answer {
            self.leave(Some(Left::Fixture { session, handle: handle.clone() }));
        }
        answer
    }

    async fn release(&self, call: ReleaseCall) -> ReleaseAnswer {
        let mut answer = self.app.release(call.handle.clone()).await;
        if let ReleaseAnswer::NotStanding { handle } = &answer {
            if let Some(reason) = self.app.fixture_ended(handle).await {
                answer = ReleaseAnswer::Ended { handle: handle.clone(), reason };
            }
        }
        let released = matches!(answer, ReleaseAnswer::Released { .. } | ReleaseAnswer::Ended { .. });
        if let (true, Ok(mut left)) = (released, self.left.lock()) {
            if matches!(&*left, Some(Left::Fixture { handle, .. }) if *handle == call.handle) {
                *left = None;
            }
        }
        answer
    }

    async fn perform(&self, perform: Perform, session: Option<u64>, requester: &Requester) -> PerformAnswer {
        let offer = self.app.offer().await;
        let frames = self.app.held_frames().await;
        let resolved = match check_perform(&offer, &frames, &perform) {
            Ok(resolved) => resolved,
            Err(refused) => return PerformAnswer::Refused(refused),
        };
        if let Err(refused) = check_delivers(&perform, self.app.delivers()) {
            return PerformAnswer::Refused(refused);
        }
        if let Some(why) = self.app.cannot_paint().await {
            return PerformAnswer::Refused(Refused::new(RefusalCode::CannotPaint, UI_INPUT, why));
        }
        let shown = self.app.shown().await;
        if let Some(refused) = self.told_ended(session, &shown).await {
            return PerformAnswer::Refused(refused);
        }
        if let Err(refused) = check_while_shown(&shown, None) {
            return PerformAnswer::Refused(refused);
        }
        if let Shown::Fixture { .. } = shown {
            if let Some(why) = self.app.declines(Declinable::Perform(&perform)).await {
                return PerformAnswer::Refused(Refused::new(RefusalCode::Declined, UI_INPUT, why));
            }
        }
        let label = requester.to_string();
        if let Some(why) = self.app.declines_input(&label, &perform).await {
            return PerformAnswer::Refused(Refused::new(RefusalCode::Declined, UI_INPUT, why));
        }
        if perform.takeover {
            if let Err(refused) = self.hold_for(HoldKind::Takeover, requester).await {
                return PerformAnswer::Refused(refused);
            }
        }
        PerformAnswer::Done { frame: self.app.perform_for(&label, perform, resolved).await }
    }

    async fn history(&self, call: HistoryCall) -> HistoryAnswer {
        if !self.app.offer().await.answers(UI_HISTORY) {
            return HistoryAnswer::Refused(no_history());
        }
        HistoryAnswer::Listed(self.app.history(call).await)
    }

    async fn navigate(&self, call: NavigateCall, session: Option<u64>) -> NavigateAnswer {
        if let Err(answer) = check_navigate(&self.app.offer().await, &call) {
            return answer;
        }
        let answer = self.app.navigate(call.to).await;
        if let NavigateAnswer::Shown { shown, .. } = &answer {
            let past = matches!(shown, Shown::Position { .. });
            self.leave(session.filter(|_| past).map(|session| Left::Past { session }));
        }
        answer
    }

    /// Take the app back to live if `session` left it at a past position or
    /// showing a fixture.
    async fn session_ended(&self, session: u64) {
        self.casts.drop_session(Some(session));
        let left = self.left.lock().ok().and_then(|mut left| {
            let ours = match &*left {
                Some(Left::Past { session: by }) => *by == session,
                Some(Left::Fixture { session: by, .. }) => *by == Some(session),
                None => false,
            };
            ours.then(|| left.take()).flatten()
        });
        match left {
            Some(Left::Past { .. }) => {
                let answer = self.app.navigate(Destination::Live).await;
                tracing::debug!(session, ?answer, "ui endpoint: a session's end took the app back to live");
            }
            Some(Left::Fixture { handle, .. }) => {
                let answer = self.app.release(handle).await;
                tracing::debug!(session, ?answer, "ui endpoint: a session's end released its fixture");
            }
            None => {}
        }
    }

    async fn answer(&self, heard: &Heard, session: Option<u64>, requester: &Requester) -> Result<Datum, BadValue> {
        match heard.operation.as_str() {
            OFFER => to_wire(&self.app.offer().await),
            OBSERVE => encode_observation(&self.observe(from_wire(&heard.argument)?).await),
            INVOKE => to_wire(&self.invoke(from_wire(&heard.argument)?, session).await),
            PERFORM => to_wire(&self.perform(from_wire(&heard.argument)?, session, requester).await),
            HISTORY => to_wire(&self.history(from_wire(&heard.argument)?).await),
            NAVIGATE => to_wire(&self.navigate(from_wire(&heard.argument)?, session).await),
            PRESENT => to_wire(&self.present(from_wire(&heard.argument)?, session).await),
            RELEASE => to_wire(&self.release(from_wire(&heard.argument)?).await),
            CAST => to_wire(&self.cast(from_wire(&heard.argument)?, session, requester).await),
            FRAMES => encode_frames(&self.frames(from_wire(&heard.argument)?)),
            DISCARD => to_wire(&self.discard(from_wire(&heard.argument)?)),
            other => Err(BadValue(format!("the endpoint serves no operation {other}"))),
        }
    }

    async fn call_in(&self, heard: Heard, session: Option<u64>, requester: &Requester) -> Answer {
        let span = tracing::info_span!(
            "ui.call",
            operation = %heard.operation,
            traceparent = heard.trace.as_deref(),
        );
        match self.answer(&heard, session, requester).instrument(span).await {
            Ok(value) => Answer::Reply(value),
            Err(BadValue(why)) => Answer::Refused(why),
        }
    }
}

impl<A: UiApp> Callee for Endpoint<A> {
    async fn call(&self, heard: Heard) -> Answer {
        self.call_in(heard, None, &Requester::default()).await
    }
}

fn outcome_answer(outcome: Outcome) -> InvokeAnswer {
    match outcome {
        Outcome::Done { result, frame } => InvokeAnswer::Done { result, frame },
        Outcome::Failed { reason, frame } => InvokeAnswer::Failed { reason, frame },
    }
}

/// One connection's calls, as one session of the endpoint, and the requester
/// the connection names.
struct Connection<A> {
    endpoint: Arc<Endpoint<A>>,
    session: u64,
    requester: Requester,
}

impl<A: UiApp> Callee for Connection<A> {
    async fn call(&self, heard: Heard) -> Answer {
        self.endpoint.call_in(heard, Some(self.session), &self.requester).await
    }
}

/// The requester of a connection that names none: a carrier with no peer
/// credentials, or a call made on the endpoint itself.
pub const UNNAMED: &str = "unnamed";

/// Why a connection could not be served.
#[derive(Debug, thiserror::Error)]
pub enum ServeFault {
    #[error(transparent)]
    Shapes(#[from] x0k_operation_session::session::ShapesFault),
    #[error(transparent)]
    Open(#[from] OpenFault),
}

/// Serve one connection until it ends, with no requester named.
pub async fn serve_connection<S, A>(stream: S, endpoint: Arc<Endpoint<A>>) -> Result<(), ServeFault>
where
    S: AsyncRead + AsyncWrite + Send + 'static,
    A: UiApp,
{
    serve_connection_from(stream, endpoint, Requester::default()).await
}

/// Serve one connection until it ends, its calls made by `requester`.
pub async fn serve_connection_from<S, A>(stream: S, endpoint: Arc<Endpoint<A>>, requester: Requester) -> Result<(), ServeFault>
where
    S: AsyncRead + AsyncWrite + Send + 'static,
    A: UiApp,
{
    let agreed: Arc<Shapes> = Arc::new(shapes()?);
    let session = endpoint.sessions.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let connection = Arc::new(Connection { endpoint: Arc::clone(&endpoint), session, requester });
    let served = serve(stream, connection, SessionPolicy::default(), agreed, None).await;
    endpoint.session_ended(session).await;
    Ok(served?)
}

/// Serve connections on the unix socket at `path`.
pub async fn listen<A: UiApp>(path: &Path, endpoint: Arc<Endpoint<A>>) -> std::io::Result<()> {
    serve_listener(bind_path(path).await?, endpoint).await
}

/// Bind the unix socket at `path`. A socket left by an endpoint that has gone
/// refuses a connection, and is removed; a live one keeps its path, and the
/// bind fails.
pub async fn bind_path(path: &Path) -> std::io::Result<UnixListener> {
    if tokio::net::UnixStream::connect(path).await.is_err() {
        match std::fs::remove_file(path) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error),
            _ => {}
        }
    }
    UnixListener::bind(path)
}

/// Serve each connection `listener` accepts, until accepting fails. Each
/// connection is served in a span that names its requester.
pub async fn serve_listener<A: UiApp>(
    listener: UnixListener,
    endpoint: Arc<Endpoint<A>>,
) -> std::io::Result<()> {
    loop {
        let (stream, _) = listener.accept().await?;
        let endpoint = Arc::clone(&endpoint);
        let requester = requester(&stream);
        let span = tracing::info_span!("ui_endpoint.connection", requester = %requester);
        tokio::spawn(
            async move {
                let _ = serve_connection_from(stream, endpoint, requester).await;
            }
            .instrument(span),
        );
    }
}

/// The requester of a connection on a local socket: its peer's credentials
/// (`ui-interfaces` §6), as the kernel gave them when it connected. A peer
/// whose credentials cannot be read names none.
pub fn requester(stream: &tokio::net::UnixStream) -> Requester {
    match stream.peer_cred() {
        Ok(peer) => Requester::peer(peer.uid(), peer.pid().and_then(|pid| u32::try_from(pid).ok())),
        Err(error) => {
            tracing::debug!(%error, "ui endpoint: a connection's peer credentials could not be read");
            Requester::default()
        }
    }
}
```

A connection's requester is its peer's credentials, read when it is accepted,
so every call on it is answered inside a span that names who asked. The calls
reach the app inside that span, so an app's own events name the requester too. The connection
also hands the requester to the app with each sequence of input. A connection
on a carrier with no peer credentials names none, and is `unnamed`.
The grant is still the endpoint's, the same for every connection. A test holds
that a connection names its peer's uid and pid.

Under a fixture, the action's disposition comes from the policy, read once
it is known to lower no floor. A `sandboxed` disposition always names its
sandbox, since `disposition` gives one wherever it chooses `sandboxed` and
`check_replay_policy` refuses an entry that names none.

<a name="chunk-invoke-under-a-fixture"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-endpoint/src/lib.rs) · `#invoke-under-a-fixture`</sub>

```rust {#invoke-under-a-fixture}
if let Err(refused) = check_replay_policy(&offer) {
    return InvokeAnswer::Refused(refused);
}
if let Some(why) = self.app.declines(Declinable::Invoke(action)).await {
    return InvokeAnswer::Refused(Refused::new(RefusalCode::Declined, &action.name, why));
}
let taken = disposition(&offer, Purpose::Vary, action.side_effect, &action.name);
tracing::info!(
    event_type = "ui_control.disposition",
    action = %action.name,
    side_effect = ?action.side_effect,
    disposition = ?taken.disposition,
    sandbox = taken.sandbox.as_deref().unwrap_or(""),
    fixture = %handle,
    "ui endpoint: an action under a fixture took its disposition"
);
let refuses = |why: String| InvokeAnswer::Refused(Refused { code: RefusalCode::PolicyRefuses, subject: Some(action.name.clone()), why });
match (taken.disposition, taken.sandbox) {
    (ReplayDisposition::Performed, _) => outcome_answer(self.app.invoke(action, invoke.args).await),
    (ReplayDisposition::Simulated, _) => InvokeAnswer::Simulated { action: action.name.clone() },
    (ReplayDisposition::Sandboxed, Some(sandbox)) => match self.app.sandboxed(action, invoke.args, &sandbox).await {
        Outcome::Done { result, frame } => InvokeAnswer::Sandboxed { sandbox, result, frame },
        Outcome::Failed { reason, frame } => InvokeAnswer::Failed { reason, frame },
    },
    (ReplayDisposition::Recorded, _) => refuses("a state fixture has no record to answer from".to_string()),
    (other, _) => refuses(format!("the replay policy takes {other:?} for {} under a fixture", action.name)),
}
```

## Where an endpoint is

An app answers on a socket named for it, `<app>.endpoint`, in its profile's
runtime directory under `ui-control/` (`ui-control-channel` §5). Knowing an app
id is knowing where to knock, and a driver lists the directory to discover
what runs. Every app binds by this one rule, x0k's shell and a Tauri app alike
(`x0k:implementation/ui-control/tauri-plugin`), so a driver finds each where it
looks.

The runtime directory is the stack's own (`x0k_runtime_dir::own_runtime_dir`,
`x0k:implementation/tooling/runtime-dir`), so a scratch process never binds in,
or discovers from, the live root's runtime that the dev shell pins.
`X0K_UI_CONTROL_ENDPOINT_DIR` overrides the directory wholesale: it is the test
seam, and the escape hatch for a host that mounts runtime dirs somewhere
unusual. A scratch process drops an override inside the live root's runtime
too, so the seam cannot reopen what the runtime dir closed.

The caller names the profile. x0k's own processes pass the profile they are
bound to (`x0k_env::profile::active_profile_name`); an app that is not x0k's
passes the one its environment names (`x0k_runtime_dir::process_profile_name`).

<a name="chunk-address"></a><sub>[`src/address.rs`](../../crates/x0k-ui-endpoint/src/address.rs) · `#address`</sub>

```rust {#address file="src/address.rs"}
//! Where an app's UI-control endpoint is: a socket named for the app in its
//! profile's own runtime dir (`ui-control-channel` §5).
use std::path::PathBuf;
use std::sync::Once;

use x0k_runtime_dir::{is_scratch_process, own_runtime_dir, LiveRuntime};

/// Overrides the directory endpoints bind in, wholesale; a scratch process
/// drops one inside the live root's runtime.
pub const ENV_ENDPOINT_DIR: &str = "X0K_UI_CONTROL_ENDPOINT_DIR";

/// Where `app_id` answers the UI-control endpoint on `profile`.
pub fn ui_endpoint_path(profile: &str, app_id: &str) -> PathBuf {
    ui_endpoint_dir(profile).join(format!("{app_id}.endpoint"))
}

/// The directory holding `profile`'s endpoints: its own runtime dir's
/// `ui-control/`, `/run/user/<uid>/x0k/<profile>/ui-control` on a Linux
/// session, unless [`ENV_ENDPOINT_DIR`] overrides it.
///
/// Panics on a profile name `x0k_runtime_dir::validate_profile_name` refuses.
pub fn ui_endpoint_dir(profile: &str) -> PathBuf {
    let over = std::env::var_os(ENV_ENDPOINT_DIR).filter(|dir| !dir.is_empty()).map(PathBuf::from);
    let live = is_scratch_process(profile).then(LiveRuntime::of_this_host);
    kept_override(over, live.as_ref()).unwrap_or_else(|| own_runtime_dir(profile).join("ui-control"))
}

/// The override a process keeps: any, for the live stack (`live` is `None`);
/// for a scratch one, only one outside the live root's runtime.
fn kept_override(over: Option<PathBuf>, live: Option<&LiveRuntime>) -> Option<PathBuf> {
    let over = over?;
    let Some(live) = live.filter(|live| live.holds(&over)) else { return Some(over) };
    static DROPPED: Once = Once::new();
    DROPPED.call_once(|| {
        tracing::warn!(
            dir = %over.display(),
            live = ?live,
            "not using {ENV_ENDPOINT_DIR}, inside the live root's runtime; a scratch profile resolves its own"
        );
    });
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_scratch_process_drops_an_override_inside_the_live_runtime_and_keeps_one_outside() {
        let live = LiveRuntime::new("main", PathBuf::from("/xdg/x0k/main"));
        for inside in ["/run/0k/main/ui-control", "/xdg/x0k/main/ui-control"] {
            assert_eq!(kept_override(Some(inside.into()), Some(&live)), None, "override {inside}");
            assert_eq!(kept_override(Some(inside.into()), None), Some(PathBuf::from(inside)), "the live stack keeps {inside}");
        }
        assert_eq!(kept_override(Some("/tmp/endpoints".into()), Some(&live)), Some(PathBuf::from("/tmp/endpoints")));
    }
}
```

## A driver's end

`UiClient` is one session. Every call carries a deadline, because the session
answers an unknown outcome past it rather than leaving a caller waiting. The
deadline is generous for an observation, since a capture has to wait for a frame.
A sequence that asks for a takeover waits `TAKEOVER_ASK_MS` longer, the most its
host waits for the person to answer, so a no that comes at the end of that wait
still reaches the driver as a refusal and not as an unknown outcome.

A driver that keeps a trace gives the client a way to read it with `traced_by`,
and every call then carries the trace current when it was made. How a driver keeps
one is its own affair, so this is a function and not a dependency. The suite asks
one offer in a trace it mints itself, whatever the client otherwise carries.

A client can also speak to an app over **JSON lines** instead of a session:
each call is one line, `{"id", "operation", "argument", "trace"}`, and each
answer one line, `{"id", "answer"}` or `{"id", "fault"}`, with the protocol's
values in their JSON spelling. It is for an app that speaks the protocol's
values but holds no session, such as a web page that a host reaches by
evaluating script in it (`x0k:implementation/ui-control/page-answer`). Calls
go one at a time. JSON has no byte string, so a capture's PNG comes as an array
of byte values, and the client makes it the bytes the session would carry.

<a name="chunk-client"></a><sub>[`src/client.rs`](../../crates/x0k-ui-endpoint/src/client.rs) · `#client`</sub>

```rust {#client file="src/client.rs"}
//! A driver's end of the endpoint.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde_json::{json, Value};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::Mutex;
use x0k_datum::Datum;
use x0k_operation_wire::EffectCeiling;
use x0k_operation_session::session::{Ask, CallFault, OpenFault, Session, SessionPolicy, ShapesFault};
use x0k_ui_protocol::act::Invoke;
use x0k_ui_protocol::fixture::{PresentCall, ReleaseCall};
use x0k_ui_protocol::history::{HistoryCall, NavigateCall};
use x0k_ui_protocol::input::{Perform, TAKEOVER_ASK_MS};
use x0k_ui_protocol::observe::{Observation, ObserveCall};
use x0k_ui_protocol::offer::Offer;
use x0k_ui_protocol::screencast::{CastCall, DiscardCall, FramesCall};

use crate::screencast::decode_frames;
use crate::wire::{from_wire, decode_observation, to_wire, BadValue};
use crate::{
    shapes, CastAnswer, DiscardAnswer, FramesAnswer, HistoryAnswer, InvokeAnswer, NavigateAnswer, PerformAnswer,
    PresentAnswer, ReleaseAnswer, CAST, DISCARD, FRAMES, HISTORY, INVOKE, NAVIGATE, OBSERVE, OFFER, PERFORM,
    PRESENT, RELEASE,
};

/// How long a call waits for its answer.
const DEADLINE: Duration = Duration::from_secs(30);

/// Why a call has no answer to read.
#[derive(Debug, thiserror::Error)]
pub enum ClientFault {
    #[error(transparent)]
    Shapes(#[from] ShapesFault),
    #[error(transparent)]
    Open(#[from] OpenFault),
    #[error(transparent)]
    Call(#[from] CallFault),
    #[error(transparent)]
    Value(#[from] BadValue),
    #[error(transparent)]
    Lines(#[from] std::io::Error),
}

/// What a client's calls travel on.
enum Link {
    Session(Session),
    Lines(Mutex<Lines>),
}

/// A link that carries each call as one line of JSON, and its answer as another.
struct Lines {
    reader: Box<dyn AsyncBufRead + Send + Unpin>,
    writer: Box<dyn AsyncWrite + Send + Unpin>,
}

impl Lines {
    async fn call(&mut self, id: u64, trace: Option<String>, operation: &str, argument: Datum) -> Result<Datum, ClientFault> {
        let argument = argument.to_json().map_err(|fault| BadValue(fault.to_string()))?;
        let mut line = json!({ "id": id, "operation": operation, "argument": argument, "trace": trace }).to_string();
        line.push('\n');
        self.writer.write_all(line.as_bytes()).await?;
        self.writer.flush().await?;
        let mut answer = String::new();
        if self.reader.read_line(&mut answer).await? == 0 {
            return Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "the app closed its link").into());
        }
        let mut answer: Value = serde_json::from_str(&answer).map_err(|error| BadValue(error.to_string()))?;
        if answer["id"] != json!(id) {
            return Err(BadValue(format!("call {id} was answered as {}", answer["id"])).into());
        }
        if let Some(fault) = answer.get("fault") {
            return Err(BadValue(format!("the app could not answer {operation}: {fault}")).into());
        }
        Ok(datum_of_json(answer["answer"].take())?)
    }
}

/// An answer's JSON as the session would carry it: a capture's PNG, an array
/// of byte values in JSON, is a byte string.
fn datum_of_json(mut answer: Value) -> Result<Datum, BadValue> {
    let png = answer.get_mut("capture").and_then(|capture| capture.get_mut("png")).map(Value::take);
    let mut datum = Datum::from_json(&answer);
    if let (Some(png), Datum::Map(fields)) = (png, &mut datum) {
        let bytes: Vec<u8> = serde_json::from_value(png).map_err(|error| BadValue(format!("a capture's png: {error}")))?;
        if let Some(Datum::Map(capture)) = fields.get_mut("capture") {
            capture.insert("png".to_string(), Datum::Bytes(bytes));
        }
    }
    Ok(datum)
}

/// One session with an app.
pub struct UiClient {
    link: Link,
    calls: AtomicU64,
    trace: fn() -> Option<String>,
}

impl UiClient {
    /// A session over `stream`.
    pub async fn open<S>(stream: S) -> Result<UiClient, ClientFault>
    where
        S: AsyncRead + AsyncWrite + Send + 'static,
    {
        let (session, _) = Session::open(stream, SessionPolicy::default(), &shapes()?).await?;
        Ok(UiClient { link: Link::Session(session), calls: AtomicU64::new(0), trace: || None })
    }

    /// A client that speaks JSON lines over `stream`.
    pub fn over_json_lines<S>(stream: S) -> UiClient
    where
        S: AsyncRead + AsyncWrite + Send + 'static,
    {
        let (reader, writer) = tokio::io::split(stream);
        let lines = Lines { reader: Box::new(BufReader::new(reader)), writer: Box::new(writer) };
        UiClient { link: Link::Lines(Mutex::new(lines)), calls: AtomicU64::new(0), trace: || None }
    }

    /// Read the W3C `traceparent` each call carries from `trace`.
    pub fn traced_by(mut self, trace: fn() -> Option<String>) -> Self {
        self.trace = trace;
        self
    }

    async fn call(
        &self,
        operation: &str,
        class: EffectCeiling,
        argument: Datum,
        deadline: Duration,
    ) -> Result<Datum, ClientFault> {
        self.call_in((self.trace)(), operation, class, argument, deadline).await
    }

    async fn call_in(
        &self,
        trace: Option<String>,
        operation: &str,
        class: EffectCeiling,
        argument: Datum,
        deadline: Duration,
    ) -> Result<Datum, ClientFault> {
        let id = self.calls.fetch_add(1, Ordering::Relaxed);
        match &self.link {
            Link::Session(session) => {
                let mut ask = Ask::new(format!("ui-{id}"), operation, class, argument).within(deadline);
                ask.trace = trace;
                Ok(session.call(ask).await?)
            }
            Link::Lines(lines) => {
                let mut lines = lines.lock().await;
                let answered = tokio::time::timeout(deadline, lines.call(id, trace, operation, argument)).await;
                answered.map_err(|_| {
                    let why = format!("{operation} had no answer within {deadline:?}");
                    ClientFault::Lines(std::io::Error::new(std::io::ErrorKind::TimedOut, why))
                })?
            }
        }
    }

    /// The app's standing.
    pub async fn offer(&self) -> Result<Offer, ClientFault> {
        let empty = Datum::Map(Default::default());
        Ok(from_wire(&self.call(OFFER, EffectCeiling::ReadOnly, empty, DEADLINE).await?)?)
    }

    /// The app's standing, asked in the trace `traceparent` names, whatever
    /// trace the client otherwise carries.
    pub(crate) async fn offer_in(&self, traceparent: &str) -> Result<Offer, ClientFault> {
        let (empty, trace) = (Datum::Map(Default::default()), Some(traceparent.to_string()));
        Ok(from_wire(&self.call_in(trace, OFFER, EffectCeiling::ReadOnly, empty, DEADLINE).await?)?)
    }

    /// One observation.
    pub async fn observe(&self, call: &ObserveCall) -> Result<Observation, ClientFault> {
        let answer = self.call(OBSERVE, EffectCeiling::ReadOnly, to_wire(call)?, DEADLINE).await?;
        Ok(decode_observation(&answer)?)
    }

    /// Invoke an action.
    pub async fn invoke(&self, invoke: &Invoke) -> Result<InvokeAnswer, ClientFault> {
        self.invoke_within(invoke, DEADLINE).await
    }

    /// Invoke an action that may take as long as `deadline`.
    pub async fn invoke_within(
        &self,
        invoke: &Invoke,
        deadline: Duration,
    ) -> Result<InvokeAnswer, ClientFault> {
        let argument = to_wire(invoke)?;
        let answer = self.call(INVOKE, EffectCeiling::NonIdempotent, argument, deadline).await?;
        Ok(from_wire(&answer)?)
    }

    /// Perform a sequence of input. One that asks for a takeover waits as long
    /// again as the host may wait for the person's answer.
    pub async fn perform(&self, perform: &Perform) -> Result<PerformAnswer, ClientFault> {
        let asks = if perform.takeover { Duration::from_millis(TAKEOVER_ASK_MS) } else { Duration::ZERO };
        let answer = self.call(PERFORM, EffectCeiling::NonIdempotent, to_wire(perform)?, DEADLINE + asks).await?;
        Ok(from_wire(&answer)?)
    }

    /// The positions of the app's history a call asks for.
    pub async fn history(&self, call: &HistoryCall) -> Result<HistoryAnswer, ClientFault> {
        let answer = self.call(HISTORY, EffectCeiling::ReadOnly, to_wire(call)?, DEADLINE).await?;
        Ok(from_wire(&answer)?)
    }

    /// Show a past position, or the live state.
    pub async fn navigate(&self, call: &NavigateCall) -> Result<NavigateAnswer, ClientFault> {
        let answer = self.call(NAVIGATE, EffectCeiling::IdempotentWrite, to_wire(call)?, DEADLINE).await?;
        Ok(from_wire(&answer)?)
    }

    /// Show a state fixture.
    pub async fn present(&self, call: &PresentCall) -> Result<PresentAnswer, ClientFault> {
        let answer = self.call(PRESENT, EffectCeiling::IdempotentWrite, to_wire(call)?, DEADLINE).await?;
        Ok(from_wire(&answer)?)
    }

    /// Return from a state fixture to the live state.
    pub async fn release(&self, call: &ReleaseCall) -> Result<ReleaseAnswer, ClientFault> {
        let answer = self.call(RELEASE, EffectCeiling::IdempotentWrite, to_wire(call)?, DEADLINE).await?;
        Ok(from_wire(&answer)?)
    }

    /// Play a run and keep its frames, waiting as long as `deadline`: a
    /// stepped screencast takes the wall's time each frame costs, and a hold
    /// the person is asked for waits on their answer.
    pub async fn cast(&self, call: &CastCall, deadline: Duration) -> Result<CastAnswer, ClientFault> {
        let answer = self.call(CAST, EffectCeiling::NonIdempotent, to_wire(call)?, deadline).await?;
        Ok(from_wire(&answer)?)
    }

    /// Read frames of the screencast the session holds.
    pub async fn frames(&self, call: &FramesCall) -> Result<FramesAnswer, ClientFault> {
        let answer = self.call(FRAMES, EffectCeiling::ReadOnly, to_wire(call)?, DEADLINE).await?;
        Ok(decode_frames(&answer)?)
    }

    /// Drop the screencast the session holds.
    pub async fn discard(&self, call: &DiscardCall) -> Result<DiscardAnswer, ClientFault> {
        let answer = self.call(DISCARD, EffectCeiling::IdempotentWrite, to_wire(call)?, DEADLINE).await?;
        Ok(from_wire(&answer)?)
    }
}
```

## Holding it to the decision

The test is a small app on an in-memory pipe, driven through the client. The
claims are the ones §9 and §10 make of an endpoint rather than of a check: a
refused call never reaches the app, and a capture's bytes survive the wire.
The three hooks hold the same way: while the app says its window is not
visible, an action and a sequence are refused as `cannot_paint` and the app
runs neither, and an observation refuses the capture and keeps the layout and
the state; a kind the host does not deliver is refused as
`undeliverable_source` and the app hears nothing; an action and a sequence the
app declines under a fixture are refused as `declined`, and the same app runs
them live; a sequence the app declines whatever it shows is refused as
`declined` live too, and it hears nothing of it. A fixture the app ends itself is told to the session that presented
it, once, as `fixture_ended` with the app's reason, and to no other session; its
release answers `ended` with the reason. A sequence's `requester_name` reaches
the app beside the connection's requester, and a takeover is asked for the
requester however the sequence names itself.
The host's configuration of who allows a takeover holds through the endpoint:
one it refuses is refused as `takeover_not_granted`, naming the requester and
the configuration, and neither the person nor the window hears of it; one it
allows holds the window without asking, and the requester's next one holds
again; with nothing configured the person is asked; a rule cannot be made to
match by the name a sequence gives itself; and what the app declines for now
is declined under an allow before the window is held.
Under a fixture the same holds of a stand-in: a simulated action never reaches
the app, and neither does one under a policy that lowers a floor. The suite
sees only the answers, so these two are the endpoint's to hold. What
`ui/history` asks of an endpoint, a session's end among it, is the suite's to
hold (`x0k:implementation/ui-control/conformance`), against apps that break it.

<a name="chunk-endpoint-test"></a><sub>[`tests/endpoint.rs`](../../crates/x0k-ui-endpoint/tests/endpoint.rs) · `#endpoint-test`</sub>

```rust {#endpoint-test file="tests/endpoint.rs"}
//! A small app driven through the client, over the operation wire.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use x0k_ui_endpoint::client::UiClient;
use x0k_ui_endpoint::server::{serve_connection, serve_connection_from, Declinable, Endpoint, UiApp};
use x0k_ui_endpoint::takeover::{HoldAnswer, HoldMatch, Requester, TakeoverPolicy};
use x0k_ui_endpoint::{InvokeAnswer, PerformAnswer, ReleaseAnswer};
use x0k_ui_protocol::act::{Grant, Invoke, Outcome};
use x0k_ui_protocol::fixture::{Fixture, PresentAnswer, PresentCall, ReleaseCall};
use x0k_ui_protocol::history::{HistoryOffer, Shown};
use x0k_ui_protocol::input::{HeldFrame, InputOffer, Perform, Resolved, Source, Step, Target};
use x0k_ui_protocol::observe::{check_observation, Bounds, Capture, LayoutNode, Observation, ObserveCall, Part};
use x0k_ui_protocol::observe::StatePart;
use x0k_ui_protocol::offer::{Action, Offer, SideEffect, UI_HISTORY, UI_INPUT};
use x0k_ui_protocol::replay::{Covers, PolicyEntry, ReplayDisposition};
use x0k_ui_protocol::shapes::{interface, interfaces, shape_pin};
use x0k_ui_protocol::RefusalCode;

#[derive(Clone, Default)]
struct Demo {
    invoked: Arc<AtomicUsize>,
    performed: Arc<Mutex<Vec<Resolved>>>,
    /// The fixture it shows, once one is presented.
    fixture: Arc<Mutex<Option<String>>>,
    /// The replay policy its offer states.
    policy: Vec<PolicyEntry>,
    /// Whether its offer says it holds a takeover, and whether the person grants one.
    takes_over: Option<bool>,
    /// The requester of each sequence it ran.
    requesters: Arc<Mutex<Vec<String>>>,
    /// Why its host cannot paint its window, when it cannot.
    unpainted: Option<String>,
    /// The source kinds its host delivers, when not every kind.
    delivers: Option<&'static [&'static str]>,
    /// Why it declines actions and input under a fixture, when it does.
    declines: Option<String>,
    /// Why it declines input whatever it shows, when it does.
    declines_input: Option<String>,
    /// The fixture it ended itself, and why.
    ended: Arc<Mutex<Option<(String, String)>>>,
    /// The one requester the person grants a takeover, when there is one.
    grants_to: Option<&'static str>,
    /// Whom the person was asked to grant a takeover.
    asked: Arc<Mutex<Vec<String>>>,
    /// The name each sequence it ran gave its requester.
    names: Arc<Mutex<Vec<Option<String>>>>,
    /// For whom it held the window without asking.
    held_for: Arc<Mutex<Vec<String>>>,
}

impl Demo {
    /// End the fixture that stands, for `reason`, and show the live state.
    fn end_fixture(&self, reason: &str) {
        let handle = self.fixture.lock().expect("the demo's lock").take().expect("a fixture stands");
        *self.ended.lock().expect("the demo's lock") = Some((handle, reason.to_string()));
    }
}

fn window() -> LayoutNode {
    LayoutNode {
        id: "root".to_string(),
        role: "window".to_string(),
        label: None,
        value: None,
        bounds: Bounds { x: 0.0, y: 0.0, width: 4.0, height: 2.0 },
        laid_out: None,
        visible: true,
        enabled: true,
        focused: false,
        interactive: false,
        opacity: None,
        action: None,
        source: None,
        composition: None,
        children: Vec::new(),
    }
}

fn any_shape() -> x0k_datum::Datum {
    x0k_datum::Datum::from_json(&json!({"kind": "any"}))
}

impl UiApp for Demo {
    async fn offer(&self) -> Offer {
        Offer {
            app: "demo".to_string(),
            instance: "1".to_string(),
            interfaces: interfaces().into_iter().chain(interface(UI_HISTORY)).collect(),
            actions: vec![Action {
                name: "chat.send".to_string(),
                description: "Send the message".to_string(),
                args: json!({"kind": "any"}),
                result: json!({"kind": "any"}),
                side_effect: SideEffect::NonIdempotent,
            }],
            state_head: Some("s1".to_string()),
            history: Some(HistoryOffer { oldest: None, newest: None, fixtures: true }),
            grades: Vec::new(),
            replay_policy: self.policy.clone(),
            sandboxes: Vec::new(),
            input: self.takes_over.map(|_| InputOffer { presents: false, takeover: true }),
            dev_instance: false,
            screencast: None,
        }
    }

    async fn observe(&self, call: ObserveCall) -> Observation {
        let wants = |part| call.parts.contains(&part);
        let capture = Capture { png: vec![0, 159, 146, 150], width: 4, height: 2, scale_factor: 2.0, presented: false };
        Observation {
            frame: Some("f1".to_string()),
            capture: wants(Part::Capture).then_some(capture),
            layout: wants(Part::Layout).then(window),
            state: match wants(Part::State) {
                true => self.live_state().await,
                false => None,
            },
            refused: Vec::new(),
            shown: Some(Shown::Live),
        }
    }

    async fn invoke(&self, _action: &Action, args: Value) -> Outcome {
        self.invoked.fetch_add(1, Ordering::Relaxed);
        Outcome::Done { result: args, frame: Some("f2".to_string()) }
    }

    async fn held_frames(&self) -> Vec<HeldFrame> {
        vec![HeldFrame { frame: "f1".to_string(), width: 100, height: 100, layout: None }]
    }

    async fn perform(&self, _perform: Perform, resolved: Vec<Resolved>) -> Option<String> {
        self.performed.lock().expect("the demo's lock").extend(resolved);
        Some("f3".to_string())
    }

    async fn perform_for(&self, requester: &str, perform: Perform, resolved: Vec<Resolved>) -> Option<String> {
        self.requesters.lock().expect("the demo's lock").push(requester.to_string());
        self.names.lock().expect("the demo's lock").push(perform.requester_name.clone());
        self.perform(perform, resolved).await
    }

    async fn grant_takeover(&self, requester: &str) -> bool {
        self.asked.lock().expect("the demo's lock").push(requester.to_string());
        self.takes_over == Some(true) || self.grants_to == Some(requester)
    }

    async fn hold_takeover(&self, requester: &str) -> bool {
        self.held_for.lock().expect("the demo's lock").push(requester.to_string());
        self.takes_over.is_some()
    }

    async fn shown(&self) -> Shown {
        match self.fixture.lock().expect("the demo's lock").clone() {
            Some(handle) => Shown::Fixture { handle },
            None => Shown::Live,
        }
    }

    fn state_shape(&self) -> Option<x0k_datum::Datum> {
        Some(any_shape())
    }

    async fn live_state(&self) -> Option<StatePart> {
        Some(StatePart { value: json!({}), head: "s1".to_string(), fingerprint: shape_pin(&any_shape()) })
    }

    async fn present(&self, _state: Value, _marked: bool) -> PresentAnswer {
        *self.fixture.lock().expect("the demo's lock") = Some("x1".to_string());
        PresentAnswer::Presented { handle: "x1".to_string(), frame: Some("f4".to_string()) }
    }

    async fn cannot_paint(&self) -> Option<String> {
        self.unpainted.clone()
    }

    fn delivers(&self) -> &[&str] {
        self.delivers.unwrap_or(x0k_ui_protocol::input::SOURCE_KINDS)
    }

    async fn declines(&self, _call: Declinable<'_>) -> Option<String> {
        self.declines.clone()
    }

    async fn declines_input(&self, _requester: &str, _perform: &Perform) -> Option<String> {
        self.declines_input.clone()
    }

    async fn release(&self, handle: String) -> ReleaseAnswer {
        let mut fixture = self.fixture.lock().expect("the demo's lock");
        if fixture.as_deref() != Some(handle.as_str()) {
            return ReleaseAnswer::NotStanding { handle };
        }
        *fixture = None;
        ReleaseAnswer::Released { frame: Some("f5".to_string()) }
    }

    async fn fixture_ended(&self, handle: &str) -> Option<String> {
        let ended = self.ended.lock().expect("the demo's lock");
        ended.as_ref().filter(|(ended, _)| ended == handle).map(|(_, reason)| reason.clone())
    }
}

async fn driven(grant: Grant) -> (UiClient, Demo) {
    driven_as(Demo::default(), grant).await
}

async fn driven_as(demo: Demo, grant: Grant) -> (UiClient, Demo) {
    let (ours, theirs) = tokio::io::duplex(64 * 1024);
    let endpoint = Arc::new(Endpoint::new(demo.clone(), grant));
    tokio::spawn(serve_connection(theirs, endpoint));
    (UiClient::open(ours).await.expect("a session"), demo)
}

fn click_at(x: f64) -> Perform {
    Perform {
        sources: vec![Source {
            id: "m".to_string(),
            kind: "mouse".to_string(),
            steps: vec![
                Step::Move { to: Target::Pixel { frame: "f1".to_string(), x, y: 5.0 } },
                Step::Down { button: 0 },
                Step::Up { button: 0 },
            ],
        }],
        ..Perform::default()
    }
}

#[tokio::test]
async fn a_takeover_runs_only_when_the_person_grants_it_and_the_app_hears_who_asked() {
    for grants in [false, true] {
        let demo = Demo { takes_over: Some(grants), ..Demo::default() };
        let (ours, theirs) = tokio::io::duplex(64 * 1024);
        let endpoint = Arc::new(Endpoint::new(demo.clone(), Grant { classes: vec![] }));
        tokio::spawn(serve_connection_from(theirs, endpoint, Requester::peer(501, Some(7))));
        let client = UiClient::open(ours).await.expect("a session");
        let answer = client.perform(&Perform { takeover: true, ..click_at(1.0) }).await.expect("an answer");
        if grants {
            assert!(matches!(answer, PerformAnswer::Done { .. }), "{answer:?}");
            assert_eq!(*demo.requesters.lock().expect("the demo's lock"), vec!["uid 501 pid 7".to_string()]);
        } else {
            let PerformAnswer::Refused(refused) = answer else { panic!("a takeover ran ungranted: {answer:?}") };
            assert_eq!((refused.code, refused.subject.as_deref()), (RefusalCode::TakeoverNotGranted, Some("uid 501 pid 7")));
            assert!(demo.performed.lock().expect("the demo's lock").is_empty(), "the app heard an ungranted takeover");
        }
    }
}

#[tokio::test]
async fn an_observation_keeps_its_capture_bytes_across_the_wire() {
    let (client, _) = driven(Grant { classes: vec![] }).await;
    let offer = client.offer().await.expect("the offer");
    assert_eq!(offer.app, "demo");
    let call = ObserveCall { parts: vec![Part::Capture], region: None, scale: None, frame_only: false };
    let observation = client.observe(&call).await.expect("an observation");
    assert_eq!(observation.frame.as_deref(), Some("f1"));
    let capture = observation.capture.expect("a capture");
    assert_eq!(capture.png, vec![0, 159, 146, 150]);
    assert_eq!((capture.width, capture.height), (4, 2));
}

#[tokio::test]
async fn an_action_inside_the_grant_runs_and_names_the_frame_after_it() {
    let (client, demo) = driven(Grant { classes: vec![SideEffect::NonIdempotent] }).await;
    let invoke = Invoke { action: "chat.send".to_string(), args: json!({"text": "hi"}) };
    let answer = client.invoke(&invoke).await.expect("an answer");
    let expected = InvokeAnswer::Done { result: json!({"text": "hi"}), frame: Some("f2".to_string()) };
    assert_eq!(answer, expected);
    assert_eq!(demo.invoked.load(Ordering::Relaxed), 1);
}

#[tokio::test]
async fn an_action_outside_the_grant_never_reaches_the_app() {
    let (client, demo) = driven(Grant { classes: vec![SideEffect::ReadOnly] }).await;
    let invoke = Invoke { action: "chat.send".to_string(), args: json!(null) };
    let InvokeAnswer::Refused(refused) = client.invoke(&invoke).await.expect("an answer") else {
        panic!("the action ran");
    };
    assert_eq!(refused.code, RefusalCode::OutsideGrant);
    assert_eq!(demo.invoked.load(Ordering::Relaxed), 0);
}

#[tokio::test]
async fn input_reaches_the_app_resolved_or_not_at_all() {
    let (client, demo) = driven(Grant { classes: vec![] }).await;
    let answer = client.perform(&click_at(5.0)).await.expect("an answer");
    assert_eq!(answer, PerformAnswer::Done { frame: Some("f3".to_string()) });
    assert_eq!(demo.performed.lock().expect("the lock").len(), 1);

    let PerformAnswer::Refused(refused) = client.perform(&click_at(500.0)).await.expect("an answer")
    else {
        panic!("the sequence ran");
    };
    assert_eq!(refused.code, RefusalCode::OutsideFrame);
    assert_eq!(demo.performed.lock().expect("the lock").len(), 1);
}

#[tokio::test]
async fn while_the_host_cannot_paint_an_action_and_input_are_refused_as_cannot_paint_and_never_run() {
    let demo = Demo { unpainted: Some("the window is minimised".to_string()), ..Demo::default() };
    let (client, demo) = driven_as(demo, Grant { classes: vec![SideEffect::NonIdempotent] }).await;
    let invoke = Invoke { action: "chat.send".to_string(), args: json!({"text": "hi"}) };
    let InvokeAnswer::Refused(refused) = client.invoke(&invoke).await.expect("an answer") else {
        panic!("the action was answered");
    };
    assert_eq!((refused.code, refused.subject.as_deref()), (RefusalCode::CannotPaint, Some("chat.send")));
    let PerformAnswer::Refused(refused) = client.perform(&click_at(5.0)).await.expect("an answer") else {
        panic!("the sequence ran");
    };
    assert_eq!((refused.code, refused.subject.as_deref()), (RefusalCode::CannotPaint, Some("ui/input")));
    assert_eq!(demo.invoked.load(Ordering::Relaxed), 0, "an action ran while the host could not paint");
    assert!(demo.performed.lock().expect("the lock").is_empty(), "input ran while the host could not paint");

    let PerformAnswer::Refused(refused) = client.perform(&click_at(500.0)).await.expect("an answer") else {
        panic!("the sequence ran");
    };
    assert_eq!(refused.code, RefusalCode::OutsideFrame, "the call's own checks come first");
}

#[tokio::test]
async fn while_the_host_cannot_paint_an_observation_refuses_the_capture_and_keeps_the_layout_and_state() {
    let demo = Demo { unpainted: Some("the window is minimised".to_string()), ..Demo::default() };
    let (client, _) = driven_as(demo, Grant { classes: vec![] }).await;
    let call = ObserveCall { parts: vec![Part::Capture, Part::Layout, Part::State], region: None, scale: None, frame_only: false };
    let observation = client.observe(&call).await.expect("an observation");
    assert_eq!(check_observation(&call, &observation), Ok(()), "{observation:?}");
    assert!(observation.capture.is_none(), "a capture came back");
    let refused: Vec<_> = observation.refused.iter().map(|refused| (refused.part, refused.code)).collect();
    assert_eq!(refused, vec![(Part::Capture, Some(RefusalCode::CannotPaint))]);
    assert!(observation.layout.is_some() && observation.state.is_some(), "{observation:?}");

    let (client, _) = driven(Grant { classes: vec![] }).await;
    let observation = client.observe(&call).await.expect("an observation");
    assert!(observation.capture.is_some() && observation.refused.is_empty(), "a visible window answers every part");
}

#[tokio::test]
async fn a_source_kind_the_host_does_not_deliver_is_refused_as_undeliverable_and_never_reaches_the_app() {
    let demo = Demo { delivers: Some(&["mouse", "key", "wheel"]), ..Demo::default() };
    let (client, demo) = driven_as(demo, Grant { classes: vec![] }).await;
    let touch = Perform { sources: vec![Source { kind: "touch".to_string(), ..click_at(5.0).sources[0].clone() }], ..Perform::default() };
    let PerformAnswer::Refused(refused) = client.perform(&touch).await.expect("an answer") else {
        panic!("the sequence ran");
    };
    assert_eq!((refused.code, refused.subject.as_deref()), (RefusalCode::UndeliverableSource, Some("touch")));
    assert!(demo.performed.lock().expect("the lock").is_empty(), "the app heard a touch it cannot deliver");
    let answer = client.perform(&click_at(5.0)).await.expect("an answer");
    assert_eq!(answer, PerformAnswer::Done { frame: Some("f3".to_string()) });
}

/// A session with `demo` showing a fixture.
async fn under_a_fixture(demo: Demo) -> (UiClient, Demo) {
    let (client, demo) = driven_as(demo, Grant { classes: vec![SideEffect::NonIdempotent] }).await;
    let fixture = Fixture::Patch { patch: json!({}) };
    let call = PresentCall { fixture, fingerprint: shape_pin(&any_shape()), if_match: Some("s1".to_string()), mark: None };
    let presented = client.present(&call).await.expect("an answer");
    assert!(matches!(presented, PresentAnswer::Presented { .. }), "{presented:?}");
    (client, demo)
}

#[tokio::test]
async fn under_a_fixture_a_non_idempotent_action_is_simulated_and_never_reaches_the_app() {
    let (client, demo) = under_a_fixture(Demo::default()).await;
    let invoke = Invoke { action: "chat.send".to_string(), args: json!({"text": "hi"}) };
    let answer = client.invoke(&invoke).await.expect("an answer");
    assert_eq!(answer, InvokeAnswer::Simulated { action: "chat.send".to_string() });
    assert_eq!(demo.invoked.load(Ordering::Relaxed), 0, "a simulated action ran");
}

#[tokio::test]
async fn under_a_fixture_an_action_and_input_the_app_declines_are_refused_as_declined_and_run_live() {
    let declining = Demo { declines: Some("an approval waits for a person".to_string()), ..Demo::default() };
    let invoke = Invoke { action: "chat.send".to_string(), args: json!({"text": "hi"}) };
    let (live, demo) = driven_as(declining.clone(), Grant { classes: vec![SideEffect::NonIdempotent] }).await;
    assert!(matches!(live.invoke(&invoke).await.expect("an answer"), InvokeAnswer::Done { .. }), "live, nothing is declined");
    assert_eq!(demo.invoked.load(Ordering::Relaxed), 1);

    let (client, demo) = under_a_fixture(Demo { invoked: Arc::default(), ..declining }).await;
    let InvokeAnswer::Refused(refused) = client.invoke(&invoke).await.expect("an answer") else {
        panic!("the action was answered");
    };
    assert_eq!((refused.code, refused.subject.as_deref()), (RefusalCode::Declined, Some("chat.send")));
    assert_eq!(refused.why, "an approval waits for a person");
    let PerformAnswer::Refused(refused) = client.perform(&click_at(5.0)).await.expect("an answer") else {
        panic!("the sequence ran");
    };
    assert_eq!((refused.code, refused.subject.as_deref()), (RefusalCode::Declined, Some("ui/input")));
    assert_eq!(demo.invoked.load(Ordering::Relaxed), 0, "a declined action ran");
    assert!(demo.performed.lock().expect("the lock").is_empty(), "declined input ran");
}

#[tokio::test]
async fn a_sequence_the_app_declines_whatever_it_shows_is_refused_as_declined_and_never_runs() {
    let declining = Demo { declines_input: Some("the person is using the window".to_string()), ..Demo::default() };
    let (live, demo) = driven_as(declining, Grant { classes: vec![SideEffect::NonIdempotent] }).await;
    let PerformAnswer::Refused(refused) = live.perform(&click_at(5.0)).await.expect("an answer") else {
        panic!("the sequence ran");
    };
    assert_eq!((refused.code, refused.subject.as_deref(), refused.why.as_str()), (RefusalCode::Declined, Some("ui/input"), "the person is using the window"));
    assert!(demo.performed.lock().expect("the lock").is_empty(), "declined input ran");
    let invoke = Invoke { action: "chat.send".to_string(), args: json!({"text": "hi"}) };
    assert!(matches!(live.invoke(&invoke).await.expect("an answer"), InvokeAnswer::Done { .. }), "an action is not input");
}

/// Why the demo ends its fixture.
const ARRIVED: &str = "an approval arrived for a person";

#[tokio::test]
async fn a_fixture_the_app_ends_is_told_once_to_its_presenter_and_its_release_names_why() {
    let (client, demo) = under_a_fixture(Demo::default()).await;
    demo.end_fixture(ARRIVED);
    let invoke = Invoke { action: "chat.send".to_string(), args: json!({"text": "hi"}) };
    let InvokeAnswer::Refused(refused) = client.invoke(&invoke).await.expect("an answer") else {
        panic!("the action ran on the live state unannounced");
    };
    assert_eq!((refused.code, refused.subject.as_deref(), refused.why.as_str()), (RefusalCode::FixtureEnded, Some("x1"), ARRIVED));
    assert_eq!(demo.invoked.load(Ordering::Relaxed), 0, "the refused action ran");
    let answer = client.invoke(&invoke).await.expect("an answer");
    assert!(matches!(answer, InvokeAnswer::Done { .. }), "told once, the next action runs live: {answer:?}");
    let answer = client.release(&ReleaseCall { handle: "x1".to_string() }).await.expect("an answer");
    assert_eq!(answer, ReleaseAnswer::Ended { handle: "x1".to_string(), reason: ARRIVED.to_string() });
    let answer = client.release(&ReleaseCall { handle: "x9".to_string() }).await.expect("an answer");
    assert_eq!(answer, ReleaseAnswer::NotStanding { handle: "x9".to_string() }, "a handle that never stood");
}

/// A session of its own with `endpoint`.
async fn session(endpoint: &Arc<Endpoint<Demo>>) -> UiClient {
    let (ours, theirs) = tokio::io::duplex(64 * 1024);
    tokio::spawn(serve_connection(theirs, Arc::clone(endpoint)));
    UiClient::open(ours).await.expect("a session")
}

#[tokio::test]
async fn only_the_session_that_presented_a_fixture_the_app_ended_hears_it_ended() {
    let demo = Demo::default();
    let endpoint = Arc::new(Endpoint::new(demo.clone(), Grant { classes: vec![] }));
    let (presenter, other) = (session(&endpoint).await, session(&endpoint).await);
    let fixture = Fixture::Patch { patch: json!({}) };
    let call = PresentCall { fixture, fingerprint: shape_pin(&any_shape()), if_match: None, mark: None };
    assert!(matches!(presenter.present(&call).await.expect("an answer"), PresentAnswer::Presented { .. }));
    demo.end_fixture(ARRIVED);
    let answer = other.perform(&click_at(5.0)).await.expect("an answer");
    assert_eq!(answer, PerformAnswer::Done { frame: Some("f3".to_string()) }, "a session that presented nothing");
    let PerformAnswer::Refused(refused) = presenter.perform(&click_at(5.0)).await.expect("an answer") else {
        panic!("the presenter's sequence ran on the live state unannounced");
    };
    assert_eq!((refused.code, refused.subject.as_deref(), refused.why.as_str()), (RefusalCode::FixtureEnded, Some("x1"), ARRIVED));
    assert_eq!(demo.performed.lock().expect("the lock").len(), 1, "the refused sequence ran");
}

/// A session with `demo` behind an endpoint configured by `policy`, its
/// connection's requester `uid 501 pid 7`.
async fn configured(demo: &Demo, policy: TakeoverPolicy) -> UiClient {
    let (ours, theirs) = tokio::io::duplex(64 * 1024);
    let endpoint = Arc::new(Endpoint::new(demo.clone(), Grant { classes: vec![] }).with_takeover(policy));
    tokio::spawn(serve_connection_from(theirs, endpoint, Requester::peer(501, Some(7))));
    UiClient::open(ours).await.expect("a session")
}

fn takeover_at(x: f64) -> Perform {
    Perform { takeover: true, ..click_at(x) }
}

#[tokio::test]
async fn a_takeover_the_configuration_refuses_is_refused_naming_it_and_no_one_is_asked() {
    let demo = Demo { takes_over: Some(true), ..Demo::default() };
    let client = configured(&demo, TakeoverPolicy::default().otherwise(HoldAnswer::Refuse)).await;
    let PerformAnswer::Refused(refused) = client.perform(&takeover_at(1.0)).await.expect("an answer") else {
        panic!("a refused takeover ran");
    };
    assert_eq!((refused.code, refused.subject.as_deref()), (RefusalCode::TakeoverNotGranted, Some("uid 501 pid 7")));
    assert!(refused.why.contains("configuration"), "the refusal names the configuration: {}", refused.why);
    assert!(demo.asked.lock().expect("the lock").is_empty(), "the person was asked");
    assert!(demo.held_for.lock().expect("the lock").is_empty(), "the window was held");
    assert!(demo.performed.lock().expect("the lock").is_empty(), "the sequence ran");
}

#[tokio::test]
async fn a_takeover_the_configuration_allows_holds_without_asking() {
    let demo = Demo { takes_over: Some(false), ..Demo::default() };
    let rule = HoldMatch { uid: Some(501), ..HoldMatch::default() };
    let client = configured(&demo, TakeoverPolicy::default().rule(rule, HoldAnswer::Allow)).await;
    let answer = client.perform(&takeover_at(1.0)).await.expect("an answer");
    assert!(matches!(answer, PerformAnswer::Done { .. }), "{answer:?}");
    assert!(demo.asked.lock().expect("the lock").is_empty(), "the person was asked");
    assert_eq!(*demo.held_for.lock().expect("the lock"), vec!["uid 501 pid 7".to_string()]);
    let answer = client.perform(&takeover_at(2.0)).await.expect("an answer");
    assert!(matches!(answer, PerformAnswer::Done { .. }), "the requester's next takeover holds again: {answer:?}");
}

#[tokio::test]
async fn with_nothing_configured_a_takeover_asks_the_person() {
    let demo = Demo { takes_over: Some(false), ..Demo::default() };
    let client = configured(&demo, TakeoverPolicy::default()).await;
    let PerformAnswer::Refused(refused) = client.perform(&takeover_at(1.0)).await.expect("an answer") else {
        panic!("an unasked takeover ran");
    };
    assert_eq!(refused.code, RefusalCode::TakeoverNotGranted);
    assert!(refused.why.contains("the person"), "{}", refused.why);
    assert_eq!(*demo.asked.lock().expect("the lock"), vec!["uid 501 pid 7".to_string()]);
    assert!(demo.held_for.lock().expect("the lock").is_empty(), "the window was held unasked");
}

#[tokio::test]
async fn a_requester_name_cannot_make_a_rule_match() {
    let demo = Demo { takes_over: Some(false), ..Demo::default() };
    let named = HoldMatch { on_behalf_of: Some("Apollo".to_string()), ..HoldMatch::default() };
    let client = configured(&demo, TakeoverPolicy::default().rule(named, HoldAnswer::Allow).otherwise(HoldAnswer::Refuse)).await;
    let claims = Perform { requester_name: Some("Apollo".to_string()), ..takeover_at(1.0) };
    let PerformAnswer::Refused(refused) = client.perform(&claims).await.expect("an answer") else {
        panic!("a name the driver gave itself won a takeover");
    };
    assert_eq!((refused.code, refused.subject.as_deref()), (RefusalCode::TakeoverNotGranted, Some("uid 501 pid 7")));
    assert!(demo.held_for.lock().expect("the lock").is_empty(), "the window was held for a name");
}

#[tokio::test]
async fn what_the_app_declines_for_now_is_declined_under_an_allow() {
    let declines_input = Some("the person is using the window".to_string());
    let demo = Demo { takes_over: Some(true), declines_input, ..Demo::default() };
    let client = configured(&demo, TakeoverPolicy::default().otherwise(HoldAnswer::Allow)).await;
    let PerformAnswer::Refused(refused) = client.perform(&takeover_at(1.0)).await.expect("an answer") else {
        panic!("an allowed takeover ran past what the app declines");
    };
    assert_eq!((refused.code, refused.subject.as_deref()), (RefusalCode::Declined, Some(UI_INPUT)));
    assert!(demo.held_for.lock().expect("the lock").is_empty(), "the window was held before the app declined");
    assert!(demo.performed.lock().expect("the lock").is_empty(), "the sequence ran");
}

#[tokio::test]
async fn a_requester_name_reaches_the_app_and_a_takeover_is_asked_for_the_connection_s_requester() {
    let demo = Demo { takes_over: Some(false), grants_to: Some("Apollo"), ..Demo::default() };
    let (ours, theirs) = tokio::io::duplex(64 * 1024);
    let endpoint = Arc::new(Endpoint::new(demo.clone(), Grant { classes: vec![] }));
    tokio::spawn(serve_connection_from(theirs, endpoint, Requester::peer(501, Some(7))));
    let client = UiClient::open(ours).await.expect("a session");
    let named = Perform { requester_name: Some("Apollo".to_string()), ..click_at(1.0) };
    let answer = client.perform(&named).await.expect("an answer");
    assert!(matches!(answer, PerformAnswer::Done { .. }), "{answer:?}");
    assert_eq!(*demo.names.lock().expect("the lock"), vec![Some("Apollo".to_string())]);
    assert_eq!(*demo.requesters.lock().expect("the lock"), vec!["uid 501 pid 7".to_string()]);

    let answer = client.perform(&Perform { takeover: true, ..named }).await.expect("an answer");
    let PerformAnswer::Refused(refused) = answer else { panic!("a name won a takeover: {answer:?}") };
    assert_eq!((refused.code, refused.subject.as_deref()), (RefusalCode::TakeoverNotGranted, Some("uid 501 pid 7")));
    assert_eq!(*demo.asked.lock().expect("the lock"), vec!["uid 501 pid 7".to_string()]);
}

#[tokio::test]
async fn under_a_policy_that_lowers_a_floor_an_action_is_refused_and_never_reaches_the_app() {
    let lowers = PolicyEntry {
        covers: Covers::Class { class: SideEffect::NonIdempotent },
        vary: Some(ReplayDisposition::Performed),
        continue_after_cut: None,
        sandbox: None,
    };
    let (client, demo) = under_a_fixture(Demo { policy: vec![lowers], ..Demo::default() }).await;
    let invoke = Invoke { action: "chat.send".to_string(), args: json!({"text": "hi"}) };
    let InvokeAnswer::Refused(refused) = client.invoke(&invoke).await.expect("an answer") else {
        panic!("the action was answered");
    };
    assert_eq!(refused.code, RefusalCode::UnreadablePolicy);
    assert_eq!(demo.invoked.load(Ordering::Relaxed), 0, "an action ran under a floor-lowering policy");
}

#[tokio::test]
async fn a_call_on_an_operation_two_ends_differ_over_is_refused_by_name_and_never_sent() {
    use std::collections::BTreeMap;
    use x0k_datum::shape::DeclaredShapes;
    use x0k_operation_wire::EffectCeiling;
    use x0k_operation_session::session::{Ask, CallFault, Session, SessionPolicy, Shapes};

    /// Pins nothing the endpoint would agree with.
    struct Another;
    impl x0k_datum::shape::Pinner for Another {
        fn pin(
            &self,
            _value: &x0k_datum::Datum,
        ) -> Result<String, x0k_datum::shape::Unpinnable> {
            Ok("another".to_string())
        }
    }
    let spelled = x0k_datum::Datum::from_json(&json!({"kind": "text"}));
    let declared: BTreeMap<String, DeclaredShapes> = x0k_ui_endpoint::OPERATIONS
        .iter()
        .map(|name| {
            let shapes = DeclaredShapes {
                arg: Some(spelled.clone()),
                answer: Some(spelled.clone()),
                derived_answer: None,
            };
            (name.to_string(), shapes)
        })
        .collect();
    let other = Shapes::new(declared, Arc::new(Another)).expect("shapes");
    let (ours, theirs) = tokio::io::duplex(64 * 1024);
    let endpoint = Arc::new(Endpoint::new(Demo::default(), Grant { classes: vec![] }));
    tokio::spawn(serve_connection(theirs, endpoint));
    let (session, _) = Session::open(ours, SessionPolicy::default(), &other).await.expect("a session");
    let empty = x0k_datum::Datum::Map(Default::default());
    let ask = Ask::new("one", x0k_ui_endpoint::OFFER, EffectCeiling::ReadOnly, empty);
    let Err(CallFault::Disagreed { operation, .. }) = session.call(ask).await else {
        panic!("the call was sent");
    };
    assert_eq!(operation, x0k_ui_endpoint::OFFER);
}

/// A connection on a local socket names its peer's credentials as its requester.
#[cfg(target_os = "linux")]
#[tokio::test]
async fn a_connection_names_its_peer_as_its_requester() {
    use std::os::unix::fs::MetadataExt;
    let (ours, _theirs) = tokio::net::UnixStream::pair().expect("a socket pair");
    let uid = std::fs::metadata("/proc/self").expect("this process").uid();
    assert_eq!(x0k_ui_endpoint::server::requester(&ours).to_string(), format!("uid {uid} pid {}", std::process::id()));
}
```

That a call runs in its caller's trace is the suite's claim, so every app is held
to it, and its test is in `ui-control/conformance`.
