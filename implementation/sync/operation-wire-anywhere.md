# The operation wire anywhere: frames and openings with no socket

```turtle folio:document
implementation:sync\/operation-wire-anywhere a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "x0k-operation-wire: the part of the operation session that needs no socket, so a page in a browser drives the same wire a native process does. It spells calls and wakes as frames, cuts bytes into the same frames however a carrier splits them, says what an answer tells its caller, and agrees on shapes at an opening. It reads, writes and waits for nothing, depends on the value model alone, and builds for wasm32-unknown-unknown. It is the home of the side-effect class every frame carries." ;
    x0k:concerns "transport", "wire", "session", "browser", "wasm" ;
    x0k:cites implementation:sync\/operation-wire,
        implementation:sync\/operation-session ;
    x0k:motivatedBy intent:6186d10e-e768-36e9-f7be-cb28fd028cb2 ;
    x0k:realizes architecture:operation-surface ;
    folio:tangleCrate "crates/x0k-operation-wire" ;
    folio:tangleRoot "src/lib.rs" .
```

A browser reaches the operation wire over a WebSocket carrying the same
frames (`x0k:architecture/operation-surface` §1). A page has no tokio, no
socket and no peer credentials, so it cannot link the operation session.
What it needs of that session is only what the session decides: how a call
and a wake are spelled as frames, how bytes become frames, what an answer
tells its caller, and how an opening agrees on shapes. `x0k-operation-wire`
is that part, and nothing else: it depends on the value model alone and
builds for `wasm32-unknown-unknown`. The operation session drives it over
a connection, and a page drives it over its WebSocket.

What holds:

1. **One spelling, two drivers.** The frame
   (`x0k:implementation/sync/operation-wire`) and a session's decisions
   (`x0k:implementation/sync/operation-session`) are written once, here,
   and the operation session carries them from here; a page that subscribes sends
   the bytes a native session would.
2. **Nothing here reads, writes or waits.** Each piece takes what was read
   and says what to send; the driver owns the carrier and the clock.
3. **However a carrier cuts the bytes, the same frames come out.** A
   WebSocket message may hold half a frame or several; the frame buffer
   gives the same frames for any cut.
4. **It builds for a browser.** `tools/wasm32-check` holds the crate to
   `wasm32-unknown-unknown`.
5. **The side-effect class lives here.** Every frame carries the class
   its call declares, so the word for how much an operation changes is
   the wire's, and a caller that speaks the wire takes it from here.
6. **A caller that carries its pins links no shape language.** Compiling
   and resolving shapes is the `shapes` feature, on by default; a side
   that holds only pins agrees where they match and refuses by name where
   they do not, and builds without it.

<a name="chunk-manifest"></a><sub>[`Cargo.toml`](../../crates/x0k-operation-wire/Cargo.toml) · `#manifest`</sub>

```toml {#manifest file="Cargo.toml"}
[package]
name = "x0k-operation-wire"
version = "0.1.0"
edition = { workspace = true }
license = "MIT"
description = "The operation wire's frame and what a session decides with no socket, clock or runtime: what a call comes to, how bytes become frames, how an opening agrees on shapes. A native session and a page in a browser drive the same code."
repository = "https://github.com/0k-dot-computer/x0k-ui-control"
readme = "../../README.md"
keywords = ["ui", "testing", "automation", "agents", "protocol"]

[dependencies]
# The side-effect class is serialized where a grant is written.
serde = { version = "1", default-features = false, features = ["derive", "alloc"] }
thiserror = { workspace = true }
# The value model, its canonical CBOR and its shapes.
x0k-datum = { version = "0.1.0" }

[features]
default = ["shapes"]
# Compiling, pinning and resolving declared shapes: what a callee, and a
# caller that declares its shapes, needs. A caller holding only pins
# builds without it.
shapes = []
```

The crate is three modules: the side-effect class, below; the frame, from
the wire's chapter; and the session's half with no socket, from the
session's.

<a name="chunk-lib"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-wire/src/lib.rs) · `#lib` · assembles [tests](#chunk-tests)</sub>

```rust {#lib file="src/lib.rs"}
//! The operation wire with no socket, clock or runtime
//! (`corpora/x0k/implementation/sync/operation-wire-anywhere.md`): the
//! frame, and what a session decides, for a native session and a page in
//! a browser alike.

pub mod class;
pub mod frame;
pub mod session;

pub use class::EffectCeiling;

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::sync::Arc;

    #[cfg(feature = "shapes")]
    use x0k_datum::shape::{spell, DeclaredShapes, Pinner, Unpinnable};
    use x0k_datum::Datum;

    use crate::class::EffectCeiling;
    use crate::frame::{Frame, Kind, DEFAULT_FRAME_CAP};
    use crate::session::*;

    <<tests>>
}
```

## The side-effect class

Every x0k tool declares how much its operation changes
(`#[x0k_meta(side_effect = …)]`), in five words ordered by how hard the
effect is to take back. A frame carries its call's class, a session asks
a call again only when the class says that changes nothing, and a grant
admits a request whose class is at or under the grant's ceiling
(`x0k:implementation/platform/runtime-contract`, which re-exports the
type). The declaration order is the lattice and a wire encoding both: a
surface's grant is written with postcard, which writes a variant's
index, so a new class is appended, never inserted. On the operation wire
the class is its string.

<a name="chunk-class-module"></a><sub>[`src/class.rs`](../../crates/x0k-operation-wire/src/class.rs) · `#class-module`</sub>

```rust {#class-module file="src/class.rs"}
//! The side-effect class an operation declares and a frame carries
//! (`corpora/x0k/implementation/sync/operation-wire-anywhere.md`).

use serde::{Deserialize, Serialize};

/// A side-effect class, ordered as a ceiling lattice: a grant admits a
/// request whose operation's declared class is at or under its ceiling.
/// Rank reads as escalating irreversibility: a read costs nothing, an
/// idempotent write can be replayed, a long-running call spends unbounded
/// time, an external effect leaves the machine, and a non-idempotent action
/// cannot be taken back.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum EffectCeiling {
    ReadOnly,
    IdempotentWrite,
    LongRunning,
    ExternalEffect,
    NonIdempotent,
}

impl EffectCeiling {
    /// The ceiling a grant that declares none receives.
    pub const UNDECLARED: Self = Self::IdempotentWrite;

    /// The canonical `#[x0k_meta(side_effect = …)]` / MCP `_meta.x0k` string.
    #[must_use]
    pub const fn as_class_str(self) -> &'static str {
        match self {
            Self::ReadOnly => "read_only",
            Self::IdempotentWrite => "idempotent_write",
            Self::LongRunning => "long_running",
            Self::ExternalEffect => "external_effect",
            Self::NonIdempotent => "non_idempotent",
        }
    }

    /// Parse a declared class. Unknown strings are `None`: an unreadable
    /// class is not a permissive one.
    #[must_use]
    pub fn from_class_str(value: &str) -> Option<Self> {
        match value {
            "read_only" => Some(Self::ReadOnly),
            "idempotent_write" => Some(Self::IdempotentWrite),
            "long_running" => Some(Self::LongRunning),
            "external_effect" => Some(Self::ExternalEffect),
            "non_idempotent" | "non_idempotent_action" => Some(Self::NonIdempotent),
            _ => None,
        }
    }
}
```

## What the tests hold

The classes are in lattice order, each class's string reads back as that
class, and any other string reads as none. The frame buffer is fed one
frame's bytes a byte at a time, three frames in one push, and a frame
split across two pushes, and gives the same frames each way. An opening
driven by its steps alone, caller against callee with no connection,
agrees where the shapes fit after one shape crosses, and refuses by name
where they do not, as the session's own tests hold over a socket. A
caller holding only pins agrees with a callee that compiled the same
shapes, and refuses by name, sending no shape, an operation whose pins
differ.

<a name="chunk-tests"></a><sub>[`src/lib.rs`](../../crates/x0k-operation-wire/src/lib.rs) · `#tests`</sub>

```rust {#tests}
/// Pins a shape to its canonical CBOR in hex: stable and readable.
#[cfg(feature = "shapes")]
struct Spelled;

#[cfg(feature = "shapes")]
impl Pinner for Spelled {
    fn pin(&self, value: &Datum) -> Result<String, Unpinnable> {
        Ok(value.to_cbor().iter().map(|byte| format!("{byte:02x}")).collect())
    }
}

#[cfg(feature = "shapes")]
fn shapes_of(operations: Vec<(&str, Option<Datum>)>) -> Shapes {
    let declared = operations.into_iter()
        .map(|(operation, arg)| (operation.to_string(), DeclaredShapes { arg, answer: None, derived_answer: None }))
        .collect::<BTreeMap<_, _>>();
    Shapes::new(declared, Arc::new(Spelled)).unwrap()
}

#[cfg(feature = "shapes")]
fn frames_of(bytes: &[u8]) -> Frame {
    Frame::decode(bytes, DEFAULT_FRAME_CAP).unwrap().0
}

#[test]
fn the_class_order_is_the_lattice_and_its_strings_round_trip() {
    let classes = [
        EffectCeiling::ReadOnly,
        EffectCeiling::IdempotentWrite,
        EffectCeiling::LongRunning,
        EffectCeiling::ExternalEffect,
        EffectCeiling::NonIdempotent,
    ];
    assert!(classes.windows(2).all(|pair| pair[0] < pair[1]));
    for class in classes {
        assert_eq!(EffectCeiling::from_class_str(class.as_class_str()), Some(class));
    }
    assert_eq!(EffectCeiling::from_class_str("anything_else"), None);
}

#[test]
fn the_same_frames_come_out_however_the_bytes_are_cut() {
    let sent: Vec<Frame> = (0..3).map(|n| Ask::new(format!("c{n}"), "o.p", EffectCeiling::ReadOnly, Datum::Text("x".repeat(n * 40)))
        .into_frame(Kind::Call, None)).collect();
    let bytes: Vec<u8> = sent.iter().flat_map(Frame::encode).collect();
    type Cut = fn(&[u8]) -> Vec<Vec<u8>>;
    let cuts: [Cut; 3] = [
        |bytes| bytes.iter().map(|byte| vec![*byte]).collect(),
        |bytes| vec![bytes.to_vec()],
        |bytes| { let (a, b) = bytes.split_at(bytes.len() / 2 + 1); vec![a.to_vec(), b.to_vec()] },
    ];
    for cut in cuts {
        let mut buffer = FrameBuffer::new(DEFAULT_FRAME_CAP);
        let mut heard = Vec::new();
        for piece in cut(&bytes) {
            buffer.push(&piece);
            while let Some(frame) = buffer.next_frame().unwrap() {
                heard.push(frame.encode());
            }
        }
        assert_eq!(heard, sent.iter().map(Frame::encode).collect::<Vec<_>>());
        assert!(buffer.is_empty(), "nothing is left over");
    }
}

#[cfg(feature = "shapes")]
#[test]
fn an_opening_driven_by_its_steps_agrees_where_the_shapes_fit() {
    let calls = shapes_of(vec![("a.fits", Some(spell::text())), ("b.unfit", Some(spell::text())), ("c.same", None)]);
    let serves = shapes_of(vec![("a.fits", Some(spell::any())), ("b.unfit", Some(spell::int())), ("c.same", None)]);
    let open = frames_of(&calls.open_frame());
    assert_eq!(open.kind, Kind::Open);
    let callee = serves.open(&open.argument);
    assert!(callee.agreed().is_none(), "the callee needs two argument shapes");
    let opened = frames_of(&callee.opened);
    let CallerOpened::Needs { shapes, pending } = calls.opened(&opened.argument) else { panic!("the caller sends shapes") };
    let (verdicts, served) = callee.shapes(&serves, &frames_of(&shapes).argument);
    let agreement = pending.agreed(&frames_of(&verdicts).argument);
    assert!(agreement.agrees("a.fits") && agreement.agrees("c.same"), "{agreement:?}");
    assert!(!agreement.agrees("b.unfit") && agreement.disagreement("b.unfit").is_some_and(|why| why.why.contains("argument")), "{agreement:?}");
    assert_eq!(served, ["a.fits", "c.same"].into_iter().map(str::to_string).collect());
}

#[cfg(feature = "shapes")]
#[test]
fn a_caller_holding_pins_agrees_where_they_match_and_sends_no_shape() {
    let serves = shapes_of(vec![("a.same", Some(spell::text())), ("b.other", Some(spell::int()))]);
    let pins: Vec<(String, String, String)> = serves.pins().map(|(o, a, r)| (o.to_string(), a.to_string(), r.to_string())).collect();
    let mut pins: Vec<(&str, &str, &str)> = pins.iter().map(|(o, a, r)| (o.as_str(), a.as_str(), r.as_str())).collect();
    pins[1].1 = "a pin of some other shape";
    let calls = Shapes::pinned(pins);
    let callee = serves.open(&frames_of(&calls.open_frame()).argument);
    let CallerOpened::Needs { shapes, pending } = calls.opened(&frames_of(&callee.opened).argument) else { panic!("the callee waits on a shapes frame") };
    let sent = frames_of(&shapes).argument;
    assert_eq!(members_of(&sent, "shapes"), BTreeMap::new(), "a caller holding pins sends no shape");
    let (verdicts, served) = callee.shapes(&serves, &sent);
    let agreement = pending.agreed(&frames_of(&verdicts).argument);
    assert!(agreement.agrees("a.same") && served.contains("a.same"), "{agreement:?}");
    assert!(!served.contains("b.other"));
    assert!(agreement.disagreement("b.other").is_some_and(|why| why.why.contains("checks no shapes")), "{agreement:?}");
    assert_eq!(agreement.shapes_sent, 0);
}
```
