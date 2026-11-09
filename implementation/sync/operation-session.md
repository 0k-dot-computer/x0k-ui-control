# The operation wire: a session's calls

```turtle folio:document
implementation:sync\/operation-session a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "The session that carries operation frames over one connection, both ways at once. A caller keeps many calls in flight and matches each answer by its own call id. A call past its deadline, or on a connection that has ended, is answered unknown; one past the in-flight bound is refused before the callee hears it. The session opens by agreeing on shapes operation by operation, carries subscriptions whose wakes coalesce and resume from what was read, and lets only a forwarder name whom it asks for." ;
    x0k:concerns "transport", "ipc", "wire", "session", "calls" ;
    x0k:cites implementation:sync\/operation-wire,
        implementation:sync\/transport-session ;
    x0k:motivatedBy intent:6c43d955-60ef-33cb-b212-ae62b04b5704 ;
    x0k:realizes architecture:operation-surface ;
    folio:tangleCrate "crates/x0k-operation-session" ;
    folio:tangleRoot "src/lib.rs" .
```

A session carries operation frames (`x0k:implementation/sync/operation-wire`)
over one connection, both ways at once. This chapter is its calls: a
caller with many calls in flight, a callee that runs each as it arrives,
what a call comes to when it gets no reply, the shape agreement a
session opens with, subscriptions, and calls that outlive their
connection. The listener that tells this session from protocol A is
built on it in a later slice; protocol A's session, which this one replaces, is
`x0k:implementation/sync/transport-session`.

What holds:

1. **A call is answered under its own id, as soon as it is done.** The
   callee runs each call as it arrives, and its answer leaves when the
   call finishes, so a fast call is not held behind a slow one; the
   caller matches an answer to its call by the call's id, which is the
   caller's.
2. **A call past its deadline is answered unknown, under its id.** The
   caller stops waiting at its deadline and is told the call's outcome is
   unknown: the callee may have run it. A reply that arrives later is
   dropped, and the session goes on.
3. **A call past the connection's in-flight bound is refused by name,
   before the callee hears it.** The refusal names the bound, so the
   caller knows the call did not run.
4. **A call never waits on a connection that has ended.** When the
   connection ends, every call still waiting is answered unknown, and a
   call made after it ended is never sent and fails closed.
5. **An id names one call at a time.** A call made under an id already in
   flight on the session is refused there, and nothing is sent.
6. **A subscription's wakes coalesce, and resume from what was read.** A
   connection holds at most one waiting wake per subscription, the latest,
   so what it buffers is bounded by its subscriptions and never by the
   rate of change. A subscription opened again on a new connection resumes
   from the last watermark its subscriber read, so a wake lost with a
   connection loses no change. A subscription ends when its subscriber
   drops it, when its callee ends it, when its connection ends or when its
   serving is stopped, and the subscriber is told.
7. **Only a forwarder names whom it asks for.** A call that names an asker
   (`on_behalf_of`) is heard only on a connection its endpoint marked a
   forwarder's; on any other it is refused by name before the callee hears
   it, so a caller cannot name its own asker.
8. **A session agrees on shapes before any call, operation by operation.**
   Each side states the fingerprints of the shapes it calls or serves each
   operation with, and a shape crosses only when the fingerprints differ.
   An operation whose shapes do not fit, or that the callee does not
   serve, is refused for the session by name, with both fingerprints; the
   rest of the session stands. A call to it is refused where it is made,
   and nothing is sent.
9. **A call in flight when its connection drops is asked again only if
   asking twice is harmless.** A redialing caller asks a `read_only` or
   `idempotent_write` call again, once, under its own id, on a new
   connection and within what is left of its deadline. Any other call is
   answered unknown and never sent again.
10. **A reply is never dropped.** The callee's answer waits for the writer
   however full it is, and a reply too large to frame is answered by a
   refusal that says so.
11. **A call may be answered pending and settled later by its handle.** A
   call whose outcome is unknown can be probed, and a call in flight
   withdrawn; a callee that keeps nothing pending says so by name.
12. **What a session decides, it decides without a socket.** What a call
   comes to, how bytes read become frames, how an opening agrees and what
   a call or a wake is as a frame are built in `x0k-operation-wire`, with
   no socket, clock or runtime. This session drives them over a
   connection, and a caller with no runtime of its own, a page in a
   browser, drives the same ones, so the two cannot spell a call or an
   agreement differently (`x0k:implementation/sync/operation-wire-anywhere`).

The half that needs no socket is one module of `x0k-operation-wire`:

<a name="chunk-pure-module"></a><sub>[`../x0k-operation-wire/src/session.rs`](../../crates/x0k-operation-wire/src/session.rs) · `#pure-module` · assembles [answers](#chunk-answers) · [frame-buffer](#chunk-frame-buffer) · [agreement](#chunk-agreement) · [ask](#chunk-ask) · [wake](#chunk-wake)</sub>

```rust {#pure-module file="../x0k-operation-wire/src/session.rs"}
//! What a session on the operation wire decides without a socket
//! (`corpora/x0k/implementation/sync/operation-session.md`): what a call
//! comes to, how bytes become frames, how an opening agrees, and what a
//! call and a wake are as frames.

use std::collections::{BTreeMap, BTreeSet};
#[cfg(feature = "shapes")]
use std::sync::Arc;
use std::time::Duration;

use x0k_datum::shape::Fingerprint;
#[cfg(feature = "shapes")]
use x0k_datum::shape::{spell, Compiled, DeclaredShapes, Pinner, ShapeFault, Shaped, Unpinnable, Use, Verdict};
use x0k_datum::Datum;

use crate::class::EffectCeiling;
use crate::frame::{Frame, FrameFault, Kind};

<<answers>>

<<frame-buffer>>

<<agreement>>

<<ask>>

<<wake>>
```

The session itself drives that half over a connection:

<a name="chunk-module"></a><sub>[`src/session.rs`](../../crates/x0k-operation-session/src/session.rs) · `#module` · assembles [policy](#chunk-policy) · [reading](#chunk-reading) · [writing](#chunk-writing) · [agreeing](#chunk-agreeing) · [callee](#chunk-callee) · [caller](#chunk-caller) · [redialing](#chunk-redialing) · [subscriptions](#chunk-subscriptions) · [tests](#chunk-tests)</sub>

```rust {#module file="src/session.rs"}
//! A session on the operation wire
//! (`corpora/x0k/implementation/sync/operation-session.md`): many calls
//! in flight on one connection, each answered under its own id.

use std::collections::{BTreeSet, HashMap};
use std::future::Future;
use std::sync::{Arc, Mutex, PoisonError};

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::{mpsc, oneshot, watch, Semaphore};
use x0k_datum::Datum;
use x0k_operation_wire::EffectCeiling;

pub use x0k_operation_wire::session::{
    Agreement, Answer, Ask, Begun, CallFault, Disagreement, Found, Shapes, ShapesFault, Wake, ALREADY_SUBSCRIBED, SUBSCRIPTION_ENDED,
    BEFORE_AGREEMENT, CALL_PAST_CAP, NOTHING_PENDING, NOT_AGREED, NOT_A_FORWARDER, NO_HANDLE, NO_SUBSCRIPTIONS,
    PAST_IN_FLIGHT, PAST_SUBSCRIPTIONS, PENDED_TO_A_CALL, REPLY_PAST_CAP,
};
use x0k_operation_wire::session::{answer_frame, answer_said, found_datum, found_of, handle_datum, handle_of, CallerOpened, FrameBuffer};

use crate::wire::{Frame, FrameFault, Kind, DEFAULT_FRAME_CAP};

<<policy>>

<<reading>>

<<writing>>

<<agreeing>>

<<callee>>

<<caller>>

<<redialing>>

<<subscriptions>>

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{Duration, Instant};
    use x0k_operation_wire::session::{datum_map, datum_text, member, members_of, opening_frame, text_member, why_of};
    use x0k_datum::shape::{spell, DeclaredShapes, Pinner, Shaped, Unpinnable, Use};
    use x0k_datum::Integer;

    <<tests>>
}
```

## The crate

The session is a crate of its own, `x0k-operation-session`, so a crate
that runs calls on the wire takes the session and nothing else of x0k's
transport. It holds three modules: this session; the frame and a
listener's test of which protocol a connection speaks
(`x0k:implementation/sync/operation-wire`); and, behind the `websocket`
feature, a WebSocket to run on
(`x0k:implementation/sync/websocket-carrier`). It depends on the value
model, the wire's half with no socket, and tokio. `x0k-transport`
re-exports the three modules, so a caller that names them there names
these.

<a name="chunk-manifest"></a><sub>[`Cargo.toml`](../../crates/x0k-operation-session/Cargo.toml) · `#manifest`</sub>

```toml {#manifest file="Cargo.toml"}
[package]
name = "x0k-operation-session"
version = "0.1.0"
edition = { workspace = true }
license = "MIT"
description = "A session on the operation wire: many calls in flight on one connection, both ways at once, each answered under its own id; the opening's shape agreement, subscriptions, and calls that outlive their connection. It runs on any byte stream, and on a WebSocket behind a feature."
repository = "https://github.com/0k-dot-computer/x0k-ui-control"
readme = "../../README.md"
keywords = ["ui", "testing", "automation", "agents", "protocol"]

[dependencies]
thiserror = { workspace = true }
tokio = { workspace = true, features = ["io-util", "macros", "net", "rt", "rt-multi-thread", "sync", "time"] }
tracing = { workspace = true }
# The value model the frames carry: canonical CBOR Datums and their shapes.
x0k-datum = { version = "0.1.0" }
# The frame, the side-effect class and what a session decides with no socket.
x0k-operation-wire = { path = "../x0k-operation-wire", version = "0.1.0" }
# The frames over a WebSocket (corpora/x0k/implementation/sync/websocket-carrier.md).
futures = { workspace = true, optional = true }
tokio-tungstenite = { version = "0.24", optional = true }

[features]
default = []
# The frames over a WebSocket, for a page in a browser.
websocket = ["dep:futures", "dep:tokio-tungstenite"]

[dev-dependencies]
tokio = { workspace = true, features = ["macros", "net", "process", "rt", "time"] }
criterion = "0.5"

[[bench]]
name = "session_call"
harness = false
```

<a name="chunk-lib"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-session/src/lib.rs) · `#lib`</sub>

```rust {#lib file="src/lib.rs"}
//! A session on the operation wire
//! (`corpora/x0k/implementation/sync/operation-session.md`): calls over
//! one connection, the frame they travel in, and a WebSocket to carry it.

pub mod session;
pub mod wire;
/// The operation wire's frames over a WebSocket, for a page in a browser.
#[cfg(feature = "websocket")]
pub mod websocket;
```

## Its policy

What a session does where the choice is its endpoint's is one plain
value, resolved when the endpoint starts and copied into each connection,
so opening a connection reads no configuration
(`x0k:implementation/sync/transport-session`, "The policies"). This slice
has five knobs: how many calls a callee runs at once on one connection,
how many subscriptions it holds open on one, the largest frame either
side reads, how many encoded frames may wait for the writer before a
sender waits, and whether the connection is a forwarder's.

<a name="chunk-policy"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-session/src/lib.rs) · `#policy`</sub>

```rust {#policy}
/// How a session behaves where the choice is its endpoint's: resolved
/// once, when the endpoint starts, and copied into each connection.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SessionPolicy {
    /// How many calls the callee runs at once on one connection. A call
    /// past it is refused by name before the callee hears it.
    pub in_flight: usize,
    /// How many subscriptions the callee holds open on one connection. A
    /// subscribe past it is refused by name.
    pub subscriptions: usize,
    /// The largest frame either side reads.
    pub frame_cap: usize,
    /// How many encoded frames wait for the writer before a sender waits.
    pub write_queue: usize,
    /// Whether the connection was conveyed or accepted as a forwarder's,
    /// whose calls may name whom they ask for. Set by the endpoint, never
    /// read from the wire.
    pub forwarded: bool,
}

impl SessionPolicy {
    /// The policy an endpoint takes unless it names another.
    pub const DEFAULT: SessionPolicy = SessionPolicy { in_flight: 256, subscriptions: 256, frame_cap: DEFAULT_FRAME_CAP, write_queue: 1024, forwarded: false };
}

impl Default for SessionPolicy {
    fn default() -> Self {
        Self::DEFAULT
    }
}
```

## What a call comes to

A callee answers a call with a reply, a Datum, or a refusal that says
why. A caller is told a call's reply, or the fault that kept it from one:
the callee refused it; its deadline passed, or its connection ended,
before an answer came, so whether it ran is unknown; an id already in
flight; or a session already closed when the call was made. A refusal on
the wire is a `refused` frame whose argument is a map with one text field,
`why`.

<a name="chunk-answers"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-session/src/lib.rs) · `#answers`</sub>

```rust {#answers}
/// What a callee answers a call with.
#[derive(Clone, Debug, PartialEq)]
pub enum Answer {
    /// The call's result.
    Reply(Datum),
    /// The call was not run, and why.
    Refused(String),
    /// The call is begun and not finished; settle it by this handle.
    Pending(String),
}

/// What a caller is told of a call it began: its answer, or that it is
/// pending under a handle to settle it by.
#[derive(Clone, Debug, PartialEq)]
pub enum Begun {
    Ready(Datum),
    Pending { handle: String },
}

/// What a probe found of a call whose outcome its caller does not know.
#[derive(Clone, Debug, PartialEq)]
pub enum Found {
    /// It happened, and this is its answer.
    Happened(Datum),
    /// It resumed where it stopped and answered; `continuation` says how.
    Continued { result: Datum, continuation: Datum },
    /// It did not happen, and why.
    NotHappened(String),
    /// Asking it again changes nothing in the world beyond cost.
    AskAgain(String),
    /// The callee cannot say.
    Unknowable,
}

/// Why a settle that names no handle was refused.
pub const NO_HANDLE: &str = "a settle that names no handle";

/// Why a settle was refused by a callee that leaves nothing pending.
pub const NOTHING_PENDING: &str = "this callee leaves no call pending to settle";

/// Why a plain call that the callee answered pending was refused: its
/// caller does not wait to settle it.
pub const PENDED_TO_A_CALL: &str = "the callee answered pending, which a plain call does not settle; start it instead";

/// Why a call past the connection's in-flight bound was refused.
pub const PAST_IN_FLIGHT: &str = "past the connection's in-flight bound";

/// Why a subscribe past the connection's subscription bound was refused.
pub const PAST_SUBSCRIPTIONS: &str = "past the connection's subscription bound";

/// Why a subscribe to a callee that serves no subscriptions was refused.
pub const NO_SUBSCRIPTIONS: &str = "this callee serves no subscriptions";

/// Why a subscribe under an id already open on the connection was refused.
pub const ALREADY_SUBSCRIBED: &str = "a subscription under this id is already open";

/// What a subscriber is told when its callee ended the subscription.
pub const SUBSCRIPTION_ENDED: &str = "the callee ended this subscription";

/// Why a call whose reply was too large to frame was answered without it.
pub const REPLY_PAST_CAP: &str = "the reply is larger than the connection's frame cap";

/// Why a call too large to frame was not sent.
pub const CALL_PAST_CAP: &str = "the call is larger than the connection's frame cap";

/// Why a call that names an asker on a connection that is not a
/// forwarder's was refused.
pub const NOT_A_FORWARDER: &str = "on_behalf_of on a connection that is not a forwarder's";

/// What kept a call from a reply.
#[derive(Clone, Debug, PartialEq, thiserror::Error)]
pub enum CallFault {
    /// The callee refused the call; it did not run.
    #[error("call {call} was refused: {why}")]
    Refused { call: String, why: String },
    /// No answer came before the call's deadline or before its connection
    /// ended: the callee may have run it.
    #[error("call {call} got no answer; whether it ran is unknown")]
    Unknown { call: String },
    /// A call under this id is already in flight on the session.
    #[error("call {call} is already in flight on this session")]
    InFlight { call: String },
    /// The session had closed before the call was sent.
    #[error("the session is closed")]
    Closed,
    /// The session did not agree on this operation's shapes, so the call
    /// was not sent.
    #[error("call {call}: the session did not agree on {operation}: {why}")]
    Disagreed { call: String, operation: String, caller: Option<String>, callee: Option<String>, why: String },
}

/// The argument of a pending answer, or of a settle: the handle.
pub fn handle_datum(handle: &str) -> Datum {
    Datum::Map([("handle".to_string(), Datum::Text(handle.to_string()))].into_iter().collect())
}

/// The handle a pending answer or a settle names.
pub fn handle_of(argument: &Datum) -> Option<String> {
    match argument {
        Datum::Map(fields) => match fields.get("handle") {
            Some(Datum::Text(handle)) => Some(handle.clone()),
            _ => None,
        },
        _ => None,
    }
}

/// What a probe found, as the reply that carries it.
pub fn found_datum(found: Found) -> Datum {
    let mut fields = BTreeMap::new();
    let mut put = |key: &str, value: Datum| { fields.insert(key.to_string(), value); };
    match found {
        Found::Happened(result) => { put("found", Datum::Text("happened".into())); put("result", result); }
        Found::Continued { result, continuation } => {
            put("found", Datum::Text("continued".into())); put("result", result); put("continuation", continuation);
        }
        Found::NotHappened(why) => { put("found", Datum::Text("not_happened".into())); put("why", Datum::Text(why)); }
        Found::AskAgain(why) => { put("found", Datum::Text("ask_again".into())); put("why", Datum::Text(why)); }
        Found::Unknowable => put("found", Datum::Text("unknowable".into())),
    }
    Datum::Map(fields)
}

/// What a probe's reply says it found; a reply that says nothing readable
/// found nothing the caller can use.
pub fn found_of(reply: Datum) -> Found {
    let Datum::Map(mut fields) = reply else { return Found::Unknowable };
    let text = |fields: &mut BTreeMap<String, Datum>, key: &str| match fields.remove(key) {
        Some(Datum::Text(text)) => text,
        _ => String::new(),
    };
    match text(&mut fields, "found").as_str() {
        "happened" => Found::Happened(fields.remove("result").unwrap_or(Datum::Null)),
        "continued" => Found::Continued {
            result: fields.remove("result").unwrap_or(Datum::Null),
            continuation: fields.remove("continuation").unwrap_or(Datum::Null),
        },
        "not_happened" => Found::NotHappened(text(&mut fields, "why")),
        "ask_again" => Found::AskAgain(text(&mut fields, "why")),
        _ => Found::Unknowable,
    }
}

/// The argument of a refusal that says `why`.
pub fn why(why: &str) -> Datum {
    Datum::Map([("why".to_string(), Datum::Text(why.to_string()))].into_iter().collect())
}

/// What a refusal's argument says, or that it said nothing readable.
pub fn why_of(argument: &Datum) -> String {
    match argument {
        Datum::Map(fields) => match fields.get("why") {
            Some(Datum::Text(why)) => why.clone(),
            _ => "a refusal that does not say why".to_string(),
        },
        _ => "a refusal that does not say why".to_string(),
    }
}

/// The answer to `call` as a frame: a reply, or a refusal saying why.
pub fn answer_frame(call: String, operation: String, class: EffectCeiling, answer: Answer) -> Frame {
    let (kind, argument) = match answer {
        Answer::Reply(reply) => (Kind::Reply, reply),
        Answer::Refused(refused) => (Kind::Refused, why(&refused)),
        Answer::Pending(handle) => (Kind::Pending, handle_datum(&handle)),
    };
    Frame { call, kind, operation, class, deadline_ms: None, trace: None, on_behalf_of: None, watermark: None, argument }
}

/// What the answer `frame` tells its caller: a reply, a handle to settle
/// by, or the refusal it is.
pub fn answer_said(frame: Frame) -> Result<Begun, CallFault> {
    match frame.kind {
        Kind::Reply => Ok(Begun::Ready(frame.argument)),
        Kind::Pending => match handle_of(&frame.argument) {
            Some(handle) => Ok(Begun::Pending { handle }),
            None => Err(CallFault::Refused { call: frame.call, why: "a pending answer that names no handle".to_string() }),
        },
        Kind::Refused => Err(CallFault::Refused { why: why_of(&frame.argument), call: frame.call }),
        other => Err(CallFault::Refused { call: frame.call, why: format!("{} came where an answer was due", other.as_str()) }),
    }
}
```

## Reading and writing frames

Each side reads frames off its half of the connection one at a time,
buffering what has arrived until a whole frame has. The frame's length
comes first, so a frame over the cap is refused before its body is read
(`x0k:implementation/sync/operation-wire`, "On a socket"); a frame cut off
by the end of the stream, and one that is not a frame, end the read.

Holding the bytes until they make a frame is a `FrameBuffer`, which reads
nothing itself: the session's reader puts what its connection reads into
one, and a page puts what its WebSocket hands it into another. However the
carrier cuts the bytes, a message holding half a frame or three, the same
frames come out.

<a name="chunk-frame-buffer"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-session/src/lib.rs) · `#frame-buffer`</sub>

```rust {#frame-buffer}
/// Bytes read off a connection, held until they make a whole frame.
pub struct FrameBuffer {
    held: Vec<u8>,
    cap: usize,
}

impl FrameBuffer {
    /// A buffer holding nothing, that takes no frame over `cap`.
    pub fn new(cap: usize) -> FrameBuffer {
        FrameBuffer { held: Vec::with_capacity(8192), cap }
    }

    /// Hold `bytes` after what is held.
    pub fn push(&mut self, bytes: &[u8]) {
        self.held.extend_from_slice(bytes);
    }

    /// The bytes held, for a reader that reads into them in place.
    pub fn held_mut(&mut self) -> &mut Vec<u8> {
        &mut self.held
    }

    /// Whether nothing is held.
    pub fn is_empty(&self) -> bool {
        self.held.is_empty()
    }

    /// The next whole frame held, or `None` until more bytes come.
    pub fn next_frame(&mut self) -> Result<Option<Frame>, FrameFault> {
        if self.held.is_empty() {
            return Ok(None);
        }
        match Frame::decode(&self.held, self.cap) {
            Ok((frame, used)) => {
                self.held.drain(..used);
                Ok(Some(frame))
            }
            Err(FrameFault::Short { .. }) => Ok(None),
            Err(fault) => Err(fault),
        }
    }
}
```

<a name="chunk-reading"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-session/src/lib.rs) · `#reading`</sub>

```rust {#reading}
/// Why a session stopped reading its connection, when not at a clean end.
#[derive(Debug, thiserror::Error)]
pub enum ReadFault {
    #[error("reading the connection: {0}")]
    Io(#[from] std::io::Error),
    #[error("a frame was refused: {0:?}")]
    Frame(FrameFault),
    #[error("the connection ended inside a frame")]
    Truncated,
}

/// Frames read off `reader`, one at a time.
struct FrameReader<R> {
    reader: R,
    held: FrameBuffer,
}

impl<R: AsyncRead + Unpin> FrameReader<R> {
    fn new(reader: R, cap: usize) -> Self {
        FrameReader { reader, held: FrameBuffer::new(cap) }
    }

    /// The next frame, or `None` at a clean end of the stream.
    async fn next(&mut self) -> Result<Option<Frame>, ReadFault> {
        loop {
            if let Some(frame) = self.held.next_frame().map_err(ReadFault::Frame)? {
                return Ok(Some(frame));
            }
            let held = self.held.held_mut();
            held.reserve(8192);
            if self.reader.read_buf(held).await? == 0 {
                return match self.held.is_empty() {
                    true => Ok(None),
                    false => Err(ReadFault::Truncated),
                };
            }
        }
    }
}
```

One writer task owns each side's write half. A frame is encoded by
whoever sends it and queued; the writer writes what is queued and
flushes once the queue is empty, so frames sent together leave together.

<a name="chunk-writing"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-session/src/lib.rs) · `#writing`</sub>

```rust {#writing}
/// Write the frames queued on `frames` to `writer` until every sender is
/// gone or the connection refuses a write.
async fn write_frames<W: AsyncWrite + Unpin>(mut writer: W, mut frames: mpsc::Receiver<Vec<u8>>) {
    while let Some(frame) = frames.recv().await {
        if writer.write_all(&frame).await.is_err() {
            return;
        }
        while let Ok(frame) = frames.try_recv() {
            if writer.write_all(&frame).await.is_err() {
                return;
            }
        }
        if writer.flush().await.is_err() {
            return;
        }
    }
}
```

## Agreeing on shapes

A session opens by agreeing on shapes (`x0k:architecture/operation-surface`
§1). Each side declares, for each operation it calls or serves, the shape
of its argument and of its answer (`DeclaredShapes`), and holds each
compiled and pinned by its endpoint's pinner: the fingerprint is the pin
of the shape's canonical form (`x0k:implementation/platform/value-shapes`).
A shape an operation does not declare is `any`, which holds nothing to it.
An operation that carries values whose shapes are checked elsewhere, as a
forwarded cell call's body is checked by the cell's own dispatch, declares
those fields `any`, so its fingerprint is the operation's alone.

The caller opens: an `open` frame names each operation it will call, with
the fingerprints of the argument it writes and the answer it reads. The
callee answers `opened`, operation by operation: that it serves no such
operation; or, for one it serves, whether the caller's argument
fingerprint is its own (`same`) or it needs the caller's argument shape
(`needs`), with its own answer's fingerprint, and that answer's canonical
shape when the caller's answer fingerprint differs. If anything was
needed, the caller sends the shapes in a `shapes` frame. The callee takes
one only if it pins to the fingerprint asked for, and answers `agreed`
with a verdict for each such operation. Equal fingerprints agree with no
shape sent: one round trip, and a second only when something differs.

Each direction is resolved by the side that reads it (`value-shapes` §3):
the callee resolves the caller's argument against its own, and the caller
resolves the callee's answer against its own. A Total operation is
agreed. A Disjoint one is refused for the session by name, with the place
where no value fits. A Partial one is refused too, naming its places:
refusing only a value at one of those places, as it crosses, is the next
slice. Agreement is the session's own and is held nowhere else, so a
connection opened again agrees again.

Each step of an opening is what one side makes of the frame it read, and
reads nothing itself: the caller's `open_frame`, its reading of `opened`
and of `agreed`; the callee's reading of `open` and of `shapes`. A side
drives them over whatever carries its frames.

A side may hold its shapes only as pins (`Shapes::pinned`), each
operation's argument pin and answer pin. It checks no shape: where the
other side's pins equal its own, the operation agrees exactly as if it had
compiled them, with nothing crossing; where they differ, the operation does
not agree, and says so by name. Compiling and resolving shapes is the
`shapes` feature of `x0k-operation-wire`, on by default and taken by the
transport; a caller that carries its pins, as a page in a browser does,
builds without it and links none of the shape language.

<a name="chunk-agreement"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-session/src/lib.rs) · `#agreement`</sub>

```rust {#agreement}
/// One operation's shapes as one side of a session holds them.
struct Held {
    argument_print: Fingerprint,
    answer_print: Fingerprint,
    /// The argument and the answer compiled, on a side that checks shapes.
    #[cfg(feature = "shapes")]
    compiled: Option<(Compiled, Compiled)>,
}

/// The shapes one side of a session declares, operation by operation,
/// compiled and pinned, or only pinned: built once, when its endpoint
/// starts.
pub struct Shapes {
    held: BTreeMap<String, Held>,
    #[cfg(feature = "shapes")]
    pinner: Option<Arc<dyn Pinner + Send + Sync>>,
}

impl Shapes {
    /// Shapes known only by their pins: each operation, the pin of its
    /// argument and of its answer. A side holding these checks no shape: an
    /// operation whose pins differ from the other side's does not agree,
    /// and no shape crosses for it.
    pub fn pinned<'a>(pins: impl IntoIterator<Item = (&'a str, &'a str, &'a str)>) -> Shapes {
        let held = pins.into_iter().map(|(operation, argument, answer)| (operation.to_string(), Held {
            argument_print: Fingerprint(argument.to_string()),
            answer_print: Fingerprint(answer.to_string()),
            #[cfg(feature = "shapes")]
            compiled: None,
        })).collect();
        Shapes { held, #[cfg(feature = "shapes")] pinner: None }
    }

    /// Each operation's argument pin and answer pin.
    pub fn pins(&self) -> impl Iterator<Item = (&str, &str, &str)> {
        self.held.iter().map(|(operation, held)| (operation.as_str(), held.argument_print.0.as_str(), held.answer_print.0.as_str()))
    }

    /// Whether the callee's answer, sent as `canonical` pinned to `print`,
    /// is one `held` reads.
    #[cfg(feature = "shapes")]
    fn takes_answer(&self, held: &Held, print: &str, canonical: Option<&Datum>) -> Result<(), Unfit> {
        let Some((_, answer)) = &held.compiled else { return Err(Unfit::Unchecked { side: "answer", print: print.to_string() }) };
        let canonical = canonical.ok_or_else(|| Unfit::NotSent { side: "answer", print: print.to_string() })?;
        fits_as_agreed(&self.received(print, canonical, Use::Answer)?, answer, "answer")
    }

    #[cfg(not(feature = "shapes"))]
    fn takes_answer(&self, _held: &Held, print: &str, _canonical: Option<&Datum>) -> Result<(), Unfit> {
        Err(Unfit::Unchecked { side: "answer", print: print.to_string() })
    }

    /// The canonical argument shape `held` sends when the callee needs it.
    #[cfg(feature = "shapes")]
    fn argument_shape(held: &Held) -> Option<Datum> {
        held.compiled.as_ref().map(|(argument, _)| argument.canonical())
    }

    #[cfg(not(feature = "shapes"))]
    fn argument_shape(_held: &Held) -> Option<Datum> {
        None
    }
}

/// Why declared shapes could not be held.
#[cfg(feature = "shapes")]
#[derive(Debug, thiserror::Error)]
pub enum ShapesFault {
    #[error("operation {operation}: its {which} spelling is not a shape: {fault:?}")]
    NotAShape { operation: String, which: &'static str, fault: ShapeFault },
    #[error("operation {operation}: its {which} shape cannot be pinned: {why}")]
    Unpinnable { operation: String, which: &'static str, why: String },
}

#[cfg(feature = "shapes")]
impl Shapes {
    /// `declared`, each operation's argument and answer spelling, compiled
    /// and pinned by `pinner`; a shape an operation does not declare is
    /// `any`.
    pub fn new(declared: BTreeMap<String, DeclaredShapes>, pinner: Arc<dyn Pinner + Send + Sync>) -> Result<Shapes, ShapesFault> {
        let mut held = BTreeMap::new();
        for (operation, shapes) in declared {
            let (argument, argument_print) = compile_and_pin(&operation, "argument", shapes.arg.as_ref(), Use::Argument, &*pinner)?;
            let (answer, answer_print) = compile_and_pin(&operation, "answer", shapes.answer.as_ref(), Use::Answer, &*pinner)?;
            held.insert(operation, Held { argument_print, answer_print, compiled: Some((argument, answer)) });
        }
        Ok(Shapes { held, pinner: Some(pinner) })
    }

    /// A shape sent by fingerprint, if it pins to `print`: compiled for `use_`.
    fn received(&self, print: &str, canonical: &Datum, use_: Use) -> Result<Compiled, Unfit> {
        let sent = print.to_string();
        let Some(pinner) = &self.pinner else { return Err(Unfit::Unchecked { side: "argument", print: sent }) };
        match pinner.pin(canonical) {
            Ok(pinned) if pinned == print => {}
            Ok(pinned) => return Err(Unfit::Unpinned { sent, pinned }),
            Err(Unpinnable(why)) => return Err(Unfit::Unpinnable { sent, why }),
        }
        Shaped::read(canonical).and_then(|shaped| shaped.compile(use_)).map_err(|fault| Unfit::NotAShape { sent, fault })
    }
}

/// Why one side of an operation does not agree.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
#[cfg_attr(not(feature = "shapes"), allow(dead_code))]
enum Unfit {
    #[error("its {side} pins to {print}, another shape than this side's, and this side checks no shapes")]
    Unchecked { side: &'static str, print: String },
    #[error("a shape sent as {sent} pins to {pinned}")]
    Unpinned { sent: String, pinned: String },
    #[error("a shape sent as {sent} cannot be pinned: {why}")]
    Unpinnable { sent: String, why: String },
    #[cfg(feature = "shapes")]
    #[error("a shape sent as {sent} is not a shape: {fault:?}")]
    NotAShape { sent: String, fault: ShapeFault },
    #[error("its {side} shape {print} was not sent")]
    NotSent { side: &'static str, print: String },
    #[error("its {side} fits only in part; values at {} would be refused", .places.join(", "))]
    Partial { side: &'static str, places: Vec<String> },
    #[error("no {side} the caller may send fits, at {place}")]
    Disjoint { side: &'static str, place: String },
}

/// `spelling`, or `any` where there is none, compiled for `use_` and pinned.
#[cfg(feature = "shapes")]
fn compile_and_pin(operation: &str, which: &'static str, spelling: Option<&Datum>, use_: Use, pinner: &dyn Pinner) -> Result<(Compiled, Fingerprint), ShapesFault> {
    let any = spell::any();
    let compiled = Shaped::read(spelling.unwrap_or(&any)).and_then(|shaped| shaped.compile(use_))
        .map_err(|fault| ShapesFault::NotAShape { operation: operation.to_string(), which, fault })?;
    let print = compiled.fingerprint(pinner)
        .map_err(|Unpinnable(why)| ShapesFault::Unpinnable { operation: operation.to_string(), which, why })?;
    Ok((compiled, print))
}

/// Why a session did not agree on an operation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Disagreement {
    /// The caller's fingerprint for the side that did not agree, if it has one.
    pub caller: Option<String>,
    /// The callee's, if it has one.
    pub callee: Option<String>,
    /// What did not agree, and where.
    pub why: String,
}

/// What a session's opening agreed, operation by operation.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Agreement {
    agreed: BTreeSet<String>,
    disagreed: BTreeMap<String, Disagreement>,
    /// How many shapes crossed to reach it, both ways.
    pub shapes_sent: usize,
}

impl Agreement {
    /// Whether calls of `operation` run on the session.
    pub fn agrees(&self, operation: &str) -> bool {
        self.agreed.contains(operation)
    }

    /// Why the session did not agree on `operation`, if it named it and
    /// did not.
    pub fn disagreement(&self, operation: &str) -> Option<&Disagreement> {
        self.disagreed.get(operation)
    }
}

/// The id handshake frames carry: the session's, not a call's.
pub const OPENING: &str = "session.open";

/// Why a call made before its session agreed was refused.
pub const BEFORE_AGREEMENT: &str = "a call before the session agreed on shapes";

/// Why a call of an operation the session did not agree on was refused.
pub const NOT_AGREED: &str = "an operation the session did not agree on";

/// A text Datum.
pub fn datum_text(value: impl Into<String>) -> Datum {
    Datum::Text(value.into())
}

/// A map Datum of `fields`.
pub fn datum_map(fields: impl IntoIterator<Item = (&'static str, Datum)>) -> Datum {
    Datum::Map(fields.into_iter().map(|(key, value)| (key.to_string(), value)).collect())
}

/// The field `key` of a map Datum, if it has one.
pub fn member<'a>(datum: &'a Datum, key: &str) -> Option<&'a Datum> {
    match datum {
        Datum::Map(fields) => fields.get(key),
        _ => None,
    }
}

/// The text field `key` of a map Datum, if it has one.
pub fn text_member<'a>(datum: &'a Datum, key: &str) -> Option<&'a str> {
    match member(datum, key) {
        Some(Datum::Text(text)) => Some(text),
        _ => None,
    }
}

/// The map field `key` of a map Datum, or no fields.
pub fn members_of(datum: &Datum, key: &str) -> BTreeMap<String, Datum> {
    match member(datum, key) {
        Some(Datum::Map(fields)) => fields.clone(),
        _ => BTreeMap::new(),
    }
}

/// A handshake frame of `kind` carrying `argument`.
pub fn opening_frame(kind: Kind, argument: Datum) -> Vec<u8> {
    Frame { call: OPENING.to_string(), kind, operation: OPENING.to_string(), class: EffectCeiling::ReadOnly,
        deadline_ms: None, trace: None, on_behalf_of: None, watermark: None, argument }.encode()
}

/// What a verdict says on the wire.
#[cfg(feature = "shapes")]
fn verdict_datum(verdict: &Result<(), Unfit>) -> Datum {
    match verdict {
        Ok(()) => datum_map([("agreed", Datum::Bool(true))]),
        Err(unfit) => datum_map([("agreed", Datum::Bool(false)), ("why", datum_text(unfit.to_string()))]),
    }
}

/// Whether what `writer` sends is what `reader` takes, said as an
/// agreement: only Total agrees in this slice.
#[cfg(feature = "shapes")]
fn fits_as_agreed(writer: &Compiled, reader: &Compiled, side: &'static str) -> Result<(), Unfit> {
    match Verdict::resolve(writer, reader) {
        Verdict::Total => Ok(()),
        Verdict::Partial(places) => Err(Unfit::Partial { side, places }),
        Verdict::Disjoint(place) => Err(Unfit::Disjoint { side, place }),
    }
}

/// What a caller's opening comes to once it has read the callee's `opened`.
pub enum CallerOpened {
    /// The session agreed on everything it could, and nothing more crosses.
    Agreed(Agreement),
    /// The callee needs argument shapes: send `shapes`, then hand the
    /// callee's `agreed` to `pending`.
    Needs { shapes: Vec<u8>, pending: PendingAgreement },
}

/// A caller's agreement waiting on the callee's verdicts for the shapes it sent.
pub struct PendingAgreement {
    agreement: Agreement,
    needed: BTreeMap<String, String>,
    served: BTreeMap<String, Datum>,
}

impl Shapes {
    /// The caller's `open` frame: each operation it will call, with the
    /// fingerprints of the argument it writes and the answer it reads.
    pub fn open_frame(&self) -> Vec<u8> {
        let asked = self.held.iter().map(|(operation, held)| (operation.clone(),
            datum_map([("argument", datum_text(held.argument_print.0.clone())), ("answer", datum_text(held.answer_print.0.clone()))]))).collect();
        opening_frame(Kind::Open, datum_map([("operations", Datum::Map(asked))]))
    }

    /// The caller's reading of the callee's `opened`, whose argument is
    /// `opened`: agreed, or the shapes the callee needs.
    pub fn opened(&self, opened: &Datum) -> CallerOpened {
        let served = members_of(opened, "operations");
        let mut agreement = Agreement::default();
        let mut needed = BTreeMap::new();
        let mut asked_for = false;
        for (operation, held) in &self.held {
            let disagreed = |caller: &Fingerprint, callee: Option<&str>, why: String| {
                Disagreement { caller: Some(caller.0.clone()), callee: callee.map(str::to_string), why }
            };
            let Some(answer) = served.get(operation).filter(|answer| member(answer, "served") == Some(&Datum::Bool(true))) else {
                agreement.disagreed.insert(operation.clone(), disagreed(&held.argument_print, None, format!("the callee serves no operation {operation}")));
                continue;
            };
            let callee_answer = text_member(answer, "answer").unwrap_or_default();
            if callee_answer != held.answer_print.0 {
                agreement.shapes_sent += 1;
                if let Err(unfit) = self.takes_answer(held, callee_answer, member(answer, "answer_shape")) {
                    agreement.disagreed.insert(operation.clone(), disagreed(&held.answer_print, Some(callee_answer), unfit.to_string()));
                    continue;
                }
            }
            match text_member(answer, "argument") {
                Some("same") => {
                    agreement.agreed.insert(operation.clone());
                }
                Some("needs") if Self::argument_shape(held).is_some() => {
                    asked_for = true;
                    needed.insert(operation.clone(), held.argument_print.0.clone());
                }
                Some("needs") => {
                    // The callee still waits for a `shapes`; it is sent
                    // without this one, which the callee then refuses too.
                    asked_for = true;
                    let unchecked = Unfit::Unchecked { side: "argument", print: held.argument_print.0.clone() };
                    let callee = text_member(answer, "callee_argument");
                    agreement.disagreed.insert(operation.clone(), disagreed(&held.argument_print, callee, unchecked.to_string()));
                }
                other => {
                    let why = format!("the callee answered its argument {other:?}");
                    agreement.disagreed.insert(operation.clone(), disagreed(&held.argument_print, None, why));
                }
            }
        }
        if !asked_for {
            return CallerOpened::Agreed(agreement);
        }
        let sent: BTreeMap<String, Datum> = needed.values()
            .filter_map(|print| self.held.values().find(|held| &held.argument_print.0 == print).and_then(|held| Some((print.clone(), Self::argument_shape(held)?))))
            .collect();
        agreement.shapes_sent += sent.len();
        let shapes = opening_frame(Kind::Shapes, datum_map([("shapes", Datum::Map(sent))]));
        CallerOpened::Needs { shapes, pending: PendingAgreement { agreement, needed, served } }
    }
}

impl PendingAgreement {
    /// The session's agreement, given the argument of the callee's `agreed`.
    pub fn agreed(self, agreed: &Datum) -> Agreement {
        let PendingAgreement { mut agreement, needed, served } = self;
        let agreed = members_of(agreed, "operations");
        for (operation, print) in needed {
            let verdict = agreed.get(&operation);
            if verdict.and_then(|verdict| member(verdict, "agreed")) == Some(&Datum::Bool(true)) {
                agreement.agreed.insert(operation);
            } else {
                let why = verdict.and_then(|verdict| text_member(verdict, "why")).unwrap_or("the callee gave no verdict").to_string();
                let callee = served.get(&operation).and_then(|answer| text_member(answer, "callee_argument")).map(str::to_string);
                agreement.disagreed.insert(operation, Disagreement { caller: Some(print), callee, why });
            }
        }
        agreement
    }
}

/// What a callee's opening comes to once it has read the caller's `open`:
/// the `opened` frame to send, the operations agreed so far, and those
/// whose argument shapes it needs.
#[cfg(feature = "shapes")]
pub struct CalleeOpened {
    /// The `opened` frame, to send.
    pub opened: Vec<u8>,
    agreed: BTreeSet<String>,
    needed: BTreeMap<String, String>,
}

#[cfg(feature = "shapes")]
impl CalleeOpened {
    /// The operations agreed, when the callee needs no shape: `None` when
    /// it waits on the caller's `shapes`.
    pub fn agreed(&self) -> Option<&BTreeSet<String>> {
        self.needed.is_empty().then_some(&self.agreed)
    }

    /// The `agreed` frame to send, and every operation agreed, given the
    /// argument of the caller's `shapes`.
    pub fn shapes(self, shapes: &Shapes, sent: &Datum) -> (Vec<u8>, BTreeSet<String>) {
        let CalleeOpened { mut agreed, needed, .. } = self;
        let sent = members_of(sent, "shapes");
        let mut verdicts = BTreeMap::new();
        for (operation, print) in needed {
            let held = &shapes.held[&operation];
            let verdict = sent.get(&print).ok_or_else(|| Unfit::NotSent { side: "argument", print: print.clone() })
                .and_then(|canonical| shapes.received(&print, canonical, Use::Argument))
                .and_then(|theirs| match &held.compiled {
                    Some((argument, _)) => fits_as_agreed(&theirs, argument, "argument"),
                    None => Err(Unfit::Unchecked { side: "argument", print: print.clone() }),
                });
            if verdict.is_ok() {
                agreed.insert(operation.clone());
            }
            verdicts.insert(operation, verdict_datum(&verdict));
        }
        (opening_frame(Kind::Agreed, datum_map([("operations", Datum::Map(verdicts))])), agreed)
    }
}

#[cfg(feature = "shapes")]
impl Shapes {
    /// The callee's reading of the caller's `open`, whose argument is `open`.
    pub fn open(&self, open: &Datum) -> CalleeOpened {
        let mut agreed = BTreeSet::new();
        let mut needed = BTreeMap::new();
        let mut answers = BTreeMap::new();
        for (operation, asked) in members_of(open, "operations") {
            let Some(held) = self.held.get(&operation) else {
                answers.insert(operation, datum_map([("served", Datum::Bool(false))]));
                continue;
            };
            let theirs = text_member(&asked, "argument").unwrap_or_default().to_string();
            let mut answer = BTreeMap::from([
                ("served".to_string(), Datum::Bool(true)),
                ("callee_argument".to_string(), datum_text(held.argument_print.0.clone())),
                ("answer".to_string(), datum_text(held.answer_print.0.clone())),
            ]);
            if let (Some((_, own)), false) = (&held.compiled, text_member(&asked, "answer") == Some(held.answer_print.0.as_str())) {
                answer.insert("answer_shape".to_string(), own.canonical());
            }
            if theirs == held.argument_print.0 {
                answer.insert("argument".to_string(), datum_text("same"));
                agreed.insert(operation.clone());
            } else {
                answer.insert("argument".to_string(), datum_text("needs"));
                needed.insert(operation.clone(), theirs);
            }
            answers.insert(operation, Datum::Map(answer));
        }
        let opened = opening_frame(Kind::Opened, datum_map([("operations", Datum::Map(answers))]));
        CalleeOpened { opened, agreed, needed }
    }
}
```

The session drives an opening over its connection, a frame at a time:
the caller writes its `open` and reads the callee's answers; the callee
reads the `open`, refusing by name any call that comes before it.

<a name="chunk-agreeing"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-session/src/lib.rs) · `#agreeing`</sub>

```rust {#agreeing}
/// Why a session could not open.
#[derive(Debug, thiserror::Error)]
pub enum OpenFault {
    #[error("the connection ended before the session agreed")]
    Ended,
    #[error(transparent)]
    Read(#[from] ReadFault),
    #[error("the session's opening was answered with something else: {0}")]
    Unexpected(String),
}

/// The caller's half of an opening: what it agreed, operation by operation.
async fn agree_as_caller<R: AsyncRead + Unpin>(
    reader: &mut FrameReader<R>, frames: &mpsc::Sender<Vec<u8>>, shapes: &Shapes,
) -> Result<Agreement, OpenFault> {
    frames.send(shapes.open_frame()).await.map_err(|_| OpenFault::Ended)?;
    let opened = next_frame_of(reader, Kind::Opened).await?;
    match shapes.opened(&opened) {
        CallerOpened::Agreed(agreement) => Ok(agreement),
        CallerOpened::Needs { shapes, pending } => {
            frames.send(shapes).await.map_err(|_| OpenFault::Ended)?;
            Ok(pending.agreed(&next_frame_of(reader, Kind::Agreed).await?))
        }
    }
}

/// The callee's half of an opening: the operations whose calls it hears.
/// A call that comes before the opening is refused, by name.
async fn agree_as_callee<R: AsyncRead + Unpin>(
    reader: &mut FrameReader<R>, frames: &mpsc::Sender<Vec<u8>>, shapes: &Shapes,
) -> Result<BTreeSet<String>, OpenFault> {
    let open = loop {
        let frame = reader.next().await?.ok_or(OpenFault::Ended)?;
        match frame.kind {
            Kind::Open => break frame.argument,
            Kind::Call | Kind::Subscribe => {
                let refused = answer_frame(frame.call, frame.operation, frame.class, Answer::Refused(BEFORE_AGREEMENT.to_string()));
                frames.send(refused.encode()).await.map_err(|_| OpenFault::Ended)?;
            }
            other => return Err(OpenFault::Unexpected(other.as_str().to_string())),
        }
    };
    let opened = shapes.open(&open);
    frames.send(opened.opened.clone()).await.map_err(|_| OpenFault::Ended)?;
    if let Some(agreed) = opened.agreed() {
        return Ok(agreed.clone());
    }
    let sent = next_frame_of(reader, Kind::Shapes).await?;
    let (verdicts, agreed) = opened.shapes(shapes, &sent);
    frames.send(verdicts).await.map_err(|_| OpenFault::Ended)?;
    Ok(agreed)
}

/// The next frame, which must be of `kind`: its argument.
async fn next_frame_of<R: AsyncRead + Unpin>(reader: &mut FrameReader<R>, kind: Kind) -> Result<Datum, OpenFault> {
    let frame = reader.next().await?.ok_or(OpenFault::Ended)?;
    match frame.kind == kind {
        true => Ok(frame.argument),
        false => Err(OpenFault::Unexpected(frame.kind.as_str().to_string())),
    }
}
```

## The callee's side

A callee is whatever runs an operation: given what it heard (the
operation's name, its declared side-effect class, its argument, the
call's trace context and, from a forwarder, whom it asks for), it
answers. `serve` reads calls off a connection and runs each on its own
task as it arrives, holding one of the connection's in-flight permits; a
call that finds none left is answered `refused`, naming the bound, and
never reaches the callee. Neither does a call naming an asker on a
connection that is not a forwarder's ("Who asks", below), nor a call of an
operation the session did not agree on (`NOT_AGREED`). A subscribe
opens a subscription on its own task ("Subscriptions", below), refused by
name past the connection's subscription bound, under an id already
open, or for an operation the session did not agree on; an unsubscribe
ends the one its id names, and every subscription on the connection ends
with it. A frame that is not a call is not the callee's to answer and is
passed over.
`serve` returns when the connection ends, once every answer it owes has
been queued for the writer.

<a name="chunk-callee"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-session/src/lib.rs) · `#callee`</sub>

```rust {#callee}
/// One call as its callee hears it.
#[derive(Clone, Debug, PartialEq)]
pub struct Heard {
    /// The caller's id for the call, which a withdraw names.
    pub call: String,
    /// The operation called.
    pub operation: String,
    /// The operation's declared side-effect class.
    pub class: EffectCeiling,
    /// The call's argument.
    pub argument: Datum,
    /// The call's trace context, as the caller gave it.
    pub trace: Option<String>,
    /// Whom the forwarder that sent the call asks for: only ever set on a
    /// forwarder's connection.
    pub on_behalf_of: Option<String>,
    /// The process at the other end of the connection, as its endpoint
    /// names it: never read from the wire.
    pub peer: Option<Peer>,
}

/// The process at the other end of a connection, as the platform names it
/// to the endpoint that accepted it (`SO_PEERCRED` on a unix socket). The
/// uid is the caller; the pid names a process, not a durable caller, so a
/// callee keys what it records by the uid and its operation's own fields,
/// and reads the pid only for tracing.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Peer {
    pub uid: u32,
    pub pid: Option<u32>,
}

/// What runs a session's calls on its callee side.
pub trait Callee: Send + Sync + 'static {
    /// Run the call `heard`.
    fn call(&self, heard: Heard) -> impl Future<Output = Answer> + Send;

    /// Open the subscription `heard` asks for, resuming from `from`, the
    /// last watermark its subscriber read, when it gives one: its opening,
    /// and the wakes that say what it watches moved; or why not. Wakes the
    /// subscriber has not taken coalesce: each replaces the one before. A
    /// callee that serves no subscriptions refuses every one.
    fn subscribe(&self, heard: Heard, from: Option<Datum>) -> impl Future<Output = Result<Opened, NotOpened>> + Send {
        let _ = (heard, from);
        std::future::ready(Err(NotOpened { why: NO_SUBSCRIPTIONS.to_string() }))
    }

    /// Answer the call `heard` began and left pending under `handle`. A
    /// callee that leaves nothing pending refuses, by name.
    fn settle(&self, heard: Heard, handle: String) -> impl Future<Output = Answer> + Send {
        let _ = (heard, handle);
        std::future::ready(Answer::Refused(NOTHING_PENDING.to_string()))
    }

    /// Say what became of the call `heard`, whose caller does not know its
    /// outcome. A callee that keeps no record cannot say.
    fn probe(&self, heard: Heard) -> impl Future<Output = Found> + Send {
        let _ = heard;
        std::future::ready(Found::Unknowable)
    }

    /// Stop what can still be stopped of the call `call` of `operation`,
    /// in flight; its answer then says how far it got.
    fn withdraw(&self, call: &str, operation: &str) {
        let _ = (call, operation);
    }
}

/// Serve the calls read off `stream` with `callee` until the stream ends:
/// first agree on `shapes`, then run each call as it arrives and answer it
/// under its id as it finishes. Every call and subscription is heard from
/// `peer`, the process its endpoint accepted the connection from.
pub async fn serve<S, C>(stream: S, callee: Arc<C>, policy: SessionPolicy, shapes: Arc<Shapes>, peer: Option<Peer>) -> Result<(), OpenFault>
where
    S: AsyncRead + AsyncWrite + Send + 'static,
    C: Callee,
{
    let (reader, writer) = tokio::io::split(stream);
    let (frames, queued) = mpsc::channel(policy.write_queue);
    let writing = tokio::spawn(write_frames(writer, queued));
    let permits = Arc::new(Semaphore::new(policy.in_flight));
    let mut reader = FrameReader::new(reader, policy.frame_cap);
    let agreed = match agree_as_callee(&mut reader, &frames, &shapes).await {
        Ok(agreed) => agreed,
        Err(fault) => {
            drop(frames);
            let _ = writing.await;
            return Err(fault);
        }
    };
    let mut running = tokio::task::JoinSet::new();
    let mut open: HashMap<String, tokio::task::AbortHandle> = HashMap::new();
    let read = loop {
        let frame = match reader.next().await {
            Ok(Some(frame)) => frame,
            Ok(None) => break Ok(()),
            Err(fault) => break Err(OpenFault::Read(fault)),
        };
        let Frame { call, kind, operation, class, argument, trace, on_behalf_of, watermark, .. } = frame;
        match kind {
            Kind::Call | Kind::Settle | Kind::Probe => {}
            Kind::Withdraw => {
                if agreed.contains(&operation) {
                    callee.withdraw(&call, &operation);
                }
                continue;
            }
            Kind::Subscribe => {
                open.retain(|_, task| !task.is_finished());
                let refused = match () {
                    _ if on_behalf_of.is_some() && !policy.forwarded => Some(NOT_A_FORWARDER),
                    _ if !agreed.contains(&operation) => Some(NOT_AGREED),
                    _ if open.contains_key(&call) => Some(ALREADY_SUBSCRIBED),
                    _ if open.len() >= policy.subscriptions => Some(PAST_SUBSCRIPTIONS),
                    _ => None,
                };
                if let Some(why) = refused {
                    if frames.send(answer_frame(call, operation, class, Answer::Refused(why.to_string())).encode()).await.is_err() {
                        break Ok(());
                    }
                    continue;
                }
                let heard = Heard { call: call.clone(), operation, class, argument, trace, on_behalf_of, peer };
                let task = running.spawn(subscription(Arc::clone(&callee), frames.clone(), call.clone(), heard, watermark));
                open.insert(call, task);
                continue;
            }
            Kind::Unsubscribe => {
                if let Some(task) = open.remove(&call) {
                    task.abort();
                }
                continue;
            }
            Kind::Reply | Kind::Refused | Kind::Pending | Kind::Wake | Kind::Open | Kind::Opened | Kind::Shapes | Kind::Agreed => {
                tracing::debug!(call, kind = kind.as_str(), "a frame that is not a call or a subscription reached a callee; passed over");
                continue;
            }
        }
        let refusal = match (on_behalf_of.is_some() && !policy.forwarded, agreed.contains(&operation)) {
            (true, _) => Err(NOT_A_FORWARDER),
            (false, false) => Err(NOT_AGREED),
            (false, true) => Arc::clone(&permits).try_acquire_owned().map_err(|_| PAST_IN_FLIGHT),
        };
        let permit = match refusal {
            Ok(permit) => permit,
            Err(why) => {
                let refused = answer_frame(call, operation, class, Answer::Refused(why.to_string()));
                if frames.send(refused.encode()).await.is_err() {
                    break Ok(());
                }
                continue;
            }
        };
        let (callee, frames) = (Arc::clone(&callee), frames.clone());
        let frame_cap = policy.frame_cap;
        running.spawn(async move {
            let heard = Heard { call: call.clone(), operation: operation.clone(), class, argument, trace, on_behalf_of, peer };
            let answer = match kind {
                Kind::Settle => match handle_of(&heard.argument) {
                    Some(handle) => callee.settle(heard, handle).await,
                    None => Answer::Refused(NO_HANDLE.to_string()),
                },
                Kind::Probe => Answer::Reply(found_datum(callee.probe(heard).await)),
                _ => callee.call(heard).await,
            };
            drop(permit);
            let mut answered = answer_frame(call.clone(), operation.clone(), class, answer).encode();
            if answered.len().saturating_sub(4) > frame_cap {
                answered = answer_frame(call, operation, class, Answer::Refused(REPLY_PAST_CAP.to_string())).encode();
            }
            let _ = frames.send(answered).await;
        });
    };
    for task in open.values() {
        task.abort();
    }
    while running.join_next().await.is_some() {}
    drop(frames);
    let _ = writing.await;
    read
}

/// The subscription `heard` asks for, opened on `callee`: its opening sent
/// as the reply to `call`, then each wake as it stands when the writer can
/// take it, until the callee ends the subscription or it is aborted.
async fn subscription<C: Callee>(callee: Arc<C>, frames: mpsc::Sender<Vec<u8>>, call: String, heard: Heard, from: Option<Datum>) {
    let (operation, class) = (heard.operation.clone(), heard.class);
    let mut wakes = match callee.subscribe(heard, from).await {
        Ok(Opened { opening, wakes }) => {
            let opened = answer_frame(call.clone(), operation.clone(), class, Answer::Reply(opening));
            if frames.send(opened.encode()).await.is_err() {
                return;
            }
            wakes
        }
        Err(NotOpened { why }) => {
            let _ = frames.send(answer_frame(call, operation, class, Answer::Refused(why)).encode()).await;
            return;
        }
    };
    // A wake already standing when the subscription opens, as a resumed one
    // past its subscriber's watermark has, is sent first.
    wakes.mark_changed();
    while wakes.changed().await.is_ok() {
        let Some(wake) = wakes.borrow_and_update().clone() else { continue };
        let frame = Frame {
            call: call.clone(),
            kind: Kind::Wake,
            operation: operation.clone(),
            class,
            deadline_ms: None,
            trace: None,
            on_behalf_of: None,
            watermark: Some(wake.watermark),
            argument: wake.moved,
        };
        if frames.send(frame.encode()).await.is_err() {
            return;
        }
    }
    let _ = frames.send(answer_frame(call, operation, class, Answer::Refused(SUBSCRIPTION_ENDED.to_string())).encode()).await;
}
```

## The caller's side

A `Session` holds one connection's calling side. Each call registers its
id with the reply slot it waits on before its frame is queued, so an
answer can never arrive for a call the session does not know; the reader
hands each answer to the slot its id names and passes over one no call
waits for, which is a call that already stopped waiting. A call with a
deadline stops waiting when it passes, takes its id back, and is told its
outcome is unknown. When the connection ends, the reader marks the
session ended and answers every call still waiting the same way; a call
made after the mark is never sent and fails closed, so no call takes a
slot the reader will never answer.

A call is first an `Ask`, which becomes the frame its caller sends. A
page that calls with no session of its own builds its frames the same way,
so what it sends is what this caller sends.

<a name="chunk-ask"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-session/src/lib.rs) · `#ask`</sub>

```rust {#ask}
/// One call a caller makes: what it calls, under which id, and how long it
/// waits.
#[derive(Clone, Debug, PartialEq)]
pub struct Ask {
    /// The caller's id for the call.
    pub call: String,
    /// The operation called.
    pub operation: String,
    /// The operation's declared side-effect class.
    pub class: EffectCeiling,
    /// The call's argument.
    pub argument: Datum,
    /// How long the caller waits for its answer.
    pub deadline: Option<Duration>,
    /// The call's trace context, a W3C `traceparent`.
    pub trace: Option<String>,
    /// Whom a forwarder asks for.
    pub on_behalf_of: Option<String>,
}

impl Ask {
    /// A call of `operation`, declared `class`, on `argument` under the
    /// caller's id `call`, waiting with no deadline, with no trace and for
    /// no other asker.
    pub fn new(call: impl Into<String>, operation: impl Into<String>, class: EffectCeiling, argument: Datum) -> Ask {
        Ask { call: call.into(), operation: operation.into(), class, argument, deadline: None, trace: None, on_behalf_of: None }
    }

    /// The same call, waiting for its answer at most `deadline`.
    pub fn within(self, deadline: Duration) -> Ask {
        Ask { deadline: Some(deadline), ..self }
    }

    /// The call as the frame of `kind` its caller sends, carrying
    /// `watermark`: a call, a subscribe, a settle or a probe.
    pub fn into_frame(self, kind: Kind, watermark: Option<Datum>) -> Frame {
        let Ask { call, operation, class, argument, deadline, trace, on_behalf_of } = self;
        let deadline_ms = deadline.map(|deadline| u64::try_from(deadline.as_millis()).unwrap_or(u64::MAX));
        Frame { call, kind, operation, class, deadline_ms, trace, on_behalf_of, watermark, argument }
    }
}
```

<a name="chunk-caller"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-session/src/lib.rs) · `#caller`</sub>

```rust {#caller}
/// The reply slots of the calls in flight on a session, by id.
type Waiting = Arc<Mutex<HashMap<String, oneshot::Sender<Result<Begun, CallFault>>>>>;

/// The calling side of a session: many calls in flight on one connection,
/// each answered under its own id.
pub struct Session {
    frames: mpsc::Sender<Vec<u8>>,
    frame_cap: usize,
    waiting: Waiting,
    agreement: Agreement,
    subscribed: Subscribed,
    ended: Arc<std::sync::atomic::AtomicBool>,
    reading: tokio::task::JoinHandle<()>,
    writing: tokio::task::JoinHandle<()>,
}

impl Session {
    /// A session over `stream`, which it reads and writes until dropped,
    /// opened by agreeing on `shapes`: the session, and what it agreed.
    pub async fn open<S: AsyncRead + AsyncWrite + Send + 'static>(stream: S, policy: SessionPolicy, shapes: &Shapes) -> Result<(Session, Agreement), OpenFault> {
        let (reader, writer) = tokio::io::split(stream);
        let (frames, queued) = mpsc::channel(policy.write_queue);
        let waiting: Waiting = Arc::new(Mutex::new(HashMap::new()));
        let subscribed: Subscribed = Arc::new(Mutex::new(HashMap::new()));
        let writing = tokio::spawn(write_frames(writer, queued));
        let mut reader = FrameReader::new(reader, policy.frame_cap);
        let agreement = match agree_as_caller(&mut reader, &frames, shapes).await {
            Ok(agreement) => agreement,
            Err(fault) => {
                writing.abort();
                return Err(fault);
            }
        };
        let ended = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let reading = tokio::spawn(read_answers(reader, Arc::clone(&waiting), Arc::clone(&subscribed), Arc::clone(&ended)));
        let frame_cap = policy.frame_cap;
        Ok((Session { frames, frame_cap, waiting, agreement: agreement.clone(), subscribed, ended, reading, writing }, agreement))
    }

    /// Whether this session's connection has ended: a call it answered
    /// unknown since did not outlive its deadline but its connection.
    pub fn ended(&self) -> bool {
        self.ended.load(std::sync::atomic::Ordering::SeqCst)
    }

    /// Make the call `ask` and wait for its answer, at most its deadline.
    pub async fn call(&self, ask: Ask) -> Result<Datum, CallFault> {
        let call = ask.call.clone();
        match self.asked(ask, Kind::Call, None).await? {
            Begun::Ready(reply) => Ok(reply),
            Begun::Pending { .. } => Err(CallFault::Refused { call, why: PENDED_TO_A_CALL.to_string() }),
        }
    }

    /// Begin the call `ask`: its answer, or that the callee left it
    /// pending under a handle to settle it by.
    pub async fn start(&self, ask: Ask) -> Result<Begun, CallFault> {
        self.asked(ask, Kind::Call, None).await
    }

    /// Ask for the answer of a call `ask` names that was left pending
    /// under `handle`: its answer, or that it is pending still.
    pub async fn settle(&self, ask: Ask, handle: &str) -> Result<Begun, CallFault> {
        self.asked(Ask { argument: handle_datum(handle), ..ask }, Kind::Settle, None).await
    }

    /// Ask what became of the call `ask` describes, whose outcome is
    /// unknown: the callee's finding.
    pub async fn probe(&self, ask: Ask) -> Result<Found, CallFault> {
        let call = ask.call.clone();
        match self.asked(ask, Kind::Probe, None).await? {
            Begun::Ready(reply) => Ok(found_of(reply)),
            Begun::Pending { .. } => Err(CallFault::Refused { call, why: "a probe was answered pending".to_string() }),
        }
    }

    /// Ask the callee to stop what it can of the call `call` of
    /// `operation`, in flight; the call's own answer says how far it got.
    pub async fn withdraw(&self, call: &str, operation: &str) -> Result<(), CallFault> {
        let frame = Frame { call: call.to_string(), kind: Kind::Withdraw, operation: operation.to_string(), class: EffectCeiling::ReadOnly,
            deadline_ms: None, trace: None, on_behalf_of: None, watermark: None, argument: Datum::Null };
        self.frames.send(frame.encode()).await.map_err(|_| CallFault::Closed)
    }

    /// Send `ask` as a frame of `kind`, carrying `watermark`, and wait for
    /// its answer, at most its deadline.
    async fn asked(&self, ask: Ask, kind: Kind, watermark: Option<Datum>) -> Result<Begun, CallFault> {
        let (call, deadline) = (ask.call.clone(), ask.deadline);
        let call = call.as_str();
        if !self.agreement.agrees(&ask.operation) {
            let disagreement = self.agreement.disagreement(&ask.operation).cloned().unwrap_or_else(|| Disagreement {
                caller: None, callee: None, why: "the session's opening did not name it".to_string() });
            let Disagreement { caller, callee, why } = disagreement;
            return Err(CallFault::Disagreed { call: call.to_string(), operation: ask.operation, caller, callee, why });
        }
        let (slot, answered) = oneshot::channel();
        {
            let mut waiting = self.waiting.lock().unwrap_or_else(PoisonError::into_inner);
            if waiting.contains_key(call) {
                return Err(CallFault::InFlight { call: call.to_string() });
            }
            if self.ended() {
                return Err(CallFault::Closed);
            }
            waiting.insert(call.to_string(), slot);
        }
        let encoded = ask.into_frame(kind, watermark).encode();
        if encoded.len().saturating_sub(4) > self.frame_cap {
            self.forget(call);
            return Err(CallFault::Refused { call: call.to_string(), why: CALL_PAST_CAP.to_string() });
        }
        if self.frames.send(encoded).await.is_err() {
            self.forget(call);
            return Err(CallFault::Closed);
        }
        let answered = match deadline {
            None => answered.await,
            Some(deadline) => match tokio::time::timeout(deadline, answered).await {
                Ok(answered) => answered,
                Err(_) => {
                    self.forget(call);
                    return Err(CallFault::Unknown { call: call.to_string() });
                }
            },
        };
        answered.unwrap_or_else(|_| Err(CallFault::Unknown { call: call.to_string() }))
    }

    /// Stop waiting for `call`'s answer.
    fn forget(&self, call: &str) {
        self.waiting.lock().unwrap_or_else(PoisonError::into_inner).remove(call);
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.reading.abort();
        self.writing.abort();
        self.subscribed.lock().unwrap_or_else(PoisonError::into_inner).clear();
    }
}

/// Hand each answer read off `reader` to the call its id names and each
/// wake to the subscription its id names, then, when the connection ends,
/// answer every call still waiting unknown and end every subscription.
async fn read_answers<R: AsyncRead + Unpin>(
    mut reader: FrameReader<R>, waiting: Waiting, subscribed: Subscribed, ended: Arc<std::sync::atomic::AtomicBool>,
) {
    loop {
        let frame = match reader.next().await {
            Ok(Some(frame)) => frame,
            Ok(None) => break,
            Err(fault) => {
                tracing::warn!(error = %fault, "a session stopped reading its connection");
                break;
            }
        };
        if frame.kind == Kind::Wake {
            let call = frame.call.clone();
            let wake = Wake::of(frame);
            match subscribed.lock().unwrap_or_else(PoisonError::into_inner).get(&call) {
                Some(latest) => {
                    latest.send_replace(Some(wake));
                }
                None => tracing::debug!(call = %call, "a wake for no open subscription; passed over"),
            }
            continue;
        }
        let Some(slot) = waiting.lock().unwrap_or_else(PoisonError::into_inner).remove(&frame.call) else {
            // A refusal under an open subscription's id, its opening taken, is
            // its callee ending it: the wakes end with `None`.
            if frame.kind != Kind::Refused || subscribed.lock().unwrap_or_else(PoisonError::into_inner).remove(&frame.call).is_none() {
                tracing::debug!(call = %frame.call, "an answer no call waits for; passed over");
            }
            continue;
        };
        let answer = answer_said(frame);
        let _ = slot.send(answer);
    }
    ended.store(true, std::sync::atomic::Ordering::SeqCst);
    let unanswered: Vec<_> = waiting.lock().unwrap_or_else(PoisonError::into_inner).drain().collect();
    for (call, slot) in unanswered {
        let _ = slot.send(Err(CallFault::Unknown { call }));
    }
    subscribed.lock().unwrap_or_else(PoisonError::into_inner).clear();
}
```

## Subscriptions

A subscription is the maintained view's contract carried on a session
(`x0k:architecture/query-subscriptions` §1): the subscribe is answered
with its opening, and afterwards a wake says only that what it watches
moved past a watermark and what moved, never the moved bytes; the
subscriber pulls the change at its own pace. The callee hands its wakes
to the session as a latest-value channel (`tokio::sync::watch`), and the
session's task for the subscription sends whatever stands in it when the
writer can take it, so a burst of changes leaves as one wake for the
latest; the caller's side keeps the same latest-value slot for its
subscriber. What a connection buffers for a subscription is its latest
wake and the one being written, whatever the rate of change.

A subscriber resumes by naming the last watermark it read when it
subscribes again on a new connection; the callee, given that watermark,
wakes it at once if what it watches has moved past it, so a wake lost with
a connection loses no change. Dropping the subscriber's `Wakes` sends the
unsubscribe; the callee's task for it ends and drops the channel, which
its callee can watch for. When the connection ends, every subscription on
it ends on both sides, and a subscriber waiting for a wake is told.

A wake is a frame's watermark and what it names as moved; a subscriber
with no session of its own reads one the same way.

<a name="chunk-wake"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-session/src/lib.rs) · `#wake`</sub>

```rust {#wake}
/// What a subscription watches moved, to `watermark`; `moved` names what
/// moved, as its callee spells it, never the moved bytes.
#[derive(Clone, Debug, PartialEq)]
pub struct Wake {
    /// Where what the subscription watches now stands.
    pub watermark: Datum,
    /// What moved, as the callee names it.
    pub moved: Datum,
}

impl Wake {
    /// What the wake `frame` says.
    pub fn of(frame: Frame) -> Wake {
        Wake { watermark: frame.watermark.unwrap_or(Datum::Null), moved: frame.argument }
    }
}
```

<a name="chunk-subscriptions"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-session/src/lib.rs) · `#subscriptions`</sub>

```rust {#subscriptions}
/// Why a callee did not open a subscription; its subscriber is told it,
/// as a refusal.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NotOpened {
    /// What the subscriber is told.
    pub why: String,
}

/// A subscription its callee opened: its opening, and its wakes, each
/// replacing the one before until the session takes it.
pub struct Opened {
    /// What the subscriber starts from.
    pub opening: Datum,
    /// The latest wake the session has not yet sent.
    pub wakes: watch::Receiver<Option<Wake>>,
}

/// Where each subscription open on a session's calling side keeps its
/// latest wake for its subscriber, by id.
type Subscribed = Arc<Mutex<HashMap<String, watch::Sender<Option<Wake>>>>>;

/// A subscriber's side of one open subscription. Dropping it ends the
/// subscription.
pub struct Wakes {
    call: String,
    wakes: watch::Receiver<Option<Wake>>,
    frames: mpsc::Sender<Vec<u8>>,
    subscribed: Subscribed,
}

impl Wakes {
    /// The latest wake the subscriber has not taken, waiting for one, or
    /// `None` once the subscription has ended with its connection.
    pub async fn next(&mut self) -> Option<Wake> {
        loop {
            self.wakes.changed().await.ok()?;
            if let Some(wake) = self.wakes.borrow_and_update().clone() {
                return Some(wake);
            }
        }
    }
}

impl Drop for Wakes {
    fn drop(&mut self) {
        self.subscribed.lock().unwrap_or_else(PoisonError::into_inner).remove(&self.call);
        let ended = Frame {
            call: self.call.clone(),
            kind: Kind::Unsubscribe,
            operation: String::new(),
            class: EffectCeiling::ReadOnly,
            deadline_ms: None,
            trace: None,
            on_behalf_of: None,
            watermark: None,
            argument: Datum::Null,
        };
        // Best effort: a writer with no room learns it at the connection's
        // end, which ends the subscription as well.
        let _ = self.frames.try_send(ended.encode());
    }
}

impl Session {
    /// Open the subscription `ask` names, resuming from `from`, the last
    /// watermark its subscriber read when it has one: the opening, and the
    /// subscriber's wakes.
    pub async fn subscribe(&self, ask: Ask, from: Option<Datum>) -> Result<(Datum, Wakes), CallFault> {
        let call = ask.call.clone();
        let (latest, wakes) = watch::channel(None);
        {
            let mut subscribed = self.subscribed.lock().unwrap_or_else(PoisonError::into_inner);
            if subscribed.contains_key(&call) {
                return Err(CallFault::InFlight { call });
            }
            subscribed.insert(call.clone(), latest);
        }
        let answered = match self.asked(ask, Kind::Subscribe, from).await {
            Ok(Begun::Pending { .. }) => Err(CallFault::Refused { call: call.clone(), why: "a subscribe was answered pending".to_string() }),
            Ok(Begun::Ready(opening)) => Ok(opening),
            Err(fault) => Err(fault),
        };
        match answered {
            Ok(opening) => {
                let wakes = Wakes { call, wakes, frames: self.frames.clone(), subscribed: Arc::clone(&self.subscribed) };
                Ok((opening, wakes))
            }
            Err(fault) => {
                self.subscribed.lock().unwrap_or_else(PoisonError::into_inner).remove(&call);
                Err(fault)
            }
        }
    }
}
```

## Calls begun and finished later

An operation that takes long may answer its call pending: begun, not
finished, under a handle its callee minted (`x0k:architecture/operation-surface`
§1; the runtime contract's `start` and `settle`). Its caller begins it with
`start`, which is told the answer or the handle, and later asks for its
answer by that handle with `settle`, which is told the answer or that it is
pending still. A plain `call` does not wait to settle: a pending answer to
it is refused, by name (`PENDED_TO_A_CALL`), so a caller never mistakes a
handle for an answer.

A call whose outcome its caller does not know, because its connection
ended or its deadline passed, can be asked about with `probe`, carrying the
call's argument: the callee says whether it happened, and with what
answer; that it resumed and answered; that it did not happen; that asking
it again is harmless; or that it cannot say. The answer is the runtime
contract's `Probed`, said in Datums.

A call in flight can be asked to stop with `withdraw`, naming its id; the
withdraw has no answer of its own, and the call's answer says how far it
got. A callee that leaves nothing pending refuses a settle by name
(`NOTHING_PENDING`), probes `Unknowable`, and ignores a withdraw. Settle,
probe and withdraw are held to the session's shape agreement as calls are.

## Calls that outlive their connection

A connection can end with calls in flight, and whether each ran is then
unknown. A `Redialing` caller dials its callee again when the connection
it holds has ended, and opens a new session, agreeing again. A call in
flight across the end is asked again on the new session only if asking
it twice is harmless: a `read_only` call, or an `idempotent_write` one,
asked once more under its own id, so the callee can tell it is the same
call, and within what is left of its deadline. Any other call is answered
unknown and never sent again. A call answered unknown because its
deadline passed is not asked again either: its connection still stands,
and the callee may still be running it.

What the callee writes waits for the writer, so a reply is never dropped
because the writer is full; a subscription's wakes coalesce to its latest
and never fill it. A reply too large to frame is answered by a refusal
that says so (`REPLY_PAST_CAP`), and a call too large to frame is refused
before it is sent (`CALL_PAST_CAP`), rather than by ending the connection with
no answer.

<a name="chunk-redialing"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-session/src/lib.rs) · `#redialing`</sub>

```rust {#redialing}
/// How a caller reaches its callee again: a new connection each time.
pub trait Dial: Send + Sync + 'static {
    type Stream: AsyncRead + AsyncWrite + Send + 'static;
    fn dial(&self) -> impl Future<Output = std::io::Result<Self::Stream>> + Send;
}

/// Why a call whose connection could not be opened was not sent.
pub const UNREACHABLE: &str = "the callee could not be reached";

/// A caller that dials its callee again when its connection ends, asking
/// a call in flight across the end again only when asking twice is
/// harmless.
pub struct Redialing<D: Dial> {
    dial: D,
    policy: SessionPolicy,
    shapes: Shapes,
    held: tokio::sync::Mutex<Option<Arc<Session>>>,
}

impl<D: Dial> Redialing<D> {
    /// A caller that reaches its callee through `dial`, opening each
    /// session under `policy` on `shapes`; it dials when first asked.
    pub fn new(dial: D, policy: SessionPolicy, shapes: Shapes) -> Redialing<D> {
        Redialing { dial, policy, shapes, held: tokio::sync::Mutex::new(None) }
    }

    /// The session it holds, or a new one when it holds none or the one
    /// it holds has ended.
    async fn session(&self, call: &str) -> Result<Arc<Session>, CallFault> {
        let mut held = self.held.lock().await;
        if let Some(session) = held.as_ref().filter(|session| !session.ended()) {
            return Ok(Arc::clone(session));
        }
        let unreachable = |why: String| CallFault::Refused { call: call.to_string(), why: format!("{UNREACHABLE}: {why}") };
        let stream = self.dial.dial().await.map_err(|error| unreachable(error.to_string()))?;
        let (session, _) = Session::open(stream, self.policy, &self.shapes).await.map_err(|fault| unreachable(fault.to_string()))?;
        let session = Arc::new(session);
        *held = Some(Arc::clone(&session));
        Ok(session)
    }

    /// Make the call `ask`, asking it again once on a new connection if
    /// its connection ends while it is in flight and asking twice is
    /// harmless.
    pub async fn call(&self, ask: Ask) -> Result<Datum, CallFault> {
        let started = std::time::Instant::now();
        let session = self.session(&ask.call).await?;
        let answered = session.call(ask.clone()).await;
        let again = matches!(ask.class, EffectCeiling::ReadOnly | EffectCeiling::IdempotentWrite);
        match answered {
            Err(CallFault::Unknown { call }) if session.ended() && again => {
                let left = match ask.deadline {
                    None => None,
                    Some(deadline) => match deadline.checked_sub(started.elapsed()) {
                        Some(left) if !left.is_zero() => Some(left),
                        _ => return Err(CallFault::Unknown { call }),
                    },
                };
                let Ok(session) = self.session(&call).await else { return Err(CallFault::Unknown { call }) };
                tracing::info!(call = %call, operation = %ask.operation, "a call in flight when its connection ended, asked again");
                session.call(Ask { deadline: left, ..ask }).await
            }
            answered => answered,
        }
    }
}
```

## Who asks

Who asks is the connection's to say, not the frame's: on a dialed socket
it is the peer's credentials, and on a connection a supervisor conveyed,
the conveyance (`x0k:architecture/operation-surface` §2,
`x0k:architecture/service-authorization` §2). A forwarder is the one
caller that speaks for others: x0kd forwarding a face's call to the host
that runs the cell, or a host calling x0kd for the cog a call is for. Its
frames name the asker in `on_behalf_of`, and the callee hears it only on
a connection whose endpoint marked it a forwarder's (`SessionPolicy`'s
`forwarded`). A call naming an asker anywhere else is refused by name
(`NOT_A_FORWARDER`) before the callee hears it, so a caller cannot name
its own asker. The trace context travels as the caller gave it.

The endpoint that accepted a connection also names the process at its
other end (`Peer`, from the platform's peer credentials) and hands it to
`serve`, and every call and subscription on the connection is heard with
it. Like `forwarded`, it is the connection's, never the frame's. A callee
that serves callers it does not otherwise know, such as a host's dialable
endpoint, keys what such a caller proposes by the peer's uid. Which
operations that caller may reach is the shapes its listener serves:
agreement refuses the rest.

## What the tests hold

Each claim above has its test, over a socket pair in one process. The
callee for calls sleeps for the number of milliseconds its argument
names and replies with its argument, counting the calls it hears; one
variant holds every call until it is let go. The callee for
subscriptions watches a counter its test moves.

<a name="chunk-tests"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-session/src/lib.rs) · `#tests`</sub>

```rust {#tests}
/// A callee that sleeps for the milliseconds its argument names, then
/// replies with its argument, counting the calls it hears and recording
/// whom each asked for and its trace; with a gate, each call waits for the
/// gate before it answers.
struct Sleeper {
    heard: AtomicUsize,
    gate: Option<tokio::sync::Semaphore>,
    asked_for: Mutex<Vec<(Option<String>, Option<String>)>>,
    peers: Mutex<Vec<Option<Peer>>>,
}

impl Sleeper {
    fn new(gate: Option<tokio::sync::Semaphore>) -> Sleeper {
        Sleeper { heard: AtomicUsize::new(0), gate, asked_for: Mutex::new(Vec::new()), peers: Mutex::new(Vec::new()) }
    }
}

impl Callee for Sleeper {
    async fn call(&self, heard: Heard) -> Answer {
        self.heard.fetch_add(1, Ordering::SeqCst);
        self.asked_for.lock().unwrap().push((heard.on_behalf_of.clone(), heard.trace.clone()));
        self.peers.lock().unwrap().push(heard.peer);
        let argument = heard.argument;
        if let Some(gate) = &self.gate {
            let _ = gate.acquire().await;
        }
        if let Datum::Integer(ms) = &argument {
            tokio::time::sleep(Duration::from_millis(ms.to_u64().unwrap_or(0))).await;
        }
        Answer::Reply(argument)
    }
}

/// `waited`, or a failure naming `what` when it takes longer than any of
/// these calls should.
async fn within<T>(what: &str, waited: impl Future<Output = T>) -> T {
    tokio::time::timeout(Duration::from_secs(5), waited).await.unwrap_or_else(|_| panic!("{what} did not finish within 5 s"))
}

fn ms(ms: u64) -> Datum {
    Datum::Integer(Integer::from(ms))
}

/// Pins a shape to its canonical CBOR, spelled in hex: a fingerprint
/// for the tests, which need one that is stable and readable, not small.
struct Spelled;

impl Pinner for Spelled {
    fn pin(&self, value: &Datum) -> Result<String, Unpinnable> {
        Ok(value.to_cbor().iter().map(|byte| format!("{byte:02x}")).collect())
    }
}

/// Shapes declaring `operations`, each operation's argument and answer.
fn shapes_of(operations: Vec<(&str, Option<Datum>, Option<Datum>)>) -> Shapes {
    let declared = operations.into_iter()
        .map(|(operation, arg, answer)| (operation.to_string(), DeclaredShapes { arg, answer, derived_answer: None }))
        .collect();
    Shapes::new(declared, Arc::new(Spelled)).unwrap()
}

/// The shapes the plain tests call and serve: their operations, holding
/// nothing to their values.
fn plain() -> Shapes {
    shapes_of(vec![("test.sleep", None, None), ("test.hold", None, None), ("test.watch", None, None)])
}

/// A session to `callee` served under `policy` on the other end of a
/// socket pair, both sides declaring `plain` shapes.
async fn served<C: Callee>(callee: Arc<C>, policy: SessionPolicy) -> Session {
    let (near, far) = tokio::net::UnixStream::pair().unwrap();
    tokio::spawn(serve(far, callee, policy, Arc::new(plain()), None));
    Session::open(near, policy, &plain()).await.unwrap().0
}

/// A session to `callee` serving `serves`, opened by a caller declaring
/// `calls`: the session and what it agreed.
async fn agreeing(callee: Arc<Sleeper>, calls: Shapes, serves: Shapes) -> (Session, Agreement) {
    let (near, far) = tokio::net::UnixStream::pair().unwrap();
    tokio::spawn(serve(far, callee, SessionPolicy::DEFAULT, Arc::new(serves), None));
    within("the opening", Session::open(near, SessionPolicy::DEFAULT, &calls)).await.unwrap()
}

#[tokio::test]
async fn many_calls_in_flight_are_answered_as_they_finish_under_their_own_ids() {
    let session = served(Arc::new(Sleeper::new(None)), SessionPolicy::DEFAULT).await;
    let started = Instant::now();
    let timed = |call: &'static str, argument: u64| {
        let session = &session;
        async move {
            let reply = session.call(Ask::new(call, "test.sleep", EffectCeiling::ReadOnly, ms(argument))).await;
            (reply, started.elapsed())
        }
    };
    let ((slow, slow_at), (fast, fast_at), (middle, _)) =
        within("three calls at once", async { tokio::join!(timed("slow", 300), timed("fast", 10), timed("middle", 100)) }).await;
    assert_eq!((slow, fast, middle), (Ok(ms(300)), Ok(ms(10)), Ok(ms(100))), "each call got its own reply");
    assert!(fast_at < slow_at, "the fast call was answered before the slow one ({fast_at:?} against {slow_at:?})");
    assert!(slow_at < Duration::from_millis(400), "the calls ran together, not one after another ({slow_at:?})");
}

#[tokio::test]
async fn a_call_past_its_deadline_is_answered_unknown_under_its_id_and_the_session_goes_on() {
    let session = served(Arc::new(Sleeper::new(None)), SessionPolicy::DEFAULT).await;
    let started = Instant::now();
    let late = session.call(Ask::new("late", "test.sleep", EffectCeiling::IdempotentWrite, ms(300)).within(Duration::from_millis(30))).await;
    assert_eq!(late, Err(CallFault::Unknown { call: "late".to_string() }));
    assert!(started.elapsed() < Duration::from_millis(200), "it was told at its deadline, not at the reply");
    tokio::time::sleep(Duration::from_millis(350)).await;
    let next = session.call(Ask::new("next", "test.sleep", EffectCeiling::ReadOnly, ms(1)).within(Duration::from_secs(5))).await;
    assert_eq!(next, Ok(ms(1)), "the late reply was passed over and the session goes on");
}

#[tokio::test]
async fn a_call_past_the_in_flight_bound_is_refused_by_name_and_its_callee_never_hears_it() {
    let callee = Arc::new(Sleeper::new(Some(tokio::sync::Semaphore::new(0))));
    let policy = SessionPolicy { in_flight: 2, ..SessionPolicy::DEFAULT };
    let session = Arc::new(served(Arc::clone(&callee), policy).await);
    let held: Vec<_> = ["one", "two"]
        .into_iter()
        .map(|call| {
            let session = Arc::clone(&session);
            tokio::spawn(async move { session.call(Ask::new(call, "test.hold", EffectCeiling::NonIdempotent, ms(0))).await })
        })
        .collect();
    within("the callee hearing two calls", async {
        while callee.heard.load(Ordering::SeqCst) < 2 {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await;
    let third = within("the call past the bound", session.call(Ask::new("three", "test.hold", EffectCeiling::NonIdempotent, ms(0)))).await;
    assert_eq!(third, Err(CallFault::Refused { call: "three".to_string(), why: PAST_IN_FLIGHT.to_string() }));
    assert_eq!(callee.heard.load(Ordering::SeqCst), 2, "the refused call never reached the callee");
    callee.gate.as_ref().unwrap().add_permits(2);
    for call in held {
        assert_eq!(call.await.unwrap(), Ok(ms(0)), "the calls within the bound were answered");
    }
}

#[tokio::test]
async fn a_call_waiting_when_its_connection_ends_is_answered_unknown() {
    let (near, far) = tokio::net::UnixStream::pair().unwrap();
    let ending = tokio::spawn(async move {
        let (reader, writer) = tokio::io::split(far);
        let (frames, queued) = mpsc::channel(8);
        let writing = tokio::spawn(write_frames(writer, queued));
        let mut reader = FrameReader::new(reader, DEFAULT_FRAME_CAP);
        agree_as_callee(&mut reader, &frames, &plain()).await.unwrap();
        let heard = reader.next().await.unwrap().unwrap();
        drop(reader);
        writing.abort();
        heard.call
    });
    let (session, _) = within("the opening", Session::open(near, SessionPolicy::DEFAULT, &plain())).await.unwrap();
    let answer = within("the call on the ended connection", session.call(Ask::new("cut", "test.sleep", EffectCeiling::ReadOnly, ms(0)))).await;
    assert_eq!(ending.await.unwrap(), "cut", "the call was sent");
    assert_eq!(answer, Err(CallFault::Unknown { call: "cut".to_string() }));
}

#[tokio::test]
async fn a_call_made_after_its_connection_ended_fails_closed_at_once() {
    let (near, far) = tokio::net::UnixStream::pair().unwrap();
    let ending = tokio::spawn(async move {
        let (reader, writer) = tokio::io::split(far);
        let (frames, queued) = mpsc::channel(8);
        let _writing = tokio::spawn(write_frames(writer, queued));
        let mut reader = FrameReader::new(reader, DEFAULT_FRAME_CAP);
        agree_as_callee(&mut reader, &frames, &plain()).await.unwrap();
        (reader, frames)
    });
    let (session, _) = within("the opening", Session::open(near, SessionPolicy::DEFAULT, &plain())).await.unwrap();
    let (reader, frames) = ending.await.unwrap();
    drop((reader, frames));
    within("the session seeing its connection end", async {
        while !session.ended() {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await;
    let after = within("a call on the ended connection", session.call(Ask::new("late", "test.sleep", EffectCeiling::ReadOnly, ms(0)))).await;
    assert_eq!(after, Err(CallFault::Closed));
}

#[tokio::test]
async fn an_id_already_in_flight_is_refused_on_the_session_and_nothing_is_sent() {
    let callee = Arc::new(Sleeper::new(Some(tokio::sync::Semaphore::new(0))));
    let session = Arc::new(served(Arc::clone(&callee), SessionPolicy::DEFAULT).await);
    let first = {
        let session = Arc::clone(&session);
        tokio::spawn(async move { session.call(Ask::new("same", "test.hold", EffectCeiling::ReadOnly, ms(0))).await })
    };
    within("the callee hearing the first call", async {
        while callee.heard.load(Ordering::SeqCst) < 1 {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await;
    let again = within("the second call under the id", session.call(Ask::new("same", "test.hold", EffectCeiling::ReadOnly, ms(0)))).await;
    assert_eq!(again, Err(CallFault::InFlight { call: "same".to_string() }));
    callee.gate.as_ref().unwrap().add_permits(1);
    assert_eq!(first.await.unwrap(), Ok(ms(0)));
    assert_eq!(callee.heard.load(Ordering::SeqCst), 1, "the second call under the id was never sent");
}

/// A call naming `asker` with a trace, under the id `call`.
fn asked(call: &str, asker: &str) -> Ask {
    Ask {
        on_behalf_of: Some(asker.to_string()),
        trace: Some("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01".to_string()),
        ..Ask::new(call, "test.sleep", EffectCeiling::ReadOnly, ms(0))
    }
}

#[tokio::test]
async fn a_call_naming_an_asker_off_a_forwarders_connection_is_refused_by_name_and_its_callee_never_hears_it() {
    let callee = Arc::new(Sleeper::new(None));
    let session = served(Arc::clone(&callee), SessionPolicy::DEFAULT).await;
    let refused = within("the call naming an asker", session.call(asked("direct", "did:key:asker"))).await;
    assert_eq!(refused, Err(CallFault::Refused { call: "direct".to_string(), why: NOT_A_FORWARDER.to_string() }));
    assert_eq!(callee.heard.load(Ordering::SeqCst), 0, "the callee never heard it");
    let plain = within("a call naming no asker", session.call(Ask::new("plain", "test.sleep", EffectCeiling::ReadOnly, ms(0)))).await;
    assert_eq!(plain, Ok(ms(0)), "the same connection still takes calls that name no asker");
}

#[tokio::test]
async fn on_a_forwarders_connection_the_callee_hears_the_asker_and_the_trace_as_given() {
    let callee = Arc::new(Sleeper::new(None));
    let forwarder = served(Arc::clone(&callee), SessionPolicy { forwarded: true, ..SessionPolicy::DEFAULT }).await;
    assert_eq!(within("the forwarded call", forwarder.call(asked("forwarded", "did:key:asker"))).await, Ok(ms(0)));
    let heard = callee.asked_for.lock().unwrap().clone();
    assert_eq!(heard, vec![(
        Some("did:key:asker".to_string()),
        Some("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01".to_string()),
    )]);
}

#[tokio::test]
async fn equal_fingerprints_agree_with_no_shape_sent() {
    let (session, agreement) = agreeing(Arc::new(Sleeper::new(None)), plain(), plain()).await;
    assert!(agreement.agrees("test.sleep") && agreement.agrees("test.hold"));
    assert_eq!(agreement.shapes_sent, 0, "equal fingerprints need no shape");
    assert_eq!(within("a call", session.call(Ask::new("c", "test.sleep", EffectCeiling::ReadOnly, ms(1)))).await, Ok(ms(1)));
}

fn named(shape: Datum, optional: bool, name: &str) -> spell::Field {
    spell::Field { name: name.to_string(), shape, optional }
}

#[tokio::test]
async fn a_callee_that_takes_more_agrees_through_the_shape_it_was_sent_and_the_call_runs() {
    let asks = spell::record(vec![named(spell::text(), false, "name")], true);
    let takes = spell::record(vec![named(spell::text(), false, "name"), named(spell::int(), true, "size")], true);
    let (session, agreement) = agreeing(Arc::new(Sleeper::new(None)),
        shapes_of(vec![("test.sleep", Some(asks), None)]), shapes_of(vec![("test.sleep", Some(takes), None)])).await;
    assert!(agreement.agrees("test.sleep"), "{agreement:?}");
    assert_eq!(agreement.shapes_sent, 1, "the caller's argument shape crossed, once");
    let argument = Datum::Map(BTreeMap::from([("name".to_string(), Datum::Text("n".into()))]));
    assert_eq!(within("the call", session.call(Ask::new("c", "test.sleep", EffectCeiling::ReadOnly, argument.clone()))).await, Ok(argument));
}

#[tokio::test]
async fn a_disjoint_operation_is_refused_where_it_is_called_with_both_fingerprints_and_the_rest_of_the_session_runs() {
    let callee = Arc::new(Sleeper::new(None));
    let calls = shapes_of(vec![("test.hold", Some(spell::text()), None), ("test.sleep", None, None)]);
    let serves = shapes_of(vec![("test.hold", Some(spell::int()), None), ("test.sleep", None, None)]);
    let (session, agreement) = agreeing(Arc::clone(&callee), calls, serves).await;
    let disagreement = agreement.disagreement("test.hold").expect("the operation disagreed").clone();
    let refused = within("the disagreed call", session.call(Ask::new("c", "test.hold", EffectCeiling::ReadOnly, Datum::Text("x".into())))).await;
    let Err(CallFault::Disagreed { operation, caller, callee: theirs, why, .. }) = refused else { panic!("{refused:?}") };
    assert_eq!(operation, "test.hold");
    assert!(caller.is_some() && theirs.is_some() && caller != theirs, "both fingerprints are named: {caller:?} {theirs:?}");
    assert_eq!(why, disagreement.why);
    assert!(why.contains("no argument"), "{why}");
    assert_eq!(callee.heard.load(Ordering::SeqCst), 0, "nothing was sent");
    assert_eq!(within("an agreed call", session.call(Ask::new("d", "test.sleep", EffectCeiling::ReadOnly, ms(1)))).await, Ok(ms(1)),
        "the rest of the session stands");
}

#[tokio::test]
async fn an_operation_the_callee_does_not_serve_is_disagreed_by_name() {
    let calls = shapes_of(vec![("test.missing", None, None), ("test.sleep", None, None)]);
    let (session, agreement) = agreeing(Arc::new(Sleeper::new(None)), calls, plain()).await;
    assert!(agreement.agrees("test.sleep"));
    let refused = within("the call", session.call(Ask::new("c", "test.missing", EffectCeiling::ReadOnly, ms(0)))).await;
    assert!(matches!(&refused, Err(CallFault::Disagreed { why, callee: None, .. }) if why.contains("serves no operation test.missing")), "{refused:?}");
    let unnamed = within("an operation the opening never named", session.call(Ask::new("d", "test.other", EffectCeiling::ReadOnly, ms(0)))).await;
    assert!(matches!(&unnamed, Err(CallFault::Disagreed { .. })), "{unnamed:?}");
}

#[tokio::test]
async fn an_operation_whose_field_is_any_agrees_whatever_the_caller_sends_there() {
    let body = spell::record(vec![named(spell::text(), false, "title"), named(spell::int(), true, "rank")], true);
    let forwarded = spell::record(vec![named(spell::text(), false, "cell"), named(body, false, "body")], true);
    let carried = spell::record(vec![named(spell::text(), false, "cell"), named(spell::any(), false, "body")], true);
    let (_, agreement) = agreeing(Arc::new(Sleeper::new(None)),
        shapes_of(vec![("cell.ask", Some(forwarded), Some(spell::any()))]), shapes_of(vec![("cell.ask", Some(carried), Some(spell::any()))])).await;
    assert!(agreement.agrees("cell.ask"), "a body checked elsewhere is not the session's to disagree on: {agreement:?}");
}

#[tokio::test]
async fn a_session_opened_again_agrees_again() {
    let (first, _) = agreeing(Arc::new(Sleeper::new(None)), plain(), plain()).await;
    let changed = shapes_of(vec![("test.sleep", Some(spell::text()), None), ("test.hold", None, None)]);
    let calls = shapes_of(vec![("test.sleep", Some(spell::int()), None), ("test.hold", None, None)]);
    let (_, again) = agreeing(Arc::new(Sleeper::new(None)), calls, changed).await;
    assert!(again.disagreement("test.sleep").is_some(), "the second opening agreed afresh, against the callee it opened to");
    assert_eq!(within("the first session", first.call(Ask::new("c", "test.sleep", EffectCeiling::ReadOnly, ms(0)))).await, Ok(ms(0)));
}

/// The caller's half of a connection to a callee serving `plain` shapes,
/// spoken frame by frame.
async fn raw_to_plain() -> (FrameReader<tokio::io::ReadHalf<tokio::net::UnixStream>>, mpsc::Sender<Vec<u8>>) {
    let (near, far) = tokio::net::UnixStream::pair().unwrap();
    tokio::spawn(serve(far, Arc::new(Sleeper::new(None)), SessionPolicy::DEFAULT, Arc::new(plain()), None));
    let (reader, writer) = tokio::io::split(near);
    let (frames, queued) = mpsc::channel(8);
    tokio::spawn(write_frames(writer, queued));
    (FrameReader::new(reader, DEFAULT_FRAME_CAP), frames)
}

#[tokio::test]
async fn a_shape_that_does_not_pin_to_its_fingerprint_is_refused() {
    let (mut reader, frames) = raw_to_plain().await;
    let asked = datum_map([("test.sleep", datum_map([("argument", datum_text("not-its-pin")), ("answer", datum_text("whatever"))]))]);
    frames.send(opening_frame(Kind::Open, datum_map([("operations", asked)]))).await.unwrap();
    let opened = within("opened", next_frame_of(&mut reader, Kind::Opened)).await.unwrap();
    assert_eq!(text_member(&members_of(&opened, "operations")["test.sleep"], "argument"), Some("needs"));
    frames.send(opening_frame(Kind::Shapes, datum_map([("shapes", datum_map([("not-its-pin", spell::any())]))]))).await.unwrap();
    let agreed = members_of(&within("agreed", next_frame_of(&mut reader, Kind::Agreed)).await.unwrap(), "operations");
    assert_eq!(member(&agreed["test.sleep"], "agreed"), Some(&Datum::Bool(false)));
    assert!(text_member(&agreed["test.sleep"], "why").is_some_and(|why| why.contains("pins to")), "{agreed:?}");
    let anyway = Frame { call: "anyway".to_string(), kind: Kind::Call, operation: "test.sleep".to_string(), class: EffectCeiling::ReadOnly,
        deadline_ms: None, trace: None, on_behalf_of: None, watermark: None, argument: ms(0) };
    frames.send(anyway.encode()).await.unwrap();
    let refused = within("the refusal", reader.next()).await.unwrap().unwrap();
    assert_eq!((refused.kind, why_of(&refused.argument)), (Kind::Refused, NOT_AGREED.to_string()),
        "a caller that calls a disagreed operation anyway is refused by the callee too");
}

#[tokio::test]
async fn a_call_before_the_session_agrees_is_refused_by_name() {
    let (mut reader, frames) = raw_to_plain().await;
    let early = Frame { call: "early".to_string(), kind: Kind::Call, operation: "test.sleep".to_string(), class: EffectCeiling::ReadOnly,
        deadline_ms: None, trace: None, on_behalf_of: None, watermark: None, argument: ms(0) };
    frames.send(early.encode()).await.unwrap();
    let refused = within("the refusal", reader.next()).await.unwrap().unwrap();
    assert_eq!((refused.call.as_str(), refused.kind, why_of(&refused.argument)), ("early", Kind::Refused, BEFORE_AGREEMENT.to_string()));
}

#[test]
fn a_canonical_form_read_back_pins_as_the_shape_it_was_written_from() {
    let shape = spell::record(vec![named(spell::text(), false, "name"), named(spell::list(spell::int()), true, "sizes")], true);
    let compiled = Shaped::read(&shape).unwrap().compile(Use::Argument).unwrap();
    let read_back = Shaped::read(&compiled.canonical()).unwrap().compile(Use::Argument).unwrap();
    assert_eq!(read_back.fingerprint(&Spelled).unwrap(), compiled.fingerprint(&Spelled).unwrap());
}

/// A callee whose store's head is a counter its test moves. A
/// subscription to it is woken with the head whenever the head moves, and
/// at once on opening when the head stands past where its subscriber
/// resumes from; it counts the subscriptions that ended.
struct Watched {
    head: watch::Sender<u64>,
    ended: Arc<AtomicUsize>,
    peers: Mutex<Vec<Option<Peer>>>,
}

impl Watched {
    fn new() -> Arc<Watched> {
        Arc::new(Watched { head: watch::channel(0).0, ended: Arc::new(AtomicUsize::new(0)), peers: Mutex::new(Vec::new()) })
    }
}

impl Callee for Watched {
    async fn call(&self, heard: Heard) -> Answer {
        Answer::Reply(heard.argument)
    }

    async fn subscribe(&self, heard: Heard, from: Option<Datum>) -> Result<Opened, NotOpened> {
        self.peers.lock().unwrap().push(heard.peer);
        let wake = |at: u64| Some(Wake { watermark: ms(at), moved: Datum::Text("head".to_string()) });
        let mut head = self.head.subscribe();
        let at = *head.borrow_and_update();
        let read = from.and_then(|from| match from {
            Datum::Integer(read) => read.to_u64(),
            _ => None,
        });
        let (latest, wakes) = watch::channel(match read {
            Some(read) if at > read => wake(at),
            _ => None,
        });
        let ended = Arc::clone(&self.ended);
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    moved = head.changed() => {
                        if moved.is_err() {
                            break;
                        }
                        let at = *head.borrow_and_update();
                        latest.send_replace(wake(at));
                    }
                    _ = latest.closed() => break,
                }
            }
            ended.fetch_add(1, Ordering::SeqCst);
        });
        Ok(Opened { opening: ms(at), wakes })
    }
}

/// A callee that holds its one subscription until `end` is sent.
struct Ending {
    end: tokio::sync::Mutex<Option<tokio::sync::oneshot::Receiver<()>>>,
}

impl Callee for Ending {
    async fn call(&self, _: Heard) -> Answer {
        Answer::Refused("no calls here".into())
    }

    async fn subscribe(&self, _: Heard, _: Option<Datum>) -> Result<Opened, NotOpened> {
        let end = self.end.lock().await.take().expect("one subscription");
        let (latest, wakes) = watch::channel(None);
        tokio::spawn(async move {
            let _ = end.await;
            drop(latest);
        });
        Ok(Opened { opening: Datum::Null, wakes })
    }
}

#[tokio::test]
async fn a_callee_that_ends_a_subscription_tells_its_subscriber_and_the_session_goes_on() {
    let (end, ended) = tokio::sync::oneshot::channel();
    let session = served(Arc::new(Ending { end: tokio::sync::Mutex::new(Some(ended)) }), SessionPolicy::DEFAULT).await;
    let (_, mut wakes) = within("the subscription", session.subscribe(watching("w-1"), None)).await.unwrap();
    assert!(tokio::time::timeout(Duration::from_millis(100), wakes.next()).await.is_err(), "it stands until its callee ends it");
    end.send(()).unwrap();
    assert!(within("the subscriber hears the end", wakes.next()).await.is_none(), "a subscription its callee ended ends");
    assert!(!session.ended(), "and only the subscription: the connection stands");
}

#[tokio::test]
async fn a_stopped_serve_ends_its_subscriptions_and_closes_its_connection() {
    let callee = Watched::new();
    let (near, far) = tokio::net::UnixStream::pair().unwrap();
    let serving = tokio::spawn(serve(far, Arc::clone(&callee), SessionPolicy::DEFAULT, Arc::new(plain()), None));
    let session = Session::open(near, SessionPolicy::DEFAULT, &plain()).await.unwrap().0;
    let (_, mut wakes) = within("the subscription", session.subscribe(watching("w-1"), None)).await.unwrap();

    serving.abort();
    assert!(within("the subscriber hears the end", wakes.next()).await.is_none(), "a subscription does not outlive its serving");
    assert!(session.ended(), "and the connection closes with it, though what the subscription watches still stands");
    let started = Instant::now();
    while callee.ended.load(Ordering::SeqCst) != 1 {
        assert!(started.elapsed() < Duration::from_secs(5), "the callee is told it ended");
        tokio::task::yield_now().await;
    }
}

fn watching(call: &str) -> Ask {
    Ask::new(call, "test.watch", EffectCeiling::ReadOnly, Datum::Null)
}

#[tokio::test]
async fn a_burst_of_changes_reaches_a_subscriber_that_has_not_read_as_one_wake_for_the_latest() {
    let callee = Watched::new();
    let session = served(Arc::clone(&callee), SessionPolicy::DEFAULT).await;
    let (opening, mut wakes) = within("the subscribe", session.subscribe(watching("plan"), None)).await.unwrap();
    assert_eq!(opening, ms(0));
    for at in 1..=1000 {
        callee.head.send_replace(at);
    }
    tokio::time::sleep(Duration::from_millis(100)).await;
    let wake = within("the wake", wakes.next()).await;
    assert_eq!(wake.map(|wake| wake.watermark), Some(ms(1000)), "the subscriber is woken for the latest change");
    let behind = tokio::time::timeout(Duration::from_millis(100), wakes.next()).await;
    assert!(behind.is_err(), "no older wake waits behind it: {behind:?}");
}

#[tokio::test]
async fn a_subscription_opened_again_on_a_new_connection_resumes_from_the_watermark_its_subscriber_read() {
    let callee = Watched::new();
    let first = served(Arc::clone(&callee), SessionPolicy::DEFAULT).await;
    let (_, mut wakes) = within("the subscribe", first.subscribe(watching("plan"), None)).await.unwrap();
    callee.head.send_replace(3);
    let read = within("the first wake", wakes.next()).await.unwrap().watermark;
    assert_eq!(read, ms(3));
    drop(first);
    assert_eq!(within("the subscription's end", wakes.next()).await, None, "the subscriber is told its connection ended");
    callee.head.send_replace(5);
    let second = served(Arc::clone(&callee), SessionPolicy::DEFAULT).await;
    let (_, mut resumed) = within("the resumed subscribe", second.subscribe(watching("plan"), Some(read))).await.unwrap();
    let wake = within("the resumed wake", resumed.next()).await;
    assert_eq!(wake.map(|wake| wake.watermark), Some(ms(5)), "woken at once for the change made while it was away");
    let third = served(Arc::clone(&callee), SessionPolicy::DEFAULT).await;
    let (_, mut caught_up) = within("a caught-up subscribe", third.subscribe(watching("plan"), Some(ms(5)))).await.unwrap();
    let none = tokio::time::timeout(Duration::from_millis(100), caught_up.next()).await;
    assert!(none.is_err(), "a subscriber that read the latest is not woken again: {none:?}");
}

#[tokio::test]
async fn dropping_a_subscribers_wakes_ends_its_subscription_at_the_callee() {
    let callee = Watched::new();
    let session = served(Arc::clone(&callee), SessionPolicy::DEFAULT).await;
    let (_, wakes) = within("the subscribe", session.subscribe(watching("plan"), None)).await.unwrap();
    drop(wakes);
    within("the callee seeing its subscription end", async {
        while callee.ended.load(Ordering::SeqCst) < 1 {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await;
    let again = within("subscribing again under the id", session.subscribe(watching("plan"), None)).await;
    assert!(again.is_ok(), "the id is free again: {:?}", again.err());
}

#[tokio::test]
async fn a_subscribe_past_the_subscription_bound_is_refused_by_name() {
    let callee = Watched::new();
    let session = served(Arc::clone(&callee), SessionPolicy { subscriptions: 1, ..SessionPolicy::DEFAULT }).await;
    let (_, _held) = within("the first subscribe", session.subscribe(watching("one"), None)).await.unwrap();
    let past = within("the second subscribe", session.subscribe(watching("two"), None)).await;
    assert_eq!(past.err(), Some(CallFault::Refused { call: "two".to_string(), why: PAST_SUBSCRIPTIONS.to_string() }));
}

#[tokio::test]
async fn a_subscription_to_an_operation_the_session_did_not_agree_on_is_refused_where_it_is_asked_and_by_the_callee() {
    let callee = Watched::new();
    let (near, far) = tokio::net::UnixStream::pair().unwrap();
    tokio::spawn(serve(far, Arc::clone(&callee), SessionPolicy::DEFAULT, Arc::new(shapes_of(vec![("test.sleep", None, None)])), None));
    let (session, _) = within("the opening", Session::open(near, SessionPolicy::DEFAULT, &plain())).await.unwrap();
    let refused = within("the subscribe", session.subscribe(watching("plan"), None)).await;
    assert!(matches!(&refused, Err(CallFault::Disagreed { operation, .. }) if operation == "test.watch"), "{:?}", refused.err());
    let (mut reader, frames) = raw_to_plain().await;
    let asked = datum_map([("test.sleep", datum_map([("argument", datum_text("x")), ("answer", datum_text("y"))]))]);
    frames.send(opening_frame(Kind::Open, datum_map([("operations", asked)]))).await.unwrap();
    let _ = within("opened", next_frame_of(&mut reader, Kind::Opened)).await.unwrap();
    frames.send(opening_frame(Kind::Shapes, datum_map([("shapes", datum_map([]))]))).await.unwrap();
    let _ = within("agreed", next_frame_of(&mut reader, Kind::Agreed)).await.unwrap();
    let subscribe = Frame { call: "sub".to_string(), kind: Kind::Subscribe, operation: "test.watch".to_string(), class: EffectCeiling::ReadOnly,
        deadline_ms: None, trace: None, on_behalf_of: None, watermark: None, argument: Datum::Null };
    frames.send(subscribe.encode()).await.unwrap();
    let answer = within("the callee's answer", reader.next()).await.unwrap().unwrap();
    assert_eq!((answer.kind, why_of(&answer.argument)), (Kind::Refused, NOT_AGREED.to_string()), "a subscribe it was not asked to agree on");
}

#[tokio::test]
async fn a_callee_that_serves_no_subscriptions_refuses_a_subscribe_by_name() {
    let session = served(Arc::new(Sleeper::new(None)), SessionPolicy::DEFAULT).await;
    let refused = within("the subscribe", session.subscribe(watching("plan"), None)).await;
    assert_eq!(refused.err(), Some(CallFault::Refused { call: "plan".to_string(), why: NO_SUBSCRIPTIONS.to_string() }));
}

/// Dials `callee` through a relay that records the id of every call it
/// passes and, on its first `cuts` connections, ends both sides just after
/// the callee has heard a call of `cut`.
struct Cutting {
    callee: Arc<Sleeper>,
    cut: &'static str,
    cuts: AtomicUsize,
    passed: Arc<Mutex<Vec<String>>>,
}

impl Cutting {
    fn new(cut: &'static str, cuts: usize) -> Cutting {
        Cutting { callee: Arc::new(Sleeper::new(None)), cut, cuts: AtomicUsize::new(cuts), passed: Arc::new(Mutex::new(Vec::new())) }
    }
}

impl Dial for Cutting {
    type Stream = tokio::net::UnixStream;

    async fn dial(&self) -> std::io::Result<tokio::net::UnixStream> {
        let (near, relayed) = tokio::net::UnixStream::pair()?;
        let (relaying, far) = tokio::net::UnixStream::pair()?;
        tokio::spawn(serve(far, Arc::clone(&self.callee), SessionPolicy::DEFAULT, Arc::new(plain()), None));
        let cutting = self.cuts.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |left| left.checked_sub(1)).is_ok();
        tokio::spawn(relay(relayed, relaying, cutting.then_some(self.cut), Arc::clone(&self.passed)));
        Ok(near)
    }
}

/// Pass frames from `near` to `far` and back, recording each call's id;
/// a call of `cut` is passed on with nothing passed back from then on, and
/// once the callee has heard it both connections end.
async fn relay(near: tokio::net::UnixStream, far: tokio::net::UnixStream, cut: Option<&str>, passed: Arc<Mutex<Vec<String>>>) {
    let (near_read, mut near_write) = tokio::io::split(near);
    let (mut far_read, mut far_write) = tokio::io::split(far);
    let back = tokio::spawn(async move { tokio::io::copy(&mut far_read, &mut near_write).await });
    let mut reader = FrameReader::new(near_read, DEFAULT_FRAME_CAP);
    while let Ok(Some(frame)) = reader.next().await {
        let cutting = frame.kind == Kind::Call && Some(frame.operation.as_str()) == cut;
        if frame.kind == Kind::Call {
            passed.lock().unwrap().push(frame.call.clone());
        }
        if cutting {
            back.abort();
        }
        if far_write.write_all(&frame.encode()).await.is_err() {
            break;
        }
        if cutting {
            tokio::time::sleep(Duration::from_millis(50)).await;
            break;
        }
    }
    back.abort();
}

fn asked_as(class: EffectCeiling) -> Ask {
    Ask::new("q", "test.sleep", class, ms(0)).within(Duration::from_secs(5))
}

#[tokio::test]
async fn a_read_only_or_idempotent_call_cut_off_in_flight_is_asked_again_once_under_its_id() {
    for class in [EffectCeiling::ReadOnly, EffectCeiling::IdempotentWrite] {
        let dial = Cutting::new("test.sleep", 1);
        let passed = Arc::clone(&dial.passed);
        let caller = Redialing::new(dial, SessionPolicy::DEFAULT, plain());
        assert_eq!(within("the call", caller.call(asked_as(class))).await, Ok(ms(0)), "{class:?}");
        assert_eq!(*passed.lock().unwrap(), ["q", "q"], "{class:?}: asked again once, under its own id");
    }
}

#[tokio::test]
async fn any_other_call_cut_off_in_flight_is_answered_unknown_and_never_sent_again() {
    for class in [EffectCeiling::NonIdempotent, EffectCeiling::ExternalEffect, EffectCeiling::LongRunning] {
        let dial = Cutting::new("test.sleep", 1);
        let passed = Arc::clone(&dial.passed);
        let caller = Redialing::new(dial, SessionPolicy::DEFAULT, plain());
        assert_eq!(within("the call", caller.call(asked_as(class))).await, Err(CallFault::Unknown { call: "q".to_string() }), "{class:?}");
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(*passed.lock().unwrap(), ["q"], "{class:?}: sent once and never again");
        assert_eq!(within("a later call", caller.call(Ask::new("r", "test.sleep", class, ms(0)))).await, Ok(ms(0)),
            "{class:?}: the caller dialed again for the next call");
    }
}

#[tokio::test]
async fn a_call_cut_off_again_after_being_asked_again_is_answered_unknown() {
    let dial = Cutting::new("test.sleep", 2);
    let passed = Arc::clone(&dial.passed);
    let caller = Redialing::new(dial, SessionPolicy::DEFAULT, plain());
    assert_eq!(within("the call", caller.call(asked_as(EffectCeiling::ReadOnly))).await, Err(CallFault::Unknown { call: "q".to_string() }));
    assert_eq!(*passed.lock().unwrap(), ["q", "q"], "asked again once, not twice");
}

#[tokio::test]
async fn a_call_past_its_deadline_on_a_standing_connection_is_not_asked_again() {
    let dial = Cutting::new("test.none", 0);
    let passed = Arc::clone(&dial.passed);
    let caller = Redialing::new(dial, SessionPolicy::DEFAULT, plain());
    let late = Ask::new("q", "test.sleep", EffectCeiling::ReadOnly, ms(300)).within(Duration::from_millis(30));
    assert_eq!(within("the late call", caller.call(late)).await, Err(CallFault::Unknown { call: "q".to_string() }));
    assert_eq!(*passed.lock().unwrap(), ["q"], "the callee may still be running it, so it was not asked again");
}

#[tokio::test]
async fn a_reply_waits_for_a_full_writer_and_is_never_dropped_however_many_wakes_stand() {
    let callee = Watched::new();
    let policy = SessionPolicy { write_queue: 1, ..SessionPolicy::DEFAULT };
    let session = Arc::new(served(Arc::clone(&callee), policy).await);
    let mut held = Vec::new();
    for at in 0..16 {
        held.push(within("a subscribe", session.subscribe(watching(&format!("w{at}")), None)).await.unwrap());
    }
    let moving = {
        let callee = Arc::clone(&callee);
        tokio::spawn(async move {
            for at in 1..=5000u64 {
                callee.head.send_replace(at);
                tokio::task::yield_now().await;
            }
        })
    };
    let calls: Vec<_> = (0..64).map(|n| {
        let session = Arc::clone(&session);
        tokio::spawn(async move { session.call(Ask::new(format!("c{n}"), "test.sleep", EffectCeiling::NonIdempotent, ms(n))).await })
    }).collect();
    for (n, call) in calls.into_iter().enumerate() {
        assert_eq!(within("a reply under wakes", call).await.unwrap(), Ok(ms(n as u64)), "the reply to c{n} reached its caller");
    }
    moving.await.unwrap();
    drop(held);
}

/// A callee that replies with as many bytes as its argument names.
struct Sized;

impl Callee for Sized {
    async fn call(&self, heard: Heard) -> Answer {
        let n = match heard.argument {
            Datum::Integer(n) => n.to_u64().unwrap_or(0),
            _ => 0,
        };
        Answer::Reply(Datum::Bytes(vec![0; n as usize]))
    }
}

#[tokio::test]
async fn a_reply_too_large_to_frame_is_refused_by_name_and_the_session_goes_on() {
    let policy = SessionPolicy { frame_cap: 4096, ..SessionPolicy::DEFAULT };
    let session = served(Arc::new(Sized), policy).await;
    let large = within("the large reply", session.call(Ask::new("large", "test.sleep", EffectCeiling::ReadOnly, ms(10_000)))).await;
    assert_eq!(large, Err(CallFault::Refused { call: "large".to_string(), why: REPLY_PAST_CAP.to_string() }));
    let small = within("a small reply", session.call(Ask::new("small", "test.sleep", EffectCeiling::ReadOnly, ms(10)))).await;
    assert_eq!(small, Ok(Datum::Bytes(vec![0; 10])), "the session went on");
}

#[tokio::test]
async fn a_call_too_large_to_frame_is_refused_by_name_and_the_session_goes_on() {
    let policy = SessionPolicy { frame_cap: 4096, ..SessionPolicy::DEFAULT };
    let session = served(Arc::new(Sized), policy).await;
    let argument = Datum::Bytes(vec![0; 8192]);
    let large = within("the large call", session.call(Ask::new("large", "test.sleep", EffectCeiling::ReadOnly, argument))).await;
    assert_eq!(large, Err(CallFault::Refused { call: "large".to_string(), why: CALL_PAST_CAP.to_string() }));
    let small = within("a small call", session.call(Ask::new("small", "test.sleep", EffectCeiling::ReadOnly, ms(10)))).await;
    assert_eq!(small, Ok(Datum::Bytes(vec![0; 10])), "the session went on");
}

#[tokio::test]
async fn every_call_and_subscription_is_heard_from_the_peer_its_endpoint_named() {
    let callee = Arc::new(Sleeper::new(None));
    let peer = Peer { uid: 1000, pid: Some(4242) };
    let (near, far) = tokio::net::UnixStream::pair().unwrap();
    tokio::spawn(serve(far, Arc::clone(&callee), SessionPolicy::DEFAULT, Arc::new(plain()), Some(peer)));
    let (session, _) = within("the opening", Session::open(near, SessionPolicy::DEFAULT, &plain())).await.unwrap();
    within("a call", session.call(Ask::new("c", "test.sleep", EffectCeiling::ReadOnly, ms(0)))).await.unwrap();
    assert_eq!(callee.peers.lock().unwrap().clone(), vec![Some(peer)], "heard from the peer the endpoint named");
    let unnamed = Arc::new(Sleeper::new(None));
    let session = {
        let (near, far) = tokio::net::UnixStream::pair().unwrap();
        tokio::spawn(serve(far, Arc::clone(&unnamed), SessionPolicy::DEFAULT, Arc::new(plain()), None));
        within("the opening", Session::open(near, SessionPolicy::DEFAULT, &plain())).await.unwrap().0
    };
    within("a call", session.call(Ask::new("c", "test.sleep", EffectCeiling::ReadOnly, ms(0)))).await.unwrap();
    assert_eq!(unnamed.peers.lock().unwrap().clone(), vec![None], "and from no one when the endpoint named no one");
    let watched = Watched::new();
    let (near, far) = tokio::net::UnixStream::pair().unwrap();
    tokio::spawn(serve(far, Arc::clone(&watched), SessionPolicy::DEFAULT, Arc::new(plain()), Some(peer)));
    let (session, _) = within("the opening", Session::open(near, SessionPolicy::DEFAULT, &plain())).await.unwrap();
    let _held = within("a subscribe", session.subscribe(watching("plan"), None)).await.unwrap();
    assert_eq!(watched.peers.lock().unwrap().clone(), vec![Some(peer)], "a subscription is heard from the peer too");
}

/// A callee that leaves a call whose argument is "pend" pending, settles
/// it by its handle, says what became of a call by what its argument names,
/// and records the calls it is asked to withdraw.
struct Ledger {
    pended: Mutex<Vec<String>>,
    withdrawn: Mutex<Vec<String>>,
}

impl Ledger {
    fn new() -> Arc<Ledger> {
        Arc::new(Ledger { pended: Mutex::new(Vec::new()), withdrawn: Mutex::new(Vec::new()) })
    }
}

impl Callee for Ledger {
    async fn call(&self, heard: Heard) -> Answer {
        match &heard.argument {
            Datum::Text(text) if text == "pend" => {
                let handle = format!("h-{}", heard.call);
                self.pended.lock().unwrap().push(handle.clone());
                Answer::Pending(handle)
            }
            Datum::Text(text) if text == "hold" => {
                tokio::time::sleep(Duration::from_millis(100)).await;
                Answer::Reply(Datum::Text(format!("withdrawn: {}", self.withdrawn.lock().unwrap().contains(&heard.call))))
            }
            _ => Answer::Reply(heard.argument),
        }
    }

    async fn settle(&self, _: Heard, handle: String) -> Answer {
        match self.pended.lock().unwrap().contains(&handle) {
            true => Answer::Reply(Datum::Text(format!("settled {handle}"))),
            false => Answer::Refused(format!("no call is pending under {handle}")),
        }
    }

    async fn probe(&self, heard: Heard) -> Found {
        match &heard.argument {
            Datum::Text(text) => match text.as_str() {
                "happened" => Found::Happened(Datum::Text("done".into())),
                "continued" => Found::Continued { result: Datum::Text("done".into()), continuation: Datum::Text("resumed".into()) },
                "not" => Found::NotHappened("it never began".into()),
                "again" => Found::AskAgain("asking twice is harmless".into()),
                _ => Found::Unknowable,
            },
            _ => Found::Unknowable,
        }
    }

    fn withdraw(&self, call: &str, _: &str) {
        self.withdrawn.lock().unwrap().push(call.to_string());
    }
}

fn texted(call: &str, text: &str) -> Ask {
    Ask::new(call, "test.sleep", EffectCeiling::IdempotentWrite, Datum::Text(text.into())).within(Duration::from_secs(5))
}

#[tokio::test]
async fn a_call_begun_pending_is_settled_by_its_handle() {
    let session = served(Ledger::new(), SessionPolicy::DEFAULT).await;
    let begun = within("the start", session.start(texted("p", "pend"))).await;
    assert_eq!(begun, Ok(Begun::Pending { handle: "h-p".to_string() }));
    let settled = within("the settle", session.settle(texted("s", ""), "h-p")).await;
    assert_eq!(settled, Ok(Begun::Ready(Datum::Text("settled h-p".into()))));
    let unknown = within("a settle of no such handle", session.settle(texted("u", ""), "h-none")).await;
    assert_eq!(unknown, Err(CallFault::Refused { call: "u".to_string(), why: "no call is pending under h-none".to_string() }));
    assert_eq!(within("a start that is answered at once", session.start(texted("r", "now"))).await, Ok(Begun::Ready(Datum::Text("now".into()))));
}

#[tokio::test]
async fn a_plain_call_answered_pending_is_refused_by_name() {
    let session = served(Ledger::new(), SessionPolicy::DEFAULT).await;
    let pended = within("the call", session.call(texted("p", "pend"))).await;
    assert_eq!(pended, Err(CallFault::Refused { call: "p".to_string(), why: PENDED_TO_A_CALL.to_string() }));
}

#[tokio::test]
async fn a_probe_answers_what_its_callee_found_of_the_call() {
    let session = served(Ledger::new(), SessionPolicy::DEFAULT).await;
    let found = [
        ("happened", Found::Happened(Datum::Text("done".into()))),
        ("continued", Found::Continued { result: Datum::Text("done".into()), continuation: Datum::Text("resumed".into()) }),
        ("not", Found::NotHappened("it never began".into())),
        ("again", Found::AskAgain("asking twice is harmless".into())),
        ("anything else", Found::Unknowable),
    ];
    for (n, (asked, expected)) in found.into_iter().enumerate() {
        assert_eq!(within("the probe", session.probe(texted(&format!("q{n}"), asked))).await, Ok(expected), "{asked}");
    }
}

#[tokio::test]
async fn a_withdraw_reaches_the_callee_for_the_call_in_flight() {
    let callee = Ledger::new();
    let session = Arc::new(served(Arc::clone(&callee), SessionPolicy::DEFAULT).await);
    let held = {
        let session = Arc::clone(&session);
        tokio::spawn(async move { session.call(texted("w", "hold")).await })
    };
    tokio::time::sleep(Duration::from_millis(20)).await;
    within("the withdraw", session.withdraw("w", "test.sleep")).await.unwrap();
    assert_eq!(within("the held call", held).await.unwrap(), Ok(Datum::Text("withdrawn: true".into())), "its answer says it was asked to stop");
    assert_eq!(*callee.withdrawn.lock().unwrap(), ["w"]);
}

#[tokio::test]
async fn a_callee_that_keeps_nothing_pending_refuses_a_settle_and_cannot_say_on_a_probe() {
    let session = served(Arc::new(Sleeper::new(None)), SessionPolicy::DEFAULT).await;
    let settled = within("the settle", session.settle(Ask::new("s", "test.sleep", EffectCeiling::ReadOnly, ms(0)), "h")).await;
    assert_eq!(settled, Err(CallFault::Refused { call: "s".to_string(), why: NOTHING_PENDING.to_string() }));
    let probed = within("the probe", session.probe(Ask::new("q", "test.sleep", EffectCeiling::ReadOnly, ms(0)))).await;
    assert_eq!(probed, Ok(Found::Unknowable));
}

#[test]
fn a_refusal_says_why_on_the_wire() {
    let frame = answer_frame("c".to_string(), "o.p".to_string(), EffectCeiling::ReadOnly, Answer::Refused(PAST_IN_FLIGHT.to_string()));
    assert_eq!(frame.kind, Kind::Refused);
    let mut fields = BTreeMap::new();
    fields.insert("why".to_string(), Datum::Text(PAST_IN_FLIGHT.to_string()));
    assert_eq!(frame.argument, Datum::Map(fields));
    assert_eq!(why_of(&frame.argument), PAST_IN_FLIGHT);
}
```

## Measuring what a call costs

A session's own cost is what it adds to a call beyond the frames: the
writer task and its queue, the reply slots, the callee's task and its
in-flight permit. The harness times one small call there and back over a
socket pair, through a session and a callee that answers at once, against
the floor: the same frames encoded, written, echoed by a task that decodes
and re-encodes each as its reply, read and decoded, by hand on one task.
Both run on one current-thread runtime. Run it with
`cargo bench -p x0k-operation-session --profile dev --bench session_call`.

<a name="chunk-bench"></a><sub>[`benches/session_call.rs`](../../crates/x0k-operation-session/benches/session_call.rs) · `#bench`</sub>

```rust {#bench file="benches/session_call.rs"}
//! What one call costs on a session
//! (`corpora/x0k/implementation/sync/operation-session.md`): a small call
//! there and back over a socket pair, through a session, against the same
//! frames written, echoed and read by hand.

use std::collections::BTreeMap;
use std::hint::black_box;
use std::sync::Arc;

use criterion::{criterion_group, criterion_main, Criterion};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use x0k_datum::shape::{DeclaredShapes, Pinner, Unpinnable};
use x0k_datum::{Datum, Integer};
use x0k_operation_wire::EffectCeiling;
use x0k_operation_session::session::{serve, Answer, Ask, Callee, Heard, Session, SessionPolicy, Shapes};
use x0k_operation_session::wire::{Frame, Kind, DEFAULT_FRAME_CAP};

/// A callee that answers each call with its argument, at once.
struct Echo;

impl Callee for Echo {
    async fn call(&self, heard: Heard) -> Answer {
        Answer::Reply(heard.argument)
    }
}

/// The small argument the frame's harness measures: an intent and an instant.
fn small() -> Datum {
    let mut argument = BTreeMap::new();
    argument.insert("intent".to_string(), Datum::Text("x0k:intent/6c43d955-60ef-33cb-b212-ae62b04b5704".to_string()));
    argument.insert("now".to_string(), Datum::Integer(Integer::from(1_792_870_000_000_000u64)));
    Datum::Map(argument)
}

/// The frame at the front of `stream`, read whole.
async fn read_frame(stream: &mut tokio::net::UnixStream) -> Option<Frame> {
    let mut length = [0u8; 4];
    stream.read_exact(&mut length).await.ok()?;
    let mut whole = vec![0u8; 4 + u32::from_be_bytes(length) as usize];
    whole[..4].copy_from_slice(&length);
    stream.read_exact(&mut whole[4..]).await.ok()?;
    Frame::decode(&whole, DEFAULT_FRAME_CAP).ok().map(|(frame, _)| frame)
}

/// Answer each frame read off `stream` with itself, as a reply.
async fn echo(mut stream: tokio::net::UnixStream) {
    while let Some(mut frame) = read_frame(&mut stream).await {
        frame.kind = Kind::Reply;
        if stream.write_all(&frame.encode()).await.is_err() {
            return;
        }
    }
}

/// Pins a shape to its canonical CBOR in hex.
struct Spelled;

impl Pinner for Spelled {
    fn pin(&self, value: &Datum) -> Result<String, Unpinnable> {
        Ok(value.to_cbor().iter().map(|byte| format!("{byte:02x}")).collect())
    }
}

/// The bench's operation, holding nothing to its values.
fn ready_shapes() -> Shapes {
    Shapes::new(BTreeMap::from([("intent.ready".to_string(), DeclaredShapes::default())]), Arc::new(Spelled)).unwrap()
}

fn session_call(c: &mut Criterion) {
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
    let (session, mut near) = runtime.block_on(async {
        let (calling, serving) = tokio::net::UnixStream::pair().unwrap();
        tokio::spawn(serve(serving, Arc::new(Echo), SessionPolicy::DEFAULT, Arc::new(ready_shapes()), None));
        let (near, far) = tokio::net::UnixStream::pair().unwrap();
        tokio::spawn(echo(far));
        (Session::open(calling, SessionPolicy::DEFAULT, &ready_shapes()).await.unwrap().0, near)
    });
    let mut group = c.benchmark_group("one small call, there and back");
    let mut id = 0u64;
    group.bench_function("session", |b| {
        b.iter(|| {
            id += 1;
            let ask = Ask::new(id.to_string(), "intent.ready", EffectCeiling::ReadOnly, black_box(small()));
            runtime.block_on(session.call(ask)).unwrap()
        })
    });
    group.bench_function("hand-written frames", |b| {
        b.iter(|| {
            id += 1;
            runtime.block_on(async {
                let frame = Frame {
                    call: id.to_string(),
                    kind: Kind::Call,
                    operation: "intent.ready".to_string(),
                    class: EffectCeiling::ReadOnly,
                    deadline_ms: None,
                    trace: None,
                    on_behalf_of: None,
                    watermark: None,
                    argument: black_box(small()),
                };
                near.write_all(&frame.encode()).await.unwrap();
                read_frame(&mut near).await.unwrap().argument
            })
        })
    });
    group.finish();
}

criterion_group!(benches, session_call);
criterion_main!(benches);
```

