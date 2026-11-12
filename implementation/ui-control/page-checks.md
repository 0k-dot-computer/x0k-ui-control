# The checks for a host in JavaScript

```turtle folio:document
implementation:ui-control\/page-checks a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "x0k-ui-protocol's page module as a WebAssembly module, x0k-ui-protocol-wasm: a page's offer, its state part and the checks, as one JSON request and one JSON answer through three exported functions, for a host in JavaScript of a web page that answers the UI-control protocol. The page itself never loads it." ;
    x0k:concerns "ui-control", "webview", "protocol" ;
    x0k:cites implementation:ui-control\/page-answer,
        implementation:ui-control\/protocol ;
    x0k:implements architecture:ui-control-channel ;
    x0k:motivatedBy intent:30ebc190-f09e-020f-3bc8-7ccc941f5128 ;
    folio:tangleCrate "crates/x0k-ui-protocol-wasm" ;
    folio:tangleRoot "src/lib.rs" .
```

A page hands its host what it declares, raw
(`x0k:implementation/ui-control/page-answer`, "What a page gives its host"),
and the host makes the protocol's values and checks from it with
`x0k-ui-protocol`'s page module (`x0k:implementation/ui-control/protocol`,
"What a web page declares"). A host in Rust calls the module. A host in
JavaScript, such as the library's own test host, loads this crate instead.

Webview §5 decides that the checks are not ported to TypeScript. A host in
JavaScript loads `x0k-ui-protocol`'s page module compiled to
`wasm32-unknown-unknown`, through a crate of its own, `x0k-ui-protocol-wasm`,
beside the library's sources. The page never loads it. It exports
three functions and no imports: `ui_protocol_request(len)` gives a buffer of
that many bytes for the host to write a request into, `ui_protocol_answer()`
answers it and gives the answer's length, and `ui_protocol_answered()` gives
where the answer lies. Each is JSON.
No pointer crosses into Rust as a pointer, so the crate holds no `unsafe`.

The repository builds Rust for a page two ways: `wasm-pack` and wasm-bindgen
for 0k.computer's renderer, and a plain `cargo build --target
wasm32-unknown-unknown` with exported functions for the sync proof
(`x0k-sync-wasm-proof`). A request and an answer that are one JSON text each
need no bindings, so this takes the second, which needs nothing but the dev
shell's toolchain. The module is a build product, never committed: a host
reads the built file.

<a name="chunk-wasm-manifest"></a><sub>[`Cargo.toml`](../../crates/x0k-ui-protocol-wasm/Cargo.toml) · `#wasm-manifest`</sub>

```toml {#wasm-manifest file="Cargo.toml"}
[package]
name = "x0k-ui-protocol-wasm"
version = "0.3.0"
edition = { workspace = true }
license = "MIT"
description = "x0k-ui-protocol's page module as a WebAssembly module: a page's offer, its state part and the checks, for a host in JavaScript of a web page that answers the UI-control protocol."
repository = "https://github.com/0k-dot-computer/x0k-ui-control"
readme = "../../README.md"
keywords = ["ui", "testing", "automation", "agents", "protocol"]

[lib]
# `cdylib` for the module the page loads; `rlib` so the workspace's native
# build checks the same code.
crate-type = ["cdylib", "rlib"]

[dependencies]
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
x0k-ui-protocol = { path = "../x0k-ui-protocol", version = "0.3.0" }
```

A request names its function in `fn`, and each is one of the page module's:

- `offer` takes what the page declared and answers `page_offer`'s `Offer`.
- `state` takes the state as declared and answers `state_part`'s `StatePart`.
- `check` takes an operation, its argument and the page's offer, and answers
  `page_check`'s: `{"run": <action>}` when the action may run, with the action
  as the offer lists it, and `{"answer": <the answer>}` otherwise, the value
  the host gives its caller unchanged.

A request the module cannot read answers `{"fault": <why>}`.

<a name="chunk-wasm-lib"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol-wasm/src/lib.rs) · `#wasm-lib` · assembles [wasm-requests](#chunk-wasm-requests) · [wasm-answers](#chunk-wasm-answers) · [wasm-exports](#chunk-wasm-exports)</sub>

```rust {#wasm-lib file="src/lib.rs"}
//! `x0k-ui-protocol`'s page module for a host in JavaScript: a page's offer,
//! its state part and the checks, as one JSON request and one JSON answer
//! through three exported functions.

use std::cell::RefCell;

use serde::Deserialize;
use serde_json::{json, Value};
use x0k_ui_protocol::offer::Offer;
use x0k_ui_protocol::page::{page_check, page_offer, state_part, Checked, Declared, DeclaredState, PageFault};

<<wasm-requests>>

<<wasm-answers>>

<<wasm-exports>>
```

The requests, as a host writes them:

<a name="chunk-wasm-requests"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol-wasm/src/lib.rs) · `#wasm-requests`</sub>

```rust {#wasm-requests}
/// Why a request has no answer.
#[derive(Debug, thiserror::Error)]
enum Fault {
    #[error("the answer does not encode: {0}")]
    Encode(#[from] serde_json::Error),
    #[error(transparent)]
    Page(#[from] PageFault),
}

/// One request.
#[derive(Deserialize)]
#[serde(tag = "fn", rename_all = "snake_case")]
enum Request {
    Offer(Declared),
    State(DeclaredState),
    Check {
        operation: String,
        #[serde(default)]
        argument: Value,
        offer: Offer,
    },
}
```

The answers:

<a name="chunk-wasm-answers"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol-wasm/src/lib.rs) · `#wasm-answers`</sub>

```rust {#wasm-answers}
/// The answer to one request, as JSON.
fn respond(request: &[u8]) -> Value {
    let request: Request = match serde_json::from_slice(request) {
        Ok(request) => request,
        Err(error) => return json!({ "fault": error.to_string() }),
    };
    let answer = move || -> Result<Value, Fault> {
        Ok(match request {
            Request::Offer(declared) => serde_json::to_value(page_offer(declared))?,
            Request::State(state) => serde_json::to_value(state_part(state))?,
            Request::Check { operation, argument, offer } => match page_check(&operation, argument, &offer)? {
                Checked::Run(action) => json!({ "run": action }),
                Checked::Answer(answer) => json!({ "answer": answer }),
            },
        })
    };
    answer().unwrap_or_else(|fault| json!({ "fault": fault.to_string() }))
}
```

The exports. A request is written into a buffer the module owns, and the
answer is read out of another. The host reads the answer before it writes the
next request.

<a name="chunk-wasm-exports"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-protocol-wasm/src/lib.rs) · `#wasm-exports`</sub>

```rust {#wasm-exports}
thread_local! {
    static REQUEST: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static ANSWER: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

/// Where the page writes a request of `len` bytes.
#[no_mangle]
pub extern "C" fn ui_protocol_request(len: usize) -> *mut u8 {
    REQUEST.with(|buffer| {
        let mut buffer = buffer.borrow_mut();
        buffer.clear();
        buffer.resize(len, 0);
        buffer.as_mut_ptr()
    })
}

/// Answer the request written, and give the answer's length.
#[no_mangle]
pub extern "C" fn ui_protocol_answer() -> usize {
    let given = REQUEST.with(|buffer| respond(&buffer.borrow()));
    ANSWER.with(|buffer| {
        let mut buffer = buffer.borrow_mut();
        *buffer = given.to_string().into_bytes();
        buffer.len()
    })
}

/// Where the answer lies.
#[no_mangle]
pub extern "C" fn ui_protocol_answered() -> *const u8 {
    ANSWER.with(|buffer| buffer.borrow().as_ptr())
}
```
