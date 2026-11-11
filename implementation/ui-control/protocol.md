
# x0k-ui-protocol: the values of the UI-control endpoint

```turtle folio:document
implementation:ui-control\/protocol a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "x0k-ui-protocol: what an app and a driver say to each other over the UI-control endpoint (an offer, one observation, an action, a sequence of input, the app's history), and the checks the decisions make before an app runs anything, with conformance vectors any language can run." ;
    x0k:concerns "ui-control", "protocol", "conformance", "publication" ;
    x0k:implements architecture:ui-control-channel,
        architecture:ui-interfaces ;
    x0k:motivatedBy intent:1f4dc28c-a369-4998-520d-9b00578b5b17,
        intent:9a9b3f4d-35b5-11fc-0143-7f250b849a3a ;
    folio:tangleCrate "crates/x0k-ui-protocol" ;
    folio:tangleRoot "src/lib.rs" .
```

A driver and an app in any language agree on what `x0k:architecture/ui-control-channel`
§8, §9 and §10 and `x0k:architecture/ui-interfaces` §1 to §5 say, or the two
cannot work together. This crate states those values and the checks made on them,
and depends on nothing but `x0k-datum`.
It holds no socket and no window, so it can be read, tested and published
without the rest of x0k.

A call and its answer travel as frames of the operation wire
(`x0k:implementation/sync/operation-wire`). This crate says what is inside
them. The wire binding spells `Capture::png` as a CBOR byte string.

The checks are plain functions, so an app refuses a bad call before it runs
anything, and a driver can refuse the same call before it sends it. The
conformance vectors in `vectors/` hold each check, and name the section of
the decision they hold it to.

<a name="chunk-manifest"></a><sub>[`Cargo.toml`](../../crates/x0k-ui-protocol/Cargo.toml) · `#manifest`</sub>

```toml {#manifest file="Cargo.toml"}
[package]
name = "x0k-ui-protocol"
version = "0.2.0"
edition = { workspace = true }
license = "MIT"
description = "What an app and a driver say over the UI-control endpoint: the offer, an observation, an action, a sequence of input, and the checks made on them."
repository = "https://github.com/0k-dot-computer/x0k-ui-control"
readme = "../../README.md"
keywords = ["ui", "testing", "automation", "agents", "protocol"]

[dependencies]
serde = { workspace = true }
# shapes.json keeps each spelling's keys in the order the spelling writes them.
serde_json = { workspace = true, features = ["preserve_order"] }
thiserror = { workspace = true }
x0k-datum = { version = "0.1.0" }
```

<a name="chunk-crate-root"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#crate-root`</sub>

```rust {#crate-root file="src/lib.rs"}
//! The values of the UI-control endpoint (`ui-control-channel` §7 to §10),
//! and the checks made on them before an app runs anything.

/// The `ui/input` conformance vectors, so a suite run against a live app holds
/// it to the same file (`x0k:implementation/ui-control/conformance`).
pub const INPUT_VECTORS: &str = include_str!("../vectors/input.json");

pub mod act;
pub mod fixture;
pub mod history;
pub mod input;
pub mod marks;
pub mod observe;
pub mod offer;
pub mod page;
pub mod presentation;
pub mod replay;
pub mod shapes;

use serde::{Deserialize, Serialize};
use x0k_datum::shape::Shape;

/// Why a call was refused, in the words every implementation uses.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum RefusalCode {
    /// `ui/act`: the offer lists no such action.
    UnknownAction,
    /// `ui/act`: the grant does not cover the action's side-effect class.
    OutsideGrant,
    /// `ui/act`: the arguments do not fit the action's shape.
    MisfitArguments,
    /// `ui/act`: the offer spells a shape that cannot be read.
    UnreadableShape,
    /// `ui/input`: the offer does not name `ui/input`.
    NoInputInterface,
    /// `ui/input`: a source of a kind the model does not have.
    UnknownSource,
    /// `ui/input`: a source of a kind the model has and the app's host cannot
    /// deliver, such as a touch on a host with no touch events.
    UndeliverableSource,
    /// `ui/input`: two sources share an id.
    DuplicateSource,
    /// `ui/input`: an action its source cannot perform.
    WrongSource,
    /// `ui/input`: a key the model does not name.
    UnknownKey,
    /// `ui/input`: a position outside the frame's pixels.
    OutsideFrame,
    /// `ui/input`: a frame the app no longer holds.
    UnknownFrame,
    /// `ui/input`: a layout node the named frame does not hold.
    UnknownNode,
    /// `ui/input`: the sequence asks for a takeover, and the offer does not
    /// say the app's host holds one.
    TakeoverUnheld,
    /// `ui/input`: the person did not grant the takeover the sequence asks for.
    TakeoverNotGranted,
    /// `ui/history`: the offer does not name `ui/history`.
    NoHistoryInterface,
    /// `ui/history`: a position the app never had.
    UnknownPosition,
    /// `ui/input`, `ui/act`: the app shows a past position, so it runs nothing
    /// that acts on its live surface.
    ShowingPast,
    /// `ui/history`: the offer does not say the app takes state fixtures.
    NoFixtures,
    /// `ui/history`: a fixture's fingerprint is not the app's state shape's.
    WrongFingerprint,
    /// `ui/history`: a fixture's state does not fit the app's state shape.
    MisfitState,
    /// `ui/history`: the live state has moved past the head the call names.
    StaleHead,
    /// `ui/observe`: the offer's replay policy lowers a floor, or names a
    /// sandbox the offer does not declare.
    UnreadablePolicy,
    /// `ui/act`: while a fixture stands, the replay policy refuses the action.
    PolicyRefuses,
    /// `ui/act`, `ui/input`, and an observation's capture: the app's host
    /// cannot paint its window now, so no frame would show.
    CannotPaint,
    /// `ui/history`'s `present`, and `ui/act` or `ui/input` while a fixture
    /// stands: the app declines the call for now, for the reason it gives.
    Declined,
    /// `ui/act`, `ui/input`: the app ended the fixture the session presented,
    /// for the reason it gives, and shows its live state.
    FixtureEnded,
}

/// A call refused before anything ran.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
pub struct Refused {
    pub code: RefusalCode,
    /// What the refusal is about: an action, a key, a node, a path.
    #[serde(default)]
    pub subject: Option<String>,
    /// The reason, for a person.
    pub why: String,
}

impl Refused {
    /// A refusal of `code` about `subject`.
    pub fn new(code: RefusalCode, subject: &str, why: impl Into<String>) -> Self {
        Refused { code, subject: Some(subject.to_string()), why: why.into() }
    }
}

impl std::fmt::Display for Refused {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.why)
    }
}

impl std::error::Error for Refused {}
```

Three refusals name a condition of the app or its host, not a fault in the
call, so a driver can tell a call to try elsewhere or later from one to fix:

| Code | Subject | When |
|---|---|---|
| `cannot_paint` | the action, or `ui/input` | the host cannot paint the window now, such as a minimised window or a sleeping display (§8 to §10) |
| `declined` | the action, `ui/input`, or `ui/history` for a `present` | the app declines for now, with its reason (`ui-interfaces` §4) |
| `undeliverable_source` | the source's kind | the model has the kind, and the host cannot deliver it (§10) |
| `fixture_ended` | the fixture's handle | the app ended the fixture the session presented, with its reason, and the session's call would meet the live state (`ui-interfaces` §4) |

`cannot_paint` exists because a host that waits for a frame its window cannot
paint answers only when its wait runs out, and a driver learns nothing from
that. `declined` is apart from `misfit_state`, because the state fits and the
app's own condition refuses it, such as an approval waiting for a person.
`undeliverable_source` is apart from `unknown_source`, because the kind is one
the model has, and another host may deliver it. `fixture_ended` is apart from
`declined`: the app declines one call and the fixture still stands, and after
`fixture_ended` the fixture is gone and the session's next call runs live. A
session hears `fixture_ended` once, on its first `invoke` or `perform` after
the app ended its fixture.

## The offer

The offer is what `ui/observe`'s `offer` operation answers (§8): the app, the
interfaces it answers with their fingerprints, its named actions, and the head
of its presentable state. An app that offers `ui/history` also says which
positions it holds (`ui-interfaces` §5). A side-effect class is one of the three
`x0k:architecture/operation-surface` §12 ranks by reversibility. An action's
shapes are spellings in the shape language, carried as JSON.

`ui-interfaces` §5 adds three fields, so an app outside x0k's runtimes says how
deeply it can be looked into and what going back does to its effects: the
introspection grades it supplies, its replay policy, and the sandboxes it
declares. Each is empty when the app says nothing, which is what an edge that
reaches an app from outside says. Their values are under "What going back does
to an effect" below.

<a name="chunk-offer"></a><sub>[`src/offer.rs`](../../crates/x0k-ui-protocol/src/offer.rs) · `#offer`</sub>

```rust {#offer file="src/offer.rs"}
//! What an app offers (`ui-control-channel` §8).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use x0k_datum::shape::Shape;

pub use crate::history::{Grade, HistoryOffer};
pub use crate::input::InputOffer;
pub use crate::replay::{PolicyEntry, Sandbox};

pub const UI_OBSERVE: &str = "ui/observe";
pub const UI_ACT: &str = "ui/act";
pub const UI_INPUT: &str = "ui/input";
pub const UI_HISTORY: &str = "ui/history";

/// How reversible an action's effect is (`operation-surface` §12).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum SideEffect {
    ReadOnly,
    IdempotentWrite,
    NonIdempotent,
}

/// One interface the app answers.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
pub struct Interface {
    pub name: String,
    /// The shape fingerprint of its operations.
    pub fingerprint: String,
}

/// One action the app names (§9).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
pub struct Action {
    pub name: String,
    pub description: String,
    /// The shape of its arguments.
    pub args: Value,
    /// The shape of its result.
    pub result: Value,
    pub side_effect: SideEffect,
}

/// The app's standing.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
pub struct Offer {
    pub app: String,
    pub instance: String,
    pub interfaces: Vec<Interface>,
    #[serde(default)]
    pub actions: Vec<Action>,
    /// The head of the presentable state, when the app has one.
    #[serde(default)]
    pub state_head: Option<String>,
    /// What the app holds of its history, when the offer names `ui/history`.
    #[serde(default)]
    pub history: Option<HistoryOffer>,
    /// The introspection grades the app supplies (`graded-introspection` §1).
    #[serde(default)]
    pub grades: Vec<Grade>,
    /// What going back does to an effect, per class and per action. What it
    /// does not name takes `graded-introspection` §9's default.
    #[serde(default)]
    pub replay_policy: Vec<PolicyEntry>,
    /// The stand-in targets the app declares.
    #[serde(default)]
    pub sandboxes: Vec<Sandbox>,
    /// What the app's host does with input beyond delivering it, when the
    /// offer names `ui/input` (§10).
    #[serde(default)]
    pub input: Option<InputOffer>,
}

impl Offer {
    /// Whether the offer names `interface`.
    pub fn answers(&self, interface: &str) -> bool {
        self.interfaces.iter().any(|offered| offered.name == interface)
    }
}
```

## One observation

An observation comes from one presented frame (§8). A part the app cannot
produce is refused by name and the other parts are kept, so `refused` sits
beside them. An app that presents no frame has no frame to name, answers the
layout and the state, and refuses the capture.

A part's refusal carries a code when one of the protocol's words says why.
While the host cannot paint the window, the capture is
refused as `cannot_paint`; `while_cannot_paint` takes the capture out of a call
and answers its refusal, so the app answers the rest. A refusal with no code
is a reason for a person, and a driver reads only that the part is missing.

`check_observation` is how a driver or a test holds an app to that. Bounds are
in the capture's pixels, so a visible node has to lie inside the capture. A
node's id names the same part of the surface from frame to frame while that part
stands, so no two nodes of a frame share one.

Every observation also names what its frame shows (`ui-interfaces` §3): `live`,
a past history position, or a state fixture. An app with no history always says
`live`. The field is optional on the wire only so that an observation missing it
reads, and is then broken by name. A driver never fills it in as `live`.

<a name="chunk-observe"></a><sub>[`src/observe.rs`](../../crates/x0k-ui-protocol/src/observe.rs) · `#observe`</sub>

```rust {#observe file="src/observe.rs"}
//! One observation from one presented frame (`ui-control-channel` §8).

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use x0k_datum::shape::{Shape, TypeShape};
use x0k_datum::Datum;

pub use crate::history::Shown;
use crate::RefusalCode;

/// A part of an observation.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum Part {
    Capture,
    Layout,
    State,
}

/// A rectangle of the frame's pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
pub struct Region {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// `observe`'s argument.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
pub struct ObserveCall {
    pub parts: Vec<Part>,
    #[serde(default)]
    pub region: Option<Region>,
    #[serde(default)]
    pub scale: Option<f64>,
    /// Whether the capture shows the app's frame alone, without the host's
    /// drawing of driver input (§10).
    #[serde(default)]
    pub frame_only: bool,
}

/// The frame's pixels.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Capture {
    /// The image, as a PNG.
    #[serde(default)]
    pub png: Vec<u8>,
    /// The image's size in physical pixels.
    pub width: u32,
    pub height: u32,
    /// The display's scale factor.
    pub scale_factor: f64,
    /// Whether the image carries the host's drawing of driver input over the frame.
    #[serde(default)]
    pub presented: bool,
}

/// `Capture` as its shape spells it: on the wire `png` is a byte string, which a
/// type read through serde's JSON model cannot say.
#[derive(Shape)]
#[allow(dead_code)]
struct CaptureShape {
    #[serde(default)]
    png: Value,
    width: u32,
    height: u32,
    scale_factor: f64,
    #[serde(default)]
    presented: bool,
}

impl TypeShape for Capture {
    fn spelling() -> Datum {
        CaptureShape::spelling()
    }
}

/// A node's bounds, in the capture's pixels.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, Shape)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Bounds {
    /// The point a driver's input lands on when it names this node (§10).
    pub fn centre(&self) -> (f64, f64) {
        (self.x + self.width / 2.0, self.y + self.height / 2.0)
    }
}

/// One node of the layout tree.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct LayoutNode {
    /// Stable within the frame.
    pub id: String,
    pub role: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub value: Option<String>,
    /// The part of the node that shows.
    pub bounds: Bounds,
    /// The box the node was laid out in, when clipping cuts it down to `bounds`.
    #[serde(default)]
    pub laid_out: Option<Bounds>,
    pub visible: bool,
    pub enabled: bool,
    pub focused: bool,
    pub interactive: bool,
    /// The named action the node maps to, if it maps to one.
    #[serde(default)]
    pub action: Option<String>,
    /// Where a grafted subtree's semantics came from.
    #[serde(default)]
    pub source: Option<String>,
    /// The composition leaf this node belongs to, when it belongs to one.
    #[serde(default)]
    pub composition: Option<String>,
    #[serde(default)]
    pub children: Vec<LayoutNode>,
}

impl LayoutNode {
    /// This node and everything under it.
    pub fn walk(&self) -> Vec<&LayoutNode> {
        let mut nodes = vec![self];
        for child in &self.children {
            nodes.extend(child.walk());
        }
        nodes
    }
}

/// The presentable state.
/// `LayoutNode` as its shape spells it. A node holds nodes, and a derived spelling
/// would never end, so its children's own shape stops at one level.
#[derive(Shape)]
#[allow(dead_code)]
struct LayoutNodeShape {
    id: String,
    role: String,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    value: Option<String>,
    bounds: Bounds,
    #[serde(default)]
    laid_out: Option<Bounds>,
    visible: bool,
    enabled: bool,
    focused: bool,
    interactive: bool,
    #[serde(default)]
    action: Option<String>,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    composition: Option<String>,
    #[serde(default)]
    children: Vec<Value>,
}

impl TypeShape for LayoutNode {
    fn spelling() -> Datum {
        LayoutNodeShape::spelling()
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
pub struct StatePart {
    pub value: Value,
    pub head: String,
    pub fingerprint: String,
}

/// A part the app could not produce.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
pub struct PartRefused {
    pub part: Part,
    /// Why, in the protocol's words, when one of them says it.
    #[serde(default)]
    pub code: Option<RefusalCode>,
    /// The reason, for a person.
    pub why: String,
}

/// The call an app whose host cannot paint its window answers in place of `call`:
/// the same parts without the capture, and the capture's refusal when `call`
/// asks for one (§8).
pub fn while_cannot_paint(call: &ObserveCall, why: &str) -> (ObserveCall, Option<PartRefused>) {
    let parts = call.parts.iter().copied().filter(|part| *part != Part::Capture).collect();
    let refused = call.parts.contains(&Part::Capture).then(|| PartRefused {
        part: Part::Capture,
        code: Some(RefusalCode::CannotPaint),
        why: why.to_string(),
    });
    (ObserveCall { parts, ..call.clone() }, refused)
}

/// `observe`'s answer.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
pub struct Observation {
    /// The frame every part was read from. An app that presents no frame has none.
    #[serde(default)]
    pub frame: Option<String>,
    #[serde(default)]
    pub capture: Option<Capture>,
    #[serde(default)]
    pub layout: Option<LayoutNode>,
    #[serde(default)]
    pub state: Option<StatePart>,
    #[serde(default)]
    pub refused: Vec<PartRefused>,
    /// What the frame shows (`ui-interfaces` §3). An observation without it is
    /// broken, and a driver never takes it for `live`.
    #[serde(default)]
    pub shown: Option<Shown>,
}

/// How an observation breaks §8, or `ui-interfaces` §3.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObservationFault {
    /// A part asked for is neither answered nor refused.
    PartMissing { part: Part },
    /// A part that was not asked for.
    PartUnasked { part: Part },
    /// A part both answered and refused.
    PartBoth { part: Part },
    /// A capture with no frame to name.
    CaptureWithoutFrame,
    /// Two nodes share an id.
    DuplicateNode { id: String },
    /// A visible node outside the capture's pixels.
    NodeOutsideCapture { id: String },
    /// An observation that does not name what its frame shows.
    ShownMissing,
    /// A capture the call asked for as the frame alone that carries the
    /// host's drawing of driver input.
    PresentedFrameOnly,
}

/// Whether `observation` answers `call` as §8 says.
pub fn check_observation(
    call: &ObserveCall,
    observation: &Observation,
) -> Result<(), ObservationFault> {
    let answered = [
        (Part::Capture, observation.capture.is_some()),
        (Part::Layout, observation.layout.is_some()),
        (Part::State, observation.state.is_some()),
    ];
    for (part, present) in answered {
        let refused = observation.refused.iter().any(|refusal| refusal.part == part);
        if present && refused {
            return Err(ObservationFault::PartBoth { part });
        }
        let asked = call.parts.contains(&part);
        if asked && !present && !refused {
            return Err(ObservationFault::PartMissing { part });
        }
        if !asked && (present || refused) {
            return Err(ObservationFault::PartUnasked { part });
        }
    }
    if observation.capture.is_some() && observation.frame.is_none() {
        return Err(ObservationFault::CaptureWithoutFrame);
    }
    if call.frame_only && observation.capture.as_ref().is_some_and(|capture| capture.presented) {
        return Err(ObservationFault::PresentedFrameOnly);
    }
    let mut seen = BTreeSet::new();
    for node in observation.layout.iter().flat_map(|root| root.walk()) {
        if !seen.insert(node.id.as_str()) {
            return Err(ObservationFault::DuplicateNode { id: node.id.clone() });
        }
        if let (true, Some(capture)) = (node.visible, &observation.capture) {
            if !inside(&node.bounds, f64::from(capture.width), f64::from(capture.height)) {
                return Err(ObservationFault::NodeOutsideCapture { id: node.id.clone() });
            }
        }
    }
    match observation.shown {
        Some(_) => Ok(()),
        None => Err(ObservationFault::ShownMissing),
    }
}

fn inside(bounds: &Bounds, width: f64, height: f64) -> bool {
    bounds.x >= 0.0
        && bounds.y >= 0.0
        && bounds.x + bounds.width <= width
        && bounds.y + bounds.height <= height
}
```

## Invoking an action

A driver invokes only what the offer lists, and only inside its grant, and its
arguments are checked against the action's shape before the app runs anything
(§9). `check_invoke` makes those three checks in that order, and answers the
action to run. What happens after that is `Outcome`: the action ran, or it ran
and failed. The first frame presented after it took effect comes back when the
app presents frames.

While a state fixture stands, an action can also be answered by a stand-in:
simulated, so nothing ran, or run against a sandbox the app declares
(`ui-interfaces` §4). The answer says which, so a driver never takes a stand-in
for a real effect.

<a name="chunk-act"></a><sub>[`src/act.rs`](../../crates/x0k-ui-protocol/src/act.rs) · `#act`</sub>

```rust {#act file="src/act.rs"}
//! Invoking an action the app names (`ui-control-channel` §9).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use x0k_datum::shape::{Shape, Shaped, Use};
use x0k_datum::Datum;

use crate::offer::{Action, Offer, SideEffect};
use crate::{Refused, RefusalCode};

/// `invoke`'s argument.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
pub struct Invoke {
    pub action: String,
    #[serde(default)]
    pub args: Value,
}

/// What a `ui/act` grant allows.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Grant {
    pub classes: Vec<SideEffect>,
}

/// `invoke`'s answer.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Done {
        result: Value,
        #[serde(default)]
        frame: Option<String>,
    },
    Failed {
        reason: String,
        #[serde(default)]
        frame: Option<String>,
    },
}

/// `invoke`'s answer.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum InvokeAnswer {
    Refused(Refused),
    Done {
        result: Value,
        #[serde(default)]
        frame: Option<String>,
    },
    Failed {
        reason: String,
        #[serde(default)]
        frame: Option<String>,
    },
    /// While a state fixture stands: nothing was performed, and this answer is
    /// the stand-in (`graded-introspection` §9, `simulated`).
    Simulated { action: String },
    /// While a state fixture stands: the action ran against `sandbox`, a
    /// stand-in target the app declares, and never the real one.
    Sandboxed {
        sandbox: String,
        result: Value,
        #[serde(default)]
        frame: Option<String>,
    },
}

/// The action `invoke` may run, or why it may not.
pub fn check_invoke<'o>(
    offer: &'o Offer,
    grant: &Grant,
    invoke: &Invoke,
) -> Result<&'o Action, Refused> {
    let name = invoke.action.as_str();
    let action = offer.actions.iter().find(|action| action.name == name).ok_or_else(|| {
        Refused::new(RefusalCode::UnknownAction, name, format!("the offer lists no action {name}"))
    })?;
    if !grant.classes.contains(&action.side_effect) {
        return Err(Refused::new(
            RefusalCode::OutsideGrant,
            name,
            format!("the grant does not cover {name}'s side-effect class"),
        ));
    }
    let unreadable = |why: String| Refused::new(RefusalCode::UnreadableShape, name, why);
    let shape = Shaped::read(&Datum::from_json(&action.args))
        .map_err(|fault| unreadable(format!("{fault:?}")))?
        .compile(Use::Argument)
        .map_err(|fault| unreadable(format!("{fault:?}")))?;
    shape.check(&Datum::from_json(&invoke.args)).map_err(|misfit| {
        Refused::new(RefusalCode::MisfitArguments, &misfit.at, misfit.to_string())
    })?;
    Ok(action)
}
```

## A sequence of input

Input follows the WebDriver actions model (§10). A pointer source is a mouse,
a pen or a touch, and each has its own id, so two touches are two sources. A
sequence is refused before any of it runs, so `check_perform` walks all of it
first. It answers each pointer position in the frame's pixels, which is where
a layout node resolves to the centre of its bounds.

A source's `kind` stays text here. A sequence that names a kind the model does
not have is refused by name, which a closed enum would turn into a decode error.

A sequence also says how the app's host shows it (`ui-control-channel` §10):
whether the host draws it (`present`, on unless the call says no), at what
pace, and whether it takes over the person's input. The offer says what the
host can do (`InputOffer`): draw input and keep the watchable pace, and hold
a takeover. A takeover the offer does not say the host holds is refused here,
before any of the sequence runs. Whether the person grants one is the host's
to ask, so the endpoint refuses an ungranted takeover after this check
(`x0k:implementation/ui-control/endpoint`). The watchable pace has a floor,
`WATCHABLE_PRESS_MS`, so a driver and a suite can tell it from the fast one
by the time a sequence takes. A host waits at most `TAKEOVER_ASK_MS` for the
person to answer a takeover's ask, so a client waits that much longer for a
sequence that asks for one.

A sequence may carry `requester_name`, the name the requester gives itself for
a person to read (`ui-interfaces` §6), such as Apollo or a person's driver.
It rides the call, because the session's opening is the operation wire's and
carries nothing of an interface's. It is a label: no check reads it, so a
sequence refused or let through without it is refused or let through with it.

<a name="chunk-input"></a><sub>[`src/input.rs`](../../crates/x0k-ui-protocol/src/input.rs) · `#input`</sub>

```rust {#input file="src/input.rs"}
//! A sequence of pointer, key and wheel input (`ui-control-channel` §10).

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use x0k_datum::shape::{Shape, TypeShape};
use x0k_datum::Datum;

use crate::observe::LayoutNode;
use crate::offer::{Offer, UI_INPUT};
use crate::{Refused, RefusalCode};

/// Keys with a name. Any other key is one Unicode scalar: the character it types.
pub const NAMED_KEYS: &[&str] = &[
    "Alt", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "Backspace", "Control", "Delete",
    "End", "Enter", "Escape", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11",
    "F12", "Home", "Meta", "PageDown", "PageUp", "Shift", "Space", "Tab",
];

/// Where a pointer goes: pixels of a frame, or a layout node of a frame.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Target {
    Pixel { frame: String, x: f64, y: f64 },
    Node { frame: String, node: String },
}

/// `Target` as its shape spells it: the shape language has no untagged choice, so
/// both forms' fields are here, and `check_perform` holds what a target must name.
#[derive(Shape)]
#[allow(dead_code)]
struct TargetShape {
    frame: String,
    #[serde(default)]
    x: Option<f64>,
    #[serde(default)]
    y: Option<f64>,
    #[serde(default)]
    node: Option<String>,
}

impl TypeShape for Target {
    fn spelling() -> Datum {
        TargetShape::spelling()
    }
}

/// One step of a source.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
#[serde(tag = "do", rename_all = "snake_case")]
pub enum Step {
    Move { to: Target },
    Down { button: u8 },
    Up { button: u8 },
    KeyDown { key: String },
    KeyUp { key: String },
    Scroll { to: Target, delta_x: f64, delta_y: f64 },
    Pause { ms: u32 },
}

/// One input source and its steps.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
pub struct Source {
    pub id: String,
    /// `mouse`, `pen`, `touch`, `key` or `wheel`.
    pub kind: String,
    pub steps: Vec<Step>,
}

/// `perform`'s argument: the sources, and how the app's host shows them.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, Shape)]
pub struct Perform {
    pub sources: Vec<Source>,
    /// Whether the app's host draws the sequence. It does unless this is
    /// `false`.
    #[serde(default)]
    pub present: Option<bool>,
    /// How fast the drawn pointer travels to each event.
    #[serde(default)]
    pub pace: Pace,
    /// Whether the app's host holds back the person's own input to the app's
    /// window from the sequence's first event to its answer.
    #[serde(default)]
    pub takeover: bool,
    /// The name the requester gives itself for a person to read, such as
    /// `Apollo` (`ui-interfaces` §6). A label only: the requester is the one
    /// the connection names, and no check reads this.
    #[serde(default)]
    pub requester_name: Option<String>,
}

impl Perform {
    /// A sequence of `sources`, drawn at the fast pace, with no takeover.
    pub fn of(sources: Vec<Source>) -> Self {
        Perform { sources, ..Perform::default() }
    }

    /// Whether the app's host draws the sequence.
    pub fn presented(&self) -> bool {
        self.present != Some(false)
    }
}

/// How fast the drawn pointer travels. At `fast` each event lands at once; at
/// `watchable` the pointer moves at a speed a person can follow, and each
/// press and each key lands no sooner than `WATCHABLE_PRESS_MS` after the
/// event before it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum Pace {
    #[default]
    Fast,
    Watchable,
}

/// The shortest wait, at the watchable pace, before a press or a key lands.
/// A host's look may wait longer, never shorter.
pub const WATCHABLE_PRESS_MS: u64 = 250;

/// The longest a host waits for the person to answer a takeover's ask; no
/// answer by then is a no.
pub const TAKEOVER_ASK_MS: u64 = 30_000;

/// What an app's host does with input beyond delivering it (§10).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Shape)]
pub struct InputOffer {
    /// The host draws each sequence it delivers over the app's window, and
    /// keeps the watchable pace.
    #[serde(default)]
    pub presents: bool,
    /// The host can hold back a person's input for the length of a sequence.
    #[serde(default)]
    pub takeover: bool,
}

/// A frame the app still holds, as input resolves against it.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HeldFrame {
    pub frame: String,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub layout: Option<LayoutNode>,
}

/// A pointer position, resolved to a frame's pixels.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Resolved {
    pub source: String,
    pub step: usize,
    pub x: f64,
    pub y: f64,
}

/// `perform`'s answer: the first frame presented after the app handled it.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum PerformAnswer {
    Refused(Refused),
    Done {
        #[serde(default)]
        frame: Option<String>,
    },
}

/// The positions `perform` resolves to, or why none of it may run.
pub fn check_perform(
    offer: &Offer,
    frames: &[HeldFrame],
    perform: &Perform,
) -> Result<Vec<Resolved>, Refused> {
    if !offer.answers(UI_INPUT) {
        return Err(Refused::new(
            RefusalCode::NoInputInterface,
            UI_INPUT,
            "the offer does not name ui/input",
        ));
    }
    if perform.takeover && !offer.input.is_some_and(|input| input.takeover) {
        return Err(Refused::new(
            RefusalCode::TakeoverUnheld,
            UI_INPUT,
            "the sequence asks for a takeover, and the offer does not say the app holds one",
        ));
    }
    let mut ids = BTreeSet::new();
    let mut resolved = Vec::new();
    for source in &perform.sources {
        if !ids.insert(source.id.as_str()) {
            return Err(Refused::new(
                RefusalCode::DuplicateSource,
                &source.id,
                format!("two sources are named {}", source.id),
            ));
        }
        for (index, step) in source.steps.iter().enumerate() {
            check_step(&source.kind, &source.id, step)?;
            if let Step::Move { to } | Step::Scroll { to, .. } = step {
                let (x, y) = position(frames, to)?;
                resolved.push(Resolved { source: source.id.clone(), step: index, x, y });
            }
        }
        if source.steps.is_empty() {
            check_kind(&source.kind)?;
        }
    }
    Ok(resolved)
}

/// The source kinds the model has.
pub const SOURCE_KINDS: &[&str] = &["mouse", "pen", "touch", "key", "wheel"];

fn check_kind(kind: &str) -> Result<(), Refused> {
    if SOURCE_KINDS.contains(&kind) {
        return Ok(());
    }
    Err(Refused::new(RefusalCode::UnknownSource, kind, format!("no input source is a {kind}")))
}

fn check_step(kind: &str, id: &str, step: &Step) -> Result<(), Refused> {
    check_kind(kind)?;
    let fits = match step {
        Step::Pause { .. } => true,
        Step::Move { .. } | Step::Down { .. } | Step::Up { .. } => {
            matches!(kind, "mouse" | "pen" | "touch")
        }
        Step::KeyDown { .. } | Step::KeyUp { .. } => kind == "key",
        Step::Scroll { .. } => kind == "wheel",
    };
    if !fits {
        return Err(Refused::new(
            RefusalCode::WrongSource,
            id,
            format!("a {kind} source cannot do that step"),
        ));
    }
    if let Step::KeyDown { key } | Step::KeyUp { key } = step {
        let one_scalar = key.chars().count() == 1;
        if !one_scalar && !NAMED_KEYS.contains(&key.as_str()) {
            return Err(Refused::new(RefusalCode::UnknownKey, key, format!("no key is named {key}")));
        }
    }
    Ok(())
}

fn position(frames: &[HeldFrame], target: &Target) -> Result<(f64, f64), Refused> {
    let (Target::Pixel { frame: name, .. } | Target::Node { frame: name, .. }) = target;
    let frame = frames.iter().find(|held| &held.frame == name).ok_or_else(|| {
        Refused::new(RefusalCode::UnknownFrame, name, format!("the app holds no frame {name}"))
    })?;
    let (x, y) = match target {
        Target::Pixel { x, y, .. } => (*x, *y),
        Target::Node { node, .. } => {
            let found = frame
                .layout
                .iter()
                .flat_map(|root| root.walk())
                .find(|held| &held.id == node)
                .ok_or_else(|| {
                    Refused::new(
                        RefusalCode::UnknownNode,
                        node,
                        format!("frame {name} holds no node {node}"),
                    )
                })?;
            found.bounds.centre()
        }
    };
    if x < 0.0 || y < 0.0 || x >= f64::from(frame.width) || y >= f64::from(frame.height) {
        return Err(Refused::new(
            RefusalCode::OutsideFrame,
            name,
            format!("({x}, {y}) is outside frame {name}"),
        ));
    }
    Ok((x, y))
}
```

## A sequence, tick by tick

Every app that delivers input runs a checked sequence the same way, so the rule
lives here once. A sequence runs as the WebDriver actions model runs it: tick
by tick, where tick *n* is step *n* of every source. A tick's events are
dispatched together, and the tick then holds for its longest pause. A pointer
press and release happen where that source last moved. A button and a
modifier key stay held from their down to their up, and every event while
they are held says so. Each app maps the ticks to its own events: Masonry's
injected steps in x0k's shell, GDK events and NSEvents in the Tauri plugin.

An app divides positions by its own scale, the capture's pixels per unit of
its view, and the builder divides each scroll delta by the same scale. `held`
on an event is what the sequence holds as the event arrives, before the event
itself. An app whose platform reports the state after a key's own change, as
AppKit's `flagsChanged` does, adds or removes that key's modifier itself.

Which source kinds an app can deliver is the app's to say. `undeliverable`
finds the first source of a kind an app does not deliver, and `check_delivers`
refuses the sequence for it as `undeliverable_source`, naming the kind, before
any of it runs. It runs after `check_perform`, so a kind the model does not
have is still `unknown_source`.

<a name="chunk-input-2"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#input` · continues</sub>

```rust {#input}

/// What a sequence holds down as an event arrives: bit `n` of `buttons` is
/// WebDriver's button `n`, and `modifiers` holds `SHIFT`, `CONTROL`, `ALT`
/// and `META`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Held {
    pub buttons: u32,
    pub modifiers: u8,
}

/// The Shift key's bit in `Held::modifiers`.
pub const SHIFT: u8 = 1;
/// The Control key's bit in `Held::modifiers`.
pub const CONTROL: u8 = 1 << 1;
/// The Alt key's bit in `Held::modifiers`.
pub const ALT: u8 = 1 << 2;
/// The Meta key's bit in `Held::modifiers`.
pub const META: u8 = 1 << 3;

/// The modifier `key` holds while it is down, or none.
pub fn modifier_of(key: &str) -> u8 {
    match key {
        "Shift" => SHIFT,
        "Control" => CONTROL,
        "Alt" => ALT,
        "Meta" => META,
        _ => 0,
    }
}

impl Held {
    /// The lowest button held, if any.
    pub fn lowest_button(&self) -> Option<u8> {
        (0..32u8).find(|button| self.buttons & (1 << button) != 0)
    }
}
```

An event names its source, so an app that shows two pointers can tell them
apart.

<a name="chunk-input-3"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#input` · continues</sub>

```rust {#input}

/// One event of a tick, at a position in the app's units: the frame's pixels
/// over the app's scale. `held` is what the sequence holds as it arrives.
#[derive(Clone, Debug, PartialEq)]
pub enum Event {
    Move { source: String, x: f64, y: f64, held: Held },
    Press { source: String, button: u8, x: f64, y: f64, held: Held },
    Release { source: String, button: u8, x: f64, y: f64, held: Held },
    KeyDown { key: String, held: Held },
    KeyUp { key: String, held: Held },
    Scroll { source: String, x: f64, y: f64, delta_x: f64, delta_y: f64, held: Held },
}

impl Event {
    /// The event with its position and its deltas over `scale`: a host that
    /// delivers in one unit and draws in another moves between them by this.
    pub fn over(&self, scale: f64) -> Event {
        let mut event = self.clone();
        match &mut event {
            Event::Move { x, y, .. } | Event::Press { x, y, .. } | Event::Release { x, y, .. } => (*x, *y) = (*x / scale, *y / scale),
            Event::Scroll { x, y, delta_x, delta_y, .. } => (*x, *y, *delta_x, *delta_y) = (*x / scale, *y / scale, *delta_x / scale, *delta_y / scale),
            Event::KeyDown { .. } | Event::KeyUp { .. } => {}
        }
        event
    }
}

/// One tick: every source's step at it, and how long its longest pause holds it.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Tick {
    pub events: Vec<Event>,
    pub pause_ms: u32,
}

/// Why a checked sequence has no ticks.
#[derive(Clone, Debug, PartialEq)]
pub enum TickFault {
    /// The app's scale is not a positive number.
    BadScale(f64),
    /// A move or a scroll has no position `check_perform` resolved.
    Unresolved { source: String, step: usize },
}

impl std::fmt::Display for TickFault {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TickFault::BadScale(scale) => write!(f, "the scale {scale} is not a positive number"),
            TickFault::Unresolved { source, step } => write!(f, "step {step} of source {source} names no resolved position"),
        }
    }
}

impl std::error::Error for TickFault {}

/// The first source of a kind the app does not deliver, which refuses the
/// whole sequence before any of it runs.
pub fn undeliverable<'a>(perform: &'a Perform, delivers: &[&str]) -> Option<&'a Source> {
    perform.sources.iter().find(|source| !delivers.contains(&source.kind.as_str()))
}

/// Whether a host that delivers the source kinds `delivers` can deliver all of
/// `perform` (§10).
pub fn check_delivers(perform: &Perform, delivers: &[&str]) -> Result<(), Refused> {
    let Some(source) = undeliverable(perform, delivers) else { return Ok(()) };
    let kind = &source.kind;
    let why = format!("the app's host cannot deliver {kind} input, which source {} is", source.id);
    Err(Refused::new(RefusalCode::UndeliverableSource, kind, why))
}
```

<a name="chunk-input-4"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#input` · continues</sub>

```rust {#input}

/// `perform` as ticks, with each position and scroll delta over `scale`.
/// `resolved` is what `check_perform` answered for it.
pub fn ticks(perform: &Perform, resolved: &[Resolved], scale: f64) -> Result<Vec<Tick>, TickFault> {
    if !(scale.is_finite() && scale > 0.0) {
        return Err(TickFault::BadScale(scale));
    }
    let length = perform.sources.iter().map(|source| source.steps.len()).max().unwrap_or(0);
    let mut last_at: Vec<(f64, f64)> = vec![(0.0, 0.0); perform.sources.len()];
    let mut held = Held::default();
    let mut ticks = Vec::with_capacity(length);
    for at in 0..length {
        let mut tick = Tick::default();
        for (index, source) in perform.sources.iter().enumerate() {
            let Some(step) = source.steps.get(at) else { continue };
            let id = source.id.clone();
            let place = || {
                resolved
                    .iter()
                    .find(|r| r.source == source.id && r.step == at)
                    .map(|r| (r.x / scale, r.y / scale))
                    .ok_or_else(|| TickFault::Unresolved { source: source.id.clone(), step: at })
            };
            let before = held;
            match step {
                Step::Pause { ms } => tick.pause_ms = tick.pause_ms.max(*ms),
                Step::Move { .. } => {
                    let (x, y) = place()?;
                    last_at[index] = (x, y);
                    tick.events.push(Event::Move { source: id, x, y, held: before });
                }
                Step::Down { button } | Step::Up { button } => {
                    let (x, y) = last_at[index];
                    let bit = 1u32.checked_shl(u32::from(*button)).unwrap_or(0);
                    let button = *button;
                    if matches!(step, Step::Down { .. }) {
                        held.buttons |= bit;
                        tick.events.push(Event::Press { source: id, button, x, y, held: before });
                    } else {
                        held.buttons &= !bit;
                        tick.events.push(Event::Release { source: id, button, x, y, held: before });
                    }
                }
                Step::KeyDown { key } => {
                    held.modifiers |= modifier_of(key);
                    tick.events.push(Event::KeyDown { key: key.clone(), held: before });
                }
                Step::KeyUp { key } => {
                    held.modifiers &= !modifier_of(key);
                    tick.events.push(Event::KeyUp { key: key.clone(), held: before });
                }
                Step::Scroll { delta_x, delta_y, .. } => {
                    let (x, y) = place()?;
                    let (delta_x, delta_y) = (delta_x / scale, delta_y / scale);
                    tick.events.push(Event::Scroll { source: id, x, y, delta_x, delta_y, held: before });
                }
            }
        }
        ticks.push(tick);
    }
    Ok(ticks)
}
```

Three tests hold the rule's parts a host would get wrong: a position and a
delta reach the app over its scale, a held button and a held modifier mark
the events after them and not the one that pressed them, and a tick holds for
its longest pause, not the sum of its pauses.

<a name="chunk-input-5"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#input` · continues</sub>

```rust {#input}

#[cfg(test)]
mod tick_tests {
    use super::*;

    fn at(x: f64, y: f64) -> Target {
        Target::Pixel { frame: "7".into(), x, y }
    }

    fn resolved(source: &str, step: usize, x: f64, y: f64) -> Resolved {
        Resolved { source: source.into(), step, x, y }
    }

    #[test]
    fn positions_and_deltas_reach_the_app_over_its_scale() {
        let mouse = Source { id: "m".into(), kind: "mouse".into(), steps: vec![Step::Move { to: at(200.0, 100.0) }] };
        let wheel = Source { id: "w".into(), kind: "wheel".into(), steps: vec![Step::Scroll { to: at(40.0, 60.0), delta_x: 0.0, delta_y: 120.0 }] };
        let perform = Perform::of(vec![mouse, wheel]);
        let ticks = ticks(&perform, &[resolved("m", 0, 200.0, 100.0), resolved("w", 0, 40.0, 60.0)], 2.0).unwrap();
        assert_eq!(ticks[0].events[0], Event::Move { source: "m".into(), x: 100.0, y: 50.0, held: Held::default() });
        let scroll = Event::Scroll { source: "w".into(), x: 20.0, y: 30.0, delta_x: 0.0, delta_y: 60.0, held: Held::default() };
        assert_eq!(ticks[0].events[1], scroll);
    }

    #[test]
    fn a_held_button_and_modifier_mark_the_events_after_them() {
        let mouse = Source {
            id: "m".into(),
            kind: "mouse".into(),
            steps: vec![Step::Move { to: at(10.0, 10.0) }, Step::Down { button: 0 }, Step::Move { to: at(30.0, 10.0) }],
        };
        let keys = Source { id: "k".into(), kind: "key".into(), steps: vec![Step::KeyDown { key: "Shift".into() }] };
        let perform = Perform::of(vec![mouse, keys]);
        let ticks = ticks(&perform, &[resolved("m", 0, 10.0, 10.0), resolved("m", 2, 30.0, 10.0)], 1.0).unwrap();
        let shift = Held { buttons: 0, modifiers: SHIFT };
        assert_eq!(ticks[0].events[1], Event::KeyDown { key: "Shift".into(), held: Held::default() });
        assert_eq!(ticks[1].events[0], Event::Press { source: "m".into(), button: 0, x: 10.0, y: 10.0, held: shift });
        let both = Held { buttons: 1, modifiers: SHIFT };
        assert_eq!(ticks[2].events[0], Event::Move { source: "m".into(), x: 30.0, y: 10.0, held: both });
    }

    #[test]
    fn a_tick_holds_for_its_longest_pause() {
        let pauses = |id: &str, ms: u32| Source { id: id.into(), kind: "key".into(), steps: vec![Step::Pause { ms }] };
        let perform = Perform::of(vec![pauses("a", 100), pauses("b", 250)]);
        assert_eq!(ticks(&perform, &[], 1.0).unwrap(), vec![Tick { events: Vec::new(), pause_ms: 250 }]);
        assert_eq!(ticks(&perform, &[], 0.0), Err(TickFault::BadScale(0.0)));
    }
}
```

## Going back through what the app has shown

`ui/history` lets a driver take an app back to a state it showed before, look
at it, and return (`x0k:architecture/ui-interfaces` §2). Going back is for
looking: it performs nothing in the world, and the app refuses to act on its
live surface while it shows the past. The decision states the invariants:

```x0k:transclude {ref="x0k:architecture/ui-interfaces#2-uihistory-shows-a-past-state-and-performs-nothing"}
```

A **history position** is the number the app gives each change of its
presentable state. Positions only grow, so a position below the oldest the app
holds was dropped, and one above the newest was never had. `check_navigate` uses
that to refuse a bad navigation from the offer alone, before the app hears it:

- the offer does not name `ui/history`: refused as `no_history_interface`;
- a position the app never had (zero, or past the newest): refused as
  `unknown_position`;
- a position below the oldest: answered `unavailable`, naming the oldest the app
  still holds. Nothing of the position remains, so the answer names no grade.

A position inside the range can still be unavailable: an app that kept a
position's trace ids but dropped its state holds it at `emitted`. Only the app
knows that, so the app gives that answer itself, with the grade.

`unavailable` is an answer of its own and not a refusal, because it carries the
deepest answer the app can give (`x0k:architecture/graded-introspection` §2).

While a past position is shown, `check_while_shown` refuses every `ui/input`
call and every `ui/act` action above `read_only` as `showing_past`, naming the
position. A state fixture refuses neither, because driving the app in a given
state is what a fixture is for (§4). An endpoint makes this check after the
call's own checks pass, so a bad call is refused for what is wrong with it.

<a name="chunk-history"></a><sub>[`src/history.rs`](../../crates/x0k-ui-protocol/src/history.rs) · `#history` · assembles [history-values](#chunk-history-values) · [history-checks](#chunk-history-checks)</sub>

```rust {#history file="src/history.rs"}
//! Going back through what an app has shown (`ui-interfaces` §2, §3 and §5).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use x0k_datum::shape::Shape;

use crate::offer::{Offer, SideEffect, UI_HISTORY};
use crate::{Refused, RefusalCode};

<<history-values>>

<<history-checks>>
```

The values follow the decision's words. A shown state and a destination are
tagged by `kind`, because the shape language has no choice that mixes a bare
name with a keyed value. A position's time is microseconds since the epoch, as
the timeline's are. `state` is present only when the call asked for it and the
position is held at `captured`.

<a name="chunk-history-values"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#history-values`</sub>

```rust {#history-values}
/// What an app shows (§3): its live state, a past position, or a state fixture.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Shown {
    Live,
    Position { position: u64 },
    Fixture { handle: String },
}

/// How much an app still holds of a position (`graded-introspection` §1).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum Grade {
    Emitted,
    Recorded,
    Retained,
    Captured,
    ReExecutable,
}

/// What the offer says of an app's history (§5).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
pub struct HistoryOffer {
    /// The oldest and newest position the app holds; neither when it holds none.
    #[serde(default)]
    pub oldest: Option<u64>,
    #[serde(default)]
    pub newest: Option<u64>,
    /// Whether the app takes state fixtures (§4).
    #[serde(default)]
    pub fixtures: bool,
}

/// `history`'s argument: a range of positions, at most `limit` of them.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
pub struct HistoryCall {
    #[serde(default)]
    pub from: Option<u64>,
    #[serde(default)]
    pub to: Option<u64>,
    pub limit: u32,
    #[serde(default)]
    pub include_state: bool,
}

/// One position of the app's history.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
pub struct Position {
    pub position: u64,
    /// When the app recorded it, in microseconds since the epoch.
    pub at_us: u64,
    /// The changes that made it.
    pub changes: Vec<String>,
    /// The trace and span ids active when the app recorded it.
    pub trace_ids: Vec<String>,
    pub span_ids: Vec<String>,
    pub grade: Grade,
    #[serde(default)]
    pub state: Option<Value>,
}

/// The positions a `history` call asked for, newest first.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
pub struct History {
    #[serde(default)]
    pub oldest: Option<u64>,
    #[serde(default)]
    pub newest: Option<u64>,
    pub shown: Shown,
    pub positions: Vec<Position>,
}

/// `history`'s answer.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum HistoryAnswer {
    Refused(Refused),
    Listed(History),
}

/// Where `navigate` goes.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Destination {
    Live,
    Position { position: u64 },
}

/// `navigate`'s argument.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
pub struct NavigateCall {
    pub to: Destination,
}

/// `navigate`'s answer.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum NavigateAnswer {
    Refused(Refused),
    /// The app no longer holds the position whole: `grade` is what it still
    /// holds, none when nothing remains, and `oldest` the oldest it does hold.
    Unavailable {
        position: u64,
        #[serde(default)]
        grade: Option<Grade>,
        #[serde(default)]
        oldest: Option<u64>,
    },
    /// The app shows `shown`, first in `frame` when it presents frames.
    Shown {
        shown: Shown,
        #[serde(default)]
        frame: Option<String>,
    },
}
```

The checks are the three of §2 and §5 that need no app. `check_history` holds an
answer to its call: within the limit, newest first, inside the range and what
the app holds, with state only where asked. `check_history_offer` holds §5's
rule that the history field is there exactly when `ui/history` is.

<a name="chunk-history-checks"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#history-checks`</sub>

```rust {#history-checks}
/// Whether `call` may reach the app, by what its offer says it holds.
pub fn check_navigate(offer: &Offer, call: &NavigateCall) -> Result<(), NavigateAnswer> {
    if !offer.answers(UI_HISTORY) {
        let why = "the offer does not name ui/history";
        return Err(NavigateAnswer::Refused(Refused::new(RefusalCode::NoHistoryInterface, UI_HISTORY, why)));
    }
    let Destination::Position { position } = call.to else {
        return Ok(());
    };
    let held = offer.history.as_ref();
    let (oldest, newest) = (held.and_then(|held| held.oldest), held.and_then(|held| held.newest));
    if position == 0 || newest.is_none_or(|newest| position > newest) {
        let why = format!("the app never had position {position}");
        return Err(NavigateAnswer::Refused(Refused::new(
            RefusalCode::UnknownPosition,
            &position.to_string(),
            why,
        )));
    }
    if oldest.is_some_and(|oldest| position < oldest) {
        return Err(NavigateAnswer::Unavailable { position, grade: None, oldest });
    }
    Ok(())
}

/// Whether a call of `class` may run while the app shows `shown`. `None` is a
/// `ui/input` call; `Some` is a `ui/act` action of that side-effect class.
pub fn check_while_shown(shown: &Shown, class: Option<SideEffect>) -> Result<(), Refused> {
    let Shown::Position { position } = shown else {
        return Ok(());
    };
    if class == Some(SideEffect::ReadOnly) {
        return Ok(());
    }
    let why = format!("the app shows past position {position}, and acts on nothing until it is live");
    Err(Refused::new(RefusalCode::ShowingPast, &position.to_string(), why))
}

/// How a `history` answer breaks §2.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HistoryFault {
    /// More positions than the call's limit.
    OverLimit { count: usize, limit: u32 },
    /// A position not older than the one before it.
    NotNewestFirst { position: u64 },
    /// A position outside the call's range, or outside what the app holds.
    OutsideRange { position: u64 },
    /// A state the call did not ask for.
    StateUnasked { position: u64 },
    /// A captured position without the state the call asked for.
    StateMissing { position: u64 },
}

/// Whether `history` answers `call` as §2 says.
pub fn check_history(call: &HistoryCall, history: &History) -> Result<(), HistoryFault> {
    let count = history.positions.len();
    if count > call.limit as usize {
        return Err(HistoryFault::OverLimit { count, limit: call.limit });
    }
    let from = call.from.into_iter().chain(history.oldest).max();
    let to = call.to.into_iter().chain(history.newest).min();
    let mut before: Option<u64> = None;
    for held in &history.positions {
        let position = held.position;
        if before.is_some_and(|before| position >= before) {
            return Err(HistoryFault::NotNewestFirst { position });
        }
        before = Some(position);
        let inside = from.is_none_or(|from| position >= from) && to.is_none_or(|to| position <= to);
        if !inside || history.newest.is_none() {
            return Err(HistoryFault::OutsideRange { position });
        }
        match (call.include_state, held.state.is_some(), held.grade >= Grade::Captured) {
            (false, true, _) => return Err(HistoryFault::StateUnasked { position }),
            (true, false, true) => return Err(HistoryFault::StateMissing { position }),
            _ => {}
        }
    }
    Ok(())
}

/// How an offer's history field breaks §5.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HistoryOfferFault {
    /// The offer names `ui/history` and says nothing of what it holds.
    Missing,
    /// The offer says what it holds and does not name `ui/history`.
    Unasked,
    /// Its oldest position is newer than its newest, or only one is named.
    Backwards,
}

/// Whether `offer`'s history field is there exactly when it names `ui/history`.
pub fn check_history_offer(offer: &Offer) -> Result<(), HistoryOfferFault> {
    match (offer.answers(UI_HISTORY), &offer.history) {
        (true, None) => Err(HistoryOfferFault::Missing),
        (false, Some(_)) => Err(HistoryOfferFault::Unasked),
        (_, Some(HistoryOffer { oldest, newest, .. })) => match (oldest, newest) {
            (Some(oldest), Some(newest)) if oldest > newest => Err(HistoryOfferFault::Backwards),
            (Some(_), None) | (None, Some(_)) => Err(HistoryOfferFault::Backwards),
            _ => Ok(()),
        },
        (false, None) => Ok(()),
    }
}
```

## A state the driver gives

A test wants to see an app in a state it chose: the live state with two fields
changed, say, and then drive the app there. A **state fixture** is that state
(`x0k:architecture/ui-interfaces` §4). `present` gives it, and `release` returns
the app to live. The decision states what holds:

```x0k:transclude {ref="x0k:architecture/ui-interfaces#4-a-state-fixture-shows-a-state-the-driver-gives"}
```

A fixture is either a whole state or a JSON Merge Patch over the live state (RFC
7396), because a patch names only the fields it changes. `merge_patch` is the
RFC's algorithm: an object patches field by field, a `null` removes its field,
and anything else replaces the target. Its vectors are the RFC's own examples.

The call names the fingerprint of the state shape the driver read with the
state, and it may name the head it read the state at, as `If-Match` does (RFC
9110 §13.1.1). `check_present` makes the four refusals of §4 in order, and
answers the whole state to show:

1. The offer does not say the app takes fixtures: `no_fixtures`.
2. The fingerprint is not the pin of the app's state shape: `wrong_fingerprint`,
   naming the call's and saying the app's.
3. The call names a head and the live state is at another: `stale_head`, naming
   the current one.
4. The state, after the patch, does not fit the shape: `misfit_state`, naming
   the place.

The check needs the app's state shape and its live state, which only the app
holds, so the endpoint asks the app for both and makes the check before the app
hears the call. A shape is compiled for an argument, because a fixture is a
value the driver gives the app.

<a name="chunk-fixture"></a><sub>[`src/fixture.rs`](../../crates/x0k-ui-protocol/src/fixture.rs) · `#fixture` · assembles [fixture-values](#chunk-fixture-values) · [merge-patch](#chunk-merge-patch) · [check-present](#chunk-check-present)</sub>

```rust {#fixture file="src/fixture.rs"}
//! A state a driver gives an app to show (`ui-interfaces` §4).

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use x0k_datum::shape::{Shape, Shaped, Use};
use x0k_datum::Datum;

use crate::observe::StatePart;
use crate::offer::{Offer, UI_HISTORY};
use crate::shapes::shape_pin;
use crate::{Refused, RefusalCode};

<<fixture-values>>

<<merge-patch>>

<<check-present>>
```

A handle names one fixture while it stands. `release` of a handle that does not
stand is answered as such and not refused, because releasing twice leaves the app
where releasing once does. The app may end a fixture itself, for a reason it
gives, such as an approval that arrives for a person; `release` of that handle
then answers `ended` with the reason, so the driver learns why the fixture went
and not only that it is gone.

<a name="chunk-fixture-values"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#fixture-values`</sub>

```rust {#fixture-values}
/// What a fixture gives: a whole state, or a merge patch over the live state.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Fixture {
    State { state: Value },
    Patch { patch: Value },
}

/// `present`'s argument.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Shape)]
pub struct PresentCall {
    pub fixture: Fixture,
    /// The fingerprint of the state shape the driver read with the state.
    pub fingerprint: String,
    /// The head the driver read the live state at.
    #[serde(default)]
    pub if_match: Option<String>,
}

/// `present`'s answer.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum PresentAnswer {
    Refused(Refused),
    /// The fixture stands as `handle`, first shown in `frame` when the app
    /// presents frames.
    Presented {
        handle: String,
        #[serde(default)]
        frame: Option<String>,
    },
}

/// `release`'s argument.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
pub struct ReleaseCall {
    pub handle: String,
}

/// `release`'s answer.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum ReleaseAnswer {
    Refused(Refused),
    /// The app shows its live state, first in `frame` when it presents frames.
    Released {
        #[serde(default)]
        frame: Option<String>,
    },
    /// No fixture stands as `handle`.
    NotStanding { handle: String },
    /// The app ended the fixture `handle` itself, for `reason`, and shows its
    /// live state (`ui-interfaces` §4).
    Ended { handle: String, reason: String },
}
```

<a name="chunk-merge-patch"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#merge-patch`</sub>

```rust {#merge-patch}
/// `patch` applied to `target`, as RFC 7396 §2 says.
pub fn merge_patch(target: &Value, patch: &Value) -> Value {
    let Value::Object(fields) = patch else {
        return patch.clone();
    };
    let mut merged = match target {
        Value::Object(target) => target.clone(),
        _ => Map::new(),
    };
    for (name, value) in fields {
        if value.is_null() {
            merged.remove(name);
        } else {
            let patched = merge_patch(merged.get(name).unwrap_or(&Value::Null), value);
            merged.insert(name.clone(), patched);
        }
    }
    Value::Object(merged)
}
```

<a name="chunk-check-present"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#check-present`</sub>

```rust {#check-present}
/// The state `call` asks the app to show, or why it may not. `live` is the
/// app's live state and `shape` the spelling of its state shape.
pub fn check_present(
    offer: &Offer,
    live: Option<&StatePart>,
    shape: Option<&Datum>,
    call: &PresentCall,
) -> Result<Value, Refused> {
    if !offer.answers(UI_HISTORY) {
        return Err(Refused::new(RefusalCode::NoHistoryInterface, UI_HISTORY, "the offer does not name ui/history"));
    }
    let (true, Some(shape)) = (offer.history.as_ref().is_some_and(|held| held.fixtures), shape) else {
        return Err(Refused::new(RefusalCode::NoFixtures, UI_HISTORY, "the app takes no state fixtures"));
    };
    let pin = shape_pin(shape);
    if call.fingerprint != pin {
        let why = format!("the fixture was written for shape {}, and the app's state shape is {pin}", call.fingerprint);
        return Err(Refused::new(RefusalCode::WrongFingerprint, &call.fingerprint, why));
    }
    let head = live.map(|live| live.head.as_str());
    if let Some(asked) = call.if_match.as_deref().filter(|asked| Some(*asked) != head) {
        let current = head.unwrap_or("none");
        let why = format!("the fixture was written against head {asked}, and the live state is at {current}");
        return Err(Refused::new(RefusalCode::StaleHead, current, why));
    }
    let state = match &call.fixture {
        Fixture::State { state } => state.clone(),
        Fixture::Patch { patch } => merge_patch(live.map_or(&Value::Null, |live| &live.value), patch),
    };
    let unreadable = |why: String| Refused::new(RefusalCode::UnreadableShape, "state", why);
    let compiled = Shaped::read(shape)
        .map_err(|fault| unreadable(format!("{fault:?}")))?
        .compile(Use::Argument)
        .map_err(|fault| unreadable(format!("{fault:?}")))?;
    compiled
        .check(&Datum::from_json(&state))
        .map_err(|misfit| Refused::new(RefusalCode::MisfitState, &misfit.at, misfit.to_string()))?;
    Ok(state)
}
```

## What going back does to an effect

While a fixture stands, the app is on a `vary` trip
(`x0k:architecture/graded-introspection` §9): it runs from a given state, and what
its effects do is set by three things. The effect's side-effect class says what
it is. The trip's purpose says why the app is there. The app's **replay policy**
decides, in the section's vocabulary of dispositions. The decision states the
offer's part:

```x0k:transclude {ref="x0k:architecture/ui-interfaces#5-the-offer-states-grades-history-replay-policy-and-sandboxes"}
```

A policy entry covers a side-effect class or one action by name, and gives a
disposition for `vary` and one for `continue` after the cut. A sandbox covers
classes and actions the same way. An entry for an action wins over one for its
class, and what no entry names takes §9's default:

| Class | `vary` | `continue`, after the cut |
|---|---|---|
| `read_only` | `performed` | `performed` |
| `idempotent_write` | `sandboxed` where a sandbox serves it, else `simulated` | `performed` |
| `non_idempotent` | `simulated` | `performed` |

§9 lets a requester choose `recorded` for a `read_only` effect under `vary`. A
fixture has no record to answer from, so its default is `performed`, as
`ui-interfaces` §4 says.

<a name="chunk-replay"></a><sub>[`src/replay.rs`](../../crates/x0k-ui-protocol/src/replay.rs) · `#replay` · assembles [replay-values](#chunk-replay-values) · [resolve-disposition](#chunk-resolve-disposition) · [check-replay-policy](#chunk-check-replay-policy)</sub>

```rust {#replay file="src/replay.rs"}
//! What going back does to an effect (`graded-introspection` §9), as an
//! offer states it (`ui-interfaces` §5).

use serde::{Deserialize, Serialize};
use x0k_datum::shape::Shape;

use crate::offer::{Offer, SideEffect};
use crate::{Refused, RefusalCode};

<<replay-values>>

<<resolve-disposition>>

<<check-replay-policy>>
```

The values spell the section's words. `Covers` is tagged by `kind`, as `Shown`
is. The purpose is not on the wire: an app's endpoint knows it from what the app
shows.

<a name="chunk-replay-values"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#replay-values`</sub>

```rust {#replay-values}
/// What a unit does with an effect when it goes back (`graded-introspection` §9).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
#[serde(rename_all = "snake_case")]
pub enum ReplayDisposition {
    /// The reply comes from the record; nothing is performed.
    Recorded,
    /// Nothing is performed; the reply is a marked stand-in.
    Simulated,
    /// Issued now, as a new effect.
    Performed,
    /// Performed against a stand-in target the unit declares.
    Sandboxed,
    /// An effect performed before the cut is answered by its compensation.
    Compensated,
    /// The trip stops at the effect and says why.
    Refused,
}

/// What a policy entry or a sandbox covers.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Covers {
    Class { class: SideEffect },
    Action { action: String },
}

/// One entry of a replay policy.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
pub struct PolicyEntry {
    pub covers: Covers,
    #[serde(default)]
    pub vary: Option<ReplayDisposition>,
    #[serde(default)]
    pub continue_after_cut: Option<ReplayDisposition>,
    /// The sandbox a `sandboxed` disposition is performed against.
    #[serde(default)]
    pub sandbox: Option<String>,
}

/// A stand-in target the app declares.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Shape)]
pub struct Sandbox {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub serves: Vec<Covers>,
}

/// Why a trip goes back, of the purposes a replay policy speaks for.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Purpose {
    Vary,
    /// `continue`, after the cut.
    Continue,
}

/// The disposition an effect takes, and the sandbox it is performed against.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Taken {
    pub disposition: ReplayDisposition,
    #[serde(default)]
    pub sandbox: Option<String>,
}
```

`disposition` answers what an effect takes. It reads the policy as written, so a
policy that lowers a floor is the caller's to refuse first, with
`check_replay_policy`. An endpoint does that before it takes any disposition.

<a name="chunk-resolve-disposition"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#resolve-disposition`</sub>

```rust {#resolve-disposition}
impl Covers {
    /// Whether this covers an effect of `class` from `action`.
    fn covers(&self, class: SideEffect, action: &str) -> bool {
        match self {
            Covers::Class { class: covered } => *covered == class,
            Covers::Action { action: covered } => covered == action,
        }
    }

    fn named(&self) -> String {
        match self {
            Covers::Class { class } => format!("class {}", side_effect_word(*class)),
            Covers::Action { action } => format!("action {action}"),
        }
    }
}

fn side_effect_word(class: SideEffect) -> &'static str {
    match class {
        SideEffect::ReadOnly => "read_only",
        SideEffect::IdempotentWrite => "idempotent_write",
        SideEffect::NonIdempotent => "non_idempotent",
    }
}

/// What an effect of `class` from `action` takes on a `purpose` trip.
pub fn disposition(offer: &Offer, purpose: Purpose, class: SideEffect, action: &str) -> Taken {
    let named = |entry: &&PolicyEntry| matches!(&entry.covers, Covers::Action { action: named } if named == action);
    let classed = |entry: &&PolicyEntry| entry.covers == Covers::Class { class };
    let entries = &offer.replay_policy;
    for entry in entries.iter().filter(named).chain(entries.iter().filter(classed)) {
        let chosen = match purpose {
            Purpose::Vary => entry.vary,
            Purpose::Continue => entry.continue_after_cut,
        };
        if let Some(disposition) = chosen {
            return Taken { disposition, sandbox: entry.sandbox.clone() };
        }
    }
    let serving = offer.sandboxes.iter().find(|sandbox| sandbox.serves.iter().any(|covers| covers.covers(class, action)));
    let disposition = match (purpose, class, serving) {
        (Purpose::Continue, ..) | (Purpose::Vary, SideEffect::ReadOnly, _) => ReplayDisposition::Performed,
        (Purpose::Vary, SideEffect::IdempotentWrite, Some(sandbox)) => {
            return Taken { disposition: ReplayDisposition::Sandboxed, sandbox: Some(sandbox.name.clone()) };
        }
        (Purpose::Vary, ..) => ReplayDisposition::Simulated,
    };
    Taken { disposition, sandbox: None }
}
```

`check_replay_policy` is what a driver's end makes of an offer before it trusts
the policy. Of §9's five floors, two are ones an entry can lower. `vary`
`performed` for a `non_idempotent` effect lowers the fourth, and `compensated`
in either column lowers the fifth, because compensation is offered and never
automatic. A `sandboxed` disposition must name a sandbox the offer declares, and
that sandbox must serve what the entry covers. An entry naming an action the
offer does not list says nothing a reader can hold, so it is refused too. Each
refusal names the entry.

<a name="chunk-check-replay-policy"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#check-replay-policy`</sub>

```rust {#check-replay-policy}
/// Whether `offer`'s replay policy can be read: it lowers no floor of
/// `graded-introspection` §9 and names only sandboxes it declares.
pub fn check_replay_policy(offer: &Offer) -> Result<(), Refused> {
    for entry in &offer.replay_policy {
        let subject = entry.covers.named();
        let unreadable = |why: String| Refused::new(RefusalCode::UnreadablePolicy, &subject, why);
        let class = match &entry.covers {
            Covers::Class { class } => *class,
            Covers::Action { action } => match offer.actions.iter().find(|offered| offered.name == *action) {
                Some(offered) => offered.side_effect,
                None => return Err(unreadable(format!("the offer lists no action {action}"))),
            },
        };
        if entry.vary == Some(ReplayDisposition::Performed) && class == SideEffect::NonIdempotent {
            return Err(unreadable(format!("{subject}: vary never performs a non_idempotent effect")));
        }
        let chosen = [entry.vary, entry.continue_after_cut];
        if chosen.contains(&Some(ReplayDisposition::Compensated)) {
            return Err(unreadable(format!("{subject}: compensation is offered, never automatic")));
        }
        if chosen.contains(&Some(ReplayDisposition::Sandboxed)) {
            let action = match &entry.covers {
                Covers::Action { action } => action.as_str(),
                Covers::Class { .. } => "",
            };
            let declared = entry.sandbox.as_ref().and_then(|name| offer.sandboxes.iter().find(|sandbox| sandbox.name == *name));
            let serves = declared.is_some_and(|sandbox| {
                sandbox.serves.iter().any(|covers| *covers == entry.covers || covers.covers(class, action))
            });
            if !serves {
                return Err(unreadable(format!("{subject}: sandboxed names no declared sandbox that serves it")));
            }
        }
    }
    Ok(())
}
```

## What a mark means

`x0k:design/markup-mode` has a person draw on one held frame and shows them what each
mark was taken to mean. A mark resolves against that frame's layout tree, so it is a
function of the two, and any driver holding an observation can run it.

What a mark touches is the wrong question. A circle round a heading touches every
container the heading sits in, which on a shell is half the tree. What a mark means is
what it was drawn around: the highest nodes it mostly covers. A circle round a heading
finds the heading, and a circle round a whole panel finds the panel and not everything
in it. A node with a child that nearly fills it is a wrapper, and it means what it
wraps, because a toolkit nests widgets that a person sees as one thing. A ring round
most of the window also mostly covers the window itself, so a child that holds most
of the mark is what was meant, down to the leaf the ring goes round.

A mark may cover nothing, as a tap does, or a stroke inside a large empty area. Then it
means the deepest node that holds it. That is a *region*, and the answer says so,
because the person should know x0k is guessing at a place and has not found a thing.
A layer can cover the whole window and hold nothing, so the deepest node at the point
wins over the topmost. A mark that lands on the root alone reached nothing.

<a name="chunk-marks"></a><sub>[`src/marks.rs`](../../crates/x0k-ui-protocol/src/marks.rs) · `#marks`</sub>

```rust {#marks file="src/marks.rs"}
//! What a mark on a frame means (`x0k:design/markup-mode`).

use serde::{Deserialize, Serialize};

use crate::observe::{Bounds, LayoutNode};

/// How much of a node a mark has to cover to mean it.
const MOSTLY: f64 = 0.6;

/// One stroke on a frame, in that frame's pixels, with any note beside it.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Mark {
    pub stroke: Vec<(f64, f64)>,
    #[serde(default)]
    pub note: Option<String>,
}

/// How far a mark resolved.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Reach {
    /// It was drawn around these nodes.
    Nodes,
    /// It covered nothing, and this is the place that holds it.
    Region,
    /// It landed on nothing the tree can name.
    Nothing,
}

/// One node a mark resolved to.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MarkedNode {
    pub id: String,
    pub role: String,
    #[serde(default)]
    pub label: Option<String>,
    pub bounds: Bounds,
    #[serde(default)]
    pub composition: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
}

/// What a mark was taken to mean.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ResolvedMark {
    pub reach: Reach,
    pub nodes: Vec<MarkedNode>,
    #[serde(default)]
    pub note: Option<String>,
}

fn marked(node: &LayoutNode) -> MarkedNode {
    MarkedNode {
        id: node.id.clone(),
        role: node.role.clone(),
        label: node.label.clone(),
        bounds: node.bounds,
        composition: node.composition.clone(),
        source: node.source.clone(),
    }
}

/// The box round a stroke.
fn extent(stroke: &[(f64, f64)]) -> Option<Bounds> {
    let (first, rest) = stroke.split_first()?;
    let (mut left, mut top, mut right, mut bottom) = (first.0, first.1, first.0, first.1);
    for (x, y) in rest {
        (left, right) = (left.min(*x), right.max(*x));
        (top, bottom) = (top.min(*y), bottom.max(*y));
    }
    Some(Bounds { x: left, y: top, width: right - left, height: bottom - top })
}

/// How much of `node` lies within `area`, from 0 to 1.
fn covered(node: &Bounds, area: &Bounds) -> f64 {
    let wide = (node.x + node.width).min(area.x + area.width) - node.x.max(area.x);
    let high = (node.y + node.height).min(area.y + area.height) - node.y.max(area.y);
    let whole = node.width * node.height;
    if wide <= 0.0 || high <= 0.0 || whole <= 0.0 {
        return 0.0;
    }
    wide * high / whole
}

/// The node `area` means, under `node`, which it mostly covers. A child it also mostly
/// covers is what was meant when the child fills `node`, as a wrapper's child does, or
/// holds most of the mark, as the leaf does under a ring round most of the window. Of
/// several that fit, the deepest wins, since a layer that covers everything fits every
/// mark.
fn meant<'t>(node: &'t LayoutNode, area: &Bounds, depth: usize) -> (usize, &'t LayoutNode) {
    let fits = |child: &&LayoutNode| {
        let wrapped = covered(&node.bounds, &child.bounds) >= MOSTLY;
        child.visible
            && covered(&child.bounds, area) >= MOSTLY
            && (wrapped || covered(area, &child.bounds) >= MOSTLY)
    };
    let found = node.children.iter().filter(fits).map(|child| meant(child, area, depth + 1));
    found.max_by_key(|(depth, _)| *depth).unwrap_or((depth, node))
}

/// The highest visible nodes `area` mostly covers.
fn drawn_around<'t>(node: &'t LayoutNode, area: &Bounds, found: &mut Vec<&'t LayoutNode>) {
    if node.visible && covered(&node.bounds, area) >= MOSTLY {
        found.push(meant(node, area, 0).1);
        return;
    }
    for child in &node.children {
        drawn_around(child, area, found);
    }
}

/// The deepest visible node holding the point `at`, with its depth. A layer that
/// covers everything holds every point, so the deepest node wins over the topmost.
fn deepest_at(node: &LayoutNode, at: (f64, f64), depth: usize) -> Option<(usize, &LayoutNode)> {
    let bounds = &node.bounds;
    let inside = at.0 >= bounds.x
        && at.0 <= bounds.x + bounds.width
        && at.1 >= bounds.y
        && at.1 <= bounds.y + bounds.height;
    if !node.visible || !inside {
        return None;
    }
    let held = node.children.iter().filter_map(|child| deepest_at(child, at, depth + 1));
    held.max_by_key(|(depth, _)| *depth).or(Some((depth, node)))
}

/// What `mark` means on the frame whose tree is `root`.
pub fn resolve_mark(root: &LayoutNode, mark: &Mark) -> ResolvedMark {
    let note = mark.note.clone();
    let nothing = |note| ResolvedMark { reach: Reach::Nothing, nodes: Vec::new(), note };
    let Some(area) = extent(&mark.stroke) else { return nothing(note) };
    let mut found = Vec::new();
    for child in &root.children {
        drawn_around(child, &area, &mut found);
    }
    if !found.is_empty() {
        let nodes = found.into_iter().map(marked).collect();
        return ResolvedMark { reach: Reach::Nodes, nodes, note };
    }
    let centre = (area.x + area.width / 2.0, area.y + area.height / 2.0);
    match deepest_at(root, centre, 0) {
        Some((_, node)) if node.id != root.id => {
            ResolvedMark { reach: Reach::Region, nodes: vec![marked(node)], note }
        }
        _ => nothing(note),
    }
}
```

The test tree is the case that matters: nested containers filling the screen, with
small things inside them.

<a name="chunk-marks-test"></a><sub>[`src/marks.rs`](../../crates/x0k-ui-protocol/src/marks.rs) · `#marks-test`</sub>

```rust {#marks-test file="src/marks.rs"}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(id: &str, (x, y, width, height): (f64, f64, f64, f64), children: Vec<LayoutNode>) -> LayoutNode {
        LayoutNode {
            id: id.to_string(),
            role: "widget".to_string(),
            label: None,
            value: None,
            bounds: Bounds { x, y, width, height },
            laid_out: None,
            visible: true,
            enabled: true,
            focused: false,
            interactive: false,
            action: None,
            source: None,
            composition: None,
            children,
        }
    }

    /// A window, a panel filling its right side, and a heading and a button in it.
    fn tree() -> LayoutNode {
        let heading = node("heading", (860.0, 60.0, 100.0, 40.0), Vec::new());
        let button = node("button", (800.0, 60.0, 50.0, 40.0), Vec::new());
        let mut hidden = node("hidden", (860.0, 700.0, 100.0, 40.0), Vec::new());
        hidden.visible = false;
        let inner = node("inner", (790.0, 50.0, 400.0, 700.0), vec![button, heading, hidden]);
        let panel = node("panel", (780.0, 40.0, 420.0, 760.0), vec![inner]);
        node("root", (0.0, 0.0, 1200.0, 800.0), vec![panel])
    }

    fn circle((left, top, right, bottom): (f64, f64, f64, f64)) -> Mark {
        let middle = (left + right) / 2.0;
        Mark { stroke: vec![(left, top), (middle, bottom), (right, top)], note: None }
    }

    fn ids(mark: &Mark) -> (Reach, Vec<String>) {
        let resolved = resolve_mark(&tree(), mark);
        (resolved.reach, resolved.nodes.into_iter().map(|node| node.id).collect())
    }

    #[test]
    fn a_circle_round_a_heading_means_the_heading_and_not_what_it_sits_in() {
        let (reach, ids) = ids(&circle((850.0, 50.0, 970.0, 110.0)));
        assert_eq!(reach, Reach::Nodes);
        assert_eq!(ids, ["heading"]);
    }

    #[test]
    fn a_circle_round_two_things_means_both() {
        let (_, ids) = ids(&circle((795.0, 55.0, 970.0, 105.0)));
        assert_eq!(ids, ["button", "heading"]);
    }

    #[test]
    fn a_circle_round_a_panel_means_one_thing_and_not_everything_in_it() {
        let (_, ids) = ids(&circle((770.0, 30.0, 1200.0, 800.0)));
        assert_eq!(ids, ["inner"], "the panel wraps one child that nearly fills it");
    }

    #[test]
    fn a_wrapper_means_what_it_wraps() {
        let button = node("button", (10.0, 10.0, 40.0, 40.0), Vec::new());
        let wrapper = node("wrapper", (8.0, 8.0, 44.0, 44.0), vec![button]);
        let root = node("root", (0.0, 0.0, 400.0, 400.0), vec![wrapper]);
        let resolved = resolve_mark(&root, &circle((0.0, 0.0, 60.0, 60.0)));
        let ids: Vec<&str> = resolved.nodes.iter().map(|node| node.id.as_str()).collect();
        assert_eq!(ids, ["button"]);
    }

    #[test]
    fn a_ring_round_most_of_the_window_means_the_leaf_it_circles() {
        let leaf = node("document", (30.0, 50.0, 1340.0, 850.0), vec![node("line", (40.0, 60.0, 300.0, 20.0), vec![])]);
        let bar = node("bar", (0.0, 0.0, 1400.0, 50.0), vec![]);
        let chrome = node("chrome", (0.0, 0.0, 1400.0, 900.0), vec![bar, leaf]);
        let empty = node("layer", (0.0, 0.0, 1400.0, 900.0), vec![]);
        let root = node("root", (0.0, 0.0, 1400.0, 900.0), vec![chrome, empty]);
        let ring = circle((32.0, 54.0, 1365.0, 897.0));
        assert_eq!(resolve_mark(&root, &ring).nodes[0].id, "document");
    }

    #[test]
    fn a_tap_reaches_past_a_layer_that_covers_everything() {
        let button = node("button", (10.0, 10.0, 40.0, 40.0), Vec::new());
        let bar = node("bar", (0.0, 0.0, 400.0, 60.0), vec![button]);
        let layer = node("layer", (0.0, 0.0, 400.0, 400.0), Vec::new());
        let root = node("root", (0.0, 0.0, 400.0, 400.0), vec![bar, layer]);
        let resolved = resolve_mark(&root, &Mark { stroke: vec![(20.0, 20.0)], note: None });
        assert_eq!(resolved.nodes[0].id, "button");
    }

    #[test]
    fn a_tap_means_the_deepest_thing_under_it() {
        let mark = Mark { stroke: vec![(900.0, 80.0)], note: None };
        assert_eq!(ids(&mark), (Reach::Region, vec!["heading".to_string()]));
    }

    #[test]
    fn a_stroke_in_empty_space_is_a_region_and_says_so() {
        let (reach, ids) = ids(&circle((900.0, 300.0, 940.0, 340.0)));
        assert_eq!((reach, ids), (Reach::Region, vec!["inner".to_string()]));
    }

    #[test]
    fn a_mark_on_the_bare_window_reached_nothing() {
        let (reach, ids) = ids(&circle((100.0, 100.0, 140.0, 140.0)));
        assert_eq!((reach, ids.len()), (Reach::Nothing, 0));
    }

    #[test]
    fn what_cannot_be_seen_cannot_be_meant() {
        let (reach, ids) = ids(&circle((850.0, 690.0, 970.0, 750.0)));
        assert_eq!((reach, ids), (Reach::Region, vec!["inner".to_string()]));
    }

    #[test]
    fn a_note_travels_with_its_mark() {
        let mark = Mark { note: Some("smaller".to_string()), ..circle((850.0, 50.0, 970.0, 110.0)) };
        assert_eq!(resolve_mark(&tree(), &mark).note.as_deref(), Some("smaller"));
    }
}
```

## What a host draws of input

Every host that draws input draws the same things (`ui-control-channel` §10):
a pointer per source, labelled with the name of the requester that sent it, a ring at each
press, and the keys a requester types, each fading after its time. So the
model of what is drawn lives here once, as plain data with no window, and each
host keeps only its own painting: the shell's widget
(`x0k:implementation/ui-control/presented-input`) and the Tauri plugin's
native layer (`x0k:implementation/ui-control/tauri-plugin`).

A position is in the host's units: the frame's pixels over the host's scale,
as `ticks` gives them. A pointer is kept by its requester and its source, so
one driver's two sources are two pointers and two drivers' sources never
meet. A key with a name shows its name in brackets, and a run of keys from one
requester is one caption until it fades.

<a name="chunk-presentation-model"></a><sub>[`src/presentation.rs`](../../crates/x0k-ui-protocol/src/presentation.rs) · `#presentation-model`</sub>

```rust {#presentation-model file="src/presentation.rs"}
//! What a host draws of drivers' input (`ui-control-channel` §10), with no window.

use std::collections::{BTreeMap, BTreeSet};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::input::Event;

/// How long a press's ring and a typed key's caption stay drawn.
pub const MARK_FOR: Duration = Duration::from_millis(700);
/// How long a pointer stays drawn after its last event.
pub const POINTER_FOR: Duration = Duration::from_secs(3);
/// How fast the drawn pointer travels at the watchable pace, in host units a second.
pub const WATCHABLE_SPEED: f64 = 800.0;
/// The shortest a watchable move takes, however short its way.
pub const WATCHABLE_MOVE: Duration = Duration::from_millis(150);
/// How often a watchable move is drawn and delivered on its way.
pub const WATCHABLE_STEP: Duration = Duration::from_millis(16);

/// A driver's pointer.
#[derive(Clone, Debug, PartialEq)]
pub struct DrawnPointer {
    pub requester: String,
    pub at: (f64, f64),
    pub pressed: bool,
    pub last: Instant,
}

/// A press's ring, in its requester's colour.
#[derive(Clone, Debug, PartialEq)]
pub struct DrawnClick {
    pub requester: String,
    pub at: (f64, f64),
    pub since: Instant,
}

/// The keys a requester typed, as one caption.
#[derive(Clone, Debug, PartialEq)]
pub struct DrawnKeys {
    pub requester: String,
    pub text: String,
    pub since: Instant,
}

/// Where a takeover of the window's input stands.
#[derive(Clone, Debug, Default, PartialEq)]
pub enum Takeover {
    /// No driver asks for the person's input or holds it.
    #[default]
    Free,
    /// `requester` asks the person for a takeover.
    Asked { requester: String },
    /// `requester` holds the window's input until its sequence answers.
    Held { requester: String },
}

/// What a host draws of drivers' input. `changes` counts every change, so a
/// host knows when to paint again.
#[derive(Clone, Debug, Default)]
pub struct InputPresentation {
    pointers: BTreeMap<(String, String), DrawnPointer>,
    clicks: Vec<DrawnClick>,
    keys: Option<DrawnKeys>,
    /// Each drawn requester's colour index, held while anything of theirs is drawn.
    hues: BTreeMap<String, usize>,
    takeover: Takeover,
    hidden: bool,
    pub changes: u64,
}
```

<a name="chunk-presentation-model-2"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#presentation-model` · continues</sub>

```rust {#presentation-model}

impl InputPresentation {
    /// `requester`'s pointer `source` is now at `at`.
    pub fn moved(&mut self, requester: &str, source: &str, at: (f64, f64), now: Instant) {
        let pointer = self.pointer(requester, source, at, now);
        (pointer.at, pointer.last) = (at, now);
        self.changes += 1;
    }

    /// `requester`'s pointer `source` pressed or released at `at`. A press leaves a ring.
    pub fn pressed(&mut self, requester: &str, source: &str, at: (f64, f64), down: bool, now: Instant) {
        let pointer = self.pointer(requester, source, at, now);
        (pointer.at, pointer.pressed, pointer.last) = (at, down, now);
        if down {
            self.clicks.push(DrawnClick { requester: requester.to_string(), at, since: now });
        }
        self.changes += 1;
    }

    /// `requester` typed `key`: one character, or one of the protocol's named keys.
    pub fn typed(&mut self, requester: &str, key: &str, now: Instant) {
        let shown = if key.chars().count() == 1 { key.to_string() } else { format!("[{key}]") };
        match &mut self.keys {
            Some(keys) if keys.requester == requester && now.duration_since(keys.since) < MARK_FOR => {
                keys.text.push_str(&shown);
                keys.since = now;
            }
            _ => self.keys = Some(DrawnKeys { requester: requester.to_string(), text: shown, since: now }),
        }
        self.changes += 1;
    }

    /// Draw one event of `requester`'s, at the position `ticks` gave it.
    pub fn show(&mut self, requester: &str, event: &Event, now: Instant) {
        self.hue(requester);
        match event {
            Event::Move { source, x, y, .. } | Event::Scroll { source, x, y, .. } => self.moved(requester, source, (*x, *y), now),
            Event::Press { source, x, y, .. } => self.pressed(requester, source, (*x, *y), true, now),
            Event::Release { source, x, y, .. } => self.pressed(requester, source, (*x, *y), false, now),
            Event::KeyDown { key, .. } => self.typed(requester, key, now),
            Event::KeyUp { .. } => {}
        }
    }

    /// Hide the drawing, or show it again.
    pub fn hide(&mut self, hidden: bool) {
        if self.hidden != hidden {
            self.hidden = hidden;
            self.changes += 1;
        }
    }

    /// Drop what has been drawn past its time; whether any mark that fades is
    /// still drawn.
    pub fn prune(&mut self, now: Instant) -> bool {
        let before = (self.pointers.len(), self.clicks.len(), self.keys.is_some());
        self.pointers.retain(|_, pointer| now.duration_since(pointer.last) < POINTER_FOR);
        self.clicks.retain(|click| now.duration_since(click.since) < MARK_FOR);
        if self.keys.as_ref().is_some_and(|keys| now.duration_since(keys.since) >= MARK_FOR) {
            self.keys = None;
        }
        if before != (self.pointers.len(), self.clicks.len(), self.keys.is_some()) {
            self.changes += 1;
        }
        let drawn: BTreeSet<&str> = self.pointers.values().map(|p| p.requester.as_str())
            .chain(self.clicks.iter().map(|c| c.requester.as_str()))
            .chain(self.keys.iter().map(|k| k.requester.as_str()))
            .collect();
        self.hues.retain(|requester, _| drawn.contains(requester.as_str()));
        !self.hidden && self.fades()
    }

    /// `requester`'s colour index: the smallest one no other drawn requester
    /// holds, given at its first mark and kept while anything of its is drawn.
    pub fn hue(&mut self, requester: &str) -> usize {
        if let Some(hue) = self.hues.get(requester) {
            return *hue;
        }
        let held: BTreeSet<usize> = self.hues.values().copied().collect();
        let hue = (0..).find(|hue| !held.contains(hue)).unwrap_or_default();
        self.hues.insert(requester.to_string(), hue);
        hue
    }

    /// Whether the drawing shows anything now.
    pub fn shows_anything(&self) -> bool {
        !self.hidden && (self.fades() || self.takeover != Takeover::Free)
    }

    fn fades(&self) -> bool {
        !self.pointers.is_empty() || !self.clicks.is_empty() || self.keys.is_some()
    }

    /// The pointers drawn, in the order of their requesters and sources.
    pub fn pointers(&self) -> impl Iterator<Item = &DrawnPointer> {
        self.pointers.values()
    }

    /// The rings drawn.
    pub fn clicks(&self) -> &[DrawnClick] {
        &self.clicks
    }

    /// The caption of typed keys, if one is drawn.
    pub fn keys(&self) -> Option<&DrawnKeys> {
        self.keys.as_ref()
    }

    fn pointer(&mut self, requester: &str, source: &str, at: (f64, f64), now: Instant) -> &mut DrawnPointer {
        self.pointers
            .entry((requester.to_string(), source.to_string()))
            .or_insert_with(|| DrawnPointer { requester: requester.to_string(), at, pressed: false, last: now })
    }
}

/// How far along its time a mark is, from 0 when made to 1 when gone.
pub fn faded(since: Instant, now: Instant, over: Duration) -> f64 {
    (now.duration_since(since).as_secs_f64() / over.as_secs_f64()).min(1.0)
}
```

At the watchable pace a move travels from where its source last was to where
it goes at `WATCHABLE_SPEED`, and takes at least `WATCHABLE_MOVE`. A host
draws and delivers it at each point of its way, one every `WATCHABLE_STEP`,
so the real pointer passes over what the drawn one does. A press and a key
wait `WATCHABLE_PRESS_MS` before they land (§ "A sequence of input").

<a name="chunk-presentation-model-3"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#presentation-model` · continues</sub>

```rust {#presentation-model}

/// The points a watchable move passes on its way from `from` to `to`, short of
/// `to` itself, and how long to wait at each, so the waits add up to the move's
/// time.
pub fn watchable_way(from: (f64, f64), to: (f64, f64)) -> (Vec<(f64, f64)>, Duration) {
    let distance = (to.0 - from.0).hypot(to.1 - from.1);
    let took = Duration::from_secs_f64(distance / WATCHABLE_SPEED).max(WATCHABLE_MOVE);
    let steps = ((took.as_millis() / WATCHABLE_STEP.as_millis()) as u32).max(2);
    let way = (1..steps).map(|step| {
        let t = f64::from(step) / f64::from(steps);
        (from.0 + (to.0 - from.0) * t, from.1 + (to.1 - from.1) * t)
    });
    let way: Vec<(f64, f64)> = way.collect();
    let each = took / way.len() as u32;
    (way, each)
}
```

A takeover is the drawing's too, because the host shows it while it holds
(§ "A sequence of input"). A driver asks for one, and the host draws the ask
for the person: `ask_takeover` refuses an ask while another is asked for or
held, since the window has one person's input to give. Only the person
answers, and a host passes them nothing but a person's input; an injected
event never reaches `answer_takeover` or `person_key`. A yes holds the window's
input for the requester until its sequence answers and the endpoint ends it.

While a takeover is asked for or held, the window takes every key of the
person's. `TAKEOVER_EXIT`, the key the mark names, refuses the ask or ends the
hold at once. Ending the hold does not stop the sequence: the rest of it runs,
and the person's input reaches the window beside it, as with no takeover. A
takeover is no mark that fades, so `prune` does not count it, and a host that
paints again only while marks fade does not paint a held takeover every frame.

<a name="chunk-presentation-model-4"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#presentation-model` · continues</sub>

```rust {#presentation-model}

/// The key a person presses to refuse a takeover or end one.
pub const TAKEOVER_EXIT: &str = "Escape";

impl InputPresentation {
    /// `requester` asks the person for a takeover; false while another is
    /// asked for or held.
    pub fn ask_takeover(&mut self, requester: &str) -> bool {
        if self.takeover != Takeover::Free {
            return false;
        }
        self.takeover = Takeover::Asked { requester: requester.to_string() };
        self.changes += 1;
        true
    }

    /// The person answers the takeover asked for; false when none is.
    pub fn answer_takeover(&mut self, granted: bool) -> bool {
        let Takeover::Asked { requester } = &self.takeover else { return false };
        self.takeover = if granted { Takeover::Held { requester: requester.clone() } } else { Takeover::Free };
        self.changes += 1;
        true
    }

    /// `requester`'s takeover ends, or its ask is withdrawn. Another
    /// requester's stays.
    pub fn end_takeover(&mut self, requester: &str) {
        let (Takeover::Asked { requester: by } | Takeover::Held { requester: by }) = &self.takeover else { return };
        if by == requester {
            self.takeover = Takeover::Free;
            self.changes += 1;
        }
    }

    /// The person pressed `key`, or let it go. Whether the window takes it:
    /// every key while a takeover is asked for or held. The exit key, pressed,
    /// refuses the ask or ends the hold.
    pub fn person_key(&mut self, key: &str, down: bool) -> bool {
        if self.takeover == Takeover::Free {
            return false;
        }
        if down && key == TAKEOVER_EXIT {
            self.takeover = Takeover::Free;
            self.changes += 1;
        }
        true
    }

    /// Where the takeover stands.
    pub fn takeover(&self) -> &Takeover {
        &self.takeover
    }
}
```

A look says how the drawing is drawn, and never when input is delivered
(`ui-control-channel` §10): the pace is the call's, and the look has no part
in it. Each host has its own look, and an app, or a theme where the host has
themes, declares one in its place (`x0k:design/ui-driver`, "Watching an agent
act"). A look is plain data, the same to every host:

- **Colours**, a palette. Each requester draws in the colour its index picks,
  so two requesters drawn at once never share one while the palette has room.
  With no palette the host's own colours are drawn.
- **The pointer's shape**: an arrow with its tip at the position, or a dot
  centred on it.
- **The ring** a press leaves: its radius when made, in host units.
- **Captions**: whether the keys a requester types are drawn beside its pointer.
- **The label's size**, the height of a pointer's label text in host units.
- **Names**, what a pointer's label says for a requester. A name is given for
  an exact requester, or for every requester that starts with a prefix the
  key spells with a final `*`; an exact key wins, then the longest prefix.
  A requester no key names shows as the endpoint names it.

Every field has a default, so a look that names none is the host's default
look, and a page declares only what it changes.

<a name="chunk-presentation-model-5"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#presentation-model` · continues</sub>

```rust {#presentation-model}

/// A pointer's shape.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PointerShape {
    /// An arrow with its tip at the position.
    #[default]
    Arrow,
    /// A dot centred on the position.
    Dot,
}

/// How a host draws drivers' input: never when it is delivered.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct InputLook {
    /// Colours as `#rrggbb`, one picked by each requester's index; empty is
    /// the host's own.
    pub colors: Vec<String>,
    pub pointer: PointerShape,
    /// A press's ring's radius when made, in host units.
    pub ring: f64,
    /// Whether the keys a requester types are drawn beside its pointer.
    pub captions: bool,
    /// The height of a pointer's label text, in host units.
    pub label_size: f64,
    /// A shown name for each requester a key matches: exact, or a prefix
    /// ending in `*`.
    pub names: BTreeMap<String, String>,
}

impl Default for InputLook {
    fn default() -> Self {
        Self { colors: Vec::new(), pointer: PointerShape::Arrow, ring: 8.0, captions: true, label_size: 12.0, names: BTreeMap::new() }
    }
}

impl InputLook {
    /// The colour the look gives colour index `hue`, if it gives any.
    pub fn color(&self, hue: usize) -> Option<&str> {
        (!self.colors.is_empty()).then(|| self.colors[hue % self.colors.len()].as_str())
    }

    /// What `requester`'s label says: the name an exact key gives, else the
    /// longest prefix key's, else the requester as it is.
    pub fn name<'a>(&'a self, requester: &'a str) -> &'a str {
        self.name_given(requester, None)
    }

    /// What `requester`'s label says when its sequence names it `given`
    /// (`Perform::requester_name`): the look's own name for the requester
    /// first, then `given`, then the requester as it is.
    pub fn name_given<'a>(&'a self, requester: &'a str, given: Option<&'a str>) -> &'a str {
        if let Some(name) = self.names.get(requester) {
            return name;
        }
        let prefixed = self.names.iter().filter_map(|(key, name)| {
            let prefix = key.strip_suffix('*')?;
            requester.starts_with(prefix).then_some((prefix.len(), name.as_str()))
        });
        let named = prefixed.max_by_key(|(len, _)| *len).map(|(_, name)| name);
        named.or(given.filter(|given| !given.is_empty())).unwrap_or(requester)
    }
}
```

The model's rules hold with no window: a pointer is kept per requester and
source, a press leaves a ring and a release does not, a run of keys is one
caption, everything fades by its time, a hidden drawing shows nothing, and a
watchable move takes at least its least time. A takeover is held only after a
yes, one ask at a time; the exit key refuses or ends it; one requester's end
leaves another's takeover; and a held takeover is drawn without being a mark
that fades. Two requesters drawn at once hold two colours, and a requester
keeps its colour until nothing of its is drawn. A look names a requester by
its exact key first and its longest prefix next, then by the name its sequence
gives (`requester_name`), so a person's own naming outranks what a driver calls
itself; a look that declares nothing is the default one, and a palette picks
by index round its length.

<a name="chunk-presentation-model-6"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#presentation-model` · continues</sub>

```rust {#presentation-model}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_requesters_sources_are_two_pointers_and_a_press_leaves_a_ring() {
        let now = Instant::now();
        let mut shown = InputPresentation::default();
        shown.moved("agent", "m", (10.0, 10.0), now);
        shown.moved("other", "m", (20.0, 20.0), now);
        shown.pressed("agent", "m", (10.0, 10.0), true, now);
        shown.pressed("agent", "m", (10.0, 10.0), false, now);
        assert_eq!(shown.pointers().count(), 2);
        assert_eq!(shown.clicks().len(), 1);
    }

    #[test]
    fn a_run_of_keys_is_one_caption_and_everything_fades_by_its_time() {
        let now = Instant::now();
        let mut shown = InputPresentation::default();
        shown.moved("agent", "m", (0.0, 0.0), now);
        for key in ["H", "i", "Enter"] {
            shown.typed("agent", key, now);
        }
        assert_eq!(shown.keys().map(|keys| keys.text.as_str()), Some("Hi[Enter]"));
        assert!(shown.prune(now + MARK_FOR));
        assert!(shown.keys().is_none(), "the caption outlived its time");
        assert!(!shown.prune(now + POINTER_FOR), "the pointer outlived its time");
    }

    #[test]
    fn a_hidden_drawing_shows_nothing() {
        let now = Instant::now();
        let mut shown = InputPresentation::default();
        shown.moved("agent", "m", (0.0, 0.0), now);
        shown.hide(true);
        assert!(!shown.shows_anything());
        shown.hide(false);
        assert!(shown.shows_anything());
    }

    #[test]
    fn a_watchable_move_takes_at_least_its_least_time() {
        // A wait is whole nanoseconds, so the waits may fall short by one each.
        let slack = Duration::from_micros(1);
        let (way, each) = watchable_way((0.0, 0.0), (1.0, 0.0));
        assert!(each * way.len() as u32 + slack >= WATCHABLE_MOVE, "{} points of {each:?}", way.len());
        let (far, each) = watchable_way((0.0, 0.0), (800.0, 0.0));
        assert!(each * far.len() as u32 + slack >= Duration::from_secs(1), "{} points of {each:?}", far.len());
    }

    #[test]
    fn a_takeover_is_held_only_after_a_yes_and_one_ask_at_a_time() {
        let mut shown = InputPresentation::default();
        assert!(shown.ask_takeover("agent"));
        assert!(!shown.ask_takeover("other"), "a second ask was taken while one stood");
        assert_eq!(shown.takeover(), &Takeover::Asked { requester: "agent".to_string() });
        assert!(shown.answer_takeover(true));
        assert_eq!(shown.takeover(), &Takeover::Held { requester: "agent".to_string() });
        assert!(!shown.answer_takeover(true), "a held takeover was answered again");
        shown.end_takeover("other");
        assert_eq!(shown.takeover(), &Takeover::Held { requester: "agent".to_string() });
        shown.end_takeover("agent");
        assert_eq!(shown.takeover(), &Takeover::Free);
        assert!(shown.ask_takeover("other"));
        assert!(shown.answer_takeover(false));
        assert_eq!(shown.takeover(), &Takeover::Free);
    }

    #[test]
    fn the_exit_key_refuses_or_ends_a_takeover_and_every_key_is_taken_meanwhile() {
        let mut shown = InputPresentation::default();
        assert!(!shown.person_key("a", true), "a key was taken with no takeover");
        shown.ask_takeover("agent");
        assert!(shown.person_key("a", true));
        assert!(shown.person_key(TAKEOVER_EXIT, true));
        assert_eq!(shown.takeover(), &Takeover::Free, "the exit key did not refuse the ask");
        shown.ask_takeover("agent");
        shown.answer_takeover(true);
        assert!(shown.person_key(TAKEOVER_EXIT, false));
        assert!(matches!(shown.takeover(), Takeover::Held { .. }), "a key's release ended the hold");
        assert!(shown.person_key(TAKEOVER_EXIT, true));
        assert_eq!(shown.takeover(), &Takeover::Free, "the exit key did not end the hold");
    }

    #[test]
    fn two_requesters_hold_two_colours_and_a_colour_is_kept_while_drawn() {
        let now = Instant::now();
        let mut shown = InputPresentation::default();
        shown.moved("agent", "m", (0.0, 0.0), now);
        shown.moved("other", "m", (1.0, 1.0), now + POINTER_FOR / 2);
        assert_eq!((shown.hue("agent"), shown.hue("other")), (0, 1));
        shown.prune(now + POINTER_FOR);
        assert_eq!(shown.hue("other"), 1, "a drawn requester's colour moved");
        shown.moved("third", "m", (2.0, 2.0), now + POINTER_FOR);
        assert_eq!(shown.hue("third"), 0, "a freed colour was not given again");
    }

    #[test]
    fn a_look_names_by_exact_key_then_longest_prefix() {
        let mut look = InputLook::default();
        look.names.insert("uid 501*".into(), "an agent".into());
        look.names.insert("uid 501 pid 7*".into(), "Apollo".into());
        look.names.insert("uid 501 pid 9".into(), "Ana's helper".into());
        assert_eq!(look.name("uid 501 pid 77"), "Apollo");
        assert_eq!(look.name("uid 501 pid 9"), "Ana's helper");
        assert_eq!(look.name("uid 501 pid 3"), "an agent");
        assert_eq!(look.name("uid 502 pid 1"), "uid 502 pid 1");
    }

    #[test]
    fn a_look_names_a_requester_before_the_name_it_gives_itself() {
        let mut look = InputLook::default();
        look.names.insert("uid 501 pid 7*".into(), "Apollo".into());
        assert_eq!(look.name_given("uid 501 pid 77", Some("Ana")), "Apollo");
        assert_eq!(look.name_given("uid 502 pid 1", Some("Ana's driver")), "Ana's driver");
        assert_eq!(look.name_given("uid 502 pid 1", Some("")), "uid 502 pid 1");
        assert_eq!(look.name_given("uid 502 pid 1", None), "uid 502 pid 1");
    }

    #[test]
    fn a_look_that_declares_nothing_is_the_default_and_a_palette_wraps() {
        let declared: InputLook = serde_json::from_str("{}").expect("an empty look");
        assert_eq!(declared, InputLook::default());
        assert_eq!(declared.color(0), None);
        let look: InputLook = serde_json::from_str(r##"{"colors": ["#111111", "#222222"], "pointer": "dot"}"##).expect("a look");
        assert_eq!((look.color(0), look.color(3)), (Some("#111111"), Some("#222222")));
        assert_eq!((look.pointer, look.ring), (PointerShape::Dot, 8.0));
    }

    #[test]
    fn a_held_takeover_is_drawn_and_is_no_mark_that_fades() {
        let now = Instant::now();
        let mut shown = InputPresentation::default();
        shown.ask_takeover("agent");
        shown.answer_takeover(true);
        assert!(shown.shows_anything());
        assert!(!shown.prune(now), "a held takeover counted as a mark that fades");
        shown.hide(true);
        assert!(!shown.shows_anything());
    }
}
```

## What a web page declares

A web page answers the protocol through the in-page library
(`x0k:implementation/ui-control/page-answer`), and the library says only what
the page declares: its app, its actions with their shapes, and its state's
shape and value. Making those into the protocol's values needs the shape pins
and the interface fingerprints, and holding a call to the offer needs the
checks, all of which are this crate's. So the page hands its declaration to
its host, and the host makes the values here. A page then loads no
WebAssembly, and a page whose content security policy forbids WebAssembly
answers every call.

- `page_offer` makes a page's offer: `ui/observe` and `ui/act` with their
  fingerprints, the actions it declared, and its state's head.
- `state_part` makes the state part. The head is the page's own when it gives
  one, and otherwise the pin of the state's canonical encoding: `shape_pin`
  pins any datum, and a datum's CBOR is canonical, so two equal states have
  one head.
- `page_check` holds one call to a page's offer, for a host with no endpoint
  in front of the page. An `invoke` the checks pass is the action to run, as
  the offer lists it. Every other answer, an `invoke` the checks refuse and
  every operation a page alone does not answer, is the answer itself. A host
  with an endpoint in front of the page, as the Tauri plugin has, runs the
  endpoint's own checks with its real grant and needs none of this.

`page_check` checks `invoke` with a grant of every class. The grant is the
requester's, known only to the host from the connection the call came on, so
a refusal outside the grant stays with the endpoint and its vectors. A
`release` answers that the fixture does not stand, as an app that takes none
does.

<a name="chunk-page-declared"></a><sub>[`src/page.rs`](../../crates/x0k-ui-protocol/src/page.rs) · `#page-declared`</sub>

```rust {#page-declared file="src/page.rs"}
//! What a web page declares of itself, made into the protocol's values by its
//! host: a page's offer, its state part, and the checks a host with no
//! endpoint in front of the page makes.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use x0k_datum::Datum;

use crate::act::{check_invoke, Grant, Invoke, InvokeAnswer};
use crate::fixture::{check_present, PresentAnswer, PresentCall, ReleaseAnswer, ReleaseCall};
use crate::history::{check_navigate, HistoryAnswer, HistoryCall, NavigateCall};
use crate::input::{check_perform, Perform, PerformAnswer};
use crate::observe::StatePart;
use crate::offer::{Action, Offer, SideEffect, UI_ACT, UI_HISTORY, UI_OBSERVE};
use crate::shapes::{interface, shape_pin, HISTORY, INVOKE, NAVIGATE, PERFORM, PRESENT, RELEASE};
use crate::{Refused, RefusalCode};

/// What a page declares of its state: its shape and value as the datum's JSON,
/// and its own head when it gives one.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DeclaredState {
    pub shape: Value,
    pub value: Value,
    #[serde(default)]
    pub head: Option<String>,
}

/// What a page declares of itself.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Declared {
    pub app: String,
    pub instance: String,
    #[serde(default)]
    pub actions: Vec<Action>,
    #[serde(default)]
    pub state: Option<DeclaredState>,
}

/// What `page_check` makes of one call.
#[derive(Clone, Debug, PartialEq)]
pub enum Checked {
    /// The checks passed: run this action, as the offer lists it.
    Run(Action),
    /// The caller's answer, given unchanged.
    Answer(Value),
}

/// Why a call has no answer from `page_check`.
#[derive(Debug, thiserror::Error)]
pub enum PageFault {
    #[error("the {0} does not read: {1}")]
    Unreadable(&'static str, #[source] serde_json::Error),
    #[error("the answer does not encode: {0}")]
    Encode(#[from] serde_json::Error),
    #[error("{0}")]
    Unanswered(&'static str),
    #[error("a page answers no operation {0}")]
    NoSuchOperation(String),
}

/// The state part of what the page declared.
pub fn state_part(state: DeclaredState) -> StatePart {
    let head = state.head.unwrap_or_else(|| shape_pin(&Datum::from_json(&state.value)));
    StatePart { value: state.value, head, fingerprint: shape_pin(&Datum::from_json(&state.shape)) }
}

/// A page's offer: `ui/observe` and `ui/act`, its actions and its state's head.
pub fn page_offer(declared: Declared) -> Offer {
    Offer {
        app: declared.app,
        instance: declared.instance,
        interfaces: [UI_OBSERVE, UI_ACT].into_iter().filter_map(interface).collect(),
        actions: declared.actions,
        state_head: declared.state.map(|state| state_part(state).head),
        history: None,
        grades: Vec::new(),
        replay_policy: Vec::new(),
        sandboxes: Vec::new(),
        input: None,
    }
}
```

<a name="chunk-page-declared-2"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#page-declared` · continues</sub>

```rust {#page-declared}

/// The checks an endpoint makes before an app hears `operation`, made for a
/// page that offers `ui/observe` and `ui/act` alone, with no endpoint in
/// front of it.
pub fn page_check(operation: &str, argument: Value, offer: &Offer) -> Result<Checked, PageFault> {
    let every = Grant { classes: vec![SideEffect::ReadOnly, SideEffect::IdempotentWrite, SideEffect::NonIdempotent] };
    let read = |what: &'static str| move |error| PageFault::Unreadable(what, error);
    let answer = |value: Result<Value, serde_json::Error>| value.map(Checked::Answer).map_err(PageFault::from);
    match operation {
        INVOKE => {
            let invoke: Invoke = serde_json::from_value(argument).map_err(read("invocation"))?;
            match check_invoke(offer, &every, &invoke) {
                Ok(action) => Ok(Checked::Run(action.clone())),
                Err(refused) => answer(serde_json::to_value(InvokeAnswer::Refused(refused))),
            }
        }
        PERFORM => {
            let perform: Perform = serde_json::from_value(argument).map_err(read("sequence"))?;
            let refused = check_perform(offer, &[], &perform).err().unwrap_or_else(|| Refused {
                code: RefusalCode::NoInputInterface,
                subject: Some("ui/input".to_string()),
                why: "the page has no host that delivers input".to_string(),
            });
            answer(serde_json::to_value(PerformAnswer::Refused(refused)))
        }
        HISTORY => {
            let _: HistoryCall = serde_json::from_value(argument).map_err(read("history call"))?;
            let why = "the page keeps no history".to_string();
            let refused = Refused { code: RefusalCode::NoHistoryInterface, subject: Some(UI_HISTORY.to_string()), why };
            answer(serde_json::to_value(HistoryAnswer::Refused(refused)))
        }
        NAVIGATE => {
            let call: NavigateCall = serde_json::from_value(argument).map_err(read("navigation"))?;
            let refused = check_navigate(offer, &call).err().ok_or(PageFault::Unanswered("a page answers no navigation"))?;
            answer(serde_json::to_value(refused))
        }
        PRESENT => {
            let call: PresentCall = serde_json::from_value(argument).map_err(read("fixture"))?;
            let refused = check_present(offer, None, None, &call).err().ok_or(PageFault::Unanswered("a page takes no fixture"))?;
            answer(serde_json::to_value(PresentAnswer::Refused(refused)))
        }
        RELEASE => {
            let call: ReleaseCall = serde_json::from_value(argument).map_err(read("release"))?;
            answer(serde_json::to_value(ReleaseAnswer::NotStanding { handle: call.handle }))
        }
        other => Err(PageFault::NoSuchOperation(other.to_string())),
    }
}
```

The rules hold with no page: a page's offer names `ui/observe` and `ui/act`
and the state's head; a page that gives no head has the pin of its value,
which moves with the value and not with anything else; an action the offer
does not list is refused before anything runs, and one it lists is the one to
run.

<a name="chunk-page-declared-3"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol/src/lib.rs) · `#page-declared` · continues</sub>

```rust {#page-declared}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn counter(count: i64) -> DeclaredState {
        DeclaredState { shape: json!({ "kind": "int" }), value: json!(count), head: None }
    }

    #[test]
    fn a_pages_offer_names_its_interfaces_and_its_states_head() {
        let declared = Declared { app: "page".into(), instance: "i".into(), actions: Vec::new(), state: Some(counter(1)) };
        let offer = page_offer(declared);
        let names: Vec<_> = offer.interfaces.iter().map(|interface| interface.name.as_str()).collect();
        assert_eq!(names, [UI_OBSERVE, UI_ACT]);
        assert_eq!(offer.state_head, Some(state_part(counter(1)).head));
    }

    #[test]
    fn a_head_the_page_does_not_give_moves_with_the_value_alone() {
        assert_eq!(state_part(counter(1)).head, state_part(counter(1)).head);
        assert_ne!(state_part(counter(1)).head, state_part(counter(2)).head);
        let given = DeclaredState { head: Some("h7".into()), ..counter(1) };
        assert_eq!(state_part(given).head, "h7");
    }

    #[test]
    fn an_unlisted_action_is_refused_and_a_listed_one_runs() {
        let read = Action {
            name: "counter.read".into(),
            description: String::new(),
            args: json!({ "kind": "null" }),
            result: json!({ "kind": "any" }),
            side_effect: SideEffect::ReadOnly,
        };
        let declared = Declared { app: "page".into(), instance: "i".into(), actions: vec![read.clone()], state: None };
        let offer = page_offer(declared);
        let ran = page_check(INVOKE, json!({ "action": "counter.read", "args": null }), &offer).expect("checked");
        assert_eq!(ran, Checked::Run(read));
        let refused = page_check(INVOKE, json!({ "action": "counter.nope", "args": null }), &offer).expect("checked");
        let Checked::Answer(answer) = refused else { panic!("an unlisted action ran") };
        assert_eq!(answer["refused"]["code"], "unknown_action", "{answer}");
    }
}
```

## The shapes of the operations

§7 has a session agree on the operation set's shape fingerprints before its first
call, and the offer name each interface with its fingerprint. The values derive
their shapes, so a value and its shape cannot drift apart. `shapes.json`
holds the same shapes as data for an app in another language, which has no derive
to read, and a test holds that file to these types.

Each operation also declares its side-effect class (`ui-interfaces` §1), and
`operation_class` is that table. `invoke` takes the class of the action it
invokes, so it has none of its own.

A pin is FNV-1a over the spelling's canonical CBOR, in hex. Agreement is about
compatibility and not security, so the fingerprint needs no cryptographic hash,
and an app in any language computes it in a few lines. An interface's fingerprint
is the pin of its operations' pins, in order.

<a name="chunk-shapes"></a><sub>[`src/shapes.rs`](../../crates/x0k-ui-protocol/src/shapes.rs) · `#shapes`</sub>

```rust {#shapes file="src/shapes.rs"}
//! The UI interfaces' operations, their shapes and fingerprints (§7).

use x0k_datum::shape::{spell, TypeShape};
use x0k_datum::Datum;

use crate::act::{Invoke, InvokeAnswer};
use crate::fixture::{PresentAnswer, PresentCall, ReleaseAnswer, ReleaseCall};
use crate::history::{HistoryAnswer, HistoryCall, NavigateAnswer, NavigateCall};
use crate::input::{Perform, PerformAnswer};
use crate::observe::{Observation, ObserveCall};
use crate::offer::{Interface, Offer, SideEffect, UI_ACT, UI_INPUT, UI_OBSERVE};

/// `ui/observe`: the app's standing.
pub const OFFER: &str = "ui/observe.offer";
/// `ui/observe`: one observation.
pub const OBSERVE: &str = "ui/observe.observe";
/// `ui/act`: invoke an action the app names.
pub const INVOKE: &str = "ui/act.invoke";
/// `ui/input`: perform a sequence of input.
pub const PERFORM: &str = "ui/input.perform";
/// `ui/history`: the positions the app holds.
pub const HISTORY: &str = "ui/history.history";
/// `ui/history`: show a past position, or the live state.
pub const NAVIGATE: &str = "ui/history.navigate";
/// `ui/history`: show a state the driver gives.
pub const PRESENT: &str = "ui/history.present";
/// `ui/history`: return from a state fixture to the live state.
pub const RELEASE: &str = "ui/history.release";

/// The operations an endpoint serves.
pub const OPERATIONS: [&str; 8] = [OFFER, OBSERVE, INVOKE, PERFORM, HISTORY, NAVIGATE, PRESENT, RELEASE];

/// The side-effect class `operation` declares (`ui-interfaces` §1). `invoke`
/// has none of its own: it takes the class of the action it invokes.
pub fn operation_class(operation: &str) -> Option<SideEffect> {
    match operation {
        OFFER | OBSERVE | HISTORY => Some(SideEffect::ReadOnly),
        NAVIGATE | PRESENT | RELEASE => Some(SideEffect::IdempotentWrite),
        PERFORM => Some(SideEffect::NonIdempotent),
        _ => None,
    }
}

/// The shapes as data, for an app with no derive to read them from.
pub const SHAPES_FILE: &str = include_str!("../shapes.json");

/// One operation's shapes.
pub struct OperationShape {
    pub operation: &'static str,
    pub argument: Datum,
    pub answer: Datum,
}

/// Every operation's shapes.
pub fn operation_shapes() -> Vec<OperationShape> {
    let shape = |operation, argument, answer| OperationShape { operation, argument, answer };
    vec![
        shape(OFFER, spell::any(), Offer::spelling()),
        shape(OBSERVE, ObserveCall::spelling(), Observation::spelling()),
        shape(INVOKE, Invoke::spelling(), InvokeAnswer::spelling()),
        shape(PERFORM, Perform::spelling(), PerformAnswer::spelling()),
        shape(HISTORY, HistoryCall::spelling(), HistoryAnswer::spelling()),
        shape(NAVIGATE, NavigateCall::spelling(), NavigateAnswer::spelling()),
        shape(PRESENT, PresentCall::spelling(), PresentAnswer::spelling()),
        shape(RELEASE, ReleaseCall::spelling(), ReleaseAnswer::spelling()),
    ]
}

/// FNV-1a over `bytes`, in hex.
fn fnv1a(bytes: &[u8]) -> String {
    let hash = bytes.iter().fold(0xcbf29ce484222325_u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    });
    format!("{hash:016x}")
}

/// A shape's pin.
pub fn shape_pin(spelling: &Datum) -> String {
    fnv1a(&spelling.to_cbor())
}

/// `interface`'s fingerprint, when the protocol names its operations.
pub fn interface_fingerprint(interface: &str) -> Option<String> {
    let of_it = |shape: &&OperationShape| shape.operation.split('.').next() == Some(interface);
    let shapes = operation_shapes();
    let pins: Vec<String> = shapes
        .iter()
        .filter(of_it)
        .flat_map(|shape| [shape_pin(&shape.argument), shape_pin(&shape.answer)])
        .collect();
    (!pins.is_empty()).then(|| fnv1a(pins.concat().as_bytes()))
}

/// `name` with its fingerprint, when the protocol names its operations.
pub fn interface(name: &str) -> Option<Interface> {
    Some(Interface { name: name.to_string(), fingerprint: interface_fingerprint(name)? })
}

/// The interfaces every app built on these operations answers. An app that
/// keeps a history adds `ui/history` with [`interface`].
pub fn interfaces() -> Vec<Interface> {
    [UI_OBSERVE, UI_ACT, UI_INPUT].into_iter().filter_map(interface).collect()
}
```

The shapes file is written from these types, and a change to a value turns this
test red until the file is written again. The test compares the file's bytes, so
the key order is part of what it holds: each spelling's keys come in the order
the spelling writes them, `kind` first. That order is serde_json's
`preserve_order` feature, which the manifest asks for itself. Without it the test
would pass only in a build where another crate turns the feature on.

<a name="chunk-shapes-test"></a><sub>[`tests/shapes.rs`](../../crates/x0k-ui-protocol/tests/shapes.rs) · `#shapes-test`</sub>

```rust {#shapes-test file="tests/shapes.rs"}
//! `shapes.json`, held to the types it speaks for.

use serde_json::{json, Map, Value};
use x0k_datum::shape::{Shaped, Use};
use x0k_datum::Datum;
use x0k_ui_protocol::act::{Invoke, InvokeAnswer};
use x0k_ui_protocol::fixture::{Fixture, PresentAnswer, PresentCall, ReleaseAnswer, ReleaseCall};
use x0k_ui_protocol::history::{
    Destination, Grade, History, HistoryAnswer, HistoryCall, NavigateAnswer, NavigateCall, Position, Shown,
};
use x0k_ui_protocol::input::{Perform, PerformAnswer, Source, Step, Target};
use x0k_ui_protocol::observe::{Bounds, Capture, LayoutNode, Observation};
use x0k_ui_protocol::offer::{UI_ACT, UI_HISTORY, UI_INPUT, UI_OBSERVE};
use x0k_ui_protocol::shapes::{
    interface, interface_fingerprint, operation_shapes, HISTORY, NAVIGATE, OBSERVE, PRESENT, RELEASE, SHAPES_FILE,
};

fn written() -> Value {
    let mut operations = Map::new();
    for shape in operation_shapes() {
        let spelled = json!({
            "argument": shape.argument.to_json().expect("a spelling is JSON"),
            "answer": shape.answer.to_json().expect("a spelling is JSON"),
        });
        operations.insert(shape.operation.to_string(), spelled);
    }
    let fingerprints: Map<String, Value> = [UI_OBSERVE, UI_ACT, UI_INPUT, UI_HISTORY]
        .into_iter()
        .filter_map(interface)
        .map(|interface| (interface.name, Value::String(interface.fingerprint)))
        .collect();
    json!({ "operations": operations, "fingerprints": fingerprints })
}

#[test]
fn the_shapes_file_is_what_the_types_say() {
    let expected = serde_json::to_string_pretty(&written()).expect("JSON") + "\n";
    if let Some(path) = std::env::var_os("X0K_WRITE_UI_SHAPES") {
        std::fs::write(path, &expected).expect("the file is written");
    }
    assert_eq!(SHAPES_FILE, expected, "write it again with X0K_WRITE_UI_SHAPES=<path>");
}

fn fits(spelling: &Datum, value: &Value, use_: Use) -> bool {
    let shape = Shaped::read(spelling).expect("a shape").compile(use_).expect("it compiles");
    shape.check(&Datum::from_json(value)).is_ok()
}

fn node() -> LayoutNode {
    let bounds = Bounds { x: 0.0, y: 0.0, width: 10.0, height: 10.0 };
    let child = LayoutNode {
        id: "child".to_string(),
        role: "button".to_string(),
        label: Some("send".to_string()),
        value: None,
        bounds,
        laid_out: None,
        visible: true,
        enabled: true,
        focused: false,
        interactive: true,
        action: None,
        source: None,
        composition: None,
        children: Vec::new(),
    };
    LayoutNode { id: "root".to_string(), children: vec![child.clone()], ..child }
}

#[test]
fn a_value_fits_the_shape_its_operation_declares() {
    let shapes = operation_shapes();
    let observe = shapes.iter().find(|shape| shape.operation == OBSERVE).expect("observe");
    let observation = Observation {
        frame: Some("f1".to_string()),
        capture: Some(Capture { png: Vec::new(), width: 10, height: 10, scale_factor: 1.0, presented: false }),
        layout: Some(node()),
        state: None,
        refused: Vec::new(),
        shown: Some(Shown::Position { position: 3 }),
    };
    let answer = serde_json::to_value(&observation).expect("JSON");
    assert!(fits(&observe.answer, &answer, Use::Answer));

    let invoke = shapes.iter().find(|shape| shape.operation.ends_with("invoke")).expect("invoke");
    let call = serde_json::to_value(Invoke { action: "a".to_string(), args: json!({"n": 1}) });
    assert!(fits(&invoke.argument, &call.expect("JSON"), Use::Argument));
    let done = InvokeAnswer::Done { result: json!(null), frame: None };
    assert!(fits(&invoke.answer, &serde_json::to_value(done).expect("JSON"), Use::Answer));

    let perform = shapes.iter().find(|shape| shape.operation.ends_with("perform")).expect("perform");
    let to = Target::Pixel { frame: "f1".to_string(), x: 1.0, y: 2.0 };
    let by_node = Target::Node { frame: "f1".to_string(), node: "n1".to_string() };
    let steps = vec![Step::Move { to }, Step::Move { to: by_node }, Step::Pause { ms: 5 }];
    let source = Source { id: "m".to_string(), kind: "mouse".to_string(), steps };
    let call = serde_json::to_value(Perform::of(vec![source])).expect("JSON");
    assert!(fits(&perform.argument, &call, Use::Argument));
    let done = PerformAnswer::Done { frame: Some("f2".to_string()) };
    assert!(fits(&perform.answer, &serde_json::to_value(done).expect("JSON"), Use::Answer));

    let history = shapes.iter().find(|shape| shape.operation == HISTORY).expect("history");
    let call = HistoryCall { from: None, to: Some(4), limit: 2, include_state: true };
    assert!(fits(&history.argument, &serde_json::to_value(call).expect("JSON"), Use::Argument));
    let position = Position {
        position: 4,
        at_us: 1,
        changes: vec!["opened".to_string()],
        trace_ids: vec!["t".to_string()],
        span_ids: vec!["s".to_string()],
        grade: Grade::Captured,
        state: Some(json!({"open": true})),
    };
    let listed = HistoryAnswer::Listed(History {
        oldest: Some(1),
        newest: Some(5),
        shown: Shown::Live,
        positions: vec![position],
    });
    assert!(fits(&history.answer, &serde_json::to_value(listed).expect("JSON"), Use::Answer));

    let navigate = shapes.iter().find(|shape| shape.operation == NAVIGATE).expect("navigate");
    for to in [Destination::Live, Destination::Position { position: 4 }] {
        let call = serde_json::to_value(NavigateCall { to }).expect("JSON");
        assert!(fits(&navigate.argument, &call, Use::Argument), "{call}");
    }
    let shown = NavigateAnswer::Shown { shown: Shown::Position { position: 4 }, frame: None };
    let gone = NavigateAnswer::Unavailable { position: 1, grade: None, oldest: Some(2) };
    for answer in [shown, gone] {
        let answer = serde_json::to_value(answer).expect("JSON");
        assert!(fits(&navigate.answer, &answer, Use::Answer), "{answer}");
    }

    let present = shapes.iter().find(|shape| shape.operation == PRESENT).expect("present");
    for fixture in [Fixture::State { state: json!({"open": true}) }, Fixture::Patch { patch: json!({"open": null}) }] {
        let call = PresentCall { fixture, fingerprint: "f".to_string(), if_match: Some("s4".to_string()) };
        let call = serde_json::to_value(call).expect("JSON");
        assert!(fits(&present.argument, &call, Use::Argument), "{call}");
    }
    let presented = PresentAnswer::Presented { handle: "x1".to_string(), frame: Some("f9".to_string()) };
    assert!(fits(&present.answer, &serde_json::to_value(presented).expect("JSON"), Use::Answer));
    let release = shapes.iter().find(|shape| shape.operation == RELEASE).expect("release");
    let call = serde_json::to_value(ReleaseCall { handle: "x1".to_string() }).expect("JSON");
    assert!(fits(&release.argument, &call, Use::Argument));
    let gone = ReleaseAnswer::NotStanding { handle: "x1".to_string() };
    let ended = ReleaseAnswer::Ended { handle: "x1".to_string(), reason: "an approval arrived".to_string() };
    for answer in [ReleaseAnswer::Released { frame: None }, gone, ended] {
        let answer = serde_json::to_value(answer).expect("JSON");
        assert!(fits(&release.answer, &answer, Use::Answer), "{answer}");
    }
    let simulated = InvokeAnswer::Simulated { action: "send".to_string() };
    assert!(fits(&invoke.answer, &serde_json::to_value(simulated).expect("JSON"), Use::Answer));
}

#[test]
fn a_value_that_is_not_the_operation_s_is_turned_away() {
    let shapes = operation_shapes();
    let invoke = shapes.iter().find(|shape| shape.operation.ends_with("invoke")).expect("invoke");
    assert!(!fits(&invoke.argument, &json!({"args": 1}), Use::Argument), "it names no action");
}

#[test]
fn a_fingerprint_names_an_interface_the_protocol_has() {
    assert!(interface_fingerprint(UI_INPUT).is_some());
    assert!(interface_fingerprint(UI_HISTORY).is_some());
    assert_eq!(interface_fingerprint("ui/nothing"), None);
    let observe = interface_fingerprint("ui/observe").expect("observe");
    assert_ne!(Some(observe), interface_fingerprint(UI_INPUT));
}
```

## The conformance suite

The suite is the JSON files in `vectors/`, in the format of the timeline's. Each
file holds the vectors for one check of one section, so any implementation can
run the same files. This test is x0k's binding. Each check decodes its input,
runs the crate's function, and writes the answer in the published words, which
the expectation is compared with.

The claims, stated so they can fail: **every vector holds on this crate, and
every file in `vectors/` is one the binding knows, so a file nobody runs fails
the suite.**

<a name="chunk-conformance"></a><sub>[`tests/conformance.rs`](../../crates/x0k-ui-protocol/tests/conformance.rs) · `#conformance`</sub>

```rust {#conformance file="tests/conformance.rs"}
//! The UI-control conformance vectors, run against this crate. See
//! `vectors/README.md` for the format.

use std::path::PathBuf;

use serde_json::{json, Value};
use x0k_datum::Datum;
use x0k_ui_protocol::act::{check_invoke, Grant, Invoke};
use x0k_ui_protocol::fixture::{check_present, merge_patch, PresentCall, ReleaseAnswer};
use x0k_ui_protocol::history::{
    check_history, check_history_offer, check_navigate, check_while_shown, History, HistoryCall,
    NavigateCall, Shown,
};
use x0k_ui_protocol::input::{check_delivers, check_perform, HeldFrame, Perform};
use x0k_ui_protocol::offer::SideEffect;
use x0k_ui_protocol::observe::{check_observation, while_cannot_paint, Observation, ObserveCall, StatePart};
use x0k_ui_protocol::offer::Offer;
use x0k_ui_protocol::replay::{check_replay_policy, disposition, Purpose};
use x0k_ui_protocol::shapes::operation_class;
use x0k_ui_protocol::Refused;

/// Whether `answer` holds everything `expect` names.
fn holds(expect: &Value, answer: &Value) -> bool {
    match (expect, answer) {
        (Value::Null, Value::Null) => true,
        (Value::Object(named), Value::Object(fields)) => named.iter().all(|(key, value)| {
            holds(value, fields.get(key).unwrap_or(&Value::Null))
        }),
        (Value::Array(wanted), Value::Array(got)) => {
            wanted.len() == got.len() && wanted.iter().zip(got).all(|(w, g)| holds(w, g))
        }
        (wanted, got) => wanted == got,
    }
}

fn field<T: serde::de::DeserializeOwned>(input: &Value, name: &str) -> T {
    serde_json::from_value(input[name].clone())
        .unwrap_or_else(|error| panic!("the vector's {name} does not decode: {error}"))
}

/// Every member of `value` as a JSON Pointer, sorted.
fn member_paths(value: &Value, prefix: &str) -> Vec<String> {
    let Value::Object(fields) = value else { return Vec::new() };
    let mut paths: Vec<String> = fields
        .iter()
        .flat_map(|(name, member)| {
            let path = format!("{prefix}/{name}");
            std::iter::once(path.clone()).chain(member_paths(member, &path))
        })
        .collect();
    paths.sort();
    paths
}

fn run(check: &str, input: &Value) -> Value {
    match check {
        "observation.fit" => {
            let call: ObserveCall = field(input, "call");
            let observation: Observation = field(input, "observation");
            match check_observation(&call, &observation) {
                Ok(()) => json!({"fits": true}),
                Err(fault) => json!({"fits": false, "fault": fault}),
            }
        }
        "act.check" => {
            let offer: Offer = field(input, "offer");
            let grant: Grant = field(input, "grant");
            let invoke: Invoke = field(input, "invoke");
            match check_invoke(&offer, &grant, &invoke) {
                Ok(action) => json!({"runs": action.name}),
                Err(refused) => json!({"refused": refused}),
            }
        }
        "input.check" => {
            let offer: Offer = field(input, "offer");
            let frames: Vec<HeldFrame> = field(input, "frames");
            let perform: Perform = field(input, "perform");
            match check_perform(&offer, &frames, &perform) {
                Ok(resolved) => json!({"resolved": resolved}),
                Err(refused) => json!({"refused": refused}),
            }
        }
        "input.delivers" => {
            let offer: Offer = field(input, "offer");
            let frames: Vec<HeldFrame> = field(input, "frames");
            let perform: Perform = field(input, "perform");
            let delivers: Vec<String> = field(input, "delivers");
            let delivers: Vec<&str> = delivers.iter().map(String::as_str).collect();
            match check_perform(&offer, &frames, &perform).and_then(|_| check_delivers(&perform, &delivers)) {
                Ok(()) => json!({"delivered": true}),
                Err(refused) => json!({"refused": refused}),
            }
        }
        "observe.while_cannot_paint" => {
            let call: ObserveCall = field(input, "call");
            let (asked, refused) = while_cannot_paint(&call, "the window is minimised");
            json!({"asks": asked.parts, "refused": refused})
        }
        "refusal.read" => match serde_json::from_value::<Refused>(input["refused"].clone()) {
            Ok(refused) => json!({"reads": true, "refused": refused}),
            Err(_) => json!({"reads": false}),
        },
        "fixture.release_read" => match serde_json::from_value::<ReleaseAnswer>(input["answer"].clone()) {
            Ok(answer) => json!({"reads": true, "answer": answer}),
            Err(_) => json!({"reads": false}),
        },
        "history.fit" => {
            let call: HistoryCall = field(input, "call");
            let history: History = field(input, "history");
            match check_history(&call, &history) {
                Ok(()) => json!({"fits": true}),
                Err(fault) => json!({"fits": false, "fault": fault}),
            }
        }
        "history.offer" => match check_history_offer(&field::<Offer>(input, "offer")) {
            Ok(()) => json!({"fits": true}),
            Err(fault) => json!({"fits": false, "fault": fault}),
        },
        "history.navigate" => {
            let offer: Offer = field(input, "offer");
            let call: NavigateCall = field(input, "navigate");
            match check_navigate(&offer, &call) {
                Ok(()) => json!({"reaches_app": true}),
                Err(answer) => json!({"answer": answer}),
            }
        }
        "history.while_shown" => {
            let shown: Shown = field(input, "shown");
            let class: Option<SideEffect> = field(input, "side_effect");
            match check_while_shown(&shown, class) {
                Ok(()) => json!({"runs": true}),
                Err(refused) => json!({"refused": refused}),
            }
        }
        "fixture.merge_patch" => {
            let result = merge_patch(&input["target"], &input["patch"]);
            json!({"paths": member_paths(&result, ""), "result": result})
        }
        "fixture.present" => {
            let offer: Offer = field(input, "offer");
            let live: Option<StatePart> = field(input, "live");
            let shape: Option<Value> = field(input, "shape");
            let call: PresentCall = field(input, "present");
            let shape = shape.map(|shape| Datum::from_json(&shape));
            match check_present(&offer, live.as_ref(), shape.as_ref(), &call) {
                Ok(state) => json!({"presents": state}),
                Err(refused) => json!({"refused": refused}),
            }
        }
        "offer.replay_policy" => match check_replay_policy(&field::<Offer>(input, "offer")) {
            Ok(()) => json!({"reads": true}),
            Err(refused) => json!({"refused": refused}),
        },
        "replay.disposition" => {
            let offer: Offer = field(input, "offer");
            let purpose: Purpose = field(input, "purpose");
            let class: SideEffect = field(input, "side_effect");
            let action: String = field(input, "action");
            json!({"taken": disposition(&offer, purpose, class, &action)})
        }
        "operation.class" => json!({"side_effect": operation_class(&field::<String>(input, "operation"))}),
        other => panic!("no binding for check {other}: a file nobody runs fails the suite"),
    }
}

#[test]
fn every_vector_holds() {
    let root = std::env::var_os("CARGO_MANIFEST_DIR").expect("cargo sets the manifest directory");
    let dir = PathBuf::from(root).join("vectors");
    let mut ran = 0;
    let mut failed = Vec::new();
    for entry in std::fs::read_dir(&dir).expect("the vectors directory") {
        let path = entry.expect("a directory entry").path();
        if path.extension().is_none_or(|extension| extension != "json") {
            continue;
        }
        let name = path.file_name().expect("a file name").to_string_lossy().into_owned();
        let text = std::fs::read_to_string(&path).expect("a vector file");
        let file: Value = serde_json::from_str(&text).expect("vector JSON");
        let check = file["check"].as_str().expect("a check");
        for vector in file["vectors"].as_array().expect("vectors") {
            let answer = run(check, &vector["input"]);
            ran += 1;
            if !holds(&vector["expect"], &answer) {
                failed.push(format!("{name}: {}: got {answer}", vector["name"]));
            }
        }
    }
    assert!(ran > 0, "no vectors ran");
    assert!(failed.is_empty(), "{}", failed.join("\n"));
}

/// The comparison can fail, so a vector cannot hold whatever the code does.
#[test]
fn an_expectation_names_what_it_holds_and_nothing_else_passes() {
    assert!(holds(&json!({"a": 1}), &json!({"a": 1, "b": 2})));
    assert!(!holds(&json!({"a": 2}), &json!({"a": 1})));
    assert!(!holds(&json!({"c": 1}), &json!({"a": 1})));
    assert!(!holds(&json!([1]), &json!([1, 2])));
    assert!(holds(&json!({"a": null}), &json!({})));
}
```
