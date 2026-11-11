
# The conformance suite, over the endpoint

```turtle folio:document
implementation:ui-control\/conformance a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "The UI-control suite as a program: pointed at an app's socket, it holds the app to ui-control-channel §8 to §10 and ui-interfaces §2 to §5 over the endpoint alone, so any app in any language runs it against itself." ;
    x0k:concerns "ui-control", "conformance", "publication" ;
    x0k:cites implementation:ui-control\/endpoint,
        implementation:ui-control\/protocol,
        implementation:ui-control\/shell-endpoint ;
    x0k:implements architecture:ui-control-channel,
        architecture:ui-interfaces ;
    x0k:motivatedBy intent:e458d951-a096-9a0a-200a-78174f45e9c5,
        intent:db076735-67f6-9b32-f498-7d08155162c4 ;
    folio:tangleCrate "crates/x0k-ui-endpoint" ;
    folio:tangleRoot "src/conformance.rs" .
```

The vectors under `x0k-ui-protocol/vectors` hold the checks made on values. They
say nothing about an app, because each brings its own offer and frames. This
suite holds an app: it talks to one over the endpoint and knows nothing else of
it, so x0k's shell and an app in another language are held to the same claims.

```console
ui-conformance /run/user/1000/x0k/main/ui-control/x0k-ui.shell.endpoint
```

It reports each claim as held, broken, or unreachable, and exits non-zero when one
is broken. An unreachable claim is one this app gives the suite no way to test,
such as observing state in an app with none. It is reported, so it cannot pass for
a claim that held.

`tools/ui-conformance-shell` holds x0k's own shell to it in one command: a
headless shell and a timeline writer on a scratch home with no daemon, the suite
against the shell's endpoint with the timeline as the trace witness, then both
stopped by PID. `--app chat` holds the chat app the same way, and
`--ready-within <seconds>` bounds how long the app has to bind its endpoint, so a
start that waits on a daemon fails the run. Its `--self-test` runs with no
timeline, and holds only when the trace claim alone is broken. It exits 1 when
the app was judged and failed, and 2 when it could not judge the app: a build
missing, the timeline writer not starting, or no lavapipe to render with. The
post-land full run holds the shell and the chat app this way every night, one
step each: a broken claim is a red step that names it, and exit 2 is a step
that could not run, never the app's red.

## The frame bound

The suite holds one claim outside `run`, because it needs a connection of its own:
a peer that sends an oversized frame costs that connection and not the app. The
frame's length is all it sends, so an app that buffers before it checks is caught
by waiting forever rather than by running out of memory.

## What it holds

**The trace.** A call may carry its caller's W3C `traceparent`, and the work the
app does in answer joins that trace (§7). The suite mints a trace of its own and
asks one offer in it. That the call is answered is seen on the wire. Where the
app's work went is not: it reaches a timeline, so whoever runs the suite names a
witness that says whether the app's work joined the trace. With no witness the
claim is unreachable, never held.

**The offer.** The app answers `ui/observe`, names each action once, every
action's argument shape reads, and each interface the protocol names carries that
interface's fingerprint from `x0k-ui-protocol`.

**`ui/observe`.** Each set of parts is asked for and held by `check_observation`,
the function the observe vectors hold. A capture must be a PNG of the size it
says, which is what ties the layout's coordinates to the image. A smaller scale is
answered smaller or refused by name, and so is a region. Either way a layout read
beside it stays in the capture's own pixels.

Observing changes nothing. The state head is read around a run of observations.
An app can move its own head for its own reasons, so a change alone proves
nothing, and the suite tries a few times: only a head that moves across every
attempt is broken. A node keeps its id from frame to frame, tried the same way,
because an app's tree can change for reasons of its own too.

**An app reached by JSON lines.** An app with no session of its own, such as a
web page whose host evaluates script in it, is held to every claim above over
the client's JSON-lines link (`x0k:implementation/ui-control/endpoint`, "A
driver's end"). The claims are the same code; only the link differs.

**`ui/act`.** An action no offer lists is refused. The other refusals are drawn
from the offer: an action whose shape turns away a bare number is sent one, and a
read-only action is run, since running it may change nothing. A caller can name
one more action, with arguments, for an app whose useful action is not read-only.
Whether a grant refuses outside its classes needs a grant the suite does not hold,
so `outside_grant` stays with the vectors and the endpoint's own test.

**What a frame shows.** Every observation names what its frame shows
(`x0k:architecture/ui-interfaces` §3), and `check_observation` holds that, so it
is part of every observation claim above. An app that offers no `ui/history`
must say `live`, and a history call to it is refused by name.

**`ui/history`.** The offer says which positions the app holds exactly when it
names `ui/history` (§5), and names the same oldest and newest positions a
`history` call answers. A history answer is held by `check_history`, the function
the history vectors hold: once asked for three positions with their states, and
once for one. The suite then goes back to the position before the newest and
holds §2 there:

- the navigation shows that position and names a frame, when the app presents
  frames;
- an observation names that position;
- input is refused as `showing_past`, naming the position, and so is the
  caller's action when it acts above `read_only`;
- a `read_only` action still runs;
- a navigation to `live` shows the live state again;
- navigating performs nothing: the newest position the app holds is where it
  was before the trip. An app can record a change of its own while the suite
  goes back, so the trip is tried a few times, as observing is.

A position past the newest is refused by name. A position below the oldest is
answered `unavailable`, naming the oldest the app holds; an app that still holds
its first position gives the suite no position to try. The suite always leaves
the app live.

**What the offer says of its effects.** Every grade a history answer gives a
position is one the offer lists (`ui-interfaces` §5). The offer's replay policy
is held by `check_replay_policy`, the function the replay-policy vectors hold: it
lowers no floor of `graded-introspection` §9, and every `sandboxed` disposition
names a sandbox the offer declares.

**State fixtures.** An app whose offer does not say it takes fixtures refuses
`present` by name (§4). One that takes them is held to §4 with the live state an
observation reads, and its fingerprint and head:

- a fixture with another shape's fingerprint is refused, naming it;
- a fixture naming a head the live state is not at is refused, naming the
  current head;
- a state that does not fit the shape is refused as `misfit_state`; the suite
  gives a bare text, so an app whose state shape takes any value gives it no
  misfit to try;
- after those refusals the app still shows its live state;
- presenting the live state, as an empty patch at its head, shows the fixture
  and names a frame, and an observation names the fixture;
- input reaches the app, and a `read_only` action runs;
- the caller's action, when it acts above `read_only`, takes the disposition the
  offer's policy gives it, and a `non_idempotent` one is never performed;
- a second `present` replaces the first, under a handle of its own, so the
  first no longer stands;
- releasing shows the live state, and releasing again answers that the fixture
  does not stand;
- presenting and releasing leaves the live head the offer names where it was,
  tried a few times as observing is.

The trip presents with no head, so an app whose head moves for its own reasons
is still presented to; the head is held by its own refusal. An offer whose
replay policy cannot be read has every action refused under a fixture, so the
action claims are then unreachable and the policy claim is the broken one.

A session's end releases the fixture it presented. Like the return to live, it
needs a session of its own, so it runs outside `run`.

A session's end returns the app to live, and that needs a session of its own to
end, so it runs outside `run`, as the frame bound does. A second session goes
back and closes, and the suite's own session then waits for the app to say
`live`. Nothing in the protocol tells the suite when the app has heard the end,
so it waits a bounded time.

**`ui/input`.** Every refusing input vector runs against the app. A vector brings
its own frames, so it is retargeted: a frame it holds becomes the app's live
frame, positions scale with the frame so that a position outside stays outside,
and a frame it does not hold becomes a name no app holds. Nothing here clicks. The
one sequence that should run is a pointer move to a layout node, which must name
a frame.

Three claims hold how the app's host shows input (`ui-control-channel` §8 and
§10). A capture asked for as the frame alone carries none of the host's drawing
of driver input. A sequence that asks for a takeover the offer does not say the
host holds is refused as `takeover_unheld`; one the offer says it holds needs a
person to grant it, so the suite cannot reach it. And a host whose offer says it
draws input keeps the watchable pace: a click at that pace answers no sooner
than `WATCHABLE_PRESS_MS` after it was sent. A host that draws nothing cannot
show a pace, so for it that claim is unreachable.

**A window the host cannot paint, and kinds it cannot deliver.** The suite
asks for a capture first. When the capture is refused as `cannot_paint`, the
app says its host cannot paint its window now (§8), and the
suite holds three claims of it:

- an observation of every part refuses the capture as `cannot_paint` and no
  other part, and answers the layout;
- an action is refused as `cannot_paint` within `CANNOT_PAINT_WITHIN`, one
  second, far under the wait a driver gives a frame; the action is the
  offer's first read-only action that takes no arguments, else the caller's;
- input, a pointer's pause, is refused as `cannot_paint` within the same bound.

Act, input, history and fixtures then need a host that paints, so the suite
reports them as one unreachable claim naming the reason, and stops. An app
whose host paints gives the suite no way to test the three claims, and
they are reported unreachable. A host that paints a covered window answers
the capture, so the suite holds every other claim of it.

Every source kind the model has is sent as a one-step pause. Each must be
delivered, or refused as `undeliverable_source` naming its kind, or as
`cannot_paint`; never as `unknown_source`, which is for a kind the model does
not have (§10).

**What an app declines.** An app may decline a `present`, and an action or
input under a fixture, for now, with its reason (`ui-interfaces` §4). The
suite cannot make an app decline, and a decline is not a broken promise, so a
claim whose call is declined is reported unreachable with the app's reason.

**A fixture the app ends.** An app may end the suite's fixture itself, with
its reason, such as when an approval arrives for a person (`ui-interfaces`
§4). The suite cannot make an app do so, so these claims are reached only when
the app does. The call that meets the ended fixture is reported unreachable
with the app's reason, and the suite then holds three claims: that call was
refused as `fixture_ended` naming the suite's fixture, the app shows its live
state, and releasing the fixture answers `ended` with the same reason. The
rest of the trip needs a fixture that stands, so it is one unreachable claim.

## Where it stops

The suite does not see whether a refused call reached the app, only that it was
answered as refused. A hand-written app could run the call and answer a refusal.
`x0k-ui-endpoint` makes that impossible for an app built on it, and its own test
holds that.

A witness is the runner's word for where the app's work went, and the suite trusts
it. Its own test holds the claim with a witness that reads the app's spans in
process, red on an app that forgets the trace.

Navigating performs nothing in the world, and the suite cannot see the world.
It sees the app's own history and the answers it gives, so "performs nothing" is
held where it shows through the endpoint: no new position, no input or actuating
action run. Under a fixture the same holds of a stand-in: the suite sees that an
action was answered as simulated, not that the app ran nothing. An app built on
`x0k-ui-endpoint` never hears a simulated action, and the endpoint's own test
holds that.

§4's refusals are the endpoint's, made before the app hears the call, so an app
built on it cannot break them. `YesToEverything` presents anything and breaks the
fingerprint and head refusals. The misfit claim needs a state the app's shape
refuses, and the suite knows no shape, so a bare text is its only try. That
claim and "a refused fixture shows nothing" have no app here that breaks them;
the present vectors hold the misfit check itself. The fixture the suite presents
is the live state, so the suite holds that a fixture is shown and named, not that
a different state reaches the screen.

<a name="chunk-suite"></a><sub>[`src/conformance.rs`](../../crates/x0k-ui-endpoint/src/conformance.rs) · `#suite` · assembles [at-a-past-position](#chunk-at-a-past-position) · [under-a-fixture](#chunk-under-a-fixture) · [driving-under-a-fixture](#chunk-driving-under-a-fixture)</sub>

```rust {#suite file="src/conformance.rs"}
//! The UI-control suite, over the endpoint alone (`ui-control-channel` §8 to §10).

use std::collections::BTreeSet;
use std::hash::{BuildHasher, Hasher};
use std::path::Path;
use std::sync::Arc;

use serde::Deserialize;
use serde_json::{json, Value};
use tokio::io::AsyncWriteExt;
use tokio::net::UnixStream;
use x0k_ui_protocol::act::{check_invoke, Grant, Invoke};
use x0k_ui_protocol::fixture::{Fixture, PresentAnswer, PresentCall, ReleaseAnswer, ReleaseCall};
use x0k_ui_protocol::history::{
    check_history, check_history_offer, Destination, History, HistoryAnswer, HistoryCall, NavigateAnswer,
    NavigateCall, Shown,
};
use x0k_ui_protocol::input::{HeldFrame, Pace, Perform, Source, Step, Target, SOURCE_KINDS, WATCHABLE_PRESS_MS};
use x0k_ui_protocol::observe::{check_observation, LayoutNode, Observation, ObserveCall, Part, Region, StatePart};
use x0k_ui_protocol::offer::{Offer, SideEffect, UI_ACT, UI_HISTORY, UI_INPUT, UI_OBSERVE};
use x0k_ui_protocol::replay::{check_replay_policy, disposition, Purpose, ReplayDisposition};
use x0k_ui_protocol::shapes::interface_fingerprint;
use x0k_ui_protocol::{Refused, RefusalCode, INPUT_VECTORS};

use crate::client::{ClientFault, UiClient};
use crate::{InvokeAnswer, PerformAnswer};

/// An action no app offers.
const NO_SUCH_ACTION: &str = "ui-conformance.no-such-action";
/// How many runs of observations a head may move across before it is broken.
const QUIET_ATTEMPTS: usize = 4;
/// How far past its newest position the suite looks for one the app never had.
const NEVER_HAD: u64 = 1_000_000;
/// How long a closed session's app has to return to its live state.
const SESSION_END_WAIT: std::time::Duration = std::time::Duration::from_secs(5);
/// What `ui-interfaces` decides, beside `ui-control-channel`'s bare sections.
const UI_INTERFACES_2: &str = "ui-interfaces §2";
const UI_INTERFACES_3: &str = "ui-interfaces §3";
const UI_INTERFACES_4: &str = "ui-interfaces §4";
const UI_INTERFACES_5: &str = "ui-interfaces §5";
/// A fingerprint no app's state shape has.
const NO_SUCH_SHAPE: &str = "ui-conformance.no-such-shape";
/// A head no app's live state is at.
const NO_SUCH_HEAD: &str = "ui-conformance.no-such-head";
/// A state no app's shape is likely to take.
const NOT_A_STATE: &str = "ui-conformance: not a state";
/// How soon an app whose host cannot paint its window refuses an action or input.
pub const CANNOT_PAINT_WITHIN: std::time::Duration = std::time::Duration::from_secs(1);
const CANNOT_PAINT_OBSERVED: &str = "while the host cannot paint the window, an observation refuses only the capture, as cannot_paint";
const CANNOT_PAINT_ACTED: &str = "while the host cannot paint the window, an action is refused as cannot_paint within a second";
const CANNOT_PAINT_INPUT: &str = "while the host cannot paint the window, input is refused as cannot_paint within a second";

/// What became of one claim.
#[derive(Clone, Debug, PartialEq)]
pub enum Verdict {
    Holds,
    /// The app breaks the claim, and how.
    Broken(String),
    /// The app gives the suite no way to test the claim, and why.
    Unreachable(String),
}

/// One claim, as run.
#[derive(Clone, Debug, PartialEq)]
pub struct Case {
    /// The section it holds to: a bare number is one of `ui-control-channel`.
    pub clause: &'static str,
    pub claim: String,
    pub verdict: Verdict,
}

/// What a run found.
#[derive(Clone, Debug, PartialEq)]
pub struct Report {
    pub app: String,
    pub cases: Vec<Case>,
}

impl Report {
    /// The claims the app breaks.
    pub fn broken(&self) -> Vec<&Case> {
        self.cases.iter().filter(|case| matches!(case.verdict, Verdict::Broken(_))).collect()
    }
}

/// Whether the work an app did in answer to a call joined the trace that the
/// call's `traceparent` names. It is given that `traceparent`.
pub type TraceWitness = Arc<dyn Fn(&str) -> bool + Send + Sync>;

/// What a caller adds to a run.
#[derive(Clone, Default)]
pub struct Options {
    /// One more action to run, which should answer done and name a frame.
    pub act: Option<Invoke>,
    /// Where the app's work in a caller's trace can be seen.
    pub trace: Option<TraceWitness>,
}

#[derive(Deserialize)]
struct InputVectors {
    vectors: Vec<InputVector>,
}

#[derive(Deserialize)]
struct InputVector {
    name: String,
    input: InputCase,
    expect: Expected,
}

#[derive(Deserialize)]
struct InputCase {
    offer: Offer,
    #[serde(default)]
    frames: Vec<HeldFrame>,
    perform: Perform,
}

#[derive(Deserialize)]
struct Expected {
    #[serde(default)]
    refused: Option<ExpectedRefusal>,
}

#[derive(Deserialize)]
struct ExpectedRefusal {
    code: RefusalCode,
    #[serde(default)]
    subject: Option<String>,
}

/// The frame the app presents now, as input may name it.
struct LiveFrame {
    name: String,
    width: u32,
    height: u32,
    layout: Option<LayoutNode>,
}

/// Run the suite against the app on the far end of `client`.
pub async fn run(client: &UiClient, options: &Options) -> Result<Report, ClientFault> {
    let offer = client.offer().await?;
    let mut suite = Suite { client, cases: Vec::new() };
    suite.the_offer(&offer);
    suite.tracing(options).await;
    suite.observing(&offer).await;
    suite.source_kinds(&offer).await;
    if let Some(why) = suite.cannot_paint().await {
        suite.while_cannot_paint(&offer, options).await;
        let claim = "the app acts, takes input, goes back and shows fixtures while its host paints";
        let why = format!("the host cannot paint the window: {why}");
        suite.record("§8", claim, Verdict::Unreachable(why));
        return Ok(Report { app: offer.app, cases: suite.cases });
    }
    for (clause, claim) in [("§8", CANNOT_PAINT_OBSERVED), ("§9", CANNOT_PAINT_ACTED), ("§10", CANNOT_PAINT_INPUT)] {
        let why = "the host paints: its capture is not refused as cannot_paint".to_string();
        suite.record(clause, claim, Verdict::Unreachable(why));
    }
    if offer.answers(UI_ACT) {
        suite.acting(&offer, options).await;
    }
    suite.input(&offer).await;
    suite.going_back(&offer, options).await;
    suite.its_replay_policy(&offer);
    suite.fixtures(&offer, options).await;
    Ok(Report { app: offer.app, cases: suite.cases })
}

struct Suite<'c> {
    client: &'c UiClient,
    cases: Vec<Case>,
}

impl Suite<'_> {
    fn record(&mut self, clause: &'static str, claim: impl Into<String>, verdict: Verdict) {
        self.cases.push(Case { clause, claim: claim.into(), verdict });
    }

    fn check(&mut self, clause: &'static str, claim: &str, broken: Option<String>) {
        self.record(clause, claim, broken.map_or(Verdict::Holds, Verdict::Broken));
    }

    fn the_offer(&mut self, offer: &Offer) {
        let answers = offer.answers(UI_OBSERVE);
        let broken = (!answers).then(|| "the offer does not name ui/observe".to_string());
        self.check("§8", "the offer names ui/observe", broken);

        let other = offer.interfaces.iter().find(|interface| {
            interface_fingerprint(&interface.name).is_some_and(|expected| expected != interface.fingerprint)
        });
        let broken = other.map(|interface| format!("{} carries {}", interface.name, interface.fingerprint));
        self.check("§7", "each interface carries its operations' fingerprint", broken);

        let mut names = BTreeSet::new();
        let twice = offer.actions.iter().find(|action| !names.insert(action.name.as_str()));
        let broken = twice.map(|action| format!("{} is listed twice", action.name));
        self.check("§8", "the offer names each action once", broken);

        let unreadable = offer.actions.iter().find(|action| {
            let invoke = Invoke { action: action.name.clone(), args: Value::Null };
            matches!(
                check_invoke(offer, &every_class(), &invoke),
                Err(Refused { code: RefusalCode::UnreadableShape, .. })
            )
        });
        let broken = unreadable.map(|action| format!("{}'s shape does not read", action.name));
        self.check("§9", "every action's argument shape reads", broken);
    }

    async fn tracing(&mut self, options: &Options) {
        let traceparent = fresh_traceparent();
        let broken = self.client.offer_in(&traceparent).await.err().map(|fault| fault.to_string());
        let answered = broken.is_none();
        self.check("§7", "a call carrying the caller's traceparent is answered", broken);

        let claim = "the app's work in answer to a call joins the caller's trace";
        let verdict = match (&options.trace, answered) {
            (None, _) => {
                Verdict::Unreachable("the app's work reaches a timeline, and no witness is named".to_string())
            }
            (Some(_), false) => Verdict::Unreachable("the traced call had no answer".to_string()),
            (Some(witness), true) => {
                let (witness, asked) = (Arc::clone(witness), traceparent.clone());
                match tokio::task::spawn_blocking(move || witness(&asked)).await {
                    Ok(true) => Verdict::Holds,
                    Ok(false) => {
                        Verdict::Broken(format!("the witness saw no work of the app's in {traceparent}"))
                    }
                    Err(error) => Verdict::Broken(format!("the witness failed: {error}")),
                }
            }
        };
        self.record("§7", claim, verdict);
    }

    async fn observing(&mut self, offer: &Offer) {
        let every = [Part::Capture, Part::Layout, Part::State];
        let sets: [&[Part]; 5] = [
            &[Part::Capture],
            &[Part::Layout],
            &[Part::State],
            &[Part::Capture, Part::Layout],
            &every,
        ];
        for parts in sets {
            let claim = format!("an observation of {parts:?} answers its call");
            let call = ObserveCall { parts: parts.to_vec(), region: None, scale: None, frame_only: false };
            let broken = self.answers_its_call(&call).await;
            self.check("§8", &claim, broken);
        }
        self.a_node_keeps_its_id().await;
        self.a_smaller_scale().await;
        self.a_region().await;
        let parts = vec![Part::Capture, Part::Layout];
        let call = ObserveCall { parts, region: None, scale: Some(0.5), frame_only: false };
        let broken = self.answers_its_call(&call).await;
        self.check("§8", "a scaled observation answers its call", broken);
        self.observing_changes_nothing(offer).await;
    }

    /// How an observation of `call` breaks §8, if it does.
    async fn answers_its_call(&self, call: &ObserveCall) -> Option<String> {
        match self.client.observe(call).await {
            Ok(observation) => observation_breaks(call, &observation),
            Err(fault) => Some(fault.to_string()),
        }
    }

    /// The ids of a frame's nodes.
    async fn node_ids(&self) -> Option<BTreeSet<String>> {
        let call = ObserveCall { parts: vec![Part::Layout], region: None, scale: None, frame_only: false };
        let observation = self.client.observe(&call).await.ok()?;
        Some(node_ids(&observation.layout?))
    }

    async fn a_node_keeps_its_id(&mut self) {
        let mut differed = None;
        for _ in 0..QUIET_ATTEMPTS {
            let (Some(before), Some(after)) = (self.node_ids().await, self.node_ids().await) else {
                let why = "the app answers no layout".to_string();
                return self.record("§8", A_NODE_KEEPS_ITS_ID, Verdict::Unreachable(why));
            };
            differed = ids_moved(&before, &after);
            if differed.is_none() {
                break;
            }
        }
        self.check("§8", A_NODE_KEEPS_ITS_ID, differed);
    }

    async fn a_smaller_scale(&mut self) {
        let claim = "a smaller scale is answered smaller or refused by name";
        let whole = ObserveCall { parts: vec![Part::Capture], region: None, scale: None, frame_only: false };
        let halved = ObserveCall { scale: Some(0.5), ..whole.clone() };
        let (whole, halved) = (self.client.observe(&whole).await, self.client.observe(&halved).await);
        let broken = match (whole, halved) {
            (Err(fault), _) | (_, Err(fault)) => Some(fault.to_string()),
            (Ok(whole), Ok(halved)) => match (whole.capture, halved.capture) {
                (Some(whole), Some(halved)) if halved.width >= whole.width => {
                    Some(format!("{} wide at half scale, of {}", halved.width, whole.width))
                }
                (_, None) if halved.refused.is_empty() => Some("no capture and no refusal".to_string()),
                _ => None,
            },
        };
        self.check("§8", claim, broken);
    }

    async fn a_region(&mut self) {
        let claim = "a region is answered at its size or refused by name";
        let whole = ObserveCall { parts: vec![Part::Capture], region: None, scale: None, frame_only: false };
        let Ok(Observation { capture: Some(frame), .. }) = self.client.observe(&whole).await else {
            let why = "the app answered no whole capture".to_string();
            return self.record("§8", claim, Verdict::Unreachable(why));
        };
        let (width, height) = ((frame.width / 2).max(1), (frame.height / 2).max(1));
        let region = Region { x: 0, y: 0, width, height };
        let call = ObserveCall { region: Some(region), ..whole };
        let broken = match self.client.observe(&call).await {
            Ok(Observation { capture: Some(capture), .. }) => {
                let answered = (capture.width, capture.height);
                (answered != (width, height)).then(|| format!("{answered:?} for {region:?}"))
            }
            Ok(observation) if observation.refused.is_empty() => Some("no capture and no refusal".to_string()),
            Ok(_) => None,
            Err(fault) => Some(fault.to_string()),
        };
        self.check("§8", claim, broken);
    }

    async fn observing_changes_nothing(&mut self, offer: &Offer) {
        let claim = "observing changes nothing";
        if offer.state_head.is_none() {
            let why = "the offer has no state head".to_string();
            return self.record("§8", claim, Verdict::Unreachable(why));
        }
        let every = vec![Part::Capture, Part::Layout, Part::State];
        let call = ObserveCall { parts: every, region: None, scale: None, frame_only: false };
        let mut moved = None;
        for _ in 0..QUIET_ATTEMPTS {
            let before = self.client.offer().await.map(|offer| offer.state_head);
            for _ in 0..3 {
                if let Err(fault) = self.client.observe(&call).await {
                    return self.record("§8", claim, Verdict::Broken(fault.to_string()));
                }
            }
            let after = self.client.offer().await.map(|offer| offer.state_head);
            match (before, after) {
                (Ok(before), Ok(after)) if before == after => {
                    return self.record("§8", claim, Verdict::Holds);
                }
                (Ok(before), Ok(after)) => moved = Some(format!("{before:?} became {after:?}")),
                (Err(fault), _) | (_, Err(fault)) => moved = Some(fault.to_string()),
            }
        }
        self.check("§8", claim, moved);
    }

    /// Why the app refuses its capture as one its host cannot paint, when it does.
    async fn cannot_paint(&self) -> Option<String> {
        let call = ObserveCall { parts: vec![Part::Capture], region: None, scale: None, frame_only: false };
        let observation = self.client.observe(&call).await.ok()?;
        let refused = observation.refused.into_iter().find(|refused| refused.part == Part::Capture)?;
        (refused.code == Some(RefusalCode::CannotPaint)).then_some(refused.why)
    }

    /// The claims of an app whose host cannot paint its window (§8 to §10).
    async fn while_cannot_paint(&mut self, offer: &Offer, options: &Options) {
        let call = ObserveCall { parts: vec![Part::Capture, Part::Layout, Part::State], region: None, scale: None, frame_only: false };
        let broken = match self.client.observe(&call).await {
            Ok(observation) => cannot_paint_breaks(&call, &observation),
            Err(fault) => Some(fault.to_string()),
        };
        self.check("§8", CANNOT_PAINT_OBSERVED, broken);

        let reading = offer.actions.iter().filter(|action| action.side_effect == SideEffect::ReadOnly);
        let reading = reading.map(|action| Invoke { action: action.name.clone(), args: Value::Null });
        let invoke = reading.into_iter().chain(options.act.clone()).find(|invoke| check_invoke(offer, &every_class(), invoke).is_ok());
        match invoke {
            Some(invoke) if offer.answers(UI_ACT) => {
                let started = std::time::Instant::now();
                let answer = self.client.invoke(&invoke).await;
                let refused = match answer {
                    Ok(InvokeAnswer::Refused(refused)) => Ok(refused),
                    Ok(other) => Err(Some(format!("{} was answered {other:?}", invoke.action))),
                    Err(fault) => Err(Some(fault.to_string())),
                };
                self.check("§9", CANNOT_PAINT_ACTED, refused_at_once(refused, started.elapsed()));
            }
            _ => {
                let why = "the app offers no action the suite may send".to_string();
                self.record("§9", CANNOT_PAINT_ACTED, Verdict::Unreachable(why));
            }
        }

        if !offer.answers(UI_INPUT) {
            let why = "the offer does not name ui/input".to_string();
            return self.record("§10", CANNOT_PAINT_INPUT, Verdict::Unreachable(why));
        }
        let pause = Source { id: "pointer".to_string(), kind: "mouse".to_string(), steps: vec![Step::Pause { ms: 1 }] };
        let started = std::time::Instant::now();
        let refused = match self.client.perform(&Perform::of(vec![pause])).await {
            Ok(PerformAnswer::Refused(refused)) => Ok(refused),
            Ok(other) => Err(Some(format!("the sequence was answered {other:?}"))),
            Err(fault) => Err(Some(fault.to_string())),
        };
        self.check("§10", CANNOT_PAINT_INPUT, refused_at_once(refused, started.elapsed()));
    }

    /// Every kind the model has is delivered, or refused as one the host
    /// cannot deliver, and never as one the model does not have (§10).
    async fn source_kinds(&mut self, offer: &Offer) {
        let claim = "a source kind the model has is delivered or refused as undeliverable_source naming it, never as unknown_source";
        if !offer.answers(UI_INPUT) {
            return self.record("§10", claim, Verdict::Unreachable("the offer does not name ui/input".to_string()));
        }
        let mut broken = None;
        for kind in SOURCE_KINDS {
            let pause = Source { id: "source".to_string(), kind: kind.to_string(), steps: vec![Step::Pause { ms: 1 }] };
            broken = match self.client.perform(&Perform::of(vec![pause])).await {
                Ok(PerformAnswer::Done { .. }) => None,
                Ok(PerformAnswer::Refused(refused))
                    if refused.code == RefusalCode::CannotPaint
                        || (refused.code == RefusalCode::UndeliverableSource && refused.subject.as_deref() == Some(kind)) =>
                {
                    None
                }
                Ok(other) => Some(format!("a {kind} was answered {other:?}")),
                Err(fault) => Some(fault.to_string()),
            };
            if broken.is_some() {
                break;
            }
        }
        self.check("§10", claim, broken);
    }

    async fn acting(&mut self, offer: &Offer, options: &Options) {
        let unknown = Invoke { action: NO_SUCH_ACTION.to_string(), args: Value::Null };
        let broken = self.refused(&unknown, RefusalCode::UnknownAction).await;
        self.check("§9", "an action the offer does not list is refused", broken);

        let claim = "arguments that misfit the action's shape are refused";
        let misfit = offer.actions.iter().map(|action| Invoke {
            action: action.name.clone(),
            args: json!(12345),
        });
        let misfit = misfit.into_iter().find(|invoke| {
            matches!(
                check_invoke(offer, &every_class(), invoke),
                Err(Refused { code: RefusalCode::MisfitArguments, .. })
            )
        });
        match misfit {
            Some(invoke) => {
                let broken = self.refused(&invoke, RefusalCode::MisfitArguments).await;
                self.check("§9", claim, broken);
            }
            None => {
                let why = "every action's shape takes a bare number".to_string();
                self.record("§9", claim, Verdict::Unreachable(why));
            }
        }

        let claim = "a read-only action runs and answers its outcome";
        let reading = offer.actions.iter().filter(|action| action.side_effect == SideEffect::ReadOnly);
        let reading = reading.map(|action| Invoke { action: action.name.clone(), args: Value::Null });
        match reading.into_iter().find(|invoke| check_invoke(offer, &every_class(), invoke).is_ok()) {
            Some(invoke) => {
                let broken = match self.client.invoke(&invoke).await {
                    Ok(InvokeAnswer::Refused(refused)) => {
                        Some(format!("{} was refused: {}", invoke.action, refused.why))
                    }
                    Ok(_) => None,
                    Err(fault) => Some(fault.to_string()),
                };
                self.check("§9", claim, broken);
            }
            None => {
                let why = "no read-only action takes no arguments".to_string();
                self.record("§9", claim, Verdict::Unreachable(why));
            }
        }

        if let Some(invoke) = &options.act {
            let claim = format!("{} runs and names the frame after it", invoke.action);
            let broken = match self.client.invoke(invoke).await {
                Ok(InvokeAnswer::Done { frame: Some(_), .. }) => None,
                Ok(other) => Some(format!("{other:?}")),
                Err(fault) => Some(fault.to_string()),
            };
            self.check("§9", &claim, broken);
        }
    }

    /// How the answer to `invoke` is not a refusal for `code`, if it is not.
    async fn refused(&self, invoke: &Invoke, code: RefusalCode) -> Option<String> {
        match self.client.invoke(invoke).await {
            Ok(InvokeAnswer::Refused(refused)) if refused.code == code => None,
            Ok(other) => Some(format!("asked for {code:?}, answered {other:?}")),
            Err(fault) => Some(fault.to_string()),
        }
    }

    async fn input(&mut self, offer: &Offer) {
        let answers_input = offer.answers(UI_INPUT);
        let vectors: InputVectors = match serde_json::from_str(INPUT_VECTORS) {
            Ok(vectors) => vectors,
            Err(error) => {
                return self.record("§10", "the input vectors read", Verdict::Broken(error.to_string()));
            }
        };
        if !answers_input {
            let perform = Perform::of(Vec::new());
            let expected = (RefusalCode::NoInputInterface, Some(UI_INPUT.to_string()));
            let broken = self.refused_input(&perform, &expected).await;
            return self.check("§10", "input to an app whose offer does not name ui/input is refused", broken);
        }
        let Some(live) = self.live_frame().await else {
            let why = "the app presents no frame".to_string();
            return self.record("§10", "input is checked against a frame", Verdict::Unreachable(why));
        };
        for vector in &vectors.vectors {
            let Some(refused) = &vector.expect.refused else { continue };
            if !vector.input.offer.answers(UI_INPUT) {
                continue;
            }
            let perform = retargeted(&vector.input, &live);
            let subject = refused.subject.as_deref().map(|subject| {
                if frames_named(&vector.input.perform).contains(&subject) {
                    live_name(&vector.input, subject, &live)
                } else {
                    subject.to_string()
                }
            });
            let broken = self.refused_input(&perform, &(refused.code, subject)).await;
            self.check("§10", &vector.name, broken);
        }
        self.a_move_to_a_node(&live).await;
        self.the_frame_alone().await;
        self.an_unheld_takeover(offer).await;
        self.the_watchable_pace(offer, &live).await;
    }

    async fn the_frame_alone(&mut self) {
        let claim = "a capture asked for as the frame alone carries no drawing of driver input";
        let call = ObserveCall { parts: vec![Part::Capture], region: None, scale: None, frame_only: true };
        let broken = match self.client.observe(&call).await {
            Ok(observation) => match observation.capture {
                Some(capture) if capture.presented => Some("the capture says it carries the drawing".to_string()),
                Some(_) => None,
                None => return self.record("§8", claim, Verdict::Unreachable("the app gave no capture".to_string())),
            },
            Err(fault) => Some(fault.to_string()),
        };
        self.check("§8", claim, broken);
    }

    async fn an_unheld_takeover(&mut self, offer: &Offer) {
        let claim = "a takeover the offer does not say the app holds is refused before any of the sequence runs";
        if offer.input.is_some_and(|input| input.takeover) {
            let why = "the offer says the app holds a takeover, and only a person can grant one".to_string();
            return self.record("§10", claim, Verdict::Unreachable(why));
        }
        let pause = Source { id: "keys".to_string(), kind: "key".to_string(), steps: vec![Step::Pause { ms: 1 }] };
        let perform = Perform { takeover: true, ..Perform::of(vec![pause]) };
        let broken = self.refused_input(&perform, &(RefusalCode::TakeoverUnheld, Some(UI_INPUT.to_string()))).await;
        self.check("§10", claim, broken);
    }

    async fn the_watchable_pace(&mut self, offer: &Offer, live: &LiveFrame) {
        let claim = "a click at the watchable pace answers no sooner than its floor";
        if !offer.input.is_some_and(|input| input.presents) {
            let why = "the offer does not say the app's host draws input".to_string();
            return self.record("§10", claim, Verdict::Unreachable(why));
        }
        let to = Target::Pixel { frame: live.name.clone(), x: 0.0, y: 0.0 };
        let steps = vec![Step::Move { to }, Step::Down { button: 0 }, Step::Up { button: 0 }];
        let click = Source { id: "pointer".to_string(), kind: "mouse".to_string(), steps };
        let perform = Perform { pace: Pace::Watchable, ..Perform::of(vec![click]) };
        let started = std::time::Instant::now();
        let broken = match self.client.perform(&perform).await {
            Ok(PerformAnswer::Done { .. }) => {
                let took = started.elapsed().as_millis() as u64;
                (took < WATCHABLE_PRESS_MS).then(|| format!("answered in {took} ms, under the floor of {WATCHABLE_PRESS_MS} ms"))
            }
            Ok(other) => Some(format!("{other:?}")),
            Err(fault) => Some(fault.to_string()),
        };
        self.check("§10", claim, broken);
    }

    /// How the answer to `perform` is not the refusal `expected`, if it is not.
    async fn refused_input(
        &self,
        perform: &Perform,
        expected: &(RefusalCode, Option<String>),
    ) -> Option<String> {
        let (code, subject) = expected;
        match self.client.perform(perform).await {
            Ok(PerformAnswer::Refused(refused)) => {
                let fits = refused.code == *code && (subject.is_none() || refused.subject == *subject);
                (!fits).then(|| format!("asked for {code:?} about {subject:?}, answered {refused:?}"))
            }
            Ok(other) => Some(format!("asked for {code:?}, answered {other:?}")),
            Err(fault) => Some(fault.to_string()),
        }
    }

    async fn live_frame(&self) -> Option<LiveFrame> {
        let parts = vec![Part::Capture, Part::Layout];
        let call = ObserveCall { parts, region: None, scale: None, frame_only: false };
        let observation = self.client.observe(&call).await.ok()?;
        let capture = observation.capture?;
        Some(LiveFrame {
            name: observation.frame?,
            width: capture.width,
            height: capture.height,
            layout: observation.layout,
        })
    }

    async fn a_move_to_a_node(&mut self, live: &LiveFrame) {
        let claim = "a pointer move to a layout node runs and names the frame after it";
        let node = live.layout.as_ref().and_then(|root| {
            root.walk().into_iter().find(|node| node.visible).map(|node| node.id.clone())
        });
        let Some(node) = node else {
            let why = "the frame has no visible node".to_string();
            return self.record("§10", claim, Verdict::Unreachable(why));
        };
        let to = Target::Node { frame: live.name.clone(), node };
        let step = Step::Move { to };
        let source = Source { id: "pointer".to_string(), kind: "mouse".to_string(), steps: vec![step] };
        let broken = match self.client.perform(&Perform::of(vec![source])).await {
            Ok(PerformAnswer::Done { frame: Some(_) }) => None,
            Ok(other) => Some(format!("{other:?}")),
            Err(fault) => Some(fault.to_string()),
        };
        self.check("§10", claim, broken);
    }

    async fn going_back(&mut self, offer: &Offer, options: &Options) {
        let broken = check_history_offer(offer).err().map(|fault| format!("{fault:?}"));
        let claim = "the offer says what it holds of its history exactly when it names ui/history";
        self.check(UI_INTERFACES_5, claim, broken);
        if !offer.answers(UI_HISTORY) {
            return self.no_history().await;
        }
        let asked = HistoryCall { from: None, to: None, limit: 3, include_state: true };
        let Some(history) = self.history_answering(&asked, "a history answers its call").await else {
            return;
        };
        let one = HistoryCall { limit: 1, include_state: false, ..asked };
        self.history_answering(&one, "a history holds no more positions than its limit").await;
        self.offer_names_its_history().await;
        self.its_grades(offer, &history);
        self.never_had(&history).await;
        self.dropped(&history).await;
        let Some(past) = past_position(&history) else {
            let why = "the app holds no position before its newest".to_string();
            return self.record(UI_INTERFACES_2, "the app goes back to a past position", Verdict::Unreachable(why));
        };
        self.at_a_past_position(offer, options, past).await;
        self.navigating_performs_nothing(past).await;
        let _ = self.client.navigate(&NavigateCall { to: Destination::Live }).await;
    }

    async fn no_history(&mut self) {
        let call = ObserveCall { parts: Vec::new(), region: None, scale: None, frame_only: false };
        let broken = match self.client.observe(&call).await {
            Ok(Observation { shown: Some(Shown::Live), .. }) => None,
            Ok(observation) => Some(format!("it shows {:?}", observation.shown)),
            Err(fault) => Some(fault.to_string()),
        };
        self.check(UI_INTERFACES_3, "an app that offers no ui/history shows its live state", broken);
        let call = HistoryCall { from: None, to: None, limit: 1, include_state: false };
        let broken = match self.client.history(&call).await {
            Ok(HistoryAnswer::Refused(Refused { code: RefusalCode::NoHistoryInterface, .. })) => None,
            Ok(other) => Some(format!("{other:?}")),
            Err(fault) => Some(fault.to_string()),
        };
        self.check(UI_INTERFACES_2, "a history call to an app that offers no ui/history is refused", broken);
    }

    /// The app's answer to `call`, recorded as `claim`.
    async fn history_answering(&mut self, call: &HistoryCall, claim: &str) -> Option<History> {
        let (history, broken) = match self.client.history(call).await {
            Ok(HistoryAnswer::Listed(history)) => {
                let broken = check_history(call, &history).err().map(|fault| format!("{fault:?}"));
                (Some(history), broken)
            }
            Ok(HistoryAnswer::Refused(refused)) => (None, Some(format!("refused: {}", refused.why))),
            Err(fault) => (None, Some(fault.to_string())),
        };
        self.check(UI_INTERFACES_2, claim, broken);
        history
    }

    async fn offer_names_its_history(&mut self) {
        let claim = "the offer names the oldest and newest position the history holds";
        let call = HistoryCall { from: None, to: None, limit: 1, include_state: false };
        let mut differed = None;
        for _ in 0..QUIET_ATTEMPTS {
            let (offer, history) = (self.client.offer().await, self.client.history(&call).await);
            let (Ok(offer), Ok(HistoryAnswer::Listed(history))) = (offer, history) else {
                differed = Some("the offer or the history had no answer".to_string());
                continue;
            };
            let offered = offer.history.map(|held| (held.oldest, held.newest));
            if offered == Some((history.oldest, history.newest)) {
                return self.record(UI_INTERFACES_5, claim, Verdict::Holds);
            }
            differed = Some(format!("the offer says {offered:?}, the history {:?}", (history.oldest, history.newest)));
        }
        self.check(UI_INTERFACES_5, claim, differed);
    }

    async fn never_had(&mut self, history: &History) {
        let position = history.newest.unwrap_or(0) + NEVER_HAD;
        let broken = match self.navigate_to(position).await {
            Ok(NavigateAnswer::Refused(Refused { code: RefusalCode::UnknownPosition, .. })) => None,
            Ok(other) => Some(format!("{other:?}")),
            Err(fault) => Some(fault.to_string()),
        };
        self.check(UI_INTERFACES_2, "a position the app never had is refused by name", broken);
    }

    async fn dropped(&mut self, history: &History) {
        let claim = "a position the app no longer holds is unavailable, naming the oldest it holds";
        let Some(dropped) = history.oldest.filter(|oldest| *oldest > 1).map(|oldest| oldest - 1) else {
            let why = "the app still holds its first position".to_string();
            return self.record(UI_INTERFACES_2, claim, Verdict::Unreachable(why));
        };
        let broken = match self.navigate_to(dropped).await {
            Ok(NavigateAnswer::Unavailable { position, oldest: Some(oldest), .. })
                if position == dropped && oldest > dropped =>
            {
                None
            }
            Ok(other) => Some(format!("{other:?}")),
            Err(fault) => Some(fault.to_string()),
        };
        self.check(UI_INTERFACES_2, claim, broken);
    }

    async fn navigate_to(&self, position: u64) -> Result<NavigateAnswer, ClientFault> {
        self.client.navigate(&NavigateCall { to: Destination::Position { position } }).await
    }
}

<<at-a-past-position>>

<<under-a-fixture>>

<<driving-under-a-fixture>>

/// Whether an oversized frame from a peer costs that connection and not the app.
pub async fn an_oversized_frame(socket: &Path) -> Case {
    let clause = "§7";
    let claim = "an oversized frame costs its connection and not the app".to_string();
    let sent = async {
        let mut peer = UnixStream::connect(socket).await?;
        peer.write_all(&[0xff; 4]).await?;
        peer.shutdown().await
    };
    if let Err(error) = sent.await {
        return Case { clause, claim, verdict: Verdict::Unreachable(error.to_string()) };
    }
    let answered = async {
        let client = UiClient::open(UnixStream::connect(socket).await?).await?;
        client.offer().await?;
        Ok::<(), Box<dyn std::error::Error>>(())
    };
    let verdict = match answered.await {
        Ok(()) => Verdict::Holds,
        Err(error) => Verdict::Broken(error.to_string()),
    };
    Case { clause, claim, verdict }
}

/// A `traceparent` no other run names: a fresh trace and span, sampled.
fn fresh_traceparent() -> String {
    let random = || {
        let mut hasher = std::collections::hash_map::RandomState::new().build_hasher();
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH);
        hasher.write_u128(now.map(|since| since.as_nanos()).unwrap_or_default());
        hasher.write_u32(std::process::id());
        hasher.finish() | 1
    };
    format!("00-{:016x}{:016x}-{:016x}-01", random(), random(), random())
}

fn every_class() -> Grant {
    Grant { classes: vec![SideEffect::ReadOnly, SideEffect::IdempotentWrite, SideEffect::NonIdempotent] }
}

/// How `observation` breaks §8 as an answer to `call`, if it does: the observe
/// vectors' check, and a capture that is a PNG of the size it says.
/// How an observation from an app whose host cannot paint its window breaks §8, if it does.
fn cannot_paint_breaks(call: &ObserveCall, observation: &Observation) -> Option<String> {
    if let Some(broken) = observation_breaks(call, observation) {
        return Some(broken);
    }
    let refused_as = |part| observation.refused.iter().find(|refused| refused.part == part).and_then(|refused| refused.code);
    if refused_as(Part::Capture) != Some(RefusalCode::CannotPaint) {
        return Some("the capture is not refused as cannot_paint".to_string());
    }
    if let Some(part) = [Part::Layout, Part::State].into_iter().find(|part| refused_as(*part) == Some(RefusalCode::CannotPaint)) {
        return Some(format!("{part:?} is refused as cannot_paint"));
    }
    observation.layout.is_none().then(|| "the layout is not answered".to_string())
}

/// How a refusal answered after `took` is not `cannot_paint` within the bound, if it is not.
fn refused_at_once(refused: Result<Refused, Option<String>>, took: std::time::Duration) -> Option<String> {
    match refused {
        Ok(refused) if refused.code != RefusalCode::CannotPaint => Some(format!("refused as {:?}: {}", refused.code, refused.why)),
        Ok(_) if took > CANNOT_PAINT_WITHIN => Some(format!("refused after {} ms", took.as_millis())),
        Ok(_) => None,
        Err(broken) => broken,
    }
}

fn observation_breaks(call: &ObserveCall, observation: &Observation) -> Option<String> {
    if let Err(fault) = check_observation(call, observation) {
        return Some(format!("{fault:?}"));
    }
    let capture = observation.capture.as_ref()?;
    let says = (capture.width, capture.height);
    match png_size(&capture.png) {
        Some(size) if size == says => None,
        Some(size) => Some(format!("the capture says {says:?} and its PNG is {size:?}")),
        None => Some("the capture is not a PNG".to_string()),
    }
}

const A_NODE_KEEPS_ITS_ID: &str = "a node keeps its id from frame to frame";

/// The ids of a frame's nodes.
fn node_ids(root: &LayoutNode) -> BTreeSet<String> {
    root.walk().into_iter().map(|node| node.id.clone()).collect()
}

/// How a frame's ids differ from the frame before, if they do.
fn ids_moved(before: &BTreeSet<String>, after: &BTreeSet<String>) -> Option<String> {
    if before == after {
        return None;
    }
    let gone = before.difference(after).next().cloned();
    Some(format!("{gone:?} was gone a frame later"))
}

/// The size a PNG's header says.
fn png_size(png: &[u8]) -> Option<(u32, u32)> {
    const SIGNATURE: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];
    if png.get(..8)? != SIGNATURE || png.get(12..16)? != b"IHDR" {
        return None;
    }
    let dimension = |at: usize| Some(u32::from_be_bytes(png.get(at..at + 4)?.try_into().ok()?));
    Some((dimension(16)?, dimension(20)?))
}

/// The live name of a vector's frame: the app's frame for one the vector holds,
/// and a name no app holds for one it does not.
fn live_name(case: &InputCase, frame: &str, live: &LiveFrame) -> String {
    if case.frames.iter().any(|held| held.frame == frame) {
        live.name.clone()
    } else {
        format!("ui-conformance-gone-{frame}")
    }
}

/// The frames a sequence names.
fn frames_named(perform: &Perform) -> Vec<&str> {
    perform
        .sources
        .iter()
        .flat_map(|source| &source.steps)
        .filter_map(|step| match step {
            Step::Move { to } | Step::Scroll { to, .. } => Some(to),
            _ => None,
        })
        .map(|to| match to {
            Target::Pixel { frame, .. } | Target::Node { frame, .. } => frame.as_str(),
        })
        .collect()
}

/// A vector's sequence, aimed at the live frame. Positions scale with the frame,
/// so one outside the vector's frame stays outside the app's.
fn retargeted(case: &InputCase, live: &LiveFrame) -> Perform {
    let mut perform = case.perform.clone();
    for step in perform.sources.iter_mut().flat_map(|source| source.steps.iter_mut()) {
        let (Step::Move { to } | Step::Scroll { to, .. }) = step else { continue };
        match to {
            Target::Pixel { frame, x, y } => {
                if let Some(held) = case.frames.iter().find(|held| held.frame == *frame) {
                    *x *= f64::from(live.width) / f64::from(held.width);
                    *y *= f64::from(live.height) / f64::from(held.height);
                }
                *frame = live_name(case, frame, live);
            }
            Target::Node { frame, .. } => *frame = live_name(case, frame, live),
        }
    }
    perform
}
```

### At a past position

The claims at a past position run in one trip: there, observe, try input and
actions, come back. Input is a pointer move to a node of the past frame, and
the caller's action runs only when it acts above `read_only`, so an app that
breaks the refusal has run a move and the caller's own action, nothing the
suite chose. Every claim here names the position the suite went to, so a
refusal for another position does not pass.

<a name="chunk-at-a-past-position"></a><sub>[`src/conformance.rs`](../../crates/x0k-ui-endpoint/src/conformance.rs) · `#at-a-past-position`</sub>

```rust {#at-a-past-position}
impl Suite<'_> {
    async fn at_a_past_position(&mut self, offer: &Offer, options: &Options, past: u64) {
        let presents_frames = self.live_frame().await.is_some();
        let claim = "navigating to a past position shows it and names its frame";
        let broken = match self.navigate_to(past).await {
            Ok(NavigateAnswer::Shown { shown: Shown::Position { position }, frame })
                if position == past && (frame.is_some() || !presents_frames) =>
            {
                None
            }
            Ok(other) => Some(format!("{other:?}")),
            Err(fault) => Some(fault.to_string()),
        };
        let went = broken.is_none();
        self.check(UI_INTERFACES_2, claim, broken);
        if !went {
            return;
        }
        let call = ObserveCall { parts: vec![Part::Capture, Part::Layout], region: None, scale: None, frame_only: false };
        let observation = self.client.observe(&call).await;
        let broken = match &observation {
            Ok(Observation { shown: Some(Shown::Position { position }), .. }) if *position == past => None,
            Ok(observation) => Some(format!("it names {:?}", observation.shown)),
            Err(fault) => Some(fault.to_string()),
        };
        self.check(UI_INTERFACES_3, "an observation names the past position it shows", broken);
        self.input_while_past(offer, observation.ok(), past).await;
        self.acting_while_past(offer, options, past).await;

        let claim = "navigating to live shows the live state";
        let broken = match self.client.navigate(&NavigateCall { to: Destination::Live }).await {
            Ok(NavigateAnswer::Shown { shown: Shown::Live, .. }) => None,
            Ok(other) => Some(format!("{other:?}")),
            Err(fault) => Some(fault.to_string()),
        };
        self.check(UI_INTERFACES_2, claim, broken);
    }

    async fn input_while_past(&mut self, offer: &Offer, observation: Option<Observation>, past: u64) {
        let claim = "input while a past position is shown is refused as showing_past";
        if !offer.answers(UI_INPUT) {
            let why = "the offer does not name ui/input".to_string();
            return self.record(UI_INTERFACES_2, claim, Verdict::Unreachable(why));
        }
        let frame = observation.and_then(|observation| {
            let node = observation.layout.as_ref().and_then(|root| {
                root.walk().into_iter().find(|node| node.visible).map(|node| node.id.clone())
            });
            Some((observation.frame?, node?))
        });
        let steps = match frame {
            Some((frame, node)) => vec![Step::Move { to: Target::Node { frame, node } }],
            None => vec![Step::Pause { ms: 0 }],
        };
        let source = Source { id: "pointer".to_string(), kind: "mouse".to_string(), steps };
        let expected = (RefusalCode::ShowingPast, Some(past.to_string()));
        let broken = self.refused_input(&Perform::of(vec![source]), &expected).await;
        self.check(UI_INTERFACES_2, claim, broken);
    }

    async fn acting_while_past(&mut self, offer: &Offer, options: &Options, past: u64) {
        let claim = "an actuating action while a past position is shown is refused as showing_past";
        let acts = options.act.as_ref().filter(|invoke| {
            let action = offer.actions.iter().find(|action| action.name == invoke.action);
            action.is_some_and(|action| action.side_effect != SideEffect::ReadOnly)
                && check_invoke(offer, &every_class(), invoke).is_ok()
        });
        match acts {
            Some(invoke) => {
                let broken = match self.client.invoke(invoke).await {
                    Ok(InvokeAnswer::Refused(refused))
                        if refused.code == RefusalCode::ShowingPast
                            && refused.subject.as_deref() == Some(past.to_string().as_str()) =>
                    {
                        None
                    }
                    Ok(other) => Some(format!("{other:?}")),
                    Err(fault) => Some(fault.to_string()),
                };
                self.check(UI_INTERFACES_2, claim, broken);
            }
            None => {
                let why = "the caller named no action that acts above read_only".to_string();
                self.record(UI_INTERFACES_2, claim, Verdict::Unreachable(why));
            }
        }

        let claim = "a read-only action runs while a past position is shown";
        let reading = offer.actions.iter().filter(|action| action.side_effect == SideEffect::ReadOnly);
        let reading = reading.map(|action| Invoke { action: action.name.clone(), args: Value::Null });
        match reading.into_iter().find(|invoke| check_invoke(offer, &every_class(), invoke).is_ok()) {
            Some(invoke) => {
                let broken = match self.client.invoke(&invoke).await {
                    Ok(InvokeAnswer::Refused(refused)) => Some(format!("{} was refused: {}", invoke.action, refused.why)),
                    Ok(_) => None,
                    Err(fault) => Some(fault.to_string()),
                };
                self.check(UI_INTERFACES_2, claim, broken);
            }
            None => {
                let why = "no read-only action takes no arguments".to_string();
                self.record(UI_INTERFACES_2, claim, Verdict::Unreachable(why));
            }
        }
    }

    /// Going back and returning leaves the newest position where it was.
    async fn navigating_performs_nothing(&mut self, past: u64) {
        let claim = "navigating performs nothing: the history gains no position";
        let call = HistoryCall { from: None, to: None, limit: 1, include_state: false };
        let newest = |answer: Result<HistoryAnswer, ClientFault>| match answer {
            Ok(HistoryAnswer::Listed(history)) => Ok(history.newest),
            Ok(other) => Err(format!("{other:?}")),
            Err(fault) => Err(fault.to_string()),
        };
        let mut moved = None;
        for _ in 0..QUIET_ATTEMPTS {
            let before = newest(self.client.history(&call).await);
            let there = self.navigate_to(past).await;
            let back = self.client.navigate(&NavigateCall { to: Destination::Live }).await;
            let after = newest(self.client.history(&call).await);
            match (before, there, back, after) {
                (Ok(before), Ok(_), Ok(_), Ok(after)) if before == after => {
                    return self.record(UI_INTERFACES_2, claim, Verdict::Holds);
                }
                (Ok(before), Ok(_), Ok(_), Ok(after)) => moved = Some(format!("{before:?} became {after:?}")),
                (Err(why), ..) | (_, _, _, Err(why)) => moved = Some(why),
                (_, Err(fault), _, _) | (_, _, Err(fault), _) => moved = Some(fault.to_string()),
            }
        }
        self.check(UI_INTERFACES_2, claim, moved);
    }
}

/// The newest position before the newest, which is a past one to show.
fn past_position(history: &History) -> Option<u64> {
    let (oldest, newest) = (history.oldest?, history.newest?);
    (newest > oldest).then(|| newest - 1)
}

/// Whether the app returns to its live state when a session that went back ends.
pub async fn a_session_end_returns_to_live(socket: &Path) -> Case {
    let clause = UI_INTERFACES_2;
    let claim = "a session's end returns the app to its live state".to_string();
    let case = |verdict| Case { clause, claim: claim.clone(), verdict };
    let open = || async { UiClient::open(UnixStream::connect(socket).await?).await.map_err(std::io::Error::other) };
    let (Ok(staying), Ok(leaving)) = (open().await, open().await) else {
        return case(Verdict::Unreachable("no second session opened".to_string()));
    };
    let offer = match leaving.offer().await {
        Ok(offer) if offer.answers(UI_HISTORY) => offer,
        Ok(_) => return case(Verdict::Unreachable("the offer does not name ui/history".to_string())),
        Err(fault) => return case(Verdict::Broken(fault.to_string())),
    };
    let held = offer.history.and_then(|held| Some((held.oldest?, held.newest?)));
    let Some(past) = held.filter(|(oldest, newest)| newest > oldest).map(|(_, newest)| newest - 1) else {
        return case(Verdict::Unreachable("the app holds no position before its newest".to_string()));
    };
    let to = NavigateCall { to: Destination::Position { position: past } };
    match leaving.navigate(&to).await {
        Ok(NavigateAnswer::Shown { shown: Shown::Position { .. }, .. }) => {}
        other => return case(Verdict::Unreachable(format!("the session could not go back: {other:?}"))),
    }
    drop(leaving);
    let call = ObserveCall { parts: Vec::new(), region: None, scale: None, frame_only: false };
    let deadline = std::time::Instant::now() + SESSION_END_WAIT;
    let mut shown = None;
    while std::time::Instant::now() < deadline {
        shown = staying.observe(&call).await.ok().and_then(|observation| observation.shown);
        if shown == Some(Shown::Live) {
            return case(Verdict::Holds);
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    let _ = staying.navigate(&NavigateCall { to: Destination::Live }).await;
    case(Verdict::Broken(format!("it still shows {shown:?}")))
}
```

### Under a state fixture

The fixture claims run in one trip, as the past-position claims do: refusals
first, then present, observe, drive, replace, release. The fixture the suite
presents is the live state itself, an empty patch at the live head, because the
suite knows nothing of the app's state but what it read. Every refusal is tried
before anything is presented, so a refusal that showed something is seen by the
observation after it.

The caller's action under a fixture runs only when the policy says `performed`,
which for a `non_idempotent` action no policy may say. An app that breaks that
has run the caller's own action, nothing the suite chose.

<a name="chunk-under-a-fixture"></a><sub>[`src/conformance.rs`](../../crates/x0k-ui-endpoint/src/conformance.rs) · `#under-a-fixture`</sub>

```rust {#under-a-fixture}
impl Suite<'_> {
    /// `ui-interfaces` §5: what the offer's replay policy says can be read.
    fn its_replay_policy(&mut self, offer: &Offer) {
        let claim = "the offer's replay policy lowers no floor and names only sandboxes it declares";
        let broken = check_replay_policy(offer).err().map(|refused| refused.why);
        self.check(UI_INTERFACES_5, claim, broken);
    }

    /// `ui-interfaces` §5: every grade a position is answered at is one the offer lists.
    fn its_grades(&mut self, offer: &Offer, history: &History) {
        let claim = "every grade a history answers a position at is one the offer lists";
        if history.positions.is_empty() {
            let why = "the history answered no position".to_string();
            return self.record(UI_INTERFACES_5, claim, Verdict::Unreachable(why));
        }
        let unlisted = history.positions.iter().find(|held| !offer.grades.contains(&held.grade));
        let broken = unlisted.map(|held| format!("position {} is at {:?}, and the offer lists {:?}", held.position, held.grade, offer.grades));
        self.check(UI_INTERFACES_5, claim, broken);
    }

    async fn fixtures(&mut self, offer: &Offer, options: &Options) {
        let takes = offer.answers(UI_HISTORY) && offer.history.as_ref().is_some_and(|held| held.fixtures);
        if !takes {
            let code = if offer.answers(UI_HISTORY) { RefusalCode::NoFixtures } else { RefusalCode::NoHistoryInterface };
            let call = present_call(Fixture::Patch { patch: json!({}) }, NO_SUCH_SHAPE, None);
            let broken = refused_as(self.client.present(&call).await, code, None);
            return self.check(UI_INTERFACES_4, "present to an app that takes no fixtures is refused by name", broken);
        }
        let Some(live) = self.live_state().await else {
            let why = "the app answers no state to write a fixture against".to_string();
            return self.record(UI_INTERFACES_4, "the app shows a state fixture", Verdict::Unreachable(why));
        };
        self.refusing_a_fixture(&live).await;
        self.with_a_fixture(offer, options, &live).await;
        self.a_fixture_changes_nothing_live(&live).await;
    }

    /// The live state, as an observation reads it.
    async fn live_state(&self) -> Option<StatePart> {
        let call = ObserveCall { parts: vec![Part::State], region: None, scale: None, frame_only: false };
        self.client.observe(&call).await.ok()?.state
    }

    async fn refusing_a_fixture(&mut self, live: &StatePart) {
        let empty = || Fixture::Patch { patch: json!({}) };
        let call = present_call(empty(), NO_SUCH_SHAPE, None);
        let broken = refused_as(self.client.present(&call).await, RefusalCode::WrongFingerprint, Some(NO_SUCH_SHAPE));
        self.check(UI_INTERFACES_4, "a fixture with another shape's fingerprint is refused, naming it", broken);

        let call = present_call(empty(), &live.fingerprint, Some(NO_SUCH_HEAD));
        let answer = self.client.present(&call).await;
        let broken = refused_as(answer, RefusalCode::StaleHead, Some(&live.head));
        let claim = "a fixture naming a head the live state is not at is refused, naming the current head";
        self.check(UI_INTERFACES_4, claim, broken);

        let claim = "a state that does not fit the app's state shape is refused as misfit_state";
        let call = present_call(Fixture::State { state: json!(NOT_A_STATE) }, &live.fingerprint, None);
        match self.client.present(&call).await {
            Ok(PresentAnswer::Presented { handle, .. }) => {
                let _ = self.client.release(&ReleaseCall { handle }).await;
                let why = "the app's state shape takes a bare text".to_string();
                self.record(UI_INTERFACES_4, claim, Verdict::Unreachable(why));
            }
            answer => {
                let broken = refused_as(answer, RefusalCode::MisfitState, None);
                self.check(UI_INTERFACES_4, claim, broken);
            }
        }

        let broken = self.shows(&Shown::Live).await;
        self.check(UI_INTERFACES_4, "a refused fixture shows nothing: the app still shows its live state", broken);
    }

    /// How what the app shows differs from `expected`, if it does.
    async fn shows(&self, expected: &Shown) -> Option<String> {
        let call = ObserveCall { parts: Vec::new(), region: None, scale: None, frame_only: false };
        match self.client.observe(&call).await {
            Ok(Observation { shown: Some(shown), .. }) if shown == *expected => None,
            Ok(observation) => Some(format!("it names {:?}", observation.shown)),
            Err(fault) => Some(fault.to_string()),
        }
    }

    /// Present the live state, as an empty patch. It names no head, so an app
    /// whose head moves for its own reasons is still presented to.
    async fn present_live(&self, live: &StatePart) -> Result<PresentAnswer, ClientFault> {
        let call = present_call(Fixture::Patch { patch: json!({}) }, &live.fingerprint, None);
        self.client.present(&call).await
    }

    async fn with_a_fixture(&mut self, offer: &Offer, options: &Options, live: &StatePart) {
        let presents_frames = self.live_frame().await.is_some();
        let claim = "presenting a fixture shows it and names its frame";
        let (handle, broken) = match self.present_live(live).await {
            Ok(PresentAnswer::Presented { handle, frame }) if frame.is_some() || !presents_frames => (Some(handle), None),
            Ok(PresentAnswer::Refused(refused)) if refused.code == RefusalCode::Declined => {
                return self.record(UI_INTERFACES_4, claim, declined(&refused));
            }
            Ok(other) => (None, Some(format!("{other:?}"))),
            Err(fault) => (None, Some(fault.to_string())),
        };
        self.check(UI_INTERFACES_4, claim, broken);
        let Some(handle) = handle else { return };

        let call = ObserveCall { parts: vec![Part::Capture, Part::Layout], region: None, scale: None, frame_only: false };
        let observation = self.client.observe(&call).await;
        let fixture = Shown::Fixture { handle: handle.clone() };
        let broken = match &observation {
            Ok(Observation { shown: Some(shown), .. }) if *shown == fixture => None,
            Ok(observation) => Some(format!("it names {:?}", observation.shown)),
            Err(fault) => Some(fault.to_string()),
        };
        self.check(UI_INTERFACES_3, "an observation names the fixture it shows", broken);
        if let Some(ended) = self.driving_under_a_fixture(offer, options, observation.ok()).await {
            return self.after_the_app_ended(&handle, &ended).await;
        }

        let claim = "one fixture stands at a time: a second present replaces the first";
        let (current, broken) = match self.present_live(live).await {
            Ok(PresentAnswer::Presented { handle: second, .. }) if second == handle => {
                (Some(second), Some("the second fixture has the first one's handle".to_string()))
            }
            Ok(PresentAnswer::Presented { handle: second, .. }) => {
                match self.client.release(&ReleaseCall { handle: handle.clone() }).await {
                    Ok(ReleaseAnswer::NotStanding { .. }) => (Some(second), None),
                    Ok(other) => (Some(second), Some(format!("the first was answered {other:?}"))),
                    Err(fault) => (Some(second), Some(fault.to_string())),
                }
            }
            Ok(other) => (Some(handle), Some(format!("{other:?}"))),
            Err(fault) => (Some(handle), Some(fault.to_string())),
        };
        self.check(UI_INTERFACES_4, claim, broken);
        let Some(current) = current else { return };

        let claim = "releasing a fixture shows the live state";
        let broken = match self.client.release(&ReleaseCall { handle: current.clone() }).await {
            Ok(ReleaseAnswer::Released { .. }) => self.shows(&Shown::Live).await,
            Ok(other) => Some(format!("{other:?}")),
            Err(fault) => Some(fault.to_string()),
        };
        self.check(UI_INTERFACES_4, claim, broken);

        let claim = "releasing a fixture that does not stand answers that it does not stand";
        let broken = match self.client.release(&ReleaseCall { handle: current.clone() }).await {
            Ok(ReleaseAnswer::NotStanding { handle }) if handle == current => None,
            Ok(other) => Some(format!("{other:?}")),
            Err(fault) => Some(fault.to_string()),
        };
        self.check(UI_INTERFACES_4, claim, broken);
    }
}
```

Driving under a fixture is the past-position trip with the refusals turned
round: input and a `read_only` action must run, and the caller's action must
take the disposition the policy gives it. `disposition` says what that is, from
the same offer the app's endpoint reads.

<a name="chunk-driving-under-a-fixture"></a><sub>[`src/conformance.rs`](../../crates/x0k-ui-endpoint/src/conformance.rs) · `#driving-under-a-fixture`</sub>

```rust {#driving-under-a-fixture}
impl Suite<'_> {
    /// Drive the app under the suite's fixture; answers the refusal that says
    /// the app ended it, if it did.
    async fn driving_under_a_fixture(&mut self, offer: &Offer, options: &Options, observation: Option<Observation>) -> Option<Refused> {
        let claim = "input reaches the app while a fixture stands";
        if offer.answers(UI_INPUT) {
            let frame = observation.and_then(|observation| {
                let node = observation.layout.as_ref().and_then(|root| {
                    root.walk().into_iter().find(|node| node.visible).map(|node| node.id.clone())
                });
                Some((observation.frame?, node?))
            });
            let steps = match frame {
                Some((frame, node)) => vec![Step::Move { to: Target::Node { frame, node } }],
                None => vec![Step::Pause { ms: 0 }],
            };
            let source = Source { id: "pointer".to_string(), kind: "mouse".to_string(), steps };
            match self.client.perform(&Perform::of(vec![source])).await {
                Ok(PerformAnswer::Refused(refused)) if refused.code == RefusalCode::Declined => {
                    self.record(UI_INTERFACES_4, claim, declined(&refused));
                }
                Ok(PerformAnswer::Refused(refused)) if refused.code == RefusalCode::FixtureEnded => {
                    self.record(UI_INTERFACES_4, claim, ended(&refused));
                    return Some(refused);
                }
                answer => {
                    let broken = match answer {
                        Ok(PerformAnswer::Done { .. }) => None,
                        Ok(other) => Some(format!("{other:?}")),
                        Err(fault) => Some(fault.to_string()),
                    };
                    self.check(UI_INTERFACES_4, claim, broken);
                }
            }
        } else {
            self.record(UI_INTERFACES_4, claim, Verdict::Unreachable("the offer does not name ui/input".to_string()));
        }

        let claim = "a read-only action runs while a fixture stands";
        if check_replay_policy(offer).is_err() {
            let why = "the offer's replay policy cannot be read, so every action is refused".to_string();
            self.record(UI_INTERFACES_4, claim, Verdict::Unreachable(why));
            self.record(UI_INTERFACES_4, ACTING_UNDER_A_FIXTURE, Verdict::Unreachable(why_unreadable()));
            return None;
        }
        let reading = offer.actions.iter().filter(|action| action.side_effect == SideEffect::ReadOnly);
        let reading = reading.map(|action| Invoke { action: action.name.clone(), args: Value::Null });
        match reading.into_iter().find(|invoke| check_invoke(offer, &every_class(), invoke).is_ok()) {
            Some(invoke) => match self.client.invoke(&invoke).await {
                Ok(InvokeAnswer::Refused(refused)) if refused.code == RefusalCode::Declined => {
                    self.record(UI_INTERFACES_4, claim, declined(&refused));
                }
                Ok(InvokeAnswer::Refused(refused)) if refused.code == RefusalCode::FixtureEnded => {
                    self.record(UI_INTERFACES_4, claim, ended(&refused));
                    return Some(refused);
                }
                answer => {
                    let broken = match answer {
                        Ok(InvokeAnswer::Done { .. } | InvokeAnswer::Failed { .. }) => None,
                        Ok(other) => Some(format!("{} was answered {other:?}", invoke.action)),
                        Err(fault) => Some(fault.to_string()),
                    };
                    self.check(UI_INTERFACES_4, claim, broken);
                }
            },
            None => self.record(UI_INTERFACES_4, claim, Verdict::Unreachable("no read-only action takes no arguments".to_string())),
        }

        let claim = ACTING_UNDER_A_FIXTURE;
        let acts = options.act.as_ref().and_then(|invoke| {
            let action = offer.actions.iter().find(|action| action.name == invoke.action)?;
            let actuates = action.side_effect != SideEffect::ReadOnly && check_invoke(offer, &every_class(), invoke).is_ok();
            actuates.then_some((invoke, action.side_effect))
        });
        let Some((invoke, class)) = acts else {
            let why = "the caller named no action that acts above read_only".to_string();
            self.record(UI_INTERFACES_4, claim, Verdict::Unreachable(why));
            return None;
        };
        let taken = disposition(offer, Purpose::Vary, class, &invoke.action);
        let answer = self.client.invoke(invoke).await;
        if let Ok(InvokeAnswer::Refused(refused)) = &answer {
            if refused.code == RefusalCode::Declined {
                self.record(UI_INTERFACES_4, claim, declined(refused));
                return None;
            }
            if refused.code == RefusalCode::FixtureEnded {
                self.record(UI_INTERFACES_4, claim, ended(refused));
                return Some(refused.clone());
            }
        }
        let performed = matches!(answer, Ok(InvokeAnswer::Done { .. } | InvokeAnswer::Failed { .. }));
        let broken = match (taken.disposition, answer) {
            _ if performed && class == SideEffect::NonIdempotent => {
                Some(format!("{} was performed against its real target", invoke.action))
            }
            (ReplayDisposition::Performed, _) if performed => None,
            (ReplayDisposition::Simulated, Ok(InvokeAnswer::Simulated { action })) if action == invoke.action => None,
            (ReplayDisposition::Sandboxed, Ok(InvokeAnswer::Sandboxed { sandbox, .. })) if Some(&sandbox) == taken.sandbox.as_ref() => None,
            (ReplayDisposition::Refused | ReplayDisposition::Recorded, Ok(InvokeAnswer::Refused(refused)))
                if refused.code == RefusalCode::PolicyRefuses =>
            {
                None
            }
            (expected, Ok(other)) => Some(format!("the policy says {expected:?}, and it was answered {other:?}")),
            (_, Err(fault)) => Some(fault.to_string()),
        };
        self.check(UI_INTERFACES_4, claim, broken);
        None
    }

    /// `ui-interfaces` §4: the app ended the suite's fixture `handle` itself,
    /// and `ended` is the refusal that said so. The rest of the trip needs a
    /// fixture that stands, so it is unreachable with the app's reason.
    async fn after_the_app_ended(&mut self, handle: &str, ended: &Refused) {
        let claim = "the call after the app ended its fixture is refused as fixture_ended, naming the fixture";
        let broken = (ended.subject.as_deref() != Some(handle)).then(|| format!("it names {:?}", ended.subject));
        self.check(UI_INTERFACES_4, claim, broken);
        let broken = self.shows(&Shown::Live).await;
        self.check(UI_INTERFACES_4, "an app that ends a fixture itself shows its live state", broken);
        let claim = "releasing a fixture the app ended answers that it ended, with the app's reason";
        let broken = match self.client.release(&ReleaseCall { handle: handle.to_string() }).await {
            Ok(ReleaseAnswer::Ended { handle: named, reason }) if named == handle && reason == ended.why => None,
            Ok(other) => Some(format!("{other:?}")),
            Err(fault) => Some(fault.to_string()),
        };
        self.check(UI_INTERFACES_4, claim, broken);
        let why = format!("the app ended the fixture: {}", ended.why);
        self.record(UI_INTERFACES_4, "replacing and releasing a fixture", Verdict::Unreachable(why));
    }

    /// Presenting and releasing leaves the live head where it was.
    async fn a_fixture_changes_nothing_live(&mut self, live: &StatePart) {
        let claim = "a fixture never changes the live state: presenting and releasing leaves its head where it was";
        let mut moved = None;
        for _ in 0..QUIET_ATTEMPTS {
            let before = self.client.offer().await.ok().and_then(|offer| offer.state_head);
            let handle = match self.present_live(live).await {
                Ok(PresentAnswer::Presented { handle, .. }) => handle,
                Ok(PresentAnswer::Refused(refused)) if refused.code == RefusalCode::Declined => {
                    return self.record(UI_INTERFACES_4, claim, declined(&refused));
                }
                other => {
                    moved = Some(format!("the fixture was not presented: {other:?}"));
                    continue;
                }
            };
            let _ = self.client.release(&ReleaseCall { handle }).await;
            let after = self.client.offer().await.ok().and_then(|offer| offer.state_head);
            if before.is_some() && before == after {
                return self.record(UI_INTERFACES_4, claim, Verdict::Holds);
            }
            moved = Some(format!("{before:?} became {after:?}"));
        }
        self.check(UI_INTERFACES_4, claim, moved);
    }
}

const ACTING_UNDER_A_FIXTURE: &str =
    "an action above read_only takes the disposition the replay policy gives it, and a non_idempotent one is never performed";

/// A claim whose call the app declines for now: unreachable, with its reason.
fn declined(refused: &Refused) -> Verdict {
    Verdict::Unreachable(format!("the app declines for now: {}", refused.why))
}

/// A claim whose call meets a fixture the app ended itself: unreachable, with
/// the app's reason.
fn ended(refused: &Refused) -> Verdict {
    Verdict::Unreachable(format!("the app ended the fixture: {}", refused.why))
}

fn why_unreadable() -> String {
    "the offer's replay policy cannot be read, so every action is refused".to_string()
}

fn present_call(fixture: Fixture, fingerprint: &str, if_match: Option<&str>) -> PresentCall {
    PresentCall { fixture, fingerprint: fingerprint.to_string(), if_match: if_match.map(str::to_string) }
}

/// How `answer` differs from a refusal of `code` about `subject`, if it does.
fn refused_as(answer: Result<PresentAnswer, ClientFault>, code: RefusalCode, subject: Option<&str>) -> Option<String> {
    match answer {
        Ok(PresentAnswer::Refused(refused))
            if refused.code == code && subject.is_none_or(|subject| refused.subject.as_deref() == Some(subject)) =>
        {
            None
        }
        Ok(other) => Some(format!("asked for {code:?} about {subject:?}, answered {other:?}")),
        Err(fault) => Some(fault.to_string()),
    }
}

/// Whether a session's end releases the fixture it presented.
pub async fn a_session_end_releases_its_fixture(socket: &Path) -> Case {
    let clause = UI_INTERFACES_4;
    let claim = "a session's end releases the fixture it presented".to_string();
    let case = |verdict| Case { clause, claim: claim.clone(), verdict };
    let open = || async { UiClient::open(UnixStream::connect(socket).await?).await.map_err(std::io::Error::other) };
    let (Ok(staying), Ok(leaving)) = (open().await, open().await) else {
        return case(Verdict::Unreachable("no second session opened".to_string()));
    };
    match leaving.offer().await {
        Ok(offer) if offer.history.as_ref().is_some_and(|held| held.fixtures) => {}
        Ok(_) => return case(Verdict::Unreachable("the offer does not say the app takes fixtures".to_string())),
        Err(fault) => return case(Verdict::Broken(fault.to_string())),
    }
    let call = ObserveCall { parts: vec![Part::State], region: None, scale: None, frame_only: false };
    let Some(live) = leaving.observe(&call).await.ok().and_then(|observation| observation.state) else {
        return case(Verdict::Unreachable("the app answers no state".to_string()));
    };
    let present = present_call(Fixture::Patch { patch: json!({}) }, &live.fingerprint, Some(&live.head));
    let handle = match leaving.present(&present).await {
        Ok(PresentAnswer::Presented { handle, .. }) => handle,
        other => return case(Verdict::Unreachable(format!("the session could not present: {other:?}"))),
    };
    drop(leaving);
    let call = ObserveCall { parts: Vec::new(), region: None, scale: None, frame_only: false };
    let deadline = std::time::Instant::now() + SESSION_END_WAIT;
    let mut shown = None;
    while std::time::Instant::now() < deadline {
        shown = staying.observe(&call).await.ok().and_then(|observation| observation.shown);
        if shown == Some(Shown::Live) {
            return case(Verdict::Holds);
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    let _ = staying.release(&ReleaseCall { handle }).await;
    case(Verdict::Broken(format!("it still shows {shown:?}")))
}
```

## The program

The target is a Unix socket, a `ws://` URL, or the first peer to dial `--listen`.
A page in a browser cannot accept a connection, so `--listen` is how an app in one
is held to the suite: the program listens, and the page dials it and answers. The
oversized frame runs only on a socket, because it is a statement about the socket's
own framing, and a WebSocket frames for itself. A session's end also runs only on
a socket, the one target the program can dial a second time, both for a past
position and for a fixture.

`--json-lines <socket>` runs the whole suite against an app that answers the
protocol's values as JSON lines on a Unix socket, the client's other link
(`x0k:implementation/ui-control/endpoint`, "A driver's end"). The host of a web
page listens there and hands each call to the page's entry
(`x0k:implementation/ui-control/page-answer`), so the page is held to every
claim a live run makes, by the same code. The oversized frame and a session's
end are statements about a session, and a JSON-lines link has none, so they do
not run.

`--trace-witness <program>` names the witness for the trace: the program is run
with the suite's `traceparent` as its one argument, and exits zero when the app's
work joined that trace. It waits for the app's spans itself, since only it knows
how they travel.

<a name="chunk-program"></a><sub>[`src/bin/ui-conformance.rs`](../../crates/x0k-ui-endpoint/src/bin/ui-conformance.rs) · `#program`</sub>

```rust {#program file="src/bin/ui-conformance.rs"}
//! Hold an app to the UI-control suite.
//!
//! `ui-conformance [--trace-witness <program>] <socket | ws://address | --listen address
//! | --json-lines socket> [<action> [<arguments as JSON>]]`

use std::path::Path;
use std::process::{Command, ExitCode};
use std::sync::Arc;

use serde_json::Value;
use tokio::net::UnixStream;
use x0k_ui_endpoint::client::UiClient;
use x0k_ui_endpoint::conformance::{
    a_session_end_releases_its_fixture, a_session_end_returns_to_live, an_oversized_frame, run, Options, Report,
    TraceWitness, Verdict,
};
#[cfg(feature = "websocket")]
use x0k_operation_session::websocket::{accept_websocket, dial_websocket, websocket_listener};
use x0k_ui_protocol::act::Invoke;

const USAGE: &str = "usage: ui-conformance [--trace-witness <program>] \
     <socket | ws://address | --listen address | --json-lines socket> [<action> [<arguments as JSON>]]";

/// Where the app is.
enum Target {
    Socket(String),
    Url(String),
    Listen(String),
    JsonLines(String),
}

impl Target {
    fn parsed(args: &mut impl Iterator<Item = String>) -> Option<Self> {
        let first = args.next()?;
        if first == "--listen" {
            return args.next().map(Target::Listen);
        }
        if first == "--json-lines" {
            return args.next().map(Target::JsonLines);
        }
        if first.starts_with("ws://") || first.starts_with("wss://") {
            return Some(Target::Url(first));
        }
        Some(Target::Socket(first))
    }

    #[cfg(feature = "websocket")]
    async fn client(&self) -> Result<UiClient, Box<dyn std::error::Error>> {
        Ok(match self {
            Target::Socket(socket) => UiClient::open(UnixStream::connect(socket).await?).await?,
            Target::Url(url) => UiClient::open(dial_websocket(url).await?).await?,
            Target::Listen(address) => {
                let listening = websocket_listener(address.as_str()).await?;
                println!("listening on ws://{}", listening.local_addr()?);
                UiClient::open(accept_websocket(&listening).await?).await?
            }
            Target::JsonLines(socket) => UiClient::over_json_lines(UnixStream::connect(socket).await?),
        })
    }

    #[cfg(not(feature = "websocket"))]
    async fn client(&self) -> Result<UiClient, Box<dyn std::error::Error>> {
        match self {
            Target::Socket(socket) => Ok(UiClient::open(UnixStream::connect(socket).await?).await?),
            Target::JsonLines(socket) => Ok(UiClient::over_json_lines(UnixStream::connect(socket).await?)),
            Target::Url(address) | Target::Listen(address) => {
                Err(format!("{address}: this build has no WebSocket: build with --features websocket").into())
            }
        }
    }
}

async fn suite(target: &Target, options: &Options) -> Result<bool, Box<dyn std::error::Error>> {
    let client = target.client().await?;
    let mut report = run(&client, options).await?;
    if let Target::Socket(socket) = target {
        report.cases.push(an_oversized_frame(Path::new(socket)).await);
        report.cases.push(a_session_end_returns_to_live(Path::new(socket)).await);
        report.cases.push(a_session_end_releases_its_fixture(Path::new(socket)).await);
    }
    Ok(print(&report))
}

/// Print `report`, and whether it holds.
fn print(report: &Report) -> bool {
    println!("{}", report.app);
    for case in &report.cases {
        match &case.verdict {
            Verdict::Holds => println!("  holds       {} {}", case.clause, case.claim),
            Verdict::Unreachable(why) => {
                println!("  unreachable {} {}: {why}", case.clause, case.claim);
            }
            Verdict::Broken(how) => println!("  BROKEN      {} {}: {how}", case.clause, case.claim),
        }
    }
    println!("{} claims, {} broken", report.cases.len(), report.broken().len());
    report.broken().is_empty()
}

/// A witness that runs `program` with the caller's `traceparent`.
fn witness_program(program: String) -> TraceWitness {
    Arc::new(move |traceparent: &str| {
        Command::new(&program).arg(traceparent).status().is_ok_and(|status| status.success())
    })
}

fn main() -> ExitCode {
    let mut args = std::env::args().skip(1).peekable();
    let mut trace = None;
    if args.peek().map(String::as_str) == Some("--trace-witness") {
        args.next();
        trace = args.next().map(witness_program);
        if trace.is_none() {
            eprintln!("{USAGE}");
            return ExitCode::from(2);
        }
    }
    let Some(target) = Target::parsed(&mut args) else {
        eprintln!("{USAGE}");
        return ExitCode::from(2);
    };
    let action = args.next();
    let parsed = args.next().map(|text| serde_json::from_str::<Value>(&text));
    let arguments = match parsed.transpose() {
        Ok(arguments) => arguments.unwrap_or(Value::Null),
        Err(error) => {
            eprintln!("the arguments are not JSON: {error}");
            return ExitCode::from(2);
        }
    };
    let options = Options { act: action.map(|action| Invoke { action, args: arguments }), trace };
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build();
    let outcome = match runtime {
        Ok(runtime) => runtime.block_on(suite(&target, &options)),
        Err(error) => Err(error.into()),
    };
    match outcome {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::FAILURE,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::from(2)
        }
    }
}
```

## Holding the suite itself

A suite that cannot fail proves nothing, so most of this test is apps that break
a claim on purpose. `Faithful` is a small app that keeps every promise and is the
baseline: with one promise broken it must break exactly that claim. Then
`YesToEverything` runs on the bare wire and refuses nothing, which `Endpoint` would
never let an app do.

`Faithful` keeps a history of positions 3 to 6, so positions 1 and 2 are dropped.
Its history flaws break the `ui/history` claims one by one. It takes state
fixtures of a closed shape, a count, and its fixture flaws break §4's claims the
same way. The endpoint makes §4's refusals before an app hears the call, so
those are seen red on `YesToEverything`, which presents anything. An app that lies to
the endpoint about what it shows is how input and actions reach it while it shows
the past, because the endpoint asks the app. An app served on a bare `Endpoint`,
with no session to end, stays where the last session left it.

`Faithful` also keeps its promises under a condition: a window that is not
visible, a host that delivers no touch or pen, a fixture it declines,
actions and input it declines under one, and a fixture it ends itself once it
has been observed. Under each it breaks nothing; the
claims the condition reaches hold, and the ones it takes away are
unreachable with the app's reason.

<a name="chunk-suite-test"></a><sub>[`tests/conformance_suite.rs`](../../crates/x0k-ui-endpoint/tests/conformance_suite.rs) · `#suite-test`</sub>

```rust {#suite-test file="tests/conformance_suite.rs"}
//! The suite, seen green on a faithful app and red on broken ones.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde_json::{json, Value};
use tokio::net::UnixListener;
use x0k_datum::Datum;
use x0k_operation_session::session::{serve, Answer, Callee, Heard, SessionPolicy};
use x0k_ui_endpoint::client::UiClient;
use x0k_ui_endpoint::conformance::{
    a_session_end_releases_its_fixture, a_session_end_returns_to_live, an_oversized_frame, run, Options, Report,
    Verdict,
};
use x0k_ui_endpoint::server::{listen, serve_connection, Declinable, Endpoint, UiApp};
use x0k_ui_endpoint::wire::to_wire;
use x0k_ui_endpoint::{
    shapes, InvokeAnswer, PerformAnswer, PresentAnswer, ReleaseAnswer, INVOKE, OFFER, PERFORM, PRESENT, RELEASE,
};
use std::sync::Mutex;

use x0k_ui_protocol::act::{Grant, Invoke, Outcome};
use x0k_ui_protocol::history::{
    Destination, Grade, History, HistoryCall, HistoryOffer, NavigateAnswer, Position, Shown,
};
use x0k_ui_protocol::input::{HeldFrame, InputOffer, Pace, Perform, Resolved, Step, SOURCE_KINDS, WATCHABLE_PRESS_MS};
use x0k_ui_protocol::observe::{
    Bounds, Capture, LayoutNode, Observation, ObserveCall, Part, StatePart,
};
use x0k_ui_protocol::offer::{Action, Offer, SideEffect, UI_HISTORY};
use x0k_ui_protocol::replay::{Covers, PolicyEntry, ReplayDisposition};
use x0k_ui_protocol::shapes::{interface, interfaces, shape_pin};
use x0k_ui_protocol::{Refused, RefusalCode};

/// One promise an app breaks.
#[derive(Clone, Copy, PartialEq)]
enum Flaw {
    None,
    /// Answers a part nobody asked for.
    UnaskedPart,
    /// Says a capture is one size and sends another.
    CaptureSize,
    /// Places a visible node outside the capture.
    NodeOutside,
    /// Moves the state head whenever it is observed.
    ObservingMoves,
    /// Offers a fingerprint its operations do not have.
    Fingerprint,
    /// Numbers its nodes afresh in every frame.
    FrameIds,
    /// Leaves out what its frames show.
    ShownUnnamed,
    /// Tells the endpoint it is live while it shows the past.
    PastTakesInput,
    /// Records a new position each time it goes back.
    NavigatingRecords,
    /// Answers every position its history holds, whatever the limit.
    PastTheLimit,
    /// Offers every position it ever had, and shows any it is asked for.
    ShowsAnything,
    /// Moves its live head whenever a fixture is presented.
    FixtureMovesLive,
    /// Says it shows its live state while a fixture stands.
    FixtureUnnamed,
    /// Answers a release and goes on showing the fixture.
    KeepsFixture,
    /// Lets a fixture stand beside the one that replaced it.
    TwoFixtures,
    /// Lists no grade, and answers its positions at `captured`.
    GradesUnlisted,
    /// Sandboxes its writes in a sandbox it does not declare.
    UndeclaredSandbox,
    /// Tells the endpoint it shows a past position while a fixture stands.
    FixtureLocks,
    /// Says a capture asked for as the frame alone carries its drawing of input.
    PresentsFrameOnly,
    /// Says it draws input, and answers a watchable sequence at once.
    HastyPace,
}

/// A condition `Faithful` keeps its promises under.
#[derive(Clone, Copy, PartialEq)]
enum Condition {
    /// Its window shows.
    Shown,
    /// Its window is minimised, and its host cannot paint it.
    CannotPaint,
    /// Its host delivers no touch and no pen.
    NoTouch,
    /// It declines every fixture while an approval waits.
    DeclinesFixtures,
    /// It takes a fixture, and declines actions and input under it.
    DeclinesUnderFixture,
    /// It ends a fixture itself once it has been observed, as when an
    /// approval arrives for a person.
    EndsFixture,
}

/// Why `Faithful` declines.
const APPROVAL: &str = "an approval waits for a person";
/// Why `Faithful` ends a fixture itself.
const ARRIVED: &str = "an approval arrived for a person";

/// The positions `Faithful` holds, of the six it has had.
const OLDEST: u64 = 3;
const NEWEST: u64 = 6;

struct Faithful {
    flaw: Flaw,
    condition: Condition,
    head: AtomicU64,
    observed: AtomicU64,
    newest: AtomicU64,
    shown: Mutex<Shown>,
    /// The fixtures presented so far, and the state the last one gave.
    presented: AtomicU64,
    fixture: Mutex<Value>,
    /// Handles still standing beside the shown one, under `TwoFixtures`.
    beside: Mutex<Vec<String>>,
    /// The fixture it ended itself, under `EndsFixture`.
    ended: Mutex<Option<String>>,
}

/// `Faithful`'s state shape: a closed record of one count.
fn state_shape() -> Datum {
    Datum::from_json(&json!({"kind": "struct", "open": false, "fields": {"count": {"shape": {"kind": "int"}}}}))
}

impl Faithful {
    fn new(flaw: Flaw) -> Self {
        Faithful {
            flaw,
            condition: Condition::Shown,
            head: AtomicU64::new(1),
            observed: AtomicU64::new(0),
            newest: AtomicU64::new(NEWEST),
            shown: Mutex::new(Shown::Live),
            presented: AtomicU64::new(0),
            fixture: Mutex::new(Value::Null),
            beside: Mutex::new(Vec::new()),
            ended: Mutex::new(None),
        }
    }

    fn under(condition: Condition) -> Self {
        Faithful { condition, ..Faithful::new(Flaw::None) }
    }

    fn live(&self) -> StatePart {
        let head = self.head.load(Ordering::Relaxed);
        StatePart { value: json!({ "count": head }), head: format!("s{head}"), fingerprint: shape_pin(&state_shape()) }
    }

    fn showing(&self) -> Shown {
        self.shown.lock().expect("the lock").clone()
    }
}

const WIDTH: u32 = 400;
const HEIGHT: u32 = 300;

fn png_of(width: u32, height: u32) -> Vec<u8> {
    let mut png = vec![137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13];
    png.extend_from_slice(b"IHDR");
    png.extend_from_slice(&width.to_be_bytes());
    png.extend_from_slice(&height.to_be_bytes());
    png
}

fn layout(width: f64) -> LayoutNode {
    LayoutNode {
        id: "root".to_string(),
        role: "window".to_string(),
        label: None,
        value: None,
        bounds: Bounds { x: 0.0, y: 0.0, width, height: f64::from(HEIGHT) },
        laid_out: None,
        visible: true,
        enabled: true,
        focused: false,
        interactive: false,
        action: None,
        source: None,
        composition: None,
        children: Vec::new(),
    }
}

fn offer_of(head: u64, newest: u64) -> Offer {
    let action = |name: &str, args: Value, side_effect| Action {
        name: name.to_string(),
        description: String::new(),
        args,
        result: json!({ "kind": "any" }),
        side_effect,
    };
    Offer {
        app: "faithful".to_string(),
        instance: "1".to_string(),
        interfaces: interfaces().into_iter().chain(interface(UI_HISTORY)).collect(),
        actions: vec![
            action("count", json!({ "kind": "null" }), SideEffect::ReadOnly),
            action("send", json!({ "kind": "text" }), SideEffect::NonIdempotent),
        ],
        state_head: Some(format!("s{head}")),
        history: Some(HistoryOffer { oldest: Some(OLDEST), newest: Some(newest), fixtures: true }),
        grades: vec![Grade::Emitted, Grade::Captured],
        replay_policy: Vec::new(),
        sandboxes: Vec::new(),
        input: Some(InputOffer { presents: true, takeover: false }),
    }
}

impl UiApp for Faithful {
    async fn offer(&self) -> Offer {
        let mut offer = offer_of(self.head.load(Ordering::Relaxed), self.newest.load(Ordering::Relaxed));
        if self.flaw == Flaw::Fingerprint {
            offer.interfaces[0].fingerprint = "none".to_string();
        }
        if self.flaw == Flaw::ShowsAnything {
            offer.history = Some(HistoryOffer { oldest: Some(1), newest: Some(u64::MAX), fixtures: true });
        }
        if self.flaw == Flaw::GradesUnlisted {
            offer.grades.clear();
        }
        if self.flaw == Flaw::UndeclaredSandbox {
            offer.replay_policy = vec![PolicyEntry {
                covers: Covers::Class { class: SideEffect::IdempotentWrite },
                vary: Some(ReplayDisposition::Sandboxed),
                continue_after_cut: None,
                sandbox: Some("scratch".to_string()),
            }];
        }
        offer
    }

    async fn observe(&self, call: ObserveCall) -> Observation {
        if self.flaw == Flaw::ObservingMoves {
            self.head.fetch_add(1, Ordering::Relaxed);
        }
        let wants = |part: Part| call.parts.contains(&part);
        let whole_frame = call.scale.is_none() && call.region.is_none();
        let capture = wants(Part::Capture) && whole_frame;
        let answer = Capture {
            png: if self.flaw == Flaw::CaptureSize { png_of(1, 1) } else { png_of(WIDTH, HEIGHT) },
            width: WIDTH,
            height: HEIGHT,
            scale_factor: 1.0,
            presented: self.flaw == Flaw::PresentsFrameOnly || !call.frame_only,
        };
        let wide = if self.flaw == Flaw::NodeOutside { 900.0 } else { f64::from(WIDTH) };
        let observed = self.observed.fetch_add(1, Ordering::Relaxed);
        let renamed = |mut node: LayoutNode| {
            if self.flaw == Flaw::FrameIds {
                node.id = format!("n{observed}");
            }
            node
        };
        let state = match self.showing() {
            Shown::Fixture { handle } => StatePart { value: self.fixture.lock().expect("the lock").clone(), head: handle, ..self.live() },
            _ => self.live(),
        };
        let unasked = self.flaw == Flaw::UnaskedPart;
        let observation = Observation {
            frame: Some("live".to_string()),
            capture: capture.then_some(answer),
            layout: (wants(Part::Layout) || unasked).then(|| renamed(layout(wide))),
            state: wants(Part::State).then_some(state),
            refused: (wants(Part::Capture) && !whole_frame)
                .then(|| x0k_ui_protocol::observe::PartRefused {
                    part: Part::Capture,
                    code: None,
                    why: "whole frames only".to_string(),
                })
                .into_iter()
                .collect(),
            shown: match (self.flaw, self.showing()) {
                (Flaw::ShownUnnamed, _) => None,
                (Flaw::FixtureUnnamed, Shown::Fixture { .. }) => Some(Shown::Live),
                (_, shown) => Some(shown),
            },
        };
        if let (Condition::EndsFixture, Shown::Fixture { handle }) = (self.condition, self.showing()) {
            *self.shown.lock().expect("the lock") = Shown::Live;
            *self.ended.lock().expect("the lock") = Some(handle);
        }
        observation
    }

    async fn invoke(&self, _action: &Action, args: Value) -> Outcome {
        Outcome::Done { result: args, frame: Some("live".to_string()) }
    }

    async fn held_frames(&self) -> Vec<HeldFrame> {
        let held = HeldFrame {
            frame: "live".to_string(),
            width: WIDTH,
            height: HEIGHT,
            layout: Some(layout(f64::from(WIDTH))),
        };
        vec![held]
    }

    async fn perform(&self, perform: Perform, _resolved: Vec<Resolved>) -> Option<String> {
        let presses = perform.sources.iter().flat_map(|source| &source.steps).filter(|step| matches!(step, Step::Down { .. } | Step::KeyDown { .. })).count();
        if perform.presented() && perform.pace == Pace::Watchable && self.flaw != Flaw::HastyPace {
            tokio::time::sleep(std::time::Duration::from_millis(WATCHABLE_PRESS_MS * presses as u64)).await;
        }
        Some("live".to_string())
    }

    async fn shown(&self) -> Shown {
        match (self.flaw, self.showing()) {
            (Flaw::PastTakesInput, Shown::Position { .. }) => Shown::Live,
            (Flaw::FixtureLocks, Shown::Fixture { .. }) => Shown::Position { position: NEWEST - 1 },
            (_, shown) => shown,
        }
    }

    async fn history(&self, call: HistoryCall) -> History {
        let newest = self.newest.load(Ordering::Relaxed);
        let limit = if self.flaw == Flaw::PastTheLimit { usize::MAX } else { call.limit as usize };
        let (from, to) = (call.from.unwrap_or(OLDEST).max(OLDEST), call.to.unwrap_or(newest).min(newest));
        let positions = (from..=to).rev().take(limit).map(|position| Position {
            position,
            at_us: position * 1000,
            changes: vec![format!("change {position}")],
            trace_ids: vec![format!("{position:032x}")],
            span_ids: vec![format!("{position:016x}")],
            grade: Grade::Captured,
            state: call.include_state.then(|| json!({ "position": position })),
        });
        History { oldest: Some(OLDEST), newest: Some(newest), shown: self.showing(), positions: positions.collect() }
    }

    async fn navigate(&self, to: Destination) -> NavigateAnswer {
        let shown = match to {
            Destination::Live => Shown::Live,
            Destination::Position { position } => {
                if self.flaw == Flaw::NavigatingRecords {
                    self.newest.fetch_add(1, Ordering::Relaxed);
                }
                Shown::Position { position }
            }
        };
        *self.shown.lock().expect("the lock") = shown.clone();
        NavigateAnswer::Shown { shown, frame: Some("live".to_string()) }
    }

    fn state_shape(&self) -> Option<Datum> {
        Some(state_shape())
    }

    async fn live_state(&self) -> Option<StatePart> {
        Some(self.live())
    }

    async fn present(&self, state: Value) -> PresentAnswer {
        if self.condition == Condition::DeclinesFixtures {
            return PresentAnswer::Refused(Refused::new(RefusalCode::Declined, UI_HISTORY, APPROVAL));
        }
        let handle = format!("x{}", self.presented.fetch_add(1, Ordering::Relaxed) + 1);
        if self.flaw == Flaw::FixtureMovesLive {
            self.head.fetch_add(1, Ordering::Relaxed);
        }
        let replaced = std::mem::replace(&mut *self.shown.lock().expect("the lock"), Shown::Fixture { handle: handle.clone() });
        if let (Flaw::TwoFixtures, Shown::Fixture { handle }) = (self.flaw, replaced) {
            self.beside.lock().expect("the lock").push(handle);
        }
        *self.fixture.lock().expect("the lock") = state;
        PresentAnswer::Presented { handle, frame: Some("live".to_string()) }
    }

    async fn release(&self, handle: String) -> ReleaseAnswer {
        let mut beside = self.beside.lock().expect("the lock");
        if let Some(at) = beside.iter().position(|standing| *standing == handle) {
            beside.remove(at);
            return ReleaseAnswer::Released { frame: Some("live".to_string()) };
        }
        let mut shown = self.shown.lock().expect("the lock");
        if *shown != (Shown::Fixture { handle: handle.clone() }) {
            return ReleaseAnswer::NotStanding { handle };
        }
        if self.flaw != Flaw::KeepsFixture {
            *shown = Shown::Live;
        }
        ReleaseAnswer::Released { frame: Some("live".to_string()) }
    }

    async fn cannot_paint(&self) -> Option<String> {
        (self.condition == Condition::CannotPaint).then(|| "the window is minimised".to_string())
    }

    fn delivers(&self) -> &[&str] {
        match self.condition {
            Condition::NoTouch => &["mouse", "key", "wheel"],
            _ => SOURCE_KINDS,
        }
    }

    async fn declines(&self, _call: Declinable<'_>) -> Option<String> {
        (self.condition == Condition::DeclinesUnderFixture).then(|| APPROVAL.to_string())
    }

    async fn fixture_ended(&self, handle: &str) -> Option<String> {
        let ended = self.ended.lock().expect("the lock");
        (ended.as_deref() == Some(handle)).then(|| ARRIVED.to_string())
    }
}

fn acting() -> Options {
    let act = Invoke { action: "send".to_string(), args: json!("hello") };
    Options { act: Some(act), ..Options::default() }
}

async fn report_of(flaw: Flaw) -> Report {
    report_of_app(Faithful::new(flaw)).await
}

async fn report_of_app(app: Faithful) -> Report {
    let (ours, theirs) = tokio::io::duplex(1 << 20);
    let grant = Grant { classes: vec![SideEffect::ReadOnly, SideEffect::NonIdempotent] };
    tokio::spawn(serve_connection(theirs, Arc::new(Endpoint::new(app, grant))));
    let client = UiClient::open(ours).await.expect("a session");
    run(&client, &acting()).await.expect("a report")
}

fn broken_claims(report: &Report) -> Vec<&str> {
    report.broken().iter().map(|case| case.claim.as_str()).collect()
}

#[tokio::test]
async fn a_faithful_app_breaks_nothing_and_runs_every_refusing_vector() {
    let report = report_of(Flaw::None).await;
    assert_eq!(broken_claims(&report), Vec::<&str>::new());
    let held = |claim: &str| {
        report.cases.iter().any(|case| case.claim == claim && case.verdict == Verdict::Holds)
    };
    assert!(held("an unknown key"), "{report:?}");
    assert!(held("a frame the app no longer holds"), "{report:?}");
    assert!(held("a position outside the frame"), "{report:?}");
    assert!(held("one bad step refuses the whole sequence, so nothing resolves"), "{report:?}");
    assert!(held("a pointer move to a layout node runs and names the frame after it"));
    assert!(held("a capture asked for as the frame alone carries no drawing of driver input"), "{report:?}");
    assert!(held("a takeover the offer does not say the app holds is refused before any of the sequence runs"), "{report:?}");
    assert!(held("a click at the watchable pace answers no sooner than its floor"), "{report:?}");
    for claim in [
        "a history answers its call",
        "a position the app no longer holds is unavailable, naming the oldest it holds",
        "input while a past position is shown is refused as showing_past",
        "an actuating action while a past position is shown is refused as showing_past",
        "a read-only action runs while a past position is shown",
        "navigating performs nothing: the history gains no position",
        "every grade a history answers a position at is one the offer lists",
        "the offer's replay policy lowers no floor and names only sandboxes it declares",
        "a fixture with another shape's fingerprint is refused, naming it",
        "a fixture naming a head the live state is not at is refused, naming the current head",
        "a state that does not fit the app's state shape is refused as misfit_state",
        "a refused fixture shows nothing: the app still shows its live state",
        "presenting a fixture shows it and names its frame",
        "an observation names the fixture it shows",
        "input reaches the app while a fixture stands",
        "a read-only action runs while a fixture stands",
        "an action above read_only takes the disposition the replay policy gives it, and a non_idempotent one is never performed",
        "one fixture stands at a time: a second present replaces the first",
        "releasing a fixture shows the live state",
        "releasing a fixture that does not stand answers that it does not stand",
        "a fixture never changes the live state: presenting and releasing leaves its head where it was",
        SOURCE_KINDS_CLAIM,
    ] {
        assert!(held(claim), "{claim}: {report:?}");
    }
    for claim in CANNOT_PAINT_CLAIMS {
        assert!(verdict_of(&report, claim).is_some_and(|verdict| matches!(verdict, Verdict::Unreachable(_))), "{claim}: {report:?}");
    }
}

const FIXTURE_ENDED_CLAIMS: [&str; 3] = [
    "the call after the app ended its fixture is refused as fixture_ended, naming the fixture",
    "an app that ends a fixture itself shows its live state",
    "releasing a fixture the app ended answers that it ended, with the app's reason",
];

const SOURCE_KINDS_CLAIM: &str =
    "a source kind the model has is delivered or refused as undeliverable_source naming it, never as unknown_source";
const CANNOT_PAINT_CLAIMS: [&str; 3] = [
    "while the host cannot paint the window, an observation refuses only the capture, as cannot_paint",
    "while the host cannot paint the window, an action is refused as cannot_paint within a second",
    "while the host cannot paint the window, input is refused as cannot_paint within a second",
];

fn verdict_of<'r>(report: &'r Report, claim: &str) -> Option<&'r Verdict> {
    report.cases.iter().find(|case| case.claim == claim).map(|case| &case.verdict)
}

fn unreachable_because(report: &Report, claim: &str, because: &str) -> bool {
    matches!(verdict_of(report, claim), Some(Verdict::Unreachable(why)) if why.contains(because))
}

#[tokio::test]
async fn an_app_whose_host_cannot_paint_refuses_act_and_input_at_once_and_keeps_its_layout_and_state() {
    let report = report_of_app(Faithful::under(Condition::CannotPaint)).await;
    assert_eq!(broken_claims(&report), Vec::<&str>::new(), "{report:?}");
    for claim in CANNOT_PAINT_CLAIMS.into_iter().chain([SOURCE_KINDS_CLAIM]) {
        assert_eq!(verdict_of(&report, claim), Some(&Verdict::Holds), "{claim}: {report:?}");
    }
    let shown = "the app acts, takes input, goes back and shows fixtures while its host paints";
    assert!(unreachable_because(&report, shown, "the window is minimised"), "{report:?}");
}

#[tokio::test]
async fn a_host_that_delivers_no_touch_refuses_it_by_its_own_name() {
    let report = report_of_app(Faithful::under(Condition::NoTouch)).await;
    assert_eq!(broken_claims(&report), Vec::<&str>::new(), "{report:?}");
    assert_eq!(verdict_of(&report, SOURCE_KINDS_CLAIM), Some(&Verdict::Holds), "{report:?}");
}

#[tokio::test]
async fn a_fixture_the_app_declines_is_unreachable_with_its_reason_and_breaks_nothing() {
    let report = report_of_app(Faithful::under(Condition::DeclinesFixtures)).await;
    assert_eq!(broken_claims(&report), Vec::<&str>::new(), "{report:?}");
    for claim in [
        "presenting a fixture shows it and names its frame",
        "a fixture never changes the live state: presenting and releasing leaves its head where it was",
    ] {
        assert!(unreachable_because(&report, claim, APPROVAL), "{claim}: {report:?}");
    }
}

#[tokio::test]
async fn actions_and_input_the_app_declines_under_a_fixture_are_unreachable_with_its_reason() {
    let report = report_of_app(Faithful::under(Condition::DeclinesUnderFixture)).await;
    assert_eq!(broken_claims(&report), Vec::<&str>::new(), "{report:?}");
    for claim in ["input reaches the app while a fixture stands", "a read-only action runs while a fixture stands", ACTING] {
        assert!(unreachable_because(&report, claim, APPROVAL), "{claim}: {report:?}");
    }
}

#[tokio::test]
async fn a_fixture_the_app_ends_itself_is_told_with_its_reason_and_breaks_nothing() {
    let report = report_of_app(Faithful::under(Condition::EndsFixture)).await;
    assert_eq!(broken_claims(&report), Vec::<&str>::new(), "{report:?}");
    assert!(unreachable_because(&report, "input reaches the app while a fixture stands", ARRIVED), "{report:?}");
    for claim in FIXTURE_ENDED_CLAIMS {
        assert_eq!(verdict_of(&report, claim), Some(&Verdict::Holds), "{claim}: {report:?}");
    }
    assert!(unreachable_because(&report, "replacing and releasing a fixture", ARRIVED), "{report:?}");
}

#[tokio::test]
async fn a_frame_only_capture_that_carries_the_drawing_is_broken() {
    let report = report_of(Flaw::PresentsFrameOnly).await;
    let broken = broken_claims(&report);
    assert!(broken.contains(&"a capture asked for as the frame alone carries no drawing of driver input"), "{report:?}");
}

#[tokio::test]
async fn an_app_that_draws_input_and_answers_a_watchable_click_at_once_is_broken() {
    let report = report_of(Flaw::HastyPace).await;
    assert_eq!(broken_claims(&report), vec!["a click at the watchable pace answers no sooner than its floor"], "{report:?}");
}

#[tokio::test]
async fn a_fixture_that_moves_the_live_state_is_broken() {
    let report = report_of(Flaw::FixtureMovesLive).await;
    let broken = broken_claims(&report);
    let claim = "a fixture never changes the live state: presenting and releasing leaves its head where it was";
    assert!(broken.contains(&claim), "{broken:?}");
}

#[tokio::test]
async fn an_observation_that_does_not_name_its_fixture_is_broken() {
    let report = report_of(Flaw::FixtureUnnamed).await;
    let broken = broken_claims(&report);
    assert!(broken.contains(&"an observation names the fixture it shows"), "{broken:?}");
}

#[tokio::test]
async fn an_app_that_keeps_showing_a_released_fixture_is_broken() {
    let report = report_of(Flaw::KeepsFixture).await;
    let broken = broken_claims(&report);
    assert!(broken.contains(&"releasing a fixture shows the live state"), "{broken:?}");
}

#[tokio::test]
async fn an_app_that_refuses_input_under_a_fixture_is_broken() {
    let report = report_of(Flaw::FixtureLocks).await;
    let broken = broken_claims(&report);
    for claim in ["input reaches the app while a fixture stands", ACTING] {
        assert!(broken.contains(&claim), "{claim}: {broken:?}");
    }
}

const ACTING: &str =
    "an action above read_only takes the disposition the replay policy gives it, and a non_idempotent one is never performed";

#[tokio::test]
async fn an_app_that_lets_two_fixtures_stand_is_broken() {
    let report = report_of(Flaw::TwoFixtures).await;
    assert_eq!(broken_claims(&report), ["one fixture stands at a time: a second present replaces the first"]);
}

#[tokio::test]
async fn an_offer_that_lists_no_grade_its_history_answers_at_is_broken() {
    let report = report_of(Flaw::GradesUnlisted).await;
    assert_eq!(broken_claims(&report), ["every grade a history answers a position at is one the offer lists"]);
}

#[tokio::test]
async fn a_policy_naming_a_sandbox_it_does_not_declare_is_broken() {
    let report = report_of(Flaw::UndeclaredSandbox).await;
    assert_eq!(broken_claims(&report), ["the offer's replay policy lowers no floor and names only sandboxes it declares"]);
}

#[tokio::test]
async fn an_observation_that_does_not_name_what_it_shows_is_broken() {
    let report = report_of(Flaw::ShownUnnamed).await;
    let broken = broken_claims(&report);
    assert!(broken.iter().any(|claim| claim.contains("[Capture] answers its call")), "{broken:?}");
    assert!(broken.contains(&"an observation names the past position it shows"), "{broken:?}");
}

#[tokio::test]
async fn an_app_that_takes_input_while_it_shows_the_past_is_broken() {
    let report = report_of(Flaw::PastTakesInput).await;
    assert_eq!(
        broken_claims(&report),
        [
            "input while a past position is shown is refused as showing_past",
            "an actuating action while a past position is shown is refused as showing_past",
        ]
    );
}

#[tokio::test]
async fn an_app_whose_history_grows_when_it_goes_back_is_broken() {
    let report = report_of(Flaw::NavigatingRecords).await;
    let broken = broken_claims(&report);
    assert!(broken.contains(&"navigating performs nothing: the history gains no position"), "{broken:?}");
}

#[tokio::test]
async fn a_history_past_its_limit_is_broken() {
    let report = report_of(Flaw::PastTheLimit).await;
    let broken = broken_claims(&report);
    assert!(broken.contains(&"a history holds no more positions than its limit"), "{broken:?}");
}

#[tokio::test]
async fn an_app_that_shows_what_it_never_had_or_dropped_is_broken() {
    let report = report_of(Flaw::ShowsAnything).await;
    let broken = broken_claims(&report);
    for claim in [
        "a position the app never had is refused by name",
        "a position the app no longer holds is unavailable, naming the oldest it holds",
        "the offer names the oldest and newest position the history holds",
    ] {
        assert!(broken.contains(&claim), "{claim}: {broken:?}");
    }
}

#[tokio::test]
async fn an_app_answering_a_part_nobody_asked_for_is_broken() {
    let report = report_of(Flaw::UnaskedPart).await;
    let broken = broken_claims(&report);
    assert!(broken.iter().any(|claim| claim.contains("[Capture] answers its call")), "{broken:?}");
    assert!(broken.iter().all(|claim| claim.contains("answers its call")), "{broken:?}");
}

#[tokio::test]
async fn a_capture_that_is_not_the_size_it_says_is_broken() {
    let report = report_of(Flaw::CaptureSize).await;
    let broken = broken_claims(&report);
    assert!(broken.iter().any(|claim| claim.contains("[Capture] answers its call")), "{broken:?}");
}

#[tokio::test]
async fn a_visible_node_outside_the_capture_is_broken() {
    let report = report_of(Flaw::NodeOutside).await;
    let broken = broken_claims(&report);
    assert!(
        broken.iter().any(|claim| claim.contains("[Capture, Layout] answers its call")),
        "{broken:?}"
    );
}

#[tokio::test]
async fn a_head_that_moves_whenever_it_is_observed_is_broken() {
    let report = report_of(Flaw::ObservingMoves).await;
    assert_eq!(broken_claims(&report), ["observing changes nothing"]);
}

#[tokio::test]
async fn an_id_that_lasts_one_frame_is_broken() {
    let report = report_of(Flaw::FrameIds).await;
    let broken = broken_claims(&report);
    assert!(broken.contains(&"a node keeps its id from frame to frame"), "{broken:?}");
}

#[tokio::test]
async fn an_interface_with_a_fingerprint_not_its_own_is_broken() {
    let report = report_of(Flaw::Fingerprint).await;
    assert_eq!(broken_claims(&report), ["each interface carries its operations' fingerprint"]);
}

fn socket(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("uic-{}-{name}", std::process::id()))
}

#[tokio::test]
async fn an_oversized_frame_costs_a_faithful_app_nothing() {
    let path = socket("faithful");
    let endpoint = Arc::new(Endpoint::new(Faithful::new(Flaw::None), Grant { classes: Vec::new() }));
    let listening = path.clone();
    tokio::spawn(async move { listen(&listening, endpoint).await });
    while !path.exists() {
        tokio::task::yield_now().await;
    }
    let case = an_oversized_frame(&path).await;
    assert_eq!(case.verdict, Verdict::Holds, "{case:?}");
    std::fs::remove_file(&path).expect("cleaned up");
}

#[tokio::test]
async fn an_app_an_oversized_frame_takes_down_is_broken() {
    let path = socket("fragile");
    let listener = UnixListener::bind(&path).expect("a socket");
    tokio::spawn(async move {
        let _ = listener.accept().await;
    });
    let case = an_oversized_frame(&path).await;
    assert!(matches!(case.verdict, Verdict::Broken(_)), "{case:?}");
    std::fs::remove_file(&path).expect("cleaned up");
}

#[tokio::test]
async fn a_session_s_end_returns_a_faithful_app_to_live() {
    let path = socket("session-end");
    let endpoint = Arc::new(Endpoint::new(Faithful::new(Flaw::None), Grant { classes: Vec::new() }));
    let listening = path.clone();
    tokio::spawn(async move { listen(&listening, endpoint).await });
    while !path.exists() {
        tokio::task::yield_now().await;
    }
    let case = a_session_end_returns_to_live(&path).await;
    assert_eq!(case.verdict, Verdict::Holds, "{case:?}");
    std::fs::remove_file(&path).expect("cleaned up");
}

#[tokio::test]
async fn a_session_s_end_releases_a_faithful_app_s_fixture() {
    let path = socket("fixture-end");
    let endpoint = Arc::new(Endpoint::new(Faithful::new(Flaw::None), Grant { classes: Vec::new() }));
    let listening = path.clone();
    tokio::spawn(async move { listen(&listening, endpoint).await });
    while !path.exists() {
        tokio::task::yield_now().await;
    }
    let case = a_session_end_releases_its_fixture(&path).await;
    assert_eq!(case.verdict, Verdict::Holds, "{case:?}");
    std::fs::remove_file(&path).expect("cleaned up");
}

#[tokio::test]
async fn an_app_no_session_s_end_reaches_keeps_its_fixture_and_is_broken() {
    let path = socket("no-fixture-end");
    let listener = UnixListener::bind(&path).expect("a socket");
    let endpoint = Arc::new(Endpoint::new(Faithful::new(Flaw::None), Grant { classes: Vec::new() }));
    tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let agreed = Arc::new(shapes().expect("shapes"));
            tokio::spawn(serve(stream, Arc::clone(&endpoint), SessionPolicy::default(), agreed, None));
        }
    });
    let case = a_session_end_releases_its_fixture(&path).await;
    assert!(matches!(case.verdict, Verdict::Broken(_)), "{case:?}");
    std::fs::remove_file(&path).expect("cleaned up");
}

#[tokio::test]
async fn an_app_no_session_s_end_reaches_is_broken() {
    let path = socket("no-session-end");
    let listener = UnixListener::bind(&path).expect("a socket");
    let endpoint = Arc::new(Endpoint::new(Faithful::new(Flaw::None), Grant { classes: Vec::new() }));
    tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let agreed = Arc::new(shapes().expect("shapes"));
            tokio::spawn(serve(stream, Arc::clone(&endpoint), SessionPolicy::default(), agreed, None));
        }
    });
    let case = a_session_end_returns_to_live(&path).await;
    assert!(matches!(case.verdict, Verdict::Broken(_)), "{case:?}");
    std::fs::remove_file(&path).expect("cleaned up");
}

/// Answers every call as done, on the wire, with no `Endpoint` to stop it.
struct YesToEverything;

/// A handle no two presents share.
fn rand_handle() -> u64 {
    static PRESENTED: AtomicU64 = AtomicU64::new(0);
    PRESENTED.fetch_add(1, Ordering::Relaxed)
}

impl Callee for YesToEverything {
    async fn call(&self, heard: Heard) -> Answer {
        let done = |answer: Result<Datum, _>| match answer {
            Ok(value) => Answer::Reply(value),
            Err(fault) => Answer::Refused(format!("{fault}")),
        };
        match heard.operation.as_str() {
            OFFER => done(to_wire(&offer_of(1, NEWEST))),
            INVOKE => {
                let frame = Some("live".to_string());
                done(to_wire(&InvokeAnswer::Done { result: Value::Null, frame }))
            }
            PERFORM => done(to_wire(&PerformAnswer::Done { frame: Some("live".to_string()) })),
            PRESENT => {
                let handle = format!("x{}", rand_handle());
                done(to_wire(&PresentAnswer::Presented { handle, frame: Some("live".to_string()) }))
            }
            RELEASE => done(to_wire(&ReleaseAnswer::Released { frame: Some("live".to_string()) })),
            _ => {
                let capture = Capture {
                    png: Vec::new(),
                    width: WIDTH,
                    height: HEIGHT,
                    scale_factor: 1.0,
                    presented: false,
                };
                let observation = Observation {
                    frame: Some("live".to_string()),
                    capture: Some(capture),
                    layout: Some(layout(f64::from(WIDTH))),
                    state: Some(Faithful::new(Flaw::None).live()),
                    refused: Vec::new(),
                    shown: Some(Shown::Live),
                };
                done(x0k_ui_endpoint::wire::encode_observation(&observation))
            }
        }
    }
}

#[tokio::test]
async fn an_app_that_refuses_nothing_breaks_every_refusal() {
    let (ours, theirs) = tokio::io::duplex(1 << 20);
    let agreed = Arc::new(shapes().expect("shapes"));
    tokio::spawn(serve(theirs, Arc::new(YesToEverything), SessionPolicy::default(), agreed, None));
    let client = UiClient::open(ours).await.expect("a session");
    let report = run(&client, &Options::default()).await.expect("a report");
    let broken = broken_claims(&report);
    for claim in [
        "an action the offer does not list is refused",
        "arguments that misfit the action's shape are refused",
        "a source of a kind the model does not have",
        "two sources with one id",
        "a step its source cannot perform",
        "an unknown key",
        "a position outside the frame",
        "a frame the app no longer holds",
        "a layout node the named frame does not hold",
    ] {
        assert!(broken.contains(&claim), "{claim} held: {broken:?}");
    }
}

#[tokio::test]
async fn an_app_that_presents_anything_and_performs_under_a_fixture_breaks_section_four() {
    let (ours, theirs) = tokio::io::duplex(1 << 20);
    let agreed = Arc::new(shapes().expect("shapes"));
    tokio::spawn(serve(theirs, Arc::new(YesToEverything), SessionPolicy::default(), agreed, None));
    let client = UiClient::open(ours).await.expect("a session");
    let report = run(&client, &acting()).await.expect("a report");
    let broken = broken_claims(&report);
    for claim in [
        "a fixture with another shape's fingerprint is refused, naming it",
        "a fixture naming a head the live state is not at is refused, naming the current head",
        "an action above read_only takes the disposition the replay policy gives it, and a non_idempotent one is never performed",
    ] {
        assert!(broken.contains(&claim), "{claim} held: {broken:?}");
    }
}
```

## Holding the trace claim

The trace claim is held in a test binary of its own. A thread's default subscriber
and a span's callsite meet process-wide, so a test beside others on other threads
can find the span disabled. Every test here installs its subscriber.

The witness reads the spans of the app's own process and holds only when one
carries the suite's `traceparent` as given. `ForgetsTrace` is an endpoint behind a
callee that drops the trace before the endpoint hears the call, so its work runs
in no caller's trace. The faithful run also holds that a call made without a trace
puts none in the app's spans: the suite's one traced call is the only trace they
carry.

<a name="chunk-trace-test"></a><sub>[`tests/trace.rs`](../../crates/x0k-ui-endpoint/tests/trace.rs) · `#trace-test`</sub>

```rust {#trace-test file="tests/trace.rs"}
//! The suite's trace claim, held on an app that carries a caller's trace and
//! broken on one that forgets it. Its own binary: see the chapter.

use std::sync::{Arc, Mutex};

use serde_json::Value;
use tracing_subscriber::layer::SubscriberExt;
use x0k_operation_session::session::{serve, Answer, Callee, Heard, SessionPolicy};
use x0k_ui_endpoint::client::UiClient;
use x0k_ui_endpoint::conformance::{run, Options, Report, TraceWitness, Verdict};
use x0k_ui_endpoint::server::{Endpoint, UiApp};
use x0k_ui_endpoint::shapes;
use x0k_ui_protocol::act::{Grant, Outcome};
use x0k_ui_protocol::input::{HeldFrame, Perform, Resolved};
use x0k_ui_protocol::observe::{Observation, ObserveCall};
use x0k_ui_protocol::offer::{Action, Offer};
use x0k_ui_protocol::shapes::interfaces;

const ANSWERED: &str = "a call carrying the caller's traceparent is answered";
const JOINED: &str = "the app's work in answer to a call joins the caller's trace";

/// Answers its offer, which is all the trace claim asks of it.
struct Offers;

impl UiApp for Offers {
    async fn offer(&self) -> Offer {
        Offer {
            app: "trace-test".to_string(),
            instance: "1".to_string(),
            interfaces: interfaces(),
            actions: Vec::new(),
            state_head: None,
            history: None,
            grades: Vec::new(),
            replay_policy: Vec::new(),
            sandboxes: Vec::new(),
            input: None,
        }
    }

    async fn observe(&self, _call: ObserveCall) -> Observation {
        let shown = Some(x0k_ui_protocol::history::Shown::Live);
        Observation { frame: None, capture: None, layout: None, state: None, refused: Vec::new(), shown }
    }

    async fn invoke(&self, _action: &Action, args: Value) -> Outcome {
        Outcome::Done { result: args, frame: None }
    }

    async fn held_frames(&self) -> Vec<HeldFrame> {
        Vec::new()
    }

    async fn perform(&self, _perform: Perform, _resolved: Vec<Resolved>) -> Option<String> {
        None
    }
}

/// An endpoint that never hears the caller's trace.
struct ForgetsTrace(Endpoint<Offers>);

impl Callee for ForgetsTrace {
    async fn call(&self, heard: Heard) -> Answer {
        self.0.call(Heard { trace: None, ..heard }).await
    }
}

/// Each span's `traceparent` field, as a subscriber in the app's process sees it.
#[derive(Clone, Default)]
struct Spans(Arc<Mutex<Vec<String>>>);

impl tracing::field::Visit for Spans {
    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        if field.name() == "traceparent" {
            self.0.lock().expect("the lock").push(value.to_string());
        }
    }

    fn record_debug(&mut self, _field: &tracing::field::Field, _value: &dyn std::fmt::Debug) {}
}

impl<S: tracing::Subscriber> tracing_subscriber::Layer<S> for Spans {
    fn on_new_span(
        &self,
        attrs: &tracing::span::Attributes<'_>,
        _id: &tracing::span::Id,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        attrs.record(&mut self.clone());
    }
}

/// A run against `callee`, witnessed by the spans of this process when
/// `witnessed`: the report, the traceparents the spans carried, and those the
/// witness was asked about.
async fn run_against<C: Callee>(callee: C, witnessed: bool) -> (Report, Vec<String>, Vec<String>) {
    let spans = Spans::default();
    let _default = tracing::subscriber::set_default(tracing_subscriber::registry().with(spans.clone()));
    let asked = Arc::new(Mutex::new(Vec::new()));
    let witness: TraceWitness = {
        let (spans, asked) = (spans.clone(), Arc::clone(&asked));
        Arc::new(move |traceparent: &str| {
            asked.lock().expect("the lock").push(traceparent.to_string());
            spans.0.lock().expect("the lock").iter().any(|carried| carried == traceparent)
        })
    };
    let (ours, theirs) = tokio::io::duplex(1 << 20);
    let agreed = Arc::new(shapes().expect("shapes"));
    tokio::spawn(serve(theirs, Arc::new(callee), SessionPolicy::default(), agreed, None));
    let client = UiClient::open(ours).await.expect("a session");
    let options = Options { trace: witnessed.then_some(witness), ..Options::default() };
    let report = run(&client, &options).await.expect("a report");
    let carried = spans.0.lock().expect("the lock").clone();
    let asked = asked.lock().expect("the lock").clone();
    (report, carried, asked)
}

fn verdict<'r>(report: &'r Report, claim: &str) -> &'r Verdict {
    let case = report.cases.iter().find(|case| case.claim == claim);
    &case.unwrap_or_else(|| panic!("no case {claim}: {report:?}")).verdict
}

fn endpoint() -> Endpoint<Offers> {
    Endpoint::new(Offers, Grant { classes: vec![] })
}

#[tokio::test]
async fn an_app_that_runs_a_call_in_its_callers_trace_holds_the_claim() {
    let (report, carried, asked) = run_against(endpoint(), true).await;
    assert_eq!(verdict(&report, ANSWERED), &Verdict::Holds);
    assert_eq!(verdict(&report, JOINED), &Verdict::Holds);
    assert_eq!(asked.len(), 1, "{asked:?}");
    assert_eq!(carried, asked, "only the traced call carries a trace");
}

#[tokio::test]
async fn an_app_that_forgets_the_callers_trace_breaks_the_claim() {
    let (report, carried, _) = run_against(ForgetsTrace(endpoint()), true).await;
    assert_eq!(verdict(&report, ANSWERED), &Verdict::Holds);
    assert!(matches!(verdict(&report, JOINED), Verdict::Broken(_)), "{report:?}");
    assert_eq!(carried, Vec::<String>::new());
}

#[tokio::test]
async fn with_no_witness_the_claim_is_unreachable_and_not_held() {
    let (report, _, asked) = run_against(endpoint(), false).await;
    assert!(matches!(verdict(&report, JOINED), Verdict::Unreachable(_)), "{report:?}");
    assert_eq!(asked, Vec::<String>::new());
}
```
