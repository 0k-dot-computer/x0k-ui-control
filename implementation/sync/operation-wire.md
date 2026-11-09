# The operation wire: its frame

```turtle folio:document
implementation:sync\/operation-wire a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "The operation wire's frame: one canonical CBOR map that names its call, kind and operation and carries the side-effect class, the deadline, the trace context and the argument. A frame decodes to exactly the frame that was encoded. On a socket it is a four-byte big-endian length and then its body; a reader refuses a frame over its endpoint's cap before it reads the body, and refuses malformed or unknown content by naming the byte or the field. One listener tells this wire from the older local protocol on the same socket by its first five bytes." ;
    x0k:concerns "transport", "ipc", "wire", "cbor", "frames" ;
    x0k:cites implementation:sync\/transport-session,
        implementation:platform\/datum-cbor ;
    x0k:motivatedBy intent:6c43d955-60ef-33cb-b212-ae62b04b5704 ;
    x0k:realizes architecture:operation-surface ;
    folio:tangleCrate "crates/x0k-operation-session" ;
    folio:tangleRoot "src/wire.rs" .
```

Between x0k's own processes the canonical protocol is the operation set
itself, each call and each answer one canonical CBOR frame
(`x0k:architecture/operation-surface` §1). This chapter is that frame:
what one holds, how it is spelled on a socket, and how a reader refuses
one it cannot take. The session that carries frames, opens with shape
agreement and holds many calls at once is built on it in later slices;
protocol A, the wire it replaces, is
`x0k:implementation/sync/transport-session`.

What holds:

1. **A frame is one Datum, spelled once.** Its body is the canonical CBOR
   of a map (`x0k:implementation/platform/datum-cbor`), so the bytes on
   the socket are the bytes a journal records and an identity hashes.
2. **A frame names its call, its kind and its operation**, carries the
   operation's declared side-effect class, the caller's deadline and its
   trace context, names whom a forwarder asks for when it is one, and
   holds the operation's argument as a Datum. The call id is the
   caller's, so it means the same call on any connection.
3. **On a socket, a frame is a four-byte big-endian length and then its
   body.** A reader takes no frame larger than its endpoint's cap, and
   says so with the size, before it reads the body.
4. **A reader refuses a frame it cannot take, saying where.** Malformed
   CBOR names its byte; a missing, mistyped or unknown field names the
   field. The frame is closed: a field it does not name is refused, since
   what a frame may hold changes only with the session's version.
5. **A frame decodes to exactly the frame that was encoded.**
6. **The frame needs no socket.** It is built in `x0k-operation-wire`,
   which holds no socket, clock or runtime, so a browser compiles the same
   frame a native session writes
   (`x0k:implementation/sync/operation-wire-anywhere`). Only telling a
   connection's protocol, below, reads a socket, and it stays here.

<a name="chunk-frame-module"></a><sub>[`../x0k-operation-wire/src/frame.rs`](../../crates/x0k-operation-wire/src/frame.rs) · `#frame-module` · assembles [frame](#chunk-frame) · [fault](#chunk-fault) · [datum](#chunk-datum) · [socket](#chunk-socket) · [tests](#chunk-tests)</sub>

```rust {#frame-module file="../x0k-operation-wire/src/frame.rs"}
//! The operation wire's frame
//! (`corpora/x0k/implementation/sync/operation-wire.md`): one call or
//! answer as one canonical CBOR Datum, length-prefixed on a socket.
use std::collections::BTreeMap;

use x0k_datum::{cbor, Datum, Integer};

use crate::class::EffectCeiling;

<<frame>>

<<fault>>

<<datum>>

<<socket>>

#[cfg(test)]
mod tests {
    use super::*;

    <<tests>>
}
```

The operation session's `wire` module is that frame, carried from there,
and the listener's test of which protocol a connection speaks.

<a name="chunk-module"></a><sub>[`src/wire.rs`](../../crates/x0k-operation-session/src/wire.rs) · `#module` · assembles [protocols](#chunk-protocols) · [told-tests](#chunk-told-tests)</sub>

```rust {#module file="src/wire.rs"}
//! The operation wire's frame
//! (`corpora/x0k/implementation/sync/operation-wire.md`), from
//! `x0k-operation-wire`, and how a listener tells it from protocol A.
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, ReadBuf};

pub use x0k_operation_wire::frame::{Frame, FrameFault, Kind, DEFAULT_FRAME_CAP};

<<protocols>>

#[cfg(test)]
mod tests {
    use super::*;
    use x0k_datum::Datum;
    use x0k_operation_wire::EffectCeiling;

    <<told-tests>>
}
```

## The frame

A frame's kind says what it is on its call. A plain call needs three: the
call, its reply, and a refusal that says the call was not heard. A session
opens with four more, the shape agreement that comes before any call
(`x0k:implementation/sync/operation-session`, "Agreeing on shapes"):
`open`, `opened`, `shapes` and `agreed`. A subscription needs three: the
subscribe that opens it (answered by a reply or a refusal, like a call),
the wakes that say what it watches moved past a watermark, and the
unsubscribe that ends it (`x0k:implementation/sync/operation-session`,
"Subscriptions"). A call that is begun and finished later needs four:
the pending answer that carries its handle, the settle that asks for its
answer by that handle, the probe that asks what became of a call whose
outcome is unknown, and the withdraw that asks a call in flight to stop
(`x0k:implementation/sync/operation-session`, "Calls begun and finished
later"). An unknown outcome is no frame: it is what a caller concludes when
no answer comes. A kind is spelled by its name.

<a name="chunk-frame"></a><sub>[`src/wire.rs`](../../crates/x0k-operation-session/src/wire.rs) · `#frame`</sub>

```rust {#frame}
/// The largest frame an endpoint takes unless it is configured otherwise.
pub const DEFAULT_FRAME_CAP: usize = 10 * 1024 * 1024;

/// What a frame is, on its call.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    /// A call of an operation.
    Call,
    /// The call's answer: the operation's value.
    Reply,
    /// The call was refused before anything ran, and why.
    Refused,
    /// A session's opening: the fingerprints of the shapes its caller will
    /// call each operation with.
    Open,
    /// The callee's answer to an opening, operation by operation.
    Opened,
    /// The shapes an opening's callee asked for, by fingerprint.
    Shapes,
    /// The callee's verdict on each operation whose shapes it was sent.
    Agreed,
    /// A subscription opened, resuming from its watermark when it has one.
    Subscribe,
    /// What a subscription watches moved past its watermark.
    Wake,
    /// A subscription ended by its subscriber.
    Unsubscribe,
    /// A call's answer that it has begun and not finished, under a handle
    /// its callee minted.
    Pending,
    /// A call that answered pending, asked for its answer by its handle.
    Settle,
    /// A call whose outcome its caller does not know, asked what became of it.
    Probe,
    /// A call in flight, asked to stop where it can.
    Withdraw,
}

impl Kind {
    /// The kind's name on the wire.
    pub const fn as_str(self) -> &'static str {
        match self {
            Kind::Call => "call",
            Kind::Reply => "reply",
            Kind::Refused => "refused",
            Kind::Open => "open",
            Kind::Opened => "opened",
            Kind::Shapes => "shapes",
            Kind::Agreed => "agreed",
            Kind::Subscribe => "subscribe",
            Kind::Wake => "wake",
            Kind::Unsubscribe => "unsubscribe",
            Kind::Pending => "pending",
            Kind::Settle => "settle",
            Kind::Probe => "probe",
            Kind::Withdraw => "withdraw",
        }
    }

    /// The kind a name spells, if it is one.
    pub fn from_name(name: &str) -> Option<Kind> {
        match name {
            "call" => Some(Kind::Call),
            "reply" => Some(Kind::Reply),
            "refused" => Some(Kind::Refused),
            "open" => Some(Kind::Open),
            "opened" => Some(Kind::Opened),
            "shapes" => Some(Kind::Shapes),
            "agreed" => Some(Kind::Agreed),
            "subscribe" => Some(Kind::Subscribe),
            "wake" => Some(Kind::Wake),
            "unsubscribe" => Some(Kind::Unsubscribe),
            "pending" => Some(Kind::Pending),
            "settle" => Some(Kind::Settle),
            "probe" => Some(Kind::Probe),
            "withdraw" => Some(Kind::Withdraw),
            _ => None,
        }
    }
}

/// One call or answer of an operation.
#[derive(Clone, Debug)]
pub struct Frame {
    /// The caller's id for the call, the same on every connection.
    pub call: String,
    /// What this frame is, on its call.
    pub kind: Kind,
    /// The operation called.
    pub operation: String,
    /// The operation's declared side-effect class.
    pub class: EffectCeiling,
    /// The caller's deadline, in milliseconds from when it called, if it
    /// gave one.
    pub deadline_ms: Option<u64>,
    /// The call's trace context, a W3C `traceparent`, carried as given.
    pub trace: Option<String>,
    /// Whom a forwarder asks for: the asker it authenticated, honoured only
    /// on a connection conveyed as a forwarder's
    /// (`x0k:implementation/sync/operation-session`, "Who asks").
    pub on_behalf_of: Option<String>,
    /// A subscription's watermark: where a subscribe resumes from, or
    /// where a wake says what it watches now stands. Opaque to the session.
    pub watermark: Option<Datum>,
    /// The operation's argument, or the answer's value.
    pub argument: Datum,
}
```

## Refusing a frame

<a name="chunk-fault"></a><sub>[`src/wire.rs`](../../crates/x0k-operation-session/src/wire.rs) · `#fault`</sub>

```rust {#fault}
/// Why a reader refused a frame, and where.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum FrameFault {
    #[error("the frame is {size} bytes, over this endpoint's cap of {cap}")]
    TooLarge { size: usize, cap: usize },
    #[error("the frame needs {needed} bytes and the stream holds fewer")]
    Short { needed: usize },
    #[error("the frame's CBOR is malformed at byte {at}: {why}")]
    Malformed { at: usize, why: &'static str },
    #[error("the frame's {field} {why}")]
    Field { field: &'static str, why: &'static str },
    #[error("the frame has a field it does not take: {field}")]
    Unknown { field: String },
}
```

## The frame as a Datum

A frame is a map whose keys are its fields' names, and `to_datum` is that
map: the frame's one spelling, the value a journal records. An absent
deadline, trace, asker or watermark is an absent key.

<a name="chunk-datum"></a><sub>[`src/wire.rs`](../../crates/x0k-operation-session/src/wire.rs) · `#datum`</sub>

```rust {#datum}
impl Frame {
    /// The frame as the Datum its body spells.
    pub fn to_datum(&self) -> Datum {
        let mut map = BTreeMap::new();
        map.insert("argument".to_string(), self.argument.clone());
        map.insert("call".to_string(), Datum::Text(self.call.clone()));
        map.insert("class".to_string(), Datum::Text(self.class.as_class_str().to_string()));
        if let Some(deadline) = self.deadline_ms {
            map.insert("deadline_ms".to_string(), Datum::Integer(Integer::from(deadline)));
        }
        map.insert("kind".to_string(), Datum::Text(self.kind.as_str().to_string()));
        if let Some(asker) = &self.on_behalf_of {
            map.insert("on_behalf_of".to_string(), Datum::Text(asker.clone()));
        }
        map.insert("operation".to_string(), Datum::Text(self.operation.clone()));
        if let Some(watermark) = &self.watermark {
            map.insert("watermark".to_string(), watermark.clone());
        }
        if let Some(trace) = &self.trace {
            map.insert("trace".to_string(), Datum::Text(trace.clone()));
        }
        Datum::Map(map)
    }
}
```

## On a socket

A frame's fields are fixed, so it is written and read a piece at a time
(`x0k:implementation/platform/datum-cbor`, "Piece by piece") rather than
built as a map first: only its argument is a whole Datum. Canonical CBOR
orders a map's keys by their encoded bytes, shorter keys first, so the
frame's keys always come as `KEYS` lists them, and a reader that takes
them in that order refuses a key out of order or repeated, and refuses one
it does not know by name. What `encode` writes is exactly
`encode_canonical(frame.to_datum())`, which a test holds for every kind of
frame and argument.

<a name="chunk-socket"></a><sub>[`src/wire.rs`](../../crates/x0k-operation-session/src/wire.rs) · `#socket`</sub>

```rust {#socket}
/// The frame's keys in canonical order: by length, then by their bytes.
const KEYS: [&str; 9] = ["call", "kind", "class", "trace", "argument", "operation", "watermark", "deadline_ms", "on_behalf_of"];

impl Frame {
    /// The frame as it goes on a socket: its body's length, four bytes
    /// big-endian, then the body.
    pub fn encode(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(64);
        out.extend([0u8; 4]);
        let optional = [self.trace.is_some(), self.watermark.is_some(), self.deadline_ms.is_some(), self.on_behalf_of.is_some()];
        cbor::put_map_head(&mut out, 5 + optional.iter().filter(|present| **present).count() as u64);
        cbor::put_text(&mut out, KEYS[0]);
        cbor::put_text(&mut out, &self.call);
        cbor::put_text(&mut out, KEYS[1]);
        cbor::put_text(&mut out, self.kind.as_str());
        cbor::put_text(&mut out, KEYS[2]);
        cbor::put_text(&mut out, self.class.as_class_str());
        if let Some(trace) = &self.trace {
            cbor::put_text(&mut out, KEYS[3]);
            cbor::put_text(&mut out, trace);
        }
        cbor::put_text(&mut out, KEYS[4]);
        cbor::put_canonical(&mut out, &self.argument);
        cbor::put_text(&mut out, KEYS[5]);
        cbor::put_text(&mut out, &self.operation);
        if let Some(watermark) = &self.watermark {
            cbor::put_text(&mut out, KEYS[6]);
            cbor::put_canonical(&mut out, watermark);
        }
        if let Some(deadline) = self.deadline_ms {
            cbor::put_text(&mut out, KEYS[7]);
            cbor::put_unsigned(&mut out, deadline);
        }
        if let Some(asker) = &self.on_behalf_of {
            cbor::put_text(&mut out, KEYS[8]);
            cbor::put_text(&mut out, asker);
        }
        let body = (out.len() - 4) as u32;
        out[..4].copy_from_slice(&body.to_be_bytes());
        out
    }

    /// The frame at the front of `bytes` and how many bytes it took, refusing
    /// one over `cap` before its body is read.
    pub fn decode(bytes: &[u8], cap: usize) -> Result<(Frame, usize), FrameFault> {
        let length = bytes.get(..4).ok_or(FrameFault::Short { needed: 4 })?;
        let size = u32::from_be_bytes([length[0], length[1], length[2], length[3]]) as usize;
        if size > cap {
            return Err(FrameFault::TooLarge { size, cap });
        }
        let body = bytes.get(4..4 + size).ok_or(FrameFault::Short { needed: 4 + size })?;
        Ok((read_body(body)?, 4 + size))
    }
}

fn frame_fault(malformed: cbor::Malformed) -> FrameFault {
    FrameFault::Malformed { at: malformed.at, why: malformed.why }
}

fn read_body(body: &[u8]) -> Result<Frame, FrameFault> {
    let mut pull = cbor::Pull::new(body);
    if pull.major() != Some(5) {
        // Whatever it is, it is refused where it is not canonical first.
        pull.datum().map_err(frame_fault)?;
        return Err(FrameFault::Field { field: "body", why: "is not a map" });
    }
    let entries = pull.map_head().map_err(frame_fault)?;
    let (mut call, mut kind, mut class, mut argument, mut operation) = (None, None, None, None, None);
    let (mut trace, mut watermark, mut deadline_ms, mut on_behalf_of) = (None, None, None, None);
    let mut next = 0;
    for _ in 0..entries {
        let key_at = pull.at();
        let key = pull.text().map_err(frame_fault)?;
        let Some(index) = KEYS[next..].iter().position(|known| *known == key).map(|found| next + found) else {
            return Err(match KEYS.contains(&key) {
                true => FrameFault::Malformed { at: key_at, why: "map keys out of order or repeated" },
                false => FrameFault::Unknown { field: key.to_string() },
            });
        };
        next = index + 1;
        match index {
            0 => call = Some(frame_text(&mut pull, "call")?.to_string()),
            1 => kind = Some(Kind::from_name(frame_text(&mut pull, "kind")?)
                .ok_or(FrameFault::Field { field: "kind", why: "names no kind" })?),
            2 => class = Some(EffectCeiling::from_class_str(frame_text(&mut pull, "class")?)
                .ok_or(FrameFault::Field { field: "class", why: "names no side-effect class" })?),
            3 => trace = Some(frame_text(&mut pull, "trace")?.to_string()),
            4 => argument = Some(pull.datum().map_err(frame_fault)?),
            5 => operation = Some(frame_text(&mut pull, "operation")?.to_string()),
            6 => watermark = Some(pull.datum().map_err(frame_fault)?),
            7 => deadline_ms = Some(deadline(&mut pull)?),
            _ => on_behalf_of = Some(frame_text(&mut pull, "on_behalf_of")?.to_string()),
        }
    }
    pull.finish().map_err(frame_fault)?;
    let missing = |field: &'static str| FrameFault::Field { field, why: "is missing" };
    Ok(Frame {
        call: call.ok_or_else(|| missing("call"))?,
        kind: kind.ok_or_else(|| missing("kind"))?,
        class: class.ok_or_else(|| missing("class"))?,
        argument: argument.ok_or_else(|| missing("argument"))?,
        operation: operation.ok_or_else(|| missing("operation"))?,
        deadline_ms,
        trace,
        on_behalf_of,
        watermark,
    })
}

fn frame_text<'a>(pull: &mut cbor::Pull<'a>, field: &'static str) -> Result<&'a str, FrameFault> {
    match pull.major() {
        Some(3) => pull.text().map_err(frame_fault),
        _ => Err(FrameFault::Field { field, why: "is not text" }),
    }
}

fn deadline(pull: &mut cbor::Pull<'_>) -> Result<u64, FrameFault> {
    match pull.major() {
        Some(0) => pull.unsigned().map_err(frame_fault),
        Some(1) | Some(6) => Err(FrameFault::Field { field: "deadline_ms", why: "is not a whole number of milliseconds" }),
        _ => Err(FrameFault::Field { field: "deadline_ms", why: "is not an integer" }),
    }
}
```

## One listener, two protocols

A listener serves the operation wire and protocol A on one socket, and
tells which a connection speaks by its first frame. In both, the caller
speaks first: a protocol A client's first frame is its request, and x0kd
writes nothing before it. A frame of the operation wire is its body's
length, four bytes, then the body, and the body is a canonical CBOR map,
so its first byte is a map's head (0xA0 to 0xBF). A protocol A frame's
body begins with its magic, `L30` and a version byte, whose first byte,
`L`, is no map's head. So five bytes tell the two apart: one that is a
map's head is the operation wire's. Anything else is left to protocol A,
which reads its own magic and refuses what is not its own. The five bytes
are kept and read again, so whichever protocol takes the connection reads
it from its start. A connection that says too little within the
listener's wait is turned away with `TimedOut`, so a peer that connects
and stays silent holds no task.

<a name="chunk-protocols"></a><sub>[`src/wire.rs`](../../crates/x0k-operation-session/src/wire.rs) · `#protocols`</sub>

```rust {#protocols}
/// How many bytes tell a connection's protocol: a frame's length, and the
/// first byte of its body.
const TELLING: usize = 5;

/// The protocol a connection's first frame is in.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Protocol {
    /// The operation wire: a length, then a canonical CBOR map.
    Operations,
    /// Anything else: protocol A's to read, and to refuse if it is not its own.
    A,
}

/// A connection whose first bytes were read to tell its protocol, read
/// again from its start.
pub struct Told<S> {
    read: Vec<u8>,
    at: usize,
    stream: S,
}

/// Read the first bytes of `stream`, waiting at most `within`, and say
/// which protocol it speaks.
pub async fn told<S: AsyncRead + Unpin>(mut stream: S, within: std::time::Duration) -> std::io::Result<(Protocol, Told<S>)> {
    let mut read = vec![0u8; TELLING];
    tokio::time::timeout(within, stream.read_exact(&mut read)).await.map_err(|_| {
        std::io::Error::new(std::io::ErrorKind::TimedOut, format!("a connection that said too little to tell its protocol within {within:?}"))
    })??;
    let protocol = match read[TELLING - 1] {
        0xA0..=0xBF => Protocol::Operations,
        _ => Protocol::A,
    };
    Ok((protocol, Told { read, at: 0, stream }))
}

impl<S: AsyncRead + Unpin> AsyncRead for Told<S> {
    fn poll_read(mut self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &mut ReadBuf<'_>) -> Poll<std::io::Result<()>> {
        if self.at < self.read.len() {
            let left = &self.read[self.at..];
            let n = left.len().min(buf.remaining());
            buf.put_slice(&left[..n]);
            self.at += n;
            return Poll::Ready(Ok(()));
        }
        Pin::new(&mut self.stream).poll_read(cx, buf)
    }
}

impl<S: AsyncWrite + Unpin> AsyncWrite for Told<S> {
    fn poll_write(mut self: Pin<&mut Self>, cx: &mut Context<'_>, bytes: &[u8]) -> Poll<std::io::Result<usize>> {
        Pin::new(&mut self.stream).poll_write(cx, bytes)
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.stream).poll_flush(cx)
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.stream).poll_shutdown(cx)
    }
}
```

The tests hold it at both ends: a frame of the operation wire, of every
kind and with every count of optional fields, is told as the operation
wire's, and a protocol A frame as protocol A's; whichever, the connection
reads back from its first byte unchanged; and a connection that ends
before it has said enough is an error, not a guess.

<a name="chunk-told-tests"></a><sub>[`src/wire.rs`](../../crates/x0k-operation-session/src/wire.rs) · `#told-tests`</sub>

```rust {#told-tests}

/// What `told` makes of `bytes` sent on a fresh connection, and what the
/// connection then reads back.
async fn told_of(bytes: Vec<u8>) -> (std::io::Result<Protocol>, Vec<u8>) {
    let (mut near, far) = tokio::io::duplex(1 << 16);
    tokio::io::AsyncWriteExt::write_all(&mut near, &bytes).await.unwrap();
    drop(near);
    match told(far, std::time::Duration::from_secs(5)).await {
        Ok((protocol, mut told)) => {
            let mut back = Vec::new();
            told.read_to_end(&mut back).await.unwrap();
            (Ok(protocol), back)
        }
        Err(error) => (Err(error), Vec::new()),
    }
}

#[tokio::test]
async fn a_connection_is_told_by_its_first_frame_and_read_again_from_its_start() {
    for kind in [Kind::Call, Kind::Reply, Kind::Refused] {
        for (trace, deadline_ms) in [(None, None), (Some("00-ab-cd-01".to_string()), Some(7))] {
            let frame = Frame { call: "c".to_string(), kind, operation: "o.p".to_string(), class: EffectCeiling::ReadOnly,
                deadline_ms, trace, on_behalf_of: None, watermark: None, argument: Datum::Text("hi".into()) };
            let bytes = frame.encode();
            assert_eq!(told_of(bytes.clone()).await.0.unwrap(), Protocol::Operations, "{frame:?}");
            assert_eq!(told_of(bytes.clone()).await.1, bytes, "read again from its start");
        }
    }
    let mut a = 12u32.to_le_bytes().to_vec();
    a.extend_from_slice(&[b'L', b'3', b'0', 0x01, 1, 0, 9, 9, 9, 9, 9, 9]);
    assert_eq!(told_of(a.clone()).await.0.unwrap(), Protocol::A, "protocol A's magic is no map's head");
    assert_eq!(told_of(a.clone()).await.1, a, "and protocol A reads it from its start");
}

#[tokio::test]
async fn a_connection_that_says_nothing_is_turned_away_at_the_listeners_wait() {
    let (_near, far) = tokio::io::duplex(64);
    let started = std::time::Instant::now();
    let silent = told(far, std::time::Duration::from_millis(50)).await;
    assert_eq!(silent.err().map(|error| error.kind()), Some(std::io::ErrorKind::TimedOut));
    assert!(started.elapsed() < std::time::Duration::from_secs(2), "turned away at the wait, not later: {:?}", started.elapsed());
}

#[tokio::test]
async fn a_connection_that_ends_before_its_protocol_is_told_is_an_error() {
    let (protocol, _) = told_of(vec![0, 0, 0, 9]).await;
    assert_eq!(protocol.unwrap_err().kind(), std::io::ErrorKind::UnexpectedEof);
}
```

## What the tests hold

Each claim above has its test. A frame survives its own round trip, with
a deadline and without, and what `encode` writes piece by piece is the
canonical encoding of the frame's Datum for every kind, class and
deadline and every kind of argument; a reader refuses a frame over its cap
from the length alone, a truncated one, CBOR that is not canonical, keys
out of order or repeated, a missing or mistyped field, and a field the
frame does not take, each naming where.

<a name="chunk-tests"></a><sub>[`src/wire.rs`](../../crates/x0k-operation-session/src/wire.rs) · `#tests`</sub>

```rust {#tests}
fn call() -> Frame {
    let mut argument = BTreeMap::new();
    argument.insert("intent".to_string(), Datum::Text("x0k:intent/6c43d955".to_string()));
    Frame {
        call: "call-1".to_string(),
        kind: Kind::Call,
        operation: "intent.intents".to_string(),
        class: EffectCeiling::ReadOnly,
        deadline_ms: Some(30_000),
        trace: Some("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01".to_string()),
        on_behalf_of: None,
        watermark: None,
        argument: Datum::Map(argument),
    }
}

fn framed(body: &[u8]) -> Vec<u8> {
    let mut out = (body.len() as u32).to_be_bytes().to_vec();
    out.extend_from_slice(body);
    out
}

#[test]
fn a_frame_decodes_to_the_frame_that_was_encoded() {
    for deadline_ms in [Some(30_000), None] {
        let sent = Frame { deadline_ms, ..call() };
        let bytes = sent.encode();
        let (heard, used) = Frame::decode(&bytes, DEFAULT_FRAME_CAP).unwrap();
        assert_eq!(used, bytes.len());
        assert_eq!(heard.encode(), bytes, "the frame heard spells the frame sent");
        assert_eq!((heard.call, heard.kind, heard.operation, heard.class, heard.deadline_ms),
            (sent.call, sent.kind, sent.operation, sent.class, sent.deadline_ms));
    }
}

/// What `encode` writes piece by piece is exactly the canonical encoding
/// of the frame's Datum, for every kind, class, deadline, trace, asker and watermark, and for
/// arguments of every kind of value, and it reads back to the same frame.
#[test]
fn a_frame_written_piece_by_piece_spells_its_datum() {
    let mut nested = BTreeMap::new();
    nested.insert("a".to_string(), Datum::List(vec![Datum::Null, Datum::Bool(false)]));
    nested.insert("zz".to_string(), Datum::Text("ünïcode".to_string()));
    let arguments = [
        Datum::Null,
        Datum::Bool(true),
        Datum::Integer(Integer::from(u64::MAX)),
        Datum::Integer(Integer::parse("-123456789012345678901234567890").unwrap()),
        Datum::Float(1.5),
        Datum::Text(String::new()),
        Datum::Bytes(vec![0; 300]),
        Datum::List(vec![Datum::Map(nested.clone())]),
        Datum::Map(nested),
    ];
    for kind in [Kind::Call, Kind::Reply, Kind::Refused, Kind::Open, Kind::Opened, Kind::Shapes, Kind::Agreed, Kind::Subscribe, Kind::Wake, Kind::Unsubscribe,
        Kind::Pending, Kind::Settle, Kind::Probe, Kind::Withdraw] {
        for class in [EffectCeiling::ReadOnly, EffectCeiling::IdempotentWrite, EffectCeiling::NonIdempotent] {
            for deadline_ms in [None, Some(0), Some(23), Some(24), Some(u64::MAX)] {
                for (trace, on_behalf_of) in [(None, None), (Some("00-ab-cd-01"), None), (None, Some("did:key:asker")), (Some("t"), Some("a"))] {
                for watermark in [None, Some(Datum::Integer(Integer::from(7u64)))] {
                for argument in arguments.iter().cloned() {
                    let (trace, on_behalf_of) = (trace.map(str::to_string), on_behalf_of.map(str::to_string));
                    let frame = Frame { call: "c".repeat(30), kind, operation: "o.p".to_string(), class, deadline_ms, trace, on_behalf_of, watermark: watermark.clone(), argument };
                    let bytes = frame.encode();
                    assert_eq!(bytes[4..], cbor::encode_canonical(&frame.to_datum())[..], "{frame:?}");
                    let (heard, _) = Frame::decode(&bytes, DEFAULT_FRAME_CAP).unwrap();
                    assert_eq!(cbor::encode_canonical(&heard.to_datum()), cbor::encode_canonical(&frame.to_datum()));
                }
                }
                }
            }
        }
    }
}

#[test]
fn a_key_out_of_order_or_repeated_is_refused_at_its_byte() {
    let mut body = Vec::new();
    cbor::put_map_head(&mut body, 2);
    cbor::put_text(&mut body, "kind");
    cbor::put_text(&mut body, "call");
    let at = body.len();
    cbor::put_text(&mut body, "call");
    cbor::put_text(&mut body, "c");
    assert_eq!(Frame::decode(&framed(&body), DEFAULT_FRAME_CAP).unwrap_err(),
        FrameFault::Malformed { at, why: "map keys out of order or repeated" });
}

#[test]
fn a_frame_over_the_cap_is_refused_from_its_length() {
    let bytes = call().encode();
    let cap = bytes.len() - 5;
    assert_eq!(Frame::decode(&bytes[..4], cap).unwrap_err(), FrameFault::TooLarge { size: bytes.len() - 4, cap });
}

#[test]
fn a_truncated_frame_is_refused_as_short() {
    let bytes = call().encode();
    assert_eq!(Frame::decode(&bytes[..2], DEFAULT_FRAME_CAP).unwrap_err(), FrameFault::Short { needed: 4 });
    assert_eq!(Frame::decode(&bytes[..bytes.len() - 1], DEFAULT_FRAME_CAP).unwrap_err(), FrameFault::Short { needed: bytes.len() });
}

#[test]
fn a_body_that_is_not_canonical_cbor_is_refused_at_its_byte() {
    // An integer spelled in more bytes than it needs is not canonical.
    let body = [0x18, 0x01];
    assert!(matches!(Frame::decode(&framed(&body), DEFAULT_FRAME_CAP), Err(FrameFault::Malformed { at: 0, .. })));
}

#[test]
fn a_missing_or_mistyped_field_is_refused_by_name() {
    let mut datum = call().to_datum();
    let Datum::Map(map) = &mut datum else { unreachable!() };
    map.remove("operation");
    let body = cbor::encode_canonical(&datum);
    assert_eq!(Frame::decode(&framed(&body), DEFAULT_FRAME_CAP).unwrap_err(), FrameFault::Field { field: "operation", why: "is missing" });

    let mut datum = call().to_datum();
    let Datum::Map(map) = &mut datum else { unreachable!() };
    map.insert("class".to_string(), Datum::Text("sometimes".to_string()));
    let body = cbor::encode_canonical(&datum);
    assert_eq!(Frame::decode(&framed(&body), DEFAULT_FRAME_CAP).unwrap_err(),
        FrameFault::Field { field: "class", why: "names no side-effect class" });
}

#[test]
fn a_field_the_frame_does_not_take_is_refused_by_name() {
    let mut datum = call().to_datum();
    let Datum::Map(map) = &mut datum else { unreachable!() };
    map.insert("priority".to_string(), Datum::Bool(true));
    let body = cbor::encode_canonical(&datum);
    assert_eq!(Frame::decode(&framed(&body), DEFAULT_FRAME_CAP).unwrap_err(), FrameFault::Unknown { field: "priority".to_string() });
}
```

## Measuring what a frame costs

The operator's condition on every encoding change is that its cost is
measured and accepted, and every slice of this wire measures itself as it
lands. The harness lives in x0k-transport, the one crate that holds both
protocols. It times a call as a frame here, as protocol A spells it, and
as fields laid out by hand (`x0k:implementation/sync/transport-session`,
"What a frame costs").
