
# UI Control Channel

```turtle folio:document
architecture:ui-control-channel a x0k:Architecture ;
    x0k:status "accepted" ;
    x0k:supports design:ui-driver ;
    x0k:motivatedBy architecture:fleet-streams,
        architecture:state-representation,
        architecture:query-subscriptions,
        architecture:observability-timeline ;
    x0k:mentions architecture:service-authorization,
        architecture:applications-are-tenants,
        architecture:operation-surface,
        architecture:core-and-edges,
        architecture:graded-introspection,
        architecture:ui-interfaces ;
    x0k:motivatedBy intent:396792f0-be07-c3dd-e35d-a95f93c74fe3,
        intent:761c189e-6c4d-b04a-4f07-3812cca3780d .
```

## Brief

An agent — or the operator's driver tooling — reaches a running surface
the way it reaches any service in the fleet: it opens the app's control
service, sends the action, and the result returns on the same stream,
delivered when it happens rather than discovered by re-reading an
archive. What an app offers stands as a handful of current-value facts
you can subscribe to — its identity, its liveness, the actions it
registers, the head of its visible state — so a driver learns "the
shell is here and answers these verbs" the moment it becomes true, and
learns of its death by the same route. A node's own liveness rides the
same plane, so "is this device answering" is asked the same way.
Because the reach is the fleet's own service machinery, driving a shell
on another device is the same act as driving the one beside you, under
the same grants and the same revocation as every other capability you
hold.

Any app can be driven this way, in any language. The endpoint speaks the
canonical CBOR frames that every x0k boundary speaks, so a TypeScript GUI
in a webview, a Swift app on a phone and x0k's own shell answer one
protocol, and one set of driver tools reaches all of them. The first thing
a driver can do is look: read what an app offers, and take its screenshot,
its layout tree and its presentable state from one frame, with no power to
change anything. Then it can act, as the app's own user would: invoke one
of the actions the app names, or move a pointer and type.

Nothing about an action exchange outlives it on disk. The record of
what was done — which actions ran, when, at whose request, with what
result — belongs to the timeline, where every other observation of the
running system already lives.

## Context

The `ui-driver` design defines the experience: driver tools discover
running UI apps, dispatch actions into them, read their state, capture
what they show. What that experience needs from the substrate splits
into three lifetimes that could not be more different. The exchange
itself — request out, result back — lives for seconds and is worthless
the moment either party is gone. The offer — which apps are up, what
each can do, where its state stands — lives exactly as long as the app
does, and only its latest value is ever meaningful. The audit — what
was done to a surface and by whom — is history, valuable indefinitely
and most valuable correlated with everything else that happened.

Each of those shapes already has a decided home. `fleet-streams` gives
live exchange between processes a named, deny-by-default, capability-
checked service surface. The fact plane of `state-representation`, read
through `query-subscriptions`' maintained views, gives latest-value
state its subscription semantics — consumers wake on change instead of
polling. `observability-timeline` gives history one queryable record
set. What has been undecided is which of these the UI control surface
uses. This ADR decides: all three, each for its lifetime — and no
fourth substrate in between.

The practice this decision leaves on the endpoint is length-prefixed JSON
frames whose layout is the serde form of x0k's Rust types, which only x0k's
own crate writes and reads, and an observation that is three separate
driver calls (a screenshot, a layout tree, a state read) with nothing tying
them to one frame. `operation-surface` §1 rules the first out for any
boundary between processes.

## Decision

### 1. The control exchange is stream traffic on a named service

The unit of UI control is a stream to a named **ui-control service**,
in the `fleet-streams` sense: registered, deny-by-default, authorized
at accept by the ordinary capability check. A dispatch and its result
ride that stream. Delivery, ordering, backpressure, and failure are
session properties; a dead counterparty is a refused or closed stream,
observed immediately. The transport persists nothing — there is no
mailbox on disk, and an exchange that did not complete leaves no row
anywhere to expire.

### 2. What an app offers is latest-value facts

An app's registration — identity, instance, the action specs it
answers to, the head of its presentable state — is a small set of
latest-value facts at the app's concept, **replaced, never
accumulated**, and **scoped to the life of the process that asserts
them**. Drivers and surfaces read them as maintained views:
subscription wakes announce a new app, a changed action set, a moved
state head; the disappearance of liveness is itself the signal that
the app is gone. Registration is a statement of current standing, not
an event log — asserting it twice is idempotent, and no consumer ever
pages through its past.

The fact plane that carries them must therefore let standing expire on
its own. A plane whose values outlive their writer buys that liveness
back as a lease to renew and a reaper to run — the two reconstructions
this decision exists to refuse. That requirement, not a named store, is
what this clause decides.

### 3. The history of control is the timeline

Dispatch and completion are traced as activity events, carrying the
acting principal, the target app, the action, and the outcome. Every
question about the past of a controlled surface — what ran, what
failed, what an agent did during a session — is a timeline query,
correlated for free with everything else the timeline holds. The
transport never re-reads its own past, and no second archive of
control history exists to drift from the first.

### 4. No store holds the channel

The parquet document backend keeps its documented scope: append-only
columnar history queried analytically — time series, traces, logs. A
control mailbox has no history to keep, so it is outside that scope by
definition. More generally: no document, of any backend, sits between
a driver and an app. Documents carry state whose past or convergence
matters; a control exchange has neither.

### 5. The endpoint is the offer; the daemon projects it, never gates it

A driver reaches an app over a **local endpoint the app opens under its
profile's runtime directory**, and that endpoint is the app's standing:

- **Serving precedes announcing.** An app binds its endpoint first and
  serves regardless of any daemon. Its offer — identity, instance, action
  specs, the head of its presentable state — is answered **over the
  endpoint** on request. Liveness *is* connectability: the kernel reclaims
  it, so there is no heartbeat, no timeout, and no reaper for the local
  case, and the disappearance of liveness is exactly the disappearance of
  the endpoint.
- **Local discovery is the endpoint directory.** A driver on the same node
  lists the profile's endpoints and connects; an endpoint that refuses is
  dead and is removed (ordinary Unix hygiene — the only state the transport
  keeps on disk is a name). "An app appeared" is a watch on that directory,
  a push rather than a poll.
- **The daemon is a projector.** Where a daemon runs, it watches the
  endpoint directory under its profile and mirrors each live offer onto
  the ephemeral plane for **remote** drivers, over the `fleet-streams`
  service as §1 decides. The projection is derived and one-directional:
  an endpoint gone is a mirror gone on the next reconcile, so the remote
  view keeps the plane's optimism and the local view has none.
- **The driver connects to the daemon lazily** — only for a remote target
  or an authorization only the daemon can vouch for — never as a
  precondition of listing or driving a local app.

The app never holds a fleet identity or a socket to the world; that
remains the host's and the daemon's, which keeps the trust line
`malleable-ui-runtime` draws. **Cost law.** Local control costs one
connect per exchange and no standing traffic; a heartbeat exists only
where a network stands between driver and app.

Consequence for `compiled-host` §5: rung V1 — the host headless on a node
with no daemon — is fully controllable; routing the exchange through the
daemon would make the lowest rung require the whole stack, which is the
tax on iteration this clause removes. Profile forks (`data-isolation`)
get separate endpoint directories by construction, and see each other's
apps only through the fleet path.

### 6. A whole node stands on this plane too

"Is this device answering right now" has the shape §2 decides for an
app: a claim that expires unless someone keeps making it, written
locally, read by whoever is drawing the fleet. So a node publishes its
liveness here rather than behind a second heartbeat of its own — two
liveness mechanisms would eventually disagree about the same machine,
and a reader would have no principled way to pick.

**A node's liveness key is `node/{did}`**, on the same offers channel,
keyed by device DID — the key its `x0k:node-record/{did}` spine record
is keyed by, so record and liveness join without a lookup table between
them. The value is deliberately thin — DID, node label, instance, last
assertion — because everything about a node that does *not* expire
lives in its record, and a value that must be re-asserted should carry
only what re-assertion is evidence for.

**The absence rule is §2's.** A DID missing from the plane is a node
that is not answering. A consumer names that absence for its reader; it
does not paint a neutral mark meaning "we don't know". The instrument
pane's ground dial is the first consumer held to this: a live node
wears a dot, and a node without liveness wears the reason instead.

### 7. The endpoint speaks the operation set, in any language

**Decides:** the bytes on an app's endpoint, so that an app written in any
language can be driven.
**Invariants:** every call and every answer on the endpoint is one
canonical CBOR frame of the UI interfaces' operation set; a session agrees
on an operation's shape fingerprint the first time that operation is
called; the frames are the same on every carrier.
**On failure:** a call whose shape the two ends disagree on is refused,
naming the operation, and the session goes on, so a driver that has fallen
behind loses only what changed; a frame over the endpoint's
size bound is refused, naming the bound; a call to an interface the app
does not answer is refused by name, never answered empty.
**Checked by:** the UI-control conformance suite (intent 1f4dc28c), run
against every edge.

The endpoint protocol is the UI interfaces' operation set, spelled as
`operation-surface` §1 spells every boundary between processes: each call
and each answer is one length-prefixed canonical CBOR Datum frame. Nothing
in it is particular to x0k's Rust. An app in TypeScript, Swift or C++
answers the same frames with any CBOR codec, and a driver reads them the
same way.

The carrier follows from where the app runs, and the frames do not change:

- An app on this machine: its endpoint under the profile's runtime
  directory (§5).
- An app in a browser or a webview, or on a phone: a WebSocket. An app that
  cannot listen dials out to an endpoint its host names, and once the
  connection stands it answers as if it had accepted it.
- An app on another node: the daemon's ui-control service over a fleet
  stream (§1), which forwards the frames unchanged.

A call may carry the caller's W3C trace context, so the work the app does
in answer joins the caller's trace on the timeline (§3).

The offer names the interfaces an app answers (`ui/observe`, `ui/input`,
`ui/act`, `ui/history`, and any narrow extra such as `web/network`), each
with its shape fingerprint. A driver whose procedure needs an interface the
offer does not name is refused when the procedure is installed
(`core-and-edges` §2).

### 8. `ui/observe` reads one frame

**Decides:** what observing an app answers.
**Invariants:** observing changes nothing in the app; every part of one
observation is read from the same presented frame and names it; layout
bounds are in the capture's own pixel coordinates.
**On failure:** a part the app cannot produce is refused by name, and the
other parts of the observation are kept; an app that presents no frame
answers the layout and the state and refuses the capture.
**Checked by:** the `ui/observe` vectors of the UI-control conformance
suite (intent 1f4dc28c).

`ui/observe` has two operations.

- **`offer`** answers the app's standing as §2 and §5 describe it: its
  identity and instance, the interfaces it answers with their
  fingerprints, its named actions with each action's side-effect class,
  and the head of its presentable state. Reading the list of actions is
  observing; invoking one is `ui/act`.
- **`observe`** answers one observation, from one presented frame. The call
  names the parts it wants, and the answer holds the frame's identity and
  each part:
  - `capture`: the frame's pixels as a PNG, with the image's size in
    physical pixels and the display's scale factor. The call may ask for a
    region and a smaller scale.
  - `layout`: the layout tree. Each node has an id, a role, a label, a
    value, its bounds in the capture's pixel coordinates, which are the
    part of it that shows, the box it was laid out in when clipping cuts it
    down to that, whether it is visible, enabled, focused and interactive, the named action it maps to
    if it maps to one, the composition leaf it belongs to if it belongs to
    one, and its children. A node's id names the same part of the surface
    from frame to frame for as long as that part stands, and no two nodes
    of a frame share one, so a driver can hold an id across frames and a
    mark made on one frame still names something on the next. Where a part
    of the surface reports its own semantics, as an x0k surface guest does,
    that subtree is grafted in and marked with its source.
  - `state`: the app's presentable state as a Datum, with its head and its
    shape fingerprint.

Asking for several parts in one call is how a driver gets a screenshot and
a layout tree that line up. `ui/observe` is `read_only`, and `inspect`
performs nothing (`graded-introspection` §9), so observing needs no replay
policy and no grade.

### 9. `ui/act` invokes an action the app names

**Decides:** how a driver invokes an app's own actions.
**Invariants:** a driver invokes only an action the offer lists; the
action's arguments are checked against the shape the offer gives them
before the app runs anything; every invocation and its outcome is traced
on the timeline (§3).
**On failure:** an action the offer does not list, arguments that misfit
the action's shape, and an action whose side-effect class the grant does
not cover are each refused by name before the app runs anything; an action
that runs and fails answers its failure, by name.
**Checked by:** the `ui/act` vectors of the UI-control conformance suite
(intent 1f4dc28c).

The offer (§8) lists each action with its name, a description, the shape
of its arguments, the shape of its result, and its side-effect class
(`operation-surface` §12). `ui/act` has one operation:

- **`invoke`** names an action and gives its arguments. The answer is the
  action's outcome: done, with the result the action's shape names, or
  failed, with its reason. Where the app presents frames, the answer also
  names the first frame presented after the action took effect, so the
  driver's next observation shows what the action did.

A `ui/act` grant names the side-effect classes it allows, and the app
checks each invocation against the class the action declares. A grant
for `read_only` actions alone lets a driver ask the app things through its
own actions without changing anything.

### 10. `ui/input` acts as a person at the screen would

**Decides:** how a driver sends pointer, key and wheel input.
**Invariants:** input is one sequence of actions on one model; pointer
positions are in the capture's pixel coordinates (§8); the app delivers
the input through its own hit-testing and focus, as it delivers a
person's; the sequence runs in order, and the app answers once it has
handled the whole sequence.
**On failure:** a sequence that names an unknown source, an unknown key, a
position outside the frame, or a layout node the named frame does not hold
is refused by name before any of it runs; input to an app whose offer does
not name `ui/input` is refused by name.
**Checked by:** the `ui/input` vectors of the UI-control conformance suite
(intent 1f4dc28c).

`ui/input` has one operation:

- **`perform`** takes input sources and their actions, after the W3C
  WebDriver actions model. A pointer source is a mouse, a pen or a touch,
  each with its own id, so two touches are two sources. A key source types
  keys, and a wheel source scrolls. A source's actions are moves, presses
  and releases, keys down and up, scrolls and pauses. A pointer move goes
  to a position in a frame's pixels, or to a layout node of a named frame,
  which the app resolves to the centre of that node's bounds. The answer
  names the first frame presented after the app handled the sequence.

`ui/input` is `non_idempotent` (`core-and-edges` §2): a click twice is two
clicks. A driver that knows the app's action for what it wants to do
invokes that action through `ui/act`, and uses input for what no action
names and for testing the surface a person touches.

## Rationale

The argument is lifetimes. A request/response exchange between two
live processes has the lifetime of the conversation, and a substrate
with exactly that lifetime provides as definitions what a storage
substrate must reconstruct as features: cross-process delivery becomes
a poll cadence, liveness becomes periodic re-assertion, bounded size
becomes a retention obligation that must exist and keep running
forever. Each reconstruction is a standing cost and an independent
failure point; on a channel, each is simply what the word means. The
same reasoning gives the offer to a latest-value fact plane — facts
with subscriptions are the decided idiom for "current standing," so
apps publishing that way makes "what can be driven" one query over one
idiom rather than a bespoke registry with private semantics.

It also decides *which* fact plane. An app's standing lives exactly as
long as its process, so a plane whose own values expire matches that
lifetime and a durable one does not. On durable storage "the
disappearance of liveness is the signal" stops being free: it becomes a
lease the app must keep renewing and a sweeper that must hunt down the
apps that died without retracting — the periodic re-assertion and the
standing retention obligation named above, readmitted for the one
surface this decision was written to clear them from. The lifetime test
is the argument; the store is downstream of it.

Reusing `fleet-streams` is the decision's center of gravity. Naming,
deny-by-default, capability checking at accept, session amortization,
revocation through the trust mesh, and reach to any paired device
arrive already decided; a UI-control-specific transport would
re-derive every one of them for the single most agent-exposed surface
the system has. The cross-node consequence falls out rather than being
built: a steering seat drives a remote shell through the same named
service, gated by the same grants.

Sending history to the timeline follows from `observability-timeline`
being the canonical record set: control history interleaved with
everything else — sync activity, daemon health, agent turns — answers
the questions an operator actually asks of it, which a private archive
inside the transport never could.

## Consequences

- Driving a surface on another device is the same operation as driving
  a local one, wherever a grant reaches. The converse is the
  responsibility: ui-control grants are among the most powerful in the
  system — input injection and screen capture — and their scoping
  discipline matters from the first grant minted.
- Control availability is session availability. A down daemon or dead
  app refuses the stream immediately; there is no mailbox to accept a
  request nobody will answer. Drivers see refusal, not silence, and
  retry is theirs.
- An app outside x0k becomes drivable by speaking the frames, with no x0k
  code in it. The conformance suite, not x0k's crate, is what says that it
  speaks them correctly.
- An observe-only grant can be handed to an agent that is developing a UI:
  the agent sees what a person at the screen would see, and cannot press
  anything.
- An agent navigates an app by the actions the app names before it reaches
  for the pointer, so its steps survive a change of layout; input remains
  the check that the surface a person touches works.
- Introspection changes register: "what is running and what can it
  do" is a fact query; "what happened" is a timeline query. There is
  no directory on disk whose contents answer either.
- "What is running and what can it do" is a fact query over one idiom
  rather than a bespoke registry — but only over the plane that carries
  standing. A surface rendering "what can drive me" reaches that plane,
  which is not the surface durable knowledge is queried through;
  uniformity across both is not bought here.

## Related Decisions

- [fleet-streams](fleet-streams.md) — supplies the named-service
  surface, authorization at accept, and cross-device reach; the
  ui-control service is one entry in its registry.
- [service-authorization](service-authorization.md) — the capability
  hierarchy and caller shapes the stream accept consumes, via
  `fleet-streams`.
- [state-representation](state-representation.md) — the latest-value
  fact idiom an app's registration is expressed in; §2 adopts those
  semantics and adds a process-scoped lifetime requirement on whichever
  plane carries them.
- [query-subscriptions](query-subscriptions.md) — the maintained-view
  semantics under which drivers observe registrations without polling.
- [observability-timeline](observability-timeline.md) — the canonical
  home of control history.
- [applications-are-tenants](applications-are-tenants.md) — the
  tenancy frame in which an app states its offer to the substrate
  rather than residing in it.
- [operation-surface](../platform/operation-surface.md) — §1's canonical CBOR frames
  and carriers, which the endpoint protocol (§7) adopts.
- [core-and-edges](core-and-edges.md) — §2 names the four UI interfaces
  and the edges by reach; §7 gives the ui-control edge its wire, and §8
  gives `ui/observe` its operations.
- [graded-introspection](../substrate/graded-introspection.md) — §9's
  `inspect`, which performs nothing, is why observing needs no replay
  policy.
- [ui-interfaces](ui-interfaces.md) — proposed: `ui/history`, state
  fixtures, the offer's grades and replay policy, the frame bound, the edges
  by reach and conformance at installation.

## Open Questions

- Whether standing should also be reachable from the surface durable
  knowledge is queried through, so that one question spans "what
  exists" and "what is running right now". Mirroring standing into
  durable facts reintroduces the lease and the sweeper §2 refuses;
  making the expiring plane readable from the durable query surface
  does not, and is the shape worth trying first. The smallest form: a
  durable "what exists" view joined with live endpoints, so a surface
  can answer "installed" and "running" from one place.

### Resolved

- **Where the service endpoint lives** — the daemon exposes one
  ui-control service and routes to the apps attached to it; the target
  app rides the open frame, not the service name. Apps are IPC tenants
  of the daemon rather than mesh peers, and a per-app service name
  would make the registry the unbounded thing `fleet-streams` §1
  forbids.
- **Grant grain** — the four interfaces of `core-and-edges` §2. Holding
  `ui/observe` alone is an observe-only grant: it reads the offer and
  observes, and can neither move a pointer nor invoke an action. `ui/act`
  is checked against the side-effect class each app publishes per action;
  an action with no published spec is treated as changing state, since
  parameterized ids are an open set and the generous guess is the wrong
  bias for the most agent-exposed surface in the system.
- **Cross-device replication of standing** — device-local. An app's
  standing and its exchange traffic both stay on the machine that
  produced them, and a remote driver reaches them only by asking that
  machine's daemon through the ui-control service. Visibility costs a
  grant rather than arriving with pairing.

## Notes

- Node liveness (§6) is motivated by intent
  `7ee07bbc-ab9e-436d-aaa1-61c6f460f821`.
- The endpoint protocol and `ui/observe` (§7, §8) are motivated by intent
  `396792f0-be07-c3dd-e35d-a95f93c74fe3`, which decided them ahead of the
  other UI interfaces.
- `ui/act` and `ui/input` (§9, §10) are motivated by intent
  `761c189e-6c4d-b04a-4f07-3812cca3780d`, which decided them ahead of
  `ui/history`, since acting in the present needs no decision about going
  back.
