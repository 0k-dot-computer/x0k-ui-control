# The Tauri plugin: a Tauri app's page, held and captured

```turtle folio:document
implementation:ui-control\/tauri-plugin a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "A Tauri 2 plugin that is the host of the webview design for a Tauri app on Linux and macOS: it injects the in-page library's hold before the page's scripts, asks the page over Tauri's IPC with a fresh nonce per request and drops any answer without it, and takes the capture natively while the page is held, with webkit_web_view_get_snapshot on Linux and WKWebView's takeSnapshot on macOS. It puts input into the page through the platform's own input path, as GDK events synthesized for the webview's widget on Linux and as NSEvents handed to the WKWebView on macOS, so the page's hit-testing and focus decide the target and its events are trusted. It serves the page as the app's UI-control endpoint with x0k-ui-endpoint, whose checks run before the page hears a call, on a socket named for the app in its profile's runtime directory by the rule every endpoint binds by, so a scratch app never binds in the live runtime. The library's probe test, an input test and the conformance suite over the endpoint hold it against a minimal Tauri app, under Xvfb on Linux and in a window on the Mac's display." ;
    x0k:concerns "ui-control", "webview", "tauri", "hold", "input", "conformance" ;
    x0k:cites implementation:ui-control\/webview,
        implementation:ui-control\/page-hold,
        implementation:ui-control\/page-walk,
        implementation:ui-control\/protocol,
        implementation:ui-control\/endpoint,
        implementation:ui-control\/page-answer,
        implementation:ui-control\/conformance ;
    x0k:implements architecture:ui-control-channel ;
    x0k:motivatedBy intent:67a00012-0009-6395-2b5e-7b73ef62d5c2 ;
    folio:tangleCrate "crates/x0k-ui-tauri" ;
    folio:tangleRoot "src/lib.rs" .
```

A Tauri app's page cannot read its own pixels, and the app cannot stop the
page while it captures. The webview design
(`x0k:implementation/ui-control/webview`) answers this with the page's
**hold**: the page holds its own frame producers still, its host captures the
still page, and the page checks that nothing moved meanwhile. The in-page
library has the page's half (`x0k:implementation/ui-control/page-hold`). This
chapter is the host's half for a Tauri app: a Tauri 2 plugin.

The central idea is that **the plugin is the only host the page has, and it
speaks to the page only through Tauri's own channels.** It injects the hold
before the page's scripts. It asks the page to hold, and to verify, by
evaluating a script that carries a fresh nonce. The page answers through the
plugin's command with that nonce, and the plugin drops every answer without
it. Between the two, it takes the platform's snapshot natively, so no pixel
crosses the IPC. This chapter builds the Linux host, where the webview is
WebKitGTK and the snapshot is `webkit_web_view_get_snapshot`, its input,
which enters GTK's event path as a person's does, and its endpoint, which any
UI-control driver reaches on a unix socket. It also builds the macOS host, where
the webview is a WKWebView, the snapshot is `takeSnapshot`, and input is
`NSEvent`s handed to the view. The Windows webview is not here yet.

The carried example is the library's **probe page** in a minimal Tauri app. The
page paints a frame counter into a patch of pixels, moves one element by script
and slides another by a CSS animation. A capture of it shows which page state it
holds. The probe test runs the plugin's loop against it, under Xvfb on arca, and
holds the same claims the library's test holds in its own two hosts. The same
test runs on the Mac, in a real window.

## What holds

These are the webview design's §2 and §6, as this plugin keeps them:

- The library's hold is installed in the main frame of every page before the
  page's own scripts run.
- Every request to the page carries a fresh nonce. An answer is taken only when
  its nonce names a request that waits, and it came from the webview the request
  went to. Every other answer is dropped and counted, and the request keeps
  waiting until it is answered or times out as unanswered.
- The capture is the platform's snapshot of the visible region, taken while the
  page is held. Its pixels never cross the IPC.
- The plugin's loop is the library's rule: hold, capture, verify; hold again
  while the epoch moved, up to three times; then refuse the capture as
  `page_unsettled`, naming the epochs seen, and answer the last read.
- Input enters the platform's input path, never as events built by script: a
  click the plugin makes arrives `isTrusted`, at the element the page's own
  hit-testing finds under it, and moves focus as a person's does.
- A position arrives in the named frame's capture pixels and reaches the
  widget divided by that capture's scale, its pixels per widget unit.
- The endpoint is a socket named for the app in its profile's runtime
  directory, by the rule every UI-control endpoint binds by
  (`x0k_ui_endpoint::address`). A scratch process never resolves into the live
  root's runtime, whatever the environment pins.
- The endpoint's checks run before the page hears a call: a call the offer does
  not list never reaches the page.
- The requester of a call is the socket peer's credentials, never the page's
  word.

**Cost bound.** The hold costs at most 100 ms at the 90th percentile on the
probe page, the library's bound.

## Where the plugin lives

The plugin is the crate `x0k-ui-tauri` in `substrate/crates/surfaces`, beside
`x0k-ui-endpoint`, and its probe app is the crate `x0k-ui-tauri-probe` beneath
it. Both are members of the root workspace, resolved in its one `Cargo.lock`.
Tauri brings GTK, WebKitGTK's bindings, tao and wry, a few hundred crates that
nothing else in the root workspace uses, so neither crate is a default member,
and a plain build of the workspace compiles none of them. Both are outside
hakari's traversal (`.config/hakari.toml`), so none of Tauri's features is
unified into the workspace hack and no other crate builds differently for
them. Like every crate outside that traversal, each inherits the root's lint
table. The UI-control publication is crate-granular, so its "Tauri feature" is this crate,
which an app adds when it is a Tauri app.

Tauri's own plugins are named `tauri-plugin-<name>`. This one keeps the
`x0k-` prefix of its siblings. Tauri derives a plugin's name, and so its
command and permission names, from the package name, so the plugin is
`x0k-ui-tauri` to Tauri too.

<a name="chunk-manifest"></a><sub>[`Cargo.toml`](../../crates/x0k-ui-tauri/Cargo.toml) · `#manifest`</sub>

```toml {#manifest file="Cargo.toml"}
[package]
name = "x0k-ui-tauri"
version = "0.1.0"
edition = { workspace = true }
license = "MIT"
description = "A Tauri plugin that holds a Tauri app's page still and captures it natively, for the UI-control endpoint."
# Tauri's plugin build requires `links`, equal to the package name.
links = "x0k-ui-tauri"
repository = "https://github.com/0k-dot-computer/x0k-ui-control"
readme = "../../README.md"
keywords = ["ui", "testing", "automation", "agents", "protocol"]

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2.12", default-features = false, features = ["wry"] }
thiserror = "2"
tokio = { version = "1", features = ["sync", "time"] }
tracing = "0.1"
# The nonce of each request: 122 random bits from the OS.
uuid = { version = "1", features = ["v4"] }

# The endpoint the plugin serves, the checks it makes before the page hears a
# call, and where the endpoint binds.
x0k-ui-endpoint = { path = "../x0k-ui-endpoint", version = "0.1.0" }
# The profile this process runs, which the endpoint's directory is named for.
x0k-runtime-dir = { path = "../x0k-runtime-dir", version = "0.1.0" }
# The protocol's values, which the endpoint and the page both speak.
x0k-ui-protocol = { path = "../x0k-ui-protocol", version = "0.1.0" }

[target.'cfg(target_os = "linux")'.dependencies]
# WebKitGTK's snapshot, the cairo surface it answers, and that surface's PNG.
cairo-rs = { version = "0.18", features = ["png"] }
# GDK's events and GTK's main loop, which input is delivered through.
gtk = "0.18"
webkit2gtk = "2.0"

[target.'cfg(target_os = "macos")'.dependencies]
# WKWebView's snapshot, AppKit's events and images, and CoreGraphics' pixels
# and wheel events, at the versions wry's own tree resolves.
block2 = "0.6"
objc2 = "0.6"
objc2-app-kit = { version = "0.3", default-features = false, features = ["std", "objc2-core-foundation", "objc2-core-graphics", "NSBitmapImageRep", "NSEvent", "NSGraphics", "NSGraphicsContext", "NSImage", "NSImageRep", "NSResponder", "NSScreen", "NSView", "NSWindow"] }
objc2-core-foundation = { version = "0.3", default-features = false, features = ["std", "CFCGTypes"] }
objc2-core-graphics = { version = "0.3", default-features = false, features = ["std", "CGBitmapContext", "CGColorSpace", "CGContext", "CGEvent", "CGEventSource", "CGEventTypes", "CGImage", "CGRemoteOperation"] }
objc2-foundation = { version = "0.3", default-features = false, features = ["std", "NSArray", "NSData", "NSDictionary", "NSError", "NSGeometry", "NSProcessInfo", "NSString"] }
objc2-web-kit = { version = "0.3", default-features = false, features = ["std", "block2", "objc2-app-kit", "WKSnapshotConfiguration", "WKWebView"] }

[build-dependencies]
tauri-plugin = { version = "2.7", features = ["build"] }

[dev-dependencies]
tokio = { version = "1", features = ["macros", "rt"] }
```

The crate is one plugin over five parts: the loop, the requests to the page,
the capture, the input and the endpoint.

<a name="chunk-lib"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#lib`</sub>

```rust {#lib file="src/lib.rs"}
//! A Tauri plugin that is a Tauri app's host for the UI-control webview
//! design: it injects the in-page library, asks the page over Tauri's IPC
//! with a nonce per request, captures the held page natively, and serves the
//! page as the app's UI-control endpoint.
#[cfg(any(target_os = "linux", target_os = "macos"))]
pub mod endpoint;
pub mod held;
#[cfg(target_os = "linux")]
mod input;
#[cfg(target_os = "macos")]
#[path = "input_macos.rs"]
mod input;
mod page;
#[cfg(target_os = "linux")]
mod snapshot;
#[cfg(target_os = "macos")]
#[path = "snapshot_macos.rs"]
mod snapshot;

#[cfg(any(target_os = "linux", target_os = "macos"))]
pub use endpoint::{PageApp, HELD_FRAMES, UI_GLOBAL};
pub use held::{held_capture, Held, HeldCapture, HoldingHost, Refused, HOLD_TRIES};
pub use page::{endpoint_socket_path, ui_plugin, PageError, PageHold, PageHost, Pending, PAGE_GLOBAL, PAGE_SCRIPT, PLUGIN};
#[cfg(any(target_os = "linux", target_os = "macos"))]
pub use snapshot::Snapshot;
```

## The loop, and how it stays the library's rule

The library holds its host's loop in TypeScript, `heldCapture` in
`src/held-capture.ts`, for the CDP host and the WebKitGTK host of its test. The
plugin's loop runs in Rust, inside the app. Two loops are two places a rule can
drift, so the Rust loop keeps the TypeScript one's rule in three ways:

- it has the same steps in the same order, the verify included after a failed
  capture, so a page is never left held;
- it has the same bound, `HOLD_TRIES`, and the same refusal text,
  `page_unsettled: epochs a→b, …`;
- the same probe page and the same claims hold both: the library's test drives
  `heldCapture`, and this chapter's test drives the plugin's loop.

The loop knows no Tauri. A host is three round trips: to the page, to the
platform, and to the page again.

<a name="chunk-held-contract"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#held-contract`</sub>

```rust {#held-contract}
/// How many times a host holds the page before it refuses the capture: the
/// library's `HOLD_TRIES`.
pub const HOLD_TRIES: usize = 3;

/// What the page answers when it is held: the epoch it was held at, what the
/// reader read in the same task, and how long the hold took to settle.
#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Held<R> {
    pub epoch: u64,
    pub read: R,
    pub hold_ms: f64,
}

/// What a host does to a page around one capture.
pub trait HoldingHost {
    type Read;
    type Capture;
    type Error: Display;
    fn hold(&mut self) -> impl Future<Output = Result<Held<Self::Read>, Self::Error>>;
    fn capture(&mut self) -> impl Future<Output = Result<Self::Capture, Self::Error>>;
    fn verify(&mut self) -> impl Future<Output = Result<u64, Self::Error>>;
}
```

An observation names the epoch it was held at as its frame. A part the host
could not produce is refused by name, and the read is kept.

<a name="chunk-held-answer"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#held-answer`</sub>

```rust {#held-answer}
/// A part of an observation the host could not produce, and why.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct Refused {
    pub part: &'static str,
    pub why: String,
}

/// One observation held around a capture. `frame` names the epoch the page
/// was held at; `refused` is set when the capture could not be tied to it.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeldCapture<R, C> {
    pub frame: String,
    pub read: R,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capture: Option<C>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refused: Option<Refused>,
    /// The hold's cost on each try, in ms.
    pub hold_ms: Vec<f64>,
}
```

A failed hold or verify is a page that did not answer, and the observation
fails with it. A failed capture is the platform's refusal, and only the capture
part is refused.

<a name="chunk-held-loop"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#held-loop`</sub>

```rust {#held-loop}
/// Hold, capture and verify, and hold again while the epoch moved, up to
/// `tries` times (at least once). Then the capture is refused as
/// `page_unsettled`, naming the epochs seen, and the last read is answered.
pub async fn held_capture<H: HoldingHost>(host: &mut H, tries: usize) -> Result<HeldCapture<H::Read, H::Capture>, H::Error> {
    let mut seen = Vec::new();
    let mut hold_ms = Vec::new();
    let mut last = None;
    for _ in 0..tries.max(1) {
        let held = host.hold().await?;
        hold_ms.push(held.hold_ms);
        let capture = host.capture().await;
        let after = host.verify().await?;
        let refuse = |why: String| Some(Refused { part: "capture", why });
        match capture {
            Err(failure) => {
                let refused = refuse(format!("capture failed: {failure}"));
                return Ok(HeldCapture { frame: held.epoch.to_string(), read: held.read, capture: None, refused, hold_ms });
            }
            Ok(capture) if after == held.epoch => {
                return Ok(HeldCapture { frame: held.epoch.to_string(), read: held.read, capture: Some(capture), refused: None, hold_ms });
            }
            Ok(_) => seen.push(format!("{}→{after}", held.epoch)),
        }
        last = Some(held);
    }
    let last = last.expect("the loop ran at least once");
    let refused = Some(Refused { part: "capture", why: format!("page_unsettled: epochs {}", seen.join(", ")) });
    Ok(HeldCapture { frame: last.epoch.to_string(), read: last.read, capture: None, refused, hold_ms })
}
```

Three tests pin the rule with a scripted page whose epoch moves on cue: a
moved epoch is held again, a page that never settles is refused by name, and a
failed capture is refused with the platform's reason after the page is
released.

<a name="chunk-held-tests"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#held-tests`</sub>

```rust {#held-tests}
#[cfg(test)]
mod tests {
    use super::*;

    /// A page whose epoch after each capture is the next of `after`, held at 7.
    struct Scripted { after: Vec<u64>, capture_fails: bool, verified: usize }

    impl HoldingHost for Scripted {
        type Read = &'static str;
        type Capture = &'static str;
        type Error = String;
        async fn hold(&mut self) -> Result<Held<&'static str>, String> {
            Ok(Held { epoch: 7, read: "read", hold_ms: 1.0 })
        }
        async fn capture(&mut self) -> Result<&'static str, String> {
            if self.capture_fails { Err("no surface".into()) } else { Ok("pixels") }
        }
        async fn verify(&mut self) -> Result<u64, String> {
            self.verified += 1;
            Ok(self.after.remove(0))
        }
    }

    #[tokio::test]
    async fn a_moved_epoch_is_held_again_and_a_still_one_answers() {
        let mut page = Scripted { after: vec![8, 7], capture_fails: false, verified: 0 };
        let held = held_capture(&mut page, HOLD_TRIES).await.unwrap();
        assert_eq!((held.frame.as_str(), held.capture, held.refused, held.hold_ms.len()), ("7", Some("pixels"), None, 2));
    }

    #[tokio::test]
    async fn a_page_that_never_settles_is_refused_as_unsettled_with_its_read() {
        let mut page = Scripted { after: vec![8, 9, 10], capture_fails: false, verified: 0 };
        let held = held_capture(&mut page, HOLD_TRIES).await.unwrap();
        assert_eq!(held.refused.unwrap().why, "page_unsettled: epochs 7→8, 7→9, 7→10");
        assert_eq!((held.read, held.capture), ("read", None));
    }

    #[tokio::test]
    async fn a_failed_capture_is_refused_with_its_reason_after_the_page_is_released() {
        let mut page = Scripted { after: vec![7], capture_fails: true, verified: 0 };
        let held = held_capture(&mut page, HOLD_TRIES).await.unwrap();
        assert_eq!(held.refused.unwrap().why, "capture failed: no surface");
        assert_eq!(page.verified, 1);
    }
}
```

<a name="chunk-held-file"></a><sub>[`src/held.rs`](../../crates/x0k-ui-tauri/src/held.rs) · `#held-file` · assembles [held-contract](#chunk-held-contract) · [held-answer](#chunk-held-answer) · [held-loop](#chunk-held-loop) · [held-tests](#chunk-held-tests)</sub>

```rust {#held-file file="src/held.rs"}
//! The host's loop around one capture: hold, capture, verify, and hold again
//! while the page's epoch moved. It is the in-page library's `heldCapture`
//! rule, in the plugin's language.
use std::fmt::Display;
use std::future::Future;

<<held-contract>>

<<held-answer>>

<<held-loop>>

<<held-tests>>
```

## Asking the page, with a nonce

The plugin reaches the page in two directions. Out, it evaluates a script in
the webview. Back, the page invokes the plugin's `page_answer` command. A Tauri
command receives the `Webview` that invoked it, but on Linux Tauri cannot tell
an embedded frame from its window, so the webview alone does not say who
answered. On macOS wry hands Tauri the URL of the frame that sent the message
(`WKScriptMessage.frameInfo`), so Tauri's capability check, which grants the
command to the app's own origin only, refuses a frame of another origin before
the plugin hears it. A frame of the page's own origin is not told apart there
either, so the nonce is needed on both platforms. That is read from wry's
source, not measured. The nonce does tell them apart. It is fresh for each request, and only the script
that carries the request holds it, so a frame in the page cannot answer for
the page.

The plugin keeps each waiting request by its nonce, with the label of the
webview it went to and the channel its answer goes back on.

<a name="chunk-pending"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#pending`</sub>

```rust {#pending}
/// The requests waiting for the page's answer, each by its nonce, with the
/// label of the webview it was sent to.
#[derive(Default)]
pub struct Pending {
    waiting: Mutex<HashMap<String, (String, oneshot::Sender<Result<String, PageError>>)>>,
    dropped: AtomicU64,
}

impl Pending {
    /// How many answers were dropped: a missing or wrong nonce, or a wrong webview.
    pub fn dropped(&self) -> u64 {
        self.dropped.load(Ordering::Relaxed)
    }
}
```

The command takes one argument, the reply, whose fields are all optional. So a
reply with no nonce still reaches the check and is counted, rather than being
refused by Tauri's argument parsing before the plugin sees it. The command
answers the page nothing either way, so a forger learns nothing from it.

<a name="chunk-answer-command"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#answer-command`</sub>

```rust {#answer-command}
/// One answer from the page: the nonce of the request it answers, and the
/// value the request's body returned or what it threw.
#[derive(serde::Deserialize)]
struct Reply {
    nonce: Option<String>,
    value: Option<String>,
    error: Option<String>,
}

/// The page's answer to a request. It is taken only when its nonce names a
/// request waiting for the webview that sent it; any other answer is dropped.
#[tauri::command]
fn page_answer<R: Runtime>(webview: Webview<R>, pending: State<'_, Pending>, reply: Reply) {
    let mut waiting = pending.waiting.lock().expect("pending requests");
    let ours = reply.nonce.as_deref().is_some_and(|n| waiting.get(n).is_some_and(|(label, _)| label == webview.label()));
    let taken = if ours { reply.nonce.as_deref().and_then(|n| waiting.remove(n)) } else { None };
    drop(waiting);
    match taken {
        Some((_, answered)) => {
            let _ = answered.send(match reply.error {
                Some(thrown) => Err(PageError::Threw(thrown)),
                None => Ok(reply.value.unwrap_or_default()),
            });
        }
        None => {
            pending.dropped.fetch_add(1, Ordering::Relaxed);
            tracing::warn!(webview = webview.label(), has_nonce = reply.nonce.is_some(), "ui_tauri.answer.dropped");
        }
    }
}
```

The request's script runs the body as an async function and answers its value
as a string, or what it threw.

<a name="chunk-request-script"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#request-script`</sub>

```rust {#request-script}
/// The script that hands the page one request: it runs `body`, the body of an
/// async function, and answers its value or what it threw with `nonce`.
fn request_script(nonce: &str, body: &str) -> String {
    format!(
        "(async () => {{\n\
         const answer = (a) => window.__TAURI_INTERNALS__.invoke('plugin:{PLUGIN}|page_answer', {{ reply: {{ nonce: '{nonce}', ...a }} }});\n\
         try {{ answer({{ value: String(await (async () => {{ {body} }})()) }}); }}\n\
         catch (e) {{ answer({{ error: String(e) }}); }}\n\
         }})();"
    )
}
```

A request registers its nonce before the script goes out, so an answer cannot
arrive before its request waits. A request that times out takes its nonce back,
so a late answer to it is dropped too.

<a name="chunk-evaluate"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#evaluate`</sub>

```rust {#evaluate}
/// Run `body`, the body of an async function, in the page; its value as a
/// string. It waits at most `timeout` for the page's answer.
pub async fn evaluate_within(&self, body: &str, timeout: Duration) -> Result<String, PageError> {
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let (reply, answered) = oneshot::channel();
    let pending = self.webview.state::<Pending>();
    pending.waiting.lock().expect("pending requests").insert(nonce.clone(), (self.webview.label().to_string(), reply));
    if let Err(e) = self.webview.eval(request_script(&nonce, body)) {
        pending.waiting.lock().expect("pending requests").remove(&nonce);
        return Err(e.into());
    }
    match tokio::time::timeout(timeout, answered).await {
        Ok(Ok(answer)) => answer,
        Ok(Err(_)) | Err(_) => {
            pending.waiting.lock().expect("pending requests").remove(&nonce);
            Err(PageError::Unanswered(timeout))
        }
    }
}
```

A request that gets no usable answer says why, by kind.

<a name="chunk-page-error"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#page-error`</sub>

```rust {#page-error}
/// Why a request to the page, or its capture, got no usable answer.
#[derive(Debug, thiserror::Error)]
pub enum PageError {
    #[error("the page did not answer within {0:?}")]
    Unanswered(Duration),
    #[error("the page threw: {0}")]
    Threw(String),
    #[error("the page's answer did not parse: {0}")]
    Malformed(String),
    #[error("tauri refused: {0}")]
    Tauri(#[from] tauri::Error),
    #[cfg(target_os = "linux")]
    #[error("the snapshot failed: {0}")]
    Snapshot(#[from] webkit2gtk::glib::Error),
    #[cfg(target_os = "macos")]
    #[error("the snapshot failed: {0}")]
    Snapshot(String),
    #[error("the snapshot is not an image surface")]
    NotAnImage,
    #[error("the snapshot's PNG could not be made: {0}")]
    Png(String),
    #[cfg(target_os = "linux")]
    #[error("the snapshot's pixels could not be read: {0}")]
    Pixels(#[from] cairo::BorrowError),
    #[error("the snapshot's answer was dropped")]
    SnapshotDropped,
    #[error("a {0} source cannot be delivered into this webview")]
    UndeliverableSource(String),
    #[error("step {step} of source {id} names no resolved position")]
    Unresolved { id: String, step: usize },
    #[error("the capture's scale {0} is not a positive number")]
    BadScale(f64),
    #[error("the webview has no window to deliver input to")]
    NoWindow,
    #[error("the input's delivery was dropped")]
    InputDropped,
}

impl From<TickFault> for PageError {
    fn from(fault: TickFault) -> Self {
        match fault {
            TickFault::BadScale(scale) => PageError::BadScale(scale),
            TickFault::Unresolved { source, step } => PageError::Unresolved { id: source, step },
        }
    }
}
```

## The page host

`PageHost` is one webview's page as its host holds it. An observation runs the
loop with the page's hold and verify as its two page round trips, and the
platform snapshot between them. The reader is a script expression the page
evaluates inside the hold, in the same task as the epoch.

<a name="chunk-page-host"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#page-host` · assembles [page-drawing](#chunk-page-drawing) · [evaluate](#chunk-evaluate) · [perform](#chunk-perform)</sub>

```rust {#page-host}
/// A webview's page, as the host that holds it: requests over Tauri's IPC
/// with a nonce each, and the platform's capture.
pub struct PageHost<R: Runtime> {
    webview: Webview<R>,
    /// What the host draws of drivers' input over this page.
    presentation: Shared,
    /// Whether a task is fading the drawing.
    fading: Arc<AtomicBool>,
    /// The view's width in its own units, as the last capture measured it,
    /// as an `f64`'s bits; 0 until a capture.
    units: Arc<AtomicU64>,
}

impl<R: Runtime> PageHost<R> {
    pub fn new(webview: Webview<R>) -> Self {
        Self { webview, presentation: Shared::default(), fading: Arc::default(), units: Arc::default() }
    }

    <<page-drawing>>

    /// Run `body` in the page, waiting the default time for its answer.
    pub async fn evaluate(&self, body: &str) -> Result<String, PageError> {
        self.evaluate_within(body, ANSWER_TIMEOUT).await
    }

    <<evaluate>>

    /// The platform's capture of the page as it shows now.
    pub async fn snapshot(&self) -> Result<Snapshot, PageError> {
        let snapshot = crate::snapshot::take_snapshot(&self.webview).await?;
        self.units.store((f64::from(snapshot.width) / snapshot.scale).to_bits(), Ordering::SeqCst);
        Ok(snapshot)
    }

    <<perform>>

    /// One observation: `read`, a script expression, read in the hold, and
    /// the capture taken while the page is held.
    pub async fn observe(&self, read: &str) -> Result<HeldCapture<serde_json::Value, Snapshot>, PageError> {
        held_capture(&mut PageHold::new(self, read), HOLD_TRIES).await
    }
}
```

The page's two round trips call the library's hold through its global, exactly
as the library's own hosts do. A hold for the frame alone asks the library to
hide the drawing of input while the page is held. `PageHold` is public so that
a host can wrap it, as the probe app does to stand in for a slower one.

<a name="chunk-holding"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#holding`</sub>

```rust {#holding}
/// The plugin's host for one observation of a page: the library's hold and
/// verify, and the platform's snapshot between them.
pub struct PageHold<'a, R: Runtime> {
    page: &'a PageHost<R>,
    read: &'a str,
    frame_only: bool,
}

impl<'a, R: Runtime> PageHold<'a, R> {
    /// The host for one observation that reads `read`, a script expression, in the hold.
    pub fn new(page: &'a PageHost<R>, read: &'a str) -> Self {
        Self { page, read, frame_only: false }
    }

    /// The same host, holding the page with the drawing of input hidden when
    /// `frame_only`, so its capture is the page's frame alone.
    pub fn frame_only(self, frame_only: bool) -> Self {
        Self { frame_only, ..self }
    }
}

impl<R: Runtime> HoldingHost for PageHold<'_, R> {
    type Read = serde_json::Value;
    type Capture = Snapshot;
    type Error = PageError;

    async fn hold(&mut self) -> Result<Held<serde_json::Value>, PageError> {
        let body = format!("return JSON.stringify(await globalThis.{PAGE_GLOBAL}.hold(() => ({}), {{ frameOnly: {} }}));", self.read, self.frame_only);
        let held = self.page.evaluate(&body).await?;
        serde_json::from_str(&held).map_err(|e| PageError::Malformed(e.to_string()))
    }

    async fn capture(&mut self) -> Result<Snapshot, PageError> {
        self.page.snapshot().await
    }

    async fn verify(&mut self) -> Result<u64, PageError> {
        let epoch = self.page.evaluate(&format!("return String(globalThis.{PAGE_GLOBAL}.verify());")).await?;
        epoch.parse().map_err(|_| PageError::Malformed(epoch))
    }
}
```

## The plugin

The plugin carries the library as a classic script, `page-script.js` beside
its manifest, and injects it with Tauri's initialization script, which the
webview runs at the start of the main frame's document, before the page's own
scripts. An app adds the plugin and gives it nothing else: no node, no esbuild
and none of the library's sources in its build. The library is TypeScript, and
its `pageScript()` makes the classic script from its own sources, so the
carried file is that function's output, written by
`node substrate/apps/ui-control-page/src/page-script.ts substrate/crates/surfaces/x0k-ui-tauri/page-script.js`
and never edited. `tools/page-script-lint`, one of `tools/ci`'s gates, writes
it afresh and is red when the carried file differs, so the file the plugin
carries is the library its sources say.

An app's own page code declares itself through the library's global,
`globalThis.__x0kUi`: `install`, `action` and `changed`, typed by the
library's `Declaration`, `ActionSpec` and `Ui` in its `src/answer.ts`
(`x0k:implementation/ui-control/page-answer`).

When the first page of the webview labelled `webview` has loaded, the plugin
serves that webview as the app's endpoint, on the unix socket named for `app`
in the profile's runtime directory (`endpoint_socket_path`, below).

<a name="chunk-plugin"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#plugin`</sub>

```rust {#plugin}
/// The in-page library as a classic script: its `pageScript()`, carried.
pub const PAGE_SCRIPT: &str = include_str!("../page-script.js");

/// The plugin: the in-page library injected before the page's own scripts in
/// the main frame of every page. Once the webview labelled `webview` has loaded
/// its first page, the plugin serves it as the app's UI-control endpoint on the
/// unix socket [`endpoint_socket_path`] names for `app`.
pub fn ui_plugin<R: Runtime>(app: &str, webview: impl Into<String>) -> TauriPlugin<R> {
    let (endpoint, label, served) = (endpoint_socket_path(app), webview.into(), AtomicBool::new(false));
    Builder::new(PLUGIN)
        .js_init_script(PAGE_SCRIPT.to_string())
        .invoke_handler(tauri::generate_handler![page_answer])
        .setup(|app, _| {
            app.manage(Pending::default());
            Ok(())
        })
        .on_page_load(move |webview, payload| {
            let first = payload.event() == PageLoadEvent::Finished && webview.label() == label && !served.swap(true, Ordering::SeqCst);
            #[cfg(any(target_os = "linux", target_os = "macos"))]
            if first {
                tauri::async_runtime::spawn(crate::endpoint::serve(endpoint.clone(), webview.clone()));
            }
            #[cfg(not(any(target_os = "linux", target_os = "macos")))]
            let _ = (first, &endpoint);
        })
        .build()
}
```

The endpoint binds where every UI-control endpoint binds: `<app>.endpoint` in
the profile's runtime directory, under `ui-control/` (`ui-control-channel` §5),
by `x0k_ui_endpoint::address`, the rule's one home. So a driver that lists the
directory finds a Tauri app beside x0k's shell. The profile is the one the
app's environment names (`x0k_runtime_dir::process_profile_name`): `X0K_PROFILE`,
else the data root's active profile, else `main`. Resolving it binds nothing
and migrates nothing in the data root.

The rule is the one that keeps a scratch process out of the live root's
runtime. A process whose data root is not the operator's, or whose profile is
not the live root's active one, drops a pin of `X0K_RUNTIME_DIR` or
`X0K_UI_CONTROL_ENDPOINT_DIR` inside the live runtime and binds in a
directory of its own. The dev shell entered on the live root pins the live
node's runtime, so an app started from it for a scratch profile would
otherwise bind beside the live shell, and a driver for the live stack would
find it there.

<a name="chunk-endpoint-path"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#endpoint-path`</sub>

```rust {#endpoint-path}
/// Where the plugin serves `app`'s endpoint: `<app>.endpoint` in the
/// endpoints' directory of the profile this process's environment names, by
/// the rule every UI-control endpoint binds by.
pub fn endpoint_socket_path(app: &str) -> PathBuf {
    x0k_ui_endpoint::address::ui_endpoint_path(&x0k_runtime_dir::process_profile_name(), app)
}
```

A test holds that rule from the plugin's side. It starts as the dev shell
leaves a scratch app: `X0K_RUNTIME_DIR` pins the live profile's runtime, here
a stand-in for it under `/tmp`, since the test resolves and binds nothing. A
scratch profile's endpoint is then in that profile's own directory, an
override inside the live runtime is dropped too, and a scratch root on the
live profile's name gets a directory of its own beside the live one.

<a name="chunk-endpoint-dir-test"></a><sub>[`tests/endpoint_dir.rs`](../../crates/x0k-ui-tauri/tests/endpoint_dir.rs) · `#endpoint-dir-test`</sub>

```rust {#endpoint-dir-test file="tests/endpoint_dir.rs"}
//! Where the plugin serves a scratch app's endpoint, when the environment
//! pins the live root's runtime.
use std::path::PathBuf;

#[test]
fn a_scratch_app_never_binds_its_endpoint_in_the_live_runtime() {
    let tmp = PathBuf::from("/tmp").join(format!("x0k-ut-{}", std::process::id()));
    let (home, xdg) = (tmp.join("home"), tmp.join("xdg"));
    let live = xdg.join("x0k/main");
    std::fs::create_dir_all(home.join(".0k")).unwrap();
    std::fs::write(home.join(".0k/active-profile"), "main").unwrap();
    for var in ["X0K_HOME", "C0K_HOME", "C0K_PROFILE", "C0K_RUNTIME_DIR", "X0K_UI_CONTROL_ENDPOINT_DIR"] {
        std::env::remove_var(var);
    }
    std::env::set_var("HOME", &home);
    std::env::set_var("XDG_RUNTIME_DIR", &xdg);
    std::env::set_var("X0K_RUNTIME_DIR", &live);

    std::env::set_var("X0K_PROFILE", "probe");
    let own = xdg.join("x0k/probe/ui-control/probe-app.endpoint");
    assert_eq!(x0k_ui_tauri::endpoint_socket_path("probe-app"), own, "a scratch profile binds in its own runtime dir");
    std::env::set_var("X0K_UI_CONTROL_ENDPOINT_DIR", live.join("ui-control"));
    assert_eq!(x0k_ui_tauri::endpoint_socket_path("probe-app"), own, "an override inside the live runtime is dropped");
    std::env::remove_var("X0K_UI_CONTROL_ENDPOINT_DIR");

    std::env::set_var("X0K_PROFILE", "main");
    std::env::set_var("X0K_HOME", tmp.join("root"));
    let scratch_root = x0k_ui_tauri::endpoint_socket_path("probe-app");
    assert!(!scratch_root.starts_with(&live), "a scratch root on the live profile's name binds in {}", scratch_root.display());
    assert_eq!(scratch_root.parent().and_then(|dir| dir.parent()).and_then(|dir| dir.parent()), Some(xdg.join("x0k").as_path()));
    let _ = std::fs::remove_dir_all(&tmp);
}
```

<a name="chunk-page-file"></a><sub>[`src/page.rs`](../../crates/x0k-ui-tauri/src/page.rs) · `#page-file` · assembles [page-error](#chunk-page-error) · [pending](#chunk-pending) · [plugin](#chunk-plugin) · [endpoint-path](#chunk-endpoint-path) · [answer-command](#chunk-answer-command) · [page-host](#chunk-page-host) · [request-script](#chunk-request-script) · [settle](#chunk-settle) · [holding](#chunk-holding) · [paint-drawn](#chunk-paint-drawn)</sub>

```rust {#page-file file="src/page.rs"}
//! The plugin, and the page it holds: requests over Tauri's IPC, each with a
//! fresh nonce, and the answers it takes or drops.
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use tauri::plugin::{Builder, TauriPlugin};
use tauri::webview::PageLoadEvent;
use tauri::{Manager, Runtime, State, Webview};
use tokio::sync::oneshot;

use x0k_ui_protocol::input::{Event, Pace, Perform, Resolved, TickFault, WATCHABLE_PRESS_MS};
use x0k_ui_protocol::presentation::{faded, watchable_way, InputPresentation, MARK_FOR};

use crate::held::{held_capture, Held, HeldCapture, HoldingHost, HOLD_TRIES};
use crate::snapshot::Snapshot;

/// The plugin's name, which its command and its permissions are named under.
pub const PLUGIN: &str = "x0k-ui-tauri";
/// The global the in-page library's hold is reachable through: its `PAGE_GLOBAL`.
pub const PAGE_GLOBAL: &str = "__x0kUiHold";
/// How long a request waits for the page's answer: past the library's
/// `HOLD_LAPSE_MS`, after which a held page lets itself go.
const ANSWER_TIMEOUT: Duration = Duration::from_secs(5);
/// How often the drawing of drivers' input is pruned and painted while it fades.
const FADE_STEP: Duration = Duration::from_millis(50);

/// What a page's host draws of drivers' input, shared with the task that fades it.
type Shared = Arc<Mutex<InputPresentation>>;

<<page-error>>

<<pending>>

<<plugin>>

<<endpoint-path>>

<<answer-command>>

<<page-host>>

<<request-script>>

<<settle>>

<<holding>>

<<paint-drawn>>
```

A plugin's command is reachable only through a permission an app's capability
grants. The plugin declares one, and makes it its default.

<a name="chunk-permissions"></a><sub>[`permissions/default.toml`](../../crates/x0k-ui-tauri/permissions/default.toml) · `#permissions`</sub>

```toml {#permissions file="permissions/default.toml"}
[default]
description = "Lets the in-page library answer the plugin's requests."
permissions = ["allow-answer"]

[[permission]]
identifier = "allow-answer"
description = "The in-page library's answer to a request, with the request's nonce."
commands.allow = ["page_answer"]
```

Tauri's plugin build reads that file and hands it to the app's build. It also
writes a schema and a reference page under `permissions/`, which stay out of
the repository.

<a name="chunk-plugin-build"></a><sub>[`build.rs`](../../crates/x0k-ui-tauri/build.rs) · `#plugin-build`</sub>

```rust {#plugin-build file="build.rs"}
fn main() {
    // The permissions are declared by hand in permissions/default.toml.
    tauri_plugin::Builder::new(&[]).build();
}
```

## The capture

WebKitGTK's snapshot runs on GTK's main thread, so the plugin asks for it
through `with_webview`, which runs there, and the answer comes back on a
channel. The snapshot paints the visible region afresh from the page as it
stands (webview design, "Measured on arca"), which is the held state. It also
reads the widget's allocated width there, so the capture says its own scale:
its pixels per widget unit, which input divides by. Its PNG, which an
observation carries, is cairo's own encoding of the same surface.

A capture is the same on every platform: premultiplied BGRA rows, as cairo
holds them, the PNG an observation carries, and the scale input divides by.

<a name="chunk-snapshot-type"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#snapshot-type`</sub>

```rust {#snapshot-type}
/// A capture of the page's visible region: premultiplied BGRA rows, as cairo
/// holds them, the same pixels as a PNG, and `scale`, its pixels per unit of
/// the webview's view (a GTK widget unit on Linux, an AppKit point on macOS).
#[derive(Clone, Debug, serde::Serialize)]
pub struct Snapshot {
    pub width: u32,
    pub height: u32,
    pub stride: u32,
    pub scale: f64,
    #[serde(skip)]
    pub bgra: Vec<u8>,
    #[serde(skip)]
    pub png: Vec<u8>,
}
```

<a name="chunk-snapshot"></a><sub>[`src/snapshot.rs`](../../crates/x0k-ui-tauri/src/snapshot.rs) · `#snapshot` · assembles [snapshot-type](#chunk-snapshot-type)</sub>

```rust {#snapshot file="src/snapshot.rs"}
//! The platform's capture on Linux: `webkit_web_view_get_snapshot`.
use gtk::prelude::WidgetExt;
use tauri::{Runtime, Webview};
use tokio::sync::oneshot;
use webkit2gtk::{SnapshotOptions, SnapshotRegion, WebViewExt};

use crate::page::PageError;

<<snapshot-type>>

/// The snapshot of the visible region, asked for on GTK's main thread.
pub(crate) async fn take_snapshot<R: Runtime>(webview: &Webview<R>) -> Result<Snapshot, PageError> {
    let (done, taken) = oneshot::channel();
    webview.with_webview(move |platform| {
        let none = None::<&webkit2gtk::gio::Cancellable>;
        let units = platform.inner().allocated_width();
        platform.inner().snapshot(SnapshotRegion::Visible, SnapshotOptions::NONE, none, move |result| {
            let _ = done.send(result.map_err(PageError::from).and_then(|surface| image(surface, units)));
        });
    })?;
    taken.await.map_err(|_| PageError::SnapshotDropped)?
}

/// The snapshot's pixels, and its scale over `units`, the widget's width.
fn image(surface: cairo::Surface, units: i32) -> Result<Snapshot, PageError> {
    let image = cairo::ImageSurface::try_from(surface).map_err(|_| PageError::NotAnImage)?;
    image.flush();
    let mut bgra = Vec::new();
    image.with_data(|data| bgra.extend_from_slice(data))?;
    let mut png = Vec::new();
    image.write_to_png(&mut png).map_err(|e| PageError::Png(e.to_string()))?;
    let scale = f64::from(image.width()) / f64::from(units.max(1));
    Ok(Snapshot { width: image.width() as u32, height: image.height() as u32, stride: image.stride() as u32, scale, bgra, png })
}
```

## Input, through GTK's own event path

Input must reach the page as a person's does: the page's own hit-testing
decides which element a click lands on, the page's own focus decides where a key
goes, and every event arrives `isTrusted`. An event a script builds does none of
this (webview design §4). WebKitGTK has no public call that injects input, so
the plugin enters one step earlier, where a person's input enters: GTK's event
path.

Three ways in were weighed.

- **WebKit's automation.** WebDriver for WebKitGTK synthesizes input with
  `webkitWebViewBaseSynthesizeMouseEvent`, `…KeyEvent` and `…WheelEvent`, which
  hand a native event straight to the page proxy. They are private to WebKit,
  so an embedder cannot call them.
- **GDK events through `gtk_main_do_event`.** A `GdkEvent` with the fields
  WebKit's own GTK 3 code sets when it makes one (the widget's window, a time,
  the position and its root position, the modifier state, the button, the
  seat's pointer or keyboard) goes through GTK's dispatch to the webview's
  handlers, which make from it the same native event a person's click makes.
  It goes to this one widget, on any GDK backend.
- **XTest through the X server.** It is the most real path, but it moves the
  display's one pointer and types into whatever window has the X focus. On a
  person's desktop that is their cursor, and it does nothing under Wayland.

The plugin takes the second. Its events enter GTK where the X server's do, so
GTK's grabs, the window's focus widget and WebKit's input method all see them,
and the page decides the target.

**Units.** A position arrives in the named frame's capture pixels, which is
where a layout node's bounds lie. A GDK event's position is in the widget's
units. The capture's scale over the widget, its pixels per widget unit, is the
snapshot's own: its width over the widget's allocated width, which the plugin
reads when it takes the snapshot (`Snapshot::scale`). This is not the page's
`scale_factor` (`x0k:implementation/ui-control/page-walk`), which is the
capture's width over the viewport's in CSS pixels. Under Xvfb on arca the two
differ. WebKitGTK zooms the page by the screen's resolution, so a 400-unit
widget's capture is 400 pixels wide over a viewport of 383 CSS pixels: a
`scale_factor` of 1.0444 and a widget scale of 1. At `GDK_SCALE=2` the capture
is 800 pixels wide, a widget scale of 2 and a `scale_factor` of 2.0888. The
page turns widget units into CSS pixels itself.

**Ticks.** A sequence runs as the WebDriver actions model runs it: tick by
tick, where tick *n* is step *n* of every source. A pause holds its tick for its
time. A pointer's button and a key's modifier stay held from its down to its
up, and every event while they are held carries them. That rule is the
protocol's `ticks` (`x0k:implementation/ui-control/protocol`, "A sequence,
tick by tick"), which every host of the protocol runs; the plugin maps each
of its events to GDK's.

**Settling.** GTK hands each event to WebKit at once, but WebKit's UI process
sends the page one mouse event and one key event at a time, each when the page
has handled the last. A request to the page travels beside that queue, not in
it, so it can overtake input still waiting there. Measured on arca: two
rendering updates after six typed characters, the field held three. So when the
last tick has been delivered, the plugin asks the page to listen for input and
answer when two rendering updates have passed with none arriving, or after a
second at most. It answers the page's epoch then, so an observation after it
sees what the input did.

Only `mouse`, `key` and `wheel` sources are delivered. A `pen` or a `touch`
source is refused by name before any of the sequence runs, so the endpoint can
leave them out of its offer.

`perform` is what the endpoint calls with a sequence `check_perform` has
passed: the sequence, the positions `check_perform` resolved for it, and the
scale of the capture its frame names.

<a name="chunk-perform"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#perform`</sub>

```rust {#perform}
/// Deliver `perform` into the page through the platform's input path, drawn
/// for `requester` over the window as it lands, and answer the page's epoch
/// once its input has settled. `resolved` is what `check_perform` answered for
/// it, in the frame's capture pixels, and `scale` is that frame's capture's
/// pixels per widget unit (`Snapshot::scale`).
pub async fn perform(&self, requester: &str, perform: &Perform, resolved: &[Resolved], scale: f64) -> Result<u64, PageError> {
    #[cfg(target_os = "linux")]
    let ticks = crate::input::gdk_ticks(perform, resolved, scale)?;
    #[cfg(target_os = "macos")]
    let ticks = crate::input::appkit_ticks(perform, resolved, scale)?;
    let shown = x0k_ui_protocol::input::ticks(perform, resolved, scale)?;
    let watchable = perform.presented() && perform.pace == Pace::Watchable;
    let mut last = HashMap::new();
    for (tick, events) in ticks.into_iter().zip(&shown) {
        if watchable {
            for (synth, event) in tick.events.into_iter().zip(&events.events) {
                self.travel(requester, event, &mut last).await?;
                self.draw(requester, event);
                crate::input::deliver(&self.webview, vec![synth]).await?;
            }
        } else {
            if perform.presented() {
                events.events.iter().for_each(|event| self.draw(requester, event));
            }
            crate::input::deliver(&self.webview, tick.events).await?;
        }
        if tick.pause_ms > 0 {
            tokio::time::sleep(Duration::from_millis(tick.pause_ms.into())).await;
        }
    }
    if perform.presented() {
        self.keep_fading();
    }
    let epoch = self.evaluate(&format!("{SETTLE} return String(globalThis.{PAGE_GLOBAL}.epoch());")).await?;
    epoch.parse().map_err(|_| PageError::Malformed(epoch))
}
```

<a name="chunk-settle"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#settle`</sub>

```rust {#settle}
/// A request body that waits until the page has handled the input still
/// queued for it: two rendering updates with no input event, or a second.
const SETTLE: &str = "await new Promise((settled) => {
  const kinds = ['pointermove', 'pointerdown', 'pointerup', 'mousemove', 'mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'input', 'wheel'];
  const heard = () => { quiet = 0; };
  const until = performance.now() + 1000;
  let quiet = 0;
  for (const kind of kinds) addEventListener(kind, heard, { capture: true, passive: true });
  const frame = () => {
    quiet += 1;
    if (quiet <= 2 && performance.now() < until) return void requestAnimationFrame(frame);
    for (const kind of kinds) removeEventListener(kind, heard, { capture: true });
    settled();
  };
  requestAnimationFrame(frame);
});";
```

A sequence first becomes the protocol's ticks at the capture's scale, and each
event then becomes a plain GDK-shaped event in the widget's units: a button
numbered from 1, a scroll in GDK's smooth-scroll units, and what is held as
GDK's modifier state, which GDK reports as it stands before the event. This
part touches no GTK, so a test holds it alone.

<a name="chunk-input-events"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#input-events`</sub>

```rust {#input-events}
/// One event to synthesize, in the widget's units, with GDK's modifier state.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Synth {
    Motion { x: f64, y: f64, state: u32 },
    Button { press: bool, button: u32, x: f64, y: f64, state: u32 },
    Key { press: bool, keyval: u32, state: u32, modifier: bool },
    Scroll { x: f64, y: f64, dx: f64, dy: f64, state: u32 },
}

/// One tick: every source's step at it, and how long its longest pause holds it.
#[derive(Debug, Default, PartialEq)]
pub(crate) struct Tick {
    pub events: Vec<Synth>,
    pub pause_ms: u32,
}

/// How many pixels of scroll one of GDK's smooth-scroll units is: WebKit's
/// `Scrollbar::pixelsPerLineStep()`.
const PIXELS_PER_LINE: f64 = 40.0;

/// The source kinds GDK delivers into WebKitGTK.
const DELIVERED: &[&str] = &["mouse", "key", "wheel"];

/// `perform` as ticks of events in the widget's units, or why none of it may run.
pub(crate) fn gdk_ticks(perform: &Perform, resolved: &[Resolved], scale: f64) -> Result<Vec<Tick>, PageError> {
    if let Some(source) = undeliverable(perform, DELIVERED) {
        return Err(PageError::UndeliverableSource(source.kind.clone()));
    }
    let ticks = input::ticks(perform, resolved, scale)?;
    Ok(ticks.iter().map(|tick| Tick { events: tick.events.iter().map(synth).collect(), pause_ms: tick.pause_ms }).collect())
}

/// One event of a tick as GDK's: its button numbered from 1, a scroll in
/// smooth-scroll units, and what is held as GDK's state.
pub(crate) fn synth(event: &Event) -> Synth {
    match event {
        Event::Move { x, y, held, .. } => Synth::Motion { x: *x, y: *y, state: state(held) },
        Event::Press { button, x, y, held, .. } | Event::Release { button, x, y, held, .. } => {
            let press = matches!(event, Event::Press { .. });
            Synth::Button { press, button: u32::from(*button) + 1, x: *x, y: *y, state: state(held) }
        }
        Event::KeyDown { key, held } | Event::KeyUp { key, held } => {
            let (keyval, mask) = keyval(key);
            Synth::Key { press: matches!(event, Event::KeyDown { .. }), keyval, state: state(held), modifier: !mask.is_empty() }
        }
        Event::Scroll { x, y, delta_x, delta_y, held, .. } => {
            Synth::Scroll { x: *x, y: *y, dx: delta_x / PIXELS_PER_LINE, dy: delta_y / PIXELS_PER_LINE, state: state(held) }
        }
    }
}

/// What a sequence holds, as GDK's modifier state.
fn state(held: &Held) -> u32 {
    let buttons = (0..5u32).filter(|n| held.buttons & (1 << n) != 0).fold(ModifierType::empty(), |mask, n| mask | button_mask(n + 1));
    let keys = [(input::SHIFT, ModifierType::SHIFT_MASK), (input::CONTROL, ModifierType::CONTROL_MASK), (input::ALT, ModifierType::MOD1_MASK), (input::META, ModifierType::META_MASK)];
    let modifiers = keys.iter().filter(|(bit, _)| held.modifiers & bit != 0).fold(ModifierType::empty(), |mask, (_, gdk)| mask | *gdk);
    (buttons | modifiers).bits()
}

/// The modifier bit GDK sets while `button` is held.
fn button_mask(button: u32) -> ModifierType {
    match button {
        1 => ModifierType::BUTTON1_MASK,
        2 => ModifierType::BUTTON2_MASK,
        3 => ModifierType::BUTTON3_MASK,
        4 => ModifierType::BUTTON4_MASK,
        5 => ModifierType::BUTTON5_MASK,
        _ => ModifierType::empty(),
    }
}
```

A key is one of the protocol's named keys or one character. A named key maps
to GDK's keyval for it, and a modifier key also holds its modifier. A character
maps to the keyval GDK gives that character, and WebKit's input method types it.

<a name="chunk-input-keys"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#input-keys`</sub>

```rust {#input-keys}
/// The GDK keyval of a protocol key, and the modifier it holds down.
fn keyval(key: &str) -> (u32, ModifierType) {
    use gdk::keys::constants as k;
    let none = ModifierType::empty();
    let (key, mask) = match key {
        "Alt" => (k::Alt_L, ModifierType::MOD1_MASK),
        "Control" => (k::Control_L, ModifierType::CONTROL_MASK),
        "Meta" => (k::Meta_L, ModifierType::META_MASK),
        "Shift" => (k::Shift_L, ModifierType::SHIFT_MASK),
        "ArrowDown" => (k::Down, none),
        "ArrowLeft" => (k::Left, none),
        "ArrowRight" => (k::Right, none),
        "ArrowUp" => (k::Up, none),
        "Backspace" => (k::BackSpace, none),
        "Delete" => (k::Delete, none),
        "End" => (k::End, none),
        "Enter" => (k::Return, none),
        "Escape" => (k::Escape, none),
        "Home" => (k::Home, none),
        "PageDown" => (k::Page_Down, none),
        "PageUp" => (k::Page_Up, none),
        "Space" => (k::space, none),
        "Tab" => (k::Tab, none),
        "F1" => (k::F1, none),
        "F2" => (k::F2, none),
        "F3" => (k::F3, none),
        "F4" => (k::F4, none),
        "F5" => (k::F5, none),
        "F6" => (k::F6, none),
        "F7" => (k::F7, none),
        "F8" => (k::F8, none),
        "F9" => (k::F9, none),
        "F10" => (k::F10, none),
        "F11" => (k::F11, none),
        "F12" => (k::F12, none),
        character => (character.chars().next().map(gdk::keys::Key::from_unicode).unwrap_or(k::VoidSymbol), none),
    };
    (*key, mask)
}
```

Delivery runs on GTK's main thread, through `with_webview`, one tick at a
time. Each event is a `GdkEvent` made by `gdk_event_new` and filled as GTK
fills a real one: the window it happened in holds a reference of its own, and
the device is the seat's pointer or keyboard. A pointer event happens in the
webview widget's own window. A key event happens in its toplevel's window,
where GTK's window hands it to its focus widget. `gtk_main_do_event` then
dispatches it.

<a name="chunk-input-deliver"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#input-deliver`</sub>

```rust {#input-deliver}
/// Deliver one tick's events to the webview's widget on GTK's main thread.
pub(crate) async fn deliver<R: Runtime>(webview: &Webview<R>, events: Vec<Synth>) -> Result<(), PageError> {
    if events.is_empty() {
        return Ok(());
    }
    let (done, delivered) = oneshot::channel();
    webview.with_webview(move |platform| {
        let _ = done.send(synthesize(platform.inner().upcast_ref(), &events));
    })?;
    delivered.await.map_err(|_| PageError::InputDropped)?
}

/// Make each event as GDK makes a real one, and hand it to GTK's dispatch.
fn synthesize(view: &gtk::Widget, events: &[Synth]) -> Result<(), PageError> {
    let window = view.window().ok_or(PageError::NoWindow)?;
    let toplevel = view.toplevel().and_then(|top| top.window()).ok_or(PageError::NoWindow)?;
    let display = window.display();
    let seat = display.default_seat().ok_or(PageError::NoWindow)?;
    let keymap = gdk::Keymap::for_display(&display);
    let time = (glib::monotonic_time() / 1000) as u32;
    for event in events {
        let root = |x: f64, y: f64| {
            let (rx, ry) = window.root_coords(x.round() as i32, y.round() as i32);
            (f64::from(rx), f64::from(ry))
        };
        let mut made = match *event {
            Synth::Motion { x, y, state } => {
                let mut made = pointer_event(EventType::MotionNotify, &seat);
                let (x_root, y_root) = root(x, y);
                let raw: &mut gdk::ffi::GdkEventMotion = made.downcast_mut::<gdk::EventMotion>().expect("a motion event").as_mut();
                (raw.window, raw.time, raw.x, raw.y, raw.state, raw.x_root, raw.y_root) = (window.to_glib_full(), time, x, y, state, x_root, y_root);
                made
            }
            Synth::Button { press, button, x, y, state } => {
                let mut made = pointer_event(if press { EventType::ButtonPress } else { EventType::ButtonRelease }, &seat);
                let (x_root, y_root) = root(x, y);
                let raw: &mut gdk::ffi::GdkEventButton = made.downcast_mut::<gdk::EventButton>().expect("a button event").as_mut();
                (raw.window, raw.time, raw.x, raw.y, raw.state, raw.button, raw.x_root, raw.y_root) =
                    (window.to_glib_full(), time, x, y, state, button, x_root, y_root);
                made
            }
            Synth::Scroll { x, y, dx, dy, state } => {
                let mut made = pointer_event(EventType::Scroll, &seat);
                let (x_root, y_root) = root(x, y);
                let raw: &mut gdk::ffi::GdkEventScroll = made.downcast_mut::<gdk::EventScroll>().expect("a scroll event").as_mut();
                (raw.window, raw.time, raw.x, raw.y, raw.state, raw.x_root, raw.y_root) = (window.to_glib_full(), time, x, y, state, x_root, y_root);
                (raw.direction, raw.delta_x, raw.delta_y) = (gdk::ffi::GDK_SCROLL_SMOOTH, dx, dy);
                made
            }
            Synth::Key { press, keyval, state, modifier } => {
                let mut made = gdk::Event::new(if press { EventType::KeyPress } else { EventType::KeyRelease });
                made.set_device(seat.keyboard().as_ref());
                let entry = keymap.as_ref().and_then(|map| map.entries_for_keyval(keyval).into_iter().next());
                let raw: &mut gdk::ffi::GdkEventKey = made.downcast_mut::<gdk::EventKey>().expect("a key event").as_mut();
                (raw.window, raw.time, raw.state, raw.keyval, raw.is_modifier) = (toplevel.to_glib_full(), time, state, keyval, modifier.into());
                if let Some(entry) = entry {
                    (raw.hardware_keycode, raw.group) = (entry.keycode() as u16, entry.group() as u8);
                }
                made
            }
        };
        gtk::main_do_event(&mut made);
    }
    Ok(())
}

/// A new pointer event of `kind`, from the seat's pointer.
fn pointer_event(kind: EventType, seat: &gdk::Seat) -> gdk::Event {
    let mut made = gdk::Event::new(kind);
    made.set_device(seat.pointer().as_ref());
    made
}
```

One test holds the part a mistake would hide in: a position reaches the
widget divided by the capture's scale, a held button and a held modifier mark
the events after them, and a source the plugin cannot deliver refuses the whole
sequence.

<a name="chunk-input-tests"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#input-tests`</sub>

```rust {#input-tests}
#[cfg(test)]
mod tests {
    use super::*;
    use x0k_ui_protocol::input::{Source, Step, Target};

    fn at(x: f64, y: f64) -> Target {
        Target::Pixel { frame: "7".into(), x, y }
    }

    #[test]
    fn positions_reach_the_widget_divided_by_the_scale_and_held_input_marks_what_follows() {
        let mouse = Source {
            id: "m".into(),
            kind: "mouse".into(),
            steps: vec![Step::Move { to: at(200.0, 100.0) }, Step::Down { button: 0 }, Step::Move { to: at(300.0, 100.0) }],
        };
        let keys = Source { id: "k".into(), kind: "key".into(), steps: vec![Step::KeyDown { key: "Shift".into() }] };
        let perform = Perform::of(vec![mouse, keys]);
        let resolved = [
            Resolved { source: "m".into(), step: 0, x: 200.0, y: 100.0 },
            Resolved { source: "m".into(), step: 2, x: 300.0, y: 100.0 },
        ];
        let ticks = gdk_ticks(&perform, &resolved, 2.0).unwrap();
        assert_eq!(ticks[0].events[0], Synth::Motion { x: 100.0, y: 50.0, state: 0 });
        let shift = ModifierType::SHIFT_MASK.bits();
        assert_eq!(ticks[1].events[0], Synth::Button { press: true, button: 1, x: 100.0, y: 50.0, state: shift });
        let held = (ModifierType::BUTTON1_MASK | ModifierType::SHIFT_MASK).bits();
        assert_eq!(ticks[2].events[0], Synth::Motion { x: 150.0, y: 50.0, state: held });
    }

    #[test]
    fn a_touch_source_refuses_the_whole_sequence_by_name() {
        let touch = Source { id: "t".into(), kind: "touch".into(), steps: vec![Step::Pause { ms: 1 }] };
        let refused = gdk_ticks(&Perform::of(vec![touch]), &[], 1.0).unwrap_err();
        assert_eq!(refused.to_string(), "a touch source cannot be delivered into this webview");
    }
}
```

<a name="chunk-input-file"></a><sub>[`src/input.rs`](../../crates/x0k-ui-tauri/src/input.rs) · `#input-file` · assembles [input-events](#chunk-input-events) · [input-keys](#chunk-input-keys) · [input-deliver](#chunk-input-deliver) · [input-tests](#chunk-input-tests)</sub>

```rust {#input-file file="src/input.rs"}
//! Input into the page through the platform's input path on Linux: GDK events
//! synthesized for the webview's widget and handed to GTK's dispatch, which
//! delivers them as it delivers a person's.
use gtk::gdk::{self, EventType, ModifierType};
use gtk::glib::{self, translate::ToGlibPtr};
use gtk::gdk::prelude::*;
use gtk::prelude::*;
use tauri::{Runtime, Webview};
use tokio::sync::oneshot;
use x0k_ui_protocol::input::{self, undeliverable, Event, Held, Perform, Resolved};

use crate::page::PageError;

<<input-events>>

<<input-keys>>

<<input-deliver>>

<<input-tests>>
```

## The macOS host: WKWebView

On macOS a Tauri app's webview is a `WKWebView`. The plugin's loop, its
requests and its endpoint are the same there. Two parts change: the capture
and the input. Each is its own file, which `lib.rs` names as the module the
Linux file is on Linux, so the rest of the crate calls `take_snapshot` and
`deliver` on both platforms alike. Only the mapping from the protocol's ticks
is named by its platform, `gdk_ticks` and `appkit_ticks`, since each turns the
same ticks into a different platform's events.

Tauri's `with_webview` hands the closure the `WKWebView` as a raw pointer, on
the main thread, where AppKit and WebKit must be called. The plugin reads it
with the objc2 bindings at the versions wry's own tree resolves.

### The capture

`takeSnapshot(with:completionHandler:)` with no configuration snapshots the
view's bounds, after the screen's pending updates (`afterScreenUpdates` true).
Its answer is an `NSImage` sized in points, whose bitmap is at the screen's
backing scale. The plugin draws that bitmap into a buffer of its own, as
premultiplied BGRA rows in the image's own colour space, so the bytes are the
ones the snapshot holds and are laid out as the Linux capture's are. The PNG
is AppKit's encoding of the same image. `Snapshot::scale` is the image's pixel
width over the view's bounds width in points: 2 on a Retina screen, 1 on most
external ones.

<a name="chunk-mac-snapshot"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#mac-snapshot`</sub>

```rust {#mac-snapshot}
/// The snapshot of the view's bounds, asked for on the main thread.
pub(crate) async fn take_snapshot<R: Runtime>(webview: &Webview<R>) -> Result<Snapshot, PageError> {
    let (done, taken) = oneshot::channel();
    webview.with_webview(move |platform| {
        // SAFETY: on macOS `inner()` is the webview's WKWebView, which Tauri
        // keeps alive while this closure runs on the main thread.
        let view = unsafe { &*platform.inner().cast::<WKWebView>() };
        let points = view.bounds().size.width;
        let done = Cell::new(Some(done));
        let answered = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
            // SAFETY: WebKit hands the handler an image or an error, each valid for the call.
            let answer = match unsafe { (image.as_ref(), error.as_ref()) } {
                (Some(image), _) => image_of(image, points),
                (None, Some(error)) => Err(PageError::Snapshot(error.localizedDescription().to_string())),
                (None, None) => Err(PageError::NotAnImage),
            };
            if let Some(done) = done.take() {
                let _ = done.send(answer);
            }
        });
        // SAFETY: no configuration snapshots the view's bounds after the screen's updates.
        unsafe { view.takeSnapshotWithConfiguration_completionHandler(None, &answered) };
    })?;
    taken.await.map_err(|_| PageError::SnapshotDropped)?
}
```

<a name="chunk-mac-image"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#mac-image`</sub>

```rust {#mac-image}
/// The image's pixels as premultiplied BGRA rows in its own colour space, its
/// PNG, and its scale over `points`, the view's width.
fn image_of(image: &NSImage, points: f64) -> Result<Snapshot, PageError> {
    // SAFETY: a null rect asks for the image's own best representation.
    let cg = unsafe { image.CGImageForProposedRect_context_hints(std::ptr::null_mut(), None, None) }.ok_or(PageError::NotAnImage)?;
    let (width, height) = (CGImage::width(Some(&cg)), CGImage::height(Some(&cg)));
    let stride = width * 4;
    let mut bgra = vec![0u8; stride * height];
    let info = CGImageAlphaInfo::PremultipliedFirst.0 | CGImageByteOrderInfo::Order32Little.0;
    let space = CGImage::color_space(Some(&cg));
    // SAFETY: `bgra` holds `stride * height` bytes and outlives the context.
    let context = unsafe { CGBitmapContextCreate(bgra.as_mut_ptr().cast::<c_void>(), width, height, 8, stride, space.as_deref(), info) }
        .ok_or(PageError::NotAnImage)?;
    let whole = CGRect::new(CGPoint::ZERO, CGSize::new(width as f64, height as f64));
    CGContext::draw_image(Some(&context), whole, Some(&cg));
    drop(context);
    let rep = NSBitmapImageRep::initWithCGImage(NSBitmapImageRep::alloc(), &cg);
    // SAFETY: a PNG takes no properties.
    let png = unsafe { rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new()) }
        .ok_or_else(|| PageError::Png("AppKit made no PNG of the snapshot".into()))?;
    let scale = width as f64 / points.max(1.0);
    Ok(Snapshot { width: width as u32, height: height as u32, stride: stride as u32, scale, bgra, png: png.to_vec() })
}
```

<a name="chunk-mac-snapshot-file"></a><sub>[`src/snapshot_macos.rs`](../../crates/x0k-ui-tauri/src/snapshot_macos.rs) · `#mac-snapshot-file` · assembles [snapshot-type](#chunk-snapshot-type) · [mac-snapshot](#chunk-mac-snapshot) · [mac-image](#chunk-mac-image)</sub>

```rust {#mac-snapshot-file file="src/snapshot_macos.rs"}
//! The platform's capture on macOS: `WKWebView.takeSnapshot(with:completionHandler:)`.
use std::cell::Cell;
use std::ffi::c_void;

use block2::RcBlock;
use objc2::AnyThread;
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_core_graphics::{CGBitmapContextCreate, CGContext, CGImage, CGImageAlphaInfo, CGImageByteOrderInfo};
use objc2_foundation::{NSDictionary, NSError};
use objc2_web_kit::WKWebView;
use tauri::{Runtime, Webview};
use tokio::sync::oneshot;

use crate::page::PageError;

<<snapshot-type>>

<<mac-snapshot>>

<<mac-image>>
```

### Input, as AppKit hands it to the view

WebKit has no public call on macOS that injects input either. Its own
automation (Safari's WebDriver) makes `NSEvent`s and hands them to AppKit, and
the plugin does the same: each event is an `NSEvent` made with the public
constructors, handed to the `WKWebView`'s own responder method, `mouseDown:`,
`keyDown:`, `scrollWheel:` and the rest, as the window hands a person's event
to the view under it. WebKit then makes from it the native event a person's
makes, sends it to the page, and the page's hit-testing and focus decide its
target, and its events arrive trusted.

The plugin hands each event to the view, not to the window's `sendEvent:`.
The window's dispatch first asks whether the app is active and its window key.
In an app that is not frontmost, a window's first click only activates it,
so input from a driver would depend on where the person's focus is, and taking
the focus would take it from them. Before a mouse down, the plugin makes the
view its window's first responder, which is what the window's dispatch does
for the view a click lands in, so a click then key events reach the same
view.

**Units.** A position arrives in the named frame's capture pixels, and the
capture's scale is its pixels per view point (`Snapshot::scale`), so a
position over the scale is in view points from the page's top left. The page
does not always begin at the view's top left. Tauri's window runs its view
under the title bar, and WebKit lays the page out below the view's top safe
area inset, so a 300-point view under a 28-point title bar shows a page 272
CSS pixels tall, and the snapshot is of the page alone. So the plugin adds the
view's `safeAreaInsets` before it converts. Without them, every click on the
Mac landed 28 points above its mark. AppKit's window coordinates have their
origin at the bottom left. The plugin converts
with the view's own `convertPoint:toView:`, after flipping the point when the
view is not flipped, so the conversion holds whichever way a view's axis
runs. A wheel delta in capture pixels over the scale is in points, which
WebKit scrolls one to one for a precise (trackpad) wheel event.

**Events.** A mouse move is `mouseMoved`, or `mouseDragged` and its right and
other kinds while a button is held. A button down and up is the left, right
or other kind for the protocol's buttons 0, 2 and 1. A key is a key down and a
key up whose characters are the key's text: the character itself, or the
function-key character AppKit gives a named key. A modifier key is a
`flagsChanged` event, and its flag marks every event after it until it is
released. A key's code is AppKit's virtual key code on a US layout for the
named keys, the letters and the digits, and 0 for any other character, whose
`code` in the page is then not meaningful. NSEvent has no public constructor
for a wheel event, so a wheel is a CoreGraphics pixel wheel event made from a
mouse move at the point, and read back as an `NSEvent` (below).

As on Linux, only `mouse`, `key` and `wheel` sources are delivered. A `pen` or
a `touch` source is refused by name before any of the sequence runs: a
WKWebView on macOS takes no touch. The ticks are the protocol's, as on Linux;
what the plugin adds is each event's AppKit form. AppKit's `flagsChanged`
carries the flags after the key's own change, so a modifier key's event adds
or removes its flag from what the tick says is held before it.

<a name="chunk-mac-input-events"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#mac-input-events`</sub>

```rust {#mac-input-events}
/// One event to synthesize, in view points from the view's top left, with
/// AppKit's modifier flags.
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Synth {
    Mouse { kind: NSEventType, x: f64, y: f64, flags: NSEventModifierFlags },
    Key { kind: NSEventType, code: u16, characters: String, flags: NSEventModifierFlags },
    Scroll { x: f64, y: f64, dx: f64, dy: f64, flags: NSEventModifierFlags },
}

/// One tick: every source's step at it, and how long its longest pause holds it.
#[derive(Debug, Default, PartialEq)]
pub(crate) struct Tick {
    pub events: Vec<Synth>,
    pub pause_ms: u32,
}

/// The source kinds AppKit delivers into a WKWebView: it takes no touch or pen.
const DELIVERED: &[&str] = &["mouse", "key", "wheel"];

/// `perform` as ticks of events in view points, or why none of it may run.
pub(crate) fn appkit_ticks(perform: &Perform, resolved: &[Resolved], scale: f64) -> Result<Vec<Tick>, PageError> {
    if let Some(source) = undeliverable(perform, DELIVERED) {
        return Err(PageError::UndeliverableSource(source.kind.clone()));
    }
    let ticks = input::ticks(perform, resolved, scale)?;
    Ok(ticks.iter().map(|tick| Tick { events: tick.events.iter().map(synth).collect(), pause_ms: tick.pause_ms }).collect())
}

/// One event of a tick as AppKit's. A modifier key is a `flagsChanged` event,
/// whose flags are those after its own change.
pub(crate) fn synth(event: &Event) -> Synth {
    match event {
        Event::Move { x, y, held, .. } => Synth::Mouse { kind: moved(held.lowest_button().map(u32::from)), x: *x, y: *y, flags: flags(held) },
        Event::Press { button, x, y, held, .. } | Event::Release { button, x, y, held, .. } => {
            let kind = pressed(u32::from(*button), matches!(event, Event::Press { .. }));
            Synth::Mouse { kind, x: *x, y: *y, flags: flags(held) }
        }
        Event::KeyDown { key, held } | Event::KeyUp { key, held } => {
            let press = matches!(event, Event::KeyDown { .. });
            let (code, characters, modifier) = appkit_key(key);
            if modifier.is_empty() {
                let kind = if press { NSEventType::KeyDown } else { NSEventType::KeyUp };
                Synth::Key { kind, code, characters, flags: flags(held) }
            } else {
                let after = if press { flags(held) | modifier } else { flags(held) - modifier };
                Synth::Key { kind: NSEventType::FlagsChanged, code, characters: String::new(), flags: after }
            }
        }
        Event::Scroll { x, y, delta_x, delta_y, held, .. } => Synth::Scroll { x: *x, y: *y, dx: *delta_x, dy: *delta_y, flags: flags(held) },
    }
}

/// What a sequence holds, as AppKit's modifier flags.
fn flags(held: &Held) -> NSEventModifierFlags {
    let keys = [
        (input::SHIFT, NSEventModifierFlags::Shift),
        (input::CONTROL, NSEventModifierFlags::Control),
        (input::ALT, NSEventModifierFlags::Option),
        (input::META, NSEventModifierFlags::Command),
    ];
    keys.iter().filter(|(bit, _)| held.modifiers & bit != 0).fold(NSEventModifierFlags::empty(), |all, (_, flag)| all | *flag)
}

/// A move's kind while `held`, the lowest button held, is down.
fn moved(held: Option<u32>) -> NSEventType {
    match held {
        None => NSEventType::MouseMoved,
        Some(0) => NSEventType::LeftMouseDragged,
        Some(2) => NSEventType::RightMouseDragged,
        Some(_) => NSEventType::OtherMouseDragged,
    }
}

/// A button's down or up, for the protocol's buttons: 0 left, 1 middle, 2 right.
fn pressed(button: u32, press: bool) -> NSEventType {
    match (button, press) {
        (0, true) => NSEventType::LeftMouseDown,
        (0, false) => NSEventType::LeftMouseUp,
        (2, true) => NSEventType::RightMouseDown,
        (2, false) => NSEventType::RightMouseUp,
        (_, true) => NSEventType::OtherMouseDown,
        (_, false) => NSEventType::OtherMouseUp,
    }
}
```

A named key maps to AppKit's virtual key code and the character AppKit gives
it. A character maps to itself, with its key's code on a US layout where it
has one.

<a name="chunk-mac-input-keys"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#mac-input-keys`</sub>

```rust {#mac-input-keys}
/// A protocol key's virtual key code, its characters, and the modifier it holds down.
fn appkit_key(key: &str) -> (u16, String, NSEventModifierFlags) {
    let none = NSEventModifierFlags::empty();
    let named = |code: u16, character: char| (code, character.to_string(), none);
    match key {
        "Alt" => (58, String::new(), NSEventModifierFlags::Option),
        "Control" => (59, String::new(), NSEventModifierFlags::Control),
        "Meta" => (55, String::new(), NSEventModifierFlags::Command),
        "Shift" => (56, String::new(), NSEventModifierFlags::Shift),
        "ArrowDown" => named(125, '\u{F701}'),
        "ArrowLeft" => named(123, '\u{F702}'),
        "ArrowRight" => named(124, '\u{F703}'),
        "ArrowUp" => named(126, '\u{F700}'),
        "Backspace" => named(51, '\u{7F}'),
        "Delete" => named(117, '\u{F728}'),
        "End" => named(119, '\u{F72B}'),
        "Enter" => named(36, '\r'),
        "Escape" => named(53, '\u{1B}'),
        "Home" => named(115, '\u{F729}'),
        "PageDown" => named(121, '\u{F72D}'),
        "PageUp" => named(116, '\u{F72C}'),
        "Space" => named(49, ' '),
        "Tab" => named(48, '\t'),
        "F1" => named(122, '\u{F704}'),
        "F2" => named(120, '\u{F705}'),
        "F3" => named(99, '\u{F706}'),
        "F4" => named(118, '\u{F707}'),
        "F5" => named(96, '\u{F708}'),
        "F6" => named(97, '\u{F709}'),
        "F7" => named(98, '\u{F70A}'),
        "F8" => named(100, '\u{F70B}'),
        "F9" => named(101, '\u{F70C}'),
        "F10" => named(109, '\u{F70D}'),
        "F11" => named(103, '\u{F70E}'),
        "F12" => named(111, '\u{F70F}'),
        character => (us_key_code(character), character.to_string(), none),
    }
}

/// The virtual key code of a letter, a digit or a space on a US layout, or 0.
fn us_key_code(character: &str) -> u16 {
    const LETTERS: [u16; 26] = [0, 11, 8, 2, 14, 3, 5, 4, 34, 38, 40, 37, 46, 45, 31, 35, 12, 15, 1, 17, 32, 9, 13, 7, 16, 6];
    const DIGITS: [u16; 10] = [29, 18, 19, 20, 21, 23, 22, 26, 28, 25];
    match character.chars().next().map(|c| c.to_ascii_lowercase()) {
        Some(c @ 'a'..='z') => LETTERS[(c as u8 - b'a') as usize],
        Some(c @ '0'..='9') => DIGITS[(c as u8 - b'0') as usize],
        Some(' ') => 49,
        _ => 0,
    }
}
```

Delivery runs on the main thread, through `with_webview`, one tick at a time.

<a name="chunk-mac-input-deliver"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#mac-input-deliver`</sub>

```rust {#mac-input-deliver}
/// Deliver one tick's events to the WKWebView on the main thread.
pub(crate) async fn deliver<R: Runtime>(webview: &Webview<R>, events: Vec<Synth>) -> Result<(), PageError> {
    if events.is_empty() {
        return Ok(());
    }
    let (done, delivered) = oneshot::channel();
    webview.with_webview(move |platform| {
        // SAFETY: on macOS `inner()` is the webview's WKWebView, which Tauri
        // keeps alive while this closure runs on the main thread.
        let view = unsafe { &*platform.inner().cast::<WKWebView>() };
        let _ = done.send(synthesize(view, &events));
    })?;
    delivered.await.map_err(|_| PageError::InputDropped)?
}

/// Make each event with AppKit's constructors, and hand it to the view's own
/// responder method, as the window hands it a person's.
fn synthesize(view: &WKWebView, events: &[Synth]) -> Result<(), PageError> {
    let window = view.window().ok_or(PageError::NoWindow)?;
    let number = window.windowNumber();
    let time = NSProcessInfo::processInfo().systemUptime();
    let bounds = view.bounds();
    // The page, and its capture, begin inside the view's safe area: below a
    // title bar the view runs under.
    let inset = view.safeAreaInsets();
    let in_window = |x: f64, y: f64| {
        let (x, y) = (x + inset.left, y + inset.top);
        let y = if view.isFlipped() { y } else { bounds.size.height - y };
        view.convertPoint_toView(NSPoint::new(x, y), None)
    };
    for event in events {
        match event {
            Synth::Mouse { kind, x, y, flags } => {
                let down = [NSEventType::LeftMouseDown, NSEventType::RightMouseDown, NSEventType::OtherMouseDown].contains(kind);
                let made = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
                    *kind, in_window(*x, *y), *flags, time, number, None, 0, 1, if down { 1.0 } else { 0.0 },
                )
                .ok_or(PageError::InputDropped)?;
                if down {
                    window.makeFirstResponder(Some(view.as_ref()));
                }
                mouse(view, *kind, &made);
            }
            Synth::Key { kind, code, characters, flags } => {
                let characters = NSString::from_str(characters);
                let made = NSEvent::keyEventWithType_location_modifierFlags_timestamp_windowNumber_context_characters_charactersIgnoringModifiers_isARepeat_keyCode(
                    *kind, NSPoint::new(0.0, 0.0), *flags, time, number, None, &characters, &characters, false, *code,
                )
                .ok_or(PageError::InputDropped)?;
                match *kind {
                    NSEventType::KeyDown => view.keyDown(&made),
                    NSEventType::KeyUp => view.keyUp(&made),
                    _ => view.flagsChanged(&made),
                }
            }
            Synth::Scroll { x, y, dx, dy, flags } => {
                let made = wheel(in_window(*x, *y), number, time, *dx, *dy, *flags)?;
                view.scrollWheel(&made);
            }
        }
    }
    Ok(())
}

/// Hand a mouse event to the responder method its kind names.
fn mouse(view: &WKWebView, kind: NSEventType, event: &NSEvent) {
    match kind {
        NSEventType::LeftMouseDown => view.mouseDown(event),
        NSEventType::LeftMouseUp => view.mouseUp(event),
        NSEventType::RightMouseDown => view.rightMouseDown(event),
        NSEventType::RightMouseUp => view.rightMouseUp(event),
        NSEventType::OtherMouseDown => view.otherMouseDown(event),
        NSEventType::OtherMouseUp => view.otherMouseUp(event),
        NSEventType::LeftMouseDragged => view.mouseDragged(event),
        NSEventType::RightMouseDragged => view.rightMouseDragged(event),
        NSEventType::OtherMouseDragged => view.otherMouseDragged(event),
        _ => view.mouseMoved(event),
    }
}
```

A wheel event takes its window and its place from the event it is made from.
So the plugin makes a mouse move at the point, in the view's window, takes
the CoreGraphics event under it, makes that a continuous (pixel) wheel event,
and reads it back as an `NSEvent`. A wheel event made by CoreGraphics alone
has no window, and WebKit hands the page none of it. A wheel's positive delta
scrolls the content up toward its start in AppKit and down in the DOM, so the
delta goes in negated.

<a name="chunk-mac-input-wheel"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#mac-input-wheel`</sub>

```rust {#mac-input-wheel}
/// A precise wheel event at `at`, a point in the window numbered `number`,
/// scrolling `dx`, `dy` points.
fn wheel(at: NSPoint, number: isize, time: f64, dx: f64, dy: f64, flags: NSEventModifierFlags) -> Result<Retained<NSEvent>, PageError> {
    let moved = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
        NSEventType::MouseMoved, at, flags, time, number, None, 0, 0, 0.0,
    )
    .ok_or(PageError::InputDropped)?;
    let made = moved.CGEvent().ok_or(PageError::InputDropped)?;
    CGEvent::set_type(Some(&made), CGEventType::ScrollWheel);
    CGEvent::set_integer_value_field(Some(&made), CGEventField::ScrollWheelEventIsContinuous, 1);
    for (axis, points) in [(1, -dy), (2, -dx)] {
        let (lines, fixed, pixels) = if axis == 1 {
            (CGEventField::ScrollWheelEventDeltaAxis1, CGEventField::ScrollWheelEventFixedPtDeltaAxis1, CGEventField::ScrollWheelEventPointDeltaAxis1)
        } else {
            (CGEventField::ScrollWheelEventDeltaAxis2, CGEventField::ScrollWheelEventFixedPtDeltaAxis2, CGEventField::ScrollWheelEventPointDeltaAxis2)
        };
        CGEvent::set_integer_value_field(Some(&made), lines, (points / PIXELS_PER_LINE).round() as i64);
        CGEvent::set_double_value_field(Some(&made), fixed, points);
        CGEvent::set_integer_value_field(Some(&made), pixels, points.round() as i64);
    }
    NSEvent::eventWithCGEvent(&made).ok_or(PageError::InputDropped)
}

/// How many points of scroll one line of a wheel is, for the event's line delta.
const PIXELS_PER_LINE: f64 = 10.0;
```

One test holds the part a mistake would hide in, as on Linux: a position
reaches the view divided by the capture's scale, a held button and a held
modifier mark the events after them, and a source the plugin cannot deliver
refuses the whole sequence.

<a name="chunk-mac-input-tests"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#mac-input-tests`</sub>

```rust {#mac-input-tests}
#[cfg(test)]
mod tests {
    use super::*;
    use x0k_ui_protocol::input::{Source, Step, Target};

    fn at(x: f64, y: f64) -> Target {
        Target::Pixel { frame: "7".into(), x, y }
    }

    #[test]
    fn positions_reach_the_view_divided_by_the_scale_and_held_input_marks_what_follows() {
        let mouse = Source {
            id: "m".into(),
            kind: "mouse".into(),
            steps: vec![Step::Move { to: at(200.0, 100.0) }, Step::Down { button: 0 }, Step::Move { to: at(300.0, 100.0) }],
        };
        let keys = Source { id: "k".into(), kind: "key".into(), steps: vec![Step::KeyDown { key: "Shift".into() }] };
        let perform = Perform::of(vec![mouse, keys]);
        let resolved = [
            Resolved { source: "m".into(), step: 0, x: 200.0, y: 100.0 },
            Resolved { source: "m".into(), step: 2, x: 300.0, y: 100.0 },
        ];
        let ticks = appkit_ticks(&perform, &resolved, 2.0).unwrap();
        let none = NSEventModifierFlags::empty();
        let shift = NSEventModifierFlags::Shift;
        assert_eq!(ticks[0].events[0], Synth::Mouse { kind: NSEventType::MouseMoved, x: 100.0, y: 50.0, flags: none });
        assert_eq!(ticks[0].events[1], Synth::Key { kind: NSEventType::FlagsChanged, code: 56, characters: String::new(), flags: shift });
        assert_eq!(ticks[1].events[0], Synth::Mouse { kind: NSEventType::LeftMouseDown, x: 100.0, y: 50.0, flags: shift });
        assert_eq!(ticks[2].events[0], Synth::Mouse { kind: NSEventType::LeftMouseDragged, x: 150.0, y: 50.0, flags: shift });
    }

    #[test]
    fn a_touch_source_refuses_the_whole_sequence_by_name() {
        let touch = Source { id: "t".into(), kind: "touch".into(), steps: vec![Step::Pause { ms: 1 }] };
        let refused = appkit_ticks(&Perform::of(vec![touch]), &[], 1.0).unwrap_err();
        assert_eq!(refused.to_string(), "a touch source cannot be delivered into this webview");
    }
}
```

<a name="chunk-mac-input-file"></a><sub>[`src/input_macos.rs`](../../crates/x0k-ui-tauri/src/input_macos.rs) · `#mac-input-file` · assembles [mac-input-events](#chunk-mac-input-events) · [mac-input-keys](#chunk-mac-input-keys) · [mac-input-deliver](#chunk-mac-input-deliver) · [mac-input-wheel](#chunk-mac-input-wheel) · [mac-input-tests](#chunk-mac-input-tests)</sub>

```rust {#mac-input-file file="src/input_macos.rs"}
//! Input into the page through the platform's input path on macOS: NSEvents
//! made with AppKit's constructors and handed to the WKWebView's own
//! responder methods, as the window hands it a person's.
use objc2::rc::Retained;
use objc2_app_kit::{NSEvent, NSEventModifierFlags, NSEventType};
use objc2_core_graphics::{CGEvent, CGEventField, CGEventType};
use objc2_foundation::{NSPoint, NSProcessInfo, NSString};
use objc2_web_kit::WKWebView;
use tauri::{Runtime, Webview};
use tokio::sync::oneshot;
use x0k_ui_protocol::input::{self, undeliverable, Event, Held, Perform, Resolved};

use crate::page::PageError;

<<mac-input-events>>

<<mac-input-keys>>

<<mac-input-deliver>>

<<mac-input-wheel>>

<<mac-input-tests>>
```

## Drawing a driver's input

A Tauri app's host draws each sequence of input it delivers over the page,
labelled with who sent it (`x0k:architecture/ui-control-channel` §10), as the
shell does. What is drawn is the protocol's `InputPresentation`
(`x0k:implementation/ui-control/protocol`, "What a host draws of input"), one
per page, in the view's units: the capture's pixels over its scale.

The plugin draws it on the in-page library's drawing layer
(`x0k:implementation/ui-control/page-hold`, "The host's drawing layer"). At
each paint it sends the presentation as it stands to the layer's `paint`, with
the view's width in its units as the last capture measured it, and the layer
places it in CSS pixels. The layer is in the page's document but is none of the
page's state: the epoch, the layout walk and every hit test pass it by. So one
drawing serves both who see it. A person at the window sees it, and a capture
shows it as the person saw it, since the snapshot paints the page's document.
A call for the frame alone holds the page with the layer hidden, so its capture
shows the page alone. A capture says whether it carries the drawing.

How it is drawn is the page's look, which the app declares when it installs
the library (`x0k:implementation/ui-control/page-answer`): its palette, the
pointer's shape, the ring, captions, the label's size and the names its labels
give requesters. The plugin sends each mark with its requester's colour index
from the presentation, so two drivers in one window take two colours, and the
layer picks the colour from the look. An app that declares no look is drawn in
the host's default one.

The drawing waits for nothing: `perform` draws each event as it delivers it,
then a task prunes what has faded and paints again every `FADE_STEP`, until
nothing is left. At the watchable pace a move travels its watchable way, drawn
and delivered at each point, and a press and a key wait `WATCHABLE_PRESS_MS`
before they land.

<a name="chunk-page-drawing"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#page-drawing`</sub>

```rust {#page-drawing}
/// Whether a capture of the page held now carries the drawing of drivers'
/// input: it does unless the call asks for the frame alone or nothing is drawn.
pub fn presents(&self, frame_only: bool) -> bool {
    !frame_only && self.presentation.lock().unwrap_or_else(PoisonError::into_inner).shows_anything()
}

/// Draw one event of `requester`'s over the page.
fn draw(&self, requester: &str, event: &Event) {
    self.presentation.lock().unwrap_or_else(PoisonError::into_inner).show(requester, event, Instant::now());
    paint_drawn(&self.webview, &self.presentation, &self.units);
}

/// Prune and paint the drawing until it has faded, in one task at a time.
fn keep_fading(&self) {
    if self.fading.swap(true, Ordering::SeqCst) {
        return;
    }
    let (webview, presentation, fading, units) = (self.webview.clone(), self.presentation.clone(), self.fading.clone(), self.units.clone());
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(FADE_STEP).await;
            let still = presentation.lock().unwrap_or_else(PoisonError::into_inner).prune(Instant::now());
            paint_drawn(&webview, &presentation, &units);
            if !still {
                fading.store(false, Ordering::SeqCst);
                return;
            }
        }
    });
}

/// At the watchable pace, before `event` lands: a move travels its watchable
/// way from where its source last was, drawn and delivered at each point, and
/// a press or a key waits `WATCHABLE_PRESS_MS`.
async fn travel(&self, requester: &str, event: &Event, last: &mut HashMap<String, (f64, f64)>) -> Result<(), PageError> {
    match event {
        Event::Move { source, x, y, held } => {
            let from = last.insert(source.clone(), (*x, *y)).unwrap_or((*x, *y));
            let (way, each) = watchable_way(from, (*x, *y));
            for (wx, wy) in way {
                let step = Event::Move { source: source.clone(), x: wx, y: wy, held: *held };
                self.draw(requester, &step);
                crate::input::deliver(&self.webview, vec![crate::input::synth(&step)]).await?;
                tokio::time::sleep(each).await;
            }
        }
        Event::Press { .. } | Event::KeyDown { .. } => tokio::time::sleep(Duration::from_millis(WATCHABLE_PRESS_MS)).await,
        _ => {}
    }
    Ok(())
}
```

A paint is one script the page runs: the layer's `paint` with the drawing as
JSON. Tauri's `eval` sends it from any thread and answers nothing, so a paint
never waits on the page. A page that has not installed the library yet paints
nothing.

<a name="chunk-paint-drawn"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#paint-drawn`</sub>

```rust {#paint-drawn}
/// Paint `presentation` on the in-page library's drawing layer, in the view's
/// units, the view being `units` wide (an `f64`'s bits).
fn paint_drawn<R: Runtime>(webview: &Webview<R>, presentation: &Shared, units: &AtomicU64) {
    let now = Instant::now();
    let drawing = {
        let mut shown = presentation.lock().unwrap_or_else(PoisonError::into_inner);
        let (pointers, clicks, keys) = (shown.pointers().cloned().collect::<Vec<_>>(), shown.clicks().to_vec(), shown.keys().cloned());
        serde_json::json!({
            "units": f64::from_bits(units.load(Ordering::SeqCst)),
            "pointers": pointers.iter().map(|p| serde_json::json!({ "requester": p.requester, "at": p.at, "pressed": p.pressed, "hue": shown.hue(&p.requester) })).collect::<Vec<_>>(),
            "clicks": clicks.iter().map(|c| serde_json::json!({ "at": c.at, "gone": faded(c.since, now, MARK_FOR), "hue": shown.hue(&c.requester) })).collect::<Vec<_>>(),
            "keys": keys.map(|k| serde_json::json!({ "requester": k.requester, "text": k.text, "gone": faded(k.since, now, MARK_FOR), "hue": shown.hue(&k.requester) })),
        })
    };
    if let Err(error) = webview.eval(format!("globalThis.{PAGE_GLOBAL}?.drawn.paint({drawing});")) {
        tracing::debug!(%error, "ui_tauri.drawn.unpainted");
    }
}
```

## The endpoint

The plugin serves the page as the app's UI-control endpoint, so any driver
that speaks the endpoint drives a Tauri app as it drives x0k's shell. It binds
the socket where every endpoint binds (`endpoint_socket_path`, above), and serves it
with `x0k-ui-endpoint`, so the endpoint's checks run before the page hears a
call: an action the offer
does not list, arguments that misfit, input that names no held frame are all
refused there. The requester of each call is the socket peer's credentials,
which the endpoint reads when it accepts the connection (`ui-interfaces` §6).
The page never names it.

The app the endpoint holds is `PageApp`. It asks the page over the nonce IPC
above for what the library gives a host
(`x0k:implementation/ui-control/page-answer`, "What a page gives its host"):
what it declares, `__x0kUi.declared()`, what it reads, and the run of an
action, `__x0kUi.run(name, args)`. It makes the protocol's values from them
natively, with `x0k-ui-protocol`'s page module: the offer with `page_offer`,
and the state part with `state_part`. The endpoint checks every call against
that offer, with the connection's real grant, before `PageApp` hears it, so the
plugin makes no page checks of its own and runs an action the endpoint let
through, and the page loads no WebAssembly. Three things the page cannot do
alone, the plugin adds.

- **The offer names `ui/input`.** A page's offer names `ui/observe` and
  `ui/act`, since a page alone delivers no input. The plugin delivers it, so its
  offer adds `ui/input`.
- **An observation holds the page around a native capture.** The plugin holds
  the page with the library's reader for the call, `__x0kUi.read(call)`, takes
  the snapshot while it is held, and verifies, through the loop above. It pins
  the state the page read with `state_part` before the observation is built.
- **Input is delivered through the platform's input path**, GTK's on Linux and
  AppKit's on macOS, at the scale of the frame it names, and drawn over the
  page for its requester (above, "Drawing a driver's input"), so the offer
  says the host presents input. It holds no takeover yet, so the endpoint
  refuses one as `takeover_unheld`. A capture carries the drawing unless the
  call asks for the frame alone, when the page is held with it hidden.

**Which side builds the observation.** The page does, with the library's
`observation(held, call)` in `src/observation.ts`, which places each layout node
in the capture's pixels and says which parts are refused. The plugin's Rust
builds none of it. The rule that turns a CSS box into capture pixels is the
library's, and the library's own hosts use the same function, so a second
copy in Rust would be a second place for it to drift. The pixels stay native:
the plugin hands the page the held read and the capture's size, the page
answers the observation with an empty PNG, and the plugin puts in the PNG it
took. The plugin reaches the function on the library's global,
`__x0kUi.observation(held, call)`, as it reaches `read`, so the page runs
nothing of the plugin's own. The same request answers the frame's layout, since
input to that frame resolves against its layout whether or not the call asked
for it, and `wholeCaptureOnly`'s reason when the call names a region or a
scale. The cost is one more round trip to the page per observation, which
carries the read back to it.

Every observation is held and captured, even one that asks only for the layout
or the state. So every frame the plugin answers is a capture's, its pixels are
that capture's, and its scale is known. A call that asks for no capture drops
the pixels. A call that names a region or a scale is refused its capture by
name, `wholeCaptureOnly`'s reason, as the library's own hosts refuse it, and its
other parts are answered.

<a name="chunk-endpoint-app"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#endpoint-app`</sub>

```rust {#endpoint-app}
/// A frame input may name, and its capture's pixels per widget unit.
#[derive(Clone, Debug)]
struct Kept {
    frame: HeldFrame,
    scale: f64,
}

/// A webview's page as the endpoint's app: its offer and state made of what
/// the page declares and reads, its actions run over the plugin's IPC, the
/// capture taken natively, and input delivered through the platform's input path.
pub struct PageApp<R: Runtime> {
    page: PageHost<R>,
    /// The frames input may name, oldest first.
    kept: Mutex<VecDeque<Kept>>,
    /// The platform delivers one sequence at a time.
    input_turn: tokio::sync::Mutex<()>,
}

/// What the library answers for one held observation: the observation of the
/// call, the frame's layout, and why the call's capture cannot be answered,
/// when it cannot.
#[derive(serde::Deserialize)]
struct Observed {
    observation: Observation,
    layout: Option<LayoutNode>,
    cannot: Option<String>,
}

/// The request that builds one held observation with the library's own
/// functions: the capture's pixels stay native, so its PNG is empty here.
fn observed_script(held_json: &str, call_json: &str) -> String {
    format!(
        "const ui = globalThis.{UI_GLOBAL}, held = {held_json}, call = {call_json};\n\
         if (held.capture) held.capture.png = [];\n\
         const cannot = call.parts.includes('capture') ? ui.wholeCaptureOnly(call) : undefined;\n\
         return JSON.stringify({{ observation: ui.observation(held, call), layout: ui.observation(held, {{ parts: ['layout'] }}).layout, cannot }});"
    )
}

impl<R: Runtime> PageApp<R> {
    pub fn new(webview: Webview<R>) -> Self {
        Self { page: PageHost::new(webview), kept: Mutex::default(), input_turn: tokio::sync::Mutex::new(()) }
    }

    /// What the page's `expression`, one of the library's calls, answers.
    async fn ask<T: DeserializeOwned>(&self, expression: &str) -> Result<T, PageError> {
        let answered = self.page.evaluate(&format!("return JSON.stringify(await globalThis.{UI_GLOBAL}.{expression});")).await?;
        serde_json::from_str(&answered).map_err(|e| PageError::Malformed(e.to_string()))
    }

    /// One observation: the library's read for `call` held around the native
    /// capture, built into the answer by the library's `observation`.
    async fn observed(&self, call: &ObserveCall) -> Result<Observation, PageError> {
        let malformed = |e: serde_json::Error| PageError::Malformed(e.to_string());
        let call_json = serde_json::to_string(call).map_err(malformed)?;
        let read = format!("globalThis.{UI_GLOBAL}.read({call_json})");
        let mut held = held_capture(&mut PageHold::new(&self.page, &read).frame_only(call.frame_only), HOLD_TRIES).await?;
        if let Some(state) = held.read.get_mut("state").filter(|state| !state.is_null()) {
            let declared: DeclaredState = serde_json::from_value(state.take()).map_err(malformed)?;
            *state = serde_json::to_value(state_part(declared)).map_err(malformed)?;
        }
        let held_json = serde_json::to_string(&held).map_err(malformed)?;
        let answered = self.page.evaluate(&observed_script(&held_json, &call_json)).await?;
        let Observed { mut observation, layout, cannot } = serde_json::from_str(&answered).map_err(malformed)?;
        if let Some(why) = cannot {
            observation.capture = None;
            observation.refused.retain(|refused| refused.part != Part::Capture);
            observation.refused.push(PartRefused { part: Part::Capture, why });
        }
        if let Some(snapshot) = &held.capture {
            if let Some(capture) = observation.capture.as_mut() {
                (capture.png, capture.presented) = (snapshot.png.clone(), self.page.presents(call.frame_only));
            }
            let frame = HeldFrame { frame: held.frame.clone(), width: snapshot.width, height: snapshot.height, layout };
            self.keep(Kept { frame, scale: snapshot.scale });
        }
        Ok(observation)
    }

    /// Input may name this frame, until `HELD_FRAMES` newer ones replace it.
    fn keep(&self, kept: Kept) {
        let mut frames = self.kept.lock().expect("the held frames");
        frames.retain(|known| known.frame.frame != kept.frame.frame);
        if frames.len() == HELD_FRAMES {
            frames.pop_front();
        }
        frames.push_back(kept);
    }

    fn kept(&self) -> Vec<Kept> {
        self.kept.lock().expect("the held frames").iter().cloned().collect()
    }
}
```

The offer is the page's, made of what it declares, with `ui/input` added. A
page that does not answer leaves an offer that names nothing, so every call to
it is refused by the endpoint's checks.

<a name="chunk-endpoint-offer"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#endpoint-offer`</sub>

```rust {#endpoint-offer}
async fn offer(&self) -> Offer {
    let input = interfaces().into_iter().filter(|interface| interface.name == UI_INPUT);
    match self.ask::<Declared>("declared()").await.map(page_offer) {
        Ok(mut offer) => {
            offer.interfaces.extend(input);
            offer.input = Some(InputOffer { presents: true, takeover: false });
            offer
        }
        Err(error) => {
            tracing::warn!(%error, "ui_tauri.endpoint.offer_unanswered");
            serde_json::from_value(json!({ "app": "", "instance": "", "interfaces": [] })).expect("an empty offer")
        }
    }
}
```

An observation the page could not answer refuses every part it asked for, with
the reason.

<a name="chunk-endpoint-observe"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#endpoint-observe`</sub>

```rust {#endpoint-observe}
async fn observe(&self, call: ObserveCall) -> Observation {
    match self.observed(&call).await {
        Ok(observation) => observation,
        Err(error) => {
            let why = error.to_string();
            let refused = call.parts.iter().map(|part| PartRefused { part: *part, why: why.clone() }).collect();
            Observation { frame: None, capture: None, layout: None, state: None, refused, shown: Some(Shown::Live) }
        }
    }
}
```

An action reaches the page only after the endpoint found it in the offer and
its arguments fit, so the page runs it. A run answers its outcome and the frame
after it, as the protocol spells an outcome.

<a name="chunk-endpoint-invoke"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#endpoint-invoke`</sub>

```rust {#endpoint-invoke}
async fn invoke(&self, action: &Action, args: Value) -> Outcome {
    let run = format!("run({}, {args})", json!(action.name));
    match self.ask::<Outcome>(&run).await {
        Ok(outcome) => outcome,
        Err(error) => Outcome::Failed { reason: error.to_string(), frame: None },
    }
}
```

**Input.** The frames input may name are the last `HELD_FRAMES` the plugin
observed, each with its layout and its capture's scale, as the shell keeps
eight. The endpoint has run `check_perform` against them before `perform` is
called, so every position is resolved in a held frame's capture pixels. The
plugin then divides by the scale of the frame the sequence names, not by the
newest frame's: a window that moved to a screen of another scale between two
observations has two frames of two scales. A sequence whose positions name two
frames of different scales is not delivered. `perform` answers the page's epoch
after the input settled, which is the first frame that shows it.

<a name="chunk-endpoint-input"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#endpoint-input`</sub>

```rust {#endpoint-input}
async fn held_frames(&self) -> Vec<HeldFrame> {
    self.kept().into_iter().map(|kept| kept.frame).collect()
}

async fn perform(&self, perform: Perform, resolved: Vec<Resolved>) -> Option<String> {
    self.perform_for(UNNAMED, perform, resolved).await
}

async fn perform_for(&self, requester: &str, perform: Perform, resolved: Vec<Resolved>) -> Option<String> {
    let scale = match scale_for(&perform, &self.kept()) {
        Ok(scale) => scale,
        Err(why) => {
            tracing::warn!(%why, "ui_tauri.endpoint.input_undelivered");
            return None;
        }
    };
    let _turn = self.input_turn.lock().await;
    match self.page.perform(requester, &perform, &resolved, scale).await {
        Ok(epoch) => Some(epoch.to_string()),
        Err(error) => {
            tracing::warn!(%error, "ui_tauri.endpoint.input_undelivered");
            None
        }
    }
}
```

<a name="chunk-endpoint-scale"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#endpoint-scale`</sub>

```rust {#endpoint-scale}
/// Why a checked sequence has no one scale to be divided by.
#[derive(Debug, PartialEq, thiserror::Error)]
enum Undivided {
    #[error("frame {0} is not held")]
    NotHeld(String),
    #[error("the sequence names frames captured at different scales")]
    MixedScales,
}

/// The scale `perform`'s positions are divided by: that of the frame they
/// name. A sequence that names no position divides nothing.
fn scale_for(perform: &Perform, kept: &[Kept]) -> Result<f64, Undivided> {
    let named: BTreeSet<&str> = perform
        .sources
        .iter()
        .flat_map(|source| &source.steps)
        .filter_map(|step| match step {
            Step::Move { to } | Step::Scroll { to, .. } => Some(match to {
                Target::Pixel { frame, .. } | Target::Node { frame, .. } => frame.as_str(),
            }),
            _ => None,
        })
        .collect();
    let scale_of = |name: &str| kept.iter().find(|k| k.frame.frame == name).map(|k| k.scale).ok_or(Undivided::NotHeld(name.to_string()));
    let scales = named.into_iter().map(scale_of).collect::<Result<Vec<f64>, Undivided>>()?;
    match scales.split_first() {
        None => Ok(1.0),
        Some((first, rest)) if rest.iter().all(|scale| scale == first) => Ok(*first),
        Some(_) => Err(Undivided::MixedScales),
    }
}
```

**Serving.** The endpoint holds every side-effect class, as the shell's does:
connections carry no grant of their own yet, and the app puts its socket where
only its own user reaches. A socket left
by an app that has gone is replaced; a live one keeps its path and this bind
fails, which the plugin reports and does not retry.

<a name="chunk-endpoint-serve"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#endpoint-serve`</sub>

```rust {#endpoint-serve}
/// Serve `webview`'s page as the app's UI-control endpoint on the unix socket
/// at `path`, until the app ends.
pub async fn serve<R: Runtime>(path: PathBuf, webview: Webview<R>) {
    if let Some(dir) = path.parent() {
        if let Err(error) = std::fs::create_dir_all(dir) {
            return tracing::warn!(path = %path.display(), %error, "ui_tauri.endpoint.unbound");
        }
    }
    let every = Grant { classes: vec![SideEffect::ReadOnly, SideEffect::IdempotentWrite, SideEffect::NonIdempotent] };
    let endpoint = Arc::new(Endpoint::new(PageApp::new(webview), every));
    tracing::info!(path = %path.display(), "ui_tauri.endpoint.listening");
    if let Err(error) = listen(&path, endpoint).await {
        tracing::warn!(path = %path.display(), %error, "ui_tauri.endpoint.unbound");
    }
}
```

One test holds the scale rule: positions that name the older of two held frames
are divided by that frame's scale, and two frames of two scales refuse the
sequence.

<a name="chunk-endpoint-tests"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#endpoint-tests`</sub>

```rust {#endpoint-tests}
#[cfg(test)]
mod tests {
    use super::*;
    use x0k_ui_protocol::input::Source;

    fn kept(frame: &str, scale: f64) -> Kept {
        Kept { frame: HeldFrame { frame: frame.into(), width: 800, height: 600, layout: None }, scale }
    }

    fn moves(frames: &[&str]) -> Perform {
        let steps = frames.iter().map(|frame| Step::Move { to: Target::Pixel { frame: frame.to_string(), x: 1.0, y: 1.0 } }).collect();
        Perform::of(vec![Source { id: "m".into(), kind: "mouse".into(), steps }])
    }

    #[test]
    fn positions_are_divided_by_the_scale_of_the_frame_they_name() {
        let frames = [kept("7", 1.0), kept("9", 2.0)];
        assert_eq!(scale_for(&moves(&["7"]), &frames), Ok(1.0));
        assert_eq!(scale_for(&moves(&["9"]), &frames), Ok(2.0));
        assert_eq!(scale_for(&moves(&["7", "9"]), &frames), Err(Undivided::MixedScales));
    }
}
```

<a name="chunk-endpoint-file"></a><sub>[`src/endpoint.rs`](../../crates/x0k-ui-tauri/src/endpoint.rs) · `#endpoint-file` · assembles [endpoint-app](#chunk-endpoint-app) · [endpoint-offer](#chunk-endpoint-offer) · [endpoint-observe](#chunk-endpoint-observe) · [endpoint-invoke](#chunk-endpoint-invoke) · [endpoint-input](#chunk-endpoint-input) · [endpoint-scale](#chunk-endpoint-scale) · [endpoint-serve](#chunk-endpoint-serve) · [endpoint-tests](#chunk-endpoint-tests)</sub>

```rust {#endpoint-file file="src/endpoint.rs"}
//! The plugin's UI-control endpoint: the page as `x0k-ui-endpoint`'s app,
//! made of what the page declares, reads and runs over the plugin's IPC.
use std::collections::{BTreeSet, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use tauri::{Runtime, Webview};
use x0k_ui_endpoint::server::{listen, Endpoint, UiApp, UNNAMED};
use x0k_ui_protocol::act::{Grant, Outcome};
use x0k_ui_protocol::history::Shown;
use x0k_ui_protocol::input::{HeldFrame, InputOffer, Perform, Resolved, Step, Target};
use x0k_ui_protocol::observe::{LayoutNode, Observation, ObserveCall, Part, PartRefused};
use x0k_ui_protocol::offer::{Action, Offer, SideEffect, UI_INPUT};
use x0k_ui_protocol::page::{page_offer, state_part, Declared, DeclaredState};
use x0k_ui_protocol::shapes::interfaces;

use crate::held::{held_capture, HOLD_TRIES};
use crate::page::{PageError, PageHold, PageHost};

/// How many observed frames input may still name, as the shell keeps.
pub const HELD_FRAMES: usize = 8;
/// The global the library's answers are reached through: its `UI_GLOBAL`.
pub const UI_GLOBAL: &str = "__x0kUi";

<<endpoint-app>>

impl<R: Runtime> UiApp for PageApp<R> {
    <<endpoint-offer>>

    <<endpoint-observe>>

    <<endpoint-invoke>>

    <<endpoint-input>>
}

<<endpoint-scale>>

<<endpoint-serve>>

<<endpoint-tests>>
```

## The probe app

The probe app is the smallest Tauri app the plugin can hold: one window, the
probe page, and a unix socket its test drives it over. It is a binary crate,
because a Tauri app needs a build script of its own, and it is never shipped.

<a name="chunk-probe-manifest"></a><sub>[`probe-app/Cargo.toml`](../../crates/x0k-ui-tauri/probe-app/Cargo.toml) · `#probe-manifest`</sub>

```toml {#probe-manifest file="probe-app/Cargo.toml"}
[package]
name = "x0k-ui-tauri-probe"
version = "0.1.0"
edition = { workspace = true }
license = "MIT"
description = "A minimal Tauri app holding the probe page, for x0k-ui-tauri's probe test."
publish = false
repository = "https://github.com/0k-dot-computer/x0k-ui-control"
readme = "../../../README.md"
keywords = ["ui", "testing", "automation", "agents", "protocol"]

[dependencies]
base64 = "0.22"
serde_json = "1"
tauri = { version = "2.12", default-features = false, features = ["wry", "x11"] }
tokio = { version = "1", features = ["io-util", "macros", "net", "rt", "sync", "time"] }
x0k-ui-protocol = { path = "../../x0k-ui-protocol", version = "0.1.0" }
x0k-ui-tauri = { path = "..", version = "0.1.0" }

[target.'cfg(target_os = "linux")'.dependencies]
# The webview's hardware acceleration policy, and nothing else.
webkit2gtk = "2.0"

[build-dependencies]
tauri-build = { version = "2.7", default-features = false }
```

The app serves the library's test pages, which its build copies into
`pages/` and Tauri embeds. The build finds the library by its `package.json`
in a directory above the app, the rule the probe test uses, so the app builds
wherever the plugin sits. It serves it from the app's own origin, which Tauri
counts as local. A page from any other origin reaches no plugin command
without a capability that names that origin.

<a name="chunk-probe-config"></a><sub>[`probe-app/tauri.conf.json`](../../crates/x0k-ui-tauri/probe-app/tauri.conf.json) · `#probe-config`</sub>

```json {#probe-config file="probe-app/tauri.conf.json"}
{
  "productName": "x0k-ui-tauri-probe",
  "identifier": "computer.x0k.ui-tauri-probe",
  "build": { "frontendDist": "pages" },
  "app": { "windows": [], "withGlobalTauri": false, "security": { "csp": null } },
  "bundle": { "active": false }
}
```

<a name="chunk-probe-capability"></a><sub>[`probe-app/capabilities/default.json`](../../crates/x0k-ui-tauri/probe-app/capabilities/default.json) · `#probe-capability`</sub>

```json {#probe-capability file="probe-app/capabilities/default.json"}
{
  "identifier": "default",
  "description": "The probe window may answer the plugin's requests.",
  "windows": ["probe"],
  "permissions": ["x0k-ui-tauri:default"]
}
```

Tauri's context needs a window icon on Linux. The app shows none, so its build
writes a one-pixel icon before Tauri's build reads it, beside the pages it
copies. Tauri's build also
writes the app's resolved permissions under `gen/`, which stays out of the
repository with the icon.

<a name="chunk-probe-build"></a><sub>[`probe-app/build.rs`](../../crates/x0k-ui-tauri/probe-app/build.rs) · `#probe-build`</sub>

```rust {#probe-build file="probe-app/build.rs"}
/// A one-pixel transparent PNG: Tauri's context needs a window icon on Linux.
const ICON: [u8; 70] = [
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196,
    137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 96, 96, 96, 248, 15, 0, 1, 4, 1, 0, 95, 229, 195, 75, 0, 0, 0, 0,
    73, 69, 78, 68, 174, 66, 96, 130,
];

fn main() {
    std::fs::create_dir_all("icons").expect("the icons directory");
    std::fs::write("icons/icon.png", ICON).expect("the window icon");
    let here = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("cargo names the app's directory"));
    let tests = here.ancestors().map(|dir| dir.join("substrate/apps/ui-control-page"))
        .find(|library| library.join("package.json").is_file())
        .expect("the in-page library above the probe app")
        .join("tests");
    std::fs::create_dir_all("pages").expect("the pages directory");
    for entry in std::fs::read_dir(&tests).expect("the library's test pages") {
        let page = entry.expect("a test page").path();
        if page.extension().is_some_and(|ext| ext == "html") {
            println!("cargo:rerun-if-changed={}", page.display());
            std::fs::copy(&page, here.join("pages").join(page.file_name().expect("a page's name"))).expect("the page copied");
        }
    }
    tauri_build::build();
}
```

What Tauri's builds write, the plugin's permission schemas and the probe
app's icon, pages and resolved permissions, stays out of git wherever the plugin is:
in this repository and in a repository it is published to.

<a name="chunk-build-outputs"></a><sub>[`.gitignore`](../../crates/x0k-ui-tauri/.gitignore) · `#build-outputs`</sub>

```text {#build-outputs file=".gitignore"}
permissions/schemas/
permissions/autogenerated/
probe-app/gen/
probe-app/icons/
probe-app/pages/
```

The app takes the socket, the window's size, the compositing policy and the
page from its arguments, as the library's WebKitGTK host does. It adds the
plugin as any Tauri app adopts it, with its app name,
`x0k-ui-tauri-probe`, served from the window `probe`. When the
page has loaded, it connects to the test's socket and serves it. The
compositing policy is WebKitGTK's. A WKWebView always composites, so on macOS
the app takes the argument and sets nothing.

<a name="chunk-probe-main"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#probe-main`</sub>

```rust {#probe-main}
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let [_, socket, width, height, policy, page] = &args[..] else {
        eprintln!("usage: x0k-ui-tauri-probe <socket> <width> <height> <ALWAYS|NEVER> <page.html>");
        std::process::exit(2);
    };
    let (width, height): (f64, f64) = (width.parse().expect("width"), height.parse().expect("height"));
    let (socket, accelerate, page) = (socket.clone(), policy == "ALWAYS", page.clone());
    tauri::Builder::default()
        .plugin(x0k_ui_tauri::ui_plugin(APP, "probe"))
        .setup(move |app| {
            let socket = socket.clone();
            let window = WebviewWindowBuilder::new(app, "probe", WebviewUrl::App(page.into()))
                .inner_size(width, height)
                .on_page_load(move |window, payload| {
                    if payload.event() == PageLoadEvent::Finished {
                        tauri::async_runtime::spawn(serve(socket.clone(), window.as_ref().clone()));
                    }
                })
                .build()?;
            #[cfg(target_os = "linux")]
            window.with_webview(move |platform| {
                use webkit2gtk::{HardwareAccelerationPolicy, SettingsExt, WebViewExt};
                let settings = WebViewExt::settings(&platform.inner()).expect("the webview's settings");
                settings.set_hardware_acceleration_policy(if accelerate { HardwareAccelerationPolicy::Always } else { HardwareAccelerationPolicy::Never });
            })?;
            #[cfg(not(target_os = "linux"))]
            let _ = (window, accelerate);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the probe app");
}
```

Each line the test sends is a request with an id, and each line the app sends
is its answer with that id:

- `{"op": "eval", "body"}` runs the body in the page through the plugin's
  request, and answers its `value`;
- `{"op": "snap"}` answers the plugin's snapshot: `width`, `height`, `stride`
  and the BGRA bytes in base64;
- `{"op": "observe", "read", "latency", "unheld"}` runs the plugin's loop with
  `read` as the reader, waiting `latency` ms between the hold and the capture,
  and answers its `frame`, `read`, `holdMs`, `refused` and `capture`; with
  `unheld` true, the loop runs with the page's hold skipped;
- `{"op": "input", "frame", "scale", "perform"}` runs one sequence of input as
  the endpoint will: `check_perform` against `frame`, the frame the test
  observed, then the plugin's `perform` at that capture's `scale`; it answers
  the `epoch` after it, or what `check_perform` refused;
- `{"op": "drawn", "frame_only"}` answers the plugin's capture of the held
  page, with the drawing of input or, for the frame alone, without it, as the
  endpoint answers one, and whether it carries the drawing;
- `{"op": "forge"}` runs the nonce test below.

<a name="chunk-probe-serve"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#probe-serve`</sub>

```rust {#probe-serve}
/// Connect to the test's socket, say ready, and answer each request line.
async fn serve(socket: String, webview: Webview<Wry>) {
    let stream = connect_test_socket(&socket).expect("the test's socket");
    stream.set_nonblocking(true).expect("a nonblocking socket");
    let (read, mut write) = UnixStream::from_std(stream).expect("the test's socket").into_split();
    let page = PageHost::new(webview.clone());
    send_line(&mut write, json!({ "ready": tauri::VERSION })).await;
    let mut lines = BufReader::new(read).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let request: Value = serde_json::from_str(&line).expect("a request");
        let reply = match request["op"].as_str() {
            Some("eval") => page.evaluate(request["body"].as_str().unwrap_or_default()).await.map(|value| json!({ "value": value })),
            Some("snap") => page.snapshot().await.map(|s| image(&s)),
            Some("observe") => observe_probe(&page, &request).await,
            Some("input") => perform_probe(&page, &request).await,
            Some("drawn") => drawn_probe(&page, &request).await,
            Some("forge") => Ok(forge(&page, &webview).await),
            other => Ok(json!({ "error": format!("unknown op {other:?}") })),
        };
        let mut reply = reply.unwrap_or_else(|e| json!({ "error": e.to_string() }));
        reply["id"] = request["id"].clone();
        send_line(&mut write, reply).await;
    }
    webview.app_handle().exit(0);
}
```

An observation answers what the loop answered, with the capture's pixels in
base64. The app's host is the plugin's `PageHold`, with two changes a test
asks for. It waits `latency` ms before the capture, as a host whose round trip
to the page spans more than a rendering update does. With `unheld`, it skips
the hold: it reads the epoch and the probe at once, and reads the epoch again
after the capture, without holding or releasing the page. Both exist so the
probe test can show what the hold buys.

<a name="chunk-probe-observe"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#probe-observe`</sub>

```rust {#probe-observe}
/// One observation through the plugin's loop, as `request` asks.
async fn observe_probe(page: &PageHost<Wry>, request: &Value) -> Result<Value, PageError> {
    let read = request["read"].as_str().unwrap_or("null");
    let latency = Duration::from_millis(request["latency"].as_u64().unwrap_or(0));
    let mut host = Probe { held: PageHold::new(page, read), page, read, latency, unheld: request["unheld"].as_bool().unwrap_or(false) };
    let observed = held_capture(&mut host, HOLD_TRIES).await?;
    let mut answer = json!({ "frame": observed.frame, "read": observed.read, "holdMs": observed.hold_ms });
    if let Some(refused) = observed.refused {
        answer["refused"] = json!(refused.why);
    }
    if let Some(capture) = observed.capture {
        answer["capture"] = image(&capture);
    }
    Ok(answer)
}

fn image(s: &Snapshot) -> Value {
    json!({ "width": s.width, "height": s.height, "stride": s.stride, "scale": s.scale, "bgra": base64::engine::general_purpose::STANDARD.encode(&s.bgra) })
}
```

A sequence of input runs as the endpoint will run it. The app offers
`ui/input`, holds the one frame the test names, and lets `check_perform`
resolve the sequence against it before the plugin delivers any of it.

<a name="chunk-probe-input"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#probe-input`</sub>

```rust {#probe-input}
/// One sequence of input: `check_perform` against the test's frame, then the plugin's input.
async fn perform_probe(page: &PageHost<Wry>, request: &Value) -> Result<Value, PageError> {
    let malformed = |e: serde_json::Error| PageError::Malformed(e.to_string());
    let frame: HeldFrame = serde_json::from_value(request["frame"].clone()).map_err(malformed)?;
    let perform: Perform = serde_json::from_value(request["perform"].clone()).map_err(malformed)?;
    let offer: Offer = serde_json::from_value(json!({
        "app": "x0k-ui-tauri-probe", "instance": "probe", "interfaces": [{ "name": UI_INPUT, "fingerprint": "" }],
    }))
    .map_err(malformed)?;
    let resolved = match check_perform(&offer, &[frame], &perform) {
        Ok(resolved) => resolved,
        Err(refused) => return Ok(json!({ "refused": format!("{refused:?}") })),
    };
    let epoch = page.perform("probe", &perform, &resolved, request["scale"].as_f64().unwrap_or(f64::NAN)).await?;
    Ok(json!({ "epoch": epoch }))
}
```

<a name="chunk-probe-drawn"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#probe-drawn`</sub>

```rust {#probe-drawn}
/// The capture as the endpoint answers it: the page held with its drawing of
/// input, or with the drawing hidden when the frame alone is asked.
async fn drawn_probe(page: &PageHost<Wry>, request: &Value) -> Result<Value, PageError> {
    let frame_only = request["frame_only"].as_bool().unwrap_or(false);
    let held = held_capture(&mut PageHold::new(page, "null").frame_only(frame_only), HOLD_TRIES).await?;
    let mut capture = held.capture.as_ref().map(image).unwrap_or_else(|| json!({}));
    capture["presented"] = json!(page.presents(frame_only));
    Ok(json!({ "capture": capture }))
}
```

<a name="chunk-probe-host"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#probe-host`</sub>

```rust {#probe-host}
/// The plugin's host, slowed by `latency` before each capture, and with the
/// page's hold skipped when `unheld`.
struct Probe<'a> {
    held: PageHold<'a, Wry>,
    page: &'a PageHost<Wry>,
    read: &'a str,
    latency: Duration,
    unheld: bool,
}

impl HoldingHost for Probe<'_> {
    type Read = Value;
    type Capture = Snapshot;
    type Error = PageError;
    async fn hold(&mut self) -> Result<Held<Value>, PageError> {
        if !self.unheld {
            return self.held.hold().await;
        }
        let body = format!("return JSON.stringify({{ epoch: globalThis.{PAGE_GLOBAL}.epoch(), read: ({}), holdMs: 0 }});", self.read);
        serde_json::from_str(&self.page.evaluate(&body).await?).map_err(|e| PageError::Malformed(e.to_string()))
    }
    async fn capture(&mut self) -> Result<Snapshot, PageError> {
        tokio::time::sleep(self.latency).await;
        self.held.capture().await
    }
    async fn verify(&mut self) -> Result<u64, PageError> {
        if !self.unheld {
            return self.held.verify().await;
        }
        let epoch = self.page.evaluate(&format!("return String(globalThis.{PAGE_GLOBAL}.epoch());")).await?;
        epoch.parse().map_err(|_| PageError::Malformed(epoch))
    }
}
```

The nonce test makes the page forge. While a request waits, the page's own
script invokes the plugin's command twice: once with a wrong nonce, once with
none. It does this in two rounds. In the first, the request answers itself
later, and must get its own answer. In the second, the request never answers,
and must time out as unanswered. Each forged answer must be counted as dropped.

<a name="chunk-probe-forge"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#probe-forge`</sub>

```rust {#probe-forge}
/// The page's forged answers, a wrong nonce and none, in a block so the
/// script can run more than once.
const FORGED: &str = "{ const invoke = (reply) => window.__TAURI_INTERNALS__.invoke('plugin:x0k-ui-tauri|page_answer', { reply });\
    invoke({ nonce: '00000000000000000000000000000000', value: 'forged' });\
    invoke({ value: 'forged' }); }";

/// One request with `body`, with the page forging answers 50 ms after it went out.
async fn forged_round(page: &PageHost<Wry>, webview: &Webview<Wry>, body: &str, timeout: Duration) -> Value {
    let forge = async {
        tokio::time::sleep(Duration::from_millis(50)).await;
        webview.eval(FORGED).expect("the forged answers");
    };
    match tokio::join!(page.evaluate_within(body, timeout), forge).0 {
        Ok(value) => json!({ "Ok": value }),
        Err(e) => json!({ "Err": e.to_string() }),
    }
}

/// Both rounds, and how many answers the plugin dropped meanwhile.
async fn forge(page: &PageHost<Wry>, webview: &Webview<Wry>) -> Value {
    let pending = webview.state::<Pending>();
    let before = pending.dropped();
    let answered = forged_round(page, webview, "await new Promise((r) => setTimeout(r, 300)); return 'own';", Duration::from_secs(5)).await;
    let unanswered = forged_round(page, webview, "await new Promise(() => {});", Duration::from_millis(600)).await;
    json!({ "answered": answered, "unanswered": unanswered, "dropped": pending.dropped() - before })
}
```

The rest is socket plumbing: on Linux an abstract unix socket is named with a
leading `@`, as in the library's WebKitGTK host. macOS has no abstract
sockets, so there the test names a path.

<a name="chunk-probe-socket"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#probe-socket`</sub>

```rust {#probe-socket}
#[cfg(target_os = "linux")]
fn connect_test_socket(socket: &str) -> std::io::Result<std::os::unix::net::UnixStream> {
    use std::os::linux::net::SocketAddrExt;
    use std::os::unix::net::{SocketAddr, UnixStream};
    match socket.strip_prefix('@') {
        Some(name) => UnixStream::connect_addr(&SocketAddr::from_abstract_name(name)?),
        None => UnixStream::connect(socket),
    }
}

#[cfg(not(target_os = "linux"))]
fn connect_test_socket(socket: &str) -> std::io::Result<std::os::unix::net::UnixStream> {
    std::os::unix::net::UnixStream::connect(socket)
}

async fn send_line(write: &mut tokio::net::unix::OwnedWriteHalf, message: Value) {
    let mut line = message.to_string();
    line.push('\n');
    write.write_all(line.as_bytes()).await.expect("the test's socket");
}
```

<a name="chunk-probe-file"></a><sub>[`probe-app/src/main.rs`](../../crates/x0k-ui-tauri/probe-app/src/main.rs) · `#probe-file` · assembles [probe-main](#chunk-probe-main) · [probe-serve](#chunk-probe-serve) · [probe-observe](#chunk-probe-observe) · [probe-input](#chunk-probe-input) · [probe-drawn](#chunk-probe-drawn) · [probe-host](#chunk-probe-host) · [probe-forge](#chunk-probe-forge) · [probe-socket](#chunk-probe-socket)</sub>

```rust {#probe-file file="probe-app/src/main.rs"}
//! A minimal Tauri app for x0k-ui-tauri's probe test: the probe page in one
//! window, driven by the test over a unix socket.
use std::time::Duration;

use base64::Engine as _;
use serde_json::{json, Value};
use tauri::webview::PageLoadEvent;
use tauri::{Manager, Webview, WebviewUrl, WebviewWindowBuilder, Wry};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;
use x0k_ui_protocol::input::{check_perform, HeldFrame, Perform};
use x0k_ui_protocol::offer::{Offer, UI_INPUT};
use x0k_ui_tauri::{held_capture, Held, HoldingHost, PageError, PageHold, PageHost, Pending, Snapshot, HOLD_TRIES, PAGE_GLOBAL};

/// The probe app's name, which its endpoint is named for.
const APP: &str = "x0k-ui-tauri-probe";

<<probe-main>>

<<probe-serve>>

<<probe-observe>>

<<probe-input>>

<<probe-drawn>>

<<probe-host>>

<<probe-forge>>

<<probe-socket>>
```

## The probe test

The test is the library's probe test, run against the probe app. It reuses
what the library exports: the probe page, `judge`, which reads
a capture against the hold's read, the Xvfb display, and the image and
scratch-environment helpers of its hosts. Its claims are the library's claims,
with the same wording, plus the nonce claim.

Each WebKitGTK program runs through `x0k-webkitgtk-run`, which the dev shell
provides. It gives the program Mesa as its EGL vendor and none of the dev
shell's library path. Without it, WebKitGTK under Xvfb aborts with "Could not
create default EGL display: EGL_BAD_PARAMETER", as the library's Python host
does. It does not give the program Mesa as its GLX vendor, which the library's
Python host now has, so GTK here still finds no GL configuration (below).

<a name="chunk-test-setup"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-setup`</sub>

```typescript {#test-setup}
/** The probe app's binary, as the crate's cargo test names it. */
const PROBE = process.env.X0K_UI_TAURI_PROBE;
if (!PROBE) throw new Error('X0K_UI_TAURI_PROBE names the probe app; `cargo test` in x0k-ui-tauri sets it');
/** On macOS the app runs in a window on the Mac's own display; elsewhere, under Xvfb. */
const MAC = process.platform === 'darwin';
/** What runs a WebKitGTK program under Xvfb with Mesa as its EGL vendor. */
const RUN = process.env.X0K_WEBKITGTK_RUN ?? 'x0k-webkitgtk-run';
const SIZE = { width: 400, height: 300 };
const TRIALS = Number(process.env.HOLD_TRIALS ?? 40);
/** How long the probe's host waits between the hold and the capture, as the
 * library's test does: a quick host, and one whose round trip to the page
 * spans more than a rendering update. */
const HOST_LATENCIES_MS = [0, 25];
/** HOLD_UNHELD=1 runs the plugin's loop with the page's hold skipped. */
const UNHELD = process.env.HOLD_UNHELD === '1';
/** One rendering update at 60 Hz. */
const FRAME_MS = 1000 / 60;
/** The hold's cost bound on the probe page, at the 90th percentile. */
const HOLD_P90_MS = 100;
/** How long the app may take to answer one request, its first load included. */
const ANSWER_MS = 30_000;
const READ = 'window.probeRead()';
const ANIMATION_CLOCK = `const a = document.getAnimations()[0]; return JSON.stringify({ time: Number(a.currentTime), at: performance.now() });`;
const NO_IMAGE: Image = { width: 0, height: 0, rgb: () => [0, 0, 0] };
```

A hold's cost is read at a percentile.

<a name="chunk-test-percentile"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-percentile`</sub>

```typescript {#test-percentile}
function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
```

The app runs with a scratch home, and connects to a socket the test listens
on. Its runtime directory is a scratch one the test pins with
`X0K_RUNTIME_DIR`, so its endpoint binds there by the plugin's own rule, at
`<runtime>/ui-control/x0k-ui-tauri-probe.endpoint`. On Linux it runs on an X
server of its own, at GDK's widget scale the test names, and the socket is
abstract. On macOS it runs in a window on the Mac's own display, at that
screen's backing scale, and the socket is a path in the same scratch directory.

<a name="chunk-test-app"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-app`</sub>

```typescript {#test-app}
const deadline = (what: string) => new Promise<never>((_, fail) =>
  setTimeout(() => fail(new Error(`the probe app did not ${what} within ${ANSWER_MS} ms`)), ANSWER_MS).unref());

/** The probe app, composited or not, showing `page`, and a call to it: on
 * Linux on an X server of its own at GDK's `gdkScale` widget scale, on macOS
 * on the Mac's display at its own backing scale. */
async function probeApp(compositing: boolean, gdkScale = 1, page = 'probe-page.html') {
  const home = ownedTempDir('x0k-ui-tauri-home-');
  const env = MAC ? scratchEnv(home) : scratchEnv(home, { LIBGL_ALWAYS_SOFTWARE: '1', NO_AT_BRIDGE: '1', GDK_BACKEND: 'x11', GDK_SCALE: String(gdkScale) });
  const stops: (() => Promise<void>)[] = [];
  const stopAll = async () => { for (const stop of stops.reverse()) await stop(); };
  try {
    const x = MAC ? undefined : await display(env);
    if (x) stops.push(() => x.server.stop());
    /** The app's runtime directory, a scratch one under /tmp, which holds the
     * test's socket on macOS too: a unix socket's path holds at most 104 bytes
     * on macOS and 107 on Linux, and a scratch home under a build's temporary
     * directory can be longer than that. */
    const runtime = mkdtempSync('/tmp/x0k-ui-tauri-');
    stops.push(async () => rmSync(runtime, { recursive: true, force: true }));
    const address = MAC ? `${runtime}/test.sock` : `@x0k-ui-tauri-${process.pid}-${Date.now()}`;
    const server = createServer();
    const accepted = new Promise<Socket>((done) => server.once('connection', done));
    await new Promise<void>((done) => server.listen(MAC ? address : `\0${address.slice(1)}`, done));
    const endpoint = `${runtime}/ui-control/x0k-ui-tauri-probe.endpoint`;
    const appEnv: NodeJS.ProcessEnv = { ...env, X0K_RUNTIME_DIR: runtime, ...(x ? { DISPLAY: x.name } : {}) };
    delete appEnv.X0K_UI_CONTROL_ENDPOINT_DIR;
    const args = [PROBE, address, String(SIZE.width), String(SIZE.height), compositing ? 'ALWAYS' : 'NEVER', page];
    const app = x
      ? spawnOwned(RUN, args, { env: appEnv, stderr: 'inherit' })
      : spawnOwned(args[0], args.slice(1), { env: appEnv, stderr: 'inherit' });
    stops.push(async () => { server.close(); }, () => app.stop());
    const ended = new Promise<never>((_, fail) => app.once('exit', (code) => fail(new Error(`the probe app ended (${code})`))));
    const link = await Promise.race([accepted, ended, deadline('load the page')]);
    const lines = createInterface({ input: link })[Symbol.asyncIterator]();
    const next = async () => JSON.parse((await Promise.race([lines.next(), ended, deadline('answer')])).value);
    const tauri = (await next()).ready;
    let last = 0;
    const call = async (request: object) => {
      link.write(JSON.stringify({ id: ++last, ...request }) + '\n');
      const reply = await next();
      if (reply.error) throw new Error(reply.error);
      return reply;
    };
    const agent = (await call({ op: 'eval', body: 'return navigator.userAgent;' })).value;
    return { version: `Tauri ${tauri}, ${agent}`, endpoint, call, close: async () => { link.destroy(); await stopAll(); } };
  } catch (e) {
    await stopAll();
    throw e;
  }
}
```

Each trial waits a random 0 to 40 ms, reads the animation's clock, makes one
observation through the plugin's loop at one of the two host latencies, and
reads the clock again.

<a name="chunk-test-trials"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-trials`</sub>

```typescript {#test-trials}
const image = (c: any): Image => (c ? bgraImage(c.width, c.height, c.stride, Buffer.from(c.bgra, 'base64')) : NO_IMAGE);
type Row = { latency: number; judged: ReturnType<typeof judge>; read: ProbeRead; refused?: string; holdMs: number[]; drift: number };

async function trials(app: Awaited<ReturnType<typeof probeApp>>, rows: Row[]) {
  for (const latency of HOST_LATENCIES_MS) for (let i = 0; i < TRIALS; i++) {
    await sleep(Math.floor(Math.random() * 40));
    const clock0 = JSON.parse((await app.call({ op: 'eval', body: ANIMATION_CLOCK })).value);
    const held = await app.call({ op: 'observe', read: READ, latency, unheld: UNHELD });
    const clock1 = JSON.parse((await app.call({ op: 'eval', body: ANIMATION_CLOCK })).value);
    const drift = (clock1.time - clock0.time) - (clock1.at - clock0.at);
    rows.push({ latency, judged: judge(held.read, image(held.capture)), read: held.read, refused: held.refused, holdMs: held.holdMs, drift });
  }
}
```

The claims are the library's, and the nonce claim is the plugin's own.

<a name="chunk-test-claims"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-claims`</sub>

```typescript {#test-claims}
test('every capture is held still: the epoch after it is the epoch it was held at', () => {
  const refused = rows.filter((r) => r.refused);
  assert.equal(refused.length, 0, `${refused.length}/${rows.length} refused: ${refused.slice(0, 3).map((r) => r.refused).join('; ')}`);
});
test('the counter painted in the capture is the count the hold read', () => {
  assert.ok(rows.every((r) => !r.refused && r.judged.counter), `agreed ${agreed('counter')}, ${app.version}; first misses ${misses('counter')}`);
});
test('the element moved by script lies in the capture where the hold laid it out', () => {
  assert.ok(rows.every((r) => !r.refused && r.judged.mover), `agreed ${agreed('mover')}; first misses ${misses('mover')}`);
});
test('the element moved by a CSS animation lies in the capture where the hold laid it out', () => {
  assert.ok(rows.every((r) => !r.refused && r.judged.slider), `agreed ${agreed('slider')}; first misses ${misses('slider')}`);
});
test('a release leaves no animation behind its timeline', (t) => {
  const drift = rows.reduce((sum, r) => sum + r.drift, 0) / rows.length;
  t.diagnostic(`mean drift ${drift.toFixed(1)} ms`);
  assert.ok(Math.abs(drift) < FRAME_MS, `mean drift ${drift.toFixed(1)} ms`);
});
test(`the hold costs at most ${HOLD_P90_MS} ms at the 90th percentile`, (t) => {
  const costs = rows.flatMap((r) => r.holdMs);
  const p90 = percentile(costs, 0.9);
  t.diagnostic(`${app.version}: hold median ${percentile(costs, 0.5).toFixed(1)} ms, p90 ${p90.toFixed(1)} ms, max ${Math.max(...costs).toFixed(1)} ms; scale ${rows[0]?.judged.seen.scale.toFixed(4)}, devicePixelRatio ${rows[0]?.read.ratio}`);
  assert.ok(p90 <= HOLD_P90_MS, `p90 ${p90.toFixed(1)} ms`);
});
test('an answer with a wrong nonce or none is dropped, and the request it would answer keeps waiting', async () => {
  const forged = await app.call({ op: 'forge' });
  assert.deepEqual(forged.answered, { Ok: 'own' }, JSON.stringify(forged));
  assert.match(forged.unanswered.Err ?? '', /did not answer/, JSON.stringify(forged));
  assert.equal(forged.dropped, 4, JSON.stringify(forged));
});
```

The input test is the webview design's trusted-click test (§4). The page gets
three controls by script: a button, a field and a box that scrolls, each in a
part of the probe page nothing moves through, and a listener that records each
event's type, target and `isTrusted`. Building the controls by script is fine;
only the events must come from the platform. The test observes the page once,
takes its frame, and finds each control's centre in that capture's pixels, as
the layout walk places a node: its CSS box times the capture's width over the
viewport's. Each sequence then goes through the app's `input`, so
`check_perform` resolves it against that frame and the plugin delivers it at
the capture's own scale.

After a click the test also reads the capture as the endpoint answers it,
drawn over and as the frame alone: inside the drawn pointer's arrow, a few
pixels from where the click landed, the drawn capture is the pointer's ink and
the frame alone is the page's own pixel.

On Linux it runs at GDK widget scales 1 and 2. At 2 the capture has two pixels
for each widget unit, so a position the plugin failed to divide would land
twice as far from the origin. On macOS it runs once, at the screen's own
backing scale, which is 2 on a Retina screen.

<a name="chunk-test-input"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-input`</sub>

```typescript {#test-input}
/** The controls the input test adds to the probe page, and the listener that records their events. */
const CONTROLS = `
  const style = document.createElement('style');
  style.textContent = '#probe-button { position: fixed; left: 330px; top: 10px; width: 40px; height: 30px; }'
    + ' #probe-field { position: fixed; left: 250px; top: 50px; width: 120px; height: 24px; box-sizing: border-box; }'
    + ' #probe-scroll { position: fixed; left: 250px; top: 230px; width: 120px; height: 50px; overflow-y: scroll; }'
    + ' #probe-scroll div { height: 1000px; }';
  document.head.append(style);
  document.body.insertAdjacentHTML('beforeend', '<button id="probe-button">go</button><input id="probe-field"><div id="probe-scroll"><div></div></div>');
  window.inputSeen = [];
  for (const type of ['click', 'focus', 'keydown', 'input', 'wheel'])
    document.addEventListener(type, (e) => inputSeen.push({ type, trusted: e.isTrusted, target: e.target.id || e.target.parentElement?.id }), { capture: true, passive: true });
  return 'ok';`;

/** The probe page with the controls, at GDK widget scale `gdkScale`, and its
 * frame: the capture it was observed in, and that capture's scales. */
async function inputApp(gdkScale: number) {
  const app = await probeApp(false, gdkScale);
  await app.call({ op: 'eval', body: CONTROLS });
  await sleep(100);
  const held = await app.call({ op: 'observe', read: READ, latency: 0, unheld: false });
  const frame = { frame: held.frame, width: held.capture.width, height: held.capture.height };
  /** The layout walk's scale: capture pixels per CSS pixel. */
  const scaleFactor = held.capture.width / held.read.width;
  return { app, frame, scaleFactor, widgetScale: held.capture.scale as number };
}
```

<a name="chunk-test-input-claims"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-input-claims`</sub>

```typescript {#test-input-claims}
for (const gdkScale of MAC ? [0] : [1, 2]) {
  describe(`input into the probe page in a Tauri app, at ${MAC ? 'the screen\'s backing scale' : `GDK scale ${gdkScale}`}`, () => {
    let page: Awaited<ReturnType<typeof inputApp>>;
    before(async () => { page = await inputApp(gdkScale); });
    after(async () => { await page?.app.close(); });
    const evaluate = async (body: string) => JSON.parse((await page.app.call({ op: 'eval', body })).value);
    /** A control's centre in the frame's capture pixels. */
    const centre = async (id: string) => {
      const box = await evaluate(`const r = document.getElementById('${id}').getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });`);
      return { frame: page.frame.frame, x: box.x * page.scaleFactor, y: box.y * page.scaleFactor };
    };
    const perform = async (sources: object[]) => {
      const answer = await page.app.call({ op: 'input', frame: page.frame, scale: page.widgetScale, perform: { sources } });
      assert.equal(answer.refused, undefined, JSON.stringify(answer));
      return answer;
    };
    const click = (to: object) => ({ id: 'mouse', kind: 'mouse', steps: [{ do: 'move', to }, { do: 'down', button: 0 }, { do: 'up', button: 0 }] });
    const seen = async () => evaluate('return JSON.stringify(inputSeen.splice(0));');

    test('a click at a button\'s centre in capture pixels arrives at the button, trusted', async (t) => {
      const at = await centre('probe-button');
      await perform([click(at)]);
      const events = await seen();
      t.diagnostic(`capture ${page.frame.width} wide, widget scale ${page.widgetScale}, scale_factor ${page.scaleFactor.toFixed(4)}, click at ${JSON.stringify(at)}`);
      assert.deepEqual(events.filter((e: any) => e.type === 'click'), [{ type: 'click', trusted: true, target: 'probe-button' }], JSON.stringify(events));
    });
    test('a click into a field moves focus to it, and keys typed there type their text, trusted', async () => {
      await perform([click(await centre('probe-field'))]);
      const typed = [...'Hi x0k'].flatMap((key) => [{ do: 'key_down', key }, { do: 'key_up', key }]);
      await perform([{ id: 'keys', kind: 'key', steps: typed }]);
      const events = await seen();
      const field = await evaluate(`return JSON.stringify({ focused: document.activeElement.id, value: document.getElementById('probe-field').value });`);
      assert.deepEqual(field, { focused: 'probe-field', value: 'Hi x0k' }, JSON.stringify(events));
      assert.deepEqual(events.filter((e: any) => e.type === 'focus'), [{ type: 'focus', trusted: true, target: 'probe-field' }], JSON.stringify(events));
      const keys = events.filter((e: any) => e.type === 'keydown');
      assert.ok(keys.length === 6 && keys.every((e: any) => e.trusted && e.target === 'probe-field'), JSON.stringify(keys));
    });
    test('a wheel over a box that scrolls scrolls it in the delta\'s direction, trusted', async (t) => {
      const to = await centre('probe-scroll');
      await perform([{ id: 'wheel', kind: 'wheel', steps: [{ do: 'scroll', to, delta_x: 0, delta_y: 120 * page.scaleFactor }] }]);
      await sleep(300);
      const top = await evaluate(`return String(document.getElementById('probe-scroll').scrollTop);`);
      const wheels = (await seen()).filter((e: any) => e.type === 'wheel');
      t.diagnostic(`scrolled ${top} CSS pixels for a delta of 120`);
      assert.ok(top > 0, `scrollTop ${top}`);
      assert.ok(wheels.length > 0 && wheels.every((e: any) => e.trusted && e.target === 'probe-scroll'), JSON.stringify(wheels));
    });
    test('a click leaves its drawn pointer in a capture where it landed, and the frame alone carries none of it', async (t) => {
      const at = await centre('probe-button');
      await perform([click(at)]);
      const drawn = (await page.app.call({ op: 'drawn', frame_only: false })).capture;
      const alone = (await page.app.call({ op: 'drawn', frame_only: true })).capture;
      const inside = { x: Math.round(at.x + 3 * page.widgetScale), y: Math.round(at.y + 8 * page.widgetScale) };
      const pixels = { drawn: image(drawn).rgb(inside.x, inside.y), alone: image(alone).rgb(inside.x, inside.y) };
      t.diagnostic(`at ${JSON.stringify(inside)}: drawn ${pixels.drawn}, alone ${pixels.alone}`);
      const ink = ([r, g, b]: number[]) => r === DRAWN_INK[0] && g === DRAWN_INK[1] && b === DRAWN_INK[2];
      assert.deepEqual([drawn.presented, alone.presented], [true, false]);
      assert.ok(ink(pixels.drawn), `the drawn capture shows ${pixels.drawn} inside the pointer`);
      assert.ok(!ink(pixels.alone), `the frame alone shows the pointer's ink, ${pixels.alone}`);
      await seen();
    });
    test('the drawing is no part of the page: painted in a hold, it moves no epoch, changes no layout walk and answers no hit test', async () => {
      const at = await centre('probe-button');
      const apart = await evaluate(drawnApart(at.x / page.scaleFactor, at.y / page.scaleFactor));
      assert.deepEqual(apart, { layer: true, walked: true, hit: 'probe-button', moved: false });
    });
    test('a touch source is refused by name before any of the sequence runs', async () => {
      const at = await centre('probe-button');
      await assert.rejects(perform([click(at), { id: 'finger', kind: 'touch', steps: [{ do: 'move', to: at }] }]), /a touch source cannot be delivered/);
      assert.deepEqual(await seen(), []);
    });
  });
}
```

The endpoint test runs the conformance suite, the `ui-conformance` program,
against the probe app's endpoint socket, as any driver reaches it. The app shows
the library's answer page (`x0k:implementation/ui-control/page-answer`), which
declares a counter and its actions, and the suite runs the caller's
`counter.bump` beside the ones it draws from the offer. Before the suite runs,
the test wraps the library's entry so the page records each call it hears.
After it, every action the page heard must be one its offer lists, and it must
have heard at least one, so the claim cannot hold by the page hearing nothing.
The suite itself invokes an action the offer does not list, so a plugin whose
calls reached the page before the endpoint's checks would show it here.

<a name="chunk-test-endpoint"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-endpoint`</sub>

```typescript {#test-endpoint}
/** The caller's action the suite runs, beside the ones it draws from the offer. */
const ACT = ['counter.bump', '{"by":1}'];
/** Claims of the suite's report the plugin must hold, beside its verdict. */
const ENDPOINT_CLAIMS = ['an action the offer does not list is refused', 'counter.bump runs and names the frame after it',
  'a pointer move to a layout node runs and names the frame after it', 'a click at the watchable pace answers no sooner than its floor'];
/** What wraps the library's run, so the page records each action it runs. */
const HEARING = `const run = globalThis.__x0kUi.run;
  window.heard = [];
  globalThis.__x0kUi.run = (name, args) => { heard.push(name); return run(name, args); };
  return 'ok';`;

/** The suite's report on the endpoint at `socket`, and whether every claim held. */
function conformance(socket: string, act: string[]): Promise<{ held: boolean; report: string }> {
  return new Promise((done, fail) => execFile(UI_CONFORMANCE, [socket, ...act], { maxBuffer: 1 << 24 }, (e, stdout, stderr) => {
    if (e && e.code !== 1) fail(new Error(`${UI_CONFORMANCE} could not judge the app: ${stderr || e.message}`));
    else done({ held: !e, report: stdout });
  }));
}

describe('the answer page in a Tauri app, over its endpoint', () => {
  let app: Awaited<ReturnType<typeof probeApp>>;
  let run: { held: boolean; report: string };
  before(async () => {
    if (!existsSync(UI_CONFORMANCE)) throw new Error(`${UI_CONFORMANCE} is not built: cargo build -p x0k-ui-endpoint --bin ui-conformance`);
    app = await probeApp(false, 1, 'answer-page.html');
    await app.call({ op: 'eval', body: HEARING });
    for (let waited = 0; !existsSync(app.endpoint) && waited < ANSWER_MS; waited += 50) await sleep(50);
    run = await conformance(app.endpoint, ACT);
  });
  after(async () => { await app?.close(); });

  test('the app holds to the conformance suite over its endpoint', (t) => {
    t.diagnostic(run.report.trim());
    assert.ok(run.held, run.report);
    for (const claim of ENDPOINT_CLAIMS) assert.match(run.report, new RegExp(`holds +§\\S+ ${claim}`), run.report);
  });
  test('a call the offer does not list never reaches the page', async () => {
    const declared = JSON.parse((await app.call({ op: 'eval', body: 'return JSON.stringify(globalThis.__x0kUi.declared());' })).value);
    const listed = new Set(declared.actions.map((a: any) => a.name));
    const heard: string[] = JSON.parse((await app.call({ op: 'eval', body: 'return JSON.stringify(heard);' })).value);
    assert.ok(heard.length > 0, 'the page ran no action');
    assert.deepEqual(heard.filter((name) => !listed.has(name)), [], JSON.stringify(heard));
  });
});
```

<a name="chunk-test-file"></a><sub>[`probe-app/tests/probe.test.ts`](../../crates/x0k-ui-tauri/probe-app/tests/probe.test.ts) · `#test-file` · assembles [test-setup](#chunk-test-setup) · [test-percentile](#chunk-test-percentile) · [test-app](#chunk-test-app) · [test-trials](#chunk-test-trials) · [test-input](#chunk-test-input) · [test-claims](#chunk-test-claims) · [test-input-claims](#chunk-test-input-claims) · [test-endpoint](#chunk-test-endpoint)</sub>

```typescript {#test-file file="probe-app/tests/probe.test.ts"}
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { createInterface } from 'node:readline';
import { after, before, describe, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Image } from '../../../../../apps/ui-control-page/tests/hosts/engine.ts';
import type { ProbeRead } from '../../../../../apps/ui-control-page/tests/hosts/probe-judge.ts';

/** The repository root: the nearest directory above this test that holds the
 * in-page library, five levels up in x0k's tree and four in its published cut. */
const ROOT = (() => {
  for (let dir = dirname(fileURLToPath(import.meta.url)); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'substrate/apps/ui-control-page/package.json'))) return dir;
    if (dirname(dir) === dir) throw new Error('no directory above the probe test holds the in-page library');
  }
})();
const from = (path: string) => import(pathToFileURL(join(ROOT, path)).href);
const HOSTS = 'substrate/apps/ui-control-page/tests/hosts';
const { bgraImage, scratchEnv } = await from(`${HOSTS}/engine.ts`);
const { DRAWN_INK, drawnApart, judge } = await from(`${HOSTS}/probe-judge.ts`);
const { UI_CONFORMANCE } = await from(`${HOSTS}/suite.ts`);
const { display } = await from(`${HOSTS}/webkitgtk.ts`);
const { ownedTempDir, spawnOwned } = await from('tools/owned-process.mjs');

<<test-setup>>

<<test-percentile>>

<<test-app>>

<<test-trials>>

<<test-input>>

/** WebKitGTK composites by policy; a WKWebView always does. */
for (const compositing of MAC ? [true] : [true, false]) {
  describe(`the probe page in a Tauri app, ${compositing ? 'composited' : 'not composited'}`, () => {
    let app: Awaited<ReturnType<typeof probeApp>>;
    const rows: Row[] = [];
    before(async () => {
      app = await probeApp(compositing);
      await sleep(300);
      await trials(app, rows);
    });
    after(async () => { await app?.close(); });
    type Part = 'counter' | 'mover' | 'slider';
    const agreedAt = (part: Part, latency: number) => rows.filter((r) => r.latency === latency && !r.refused && r.judged[part]).length;
    const agreed = (part: Part) => HOST_LATENCIES_MS.map((l) => `${agreedAt(part, l)}/${TRIALS} at ${l} ms`).join(', ');
    const misses = (part: Part) =>
      JSON.stringify(rows.filter((r) => r.refused || !r.judged[part]).slice(0, 3).map((r) => ({ read: r.read, seen: r.judged.seen, refused: r.refused })));

    <<test-claims>>
  });
}

<<test-input-claims>>

<<test-endpoint>>
```

`cargo test` runs it. The probe app's own test builds the app, names its binary
to the probe test, and runs the probe test in Node with none of the live
runtime's directory. The probe test's own variables (`HOLD_TRIALS`,
`HOLD_UNHELD`) pass through. Before Node starts, the test makes what the probe
test reads outside cargo's build. It installs the library package's pinned
dependencies (`npm ci` in `substrate/apps/ui-control-page`) when they are not
installed or its lock is newer than the install, since the probe test bundles
the page script with them as it loads. It finds the repository's root as the
nearest directory above it that holds the library, and the probe test finds
it the same way and imports the library's hosts from there, so both run in
x0k's tree and in the published cut, whose crates sit at another depth. It builds the conformance suite's
`ui-conformance` from this checkout and names it to the probe test, so the
endpoint test never runs a stale or missing copy. So one command in the dev
shell builds and runs everything, in a fresh checkout too:

```
cargo test -p x0k-ui-tauri -p x0k-ui-tauri-probe
```

<a name="chunk-probe-runner"></a><sub>[`probe-app/tests/probe.rs`](../../crates/x0k-ui-tauri/probe-app/tests/probe.rs) · `#probe-runner`</sub>

```rust {#probe-runner file="probe-app/tests/probe.rs"}
//! Runs the probe test (tests/probe.test.ts beside this file) in Node against this crate's app.
use std::fs::File;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::Value;

#[test]
fn the_probe_test_holds_against_the_probe_app() {
    let crate_dir = PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").expect("cargo sets CARGO_MANIFEST_DIR"));
    let repo = crate_dir
        .ancestors()
        .find(|dir| dir.join("substrate/apps/ui-control-page/package.json").is_file())
        .expect("a directory above the crate holds the in-page library");
    let test = crate_dir.join("tests/probe.test.ts");
    page_dependencies(&repo.join("substrate/apps/ui-control-page"));
    let status = Command::new("node")
        .arg("--test")
        .arg(&test)
        .env("X0K_UI_TAURI_PROBE", env!("CARGO_BIN_EXE_x0k-ui-tauri-probe"))
        .env("UI_CONFORMANCE", ui_conformance(repo))
        .env_remove("X0K_RUNTIME_DIR")
        .status()
        .expect("node, from the dev shell");
    assert!(status.success(), "the probe test failed: {status}");
}

/// The library package's pinned dependencies, installed by `npm ci` when
/// there is no install or the lock is newer than it, one run at a time.
fn page_dependencies(page: &Path) {
    let lock = File::create(Path::new(env!("CARGO_TARGET_TMPDIR")).join("ui-control-page-npm.lock")).expect("the install's lock file");
    lock.lock().expect("the install's lock");
    let modified = |path: &Path| std::fs::metadata(path).and_then(|m| m.modified()).ok();
    let (installed, locked) = (modified(&page.join("node_modules/.package-lock.json")), modified(&page.join("package-lock.json")));
    if installed.is_some() && installed >= locked {
        return;
    }
    let status = Command::new("npm")
        .args(["ci", "--prefer-offline", "--no-audit", "--no-fund", "--prefix"])
        .arg(page)
        .status()
        .expect("npm, beside node");
    assert!(status.success(), "npm ci in {} failed: {status}", page.display());
}

/// The conformance suite's program, built from this checkout by the cargo
/// that runs this test.
fn ui_conformance(repo: &Path) -> PathBuf {
    let cargo = std::env::var_os("CARGO").unwrap_or_else(|| "cargo".into());
    let built = Command::new(&cargo)
        .args(["build", "-p", "x0k-ui-endpoint", "--bin", "ui-conformance", "--message-format=json-render-diagnostics", "--manifest-path"])
        .arg(repo.join("Cargo.toml"))
        .stderr(Stdio::inherit())
        .output()
        .expect("cargo, which runs this test");
    assert!(built.status.success(), "building ui-conformance failed: {}", built.status);
    String::from_utf8_lossy(&built.stdout)
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .filter(|message| message["reason"] == "compiler-artifact" && message["target"]["name"] == "ui-conformance")
        .find_map(|message| message["executable"].as_str().map(PathBuf::from))
        .expect("cargo names the ui-conformance it built")
}
```

## What is shown, and what is open

On arca the probe test is green in both compositing policies: 80 trials each,
40 at each host latency, with the hold's median at 39 ms and its 90th
percentile at 46 ms. With the hold skipped (`HOLD_UNHELD=1`) it is red for its
reason. At 25 ms of host latency the epoch moves under every capture, and the
loop refuses 40 of 80 as `page_unsettled`. At no latency the unheld loop agrees
in 40 of 40, because WebKitGTK paints its snapshot afresh from the page as it
stands. So on this engine the hold is what lets a host that is slower than a
rendering update capture at all. The nonce claim is red when the plugin takes
an answer without checking its nonce: the forged answer answers the waiting
request.

The input test is green at GDK widget scales 1 and 2. A click at the button's
centre arrives at the button with `isTrusted` true; a click into the field
moves focus to it with a trusted `focus` event, and six typed characters arrive
as six trusted `keydown`s and type `Hi x0k`; a wheel over the box scrolls it
(132 CSS pixels for a delta of 120) with trusted `wheel` events; and a sequence
with a touch source is refused before any of it runs. Each claim was seen red
for its reason by a mutation of this chapter:

- the same click made by the page's script, `element.click()`, arrives
  `[{"type":"click","trusted":false,"target":"probe-button"}]`;
- with positions not divided by the capture's scale, at scale 2 the click lands
  on nothing (`{"type":"click","trusted":true}`, no target), the keys go to the
  body, the box does not scroll (`scrollTop 0`), and the tick test reads
  `Motion { x: 200.0, y: 100.0 }` for `Motion { x: 100.0, y: 50.0 }`. At scale
  1 the same mutation passes, which is why the test runs at 2;
- with the answer command taking any waiting request instead of checking the
  nonce, the forged answer answers both rounds:
  `{"answered":{"Ok":"forged"},"unanswered":{"Ok":"forged"},"dropped":0}`.

Before the plugin waited for input to settle, the field held `Hi ` where `Hi
x0k` was typed: the request that read it had overtaken key events WebKit still
queued.

Over its endpoint, the probe app showing the answer page holds to the
conformance suite: `37 claims, 0 broken`, the observation, action and input
claims among them. Three claims are unreachable, each for its reason: the trace
claim names no witness, and the two session-end claims need `ui/history` and
state fixtures, which the library does not offer yet. Two claims were seen red
for their reason by a mutation:

- with the endpoint handing a refused invoke to the app as well, the suite
  still read `37 claims, 0 broken`, since the library refuses the unknown action
  itself, but the page heard
  `{"operation":"ui/act.invoke","action":"ui-conformance.no-such-action"}`;
- with input divided by the newest held frame's scale, the scale test reads
  `Ok(2.0)` for `Ok(1.0)`.

On the Mac (an M2 Pro on macOS 15.5, its Retina screen at a backing scale of
2, Tauri 2.12.5, Node 23.10) the same test is green in a real window: 13
claims pass, 0 fail. The probe claims hold in 80 of 80 trials, 40 at each host
latency, with the hold's median at 24 ms, its 90th percentile at 31 ms and its
maximum at 33 ms. The capture is 800 pixels wide for a 400-point view, a
`Snapshot::scale` of 2, and `devicePixelRatio` is 2. A click at the button's
centre arrives at the button trusted; a click into the field moves focus to
it with a trusted `focus`, and six trusted `keydown`s type `Hi x0k`; a wheel
over the box scrolls it 120 CSS pixels for a delta of 120 with trusted `wheel`
events; a touch source is refused before any of the sequence runs. Over its
endpoint, the probe app holds to the conformance suite: `37 claims, 0 broken`,
with the same three claims unreachable as on Linux.

Each claim was seen red for its reason on the Mac:

- the button's own `click()`, made by the page's script, arrives
  `[{"type":"click","trusted":false,"target":"probe-button"}]`;
- with positions not divided by the capture's scale, the click lands on no
  element (`[{"type":"click","trusted":true}]`), the keys go to the body, the
  box does not scroll (`scrollTop 0`), and the tick test reads
  `Motion { x: 200.0, y: 100.0 }` for `{ x: 100.0, y: 50.0 }`;
- with the safe-area inset left out, the same three input claims are red the
  same way, the click 28 points above the button;
- with the hold skipped (`HOLD_UNHELD=1`), 40 of 80 captures are refused as
  `page_unsettled`, all 40 at 25 ms, and the slider agrees in 0 of 40 at each
  latency.

**A driver's input, drawn.** The plugin draws each sequence it delivers on the
library's drawing layer, and a capture the endpoint answers carries it. A click
at the button's centre leaves the pointer's ink, (124, 58, 237), three and
eight CSS pixels into the arrow, while the frame alone shows the page's own
colour there, and the capture says `presented` as it does: on the Mac at
(706, 66), the frame alone (244, 244, 244); on arca at GDK scales 1 and 2, at
(369, 34) and (737, 68), the frame alone (248, 248, 248). Painted in a hold
over the button, the drawing moves no epoch, leaves the layout walk as it was
and leaves the button under the pointer, on both. Over its endpoint the probe
app holds all three of the suite's claims about how input is shown, the frame
alone and the watchable floor among them: `40 claims, 0 broken`. The library's
claims about the layer were seen red by mutation in four engines
(`x0k:implementation/ui-control/page-hold`, "What the test shows").

A person sees the same drawing. A screenshot of the Mac's screen, taken by
`screencapture` while the probe test's click was drawn, shows the probe window
with the arrow on the button, the ring around the point it clicked and the
label `probe` beside it, to the arrow's left, since the button lies near the
window's right edge.

The probe test runs on the Mac only while its window can render. With the
screen locked and the display asleep, WKWebView renders no frame, the hold's
settle never ends, and every request after the first observation goes
unanswered (`the page did not answer within 5s`).

**What WKWebView's snapshot shows.** The webview design left open whether
`takeSnapshot` paints afresh or shows the compositor's last frame, and so
whether the two rendering updates of the settle are needed there. Run as
mutations of `x0k:implementation/ui-control/page-hold`, 40 trials at each host
latency:

| The hold with | counter and script mover, 0 ms / 25 ms | CSS slider, 0 ms / 25 ms | refused |
|---|---|---|---|
| nothing changed | 40/40, 40/40 | 40/40, 40/40 | 0/80 |
| the hold skipped | 40/40, 0/40 | 0/40, 0/40 | 40/80, all at 25 ms |
| no pause of animations | 40/40, 40/40 | 2/40, 2/40 | 0/80 |
| `SETTLE_UPDATES` at 0 | 0/40, 0/40 | 0/40, 0/40 | 80/80 |
| no pause, `SETTLE_UPDATES` at 0 | 40/40, 0/40 | 0/40, 0/40 | 40/80, all at 25 ms |

So `takeSnapshot` paints the page afresh as it stands when it is called: with
nothing held and no host latency, the counter and the script's mover agree in
every trial, as on WebKitGTK. Like WebKitGTK with compositing, it draws a
running CSS transform animation at one fixed place (the slider painted at 51
or 55 while the read said 124 to 215), so only the pause puts the slider where
the read says. And the settle is needed on WKWebView, where it is not on
arca's engines: with `SETTLE_UPDATES` at 0 every capture is refused, each try's
epoch one past the held one (`epochs 23→24, 24→25, 25→26`). The cause is
inferred, not shown: an animation-frame callback the page asked for before the
hold, which the hold cannot defer, runs in the update the snapshot waits for.
Whether one update would do was not measured.

That run is not yet repeatable. Of eleven runs of the test on the Mac, six
were red the same way, at a different request each time: a request to the page
got no answer, `the page did not answer within 5s`, and every claim after it in
its suite was cancelled. It happened in three of four runs of the whole file
started directly with Node, and in all three runs started by `cargo test`.
Alone, each suite answered every time. Keeping the probe window above every
other window did not change it, so a window that macOS hides behind another
app is not its cause. Its cause is not attributed.

The endpoint test runs with the app's runtime directory pinned to a scratch
one, and the suite reaches the app at `<runtime>/ui-control/`, where the
plugin's rule put it. The test of that rule
(`a_scratch_app_never_binds_its_endpoint_in_the_live_runtime`) was seen red
for its reason by a mutation of `x0k_ui_endpoint::address` that resolves by
the pin alone (`runtime_dir` in place of `own_runtime_dir`): the scratch
profile's endpoint resolved into the live stand-in's `ui-control/`.

Three things stay open. Under Xvfb on arca, GTK in this app finds no GL
configuration and WebKitGTK disables its hardware acceleration, so
"composited" asks for compositing that it does not get, and the CSS
animation's compositor gap that the webview design measured is not exercised
here. The cause is the GLX vendor: glvnd loads arca's own Mesa, which needs a
newer glibc than the pin's (`x0k:implementation/ui-control/page-hold`), and
the library's Python host now runs with the pin's Mesa instead. With the same
library path given to this app, the probe test is green in both policies, but
the input test's wheel reaches no listener (`scrollTop 0`, no `wheel` event
seen) at GDK scales 1 and 2, while a bare WebKitGTK view given the same GDK
event scrolls. Until that is attributed and fixed, `x0k-webkitgtk-run` gives
no GLX vendor. Settling waits for two quiet rendering updates, which a page
that handles one event longer than that could outrun; WebKit says when its
queues are empty only to its own automation. And the plugin takes the hold as a script the app
passes in, which suits a test; an app that ships needs the library's hold as a
built file the plugin can carry.

Takeover is not built in the plugin: its offer says it holds none, so the
endpoint refuses one as `takeover_unheld`. Asking the person for it, holding
back their input (an AppKit local event monitor would see only theirs, since
the plugin hands its own events to the view), and the input that ends it are
open. So is a look an app declares for the drawing (`x0k:design/ui-driver`).

On macOS, two more. A key's code is right only on a US layout and for letters, digits and
named keys, and every click is a single click, so a double click is two single
ones. The Windows webview, WebView2 through CDP, is not built.
