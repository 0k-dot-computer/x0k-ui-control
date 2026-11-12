# The Tauri plugin: a Tauri app's page, held and captured

```turtle folio:document
implementation:ui-control\/tauri-plugin a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "A Tauri 2 plugin that is the host of the webview design for a Tauri app on Linux and macOS: it injects the in-page library's hold before the page's scripts, asks the page over Tauri's IPC with a fresh nonce per request and drops any answer without it, and takes the capture natively while the page is held, with webkit_web_view_get_snapshot on Linux and WKWebView's takeSnapshot on macOS. It puts input into the page through the platform's own input path, as GDK events synthesized for the webview's widget on Linux and as NSEvents handed to the WKWebView on macOS, so the page's hit-testing and focus decide the target and its events are trusted. It serves the page as the app's UI-control endpoint with x0k-ui-endpoint, whose checks run before the page hears a call, and forwards a state fixture's present and release to the page's own hooks, answering the first frame painted after each, on a socket named for the app in its profile's runtime directory by the rule every endpoint binds by, so a scratch app never binds in the live runtime. It answers a driver's takeover by the host's configuration, asking the person in the page, holding at once or refusing, and while one stands holds the person's own input back from the page until they press Escape. It answers a stepped screencast: for each frame it advances the library's stepped clock to the frame's time and captures the held page natively, so a Tauri app's screencast of one run is the same on every run and at every frame rate. The library's probe test, an input test and the conformance suite over the endpoint hold it against a minimal Tauri app, under Xvfb on Linux and in a window on the Mac's display." ;
    x0k:concerns "ui-control", "webview", "tauri", "hold", "input", "conformance" ;
    x0k:cites implementation:ui-control\/webview,
        implementation:ui-control\/page-hold,
        implementation:ui-control\/page-walk,
        implementation:ui-control\/protocol,
        implementation:ui-control\/endpoint,
        implementation:ui-control\/page-answer,
        implementation:ui-control\/conformance,
        implementation:ui-control\/page-clock,
        implementation:ui-control\/endpoint-screencast ;
    x0k:implements architecture:ui-control-channel,
        architecture:ui-screencast ;
    x0k:motivatedBy intent:67a00012-0009-6395-2b5e-7b73ef62d5c2,
        intent:b4de1cf5-62fd-ceb0-23bb-296fbbff0be4,
        intent:98a87ce7-e314-ba2a-dda1-2ba69de5521d,
        intent:840a469a-4188-4e91-7b90-ca5df339a0e6,
        intent:c40dcd0d-4914-e6f4-b81f-7231bfc5cc56 ;
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
  root's runtime, whatever the environment pins. An app that gives the plugin
  the socket's path, `ui_plugin_at`, is served at that path and nowhere else,
  and the plugin reads no environment and no profile to place it.
- The endpoint's checks run before the page hears a call: a call the offer does
  not list never reaches the page.
- The requester of a call is the socket peer's credentials, never the page's
  word.
- A page that takes state fixtures is offered with `ui/history`, which names
  no past position and says it takes fixtures. The endpoint makes
  `ui-interfaces` §4's checks before the page hears `present`; neither the
  plugin nor the page makes them again.
- `present` and `release` answer the first frame painted after the page's own
  hook, as an action does.
- What the page shows is the library's `fixture()`, so while a fixture stands
  the endpoint answers each driver action by the offer's replay policy, and a
  `non_idempotent` one is never run.
- A fixture the page ends itself, `ui.endFixture(reason)`, is answered to the
  endpoint's `fixture_ended` hook from the library's `fixtureEnded(handle)`,
  so the driver that presented it is refused its next call as
  `fixture_ended` with the page's reason, and its `release` answers `ended`.
- A driver's input is labelled with the name its sequence gives,
  `requester_name`, unless the page's look names that requester; the name is
  a label and never authority, and the colour stays the requester's.
- Every event the plugin delivers is told to the app's observer on the main
  thread before the view is handed it, so a page handler's request to the
  app always finds it told; `last_delivered` answers the last one's instant.
  The plugin's events pass no app-level dispatch: on Linux no GDK event
  handler sees them, and on macOS no `sendEvent:` (below, "Telling the host
  what it delivers").
- A driver's takeover is answered by the host's configuration,
  `UiPlugin::takeover`, after what its `before_input` declines: asked of the
  person in the page, held at once, or refused. While one is asked for or
  held, no pointer or key event of the person's reaches the page, the exit
  key ends it at once, and the page shows the hold or the ask, naming the
  requester; a capture of the frame alone shows neither (below, "Holding a
  takeover").
- A stepped screencast's frame *n* is the page at screencast time *n* ×
  1000 / fps: the plugin advances the library's stepped clock to that time,
  then holds and captures the page, so two casts of one run draw the same
  frames, and frame *n* at a rate is frame 2*n* at twice it. Its hold is a
  takeover's, ended by the person's exit key, which ends the screencast; its
  end gives the page back to the wall's clock (below, "A stepped
  screencast").

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
version = "0.3.0"
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
x0k-ui-endpoint = { path = "../x0k-ui-endpoint", version = "0.3.0" }
# The profile this process runs, which the endpoint's directory is named for.
x0k-runtime-dir = { path = "../x0k-runtime-dir", version = "0.1.0" }
# The protocol's values, which the endpoint and the page both speak.
x0k-ui-protocol = { path = "../x0k-ui-protocol", version = "0.3.0" }
# The spelling of the page's state shape, which the endpoint's fixture checks read.
x0k-datum = { version = "0.1.0" }

[target.'cfg(target_os = "linux")'.dependencies]
# WebKitGTK's snapshot, the cairo surface it answers, and that surface's PNG.
cairo-rs = { version = "0.18", features = ["png"] }
# GDK's events and GTK's main loop, which input is delivered through.
gtk = "0.18"
webkit2gtk = "2.0"

[target.'cfg(target_os = "macos")'.dependencies]
# WKWebView's snapshot, AppKit's events and images, the local event monitor a
# takeover holds the person's input back at, and CoreGraphics' pixels and
# wheel events, at the versions wry's own tree resolves.
block2 = "0.6"
objc2 = "0.6"
objc2-app-kit = { version = "0.3", default-features = false, features = ["std", "block2", "objc2-core-foundation", "objc2-core-graphics", "NSBitmapImageRep", "NSEvent", "NSGraphics", "NSGraphicsContext", "NSImage", "NSImageRep", "NSResponder", "NSScreen", "NSView", "NSWindow"] }
objc2-core-foundation = { version = "0.3", default-features = false, features = ["std", "CFCGTypes"] }
objc2-core-graphics = { version = "0.3", default-features = false, features = ["std", "CGBitmapContext", "CGColorSpace", "CGContext", "CGEvent", "CGEventSource", "CGEventTypes", "CGImage", "CGRemoteOperation"] }
objc2-foundation = { version = "0.3", default-features = false, features = ["std", "NSArray", "NSData", "NSDictionary", "NSError", "NSGeometry", "NSNotification", "NSProcessInfo", "NSString"] }
objc2-web-kit = { version = "0.3", default-features = false, features = ["std", "block2", "objc2-app-kit", "WKPreferences", "WKSnapshotConfiguration", "WKWebView", "WKWebViewConfiguration"] }

[build-dependencies]
tauri-plugin = { version = "2.7", features = ["build"] }

[dev-dependencies]
tokio = { version = "1", features = ["macros", "rt"] }
```

The crate is one plugin over six parts: the loop, the requests to the page,
the capture, the input, the takeover and the endpoint.

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
mod provenance;
#[cfg(target_os = "linux")]
mod snapshot;
#[cfg(target_os = "macos")]
#[path = "snapshot_macos.rs"]
mod snapshot;
#[cfg(target_os = "linux")]
mod takeover;
#[cfg(target_os = "macos")]
#[path = "takeover_macos.rs"]
mod takeover;
#[cfg(target_os = "macos")]
#[path = "painting_macos.rs"]
mod painting;
/// WebKitGTK has no switch that keeps a covered window painting, so there is
/// nothing to turn.
#[cfg(not(target_os = "macos"))]
mod painting {
    pub(crate) fn keep_painting<R: tauri::Runtime>(_webview: &tauri::Webview<R>, _on: bool) {}
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
pub use endpoint::{PageApp, HELD_FRAMES, UI_GLOBAL};
pub use held::{held_capture, Held, HeldCapture, HoldingHost, Refused, HOLD_TRIES};
pub use page::{endpoint_socket_path, ui_plugin, ui_plugin_at, ui_plugin_with, CoveredPainting, PageError, PageHold, PageHost, Pending, UiPlugin, PAGE_GLOBAL, PAGE_SCRIPT, PLUGIN};
pub use provenance::{last_delivered, resume_input, AskedInput, DeliveredInput, InputTurn};
/// The protocol's values a host reads: a told event is its `input::Event`.
pub use x0k_ui_protocol as protocol;
/// The host's configuration of who allows a takeover, which `UiPlugin::takeover` takes.
pub use x0k_ui_endpoint::takeover::{HoldAnswer, HoldKind, HoldMatch, HoldRule, TakeoverPolicy};
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
    /// Why the page could not paint while it was held, when it could not.
    #[serde(default)]
    pub unpainted: Option<String>,
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
    /// The protocol's word for why, when one says it: `cannot_paint`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<&'static str>,
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
part is refused. A hold that answers the page could not paint, hidden or with
no rendering update within the library's `FRAME_WAIT_MS`, is not captured: the
host verifies, which releases the page, and refuses the capture as
`cannot_paint` with the page's reason, as the library's loop does
(`x0k:implementation/ui-control/page-hold`, "When the page cannot paint"). A
snapshot of a view that does not present would show what it last painted, or
wait on a paint that never comes.

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
        if let Some(why) = held.unpainted {
            host.verify().await?;
            let refused = Some(Refused { part: "capture", code: Some("cannot_paint"), why });
            return Ok(HeldCapture { frame: held.epoch.to_string(), read: held.read, capture: None, refused, hold_ms });
        }
        let capture = host.capture().await;
        let after = host.verify().await?;
        let refuse = |why: String| Some(Refused { part: "capture", code: None, why });
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
    let refused = Some(Refused { part: "capture", code: None, why: format!("page_unsettled: epochs {}", seen.join(", ")) });
    Ok(HeldCapture { frame: last.epoch.to_string(), read: last.read, capture: None, refused, hold_ms })
}
```

Four tests pin the rule with a scripted page whose epoch moves on cue: a
moved epoch is held again, a page that never settles is refused by name, a
failed capture is refused with the platform's reason after the page is
released, and a page that could not paint is refused as `cannot_paint`, never
captured, and released.

<a name="chunk-held-tests"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#held-tests`</sub>

```rust {#held-tests}
#[cfg(test)]
mod tests {
    use super::*;

    /// A page whose epoch after each capture is the next of `after`, held at 7.
    struct Scripted { after: Vec<u64>, capture_fails: bool, verified: usize, unpainted: Option<String>, captured: usize }

    impl HoldingHost for Scripted {
        type Read = &'static str;
        type Capture = &'static str;
        type Error = String;
        async fn hold(&mut self) -> Result<Held<&'static str>, String> {
            Ok(Held { epoch: 7, read: "read", hold_ms: 1.0, unpainted: self.unpainted.clone() })
        }
        async fn capture(&mut self) -> Result<&'static str, String> {
            self.captured += 1;
            if self.capture_fails { Err("no surface".into()) } else { Ok("pixels") }
        }
        async fn verify(&mut self) -> Result<u64, String> {
            self.verified += 1;
            Ok(self.after.remove(0))
        }
    }

    #[tokio::test]
    async fn a_moved_epoch_is_held_again_and_a_still_one_answers() {
        let mut page = Scripted { after: vec![8, 7], capture_fails: false, verified: 0, unpainted: None, captured: 0 };
        let held = held_capture(&mut page, HOLD_TRIES).await.unwrap();
        assert_eq!((held.frame.as_str(), held.capture, held.refused, held.hold_ms.len()), ("7", Some("pixels"), None, 2));
    }

    #[tokio::test]
    async fn a_page_that_never_settles_is_refused_as_unsettled_with_its_read() {
        let mut page = Scripted { after: vec![8, 9, 10], capture_fails: false, verified: 0, unpainted: None, captured: 0 };
        let held = held_capture(&mut page, HOLD_TRIES).await.unwrap();
        assert_eq!(held.refused.unwrap().why, "page_unsettled: epochs 7→8, 7→9, 7→10");
        assert_eq!((held.read, held.capture), ("read", None));
    }

    #[tokio::test]
    async fn a_failed_capture_is_refused_with_its_reason_after_the_page_is_released() {
        let mut page = Scripted { after: vec![7], capture_fails: true, verified: 0, unpainted: None, captured: 0 };
        let held = held_capture(&mut page, HOLD_TRIES).await.unwrap();
        assert_eq!(held.refused.unwrap().why, "capture failed: no surface");
        assert_eq!(page.verified, 1);
    }

    #[tokio::test]
    async fn a_page_that_could_not_paint_is_refused_as_cannot_paint_uncaptured_and_released() {
        let mut page = Scripted { after: vec![7], capture_fails: false, verified: 0, unpainted: Some("the page is hidden".into()), captured: 0 };
        let held = held_capture(&mut page, HOLD_TRIES).await.unwrap();
        assert_eq!(held.refused, Some(Refused { part: "capture", code: Some("cannot_paint"), why: "the page is hidden".into() }));
        assert_eq!((held.read, held.capture, page.captured, page.verified), ("read", None, 0, 1));
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
webview it went to and the Tauri channel its answer goes back on.

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

<a name="chunk-page-host"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#page-host` · assembles [page-drawing](#chunk-page-drawing) · [page-takeover](#chunk-page-takeover) · [evaluate](#chunk-evaluate) · [perform](#chunk-perform)</sub>

```rust {#page-host}
/// A webview's page, as the host that holds it: requests over Tauri's IPC
/// with a nonce each, and the platform's capture.
pub struct PageHost<R: Runtime> {
    webview: Webview<R>,
    /// What the host draws of drivers' input over this page.
    presentation: Shared,
    /// The name each requester's latest sequence gives it, which its label shows.
    names: Names,
    /// Whether a task is fading the drawing.
    fading: Arc<AtomicBool>,
    /// The view's width in its own units, as the last capture measured it,
    /// as an `f64`'s bits; 0 until a capture.
    units: Arc<AtomicU64>,
    /// Set once the person's input is held back while a takeover stands.
    gate: tokio::sync::OnceCell<()>,
}

impl<R: Runtime> PageHost<R> {
    pub fn new(webview: Webview<R>) -> Self {
        let (presentation, names, fading, units) = (Shared::default(), Names::default(), Arc::default(), Arc::default());
        Self { webview, presentation, names, fading, units, gate: tokio::sync::OnceCell::new() }
    }

    /// The webview whose page this is.
    pub fn webview(&self) -> &Webview<R> {
        &self.webview
    }

    <<page-drawing>>

    <<page-takeover>>

    /// Run `body` in the page, waiting the default time for its answer.
    pub async fn evaluate(&self, body: &str) -> Result<String, PageError> {
        self.evaluate_within(body, ANSWER_TIMEOUT).await
    }

    <<evaluate>>

    /// Why the page cannot paint now, when it cannot: its window is minimised
    /// or hidden, as the window itself says, or the page says it cannot
    /// (the library's `unpainted()`), as for a window WebKit counts as covered.
    pub async fn cannot_paint(&self) -> Option<String> {
        let window = self.webview.window();
        if window.is_minimized().unwrap_or(false) {
            return Some("the window is minimised".to_string());
        }
        if !window.is_visible().unwrap_or(true) {
            return Some("the window is hidden".to_string());
        }
        match self.evaluate(&format!("return JSON.stringify(globalThis.{PAGE_GLOBAL}.unpainted() ?? null);")).await {
            Ok(answer) => serde_json::from_str(&answer).unwrap_or_default(),
            Err(error) => {
                tracing::warn!(%error, "ui_tauri.page.paint_unanswered");
                None
            }
        }
    }

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
in the profile's runtime directory (`endpoint_socket_path`, below). An app
that places its endpoint itself gives the plugin the socket's path,
`ui_plugin_at(path, webview, covered)`, and the plugin binds there and nowhere
else. It reads no environment variable and no profile for it, so an app that
binds one endpoint per instance under its own state directory needs neither
`X0K_UI_CONTROL_ENDPOINT_DIR` nor x0k's profile. The path's directory is made
if it is missing, and a socket left there by an app that has gone is
replaced, as at the default path.

**What an app adds.** An app adds the plugin to its builder, and its window's
capability grants the plugin's default permission, `x0k-ui-tauri:default`:

```text
tauri::Builder::default()
    .plugin(x0k_ui_tauri::ui_plugin("chariot", "main"))
    // or, one endpoint per instance under the app's own state directory:
    .plugin(x0k_ui_tauri::ui_plugin_at(state_dir.join("ui-control.endpoint"), "main", CoveredPainting::default()))
    // or, told of every event the plugin delivers, and letting the agents it
    // started take over its window without asking:
    .plugin(x0k_ui_tauri::UiPlugin::at(state_dir.join("ui-control.endpoint"), "main")
        .covered(CoveredPainting::WhileDriven)
        .on_input(|told: &DeliveredInput| record(told))
        .takeover(TakeoverPolicy::default()
            .rule(HoldMatch { started_by_host: Some(true), ..HoldMatch::default() }, HoldAnswer::Allow)
            .started_by_host(move |pid| agents.contains(&pid)))
        .dev_instance(cfg!(debug_assertions))
        .build())
```

The three functions are thin forms of the builder, `UiPlugin`, which also
takes the host's observer of the input it delivers (below, "Telling the host
what it delivers"), its configuration of who allows a takeover (below,
"Holding a takeover"), and whether the app runs as a dev instance,
`.dev_instance(true)`, which the offer says (below, "The endpoint"). Only the
app decides that, when it starts: a build or a window that no one's live work
runs in, such as chariot's dev window. A dev instance may show a fixture
without the fixture mark, when a `present` asks `mark: false`, so a recording
of the screen the person sees shows the app as it will look.

Its page installs the library (`globalThis.__x0kUi.install`), declares its
actions and its state, and may take state fixtures, decline a call while one
stands, and end one itself with `ui.endFixture(reason)`
(`x0k:implementation/ui-control/page-answer`). A driver that names itself in
`requester_name` is labelled so over the window, unless the page's look names
it first.

<a name="chunk-plugin"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#plugin`</sub>

```rust {#plugin}
/// The in-page library as a classic script: its `pageScript()`, carried.
pub const PAGE_SCRIPT: &str = include_str!("../page-script.js");

/// When the plugin keeps a covered window painting, by the macOS host's two
/// switches ("Keeping a covered window painting", below). Elsewhere there is
/// no switch, and each is the same.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum CoveredPainting {
    /// While a driver is connected to the endpoint: on when the first one
    /// connects, and WebKit's own policy back when the last one leaves.
    #[default]
    WhileDriven,
    /// From when the webview is made, for its life, for an app that is
    /// remote-controlled from its start.
    FromCreation,
    /// Never: WebKit's own policy throughout.
    Off,
}

/// The plugin, as an app builds it: where its endpoint is served, which
/// webview it serves, when a covered window keeps painting, and who is told
/// of the input it delivers.
pub struct UiPlugin {
    endpoint: PathBuf,
    webview: String,
    covered: CoveredPainting,
    observer: Option<InputObserver>,
    before: Option<BeforeInput>,
    takeover: TakeoverPolicy,
    dev_instance: bool,
}

impl UiPlugin {
    /// `app`'s plugin for the webview labelled `webview`, its endpoint on the
    /// unix socket [`endpoint_socket_path`] names for `app`.
    pub fn new(app: &str, webview: impl Into<String>) -> Self {
        Self::at(endpoint_socket_path(app), webview)
    }

    /// The plugin serving its endpoint on the unix socket at `endpoint` and
    /// nowhere else. It reads no environment and no profile to place it.
    pub fn at(endpoint: impl Into<PathBuf>, webview: impl Into<String>) -> Self {
        Self {
            endpoint: endpoint.into(),
            webview: webview.into(),
            covered: CoveredPainting::default(),
            observer: None,
            before: None,
            takeover: TakeoverPolicy::default(),
            dev_instance: false,
        }
    }

    /// Keep a covered window painting as `covered` says.
    pub fn covered(self, covered: CoveredPainting) -> Self {
        Self { covered, ..self }
    }

    /// Tell `observer` of every event the plugin delivers into a webview.
    ///
    /// It is called synchronously on the main thread, once per event, after
    /// the platform event is made and before the view is handed it, so any
    /// page handler the event triggers, and any request that handler sends
    /// the host, runs after `observer` returned. A move the watchable pace
    /// draws on its way is an event too. `last_delivered` already answers the
    /// event when `observer` is called. `observer` must not block or panic:
    /// the view waits for it.
    pub fn on_input(self, observer: impl Fn(&DeliveredInput) + Send + Sync + 'static) -> Self {
        Self { observer: Some(Arc::new(observer)), ..self }
    }

    /// Ask `before` of every sequence of input the endpoint has checked,
    /// before any of it runs: `Run`, `Decline` it as `declined` with a
    /// reason, or `Wait` for [`resume_input`] at most a while. It is asked on
    /// the async runtime and must answer at once.
    pub fn before_input(self, before: impl Fn(&AskedInput<'_>) -> InputTurn + Send + Sync + 'static) -> Self {
        Self { before: Some(Arc::new(before)), ..self }
    }

    /// Answer a driver's takeover by `policy`, the host's configuration of
    /// who allows one (`ui-control-channel` §10): ask the person, hold the
    /// window without asking, or refuse. With none given, every takeover asks.
    pub fn takeover(self, policy: TakeoverPolicy) -> Self {
        Self { takeover: policy, ..self }
    }

    /// Say in the offer whether the app runs as a dev instance, which no
    /// one's live work runs in (`ui-interfaces` §5). Only the app decides
    /// it, when it starts; a dev instance honours a `present` asking
    /// `mark: false`, and every other instance refuses it as `mark_required`.
    pub fn dev_instance(self, dev_instance: bool) -> Self {
        Self { dev_instance, ..self }
    }

    /// The plugin: the in-page library injected before the page's own
    /// scripts in the main frame of every page. Once the webview has loaded
    /// its first page, the plugin serves it as the app's UI-control endpoint.
    pub fn build<R: Runtime>(self) -> TauriPlugin<R> {
        let Self { endpoint, webview: label, covered, observer, before, takeover, dev_instance } = self;
        let served = AtomicBool::new(false);
        let made = label.clone();
        Builder::new(PLUGIN)
            .js_init_script(PAGE_SCRIPT.to_string())
            .invoke_handler(tauri::generate_handler![page_answer])
            .setup(move |app, _| {
                app.manage(Pending::default());
                app.manage(Provenance::new(observer, before));
                Ok(())
            })
            .on_webview_ready(move |webview| {
                if covered == CoveredPainting::FromCreation && webview.label() == made {
                    crate::painting::keep_painting(&webview, true);
                }
            })
            .on_page_load(move |webview, payload| {
                let first = payload.event() == PageLoadEvent::Finished && webview.label() == label && !served.swap(true, Ordering::SeqCst);
                #[cfg(any(target_os = "linux", target_os = "macos"))]
                if first {
                    let driven = covered == CoveredPainting::WhileDriven;
                    tauri::async_runtime::spawn(crate::endpoint::serve(endpoint.clone(), webview.clone(), driven, takeover.clone(), dev_instance));
                }
                #[cfg(not(any(target_os = "linux", target_os = "macos")))]
                let _ = (first, &endpoint, covered, &takeover, dev_instance);
            })
            .build()
    }
}

/// The plugin, served on the unix socket [`endpoint_socket_path`] names for
/// `app`, keeping a covered window painting while a driver is connected:
/// `UiPlugin::new(app, webview).build()`.
pub fn ui_plugin<R: Runtime>(app: &str, webview: impl Into<String>) -> TauriPlugin<R> {
    UiPlugin::new(app, webview).build()
}

/// The plugin, keeping a covered window painting as `covered` says.
pub fn ui_plugin_with<R: Runtime>(app: &str, webview: impl Into<String>, covered: CoveredPainting) -> TauriPlugin<R> {
    UiPlugin::new(app, webview).covered(covered).build()
}

/// The plugin, serving its endpoint on the unix socket at `endpoint` and
/// nowhere else, keeping a covered window painting as `covered` says.
pub fn ui_plugin_at<R: Runtime>(endpoint: impl Into<PathBuf>, webview: impl Into<String>, covered: CoveredPainting) -> TauriPlugin<R> {
    UiPlugin::at(endpoint, webview).covered(covered).build()
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

<a name="chunk-page-file"></a><sub>[`src/page.rs`](../../crates/x0k-ui-tauri/src/page.rs) · `#page-file` · assembles [page-error](#chunk-page-error) · [pending](#chunk-pending) · [plugin](#chunk-plugin) · [endpoint-path](#chunk-endpoint-path) · [answer-command](#chunk-answer-command) · [page-host](#chunk-page-host) · [request-script](#chunk-request-script) · [settle](#chunk-settle) · [holding](#chunk-holding) · [paint-drawn](#chunk-paint-drawn) · [person](#chunk-person) · [ask-card](#chunk-ask-card) · [person-tests](#chunk-person-tests)</sub>

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

use x0k_ui_endpoint::takeover::TakeoverPolicy;
use x0k_ui_protocol::input::{Event, Pace, Perform, Resolved, TickFault, TAKEOVER_ASK_MS, WATCHABLE_PRESS_MS};
use x0k_ui_protocol::presentation::{faded, watchable_way, InputPresentation, Takeover, MARK_FOR};

use crate::held::{held_capture, Held, HeldCapture, HoldingHost, HOLD_TRIES};
use crate::provenance::{AskedInput, BeforeInput, DeliveredInput, InputObserver, InputTurn, Provenance, Teller};
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

/// How long the person has to answer a takeover's ask.
const TAKEOVER_ASK_WAIT: Duration = Duration::from_millis(TAKEOVER_ASK_MS);
/// How often a waiting ask looks for the person's answer.
const TAKEOVER_ASK_POLL: Duration = Duration::from_millis(50);

/// What a page's host draws of drivers' input, shared with the task that fades it.
pub(crate) type Shared = Arc<Mutex<InputPresentation>>;
/// The name each requester gives itself (`Perform::requester_name`), by requester.
type Names = Arc<Mutex<HashMap<String, String>>>;

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

<<person>>

<<ask-card>>

<<person-tests>>
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
Tauri channel. The snapshot paints the visible region afresh from the page as it
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
last tick has been delivered, the plugin asks the library's `settled()`,
which listens for input and answers when rendering updates have passed with
none arriving, or after a second at most
(`x0k:implementation/ui-control/page-hold`, "When the page cannot paint"). It
answers the page's epoch then, so an observation after it sees what the input
did. A page that is or becomes hidden ends the settle at once with its
reason; the plugin then answers no frame, since none shows what the input did,
and the driver's next call is refused as `cannot_paint`.

Only `mouse`, `key` and `wheel` sources are delivered. The plugin names them to
the endpoint (`delivers`, below), which refuses a `pen` or a `touch` source as
`undeliverable_source` before any of the sequence runs; the plugin's own
input path refuses them by name too.

`perform` is what the endpoint calls with a sequence `check_perform` has
passed: the sequence, the positions `check_perform` resolved for it, and the
scale of the capture its frame names.

<a name="chunk-perform"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#perform`</sub>

```rust {#perform}
/// Deliver `perform` into the page through the platform's input path, drawn
/// for `requester` over the window as it lands, and answer the page's epoch
/// once its input has settled, or `None` when the page could not paint the
/// frame that shows it. `resolved` is what `check_perform` answered for
/// it, in the frame's capture pixels, and `scale` is that frame's capture's
/// pixels per widget unit (`Snapshot::scale`).
pub async fn perform(&self, requester: &str, perform: &Perform, resolved: &[Resolved], scale: f64) -> Result<Option<u64>, PageError> {
    #[cfg(target_os = "linux")]
    let ticks = crate::input::gdk_ticks(perform, resolved, scale)?;
    #[cfg(target_os = "macos")]
    let ticks = crate::input::appkit_ticks(perform, resolved, scale)?;
    let shown = x0k_ui_protocol::input::ticks(perform, resolved, scale)?;
    self.named(requester, perform.requester_name.as_deref());
    let teller = Teller::new(&self.webview, requester, perform.requester_name.as_deref());
    let watchable = perform.presented() && perform.pace == Pace::Watchable;
    let mut last = HashMap::new();
    for (tick, events) in ticks.into_iter().zip(&shown) {
        let paired: Vec<_> = tick.events.into_iter().zip(events.events.iter().cloned()).collect();
        if watchable {
            for (synth, event) in paired {
                self.travel(requester, &event, &mut last, &teller).await?;
                self.draw(requester, &event);
                crate::input::deliver(&self.webview, vec![(synth, event)], teller.clone()).await?;
            }
        } else {
            if perform.presented() {
                paired.iter().for_each(|(_, event)| self.draw(requester, event));
            }
            crate::input::deliver(&self.webview, paired, teller.clone()).await?;
        }
        if tick.pause_ms > 0 {
            tokio::time::sleep(Duration::from_millis(tick.pause_ms.into())).await;
        }
    }
    if perform.presented() {
        self.keep_fading();
    }
    let body = format!("const hold = globalThis.{PAGE_GLOBAL}; const unpainted = await hold.settled(); return JSON.stringify({{ epoch: hold.epoch(), unpainted: unpainted ?? null }});");
    let settled: Settled = serde_json::from_str(&self.evaluate(&body).await?).map_err(|e| PageError::Malformed(e.to_string()))?;
    match settled.unpainted {
        Some(why) => {
            tracing::info!(%why, epoch = settled.epoch, "ui_tauri.input.unpainted");
            Ok(None)
        }
        None => Ok(Some(settled.epoch)),
    }
}
```

<a name="chunk-settle"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#settle`</sub>

```rust {#settle}
/// What the library's settle answers: the epoch then, and why the page could
/// not paint, when it could not.
#[derive(serde::Deserialize)]
struct Settled {
    epoch: u64,
    unpainted: Option<String>,
}
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
pub(crate) const DELIVERED: &[&str] = &["mouse", "key", "wheel"];

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
where GTK's window hands it to its focus widget. Each event goes with the
protocol's event it was made from, which the host is told of once the
`GdkEvent` is made (below, "Telling the host what it delivers").
`gtk_main_do_event` then dispatches it, marked as the plugin's while it does,
so a takeover holds back the person's input and never the plugin's (below,
"Holding a takeover").

<a name="chunk-input-deliver"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#input-deliver`</sub>

```rust {#input-deliver}
/// Deliver one tick's events to the webview's widget on GTK's main thread,
/// each with the protocol's event `teller` tells the host of first.
pub(crate) async fn deliver<R: Runtime>(webview: &Webview<R>, events: Vec<(Synth, Event)>, teller: Teller) -> Result<(), PageError> {
    if events.is_empty() {
        return Ok(());
    }
    let (done, delivered) = oneshot::channel();
    webview.with_webview(move |platform| {
        let _ = done.send(synthesize(platform.inner().upcast_ref(), &events, &teller));
    })?;
    delivered.await.map_err(|_| PageError::InputDropped)?
}

/// Make each event as GDK makes a real one, tell the host of it, and hand it
/// to GTK's dispatch.
fn synthesize(view: &gtk::Widget, events: &[(Synth, Event)], teller: &Teller) -> Result<(), PageError> {
    let window = view.window().ok_or(PageError::NoWindow)?;
    let toplevel = view.toplevel().and_then(|top| top.window()).ok_or(PageError::NoWindow)?;
    let display = window.display();
    let seat = display.default_seat().ok_or(PageError::NoWindow)?;
    let keymap = gdk::Keymap::for_display(&display);
    let time = (glib::monotonic_time() / 1000) as u32;
    for (event, told) in events {
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
        teller.tell(told, f64::from(time));
        crate::takeover::delivering(|| gtk::main_do_event(&mut made));
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
use crate::provenance::Teller;

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
pub(crate) const DELIVERED: &[&str] = &["mouse", "key", "wheel"];

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
As on Linux, each event goes with the protocol's event it was made from,
which the host is told of once the `NSEvent` is made and before the view's
responder method is called.

<a name="chunk-mac-input-deliver"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#mac-input-deliver`</sub>

```rust {#mac-input-deliver}
/// Deliver one tick's events to the WKWebView on the main thread, each with
/// the protocol's event `teller` tells the host of first.
pub(crate) async fn deliver<R: Runtime>(webview: &Webview<R>, events: Vec<(Synth, Event)>, teller: Teller) -> Result<(), PageError> {
    if events.is_empty() {
        return Ok(());
    }
    let (done, delivered) = oneshot::channel();
    webview.with_webview(move |platform| {
        // SAFETY: on macOS `inner()` is the webview's WKWebView, which Tauri
        // keeps alive while this closure runs on the main thread.
        let view = unsafe { &*platform.inner().cast::<WKWebView>() };
        let _ = done.send(synthesize(view, &events, &teller));
    })?;
    delivered.await.map_err(|_| PageError::InputDropped)?
}

/// Make each event with AppKit's constructors, tell the host of it, and hand
/// it to the view's own responder method, as the window hands it a person's.
/// No event passes `NSApplication`'s or `NSWindow`'s `sendEvent:`.
fn synthesize(view: &WKWebView, events: &[(Synth, Event)], teller: &Teller) -> Result<(), PageError> {
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
    for (event, told) in events {
        match event {
            Synth::Mouse { kind, x, y, flags } => {
                let down = [NSEventType::LeftMouseDown, NSEventType::RightMouseDown, NSEventType::OtherMouseDown].contains(kind);
                let made = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
                    *kind, in_window(*x, *y), *flags, time, number, None, 0, 1, if down { 1.0 } else { 0.0 },
                )
                .ok_or(PageError::InputDropped)?;
                teller.tell(told, time);
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
                teller.tell(told, time);
                match *kind {
                    NSEventType::KeyDown => view.keyDown(&made),
                    NSEventType::KeyUp => view.keyUp(&made),
                    _ => view.flagsChanged(&made),
                }
            }
            Synth::Scroll { x, y, dx, dy, flags } => {
                let made = wheel(in_window(*x, *y), number, time, *dx, *dy, *flags)?;
                teller.tell(told, time);
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
use crate::provenance::Teller;

<<mac-input-events>>

<<mac-input-keys>>

<<mac-input-deliver>>

<<mac-input-wheel>>

<<mac-input-tests>>
```

### Keeping a covered window painting

WebKit on macOS counts a window as hidden when it is covered by another,
minimised, off screen or on another Space. The page's
`document.visibilityState` then reads `hidden` and its animation frames stop
until the window comes forward, so before the library bounded its waits, an
observation and an action of a covered window waited out the plugin's 5 s and
failed. The snapshot itself is not the cause: `takeSnapshot` answers whenever
the page paints, with no Screen Recording grant. This is chariot's research of
2026-11-10, from the projects listed below; of the window states, only a
window on another Space is measured on the Mac (below, "What is shown, and
what is open").

Two switches keep a covered window painting. Both are needed (reported):

1. **`-[WKWebView _setWindowOcclusionDetectionEnabled:NO]`**, private. WebKit
   then stops counting a covered window as hidden, so the page keeps painting
   and its frames run. One project measured 0 frames a second for a fully
   covered window before and 62 after; another reports the same for a window
   on another Space. It only stores a flag, which WebKit reads at the
   window's next visibility event (below).
2. **`WKPreferences.inactiveSchedulingPolicy = .none`**, public from macOS
   14. It stops WebKit suspending a hidden page's process; one report saw
   the default policy stop a hidden page after a few minutes. It does not
   restart animation frames by itself. Its header says it governs a web view
   "inactive and detached from the view hierarchy". Tauri's
   `backgroundThrottling: "disabled"` sets it through wry when the window is
   made.

The plugin turns both on while a driver is connected to the endpoint, and
gives WebKit its own policy back when the last driver leaves
(`CoveredPainting::WhileDriven`, the default). WebKit reads whether its view
is visible only when the window tells it something changed: an occlusion
change, ordering on or off screen, minimising, a change of Space
(`WKWindowVisibilityObserver` in WebKit's `WebViewImpl.mm`; the reading is
`PageClientImpl::isViewVisible`). The switch alone would leave a window that
is already off screen when the driver connects reading `hidden`, so after
turning it either way the plugin posts the window's
`NSWindowDidChangeOcclusionStateNotification`, and WebKit, with the window's
delegate, reads the window's state again at once. An app that is driven from
its start can ask for both switches from when its webview is made, for its
life, with `ui_plugin_with(app, label, CoveredPainting::FromCreation)`; the
plugin sets them as Tauri hands it the new webview, which is the earliest a
plugin is told of it. `CoveredPainting::Off` leaves WebKit's policy alone.

The private selector is guarded: the plugin sends it only to a view that
answers it, and logs whether it did, so a WebKit without it costs nothing but
the switch. A test on macOS fails if `WKWebView` stops answering it, so a
WebKit update that drops it reads red rather than as covered windows going
silent again. The policy is set only on preferences that answer its setter,
which is macOS 14 and later. On switching off, the plugin turns occlusion
detection back on, WebKit's default, and puts back the policy it found.

What still cannot paint, a minimised window, a locked screen, a sleeping
display, is refused as `cannot_paint` at once: the window's own state, or the
library's word that the page is hidden.

<a name="chunk-mac-painting"></a><sub>[`src/painting_macos.rs`](../../crates/x0k-ui-tauri/src/painting_macos.rs) · `#mac-painting`</sub>

```rust {#mac-painting file="src/painting_macos.rs"}
//! The macOS host's switches that keep a covered WKWebView painting.
use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};

use objc2::runtime::{NSObjectProtocol, Sel};
use objc2::{msg_send, sel};
use objc2_app_kit::NSWindowDidChangeOcclusionStateNotification;
use objc2_foundation::NSNotificationCenter;
use objc2_web_kit::{WKInactiveSchedulingPolicy, WKWebView};
use tauri::{Runtime, Webview};

/// WebKit's private setter of whether a covered window counts as hidden.
pub(crate) fn occlusion_detection() -> Sel {
    sel!(_setWindowOcclusionDetectionEnabled:)
}

/// The scheduling policy each view had when the plugin switched it, by the
/// view's address, so switching off puts it back.
static FOUND: Mutex<Option<HashMap<usize, WKInactiveSchedulingPolicy>>> = Mutex::new(None);

/// Keep `webview` painting while it is covered when `on`, or give WebKit its
/// own policy back. Each switch is turned only where the view answers it.
pub(crate) fn keep_painting<R: Runtime>(webview: &Webview<R>, on: bool) {
    let switched = webview.with_webview(move |platform| {
        // SAFETY: on macOS `inner()` is the webview's WKWebView, which Tauri
        // keeps alive while this closure runs on the main thread.
        let view = unsafe { &*platform.inner().cast::<WKWebView>() };
        let occlusion = view.respondsToSelector(occlusion_detection());
        if occlusion {
            // SAFETY: the view answers the selector, just asked; it takes one
            // BOOL and returns nothing.
            let () = unsafe { msg_send![view, _setWindowOcclusionDetectionEnabled: !on] };
            // WebKit reads whether the view is visible again only on the
            // window's next visibility event: the window's occlusion
            // notification makes it, and the window's delegate, read now.
            if let Some(window) = view.window() {
                // SAFETY: the name is AppKit's constant and the window is the
                // view's own, alive on the main thread.
                unsafe { NSNotificationCenter::defaultCenter().postNotificationName_object(NSWindowDidChangeOcclusionStateNotification, Some(&window)) };
            }
        }
        // SAFETY: the configuration and its preferences are the view's own,
        // alive with it, read on the main thread.
        let preferences = unsafe { view.configuration().preferences() };
        let scheduling = preferences.respondsToSelector(sel!(setInactiveSchedulingPolicy:));
        if scheduling {
            let key = std::ptr::from_ref(view) as usize;
            // SAFETY: the preferences answer the property's setter, just
            // asked, so they hold the property (macOS 14 and later).
            let current = unsafe { preferences.inactiveSchedulingPolicy() };
            let mut found = FOUND.lock().unwrap_or_else(PoisonError::into_inner);
            let found = found.get_or_insert_with(HashMap::new);
            let policy = if on {
                found.entry(key).or_insert(current);
                WKInactiveSchedulingPolicy::None
            } else {
                found.remove(&key).unwrap_or(current)
            };
            // SAFETY: the preferences answer this setter, just asked.
            unsafe { preferences.setInactiveSchedulingPolicy(policy) };
        }
        tracing::info!(on, occlusion, scheduling, "ui_tauri.painting.switched");
    });
    if let Err(error) = switched {
        tracing::warn!(%error, on, "ui_tauri.painting.unswitched");
    }
}

#[cfg(test)]
mod tests {
    use objc2::ClassType;

    use super::*;

    #[test]
    fn wkwebview_still_answers_the_private_occlusion_switch() {
        assert!(WKWebView::class().responds_to(occlusion_detection()), "WKWebView no longer answers _setWindowOcclusionDetectionEnabled:");
    }
}
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

A sequence may name its requester for a person to read, `requester_name`
(`ui-interfaces` §6). The plugin keeps the name each requester's latest
sequence gives and sends it with that requester's pointer. The layer labels
the pointer with the look's name for the requester first, then that name,
then the requester as it is, by `InputLook::name_given`'s order; the label's
rule lives in the layer alone, so the plugin resolves no name. The colour
stays keyed by the requester, so two drivers that give one name still take
two colours, and the name decides nothing the endpoint checks.

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
    paint_drawn(&self.webview, &self.presentation, &self.names, &self.units);
}

/// `requester`'s sequence names it `given`, or names it nothing.
pub(crate) fn named(&self, requester: &str, given: Option<&str>) {
    let mut names = self.names.lock().unwrap_or_else(PoisonError::into_inner);
    match given {
        Some(given) => names.insert(requester.to_string(), given.to_string()),
        None => names.remove(requester),
    };
}

/// Prune and paint the drawing until it has faded, in one task at a time.
fn keep_fading(&self) {
    if self.fading.swap(true, Ordering::SeqCst) {
        return;
    }
    let (webview, presentation, names, fading, units) =
        (self.webview.clone(), self.presentation.clone(), self.names.clone(), self.fading.clone(), self.units.clone());
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(FADE_STEP).await;
            let still = presentation.lock().unwrap_or_else(PoisonError::into_inner).prune(Instant::now());
            paint_drawn(&webview, &presentation, &names, &units);
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
async fn travel(&self, requester: &str, event: &Event, last: &mut HashMap<String, (f64, f64)>, teller: &Teller) -> Result<(), PageError> {
    match event {
        Event::Move { source, x, y, held } => {
            let from = last.insert(source.clone(), (*x, *y)).unwrap_or((*x, *y));
            let (way, each) = watchable_way(from, (*x, *y));
            for (wx, wy) in way {
                let step = Event::Move { source: source.clone(), x: wx, y: wy, held: *held };
                self.draw(requester, &step);
                crate::input::deliver(&self.webview, vec![(crate::input::synth(&step), step.clone())], teller.clone()).await?;
                tokio::time::sleep(each).await;
            }
        }
        Event::Press { .. } | Event::KeyDown { .. } => tokio::time::sleep(Duration::from_millis(WATCHABLE_PRESS_MS)).await,
        _ => {}
    }
    Ok(())
}
```

**The fixture mark.** While a state fixture stands, the plugin marks the
window (`x0k:architecture/ui-interfaces` §4): the protocol's band and notice,
drawn on the same layer, so a person never takes a fixture for the live page,
and a capture of the frame alone, whose hold hides the layer, shows none. The
mark is part of the protocol's `InputPresentation`, so a capture that shows it
says it carries the drawing. The endpoint has refused a `present` asking
`mark: false` before the plugin hears it, unless the app runs as a dev
instance (below, "The endpoint"), so the plugin marks every fixture the page
presents except one a dev instance was asked to leave unmarked.

The page may end a fixture itself, which the plugin hears only when it next
asks. The library's layer knows at once: it draws the plugin's mark only
while the fixture the mark names stands
(`x0k:implementation/ui-control/page-hold`, "The host's drawing layer"). The
plugin drops its own record of the mark whenever the page says it shows
anything else, before a capture says whether it carries the drawing.

<a name="chunk-page-drawing-2"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#page-drawing` · continues</sub>

```rust {#page-drawing}

/// Mark the fixture `handle` over the page while it stands, or mark none.
pub fn mark_fixture(&self, handle: Option<&str>) {
    self.presentation.lock().unwrap_or_else(PoisonError::into_inner).mark_fixture(handle);
    self.repaint();
}

/// The fixture the plugin marks over the page now.
pub fn fixture_mark(&self) -> Option<String> {
    self.presentation.lock().unwrap_or_else(PoisonError::into_inner).fixture_mark().map(str::to_string)
}
```

A paint is one script the page runs: the layer's `paint` with the drawing as
JSON. Tauri's `eval` sends it from any thread and answers nothing, so a paint
never waits on the page. A page that has not installed the library yet paints
nothing. A takeover asked for or held is part of every paint (below, "Holding
a takeover").

<a name="chunk-paint-drawn"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#paint-drawn`</sub>

```rust {#paint-drawn}
/// Paint `presentation` on the in-page library's drawing layer, in the view's
/// units, the view being `units` wide (an `f64`'s bits), each pointer with the
/// name its requester gives itself, when it gives one.
fn paint_drawn<R: Runtime>(webview: &Webview<R>, presentation: &Shared, names: &Names, units: &AtomicU64) {
    let now = Instant::now();
    let drawing = {
        let mut shown = presentation.lock().unwrap_or_else(PoisonError::into_inner);
        let names = names.lock().unwrap_or_else(PoisonError::into_inner);
        let (pointers, clicks, keys) = (shown.pointers().cloned().collect::<Vec<_>>(), shown.clicks().to_vec(), shown.keys().cloned());
        serde_json::json!({
            "units": f64::from_bits(units.load(Ordering::SeqCst)),
            "pointers": pointers.iter().map(|p| serde_json::json!({ "requester": p.requester, "name": names.get(&p.requester), "at": p.at, "pressed": p.pressed, "hue": shown.hue(&p.requester) })).collect::<Vec<_>>(),
            "clicks": clicks.iter().map(|c| serde_json::json!({ "at": c.at, "gone": faded(c.since, now, MARK_FOR), "hue": shown.hue(&c.requester) })).collect::<Vec<_>>(),
            "keys": keys.map(|k| serde_json::json!({ "requester": k.requester, "text": k.text, "gone": faded(k.since, now, MARK_FOR), "hue": shown.hue(&k.requester) })),
            "takeover": drawn_takeover(&mut shown, &names, f64::from_bits(units.load(Ordering::SeqCst))),
            "fixture": shown.fixture_mark(),
        })
    };
    if let Err(error) = webview.eval(format!("globalThis.{PAGE_GLOBAL}?.drawn.paint({drawing});")) {
        tracing::debug!(%error, "ui_tauri.drawn.unpainted");
    }
}
```

## Holding a takeover

A driver may ask to take over the window for one sequence: while the
sequence runs, the person's own clicks and keys do not reach the page, so
they cannot land in the middle of the driver's held button or typed word
(`x0k:architecture/ui-control-channel` §10). Who allows one is the host's
configuration of its endpoint (`x0k:implementation/ui-control/takeover`),
which an app hands the plugin with `UiPlugin::takeover`. The endpoint reads
it after its own checks and after what the host's `before_input` declines,
so a sequence the host declines is refused as `declined` under every
answer, and then:

- **`allow`**: the plugin holds the window for the requester at once and
  draws the hold.
- **`ask`**, the answer with nothing configured: the plugin draws the ask
  over the page, a card naming the requester with two buttons, Allow and
  Refuse, and waits up to the protocol's `TAKEOVER_ASK_MS`, 30 s, for the
  person's answer. Only a person's input answers it: a click on Allow
  grants the takeover, and a click on Refuse or the exit key, Escape,
  refuses it. No answer in time is a no, and the ask is withdrawn. A
  refused ask is `takeover_not_granted`, naming the requester.
- **`refuse`**: the endpoint refuses the takeover as `takeover_not_granted`,
  naming the requester and the configuration, and the plugin draws nothing.

The ask is drawn in the page, not in a window of its own, because the page's
drawing layer is where a person at the window already looks for what a
driver does, and the plugin can tell the person's click on it from the
driver's (below). The answer is the person's, never the driver's: a
driver's click on Allow is delivered to the page under the card, which
answers nothing.

What the person sees is the same however the takeover came to hold. A held
takeover draws a band in the requester's colour around the page and a
notice at its top: "*name* has taken over · Esc to end", the name by the
look's rule for a pointer's label (`InputLook::name_given`: the look's own
name for the requester, else the name its sequence gives, else the
requester). The exit key ends the hold at once, and the rest of the
sequence runs with the person's input reaching the page again. Ending it
changes no rule: the requester's next takeover is answered as before. The
hold ends when the sequence answers.

Both are drawn on the library's drawing layer, so a capture shows them as
the person saw them, and a capture of the frame alone, whose hold hides
the layer, carries neither (`x0k:implementation/ui-control/page-hold`,
"The host's drawing layer"). Both are part of the protocol's
`InputPresentation`, so a capture that shows one says it carries the
drawing. The offer says the plugin holds a takeover, on Linux and macOS.

<a name="chunk-page-takeover"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#page-takeover`</sub>

```rust {#page-takeover}
/// Hold the window's input for `requester` without asking, as the host's
/// configuration allows, and draw the hold. False while another takeover is
/// asked for or held, or when the person's input cannot be held back.
pub async fn hold_takeover(&self, requester: &str) -> bool {
    if let Err(error) = self.gate().await {
        tracing::warn!(%error, "ui_tauri.takeover.ungated");
        return false;
    }
    let held = self.presentation.lock().unwrap_or_else(PoisonError::into_inner).hold_takeover(requester);
    self.repaint();
    held
}

/// Ask the person to grant `requester` a takeover, drawing the ask, and
/// wait up to `TAKEOVER_ASK_MS` for their answer: Allow grants it; Refuse,
/// the exit key or no answer in time refuses it, and the ask is withdrawn.
pub async fn ask_takeover(&self, requester: &str) -> bool {
    if let Err(error) = self.gate().await {
        tracing::warn!(%error, "ui_tauri.takeover.ungated");
        return false;
    }
    if !self.presentation.lock().unwrap_or_else(PoisonError::into_inner).ask_takeover(requester) {
        return false;
    }
    self.repaint();
    let asked = Instant::now();
    loop {
        let standing = self.presentation.lock().unwrap_or_else(PoisonError::into_inner).takeover().clone();
        match standing {
            Takeover::Asked { .. } if asked.elapsed() < TAKEOVER_ASK_WAIT => tokio::time::sleep(TAKEOVER_ASK_POLL).await,
            Takeover::Held { requester: by } if by == requester => return true,
            _ => break,
        }
    }
    self.end_takeover(requester);
    false
}

/// Whether `requester`'s takeover holds the window now: not once the
/// person's exit key has ended it.
pub fn holds_takeover(&self, requester: &str) -> bool {
    let shown = self.presentation.lock().unwrap_or_else(PoisonError::into_inner);
    matches!(shown.takeover(), Takeover::Held { requester: by } if by == requester)
}

/// `requester`'s takeover ends, or its ask is withdrawn; another
/// requester's stays.
pub fn end_takeover(&self, requester: &str) {
    self.presentation.lock().unwrap_or_else(PoisonError::into_inner).end_takeover(requester);
    self.repaint();
}

/// Hold the person's input back from the window while a takeover is asked
/// for or held, from the first takeover on, and know the view's width the
/// ask's card is placed in.
async fn gate(&self) -> Result<(), PageError> {
    if self.units.load(Ordering::SeqCst) == 0 {
        if let Some(width) = crate::takeover::view_width(&self.webview).await {
            self.units.store(width.to_bits(), Ordering::SeqCst);
        }
    }
    self.gate.get_or_try_init(|| crate::takeover::hold_back(&self.webview, self.person())).await.map(|_| ())
}

/// The person's input at this window, as a takeover meets it.
fn person(&self) -> Person {
    let (webview, presentation, names, units) = (self.webview.clone(), self.presentation.clone(), self.names.clone(), self.units.clone());
    let repaint = Arc::new(move || paint_drawn(&webview, &presentation, &names, &units));
    Person { presentation: self.presentation.clone(), units: self.units.clone(), repaint }
}

/// Paint the drawing as it stands.
fn repaint(&self) {
    paint_drawn(&self.webview, &self.presentation, &self.names, &self.units);
}
```

**The person's input and the plugin's.** A takeover must hold back the
person's input and let the plugin's through, so the plugin must tell the
two apart at the point where both enter the window. Each platform has one
place every person's event passes and none of the plugin's need.

- **Linux.** Every event reaches the page through `gtk_main_do_event`,
  which hands a widget an event through its `event` signal before the
  signal for its kind, `button-press-event` and the rest, whose class
  handlers are WebKit's; a handler of `event` that answers true stops it
  there. A key goes to the toplevel window first, which passes it to its
  focus widget, and a pointer's event goes to the webview widget, whose
  window it happened in. So the plugin connects `event` on both, once, at
  its first takeover. GTK 3 has no public signal of its capture phase:
  connecting `captured-event` on the toplevel panics, the signal not found
  on `GtkApplicationWindow` (measured on arca). The plugin's
  own events take the same path, since the plugin hands them to
  `gtk_main_do_event` itself (above, "Input, through GTK's own event
  path"), so the plugin marks them: a main-thread flag is set while it
  hands one over, and the handler lets a marked event through. GDK keeps
  one app-wide event handler, `gdk_event_handler_set`, which is the host's
  own witness of a person's input (below, "What each platform's hooks
  see"), so the plugin does not take it.
- **macOS.** The plugin hands its events to the view's responder methods,
  never through `NSApplication`'s `sendEvent:`, so an AppKit local event
  monitor, which `sendEvent:` calls, sees the person's events and not the
  plugin's. The plugin installs one, at its first takeover, which answers
  nil for the person's input to the webview's window while a takeover is
  asked for or held. One event of the plugin's may still reach it: a key
  down the page did not handle, if WebKit hands it back to `sendEvent:`
  ("What each platform's hooks see", below). Under a takeover the monitor
  drops that one too, which only keeps it from the menu. arca cannot
  compile the macOS code, so this half waits on the Mac.

What the person's event meets is one rule on both platforms, with no
window: while no takeover stands, it passes; while one is asked for or
held, every pointer and key event stops. A key goes to the presentation
first, whose exit key refuses the ask or ends the hold, and a press on the
ask's Allow or Refuse answers it. An event that changed what is drawn
paints again.

<a name="chunk-person"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#person`</sub>

```rust {#person}
/// The person's input at a window, as a takeover meets it: what the host
/// draws, the view's width, and how to paint it again.
#[derive(Clone)]
pub(crate) struct Person {
    pub(crate) presentation: Shared,
    pub(crate) units: Arc<AtomicU64>,
    pub(crate) repaint: Arc<dyn Fn() + Send + Sync>,
}

/// One event of the person's, as a takeover reads it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum PersonInput<'a> {
    /// A key, by the protocol's name for it when it is the exit key.
    Key { key: &'a str, down: bool },
    /// A pointer's press, at its position in the view's units.
    Press { at: (f64, f64) },
    /// Any other pointer event.
    Pointer,
}

impl Person {
    /// Whether `input` stops before the page: while a takeover is asked for
    /// or held, it does, after answering the ask or ending the hold when
    /// it is the person's answer.
    pub(crate) fn meets(&self, input: PersonInput<'_>) -> bool {
        let mut shown = self.presentation.lock().unwrap_or_else(PoisonError::into_inner);
        let asked = match shown.takeover() {
            Takeover::Free => return false,
            Takeover::Asked { .. } => true,
            Takeover::Held { .. } => false,
        };
        let changes = shown.changes;
        match input {
            PersonInput::Key { key, down } => {
                shown.person_key(key, down);
            }
            PersonInput::Press { at } if asked => {
                let (_, [allow, refuse]) = ask_card(f64::from_bits(self.units.load(Ordering::SeqCst)));
                if inside(allow, at) {
                    shown.answer_takeover(true);
                } else if inside(refuse, at) {
                    shown.answer_takeover(false);
                }
            }
            PersonInput::Press { .. } | PersonInput::Pointer => {}
        }
        let changed = shown.changes != changes;
        drop(shown);
        if changed {
            (self.repaint)();
        }
        true
    }
}
```

The ask's card lies near the top of the view, centred, in the view's
units, and the plugin places it: the same rectangles go to the layer to
draw and to the person's press to test, so where Allow is drawn is where a
click on it lands. The layer draws the words.

<a name="chunk-ask-card"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#ask-card`</sub>

```rust {#ask-card}
/// A rectangle in the view's units: its left, top, width and height.
pub(crate) type Rect = [f64; 4];

/// Where the ask's card lies in a view `width` units wide, and its two
/// buttons in it, Allow and Refuse.
pub(crate) fn ask_card(width: f64) -> (Rect, [Rect; 2]) {
    let across = (width - 16.0).clamp(240.0, 360.0);
    let (left, top) = ((width - across) / 2.0, 40.0);
    ([left, top, across, 112.0], [[left + 18.0, top + 68.0, 96.0, 30.0], [left + 126.0, top + 68.0, 132.0, 30.0]])
}

/// Whether `at` lies in `rect`.
fn inside([left, top, width, height]: Rect, (x, y): (f64, f64)) -> bool {
    (left..left + width).contains(&x) && (top..top + height).contains(&y)
}

/// The takeover as one paint draws it: the ask, with its card and buttons,
/// or the hold, each naming its requester and the name its sequence gives;
/// null while none stands.
fn drawn_takeover(shown: &mut InputPresentation, names: &HashMap<String, String>, width: f64) -> serde_json::Value {
    let (asked, requester) = match shown.takeover().clone() {
        Takeover::Free => return serde_json::Value::Null,
        Takeover::Asked { requester } => (true, requester),
        Takeover::Held { requester } => (false, requester),
    };
    let (card, [allow, refuse]) = ask_card(width);
    let mut drawn = serde_json::json!({ "asked": asked, "requester": requester, "name": names.get(&requester), "hue": shown.hue(&requester) });
    if asked {
        (drawn["card"], drawn["allow"], drawn["refuse"]) = (card.into(), allow.into(), refuse.into());
    }
    drawn
}
```

One test holds the rule with no window: input passes while no takeover
stands; under a hold every event stops and the exit key's press ends it;
under an ask a press outside the buttons stops and answers nothing, a
press on Refuse refuses and one on Allow grants; and each answer paints.

<a name="chunk-person-tests"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#person-tests`</sub>

```rust {#person-tests}
#[cfg(test)]
mod takeover_tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    fn person() -> (Person, Arc<AtomicUsize>) {
        let painted = Arc::new(AtomicUsize::new(0));
        let paints = painted.clone();
        let repaint = Arc::new(move || {
            paints.fetch_add(1, Ordering::SeqCst);
        });
        (Person { presentation: Shared::default(), units: Arc::new(AtomicU64::new(400f64.to_bits())), repaint }, painted)
    }

    fn standing(person: &Person) -> Takeover {
        person.presentation.lock().unwrap().takeover().clone()
    }

    #[test]
    fn the_person_s_input_stops_only_while_a_takeover_stands_and_the_exit_key_ends_a_hold() {
        let (person, painted) = person();
        assert!(!person.meets(PersonInput::Key { key: "a", down: true }), "a key stopped with no takeover");
        assert!(!person.meets(PersonInput::Pointer), "a pointer event stopped with no takeover");
        assert!(person.presentation.lock().unwrap().hold_takeover("agent"));
        assert!(person.meets(PersonInput::Pointer));
        assert!(person.meets(PersonInput::Press { at: (60.0, 120.0) }));
        assert!(person.meets(PersonInput::Key { key: "a", down: true }));
        assert_eq!(painted.load(Ordering::SeqCst), 0, "input that changed nothing painted");
        assert!(person.meets(PersonInput::Key { key: "Escape", down: true }));
        assert_eq!(standing(&person), Takeover::Free, "the exit key did not end the hold");
        assert_eq!(painted.load(Ordering::SeqCst), 1, "the hold's end was not painted");
    }

    #[test]
    fn the_person_answers_an_ask_on_its_buttons_and_nowhere_else() {
        let (person, _) = person();
        let (card, [allow, refuse]) = ask_card(400.0);
        let centre = |[left, top, width, height]: Rect| (left + width / 2.0, top + height / 2.0);
        person.presentation.lock().unwrap().ask_takeover("agent");
        assert!(person.meets(PersonInput::Press { at: (card[0] + 4.0, card[1] + 4.0) }));
        assert!(matches!(standing(&person), Takeover::Asked { .. }), "a press beside the buttons answered the ask");
        assert!(person.meets(PersonInput::Press { at: centre(refuse) }));
        assert_eq!(standing(&person), Takeover::Free, "Refuse did not refuse");
        person.presentation.lock().unwrap().ask_takeover("agent");
        assert!(person.meets(PersonInput::Press { at: centre(allow) }));
        assert_eq!(standing(&person), Takeover::Held { requester: "agent".to_string() }, "Allow did not grant");
    }
}
```

On Linux the gate is the `event` signal of the toplevel and of the webview
widget, connected on GTK's main thread, and the mark on the plugin's own
events is the flag `delivering` sets around `gtk_main_do_event`. A press's
position is its root position less the webview's window's origin, in the
widget's units, which are the view's.

<a name="chunk-takeover-linux"></a><sub>[`src/takeover.rs`](../../crates/x0k-ui-tauri/src/takeover.rs) · `#takeover-linux`</sub>

```rust {#takeover-linux file="src/takeover.rs"}
//! A takeover on Linux: the person's GDK input held back from the window
//! while one is asked for or held, at the `event` signal of the toplevel
//! and of the webview widget.
use std::cell::Cell;

use gtk::gdk::{self, EventType};
use gtk::glib::Propagation;
use gtk::prelude::*;
use tauri::{Runtime, Webview};
use tokio::sync::oneshot;
use x0k_ui_protocol::presentation::TAKEOVER_EXIT;

use crate::page::{PageError, Person, PersonInput};

thread_local! {
    /// Whether the plugin is handing GTK one of its own events now.
    static DELIVERING: Cell<bool> = const { Cell::new(false) };
}

/// Clears the mark when the plugin's event has been handed over.
struct Delivered;

impl Drop for Delivered {
    fn drop(&mut self) {
        DELIVERING.with(|flag| flag.set(false));
    }
}

/// Run `deliver`, which hands GTK one of the plugin's own events, with the
/// event marked as the plugin's.
pub(crate) fn delivering<T>(deliver: impl FnOnce() -> T) -> T {
    DELIVERING.with(|flag| flag.set(true));
    let _delivered = Delivered;
    deliver()
}

/// Hold the person's input back from `webview`'s window by `person`'s rule,
/// for the window's life, at the `event` signal of its toplevel, which a key
/// reaches first, and of the webview widget, which a pointer's event does.
pub(crate) async fn hold_back<R: Runtime>(webview: &Webview<R>, person: Person) -> Result<(), PageError> {
    let (done, connected) = oneshot::channel();
    webview.with_webview(move |platform| {
        let view = platform.inner().upcast::<gtk::Widget>();
        let Some(toplevel) = view.toplevel() else { return };
        for widget in [&toplevel, &view] {
            let (view, person) = (view.downgrade(), person.clone());
            widget.connect_event(move |_, event| match view.upgrade() {
                Some(view) if meets(&view, &person, event) => Propagation::Stop,
                _ => Propagation::Proceed,
            });
        }
        let _ = done.send(());
    })?;
    connected.await.map_err(|_| PageError::NoWindow)
}

/// Whether the person's `event` stops before the page: never one the plugin
/// is delivering, and only a pointer's or a key's.
fn meets(view: &gtk::Widget, person: &Person, event: &gdk::Event) -> bool {
    if DELIVERING.with(Cell::get) {
        return false;
    }
    use EventType as E;
    let input = match event.event_type() {
        E::KeyPress | E::KeyRelease => {
            let exit = event.keyval() == Some(*gdk::keys::constants::Escape);
            PersonInput::Key { key: if exit { TAKEOVER_EXIT } else { "" }, down: event.event_type() == E::KeyPress }
        }
        E::ButtonPress => match at_view(view, event) {
            Some(at) => PersonInput::Press { at },
            None => PersonInput::Pointer,
        },
        E::DoubleButtonPress | E::TripleButtonPress | E::ButtonRelease | E::MotionNotify | E::Scroll => PersonInput::Pointer,
        E::TouchBegin | E::TouchUpdate | E::TouchEnd | E::TouchCancel => PersonInput::Pointer,
        _ => return false,
    };
    person.meets(input)
}

/// Where a pointer event is in the webview widget's units.
fn at_view(view: &gtk::Widget, event: &gdk::Event) -> Option<(f64, f64)> {
    let (x, y) = event.root_coords()?;
    let (_, left, top) = view.window()?.origin();
    Some((x - f64::from(left), y - f64::from(top)))
}

/// The webview widget's width, in its own units.
pub(crate) async fn view_width<R: Runtime>(webview: &Webview<R>) -> Option<f64> {
    let (done, measured) = oneshot::channel();
    webview.with_webview(move |platform| {
        let _ = done.send(f64::from(platform.inner().allocated_width()));
    }).ok()?;
    measured.await.ok()
}
```

On macOS the gate is a local event monitor, installed on the main thread
for the app's life, which answers nil for a person's pointer or key event
in the webview's window while a takeover stands. A press's position is the
event's point in the window converted to the view's, flipped when the view
is not, less the safe area the page begins below, as the plugin's own input
places a point (above, "Input, as AppKit hands it to the view"). The exit
key is Escape's key code, 53, on every layout.

<a name="chunk-takeover-macos"></a><sub>[`src/takeover_macos.rs`](../../crates/x0k-ui-tauri/src/takeover_macos.rs) · `#takeover-macos`</sub>

```rust {#takeover-macos file="src/takeover_macos.rs"}
//! A takeover on macOS: the person's AppKit input held back from the
//! window while one is asked for or held, at a local event monitor.
use std::ptr::NonNull;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2_app_kit::{NSEvent, NSEventMask, NSEventType};
use objc2_web_kit::WKWebView;
use tauri::{Runtime, Webview};
use tokio::sync::oneshot;
use x0k_ui_protocol::presentation::TAKEOVER_EXIT;

use crate::page::{PageError, Person, PersonInput};

/// Escape's key code, the same on every layout.
const ESCAPE: u16 = 53;

/// Hold the person's input back from `webview`'s window by `person`'s rule,
/// for the app's life, at a local event monitor.
pub(crate) async fn hold_back<R: Runtime>(webview: &Webview<R>, person: Person) -> Result<(), PageError> {
    let (done, installed) = oneshot::channel();
    webview.with_webview(move |platform| {
        // SAFETY: on macOS `inner()` is the webview's WKWebView, alive while
        // this closure runs on the main thread; the monitor retains it.
        let Some(view) = (unsafe { Retained::retain(platform.inner().cast::<WKWebView>()) }) else { return };
        let monitor = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
            // SAFETY: AppKit hands the monitor an event, valid for the call.
            let seen = unsafe { event.as_ref() };
            if meets(&view, &person, seen) {
                std::ptr::null_mut()
            } else {
                event.as_ptr()
            }
        });
        // SAFETY: the handler answers the event it was given, or nil to drop it.
        let token = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::Any, &monitor) };
        std::mem::forget(token);
        let _ = done.send(());
    })?;
    installed.await.map_err(|_| PageError::NoWindow)
}

/// Whether the person's `event` stops before the page: only a pointer's or
/// a key's, in the webview's window.
fn meets(view: &WKWebView, person: &Person, event: &NSEvent) -> bool {
    let Some(window) = view.window() else { return false };
    if event.windowNumber() != window.windowNumber() {
        return false;
    }
    use NSEventType as T;
    let kind = event.r#type();
    let input = match kind {
        T::KeyDown | T::KeyUp => PersonInput::Key { key: if event.keyCode() == ESCAPE { TAKEOVER_EXIT } else { "" }, down: kind == T::KeyDown },
        T::LeftMouseDown => PersonInput::Press { at: at_view(view, event) },
        T::LeftMouseUp | T::RightMouseDown | T::RightMouseUp | T::OtherMouseDown | T::OtherMouseUp => PersonInput::Pointer,
        T::MouseMoved | T::LeftMouseDragged | T::RightMouseDragged | T::OtherMouseDragged | T::ScrollWheel | T::FlagsChanged => PersonInput::Pointer,
        _ => return false,
    };
    person.meets(input)
}

/// Where a pointer event is in the page's points, from the page's top left.
fn at_view(view: &WKWebView, event: &NSEvent) -> (f64, f64) {
    let point = view.convertPoint_fromView(event.locationInWindow(), None);
    let (bounds, inset) = (view.bounds(), view.safeAreaInsets());
    let y = if view.isFlipped() { point.y } else { bounds.size.height - point.y };
    (point.x - inset.left, y - inset.top)
}

/// The page's width in the view's points.
pub(crate) async fn view_width<R: Runtime>(webview: &Webview<R>) -> Option<f64> {
    let (done, measured) = oneshot::channel();
    webview
        .with_webview(move |platform| {
            // SAFETY: as in `hold_back`, the view is alive on the main thread.
            let view = unsafe { &*platform.inner().cast::<WKWebView>() };
            let inset = view.safeAreaInsets();
            let _ = done.send(view.bounds().size.width - inset.left - inset.right);
        })
        .ok()?;
    measured.await.ok()
}
```

## Telling the host what it delivers

An app that lets a driver into its window may still want some acts to be a
person's alone: approving the agent's own tool call, applying its code,
pushing. Chariot, a Tauri app that embeds this plugin, refuses such an act
when a driver's input caused it. To tell the two apart it needs the person's
events and the driver's, each from its own witness. A person's events it
sees itself, with the platform's app-level monitor: on macOS an AppKit local
event monitor, which sees what `NSApplication`'s `sendEvent:` dispatches.
A driver's events only the plugin can name, since it makes them in process
and WebKit carries nothing of the plugin's on an event: a page sees a trusted
DOM event either way. So the plugin tells its host every event it delivers.

**What holds.**

- Every event the plugin hands a webview's view, on either platform, is told
  to the host first. The plugin calls the host's observer, `on_input`, with
  a `DeliveredInput` on the main thread, after the platform event is made
  and before the view is handed it. So any page handler the event triggers,
  and any request that handler sends the host, runs after the host recorded
  the event. An event the plugin could not make is told to no one and
  delivered to no one.
- A move the watchable pace draws on its way to a position is delivered, so
  it is told too. Every move, press, release, key, modifier key and scroll
  is one `DeliveredInput`, whatever the pace.
- `last_delivered(app, webview)` answers the instant of the last event told
  for that webview, on the monotonic clock, so a host that asks only "was
  there driver input since T" needs no observer.
- The plugin's own events never pass through an app-level dispatch the host
  could watch: on macOS they go to the view's responder methods and never to
  `NSApplication`'s or `NSWindow`'s `sendEvent:`; on Linux they go to
  `gtk_main_do_event` and never to the handler `gdk_event_handler_set`
  installs. What each platform's app-level hooks do see is stated below,
  measured on Linux and from the code on macOS.

A told event carries the webview's label, the requester whose sequence it
is (the endpoint connection's peer credentials, never the driver's word),
the name the sequence gives that requester for a person to read, the event
itself, the instant it was told, and the time the platform event carries.
The event is the protocol's tick event (`x0k_ui_protocol::input::Event`,
re-exported as `x0k_ui_tauri::protocol`), its position and deltas in the
page's logical points from the page's top left: the frame's capture pixels
over the capture's scale, which is what the plugin hands the platform. On
macOS the page begins below the view's safe area, so a point there is the
view's point less that inset. A modifier key is `KeyDown` or `KeyUp` of its
name, which macOS delivers as a `flagsChanged`.

The platform time is the one the plugin writes on the event it makes,
`NSEvent.timestamp` in seconds since boot on macOS and the `GdkEvent`'s time
in milliseconds on Linux. One tick's events share it. A host whose monitor
does see an event the plugin made (below, "What each platform's hooks see")
can tell it for the plugin's by that time.

<a name="chunk-provenance-delivered"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#provenance-delivered`</sub>

```rust {#provenance-delivered}
/// One event the plugin delivered into a webview, told to the host on the
/// main thread before the view was handed it.
#[derive(Clone, Debug)]
pub struct DeliveredInput {
    /// The label of the webview it went to.
    pub webview: String,
    /// The requester whose sequence it is: the endpoint connection's peer
    /// credentials, never the driver's word.
    pub requester: String,
    /// The name the sequence gives its requester for a person to read, a
    /// label only (`Perform::requester_name`).
    pub requester_name: Option<String>,
    /// The event, in the page's logical points from the page's top left.
    pub event: Event,
    /// When it was told, on the monotonic clock, just before the view was
    /// handed it.
    pub at: Instant,
    /// The time the platform event carries: `NSEvent.timestamp` in seconds
    /// since boot on macOS, the `GdkEvent`'s time in milliseconds on Linux.
    pub platform_time: f64,
}

/// The host's observer of every event the plugin delivers.
pub(crate) type InputObserver = Arc<dyn Fn(&DeliveredInput) + Send + Sync>;
```

The plugin keeps what it tells in the app's state: the host's observer, and
the instant of the last event told for each webview.

<a name="chunk-provenance-state"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#provenance-state`</sub>

```rust {#provenance-state}
/// What the plugin tells its host of the input it delivers, and asks it
/// before a sequence runs, kept in the app's state.
#[derive(Clone, Default)]
pub(crate) struct Provenance {
    observer: Option<InputObserver>,
    before: Option<BeforeInput>,
    last: Arc<Mutex<HashMap<String, Instant>>>,
    /// Woken by `resume_input`, for the sequences waiting on `before`.
    resumed: Arc<Notify>,
}

impl Provenance {
    pub(crate) fn new(observer: Option<InputObserver>, before: Option<BeforeInput>) -> Self {
        Self { observer, before, last: Arc::default(), resumed: Arc::default() }
    }
}

/// When the plugin last delivered a driver's event into the webview labelled
/// `webview`, on the monotonic clock; `None` before its first.
pub fn last_delivered<R: Runtime, M: Manager<R>>(manager: &M, webview: &str) -> Option<Instant> {
    let provenance = manager.try_state::<Provenance>()?;
    let last = provenance.last.lock().unwrap_or_else(PoisonError::into_inner);
    last.get(webview).copied()
}
```

A sequence's input is told through one `Teller`, which the platform's input
path calls for each event it is about to hand the view. It records the
instant first and then calls the observer, so `last_delivered` already
answers the event when the observer hears it.

<a name="chunk-provenance-teller"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#provenance-teller`</sub>

```rust {#provenance-teller}
/// Who tells the host of one sequence's events: its webview, its requester
/// and the name the sequence gives it.
#[derive(Clone)]
pub(crate) struct Teller {
    provenance: Provenance,
    webview: String,
    requester: String,
    requester_name: Option<String>,
}

impl Teller {
    /// The teller of `requester`'s sequence into `webview`, naming it `name`.
    pub(crate) fn new<R: Runtime>(webview: &Webview<R>, requester: &str, name: Option<&str>) -> Self {
        let provenance = webview.try_state::<Provenance>().map(|state| state.inner().clone()).unwrap_or_default();
        Self { provenance, webview: webview.label().to_string(), requester: requester.to_string(), requester_name: name.map(str::to_string) }
    }

    /// Tell the host of `event`, about to be handed to the view with the
    /// platform time `platform_time`. It runs on the main thread.
    pub(crate) fn tell(&self, event: &Event, platform_time: f64) {
        let at = Instant::now();
        self.provenance.last.lock().unwrap_or_else(PoisonError::into_inner).insert(self.webview.clone(), at);
        if let Some(observer) = &self.provenance.observer {
            let told = DeliveredInput {
                webview: self.webview.clone(),
                requester: self.requester.clone(),
                requester_name: self.requester_name.clone(),
                event: event.clone(),
                at,
                platform_time,
            };
            observer(&told);
        }
    }
}
```

**Declining a driver's input for now.** A host that yields its window to a
person also needs to stop a driver's sequence before it starts, and to say
why: "the person is using the window right now". So the host may give the
plugin a second callback, `before_input`, which the plugin asks of every
sequence the endpoint has checked, before any of it runs. It answers whose
turn it is at the window, an `InputTurn`:

- `Run`: the sequence runs now.
- `Decline(why)`: the sequence is refused as `declined`, naming `ui/input`,
  with `why` as its reason (`x0k:architecture/ui-control-channel` §10,
  "Declining input for now"). Nothing of it is delivered or told.
- `Wait { within, why }`: the plugin waits for the host to call
  `resume_input`, then asks again. It waits at most `within` from the first
  `Wait`, however often it asks; a sequence still waiting then is declined
  with `why`.

A sequence waits only before its first tick, never between two: a button or
a key a sequence holds spans its ticks, so a wait between them would let a
person's input land in the middle of the driver's held state. A sequence let
go after a wait runs whole, from its first tick, with its own pauses and
pace, exactly as if it had arrived then: the wait is before `perform`, and
`perform` turns the sequence into the protocol's ticks (`ticks`) and paces
them as it always does. The callback is asked on Tauri's async runtime, not
the main thread, and must answer at once; a host that needs time answers
`Wait`. It decides by the host's own condition and the requester the
connection names, which the callback is given beside the name the sequence
gives itself, a label only.

<a name="chunk-provenance-turn"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#provenance-turn`</sub>

```rust {#provenance-turn}
/// A sequence of input a driver asks the plugin to deliver, as the host's
/// `before_input` callback is asked about it.
#[derive(Clone, Copy, Debug)]
pub struct AskedInput<'a> {
    /// The label of the webview it would go to.
    pub webview: &'a str,
    /// The requester the endpoint connection names, by its peer credentials.
    pub requester: &'a str,
    /// The name the sequence gives its requester, a label only.
    pub requester_name: Option<&'a str>,
    /// The sequence, as the endpoint checked it.
    pub perform: &'a Perform,
}

/// Whose turn it is at the window when a driver's sequence asks to run.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InputTurn {
    /// The driver's: the sequence runs now.
    Run,
    /// Not now: the sequence is refused as `declined` with this reason.
    Decline(String),
    /// The person's, for now: wait for `resume_input`, at most `within`, and
    /// decline with `why` if the wait runs out.
    Wait { within: Duration, why: String },
}

/// The host's answer to whether a driver's sequence may run.
pub(crate) type BeforeInput = Arc<dyn Fn(&AskedInput<'_>) -> InputTurn + Send + Sync>;

impl Provenance {
    /// Why `asked` is declined, asking the host's `before_input` and waiting
    /// while it says to; `None` lets it run.
    pub(crate) async fn declines(&self, asked: &AskedInput<'_>) -> Option<String> {
        let before = self.before.as_ref()?;
        let mut deadline = None;
        loop {
            let resumed = self.resumed.notified();
            tokio::pin!(resumed);
            resumed.as_mut().enable();
            match before(asked) {
                InputTurn::Run => return None,
                InputTurn::Decline(why) => return Some(why),
                InputTurn::Wait { within, why } => {
                    let until = *deadline.get_or_insert_with(|| tokio::time::Instant::now() + within);
                    if tokio::time::timeout_at(until, resumed).await.is_err() {
                        return Some(why);
                    }
                }
            }
        }
    }
}

/// Ask the host's `before_input` again for every sequence waiting on it.
pub fn resume_input<R: Runtime, M: Manager<R>>(manager: &M) {
    if let Some(provenance) = manager.try_state::<Provenance>() {
        provenance.resumed.notify_waiters();
    }
}
```

<a name="chunk-provenance-file"></a><sub>[`src/provenance.rs`](../../crates/x0k-ui-tauri/src/provenance.rs) · `#provenance-file` · assembles [provenance-delivered](#chunk-provenance-delivered) · [provenance-state](#chunk-provenance-state) · [provenance-teller](#chunk-provenance-teller) · [provenance-turn](#chunk-provenance-turn)</sub>

```rust {#provenance-file file="src/provenance.rs"}
//! What the plugin tells its host of the input it delivers: every event,
//! on the main thread, before the view is handed it.
use std::collections::HashMap;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use tauri::{Manager, Runtime, Webview};
use tokio::sync::Notify;
use x0k_ui_protocol::input::{Event, Perform};

<<provenance-delivered>>

<<provenance-state>>

<<provenance-teller>>

<<provenance-turn>>
```

**What each platform's hooks see.** On macOS, from the code: `synthesize`
makes each event with `NSEvent`'s constructors and calls the view's own
responder method, `mouseDown:`, `keyDown:`, `flagsChanged:`, `scrollWheel:`
and the rest; a wheel is read back from a CoreGraphics event with
`eventWithCGEvent:`, which makes an event and posts nothing. Nothing in it
calls `NSApplication`'s or `NSWindow`'s `sendEvent:`, `postEvent:` or
`CGEventPost`, so an app's local event monitor, which AppKit calls from
`NSApplication`'s `sendEvent:`, is not called on the way in. One path may
still reach it, and only the Mac can say: WebKit hands a key down the page
did not handle back to `NSApplication`'s `sendEvent:`, so that the menu and
the responder chain see it (`WebViewImpl::doneWithKeyEvent`, read from
memory of WebKit's source, not measured). If it does, a local monitor sees
such a key down after the page has handled it, as the very event the plugin
made, with the plugin's timestamp. The Mac's probe test decides it (below),
and either way a monitor's event whose timestamp is a told event's
`platform_time` is the plugin's.

On Linux, measured on arca by the probe test: the plugin hands each event to
`gtk_main_do_event` itself, so the handler an app installs with
`gdk_event_handler_set`, which GDK calls with each event it takes from its
queue, is called with none of the plugin's events. Over a click and a key it
was called with no input event, while it was called with the X server's own
`Expose` events and with a key put on GDK's queue. Hooks that
`gtk_main_do_event` itself calls do see the plugin's events: GTK's key
snooper was called with the key's `KeyPress` and `KeyRelease`, and the
toplevel window's `event` signal with the click's `MotionNotify` and the
key's two events (not the button's, which WebKit handled before they would
reach the toplevel). So on Linux the app-level witness of a person's input
is a GDK event handler that wraps `gtk_main_do_event`, and neither the key
snooper nor a window's signals. That the X server's input events reach the
handler as the queued key did is inferred from GDK's dispatch, which hands
the handler every event it takes from the X connection; arca drives no real
pointer or keyboard into Xvfb to show it.

**What this proves, and what it does not.** It proves the plugin's half: any
input a driver makes through this plugin's `ui/input` reaches the page only
after the host was told of it, so a host that refuses an act caused by
reported input refuses every act a driver of this endpoint could cause
through input. It does not prove that an event the host did not hear of
came from a person. A process that posts OS-level events (CoreGraphics'
`CGEventPost`, the accessibility API, a virtual HID device on macOS; XTest
or `uinput` on Linux) makes input that the platform delivers as it delivers
a person's, through `sendEvent:` and GDK's queue, and that this plugin never
sees. A driver that reaches the page some other way, a devtools protocol or
a script the app runs for it, makes events that are not input at all. So a
host may take "no driver input told since T" to mean that no driver of this
endpoint acted, and must not take it to mean that a person acted, against
anything outside the app that can post events: on macOS any process the
person granted Accessibility or Input Monitoring. Against such a process the
person's act needs a proof of its own, such as a confirmation outside the
window or the platform's own secure prompt.

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

**An agent's sandbox denies the endpoint directory.** The endpoint answers
every process of the user that can reach its socket, with every side-effect
class, and an app's own tiers, which actions an agent of the app may ask for,
are not the endpoint's checks. So an app that runs an agent's shell in a
sandbox must deny that sandbox the endpoints' directory,
`<runtime>/ui-control/`, or the agent can drive the app straight through its
socket past the app's tiers. Chariot found it so: Apollo's sandboxed shell
reached the endpoint socket directly.

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
  says the host presents input. It also holds a takeover, by the host's
  configuration (above, "Holding a takeover"), so the offer says that too.
  A capture carries the drawing unless the call asks for the frame alone,
  when the page is held with it hidden.

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
    /// The spelling of the page's state shape, as it last declared it.
    shape: Mutex<Option<Datum>>,
    /// The sources of motion the library's stepped clock does not step, once read.
    unstepped: OnceLock<Vec<String>>,
    /// The stepped screencast that plays, while one does.
    casting: Mutex<Option<Casting>>,
    /// Whether the app runs as a dev instance, as it said when it started.
    dev_instance: bool,
}

/// What the page declares: the protocol's `Declared`, and beside it whether
/// the page takes state fixtures, which a page alone does not offer.
#[derive(serde::Deserialize)]
struct PageDeclared {
    #[serde(flatten)]
    declared: Declared,
    #[serde(default)]
    fixtures: bool,
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
        Self {
            page: PageHost::new(webview),
            kept: Mutex::default(),
            input_turn: tokio::sync::Mutex::new(()),
            shape: Mutex::default(),
            unstepped: OnceLock::new(),
            casting: Mutex::default(),
            dev_instance: false,
        }
    }

    /// The same app, saying in its offer whether it runs as a dev instance.
    pub fn dev_instance(self, dev_instance: bool) -> Self {
        Self { dev_instance, ..self }
    }

    /// Drop the fixture mark when the page shows anything but the fixture it
    /// marks, as after the page ended that fixture itself.
    fn unmark_unless(&self, shown: Option<&Shown>) {
        let Some(marked) = self.page.fixture_mark() else { return };
        if !matches!(shown, Some(Shown::Fixture { handle }) if *handle == marked) {
            self.page.mark_fixture(None);
        }
    }

    /// What the page declares now. Its state's shape is kept, for the
    /// endpoint's fixture checks to read.
    async fn declared(&self) -> Result<PageDeclared, PageError> {
        let declared: PageDeclared = self.ask("declared()").await?;
        let shape = declared.declared.state.as_ref().map(|state| Datum::from_json(&state.shape));
        *self.shape.lock().unwrap_or_else(PoisonError::into_inner) = shape;
        Ok(declared)
    }

    /// The page's epoch now, which names the frame it shows.
    async fn epoch(&self) -> Option<String> {
        self.page.evaluate(&format!("return String(globalThis.{PAGE_GLOBAL}.epoch());")).await.ok()
    }

    /// What the page's `expression`, one of the library's calls, answers.
    async fn ask<T: DeserializeOwned>(&self, expression: &str) -> Result<T, PageError> {
        let answered = self.page.evaluate(&format!("return JSON.stringify(await globalThis.{UI_GLOBAL}.{expression});")).await?;
        serde_json::from_str(&answered).map_err(|e| PageError::Malformed(e.to_string()))
    }

    /// One observation: the library's read for `call` held around the native
    /// capture, built into the answer by the library's `observation`. With
    /// `keep`, input may name its frame.
    async fn observed(&self, call: &ObserveCall, keep: bool) -> Result<Observation, PageError> {
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
            observation.refused.push(PartRefused { part: Part::Capture, code: None, why });
        }
        self.unmark_unless(observation.shown.as_ref());
        if let Some(snapshot) = &held.capture {
            if let Some(capture) = observation.capture.as_mut() {
                (capture.png, capture.presented) = (snapshot.png.clone(), self.page.presents(call.frame_only));
            }
            if keep {
                let frame = HeldFrame { frame: held.frame.clone(), width: snapshot.width, height: snapshot.height, layout };
                self.keep(Kept { frame, scale: snapshot.scale });
            }
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

**A fixture the page ends.** A page ends the fixture that stands itself with
the library's `ui.endFixture(reason)`, such as when an approval arrives for a
person (`x0k:implementation/ui-control/page-answer`, "A state fixture"). The
endpoint holds no way for the page to tell it, so it asks: when its record
says the calling session presented a fixture the page no longer shows, it
asks the app's `fixture_ended(handle)`, and `PageApp` answers it with the
library's `fixtureEnded(handle)`. The endpoint then refuses that session's
next action or input as `fixture_ended` with the page's reason, once. A
`release` of the handle the library answers `ended` with the reason itself. A
page that does not answer is taken to have ended nothing.

The offer is the page's, made of what it declares, with `ui/input` added,
`ui/history` when the page takes state fixtures, and `ui/screencast` at the
stepped clock once the library has said what its clock does not step (below,
"A stepped screencast"). It says the app runs as a dev instance when the app
built its plugin with `.dev_instance(true)`; a page cannot say so itself. A
page holds no past
positions, so its history names none and says it takes fixtures. A page that
does not answer leaves an offer that names nothing, so every call to it is
refused by the endpoint's checks.

<a name="chunk-endpoint-offer"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#endpoint-offer`</sub>

```rust {#endpoint-offer}
async fn offer(&self) -> Offer {
    match self.declared().await {
        Ok(PageDeclared { declared, fixtures }) => {
            let input = interfaces().into_iter().filter(|interface| interface.name == UI_INPUT);
            let history = interface(UI_HISTORY).filter(|_| fixtures);
            let mut offer = page_offer(declared);
            offer.interfaces.extend(input.chain(history));
            offer.input = Some(InputOffer { presents: true, takeover: true });
            offer.history = fixtures.then_some(HistoryOffer { oldest: None, newest: None, fixtures: true });
            if let Some(unstepped) = self.unstepped().await {
                offer.interfaces.extend(interface(UI_SCREENCAST));
                offer.screencast = Some(ScreencastOffer { clocks: vec![Clock::Stepped], max_frames: MAX_CAST_FRAMES, max_ms: MAX_CAST_MS, unstepped });
            }
            offer.dev_instance = self.dev_instance;
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
    match self.observed(&call, true).await {
        Ok(observation) => observation,
        Err(error) => {
            let why = error.to_string();
            let refused = call.parts.iter().map(|part| PartRefused { part: *part, code: None, why: why.clone() }).collect();
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

**A state fixture.** A page whose declaration gives `present` and `release`
takes state fixtures (`x0k:implementation/ui-control/page-answer`, "A state
fixture"), and the plugin offers `ui/history` for it. The checks of
`ui-interfaces` §4 are the endpoint's: before `present` reaches the page,
`check_present` holds the call's fingerprint to the state shape, the head it
names to the live state, and the state after any merge patch to the shape.
The plugin answers the endpoint the two things the check reads, the shape and
the live state, from what the page declares, and checks nothing again. The
page loads no WebAssembly and makes no check either: the library hands its
host what it declares, raw, and the host's checks are the only ones.

- The live state is what `declared()` answers, which while a fixture stands
  is the live state as it stood when the first fixture was presented.
- The endpoint reads the shape without waiting, so the plugin keeps the shape
  the page last declared. The endpoint asks for the offer and the live state
  before the shape on every `present`, and both read the page's declaration,
  so the shape it reads is the one declared in the same call.
- `present` and `release` go to the library over the same nonce IPC, and the
  library answers each once one rendering update has run after the page's own
  hook, as it answers `run`. A fixture presented is marked over the page,
  unless the call asked `mark: false` of a dev instance, and a release, or a
  look at the page that finds the fixture gone, unmarks it (above, "Drawing a
  driver's input"). So the frame each names is the first painted
  after it. The protocol spells both answers as the library does, so the
  plugin hands them on.
- What the page shows is the library's `fixture()`. The endpoint asks for it
  before each action and each sequence of input, and under a fixture answers
  an action by the offer's replay policy, which for a page that declares none
  is `graded-introspection` §9's defaults: a `read_only` action runs, any
  other is simulated, since a page declares no sandbox.
- A navigation to `live` releases the fixture that stands. A page holds no
  past position, so the endpoint refuses a navigation to any position before
  the plugin hears it.

A page whose hook throws refuses the call. The protocol has no code for a page
that lost its own state, so a thrown `present` is refused as `misfit_state`,
as the shell refuses a state its type does not read, and a `present` or
`release` the page did not answer is refused as `no_fixtures`, with the reason.

<a name="chunk-endpoint-fixtures"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#endpoint-fixtures`</sub>

```rust {#endpoint-fixtures}
async fn shown(&self) -> Shown {
    let shown = match self.ask::<Option<String>>("fixture()").await {
        Ok(Some(handle)) => Shown::Fixture { handle },
        Ok(None) => Shown::Live,
        Err(error) => {
            tracing::warn!(%error, "ui_tauri.endpoint.shown_unanswered");
            return Shown::Live;
        }
    };
    self.unmark_unless(Some(&shown));
    shown
}

async fn history(&self, _call: HistoryCall) -> History {
    History { oldest: None, newest: None, shown: self.shown().await, positions: Vec::new() }
}

async fn navigate(&self, to: Destination) -> NavigateAnswer {
    if let Destination::Position { position } = to {
        let why = format!("the page holds no position {position}");
        return NavigateAnswer::Refused(Refused { code: RefusalCode::UnknownPosition, subject: Some(position.to_string()), why });
    }
    let frame = match self.shown().await {
        Shown::Fixture { handle } => match self.release(handle).await {
            ReleaseAnswer::Released { frame } => frame,
            ReleaseAnswer::NotStanding { .. } | ReleaseAnswer::Ended { .. } => self.epoch().await,
            ReleaseAnswer::Refused(refused) => return NavigateAnswer::Refused(refused),
        },
        _ => self.epoch().await,
    };
    NavigateAnswer::Shown { shown: Shown::Live, frame }
}

fn state_shape(&self) -> Option<Datum> {
    self.shape.lock().unwrap_or_else(PoisonError::into_inner).clone()
}

async fn live_state(&self) -> Option<StatePart> {
    match self.declared().await {
        Ok(declared) => declared.declared.state.map(state_part),
        Err(error) => {
            tracing::warn!(%error, "ui_tauri.endpoint.state_unanswered");
            None
        }
    }
}

async fn present(&self, state: Value, marked: bool) -> PresentAnswer {
    match self.ask::<PresentAnswer>(&format!("present({state})")).await {
        Ok(answer) => {
            if let PresentAnswer::Presented { handle, .. } = &answer {
                self.page.mark_fixture(marked.then_some(handle.as_str()));
            }
            answer
        }
        Err(error) => {
            let code = if matches!(error, PageError::Threw(_)) { RefusalCode::MisfitState } else { RefusalCode::NoFixtures };
            PresentAnswer::Refused(Refused { code, subject: Some(UI_HISTORY.to_string()), why: error.to_string() })
        }
    }
}

async fn release(&self, handle: String) -> ReleaseAnswer {
    match self.ask::<ReleaseAnswer>(&format!("release({})", json!(handle))).await {
        Ok(answer) => {
            if !matches!(answer, ReleaseAnswer::Refused(_)) && self.page.fixture_mark().as_deref() == Some(handle.as_str()) {
                self.page.mark_fixture(None);
            }
            answer
        }
        Err(error) => ReleaseAnswer::Refused(Refused { code: RefusalCode::NoFixtures, subject: Some(handle), why: error.to_string() }),
    }
}

async fn fixture_ended(&self, handle: &str) -> Option<String> {
    match self.ask::<Option<String>>(&format!("fixtureEnded({})", json!(handle))).await {
        Ok(why) => why,
        Err(error) => {
            tracing::warn!(%error, "ui_tauri.endpoint.ended_unanswered");
            None
        }
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
    let frame = self.delivered(requester, &perform, &resolved).await;
    if perform.takeover {
        self.page.end_takeover(requester);
    }
    frame
}

async fn hold_takeover(&self, requester: &str) -> bool {
    self.page.hold_takeover(requester).await
}

async fn grant_takeover(&self, requester: &str) -> bool {
    self.page.ask_takeover(requester).await
}
```

A sequence is delivered at the scale of the frame it names, one at a time.
One that took over the window lets it go when it answers, however it
answers, as the shell does.

<a name="chunk-endpoint-deliver"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#endpoint-deliver`</sub>

```rust {#endpoint-deliver}
impl<R: Runtime> PageApp<R> {
    /// Deliver `perform` for `requester` and answer the frame that shows it.
    async fn delivered(&self, requester: &str, perform: &Perform, resolved: &[Resolved]) -> Option<String> {
        let scale = match scale_for(perform, &self.kept()) {
            Ok(scale) => scale,
            Err(why) => {
                tracing::warn!(%why, "ui_tauri.endpoint.input_undelivered");
                return None;
            }
        };
        let _turn = self.input_turn.lock().await;
        match self.page.perform(requester, perform, resolved, scale).await {
            Ok(epoch) => epoch.map(|epoch| epoch.to_string()),
            Err(error) => {
                tracing::warn!(%error, "ui_tauri.endpoint.input_undelivered");
                None
            }
        }
    }
}
```

**What the host cannot do now, and what the page declines.** The endpoint
asks three things of its app before it runs a call, and refuses the call by
the protocol's codes (`x0k:implementation/ui-control/endpoint`):

- `cannot_paint` is the window's word first: a minimised or hidden window, as
  Tauri's window reports it, cannot paint, and the plugin answers that
  without a round trip to the page. Otherwise it asks the library's
  `unpainted()`, which answers why while the page is hidden or has had no
  rendering update within a bound, as for a window WebKit counts as covered.
  The page waits on nothing to answer it, so the refusal comes back within the
  round trip. A page that does not answer is taken to paint, and the call
  then answers as it would have.
- `delivers` is `DELIVERED`, the kinds the platform's input path delivers:
  `mouse`, `key` and `wheel`. So the endpoint refuses a `touch` or a `pen`
  source as `undeliverable_source` before any of the sequence runs; before,
  the plugin heard it, refused it to itself, and the endpoint answered `done`.
- `declines_input` asks the host's `before_input`, and waits while it says
  to (above, "Declining a driver's input for now"); a host that gave none
  declines nothing. The endpoint asks it of every sequence just before the
  sequence's takeover, so the plugin first keeps the name the sequence gives
  its requester, and the takeover's notice names it.
- `declines` asks the library's `declines(call)`, which is the page's own
  `declines` hook. A `present` the page declines needs nothing of the plugin:
  the library answers it `declined` and the plugin hands that on as the
  page's answer. A `present` hook that throws anything else is still
  `misfit_state`.

`page_unsettled` has no code of its own. The page kept changing through every
hold, and the next observation may settle; no word of the protocol says that,
so the capture's refusal carries the reason for a person and no code.

<a name="chunk-endpoint-conditions"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#endpoint-conditions`</sub>

```rust {#endpoint-conditions}
async fn cannot_paint(&self) -> Option<String> {
    self.page.cannot_paint().await
}

fn delivers(&self) -> &[&str] {
    crate::input::DELIVERED
}

async fn declines_input(&self, requester: &str, perform: &Perform) -> Option<String> {
    self.page.named(requester, perform.requester_name.as_deref());
    let webview = self.page.webview();
    let asked = AskedInput { webview: webview.label(), requester, requester_name: perform.requester_name.as_deref(), perform };
    let provenance = webview.try_state::<Provenance>()?;
    provenance.declines(&asked).await
}

async fn declines(&self, call: Declinable<'_>) -> Option<String> {
    let call = match call {
        Declinable::Invoke(action) => json!({ "kind": "invoke", "action": action.name }),
        Declinable::Perform(_) => json!({ "kind": "perform" }),
    };
    match self.ask::<Option<String>>(&format!("declines({call})")).await {
        Ok(why) => why,
        Err(error) => {
            tracing::warn!(%error, "ui_tauri.endpoint.declines_unanswered");
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
/// at `path`, until the app ends, answering takeovers by `takeover`, and
/// saying in the offer whether the app runs as a dev instance. With
/// `driven`, a covered window keeps painting while a driver is connected.
pub async fn serve<R: Runtime>(path: PathBuf, webview: Webview<R>, driven: bool, takeover: TakeoverPolicy, dev_instance: bool) {
    if let Some(dir) = path.parent() {
        if let Err(error) = std::fs::create_dir_all(dir) {
            return tracing::warn!(path = %path.display(), %error, "ui_tauri.endpoint.unbound");
        }
    }
    let every = Grant { classes: vec![SideEffect::ReadOnly, SideEffect::IdempotentWrite, SideEffect::NonIdempotent] };
    let app = PageApp::new(webview.clone()).dev_instance(dev_instance);
    let endpoint = Arc::new(Endpoint::new(app, every).with_takeover(takeover));
    let listener = match bind_path(&path).await {
        Ok(listener) => listener,
        Err(error) => return tracing::warn!(path = %path.display(), %error, "ui_tauri.endpoint.unbound"),
    };
    tracing::info!(path = %path.display(), "ui_tauri.endpoint.listening");
    let drivers = Arc::new(Drivers { webview, driven, connected: Mutex::new(0) });
    loop {
        let stream = match listener.accept().await {
            Ok((stream, _)) => stream,
            Err(error) => return tracing::warn!(path = %path.display(), %error, "ui_tauri.endpoint.unbound"),
        };
        let (endpoint, requester, connected) = (Arc::clone(&endpoint), requester(&stream), Drivers::arrive(&drivers));
        let span = tracing::info_span!("ui_endpoint.connection", requester = %requester);
        tauri::async_runtime::spawn(
            async move {
                let _connected = connected;
                let _ = serve_connection_from(stream, endpoint, requester).await;
            }
            .instrument(span),
        );
    }
}

/// The drivers connected to the endpoint, and the webview they drive.
struct Drivers<R: Runtime> {
    webview: Webview<R>,
    /// Whether the window keeps painting while one is connected.
    driven: bool,
    connected: Mutex<usize>,
}

/// One driver's connection, until it ends.
struct Connected<R: Runtime>(Arc<Drivers<R>>);

impl<R: Runtime> Drivers<R> {
    /// A driver connects: the first turns the window's painting on.
    fn arrive(drivers: &Arc<Self>) -> Connected<R> {
        let mut connected = drivers.connected.lock().unwrap_or_else(PoisonError::into_inner);
        *connected += 1;
        if *connected == 1 && drivers.driven {
            crate::painting::keep_painting(&drivers.webview, true);
        }
        Connected(Arc::clone(drivers))
    }
}

impl<R: Runtime> Drop for Connected<R> {
    /// A driver leaves: the last gives WebKit its own policy back.
    fn drop(&mut self) {
        let mut connected = self.0.connected.lock().unwrap_or_else(PoisonError::into_inner);
        *connected -= 1;
        if *connected == 0 && self.0.driven {
            crate::painting::keep_painting(&self.0.webview, false);
        }
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

<a name="chunk-endpoint-file"></a><sub>[`src/endpoint.rs`](../../crates/x0k-ui-tauri/src/endpoint.rs) · `#endpoint-file` · assembles [endpoint-app](#chunk-endpoint-app) · [endpoint-offer](#chunk-endpoint-offer) · [endpoint-observe](#chunk-endpoint-observe) · [endpoint-invoke](#chunk-endpoint-invoke) · [endpoint-fixtures](#chunk-endpoint-fixtures) · [endpoint-input](#chunk-endpoint-input) · [endpoint-conditions](#chunk-endpoint-conditions) · [endpoint-cast-hooks](#chunk-endpoint-cast-hooks) · [endpoint-deliver](#chunk-endpoint-deliver) · [endpoint-cast](#chunk-endpoint-cast) · [endpoint-scale](#chunk-endpoint-scale) · [endpoint-serve](#chunk-endpoint-serve) · [endpoint-tests](#chunk-endpoint-tests)</sub>

```rust {#endpoint-file file="src/endpoint.rs"}
//! The plugin's UI-control endpoint: the page as `x0k-ui-endpoint`'s app,
//! made of what the page declares, reads and runs over the plugin's IPC.
use std::collections::{BTreeSet, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock, PoisonError};
use std::time::Instant;

use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use tauri::{Manager, Runtime, Webview};
use tracing::Instrument;
use x0k_datum::Datum;
use x0k_ui_endpoint::screencast::{Begun, ClockEnded, FrameUnanswered, StepTo, SteppedBegin, SteppedFrame};
use x0k_ui_endpoint::server::{bind_path, requester, serve_connection_from, Declinable, Endpoint, UiApp, UNNAMED};
use x0k_ui_endpoint::takeover::TakeoverPolicy;
use x0k_ui_protocol::act::{Grant, Outcome};
use x0k_ui_protocol::fixture::{PresentAnswer, ReleaseAnswer};
use x0k_ui_protocol::history::{Destination, History, HistoryCall, HistoryOffer, NavigateAnswer, Shown};
use x0k_ui_protocol::input::{HeldFrame, InputOffer, Perform, Resolved, Step, Target};
use x0k_ui_protocol::observe::{LayoutNode, Observation, ObserveCall, Part, PartRefused, StatePart};
use x0k_ui_protocol::offer::{Action, Offer, SideEffect, UI_HISTORY, UI_INPUT, UI_SCREENCAST};
use x0k_ui_protocol::page::{page_offer, state_part, Declared, DeclaredState};
use x0k_ui_protocol::screencast::{Clock, FramePart, ScreencastOffer};
use x0k_ui_protocol::shapes::{interface, interfaces};
use x0k_ui_protocol::{Refused, RefusalCode};

use crate::held::{held_capture, HOLD_TRIES};
use crate::page::{PageError, PageHold, PageHost, PAGE_GLOBAL};
use crate::provenance::{AskedInput, Provenance};

/// How many observed frames input may still name, as the shell keeps.
pub const HELD_FRAMES: usize = 8;
/// The global the library's answers are reached through: its `UI_GLOBAL`.
pub const UI_GLOBAL: &str = "__x0kUi";

<<endpoint-app>>

impl<R: Runtime> UiApp for PageApp<R> {
    <<endpoint-offer>>

    <<endpoint-observe>>

    <<endpoint-invoke>>

    <<endpoint-fixtures>>

    <<endpoint-input>>

    <<endpoint-conditions>>

    <<endpoint-cast-hooks>>
}

<<endpoint-deliver>>

<<endpoint-cast>>

<<endpoint-scale>>

<<endpoint-serve>>

<<endpoint-tests>>
```

## A stepped screencast

A screencast at the stepped clock is the page drawn at one frame's time after
another, whatever each frame costs the wall (`x0k:architecture/ui-screencast`
§5). The endpoint plays the run and asks its app for each frame through three
hooks (`x0k:implementation/ui-control/endpoint-screencast`, "The app's
hooks"); the page keeps the time, with the library's stepped clock
(`x0k:implementation/ui-control/page-clock`). `PageApp` joins the two. It
makes no check of a cast and plays no step: the endpoint has checked the cast,
asked the host's configuration for the window's hold, and plays every step as
its own call, so a `present` step reaches the page as a `present` does.

- **`stepped_begin`** begins the page's clock,
  `__x0kUiHold.steppedClock.begin({ date })`, at the date the cast names, or
  at the Unix epoch when it names none, and answers the sources the clock
  does not step that the page has now. The date is the cast's, so a page that
  shows `Date.now()` shows that date at time 0 and draws the same frames on a
  rerun from it. A cast that names a region or a scale is refused here,
  before the clock begins: the plugin captures a page whole, as it does an
  observation.
- **`step_to`** advances the clock to the frame's time, `advanceTo(ms)`, which
  answers once the frame has settled, then observes the page as `observe`
  does, held around the platform's snapshot: `webkit_web_view_get_snapshot`
  on Linux and `takeSnapshot` on macOS. While the clock steps, the hold
  pauses nothing, since the clock has paused it all, so the hold adds a
  verify and the read of the layout and the state, and nothing moves. The
  frame is captured alone, the drawing layer hidden, unless the cast asks
  for the host's drawing. Its compose time is the step's and the
  observation's on the wall, and the work the clock waited on to its bound is
  named, which the endpoint reads as a reason a rerun may differ. A frame
  the cast's frames keep is not one input may name, so a `perform` step
  later in the run still names a frame the driver observed.
- **`stepped_end`** ends the clock, `end()`, which gives every animation,
  timer and frame callback back to the wall and says whether a rerun would
  draw the same frames, and why not; then it ends the hold.

The hold is a takeover's (above, "Holding a takeover"): the endpoint's
`hold_for` with `HoldKind::SteppedScreencast` reaches `PageApp`'s
`hold_takeover` or `grant_takeover`, as a sequence's takeover does, so the
host's configuration answers it, the ask is drawn when it says ask, and the
person's input waits while it holds. The person's exit key ends a hold at
once, and a stepped frame needs one: `step_to` answers no frame once the
requester's hold no longer stands, so the screencast ends `failed`, naming
the person's exit, with the frames already drawn.

The offer names `ui/screencast` with the one clock, `stepped`, and the
library's list of what its clock never steps, `steppedClock.unstepped()`,
read once. A Tauri app's page has no platform capture of its window as it
presents, so the plugin offers no `streamed` clock. The longest screencast is
`MAX_CAST_MS`, a minute, and `MAX_CAST_FRAMES` frames, which is frame 0 to
frame 3600 of a minute at 60 fps.

The library tells the plugin nothing of the animations a frame shows, so a
frame answers no `animations` part.

<a name="chunk-endpoint-cast-hooks"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#endpoint-cast-hooks`</sub>

```rust {#endpoint-cast-hooks}
async fn stepped_begin(&self, begin: &SteppedBegin) -> Result<Begun, Refused> {
    self.begin_cast(begin).await
}

async fn step_to(&self, to: StepTo) -> Result<SteppedFrame, FrameUnanswered> {
    self.step_cast(to).await
}

async fn stepped_end(&self) -> ClockEnded {
    self.end_cast().await
}
```

<a name="chunk-endpoint-cast"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#endpoint-cast`</sub>

```rust {#endpoint-cast}
/// The longest stepped screencast the plugin makes, in frames and in
/// milliseconds: a minute at 60 fps.
pub const MAX_CAST_FRAMES: u64 = 3601;
pub const MAX_CAST_MS: u64 = 60_000;

/// A stepped screencast while it plays: for whom the window is held, and the
/// observation each frame is.
#[derive(Clone)]
struct Casting {
    requester: String,
    frame: ObserveCall,
}

/// What the library's `steppedClock.begin` answers.
#[derive(serde::Deserialize)]
struct ClockBegun {
    unstepped: Vec<String>,
}

/// What the library's `steppedClock.advanceTo` answers, of what the plugin reads.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClockStepped {
    #[serde(default)]
    over_bound: Vec<String>,
    #[serde(default)]
    unpainted: Option<String>,
}

/// What the library's `steppedClock.end` answers.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClockEnd {
    same_on_rerun: bool,
    why: Vec<String>,
}

impl<R: Runtime> PageApp<R> {
    /// What the library's stepped clock answers to `call`, one of its words.
    async fn clock<T: DeserializeOwned>(&self, call: &str) -> Result<T, PageError> {
        let answered = self.page.evaluate(&format!("return JSON.stringify(await globalThis.{PAGE_GLOBAL}.steppedClock.{call});")).await?;
        serde_json::from_str(&answered).map_err(|e| PageError::Malformed(e.to_string()))
    }

    /// The sources of motion the library's clock never steps, read once; none
    /// while the page cannot say, so the offer names no screencast then.
    async fn unstepped(&self) -> Option<Vec<String>> {
        if let Some(known) = self.unstepped.get() {
            return Some(known.clone());
        }
        match self.clock::<Vec<String>>("unstepped()").await {
            Ok(listed) => Some(self.unstepped.get_or_init(|| listed).clone()),
            Err(error) => {
                tracing::warn!(%error, "ui_tauri.cast.unstepped_unanswered");
                None
            }
        }
    }

    fn casting(&self) -> Option<Casting> {
        self.casting.lock().unwrap_or_else(PoisonError::into_inner).clone()
    }

    async fn begin_cast(&self, begin: &SteppedBegin) -> Result<Begun, Refused> {
        let refused = |why: String| Refused { code: RefusalCode::MisfitArguments, subject: Some(UI_SCREENCAST.to_string()), why };
        let parts = begin
            .parts
            .iter()
            .filter_map(|part| match part {
                FramePart::Capture => Some(Part::Capture),
                FramePart::Layout => Some(Part::Layout),
                FramePart::State => Some(Part::State),
                FramePart::Animations => None,
            })
            .collect();
        let frame = ObserveCall { parts, region: None, scale: None, frame_only: !begin.presented };
        *self.casting.lock().unwrap_or_else(PoisonError::into_inner) = Some(Casting { requester: begin.requester.clone(), frame });
        if begin.region.is_some() || begin.scale.is_some() {
            return Err(refused("the plugin captures a stepped frame whole, at the capture's own scale".to_string()));
        }
        match self.clock::<ClockBegun>(&format!("begin({{ date: {} }})", begin.date)).await {
            Ok(begun) => Ok(Begun { unstepped: begun.unstepped }),
            Err(error) => Err(refused(format!("the page's stepped clock did not begin: {error}"))),
        }
    }

    async fn step_cast(&self, to: StepTo) -> Result<SteppedFrame, FrameUnanswered> {
        let unanswered = |why: String| FrameUnanswered { why };
        let Some(Casting { requester, frame }) = self.casting() else {
            return Err(unanswered("no stepped screencast plays".to_string()));
        };
        if !self.page.holds_takeover(&requester) {
            return Err(unanswered(format!("the person ended {requester}'s hold of the window")));
        }
        let started = Instant::now();
        let stepped: ClockStepped = self
            .clock(&format!("advanceTo({})", to.time_ms()))
            .await
            .map_err(|error| unanswered(format!("the page's stepped clock did not step: {error}")))?;
        if let Some(why) = stepped.unpainted {
            return Err(unanswered(why));
        }
        let observation = self.observed(&frame, false).await.map_err(|error| unanswered(error.to_string()))?;
        let compose_us = u64::try_from(started.elapsed().as_micros()).ok();
        Ok(SteppedFrame { observation, animations: None, compose_us, unchanged: false, over_bound: stepped.over_bound })
    }

    async fn end_cast(&self) -> ClockEnded {
        let casting = self.casting.lock().unwrap_or_else(PoisonError::into_inner).take();
        let ended = match self.clock::<ClockEnd>("end()").await {
            Ok(ended) => ClockEnded { same_on_rerun: ended.same_on_rerun, why: ended.why },
            Err(error) => ClockEnded { same_on_rerun: false, why: vec![format!("the page's stepped clock did not end: {error}")] },
        };
        if let Some(casting) = casting {
            self.page.end_takeover(&casting.requester);
        }
        ended
    }
}
```

## The probe app

The probe app is the smallest Tauri app the plugin can hold: one window, the
probe page, and a unix socket its test drives it over. It is a binary crate,
because a Tauri app needs a build script of its own, and it is never shipped.

<a name="chunk-probe-manifest"></a><sub>[`probe-app/Cargo.toml`](../../crates/x0k-ui-tauri/probe-app/Cargo.toml) · `#probe-manifest`</sub>

```toml {#probe-manifest file="probe-app/Cargo.toml"}
[package]
name = "x0k-ui-tauri-probe"
version = "0.3.0"
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
x0k-ui-protocol = { path = "../../x0k-ui-protocol", version = "0.3.0" }
x0k-ui-tauri = { path = "..", version = "0.3.0" }
# The client a driver calls the app's own endpoint through, for the probe's `endpoint` request.
x0k-ui-endpoint = { path = "../../x0k-ui-endpoint", version = "0.3.0" }

[target.'cfg(target_os = "linux")'.dependencies]
# The webview's hardware acceleration policy.
webkit2gtk = "2.0"
# The app-level GDK hooks the provenance claims watch.
gtk = "0.18"

[target.'cfg(target_os = "macos")'.dependencies]
# An AppKit local event monitor, and a real event sent through NSApplication,
# for the provenance claims.
block2 = "0.6"
objc2 = "0.6"
objc2-app-kit = { version = "0.3", default-features = false, features = ["std", "block2", "NSApplication", "NSEvent", "NSResponder", "NSView", "NSWindow"] }
objc2-foundation = { version = "0.3", default-features = false, features = ["std", "NSGeometry", "NSProcessInfo"] }

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
`x0k-ui-tauri-probe`, served from the window `probe`. Given a sixth
argument, a socket's path, it adds the plugin with `ui_plugin_at` instead, as
an app that places its endpoint itself does, and calls its own endpoint
there. When the
page has loaded, it connects to the test's socket and serves it. The
compositing policy is WebKitGTK's. A WKWebView always composites, so on macOS
the app takes the argument and sets nothing.

<a name="chunk-probe-main"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#probe-main`</sub>

```rust {#probe-main}
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (socket, width, height, policy, page, at) = match &args[..] {
        [_, socket, width, height, policy, page] => (socket, width, height, policy, page, None),
        [_, socket, width, height, policy, page, at] => (socket, width, height, policy, page, Some(PathBuf::from(at))),
        _ => {
            eprintln!("usage: x0k-ui-tauri-probe <socket> <width> <height> <ALWAYS|NEVER> <page.html> [<endpoint path>]");
            std::process::exit(2);
        }
    };
    let (width, height): (f64, f64) = (width.parse().expect("width"), height.parse().expect("height"));
    let (socket, accelerate, page) = (socket.clone(), policy == "ALWAYS", page.clone());
    let _ = MAIN.set(std::thread::current().id());
    let plugin = match &at {
        Some(path) => UiPlugin::at(path.clone(), "probe"),
        None => UiPlugin::new(APP, "probe"),
    };
    let endpoint = at.unwrap_or_else(|| x0k_ui_tauri::endpoint_socket_path(APP));
    let takeover: TakeoverPolicy = std::env::var(TAKEOVER).map_or_else(|_| TakeoverPolicy::default(), |table| serde_json::from_str(&table).expect("the takeover table"));
    let plugin = plugin.dev_instance(std::env::var_os(DEV_INSTANCE).is_some());
    tauri::Builder::default()
        .plugin(plugin.covered(CoveredPainting::default()).on_input(record_delivered).before_input(turn).takeover(takeover).build())
        .invoke_handler(tauri::generate_handler![probe_heard])
        .setup(move |app| {
            let (socket, endpoint) = (socket.clone(), endpoint.clone());
            let window = WebviewWindowBuilder::new(app, "probe", WebviewUrl::App(page.into()))
                .inner_size(width, height)
                .on_page_load(move |window, payload| {
                    if payload.event() == PageLoadEvent::Finished {
                        tauri::async_runtime::spawn(serve(socket.clone(), endpoint.clone(), window.as_ref().clone()));
                    }
                })
                .build()?;
            #[cfg(target_os = "linux")]
            window.with_webview(move |platform| {
                use webkit2gtk::{HardwareAccelerationPolicy, SettingsExt, WebViewExt};
                let settings = WebViewExt::settings(&platform.inner()).expect("the webview's settings");
                settings.set_hardware_acceleration_policy(if accelerate { HardwareAccelerationPolicy::Always } else { HardwareAccelerationPolicy::Never });
            })?;
            watch_app_hooks(&window);
            #[cfg(not(target_os = "linux"))]
            let _ = accelerate;
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
- `{"op": "forge"}` runs the nonce test below;
- `{"op": "hide"}` and `{"op": "show"}` hide the app's window and show it
  again, as a person minimising it would, so the window does not present;
- `{"op": "endpoint", "call", "argument"}` makes one call, `observe`,
  `invoke`, `perform`, `present`, `release` or `cast`, to the app's own
  endpoint as a driver does, over a session of its own, and answers the
  endpoint's `answer` and how many `ms` it took, or the client's `fault`;
  with `hold_ms` the session stays open that long after the call answers, as
  a fixture it presents stands only while its session does; with `detach`
  true it answers at once
  with a number, `detached`, and `{"op": "join", "detached"}` answers the
  call once it has. A `cast` with `frames`, a frames call's indices and
  parts, reads those frames of the screencast in the same session, which
  holds it, and answers them as `frames`;
- `{"op": "person", "key"}` and `{"op": "person", "click": [x, y]}` make a
  person's input as the windowing system's events arrive, put on GDK's
  queue: a key's press and release in the toplevel window, or a press and
  release of the first button at a position in the webview's units
  (Linux only);
- `{"op": "told"}` answers, and forgets, what the host was told of the input
  the plugin delivered, what the page's handlers asked the host about it,
  and what the app-level hooks saw (below, "What the host is told");
- `{"op": "turn", "turn", "why", "within_ms", "resume_after_ms"}` sets what
  the host's `before_input` answers from then on: `run`, `decline` with
  `why`, or `wait` at most `within_ms` and then decline with `why`; with
  `resume_after_ms`, it answers `run` that long after and calls
  `resume_input`;
- `{"op": "real"}` makes one event the way the platform makes a person's:
  on Linux a Shift key's press and release put on GDK's queue, on macOS a mouse move sent
  through `NSApplication`'s `sendEvent:`; it answers the time it carries.

<a name="chunk-probe-serve"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#probe-serve`</sub>

```rust {#probe-serve}
/// Connect to the test's socket, say ready, and answer each request line,
/// calling the app's own endpoint at `endpoint`.
async fn serve(socket: String, endpoint: PathBuf, webview: Webview<Wry>) {
    let stream = connect_test_socket(&socket).expect("the test's socket");
    stream.set_nonblocking(true).expect("a nonblocking socket");
    let (read, mut write) = UnixStream::from_std(stream).expect("the test's socket").into_split();
    let page = PageHost::new(webview.clone());
    let mut detached = Vec::new();
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
            Some("hide") => webview.window().hide().map(|()| json!({})).map_err(PageError::from),
            Some("show") => webview.window().show().map(|()| json!({})).map_err(PageError::from),
            Some("endpoint") if request["detach"] == true => {
                let (endpoint, request) = (endpoint.clone(), request.clone());
                detached.push(tauri::async_runtime::spawn(async move { endpoint_probe(&endpoint, &request).await }));
                Ok(json!({ "detached": detached.len() - 1 }))
            }
            Some("endpoint") => Ok(endpoint_probe(&endpoint, &request).await),
            Some("join") => match request["detached"].as_u64().and_then(|n| detached.get_mut(n as usize)) {
                Some(call) => Ok(call.await.unwrap_or_else(|e| json!({ "fault": e.to_string() }))),
                None => Ok(json!({ "error": "no such detached call" })),
            },
            Some("person") => person_input(&webview, &request).await,
            Some("told") => Ok(told_probe(&webview)),
            Some("turn") => Ok(turn_probe(&webview, &request)),
            Some("real") => real_event(&webview).await,
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
    let epoch = page.perform("probe", &perform, &resolved, request["scale"].as_f64().unwrap_or(f64::NAN)).await?.map_or(Value::Null, Value::from);
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

<a name="chunk-probe-file"></a><sub>[`probe-app/src/main.rs`](../../crates/x0k-ui-tauri/probe-app/src/main.rs) · `#probe-file` · assembles [probe-main](#chunk-probe-main) · [probe-serve](#chunk-probe-serve) · [probe-observe](#chunk-probe-observe) · [probe-input](#chunk-probe-input) · [probe-drawn](#chunk-probe-drawn) · [probe-host](#chunk-probe-host) · [probe-forge](#chunk-probe-forge) · [probe-endpoint](#chunk-probe-endpoint) · [probe-told](#chunk-probe-told) · [probe-turn](#chunk-probe-turn) · [probe-hooks](#chunk-probe-hooks) · [probe-socket](#chunk-probe-socket)</sub>

```rust {#probe-file file="probe-app/src/main.rs"}
//! A minimal Tauri app for x0k-ui-tauri's probe test: the probe page in one
//! window, driven by the test over a unix socket.
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use base64::Engine as _;
use serde_json::{json, Value};
use std::sync::{Mutex, OnceLock, PoisonError};
use std::thread::ThreadId;

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, Webview, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Wry};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;
use tokio::sync::oneshot;
use x0k_ui_endpoint::client::UiClient;
use x0k_ui_endpoint::CastAnswer;
use x0k_ui_protocol::input::{check_perform, Event, HeldFrame, Perform};
use x0k_ui_protocol::offer::{Offer, UI_INPUT};
use x0k_ui_tauri::{
    held_capture, last_delivered, resume_input, AskedInput, CoveredPainting, DeliveredInput, Held, HoldingHost, InputTurn, PageError, PageHold, PageHost, Pending,
    Snapshot, TakeoverPolicy, UiPlugin, HOLD_TRIES, PAGE_GLOBAL,
};

/// The probe app's name, which its endpoint is named for.
const APP: &str = "x0k-ui-tauri-probe";
/// The variable whose JSON is the host's takeover configuration, the serde
/// form of `TakeoverPolicy`; unset, every takeover asks.
const TAKEOVER: &str = "X0K_UI_TAURI_PROBE_TAKEOVER";
/// The variable whose presence has the probe app run as a dev instance.
const DEV_INSTANCE: &str = "X0K_UI_TAURI_PROBE_DEV_INSTANCE";

<<probe-main>>

<<probe-serve>>

<<probe-observe>>

<<probe-input>>

<<probe-drawn>>

<<probe-host>>

<<probe-forge>>

<<probe-endpoint>>

<<probe-told>>

<<probe-turn>>

<<probe-hooks>>

<<probe-socket>>
```

A call to the app's own endpoint goes through `UiClient`, as any driver's
does, so the endpoint's checks and the plugin's answers are what the test sees.

<a name="chunk-probe-endpoint"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#probe-endpoint`</sub>

```rust {#probe-endpoint}
/// One call to the app's endpoint at `endpoint` as `request` names it, and how long it took.
async fn endpoint_probe(endpoint: &Path, request: &Value) -> Value {
    let started = Instant::now();
    let answered = endpoint_call(endpoint, request).await;
    let ms = started.elapsed().as_secs_f64() * 1000.0;
    match answered {
        Ok((answer, None)) => json!({ "answer": answer, "ms": ms }),
        Ok((answer, Some(frames))) => json!({ "answer": answer, "frames": frames, "ms": ms }),
        Err(fault) => json!({ "fault": fault.to_string(), "ms": ms }),
    }
}

/// How long the probe waits for a screencast to be played.
const CAST_WITHIN: Duration = Duration::from_secs(600);

/// Why a call to the endpoint got no answer: the socket, the client, or a request the test spelled wrong.
type Fault = Box<dyn std::error::Error + Send + Sync>;

/// The endpoint's answer to the call `request` names, and to a cast the
/// frames it asks for, read in the cast's own session, which stays open
/// `hold_ms` after it answers, since a session's end releases a fixture it
/// presented.
async fn endpoint_call(endpoint: &Path, request: &Value) -> Result<(Value, Option<Value>), Fault> {
    let stream = UnixStream::connect(endpoint).await?;
    let client = UiClient::open(stream).await?;
    let argument = request["argument"].clone();
    let hold = Duration::from_millis(request["hold_ms"].as_u64().unwrap_or(0));
    let answer = match request["call"].as_str().unwrap_or_default() {
        "observe" => (serde_json::to_value(client.observe(&serde_json::from_value(argument)?).await?)?, None),
        "invoke" => (serde_json::to_value(client.invoke(&serde_json::from_value(argument)?).await?)?, None),
        "perform" => (serde_json::to_value(client.perform(&serde_json::from_value(argument)?).await?)?, None),
        "present" => (serde_json::to_value(client.present(&serde_json::from_value(argument)?).await?)?, None),
        "release" => (serde_json::to_value(client.release(&serde_json::from_value(argument)?).await?)?, None),
        "cast" => {
            let cast = client.cast(&serde_json::from_value(argument)?, CAST_WITHIN).await?;
            let frames = match (&cast, request.get("frames")) {
                (CastAnswer::Cast(screencast), Some(asked)) => {
                    let mut asked = asked.clone();
                    asked["handle"] = json!(screencast.handle);
                    Some(serde_json::to_value(client.frames(&serde_json::from_value(asked)?).await?)?)
                }
                _ => None,
            };
            (serde_json::to_value(cast)?, frames)
        }
        other => return Err(format!("no endpoint call {other}").into()),
    };
    tokio::time::sleep(hold).await;
    Ok(answer)
}
```

**What the host is told.** The probe app is the host the provenance claims
are made against. Its observer records each event it is told of: its kind,
its position, its key, its webview, its requester, its platform time, and
whether it was told on the main thread, which is the thread `main` ran on.
It also records the instant it was told, so the `told` request can say
whether `last_delivered` answers the instant of the last event told.

The page's handlers ask the host as chariot's page does when a person
approves: the input test's page calls the app's own command, `probe_heard`,
from its trusted `mousedown`, `mouseup`, `keydown`, `keyup` and `wheel`
handlers. The command records how many events the host had been told of
when the page's request reached it, and whether `last_delivered` answered
then. A host told after the view was handed an event, or told on another
thread later, would be asked about an event it has not recorded.

<a name="chunk-probe-told"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#probe-told`</sub>

```rust {#probe-told}
/// What the probe app saw of input: the events its observer was told of,
/// the page's requests about them, and the app-level hooks' events.
struct Witness {
    told: Vec<Value>,
    heard: Vec<Value>,
    hooks: Vec<Value>,
    last_told: Option<Instant>,
}

static WITNESS: Mutex<Witness> = Mutex::new(Witness { told: Vec::new(), heard: Vec::new(), hooks: Vec::new(), last_told: None });
/// The thread `main` runs on, which Tauri's main thread is.
static MAIN: OnceLock<ThreadId> = OnceLock::new();

fn witness() -> std::sync::MutexGuard<'static, Witness> {
    WITNESS.lock().unwrap_or_else(PoisonError::into_inner)
}

/// The host's observer: one record per event the plugin delivers.
fn record_delivered(delivered: &DeliveredInput) {
    let main = MAIN.get() == Some(&std::thread::current().id());
    let (kind, at, key) = match &delivered.event {
        Event::Move { x, y, .. } => ("move", Some((*x, *y)), None),
        Event::Press { x, y, .. } => ("press", Some((*x, *y)), None),
        Event::Release { x, y, .. } => ("release", Some((*x, *y)), None),
        Event::KeyDown { key, .. } => ("key_down", None, Some(key.clone())),
        Event::KeyUp { key, .. } => ("key_up", None, Some(key.clone())),
        Event::Scroll { x, y, .. } => ("scroll", Some((*x, *y)), None),
    };
    let mut seen = witness();
    seen.last_told = Some(delivered.at);
    seen.told.push(json!({
        "kind": kind, "x": at.map(|a| a.0), "y": at.map(|a| a.1), "key": key, "webview": delivered.webview,
        "requester": delivered.requester, "name": delivered.requester_name, "time": delivered.platform_time, "main": main,
    }));
}

/// The page's request about an event of `kind` it handled: how many events
/// the host had been told of when it arrived, and whether `last_delivered` answered.
#[tauri::command]
fn probe_heard(app: AppHandle, kind: String) {
    let last = last_delivered(&app, "probe").is_some();
    let mut seen = witness();
    let told = seen.told.len();
    seen.heard.push(json!({ "kind": kind, "told": told, "last": last }));
}

/// What was seen since the last `told`, forgotten as it is answered, and
/// whether `last_delivered` answers the instant of the last event told.
fn told_probe(webview: &Webview<Wry>) -> Value {
    let last = last_delivered(webview, "probe");
    let mut seen = witness();
    let answer = json!({
        "told": std::mem::take(&mut seen.told), "heard": std::mem::take(&mut seen.heard), "hooks": std::mem::take(&mut seen.hooks),
        "lastIsLastTold": last.is_some() && last == seen.last_told,
    });
    answer
}
```

The probe app's `before_input` answers what the test last set with the `turn`
request, and `run` until then. A `resume_after_ms` lets a waiting sequence go
from a task of the app's own, as a host does when the person stops.

<a name="chunk-probe-turn"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#probe-turn`</sub>

```rust {#probe-turn}
/// What the host's `before_input` answers, as the test last set it.
static TURN: Mutex<Option<InputTurn>> = Mutex::new(None);

/// The host's answer to whether a driver's sequence may run.
fn turn(_asked: &AskedInput<'_>) -> InputTurn {
    TURN.lock().unwrap_or_else(PoisonError::into_inner).clone().unwrap_or(InputTurn::Run)
}

/// Set what `turn` answers, and let it run after `resume_after_ms` when asked.
fn turn_probe(webview: &Webview<Wry>, request: &Value) -> Value {
    let why = request["why"].as_str().unwrap_or_default().to_string();
    let answer = match request["turn"].as_str() {
        Some("decline") => InputTurn::Decline(why),
        Some("wait") => InputTurn::Wait { within: Duration::from_millis(request["within_ms"].as_u64().unwrap_or(0)), why },
        _ => InputTurn::Run,
    };
    *TURN.lock().unwrap_or_else(PoisonError::into_inner) = Some(answer);
    if let Some(after) = request["resume_after_ms"].as_u64() {
        let app = webview.app_handle().clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(after)).await;
            *TURN.lock().unwrap_or_else(PoisonError::into_inner) = Some(InputTurn::Run);
            resume_input(&app);
        });
    }
    json!({})
}
```

The app-level hooks are the ones a host would watch a person's input with.
On Linux the app installs a GDK event handler, which wraps
`gtk_main_do_event` as GTK's own does, a key snooper, and a handler of its
toplevel window's `event` signal, and each records the input events it is
called with. On macOS it installs an AppKit local event monitor for every
event kind, which records each event's kind and timestamp and passes it on.
The `real` request makes the event each hook exists for: a Shift key's press
and release put on GDK's queue, or a mouse move handed to `NSApplication`'s
`sendEvent:`.

<a name="chunk-probe-hooks"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#probe-hooks`</sub>

```rust {#probe-hooks}
/// The input events of GDK's kinds a hook records, by name.
#[cfg(target_os = "linux")]
fn input_kind(kind: gtk::gdk::EventType) -> Option<&'static str> {
    use gtk::gdk::EventType as E;
    Some(match kind {
        E::MotionNotify => "MotionNotify",
        E::ButtonPress => "ButtonPress",
        E::ButtonRelease => "ButtonRelease",
        E::KeyPress => "KeyPress",
        E::KeyRelease => "KeyRelease",
        E::Scroll => "Scroll",
        _ => return None,
    })
}

#[cfg(target_os = "linux")]
fn hooked(hook: &str, event: &gtk::gdk::Event) {
    if let Some(kind) = input_kind(event.event_type()) {
        witness().hooks.push(json!({ "hook": hook, "kind": kind, "time": event.time() }));
    }
}

/// GTK's key snooper, which sees each key event `gtk_main_do_event` dispatches.
#[cfg(target_os = "linux")]
unsafe extern "C" fn snooped(_: *mut gtk::ffi::GtkWidget, key: *mut gtk::gdk::ffi::GdkEventKey, _: gtk::glib::ffi::gpointer) -> std::os::raw::c_int {
    // SAFETY: GTK hands the snooper a key event, valid for the call.
    let (kind, time) = unsafe { ((*key).type_, (*key).time) };
    let kind = if kind == gtk::gdk::ffi::GDK_KEY_PRESS { "KeyPress" } else { "KeyRelease" };
    witness().hooks.push(json!({ "hook": "key snooper", "kind": kind, "time": time }));
    0
}

/// The app-level hooks of a GTK app: a GDK event handler, a key snooper and
/// the toplevel window's `event` signal.
#[cfg(target_os = "linux")]
fn watch_app_hooks(window: &WebviewWindow<Wry>) {
    use gtk::prelude::*;
    gtk::gdk::Event::set_handler(Some(|event: &mut gtk::gdk::Event| {
        hooked("gdk event handler", event);
        gtk::main_do_event(event);
    }));
    // SAFETY: the snooper is a function for the app's life, and takes no data.
    unsafe { gtk::ffi::gtk_key_snooper_install(Some(snooped), std::ptr::null_mut()) };
    if let Ok(toplevel) = window.gtk_window() {
        toplevel.connect_event(|_, event| {
            hooked("toplevel event", event);
            gtk::glib::Propagation::Proceed
        });
    }
}

/// A Shift key's press and release in the webview's toplevel window, put on
/// GDK's queue as the windowing system's events are, and their time. A key,
/// not a motion: GDK holds a queued motion back until its frame clock flushes.
#[cfg(target_os = "linux")]
async fn real_event(webview: &Webview<Wry>) -> Result<Value, PageError> {
    use gtk::glib::translate::ToGlibPtr;
    use gtk::prelude::*;
    let (done, put) = oneshot::channel();
    webview.with_webview(move |platform| {
        let Some(window) = platform.inner().toplevel().and_then(|top| top.window()) else { return };
        let keyboard = window.display().default_seat().and_then(|seat| seat.keyboard());
        let time = (gtk::glib::monotonic_time() / 1000) as u32;
        for kind in [gtk::gdk::EventType::KeyPress, gtk::gdk::EventType::KeyRelease] {
            let mut made = gtk::gdk::Event::new(kind);
            made.set_device(keyboard.as_ref());
            let raw: &mut gtk::gdk::ffi::GdkEventKey = made.downcast_mut::<gtk::gdk::EventKey>().expect("a key event").as_mut();
            (raw.window, raw.time, raw.keyval, raw.is_modifier) = (window.to_glib_full(), time, *gtk::gdk::keys::constants::Shift_L, 1);
            made.put();
        }
        let _ = done.send(time);
    })?;
    let time = put.await.map_err(|_| PageError::NoWindow)?;
    tokio::time::sleep(Duration::from_millis(100)).await;
    Ok(json!({ "time": time }))
}

/// The app-level hook of an AppKit app: a local event monitor for every
/// kind of event, kept for the app's life.
#[cfg(target_os = "macos")]
fn watch_app_hooks(_window: &WebviewWindow<Wry>) {
    use objc2_app_kit::{NSEvent, NSEventMask, NSEventType};
    let seen = block2::RcBlock::new(|event: std::ptr::NonNull<NSEvent>| -> *mut NSEvent {
        // SAFETY: AppKit hands the monitor an event, valid for the call.
        let event_ref = unsafe { event.as_ref() };
        let kind = match event_ref.r#type() {
            NSEventType::MouseMoved => "MouseMoved".to_string(),
            NSEventType::LeftMouseDown => "LeftMouseDown".to_string(),
            NSEventType::LeftMouseUp => "LeftMouseUp".to_string(),
            NSEventType::LeftMouseDragged => "LeftMouseDragged".to_string(),
            NSEventType::KeyDown => "KeyDown".to_string(),
            NSEventType::KeyUp => "KeyUp".to_string(),
            NSEventType::FlagsChanged => "FlagsChanged".to_string(),
            NSEventType::ScrollWheel => "ScrollWheel".to_string(),
            other => format!("{other:?}"),
        };
        witness().hooks.push(json!({ "hook": "local monitor", "kind": kind, "time": event_ref.timestamp() }));
        event.as_ptr()
    });
    // SAFETY: the handler answers the event it was given, a valid pointer.
    let monitor = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::Any, &seen) };
    std::mem::forget(monitor);
}

/// A mouse move in the webview's window, handed to `NSApplication`'s
/// `sendEvent:` as AppKit hands it a person's, and its timestamp.
#[cfg(target_os = "macos")]
async fn real_event(webview: &Webview<Wry>) -> Result<Value, PageError> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSEvent, NSEventModifierFlags, NSEventType, NSView};
    use objc2_foundation::{NSPoint, NSProcessInfo};
    let (done, sent) = oneshot::channel();
    webview.with_webview(move |platform| {
        // SAFETY: on macOS `inner()` is the webview's WKWebView, an NSView,
        // alive while this closure runs on the main thread.
        let view = unsafe { &*platform.inner().cast::<NSView>() };
        let (Some(mtm), Some(window)) = (MainThreadMarker::new(), view.window()) else { return };
        let time = NSProcessInfo::processInfo().systemUptime();
        let made = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
            NSEventType::MouseMoved, NSPoint::new(10.0, 10.0), NSEventModifierFlags::empty(), time, window.windowNumber(), None, 0, 0, 0.0,
        );
        if let Some(made) = made {
            NSApplication::sharedApplication(mtm).sendEvent(&made);
            let _ = done.send(time);
        }
    })?;
    let time = sent.await.map_err(|_| PageError::NoWindow)?;
    tokio::time::sleep(Duration::from_millis(100)).await;
    Ok(json!({ "time": time }))
}

/// A person's input, made as the windowing system's events arrive: put on
/// GDK's queue, so GDK's event handler hands it to `gtk_main_do_event` and
/// the window meets it as a person's. A key's press and release go to the
/// toplevel window; a click's press and release of the first button go to
/// the webview widget's window at `click`, in its units.
#[cfg(target_os = "linux")]
async fn person_input(webview: &Webview<Wry>, request: &Value) -> Result<Value, PageError> {
    use gtk::gdk::{self, EventType};
    use gtk::glib::translate::ToGlibPtr;
    use gtk::prelude::*;
    let key = request["key"].as_str().map(str::to_string);
    let click = request["click"].as_array().map(|at| (at[0].as_f64().unwrap_or(0.0), at[1].as_f64().unwrap_or(0.0)));
    let (done, put) = oneshot::channel();
    webview.with_webview(move |platform| {
        let view = platform.inner();
        let (Some(window), Some(toplevel)) = (view.window(), view.toplevel().and_then(|top| top.window())) else { return };
        let seat = window.display().default_seat();
        let time = (gtk::glib::monotonic_time() / 1000) as u32;
        if let Some(key) = &key {
            let keyval = if key == "Escape" { *gdk::keys::constants::Escape } else { *key.chars().next().map(gdk::keys::Key::from_unicode).unwrap_or(gdk::keys::constants::VoidSymbol) };
            let entry = gdk::Keymap::for_display(&window.display()).and_then(|map| map.entries_for_keyval(keyval).into_iter().next());
            for kind in [EventType::KeyPress, EventType::KeyRelease] {
                let mut made = gdk::Event::new(kind);
                made.set_device(seat.as_ref().and_then(|seat| seat.keyboard()).as_ref());
                let raw: &mut gdk::ffi::GdkEventKey = made.downcast_mut::<gdk::EventKey>().expect("a key event").as_mut();
                (raw.window, raw.time, raw.keyval) = (toplevel.to_glib_full(), time, keyval);
                if let Some(entry) = &entry {
                    (raw.hardware_keycode, raw.group) = (entry.keycode() as u16, entry.group() as u8);
                }
                made.put();
            }
        }
        if let Some((x, y)) = click {
            let (x_root, y_root) = window.root_coords(x.round() as i32, y.round() as i32);
            for kind in [EventType::ButtonPress, EventType::ButtonRelease] {
                let mut made = gdk::Event::new(kind);
                made.set_device(seat.as_ref().and_then(|seat| seat.pointer()).as_ref());
                let raw: &mut gdk::ffi::GdkEventButton = made.downcast_mut::<gdk::EventButton>().expect("a button event").as_mut();
                let state = if kind == EventType::ButtonRelease { gdk::ModifierType::BUTTON1_MASK.bits() } else { 0 };
                (raw.window, raw.time, raw.x, raw.y, raw.button, raw.state) = (window.to_glib_full(), time, x, y, 1, state);
                (raw.x_root, raw.y_root) = (f64::from(x_root), f64::from(y_root));
                made.put();
            }
        }
        let _ = done.send(time);
    })?;
    let time = put.await.map_err(|_| PageError::NoWindow)?;
    tokio::time::sleep(Duration::from_millis(150)).await;
    Ok(json!({ "time": time }))
}

#[cfg(not(target_os = "linux"))]
async fn person_input(_webview: &Webview<Wry>, _request: &Value) -> Result<Value, PageError> {
    Err(PageError::NoWindow)
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn watch_app_hooks(_window: &WebviewWindow<Wry>) {}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
async fn real_event(_webview: &Webview<Wry>) -> Result<Value, PageError> {
    Err(PageError::NoWindow)
}
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
const deadline = (what: string, ms = ANSWER_MS) => new Promise<never>((_, fail) =>
  setTimeout(() => fail(new Error(`the probe app did not ${what} within ${ms} ms`)), ms).unref());

/** The probe app, composited or not, showing `page`, and a call to it: on
 * Linux on an X server of its own at GDK's `gdkScale` widget scale, on macOS
 * on the Mac's display at its own backing scale. With `at`, the app gives the
 * plugin its endpoint's path, `given/probe.endpoint` in its runtime directory,
 * by `ui_plugin_at`. With `takeover`, the host's takeover configuration is
 * that table; without, every takeover asks. With `dev`, the app runs as a
 * dev instance. */
async function probeApp(compositing: boolean, gdkScale = 1, page = 'probe-page.html', at = false, takeover?: object, dev = false) {
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
    const endpoint = at ? `${runtime}/given/probe.endpoint` : `${runtime}/ui-control/x0k-ui-tauri-probe.endpoint`;
    const appEnv: NodeJS.ProcessEnv = { ...env, X0K_RUNTIME_DIR: runtime, ...(x ? { DISPLAY: x.name } : {}),
      ...(takeover ? { X0K_UI_TAURI_PROBE_TAKEOVER: JSON.stringify(takeover) } : {}),
      ...(dev ? { X0K_UI_TAURI_PROBE_DEV_INSTANCE: '1' } : {}) };
    delete appEnv.X0K_UI_CONTROL_ENDPOINT_DIR;
    const args = [PROBE, address, String(SIZE.width), String(SIZE.height), compositing ? 'ALWAYS' : 'NEVER', page, ...(at ? [endpoint] : [])];
    const app = x
      ? spawnOwned(RUN, args, { env: appEnv, stderr: 'inherit' })
      : spawnOwned(args[0], args.slice(1), { env: appEnv, stderr: 'inherit' });
    stops.push(async () => { server.close(); }, () => app.stop());
    const ended = new Promise<never>((_, fail) => app.once('exit', (code) => fail(new Error(`the probe app ended (${code})`))));
    const link = await Promise.race([accepted, ended, deadline('load the page')]);
    const lines = createInterface({ input: link })[Symbol.asyncIterator]();
    const next = async (within = ANSWER_MS) => JSON.parse((await Promise.race([lines.next(), ended, deadline('answer', within)])).value);
    const tauri = (await next()).ready;
    let last = 0;
    /** The app's reply to `request`, waited for `within` ms. */
    const call = async (request: object, within = ANSWER_MS) => {
      link.write(JSON.stringify({ id: ++last, ...request }) + '\n');
      const reply = await next(within);
      if (reply.error) throw new Error(reply.error);
      return reply;
    };
    const agent = (await call({ op: 'eval', body: 'return navigator.userAgent;' })).value;
    return { version: `Tauri ${tauri}, ${agent}`, runtime, endpoint, call, close: async () => { link.destroy(); await stopAll(); } };
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
  for (const type of ['mousedown', 'mouseup', 'keydown', 'keyup', 'wheel'])
    document.addEventListener(type, (e) => { if (e.isTrusted) window.__TAURI_INTERNALS__.invoke('probe_heard', { kind: type }); }, { capture: true, passive: true });
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

<a name="chunk-test-input-claims"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-input-claims` · assembles [test-told-claims](#chunk-test-told-claims)</sub>

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
    test('a driver that names itself is labelled with that name over the page, and one that does not with its requester', async (t) => {
      /** A pointer at (20, 150) CSS pixels, where the probe page draws nothing,
       * its label to its right; how far right of the pointer the label's ink
       * runs, in CSS pixels, in a capture that carries the drawing. */
      const labelRun = async (requester_name?: string) => {
        const to = { frame: page.frame.frame, x: 20 * page.scaleFactor, y: 150 * page.scaleFactor };
        const answer = await page.app.call({ op: 'input', frame: page.frame, scale: page.widgetScale, perform: { requester_name, sources: [{ id: 'mouse', kind: 'mouse', steps: [{ do: 'move', to }] }] } });
        assert.equal(answer.refused, undefined, JSON.stringify(answer));
        const drawn = image((await page.app.call({ op: 'drawn', frame_only: false })).capture);
        const [row, from] = [Math.round(171 * page.scaleFactor), Math.round(36 * page.scaleFactor)];
        let last = from;
        for (let x = from; x < drawn.width; x++) {
          const [r, g, b] = drawn.rgb(x, row);
          if (r === DRAWN_INK[0] && g === DRAWN_INK[1] && b === DRAWN_INK[2]) last = x;
        }
        return (last - from) / page.scaleFactor;
      };
      const named = await labelRun('a driver that names itself');
      const unnamed = await labelRun(undefined);
      t.diagnostic(`label ink runs ${named.toFixed(0)} CSS pixels named, ${unnamed.toFixed(0)} unnamed ('probe')`);
      assert.ok(unnamed > 10, `the unnamed label runs ${unnamed} CSS pixels`);
      assert.ok(named > unnamed + 80, `the named label runs ${named} CSS pixels, the unnamed ${unnamed}`);
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

    <<test-told-claims>>
  });
}
```

The provenance claims run in the same window (above, "Telling the host what
it delivers"). A click into the field and two keys typed there are told to
the host one event each, in order, on the main thread, for the webview and
the requester they went to, the click at its position in the page's logical
points. Every request the page's trusted handlers sent the host found the
host already told of the event that triggered it: the `n`th request found at
least `n + 1` events told, since the first handler, `mousedown`, follows a
move and a press. `last_delivered` then answers the instant of the last
event told.

On Linux the app-level hooks are counted over the same input: the GDK event
handler is called with none of it, and with the Shift key the `real` request
puts on GDK's queue. On macOS the local monitor is counted the same
way. Over a click, typing into the field and a key the page does not handle
(an `x` pressed while the button has focus), no pointer event the plugin
made reaches the monitor, every event of the plugin's it does see is a key
down WebKit handed back, and it does see a mouse move sent through
`NSApplication`'s `sendEvent:`. The test reports how many key downs came
back, which is the question the Mac decides.

<a name="chunk-test-told-claims"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-told-claims`</sub>

```typescript {#test-told-claims}
const told = async () => page.app.call({ op: 'told' });
const typing = (text: string) => ({ id: 'keys', kind: 'key', steps: [...text].flatMap((key) => [{ do: 'key_down', key }, { do: 'key_up', key }]) });

test('every event the plugin delivers is told to the host first, on the main thread, so a page handler\'s request finds it told', async () => {
  const at = await centre('probe-field');
  await told();
  await perform([click(at)]);
  await perform([typing('ok')]);
  await sleep(300);
  const { told: events, heard, lastIsLastTold } = await told();
  await seen();
  assert.deepEqual(events.map((e: any) => e.kind), ['move', 'press', 'release', 'key_down', 'key_up', 'key_down', 'key_up'], JSON.stringify(events));
  assert.ok(events.every((e: any) => e.main && e.webview === 'probe' && e.requester === 'probe'), JSON.stringify(events));
  assert.deepEqual([events[0].x, events[0].y].map(Math.round), [Math.round(at.x / page.widgetScale), Math.round(at.y / page.widgetScale)], JSON.stringify(events[0]));
  assert.deepEqual(events.filter((e: any) => e.key).map((e: any) => e.key), ['o', 'o', 'k', 'k']);
  assert.deepEqual(heard.map((h: any) => h.kind).sort(), ['keydown', 'keydown', 'keyup', 'keyup', 'mousedown', 'mouseup'], JSON.stringify(heard));
  assert.ok(heard.every((h: any, n: number) => h.told >= n + 2 && h.last), JSON.stringify(heard));
  assert.ok(lastIsLastTold, 'last_delivered answers the instant of the last event told');
});

if (!MAC) test('an app-level GDK event handler is called with none of the plugin\'s events, and with an event on GDK\'s queue', async (t) => {
  await told();
  await perform([click(await centre('probe-field'))]);
  await perform([typing('a')]);
  await sleep(300);
  const { hooks } = await told();
  await seen();
  const by = (hooks: any[], hook: string) => hooks.filter((h) => h.hook === hook).map((h) => h.kind);
  t.diagnostic(`gdk event handler ${JSON.stringify(by(hooks, 'gdk event handler'))}, key snooper ${JSON.stringify(by(hooks, 'key snooper'))}, toplevel event ${JSON.stringify(by(hooks, 'toplevel event'))}`);
  assert.deepEqual(by(hooks, 'gdk event handler'), [], JSON.stringify(hooks));
  const real = await page.app.call({ op: 'real' });
  const queued = (await told()).hooks.filter((h: any) => h.hook === 'gdk event handler');
  assert.deepEqual(queued.map((h: any) => [h.kind, h.time]), [['KeyPress', real.time], ['KeyRelease', real.time]], JSON.stringify(queued));
});

if (MAC) test('an AppKit local event monitor sees none of the plugin\'s pointer events, only key downs WebKit hands back, and an event sent through NSApplication', async (t) => {
  await told();
  await perform([click(await centre('probe-field'))]);
  await perform([typing('ok')]);
  await perform([click(await centre('probe-button'))]);
  await perform([typing('x')]);
  await sleep(300);
  const { told: events, hooks } = await told();
  await seen();
  const times = new Set(events.map((e: any) => e.time));
  const monitored = hooks.filter((h: any) => h.hook === 'local monitor');
  const ours = monitored.filter((h: any) => times.has(h.time));
  t.diagnostic(`the monitor saw ${monitored.length} events, ${ours.length} of them the plugin's: ${JSON.stringify(ours.map((h: any) => h.kind))}`);
  assert.ok(ours.every((h: any) => h.kind === 'KeyDown'), JSON.stringify(ours));
  const real = await page.app.call({ op: 'real' });
  const sent = (await told()).hooks.filter((h: any) => h.hook === 'local monitor' && h.time === real.time);
  assert.deepEqual(sent.map((h: any) => h.kind), ['MouseMoved'], JSON.stringify(sent));
});
```

The endpoint test runs the conformance suite, the `ui-conformance` program,
against the probe app's endpoint socket, as any driver reaches it. The app shows
the library's answer page (`x0k:implementation/ui-control/page-answer`), which
declares a counter and its actions, and the suite runs the caller's
`counter.bump` beside the ones it draws from the offer. The plugin offers
`ui/screencast` for every page, so the suite's screencast claims, which play
no screencast, are asked to hold by name too: the offer's clocks, `mark:
false` refused outside a dev instance, a cast naming `sampled` refused as
`unoffered_clock`, and
frames of a handle never cast refused as `unknown_screencast`. Before the suite runs,
the test wraps the library's entry so the page records each call it hears.
After it, every action the page heard must be one its offer lists, and it must
have heard at least one, so the claim cannot hold by the page hearing nothing.
The suite itself invokes an action the offer does not list, so a plugin whose
calls reached the page before the endpoint's checks would show it here.

The answer page takes state fixtures, so the suite holds the plugin to
`ui-interfaces` §4 over the endpoint, and the test asks that the fixture
claims hold by name rather than go unreachable: a fixture is shown in the
frame `present` names and an observation names it, the caller's
`counter.bump` is simulated under it, releasing shows the live state, the live
head is where it was after a present and a release, a session's end
releases the fixture it presented, `mark: false` is refused as
`mark_required`, and the fixture mark's ink is in a capture with the host's
drawing and not in the frame alone.

<a name="chunk-test-endpoint"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-endpoint`</sub>

```typescript {#test-endpoint}
/** The caller's action the suite runs, beside the ones it draws from the offer. */
const ACT = ['counter.bump', '{"by":1}'];
/** The suite's screencast claims, which play no screencast. */
const SCREENCAST_CLAIMS = ['the offer says how the app keeps time for a screencast exactly when it names ui/screencast, and never offers sampled',
  'a present asking mark: false of an instance that is not a dev instance is refused as mark_required',
  'a cast naming the sampled clock is refused as unoffered_clock before anything plays',
  'frames for a handle the endpoint never cast is refused as unknown_screencast'];
/** Claims of the suite's report the plugin must hold, beside its verdict. */
const ENDPOINT_CLAIMS = ['an action the offer does not list is refused', 'counter.bump runs and names the frame after it',
  'a pointer move to a layout node runs and names the frame after it', 'a click at the watchable pace answers no sooner than its floor',
  'presenting a fixture shows it and names its frame', 'an observation names the fixture it shows',
  'an action above read_only takes the disposition the replay policy gives it, and a non_idempotent one is never performed',
  'releasing a fixture shows the live state', 'a fixture never changes the live state: presenting and releasing leaves its head where it was',
  'a session\'s end releases the fixture it presented',
  'a present asking mark: false of an instance that is not a dev instance is refused as mark_required',
  'while a fixture stands, a capture with the host\'s drawing shows the fixture mark, and the frame alone does not', ...SCREENCAST_CLAIMS];
/** What wraps the library's run, so the page records each action it runs. */
const HEARING = `const run = globalThis.__x0kUi.run;
  window.heard = [];
  globalThis.__x0kUi.run = (name, args) => { heard.push(name); return run(name, args); };
  return 'ok';`;

/** The suite's report on the endpoint at `socket`, and whether every claim
 * held, within `timeout` ms when one is given, the runner's `options` before
 * the target. */
function conformance(socket: string, act: string[], timeout = 0, options: string[] = []): Promise<{ held: boolean; report: string }> {
  return new Promise((done, fail) => execFile(UI_CONFORMANCE, [...options, socket, ...act], { maxBuffer: 1 << 24, timeout }, (e, stdout, stderr) => {
    if (e && e.code !== 1) fail(new Error(`${UI_CONFORMANCE} could not judge the app${e.killed ? ` within ${timeout} ms` : ''}: ${stderr || e.message}`));
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
    for (const claim of ENDPOINT_CLAIMS) assert.match(run.report, new RegExp(`holds +(ui-\\S+ )?§\\S+ ${claim}`), run.report);
    t.diagnostic(run.report.split('\n').filter((line) => SCREENCAST_CLAIMS.some((claim) => line.includes(claim))).join('\n'));
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

The same page in a window the app has hidden, and a page that declines. The
app hides its window as a person minimising it would, so the window does not
present, and the suite then reaches its `cannot_paint` claims, which the
claims above leave unreachable because that window paints. Each call a driver
makes to the hidden window is timed against the plugin's 5 s wait for the
page, so a host that waits on a frame that never comes reads as `did not answer
within 5000 ms`, and each must answer within the suite's second. A touch
source is refused as one the host cannot deliver, naming its kind, and the
page hears nothing. A `present` the page declines, while an approval waits,
is refused as `declined` with the page's reason, which the suite reads as the
fixture claims being unreachable for now, never broken.

<a name="chunk-test-hidden"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-hidden`</sub>

```typescript {#test-hidden}
/** How long the plugin waits for the page's answer. */
const UNANSWERED_MS = 5000;
/** How soon a host that cannot paint refuses a call: the suite's `CANNOT_PAINT_WITHIN`. */
const REFUSED_WITHIN_MS = 1000;
/** The suite's claims of a host that cannot paint its window. */
const CANNOT_PAINT_CLAIMS = ['§8 while the host cannot paint the window, an observation refuses only the capture, as cannot_paint',
  '§9 while the host cannot paint the window, an action is refused as cannot_paint within a second',
  '§10 while the host cannot paint the window, input is refused as cannot_paint within a second'];
/** Why the answer page ends a fixture itself. */
const ARRIVED = 'an approval arrived for a person';
/** The suite's claims of an app that ends its fixture itself. */
const FIXTURE_ENDED_CLAIMS = ['the call after the app ended its fixture is refused as fixture_ended, naming the fixture',
  'an app that ends a fixture itself shows its live state',
  'releasing a fixture the app ended answers that it ended, with the app\'s reason'];
/** What has the answer page end its fixture, as an approval arriving would,
 * once an observation has shown the fixture, while `window.endsObserved` is set. */
const ENDING = `const observation = globalThis.__x0kUi.observation;
  globalThis.__x0kUi.observation = (held, call) => {
    const seen = observation(held, call);
    if (window.endsObserved && seen.shown?.kind === 'fixture') { window.endsObserved = false; window.approvalArrives(${JSON.stringify(ARRIVED)}); }
    return seen;
  };
  window.endsObserved = true;
  return 'ok';`;

describe('the answer page in a Tauri app whose window is hidden, or that declines, over its endpoint', () => {
  let app: Awaited<ReturnType<typeof probeApp>>;
  before(async () => {
    if (!existsSync(UI_CONFORMANCE)) throw new Error(`${UI_CONFORMANCE} is not built: cargo build -p x0k-ui-endpoint --bin ui-conformance`);
    app = await probeApp(false, 1, 'answer-page.html');
    await app.call({ op: 'eval', body: HEARING });
    for (let waited = 0; !existsSync(app.endpoint) && waited < ANSWER_MS; waited += 50) await sleep(50);
  });
  after(async () => { await app?.close(); });
  /** One call to the app's endpoint as a driver makes it, timed, or a failure once the plugin's wait has run out. */
  const driven = async (call: string, argument: object) => {
    const answered = await app.call({ op: 'endpoint', call, argument });
    if (answered.fault) throw new Error(answered.fault);
    if (answered.ms >= UNANSWERED_MS) throw new Error(`did not answer within ${UNANSWERED_MS} ms: ${JSON.stringify(answered.answer)}`);
    return answered as { answer: any; ms: number };
  };
  const heard = async (): Promise<string[]> => JSON.parse((await app.call({ op: 'eval', body: 'return JSON.stringify(heard);' })).value);

  test('a touch source is refused as undeliverable_source, naming its kind, and nothing reaches the page', async () => {
    const touch = { sources: [{ id: 'finger', kind: 'touch', steps: [{ do: 'pause', ms: 1 }] }] };
    const { answer } = await driven('perform', touch);
    assert.deepEqual([answer.refused?.code, answer.refused?.subject], ['undeliverable_source', 'touch'], JSON.stringify(answer));
  });
  test('a present the page declines is refused as declined with its reason, and the suite reads its fixture claims as unreachable for now', async () => {
    await app.call({ op: 'eval', body: 'window.approvalWaiting = true; return "ok";' });
    const run = await conformance(app.endpoint, ACT);
    await app.call({ op: 'eval', body: 'window.approvalWaiting = false; return "ok";' });
    assert.ok(run.held, run.report);
    assert.match(run.report, /unreachable ui-interfaces §4 presenting a fixture shows it and names its frame: the app declines for now: an approval waits for a person/, run.report);
  });
  test('a fixture the page ends itself is told to the driver with its reason, and the suite reaches its fixture_ended claims', async (t) => {
    await app.call({ op: 'eval', body: ENDING });
    const run = await conformance(app.endpoint, ACT);
    t.diagnostic(run.report.trim());
    assert.ok(run.held, run.report);
    for (const claim of FIXTURE_ENDED_CLAIMS) assert.match(run.report, new RegExp(`holds +ui-interfaces §4 ${claim}`), run.report);
    assert.match(run.report, new RegExp(`unreachable ui-interfaces §4 replacing and releasing a fixture: the app ended the fixture: ${ARRIVED}`), run.report);
  });
  test('while its window is hidden, an observation refuses its capture as cannot_paint at once, and keeps its layout and state', async () => {
    await app.call({ op: 'hide' });
    const { answer, ms } = await driven('observe', { parts: ['capture', 'layout', 'state'] });
    assert.deepEqual(answer.refused.map((r: any) => [r.part, r.code]), [['capture', 'cannot_paint']], JSON.stringify(answer.refused));
    assert.ok(answer.layout && answer.state, JSON.stringify(answer));
    assert.ok(ms < REFUSED_WITHIN_MS, `answered in ${ms.toFixed(0)} ms`);
  });
  test('while its window is hidden, an action and input are refused as cannot_paint at once, and the page runs neither', async () => {
    const before = (await heard()).length;
    const acted = await driven('invoke', { action: 'counter.bump', args: { by: 1 } });
    assert.deepEqual([acted.answer.refused?.code, acted.answer.refused?.subject], ['cannot_paint', 'counter.bump'], JSON.stringify(acted.answer));
    assert.ok(acted.ms < REFUSED_WITHIN_MS, `the action was answered in ${acted.ms.toFixed(0)} ms`);
    assert.equal((await heard()).length, before, 'the page ran the action');
    const input = await driven('perform', { sources: [{ id: 'pointer', kind: 'mouse', steps: [{ do: 'pause', ms: 1 }] }] });
    assert.deepEqual([input.answer.refused?.code, input.answer.refused?.subject], ['cannot_paint', 'ui/input'], JSON.stringify(input.answer));
    assert.ok(input.ms < REFUSED_WITHIN_MS, `the input was answered in ${input.ms.toFixed(0)} ms`);
  });
  test('while its window is hidden, the suite reaches its cannot_paint claims, and they hold', async (t) => {
    const run = await conformance(app.endpoint, ACT, 120_000);
    t.diagnostic(run.report.trim());
    assert.ok(run.held, run.report);
    for (const claim of CANNOT_PAINT_CLAIMS) assert.match(run.report, new RegExp(`holds +${claim}`), run.report);
  });
  test('shown again, the window paints, and an observation answers its capture', async () => {
    await app.call({ op: 'show' });
    await sleep(300);
    const { answer } = await driven('observe', { parts: ['capture', 'layout'] });
    assert.ok(answer.capture && answer.refused.length === 0, JSON.stringify(answer.refused));
  });
});
```

A host that declines or holds a driver's input is held over the endpoint, as
a driver meets it (above, "Declining a driver's input for now"). Each
sequence is a Shift key held 250 ms: a down, a pause, an up. A sequence the
host declines is refused as `declined`, naming `ui/input`, with the host's
reason, and none of it is told or delivered. One the host holds runs once
the host lets it go, no sooner, and whole: its two events are told, and the
pause between them is its own 250 ms. One the host holds past its wait is
refused as `declined` with the reason, no sooner than the wait, and none of
it is told.

<a name="chunk-test-turn"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-turn`</sub>

```typescript {#test-turn}
describe('a Tauri app whose host declines or holds a driver\'s input, over its endpoint', () => {
  let app: Awaited<ReturnType<typeof probeApp>>;
  before(async () => {
    app = await probeApp(false, 1, 'answer-page.html');
    for (let waited = 0; !existsSync(app.endpoint) && waited < ANSWER_MS; waited += 50) await sleep(50);
  });
  after(async () => { await app?.close(); });
  /** A Shift key held for 250 ms. */
  const HELD_MS = 250;
  const shift = { sources: [{ id: 'keys', kind: 'key', steps: [{ do: 'key_down', key: 'Shift' }, { do: 'pause', ms: HELD_MS }, { do: 'key_up', key: 'Shift' }] }] };
  const driven = async (turn: object) => {
    await app.call({ op: 'turn', ...turn });
    await app.call({ op: 'told' });
    const answered = await app.call({ op: 'endpoint', call: 'perform', argument: shift });
    const { told } = await app.call({ op: 'told' });
    await app.call({ op: 'turn', turn: 'run' });
    if (answered.fault) throw new Error(answered.fault);
    return { answer: answered.answer, ms: answered.ms as number, told };
  };

  test('a sequence the host declines is refused as declined with its reason, and none of it is delivered', async () => {
    const why = 'the person is using the window';
    const { answer, told } = await driven({ turn: 'decline', why });
    assert.deepEqual([answer.refused?.code, answer.refused?.subject, answer.refused?.why], ['declined', 'ui/input', why], JSON.stringify(answer));
    assert.deepEqual(told, []);
  });
  test('a sequence the host holds runs once the host lets it go, whole and with its own pause', async (t) => {
    const { answer, ms, told } = await driven({ turn: 'wait', within_ms: 5000, why: 'held too long', resume_after_ms: 400 });
    t.diagnostic(`answered in ${ms.toFixed(0)} ms; told ${JSON.stringify(told.map((e: any) => [e.kind, e.key, e.time]))}`);
    assert.ok(answer.done, JSON.stringify(answer));
    assert.ok(ms >= 400 + HELD_MS, `answered in ${ms.toFixed(0)} ms`);
    assert.deepEqual(told.map((e: any) => [e.kind, e.key]), [['key_down', 'Shift'], ['key_up', 'Shift']], JSON.stringify(told));
    assert.ok(told[1].time - told[0].time >= HELD_MS, `the pause held ${told[1].time - told[0].time} ms`);
  });
  test('a sequence the host holds past its wait is refused as declined with its reason, and none of it is delivered', async () => {
    const why = 'the person kept typing';
    const { answer, ms, told } = await driven({ turn: 'wait', within_ms: 300, why });
    assert.deepEqual([answer.refused?.code, answer.refused?.subject, answer.refused?.why], ['declined', 'ui/input', why], JSON.stringify(answer));
    assert.ok(ms >= 300, `refused in ${ms.toFixed(0)} ms`);
    assert.deepEqual(told, []);
  });
});
```

An app that gives the plugin its endpoint's path, `ui_plugin_at`, is served
there and nowhere else. The probe app gives it a path in its runtime directory
but outside `ui-control/`, and its environment pins that directory as
`X0K_RUNTIME_DIR`, so a plugin that also resolved the default path would make
`ui-control/` beside it.

<a name="chunk-test-endpoint-at"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-endpoint-at`</sub>

```typescript {#test-endpoint-at}
describe('a Tauri app that gives the plugin its endpoint\'s path', () => {
  let app: Awaited<ReturnType<typeof probeApp>>;
  before(async () => {
    app = await probeApp(false, 1, 'answer-page.html', true);
    for (let waited = 0; !existsSync(app.endpoint) && waited < ANSWER_MS; waited += 50) await sleep(50);
  });
  after(async () => { await app?.close(); });

  test('the plugin serves the endpoint at the path it is given, and binds nothing where the profile would put it', async () => {
    assert.ok(existsSync(app.endpoint), `nothing at ${app.endpoint}`);
    const answered = await app.call({ op: 'endpoint', call: 'observe', argument: { parts: ['state'] } });
    assert.equal(answered.fault, undefined, JSON.stringify(answered));
    assert.ok(answered.answer.state, JSON.stringify(answered.answer));
    assert.deepEqual(readdirSync(app.runtime).filter((name) => name !== 'test.sock'), ['given'], 'what the runtime directory holds');
  });
});
```

**A takeover, as the host's configuration answers it.** On Linux the probe
app runs the answer page with the input test's controls under each of the
three answers, set as the host's takeover table, and a driver asks for a
takeover over the endpoint: a sequence of one key source that only pauses,
so it holds the window for its pause and delivers nothing. The person's
input is made as the windowing system's is, put on GDK's queue (the
`person` request), never through the plugin.

- Under `allow`, the takeover holds with no ask and answers once its pause
  has run, well within an ask's 30 s; while it holds, a capture shows the
  band in the requester's colour at the page's edge and the frame alone
  does not; a key the person types into the field and a click on the
  button reach neither, and the same key typed after the hold reaches the
  field. The person's key before any takeover reaches the field too, so
  the person's path is shown to deliver.
- Under `allow`, the person's Escape ends the hold at once: the sequence
  still runs out its pause, but the person's next key reaches the field
  while it does, and the band is gone.
- Under `allow`, a sequence the host's `before_input` declines is refused
  as `declined` with the host's reason, and no hold stands after it.
- Under `refuse`, the takeover is refused as `takeover_not_granted`, naming
  the configuration, at once.
- Under `ask`, the ask is drawn: the test finds the Allow button by its ink
  in a capture, the person clicks it there, and the takeover is granted
  and runs. The person's Escape refuses the next ask as
  `takeover_not_granted`, and an ask no one answers is refused the same way
  no sooner than 30 s.

The conformance suite runs over the `allow` and `refuse` apps with the
runner naming that answer, and its configured-takeover claim holds.

<a name="chunk-test-takeover"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-takeover`</sub>

```typescript {#test-takeover}
/** How long the person has to answer a takeover's ask: the protocol's `TAKEOVER_ASK_MS`. */
const TAKEOVER_ASK_MS = 30_000;
/** The suite's claim of a configured takeover. */
const CONFIGURED_TAKEOVER = 'a takeover is answered as the host\'s configuration says, before any of the sequence runs';

/** A sequence that takes over the window for `ms` and delivers nothing. */
const holding = (ms: number) => ({ takeover: true, sources: [{ id: 'keys', kind: 'key', steps: [{ do: 'pause', ms }] }] });
const inkAt = (capture: Image, x: number, y: number) => {
  const [r, g, b] = capture.rgb(Math.round(x), Math.round(y));
  return r === DRAWN_INK[0] && g === DRAWN_INK[1] && b === DRAWN_INK[2];
};

/** The answer page with the input test's controls, its host configured by
 * `takeover`, and how many of the webview's units a CSS pixel is. */
async function takeoverApp(takeover?: object) {
  const app = await probeApp(false, 1, 'answer-page.html', false, takeover);
  await app.call({ op: 'eval', body: CONTROLS });
  for (let waited = 0; !existsSync(app.endpoint) && waited < ANSWER_MS; waited += 50) await sleep(50);
  const snap = await app.call({ op: 'snap' });
  const css = Number((await app.call({ op: 'eval', body: 'return String(window.innerWidth);' })).value);
  const evaluate = async (body: string) => JSON.parse((await app.call({ op: 'eval', body })).value);
  const drawn = async (frame_only: boolean) => image((await app.call({ op: 'drawn', frame_only })).capture);
  /** A driver's call to the endpoint, answered, or started when `detach`. */
  const driven = async (call: string, argument: object, detach = false) => app.call({ op: 'endpoint', call, argument, detach });
  return { app, units: snap.width / snap.scale / css, captureScale: snap.width / css, evaluate, drawn, driven };
}

if (!MAC) describe('a Tauri app whose host allows a takeover, over its endpoint', () => {
  let t0: Awaited<ReturnType<typeof takeoverApp>>;
  before(async () => { t0 = await takeoverApp({ default: 'allow' }); });
  after(async () => { await t0?.app.close(); });
  const field = async () => (await t0.evaluate(`return JSON.stringify(document.getElementById('probe-field').value);`)) as string;
  const clicks = async () => (await t0.evaluate('return JSON.stringify(inputSeen.splice(0));')).filter((e: any) => e.type === 'click');
  const focused = async () => t0.evaluate(`const f = document.getElementById('probe-field'); f.value = ''; f.focus(); return JSON.stringify(document.activeElement.id);`);
  /** The probe button's centre, in the webview's units. */
  const button = async () => {
    const box = await t0.evaluate(`const r = document.getElementById('probe-button').getBoundingClientRect(); return JSON.stringify([r.left + r.width / 2, r.top + r.height / 2]);`);
    return [box[0] * t0.units, box[1] * t0.units];
  };
  /** Whether a capture shows the hold's band at the page's left edge. */
  const band = (capture: Image) => inkAt(capture, 2 * t0.captureScale, 150 * t0.captureScale);

  test('under allow, a takeover holds with no ask, its notice is drawn, and the person\'s input waits until it ends', async (t) => {
    assert.equal(await focused(), 'probe-field');
    await t0.app.call({ op: 'person', key: 'p' });
    assert.equal(await field(), 'p', 'the person\'s key before any takeover');
    await clicks();
    const { detached } = await t0.driven('perform', holding(1500), true);
    await sleep(400);
    const [shown, alone] = [await t0.drawn(false), await t0.drawn(true)];
    await t0.app.call({ op: 'person', key: 'q' });
    await t0.app.call({ op: 'person', click: await button() });
    const during = { field: await field(), clicks: await clicks() };
    const joined = await t0.app.call({ op: 'join', detached });
    await t0.app.call({ op: 'person', key: 'r' });
    t.diagnostic(`answered in ${joined.ms?.toFixed(0)} ms; during the hold the field read ${JSON.stringify(during.field)}, ${during.clicks.length} clicks`);
    assert.ok(joined.answer?.done, JSON.stringify(joined));
    assert.ok(joined.ms >= 1500 && joined.ms < TAKEOVER_ASK_MS, `answered in ${joined.ms} ms`);
    assert.ok(band(shown), 'a capture during the hold shows no band');
    assert.ok(!band(alone), 'the frame alone shows the band');
    assert.deepEqual(during, { field: 'p', clicks: [] }, 'the person\'s input reached the page during the hold');
    assert.equal(await field(), 'pr', 'the person\'s key after the hold');
  });
  test('under allow, the person\'s Escape ends the hold at once', async () => {
    await focused();
    const { detached } = await t0.driven('perform', holding(2500), true);
    await sleep(400);
    assert.ok(band(await t0.drawn(false)), 'no hold to end');
    await t0.app.call({ op: 'person', key: 'Escape' });
    await t0.app.call({ op: 'person', key: 's' });
    const after = { field: await field(), band: band(await t0.drawn(false)) };
    const joined = await t0.app.call({ op: 'join', detached });
    assert.ok(joined.answer?.done && joined.ms >= 2500, JSON.stringify(joined));
    assert.deepEqual(after, { field: 's', band: false }, 'the hold stood after the person\'s Escape');
  });
  test('under allow, a sequence the host declines is refused as declined, and no hold stands', async () => {
    await focused();
    const why = 'the person is using the window';
    await t0.app.call({ op: 'turn', turn: 'decline', why });
    const declined = await t0.driven('perform', holding(100));
    await t0.app.call({ op: 'turn', turn: 'run' });
    await t0.app.call({ op: 'person', key: 'd' });
    const refused = declined.answer?.refused;
    assert.deepEqual([refused?.code, refused?.subject, refused?.why], ['declined', 'ui/input', why], JSON.stringify(declined));
    assert.equal(await field(), 'd', 'a hold stood after a declined takeover');
  });
  test('under allow, the suite\'s configured-takeover claim holds', async (t) => {
    const run = await conformance(t0.app.endpoint, ACT, 120_000, ['--takeover', 'allow']);
    const line = run.report.split('\n').find((l) => l.includes(CONFIGURED_TAKEOVER));
    t.diagnostic(`${line}; ${run.report.trim().split('\n').at(-1)}`);
    assert.ok(run.held, run.report);
    assert.match(line ?? '', /^ *holds +§10 /, run.report);
  });
});

if (!MAC) describe('a Tauri app whose host refuses a takeover, over its endpoint', () => {
  let t0: Awaited<ReturnType<typeof takeoverApp>>;
  before(async () => { t0 = await takeoverApp({ default: 'refuse' }); });
  after(async () => { await t0?.app.close(); });

  test('under refuse, a takeover is refused as takeover_not_granted, naming the configuration, at once', async () => {
    const answered = await t0.driven('perform', holding(100));
    const refused = answered.answer?.refused;
    assert.equal(refused?.code, 'takeover_not_granted', JSON.stringify(answered));
    assert.match(refused?.why ?? '', /configuration refuses/, JSON.stringify(answered));
    assert.ok(answered.ms < 1000, `refused in ${answered.ms} ms`);
  });
  test('under refuse, the suite\'s configured-takeover claim holds', async (t) => {
    const run = await conformance(t0.app.endpoint, ACT, 120_000, ['--takeover', 'refuse']);
    const line = run.report.split('\n').find((l) => l.includes(CONFIGURED_TAKEOVER));
    t.diagnostic(`${line}; ${run.report.trim().split('\n').at(-1)}`);
    assert.ok(run.held, run.report);
    assert.match(line ?? '', /^ *holds +§10 /, run.report);
  });
});

if (!MAC) describe('a Tauri app whose host asks the person for a takeover, over its endpoint', () => {
  let t0: Awaited<ReturnType<typeof takeoverApp>>;
  before(async () => { t0 = await takeoverApp(); });
  after(async () => { await t0?.app.close(); });
  /** The Allow button's centre in the webview's units, found by its ink in
   * a capture: the rows where the ink runs between 60 and 150 capture
   * pixels, which the card's border, wider, and its sides, narrower, are not. */
  const allowButton = (capture: Image) => {
    const rows: [number, number, number][] = [];
    for (let y = 0; y < capture.height; y++) {
      let run = 0;
      for (let x = 0; x <= capture.width; x++) {
        if (x < capture.width && inkAt(capture, x, y)) { run++; continue; }
        if (run >= 60 * t0.captureScale / t0.units && run <= 150 * t0.captureScale / t0.units) rows.push([y, x - run, x]);
        run = 0;
      }
    }
    if (!rows.length) return undefined;
    const [top, bottom] = [rows[0][0], rows[rows.length - 1][0]];
    const scale = t0.captureScale / t0.units;
    return [(rows[0][1] + rows[0][2]) / 2 / scale, (top + bottom) / 2 / scale];
  };

  test('under ask, the ask is drawn, and the person\'s click on Allow grants the takeover', async (t) => {
    const { detached } = await t0.driven('perform', holding(300), true);
    await sleep(500);
    const at = allowButton(await t0.drawn(false));
    t.diagnostic(`Allow found at ${JSON.stringify(at)} in the webview's units`);
    assert.ok(at, 'no Allow button drawn');
    await t0.app.call({ op: 'person', click: at });
    const joined = await t0.app.call({ op: 'join', detached });
    assert.ok(joined.answer?.done, JSON.stringify(joined));
    assert.ok(joined.ms < TAKEOVER_ASK_MS, `granted in ${joined.ms} ms`);
  });
  test('under ask, the person\'s Escape refuses the takeover as takeover_not_granted', async () => {
    const { detached } = await t0.driven('perform', holding(300), true);
    await sleep(500);
    await t0.app.call({ op: 'person', key: 'Escape' });
    const joined = await t0.app.call({ op: 'join', detached });
    assert.equal(joined.answer?.refused?.code, 'takeover_not_granted', JSON.stringify(joined));
    assert.match(joined.answer.refused.why, /did not grant/, JSON.stringify(joined));
    assert.ok(joined.ms < TAKEOVER_ASK_MS, `refused in ${joined.ms} ms`);
  });
  test('under ask, an ask no one answers is refused as takeover_not_granted after 30 s', async () => {
    const { detached } = await t0.driven('perform', holding(100), true);
    // The probe app answers each request within ANSWER_MS, which an ask's wait reaches.
    await sleep(TAKEOVER_ASK_MS - 2000);
    const joined = await t0.app.call({ op: 'join', detached });
    assert.equal(joined.answer?.refused?.code, 'takeover_not_granted', JSON.stringify(joined));
    assert.ok(joined.ms >= TAKEOVER_ASK_MS, `refused in ${joined.ms} ms`);
  });
});
```

The stepped screencast test casts the library's clock page
(`x0k:implementation/ui-control/page-clock`, "The clock page") through the
probe app's endpoint, as a driver does, under a host whose configuration
allows the hold. The page takes no fixture of its own, so the test gives it
one before it casts: a fixture's `going` starts the stage, as the page's
`go()` does, the first time a fixture sets it, and its `ink` paints a patch
at the top right blue. A run that presents `going` at 0 ms then starts the
same motion at screencast time 0 in every cast. The fixture's state reads
the page's `Date.now()` too, so each frame's state says the date the page's
clock read when it drew. Its claims:

1. **Rerun.** Two casts of one run at 30 fps for a second give the same trace
   hash, and every row the same capture.
2. **The date.** Two casts of that run from one named date give one trace
   hash, and the page reads the date at frame 0 and the date plus a second at
   frame 30; a cast that names none reads the Unix epoch at frame 0, so its
   trace differs from theirs.
3. **Rate.** Frame *n* at 30 fps is the same capture as frame 2*n* at 60 fps.
4. **The frame a step shows in.** A `present` at 100 ms that paints the ink
   first shows in frame ⌈100 × fps / 1000⌉, at 25 fps, where that is frame 3
   and frame 2 is at 80 ms, and at 60 fps, where it is frame 6: the frame
   before shows no ink, and the frame names the new fixture.
5. **The end.** After a cast the page's clock steps no more, and the page's
   animation frames run on the wall again.
6. **Refused by the configuration.** Under a host whose configuration refuses
   a stepped screencast's hold and allows a takeover, a cast is refused as
   `takeover_not_granted` at once, naming the configuration, the page's clock
   never begins, and a sequence's takeover still holds.

The casts are made once, before the claims read them.

<a name="chunk-test-cast"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-cast`</sub>

```typescript {#test-cast}
/** What makes the clock page take state fixtures: `going` starts its stage,
 * as `go()` does, the first time a fixture sets it, and `ink` paints the ink
 * patch blue. */
const STAGE = `const live = { going: 0, ink: 0 };
  let store = live;
  const ink = document.createElement('div');
  ink.style.cssText = 'position: absolute; left: 330px; top: 0; width: 40px; height: 40px; background: rgb(255, 255, 255)';
  document.body.append(ink);
  const show = (next) => {
    const was = store.going;
    store = next;
    ink.style.background = store.ink ? 'rgb(0, 0, 255)' : 'rgb(255, 255, 255)';
    if (store.going && !was) window.go();
  };
  const int = { shape: { kind: 'int' } };
  globalThis.__x0kUi.install({ app: 'clock page', state: {
    shape: { kind: 'struct', fields: { going: int, ink: int, date: int } },
    read: () => ({ going: store.going, ink: store.ink, date: Date.now() }),
    head: () => 'r0',
    present: (state) => show({ going: state.going, ink: state.ink }),
    release: () => show(live),
  } });
  return 'ok';`;
/** Where the ink patch is, in CSS pixels. */
const INK = [350, 20];
/** How long the probe waits for a cast's answer. */
const CAST_MS = 600_000;
/** The date the dated casts name: 2026-11-12T00:00:00Z. */
const CAST_DATE = 1_794_441_600_000;
/** Whether the page's stepped clock steps. */
const STEPPING = 'return String(globalThis.__x0kUiHold.steppedClock.time() !== null);';

/** The clock page in the probe app, configured by `takeover`, taking fixtures. */
async function clockApp(takeover: object) {
  const app = await probeApp(false, 1, 'clock-page.html', false, takeover);
  await app.call({ op: 'eval', body: STAGE });
  for (let waited = 0; !existsSync(app.endpoint) && waited < ANSWER_MS; waited += 50) await sleep(50);
  const observed = await app.call({ op: 'endpoint', call: 'observe', argument: { parts: ['state'] } });
  const fingerprint = observed.answer.state.fingerprint;
  const present = (at_ms: number, state: object) => ({ at_ms, step: { do: 'present', present: { fixture: { kind: 'state', state: { date: 0, ...state } }, fingerprint } } });
  /** A cast of `run` at `fps` for `max_ms` from `date`, and the frames `indices` of it with their captures. */
  const cast = async (run: object[], fps: number, max_ms: number, indices: number[] = [], date?: number) => {
    const argument = { run, fps, max_ms, settle_ms: max_ms, clock: 'stepped', parts: ['capture', 'state'], presented: false, ...(date === undefined ? {} : { date }) };
    const frames = indices.length ? { indices, parts: ['capture', 'state'] } : undefined;
    return app.call({ op: 'endpoint', call: 'cast', argument, ...(frames ? { frames } : {}) }, CAST_MS);
  };
  return { app, present, cast };
}

/** The screencast a cast answered, or a failure naming what it answered instead. */
const screencast = (answered: any) => {
  if (!answered.answer?.cast) throw new Error(`no screencast: ${JSON.stringify(answered).slice(0, 2000)}`);
  return answered.answer.cast;
};
/** The rows at which two screencasts' captures differ. */
const rowsDiffer = (a: any[], b: any[]) => a.map((row, n) => (row.png_hash === b[n]?.png_hash ? -1 : n)).filter((n) => n >= 0);
/** Whether a frame's capture shows the ink patch blue. */
const inked = (frame: any) => {
  const capture = pngImage(Buffer.from(frame.observation.capture.png));
  const [r, g, b] = capture.rgb(INK[0], INK[1]);
  return r === 0 && g === 0 && b === 255;
};

if (!MAC) describe('the clock page in a Tauri app, cast at its stepped clock over its endpoint', () => {
  let t0: Awaited<ReturnType<typeof clockApp>>;
  let first: any, second: any, fast: any, dated: any, redated: any;
  const shownIn: Record<number, any> = {};
  before(async () => {
    t0 = await clockApp({ default: 'allow' });
    const run = [t0.present(0, { going: 1, ink: 0 })];
    first = await t0.cast(run, 30, 1000, [0]);
    second = await t0.cast(run, 30, 1000);
    dated = await t0.cast(run, 30, 1000, [0, 30], CAST_DATE);
    redated = await t0.cast(run, 30, 1000, [], CAST_DATE);
    fast = await t0.cast(run, 60, 1000);
    for (const fps of [25, 60]) {
      const at = Math.ceil((100 * fps) / 1000);
      const inking = [t0.present(0, { going: 1, ink: 0 }), t0.present(100, { going: 1, ink: 1 })];
      shownIn[fps] = { at, answered: await t0.cast(inking, fps, 200, [at - 1, at]) };
    }
  });
  after(async () => { await t0?.app.close(); });

  test('two casts of one run give the same trace hash, and the same capture in every frame', (t) => {
    const [a, b] = [screencast(first), screencast(second)];
    t.diagnostic(`${a.frame_count} frames at 30 fps in ${first.ms.toFixed(0)} and ${second.ms.toFixed(0)} ms of the wall; ended ${a.ended.kind}; same on rerun ${a.same_on_rerun} ${JSON.stringify(a.not_same)}; trace ${a.trace_hash.slice(0, 16)} and ${b.trace_hash.slice(0, 16)}`);
    assert.equal(a.clock, 'stepped');
    assert.equal(a.frame_count, 31, JSON.stringify(a.ended));
    assert.ok(a.rows.every((row: any) => row.png_hash), 'a row without its capture');
    assert.deepEqual(rowsDiffer(a.rows, b.rows), [], 'rows whose captures differ');
    assert.equal(a.trace_hash, b.trace_hash);
    const moved = a.rows.filter((row: any, n: number) => n > 0 && row.png_hash !== a.rows[n - 1].png_hash).length;
    assert.ok(moved >= a.rows.length - 2, `${moved} frames changed of ${a.rows.length}: the run did not move`);
  });
  test('two casts from one date give one trace hash, and the page reads that date at frame 0 and a second on at frame 30', (t) => {
    const [a, b, undated] = [screencast(dated), screencast(redated), screencast(first)];
    const read = (answered: any) => answered.frames.frames.frames.map((frame: any) => [frame.index, frame.observation.state.value.date]);
    t.diagnostic(`dated ${a.trace_hash.slice(0, 16)} and ${b.trace_hash.slice(0, 16)}; undated ${undated.trace_hash.slice(0, 16)}; read ${JSON.stringify(read(dated))}`);
    assert.equal(a.frame_count, 31, JSON.stringify(a.ended));
    assert.equal(a.trace_hash, b.trace_hash);
    assert.deepEqual(read(dated), [[0, CAST_DATE], [30, CAST_DATE + 1000]]);
    assert.deepEqual(read(first), [[0, 0]], 'a cast that names no date starts at the epoch');
    assert.notEqual(a.trace_hash, undated.trace_hash, 'the date is in what the frames show');
  });
  test('frame n at 30 fps is frame 2n at 60 fps', (t) => {
    const [slow, quick] = [screencast(first), screencast(fast)];
    t.diagnostic(`${quick.frame_count} frames at 60 fps in ${fast.ms.toFixed(0)} ms of the wall`);
    assert.deepEqual([slow.frame_count, quick.frame_count], [31, 61], JSON.stringify([slow.ended, quick.ended]));
    const doubled = slow.rows.map((_: any, n: number) => quick.rows[2 * n]);
    assert.deepEqual(rowsDiffer(slow.rows, doubled), [], 'frames n whose captures differ from frame 2n');
  });
  for (const fps of [25, 60]) {
    test(`a present at 100 ms first shows in frame ceil(100 × ${fps} / 1000)`, () => {
      const { at, answered } = shownIn[fps];
      const cast = screencast(answered);
      const [before, showing] = answered.frames.frames.frames;
      assert.deepEqual([before.index, showing.index], [at - 1, at]);
      assert.deepEqual([inked(before), inked(showing)], [false, true], `the ink in frames ${at - 1} and ${at}`);
      assert.notEqual(cast.rows[at].shown.handle, cast.rows[at - 1].shown.handle, 'the frame names the fixture before');
    });
  }
  test('after a cast the page\'s clock steps no more, and its animation frames run on the wall', async () => {
    assert.equal((await t0.app.call({ op: 'eval', body: STEPPING })).value, 'false');
    const ran = await t0.app.call({ op: 'eval', body: 'return String(await new Promise((done) => requestAnimationFrame(() => done(true))));' });
    assert.equal(ran.value, 'true');
  });
});

if (!MAC) describe('a Tauri app whose host refuses a stepped screencast\'s hold, over its endpoint', () => {
  let t0: Awaited<ReturnType<typeof clockApp>>;
  before(async () => { t0 = await clockApp({ default: 'allow', rules: [{ when: { hold: 'stepped_screencast' }, answer: 'refuse' }] }); });
  after(async () => { await t0?.app.close(); });

  test('a cast is refused as takeover_not_granted at once, naming the configuration, and the clock never begins', async () => {
    const answered = await t0.cast([t0.present(0, { going: 1, ink: 0 })], 30, 1000);
    const refused = answered.answer?.refused;
    assert.equal(refused?.code, 'takeover_not_granted', JSON.stringify(answered));
    assert.match(refused?.why ?? '', /configuration refuses/, JSON.stringify(answered));
    assert.ok(answered.ms < 1000, `refused in ${answered.ms} ms`);
    assert.equal((await t0.app.call({ op: 'eval', body: STEPPING })).value, 'false');
  });
  test('a sequence\'s takeover still holds under it', async () => {
    const answered = await t0.app.call({ op: 'endpoint', call: 'perform', argument: holding(100) });
    assert.ok(answered.answer?.done, JSON.stringify(answered));
  });
});
```

**The fixture mark.** On Linux the probe app shows the answer page, which
takes state fixtures, and a driver presents one over the endpoint. While it
stands, a capture with the host's drawing shows the fixture mark's band in the
protocol's `FIXTURE_INK` at the page's left edge, halfway down, and says it
carries the drawing; the frame alone shows no band. Once the session that
presented it ends, which releases it, no capture shows it. The probe app keeps
that session open a while after `present` answers, since each of its
endpoint calls is a session of its own. A `present` asking `mark: false` is refused as
`mark_required` before the page hears it, since the probe app is no dev
instance. Run as one, `X0K_UI_TAURI_PROBE_DEV_INSTANCE` set, its offer says
so and the same call is honoured: the fixture stands and no capture shows the
band.

<a name="chunk-test-fixture-mark"></a><sub>[`src/lib.rs`](../../crates/x0k-ui-tauri/src/lib.rs) · `#test-fixture-mark`</sub>

```typescript {#test-fixture-mark}
/** How long a test's fixture stands: the session that presented it stays
 * open this long. */
const FIXTURE_HELD_MS = 2400;

/** The answer page, its host a dev instance when `dev`, and what a test of the
 * fixture mark asks of it. */
async function fixtureMarkApp(dev: boolean) {
  const app = await probeApp(false, 1, 'answer-page.html', false, undefined, dev);
  for (let waited = 0; !existsSync(app.endpoint) && waited < ANSWER_MS; waited += 50) await sleep(50);
  const snap = await app.call({ op: 'snap' });
  const driven = async (call: string, argument: object) => (await app.call({ op: 'endpoint', call, argument })).answer;
  const drawn = async (frame_only: boolean) => image((await app.call({ op: 'drawn', frame_only })).capture);
  /** Whether a capture shows the fixture mark's band at the page's left
   * edge, halfway down: the band is the protocol's 6 units wide. */
  const band = (capture: Image) => {
    const [r, g, b] = capture.rgb(Math.round(3 * snap.scale), Math.round(capture.height / 2));
    return r === FIXTURE_INK[0] && g === FIXTURE_INK[1] && b === FIXTURE_INK[2];
  };
  /** A present asking `mark`, over a session kept open `hold_ms` after it
   * answers, since a session's end releases the fixture it presented: its
   * answer once that session ends, and with `hold_ms` given, the call is
   * detached and `join` answers it. */
  const present = async (mark?: boolean, hold_ms = 0) => {
    const live = (await driven('observe', { parts: ['state'] })).state;
    const argument = { fixture: { kind: 'patch', patch: {} }, fingerprint: live.fingerprint, ...(mark === undefined ? {} : { mark }) };
    if (!hold_ms) return driven('present', argument);
    const { detached } = await app.call({ op: 'endpoint', call: 'present', argument, hold_ms, detach: true });
    return { join: async () => (await app.call({ op: 'join', detached })).answer };
  };
  /** What the app shows, as an observation over a session of its own names it. */
  const shown = async () => (await driven('observe', { parts: [] })).shown;
  /** Whether the endpoint's own capture says it carries the host's drawing. */
  const presented = async (frame_only: boolean) => (await driven('observe', { parts: ['capture'], frame_only })).capture?.presented;
  return { app, driven, drawn, band, present, presented, shown };
}

if (!MAC) describe('the fixture mark, drawn by a Tauri app\'s host', () => {
  let t0: Awaited<ReturnType<typeof fixtureMarkApp>>;
  before(async () => { t0 = await fixtureMarkApp(false); });
  after(async () => { await t0?.app.close(); });

  test('while a fixture stands, a capture with the host\'s drawing shows the mark and the frame alone does not', async (t) => {
    const presenting = await t0.present(undefined, FIXTURE_HELD_MS) as { join: () => Promise<any> };
    await sleep(FIXTURE_HELD_MS / 3);
    const standing = await t0.shown();
    const [shown, alone] = [await t0.drawn(false), await t0.drawn(true)];
    const flags = [await t0.presented(false), await t0.presented(true)];
    const presented = await presenting.join();
    await sleep(300);
    const after = await t0.drawn(false);
    t.diagnostic(`band: drawn ${t0.band(shown)}, frame alone ${t0.band(alone)}, after its session ended ${t0.band(after)}; presented ${flags}; shown ${JSON.stringify(standing)}`);
    assert.ok(presented?.presented?.handle, JSON.stringify(presented));
    assert.equal(standing?.kind, 'fixture', JSON.stringify(standing));
    assert.ok(t0.band(shown), 'a capture with the host\'s drawing showed no fixture mark');
    assert.ok(!t0.band(alone), 'the frame alone showed the fixture mark');
    assert.deepEqual(flags, [true, false], 'the endpoint\'s captures said wrongly whether they carry the drawing');
    assert.ok(!t0.band(after), 'the fixture mark outlived its fixture, released at its session\'s end');
  });
  test('outside a dev instance, a present asking mark: false is refused as mark_required, and nothing is shown', async () => {
    const answer = await t0.present(false);
    assert.deepEqual([answer?.refused?.code, answer?.refused?.subject], ['mark_required', 'ui/history'], JSON.stringify(answer));
    const shown = (await t0.driven('observe', { parts: [] })).shown;
    assert.deepEqual(shown, { kind: 'live' }, JSON.stringify(shown));
  });
});

if (!MAC) describe('the fixture mark, in a Tauri app that runs as a dev instance', () => {
  let t0: Awaited<ReturnType<typeof fixtureMarkApp>>;
  before(async () => { t0 = await fixtureMarkApp(true); });
  after(async () => { await t0?.app.close(); });

  test('a dev instance honours mark: false: the fixture stands, and no capture shows the mark', async (t) => {
    const presenting = await t0.present(false, FIXTURE_HELD_MS) as { join: () => Promise<any> };
    await sleep(FIXTURE_HELD_MS / 3);
    const [standing, shown] = [await t0.shown(), await t0.drawn(false)];
    const answer = await presenting.join();
    t.diagnostic(`band: drawn ${t0.band(shown)}; shown ${JSON.stringify(standing)}`);
    assert.ok(answer?.presented?.handle, JSON.stringify(answer));
    assert.deepEqual(standing, { kind: 'fixture', handle: answer.presented.handle }, 'the fixture did not stand');
    assert.ok(!t0.band(shown), 'a fixture presented with mark: false was marked');
  });
  test('a dev instance still marks a fixture whose present leaves the mark on', async () => {
    const presenting = await t0.present(undefined, FIXTURE_HELD_MS) as { join: () => Promise<any> };
    await sleep(FIXTURE_HELD_MS / 3);
    const shown = await t0.drawn(false);
    const answer = await presenting.join();
    assert.ok(answer?.presented?.handle, JSON.stringify(answer));
    assert.ok(t0.band(shown), 'a dev instance left a marked fixture unmarked');
  });
});
```

<a name="chunk-test-file"></a><sub>[`probe-app/tests/probe.test.ts`](../../crates/x0k-ui-tauri/probe-app/tests/probe.test.ts) · `#test-file` · assembles [test-setup](#chunk-test-setup) · [test-percentile](#chunk-test-percentile) · [test-app](#chunk-test-app) · [test-trials](#chunk-test-trials) · [test-input](#chunk-test-input) · [test-claims](#chunk-test-claims) · [test-input-claims](#chunk-test-input-claims) · [test-endpoint](#chunk-test-endpoint) · [test-hidden](#chunk-test-hidden) · [test-turn](#chunk-test-turn) · [test-endpoint-at](#chunk-test-endpoint-at) · [test-takeover](#chunk-test-takeover) · [test-cast](#chunk-test-cast) · [test-fixture-mark](#chunk-test-fixture-mark)</sub>

```typescript {#test-file file="probe-app/tests/probe.test.ts"}
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
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
const { bgraImage, pngImage, scratchEnv } = await from(`${HOSTS}/engine.ts`);
const { DRAWN_INK, FIXTURE_INK, drawnApart, judge } = await from(`${HOSTS}/probe-judge.ts`);
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

<<test-hidden>>

<<test-turn>>

<<test-endpoint-at>>

<<test-takeover>>

<<test-cast>>

<<test-fixture-mark>>
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
conformance suite: `62 claims, 0 broken`, measured on arca in a run of
`cargo test -p x0k-ui-tauri -p x0k-ui-tauri-probe` where the probe test's 38
claims all pass. The answer page takes state fixtures, so the suite reaches
every fixture claim of `ui-interfaces` §4 and they hold: the three refusals
and that a refused fixture shows nothing, a fixture shown in the frame
`present` names and named by an observation, input and a read-only action
under it, the caller's `counter.bump` simulated under it, a second `present`
replacing the first, a release that shows the live state and a second one
answered as not standing, the live head where it was after a present and a
release, and a session's end releasing the fixture it presented. Every source
kind the model has is delivered, or refused as `undeliverable_source` by its
own name: `pen` and `touch`. A sequence that names its requester is refused
as it is unnamed. Eight claims are unreachable, each for its
reason: the trace claim names no witness; three need a host that cannot paint
the window, and this window paints, so the hidden window below reaches them;
and four need a past position, which a page does not hold (the grades of the
positions a history answers, a position no longer held, going back, and a
session's end returning from the past).

**A fixture the page ends, a driver's name, and a path the app gives.**
Measured on arca in one run of `cargo test -p x0k-ui-tauri -p
x0k-ui-tauri-probe`, where the probe test's 38 claims all pass. With the
answer page ending its fixture as soon as an observation has shown it, as an
approval arriving would, the suite reads `61 claims, 0 broken`, and its three
claims of an app that ends a fixture hold: the call after it is refused as
`fixture_ended`, naming the fixture, the app shows its live state, and
releasing the fixture answers `ended` with the page's reason. The input under
the fixture and the rest of the trip are unreachable with that reason, `the
app ended the fixture: an approval arrived for a person`. A driver that names
itself `a driver that names itself` is labelled so: the label's ink runs 164
CSS pixels right of the pointer at GDK scale 1 and 165 at 2, against 41 and 42
for the unnamed `probe`. The probe app given a path by `ui_plugin_at` is
served there, and its runtime directory holds nothing else of the plugin's.
Each was red first, by a mutation of this chapter:

- with `PageApp::fixture_ended` answering nothing, the endpoint never tells
  the driver, and the suite runs its trip on the live state:
  `62 claims, 2 broken`, `BROKEN ui-interfaces §4 an action above read_only
  takes the disposition the replay policy gives it, and a non_idempotent one
  is never performed: counter.bump was performed against its real target`;
- with the pointer sent to the layer without its name, `the named label runs
  41.17 CSS pixels, the unnamed 41.17`;
- with `ui_plugin_at` binding where the profile's rule puts the plugin's own
  name, `nothing at /tmp/x0k-ui-tauri-Wg6rDQ/given/probe.endpoint`.

**A hidden window, and a page that declines.** With the app's window hidden,
the suite reaches its `cannot_paint` claims and they hold: `24 claims, 0
broken`, the three `holds §8 / §9 / §10 while the host cannot paint the
window` among them, and the claims of a painting host unreachable by name,
`the host cannot paint the window: the window is hidden`. Driven directly,
the hidden window refuses an observation's capture as `cannot_paint` and
answers its layout and state, and refuses an action and input as
`cannot_paint`, each in a test that took 22 ms and 29 ms all told, and the
page ran neither. A touch source is refused as `undeliverable_source`,
naming `touch`. With an approval waiting, the suite reads the fixture claims
as `unreachable ui-interfaces §4 presenting a fixture shows it and names its
frame: the app declines for now: an approval waits for a person`, and nothing
is broken. Each was red first, against the plugin and the library as they
stood before:

- the hidden window's observation and action each ran out the plugin's wait,
  `did not answer within 5000 ms`: the capture, the layout and the state all
  refused as `the page did not answer within 5s`, and the action answered
  `failed` with the same reason;
- the suite on the hidden window ran 115 s and broke, `BROKEN §9 counter.bump
  runs and names the frame after it: Failed { reason: "the page did not
  answer within 5s", frame: None }`;
- a touch source over the endpoint answered `{"done":{"frame":null}}`, since
  the plugin refused it to itself after the endpoint had let it through;
- the declined `present` answered `misfit_state`, `54 claims, 2 broken`
  (`ui.decline is not a function`, in the library before it).

The suite's history claim was red before the offer named the interface: an
offer that carried `history` and did not list `ui/history` read
`BROKEN ui-interfaces §5 the offer says what it holds of its history exactly
when it names ui/history: Unasked`. Two mutations show the fixture claims red
for their reason over the endpoint:

- with the answer page's `present` writing the fixture into its live store,
  `BROKEN ui-interfaces §4 a fixture never changes the live state: presenting
  and releasing leaves its head where it was: Some("r6") became Some("r7")`;
- with `PageApp::shown` answering `live` while a fixture stands, the endpoint
  ran the caller's action:
  `BROKEN ui-interfaces §4 an action above read_only takes the disposition the
  replay policy gives it, and a non_idempotent one is never performed:
  counter.bump was performed against its real target`.

Before the page took fixtures the suite read `37 claims, 0 broken` here, and
two claims were seen red for their reason by a mutation:

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
endpoint, the probe app held to the conformance suite: `37 claims, 0 broken`,
with the same three claims unreachable as on Linux. That run predates the
page's fixtures; the fixture claims have not been run on the Mac.

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

**What the host is told.** Measured on arca at GDK widget scales 1 and 2, in
a run of `cargo test -p x0k-ui-tauri -p x0k-ui-tauri-probe` where the probe
test's 42 claims all pass and the suite over the endpoint reads `62 claims,
0 broken`, `61` and `24` in its three runs: a
click into the field and two keys typed there were told to the probe app's
observer as seven events, `move`, `press`, `release` and a `key_down` and
`key_up` for each key, all on the main thread, for the webview `probe` and
the requester `probe`, the click at the field's centre over the capture's
scale. Each of the six requests the page's trusted handlers sent the host
found the events before it told, and `last_delivered` answered the instant
of the last one. Each claim was red first, by a mutation of this chapter:

- with the observer called 300 ms later on the main loop, the page's
  requests reached the host before it was told:
  `[{"kind":"mousedown","told":0,"last":true},{"kind":"mouseup","told":0,"last":true},…]`;
- with the observer called 300 ms later on another thread, the first event
  read `"main":false`;
- with `last_delivered` never recorded,
  `[{"kind":"mousedown","told":3,"last":false},…]`;
- with the plugin's events put on GDK's queue in place of
  `gtk_main_do_event`, the GDK event handler was called with
  `["MotionNotify","ButtonPress","ButtonRelease","KeyPress","KeyRelease"]`.

**A host that declines or holds input.** Measured on arca over the probe
app's endpoint: a Shift held 250 ms that the host declines is refused
`declined`, naming `ui/input`, with the host's reason, and nothing is told; one
the host holds and lets go after 400 ms answers in 705 ms, its two events
told 252 ms apart; one held past a 300 ms wait is refused `declined` with its
reason in 313 ms, nothing told. Red first: with the endpoint not asking
`declines_input`, the endpoint's own test reads `the sequence ran`. This
rests on the unaccepted amendment of `ui-control-channel` §10.

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
screen locked and the display asleep, WKWebView renders no frame. Before the
library bounded its waits, the hold's settle then never ended, and every
request after the first observation went unanswered (`the page did not answer
within 5s`). Now that window should be refused as `cannot_paint` at once, by
the page's visibility or the window's state, which the Mac has yet to show
(below).

**A takeover.** Measured on arca over the probe app's endpoint, the
answer page at GDK scale 1, each answer the host's takeover table. Under
`allow` the takeover held with no ask and answered in 1583 ms, its 1500 ms
pause and the settle; while it held, a capture showed the band's ink at the
page's left edge and the frame alone did not, the person's `q` and click on
the button reached neither the field nor the button (the field read `p`, the
key typed before the hold, with no click), and the person's `r` after the
hold reached the field. The person's Escape ended a 2500 ms hold at once: the
key after it reached the field while the sequence still ran, and the band was
gone. A sequence `before_input` declined was refused as `declined` with the
host's reason, and no hold stood. Under `refuse` the takeover was refused as
`takeover_not_granted`, naming the configuration, in 11 ms. Under `ask` the
test found Allow by its ink at (86, 122.5) in the view's units, the person's
click there granted the takeover, Escape refused the next as
`takeover_not_granted`, and an ask no one answered was refused after
30 017 ms. The conformance suite, with the runner naming the answer, held
both: `holds §10 a takeover is answered as the host's configuration says,
before any of the sequence runs; 63 claims, 0 broken`, under `allow` and
under `refuse`. Each claim was seen red first, by mutation:

- with `PageApp::hold_takeover` answering false, the allowed takeover was
  refused in 10 ms, `the host's configuration allows uid 1000 pid … a
  takeover, and the window holds another`, and the person's input reached
  the page (`pq`, one click);
- with the hold left out of the paint, `a capture during the hold shows no
  band`;
- with the gate letting every event through, `the person's input reached the
  page during the hold` (`pq`, one click);
- with Escape not read as the exit key, the Escape claim was red under
  `allow`, and under `ask` the Escape ask waited out its 30 s;
- with the endpoint built without the host's table, the refused takeover
  asked instead and no answer came within the probe's 30 s;
- with a press on Allow answering no, the Allow claim was refused, and the
  unit test `the_person_answers_an_ask_on_its_buttons_and_nowhere_else` was
  red;
- with the ask waiting a tenth of `TAKEOVER_ASK_MS`, `refused in 3018 ms`;
- with the endpoint asking the configuration before the host's
  `before_input`, `a hold stood after a declined takeover`: the hold was taken
  and never let go;
- with a free window stopping the person's input, the unit test
  `the_person_s_input_stops_only_while_a_takeover_stands_and_the_exit_key_ends_a_hold`
  was red.

**The fixture mark.** Measured on arca over the probe app's endpoint, the
answer page at GDK scale 1. While a fixture a driver presented stood, a
capture with the host's drawing showed `FIXTURE_INK` at the band, the frame
alone did not, and the endpoint's captures said `presented` true and false;
once the session that presented it ended, the band was gone. A `present`
asking `mark: false` was refused as `mark_required`, and the page still
showed `live`. Run as a dev instance, the same call was honoured: the fixture
stood and no capture showed the band, while a `present` asking nothing was
still marked. The suite over the answer page held `while a fixture stands, a
capture with the host's drawing shows the fixture mark, and the frame alone
does not` and `mark_required`. Each was seen red first, by mutation:

- with the paint sending no fixture, `a capture with the host's drawing
  showed no fixture mark`, the dev instance's marked fixture went unmarked,
  and the suite's run over the answer page broke its ink claim;
- with every presented fixture marked, `a fixture presented with mark: false
  was marked` in the dev instance;
- with the offer never saying it is a dev instance, the dev instance's
  `mark: false` was refused as `mark_required`.

**For chariot.** Chariot's page draws its own banner while a fixture stands
(`ui.onFixture(handle => banner.show(...))`). That banner is part of the
page's frame, so every capture shows it, a stepped screencast's included, and
the plugin now draws the fixture mark over the window anyway. Chariot drops
the banner, and builds its dev window's plugin with `.dev_instance(true)`, so
a run's `present` steps may ask `mark: false` there and nowhere else
(`x0k:architecture/ui-screencast`, "Chariot's part"; intent `6cbb328b`).

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

The takeover's macOS half, the local event monitor that holds back the
person's input and reads their answer to an ask, is written and not yet
compiled: arca builds no macOS code. On Linux an IME's composition and a
touchpad's gestures outside GDK's pointer and key events are not held back,
and the ask's card is placed for a view at least 256 units wide. So is a look
an app declares for the drawing open (`x0k:design/ui-driver`).

On macOS, two more. A key's code is right only on a US layout and for letters, digits and
named keys, and every click is a single click, so a double click is two single
ones. The Windows webview, WebView2 through CDP, is not built.

**The Mac must verify the covered-window switches** ("Keeping a covered
window painting"). arca has no `aarch64-apple-darwin` standard library, so
only the Mac compiles the macOS code. Measured on the Mac with chariot's
window (chariot's dev instance over 0.2, `WhileDriven`): a window that
CoreGraphics showed off the active Space, with no driver connected since it
was made, read `hidden` and refused every capture as `cannot_paint`; with the
occlusion notification posted after the switch, the same window answered
captures, `set_theme` re-rendered it, and a click through `perform` changed
it, each capture showing the change. The rest is open. On the Mac, in the
`x0k-ui-tauri` crate:

1. `cargo test -p x0k-ui-tauri`: it compiles, and
   `wkwebview_still_answers_the_private_occlusion_switch` holds.
2. Start the probe app on the answer page with the default
   `CoveredPainting::WhileDriven`, connect a driver (`ui-conformance` on its
   endpoint, or the MCP driver), and check the log says
   `ui_tauri.painting.switched on=true occlusion=true scheduling=true`.
3. With the driver connected, put the window in each state in turn and time
   one `observe` of `[capture, layout, state]`, one `invoke` of
   `counter.read` and one mouse `pause` `perform`:
   - **covered** by another app's window: all three answer, the capture
     showing the page;
   - **on another Space**: all three answer (measured, above);
   - **minimised**: the capture refused as `cannot_paint`, layout and state
     answered, and the action and input refused as `cannot_paint`, each in
     well under a second;
   - **screen locked**, and **display asleep** (`pmset displaysleepnow`): the
     same, answered or refused as `cannot_paint` at once, never `did not
     answer`.
4. If the covered window does not answer in step 3, repeat it with the
   probe app built with
   `ui_plugin_with(APP, "probe", CoveredPainting::FromCreation)`, and record
   which mode works. If only `FromCreation` does, make it the default.
5. Disconnect the last driver and check `on=false` in the log; a covered
   window then reads `hidden` again and is refused as `cannot_paint`.
6. Rerun the probe test as a whole three times (the unreliable runs above,
   50c8103b): with the switches on while the suite drives it, the runs that
   went unanswered should now answer, or refuse as `cannot_paint` at once.
   That occlusion was their cause is inferred.

**A stepped screencast** is green on arca under Xvfb. Two casts of the clock
page at 30 fps for a second drew 31 frames each, the page moving through
them, and gave one trace hash, `8a982eb7d9da93b7…`, with the end saying
a rerun draws the same frames; each took about 1.1 s of the wall, and 61
frames at 60 fps took 2.3 s, so a stepped frame costs the plugin about 37 ms
here. Frame *n* at 30 fps was frame 2*n* at 60 fps in all 31. A `present` at
100 ms painted its ink first in frame 3 at 25 fps and frame 6 at 60 fps.
Each claim was seen red for its reason by a mutation of this chapter:

- with the page's clock never begun or stepped, so the page moved on the
  wall, the two casts' traces were `048acecaa8015d8b…` and
  `7375773c7272676f…`, every row's capture differed from frame 0 on, and
  frame *n* at 30 fps differed from frame 2*n* at 60 fps;
- with a fixed 16 ms tick per frame whatever the rate, the reruns still
  agreed, and frame *n* at 30 fps differed from frame 2*n* at 60 fps from
  frame 1 on;
- with each capture one frame behind its step, frame 3 at 25 fps showed no
  ink;
- with the endpoint served without the host's configuration, a stepped
  cast's hold asked the person, and the cast was refused only after 30 s as
  "the person did not grant … a takeover";
- with the end not ending the page's clock, the page's clock still stepped
  after the cast, and the next cast could not begin.

Two casts of that run from 2026-11-12T00:00:00Z gave one trace hash,
`f6362e39790ece13…`, and the page read `Date.now()` as that date at frame 0
and a second later at frame 30; the cast that named no date read 0 at frame 0,
and its trace was `01446c24248ed83c…`. With the plugin beginning the clock at
`date: 0` whatever the cast named, the dated casts read 0 and 1000 and their
trace was the undated one's. With the endpoint answering a cast naming
`sampled` as `misfit_arguments`, the suite's sampled claim was broken in every
suite the probe test runs, naming `MisfitArguments`.

The conformance suite's screencast claims hold over the answer page, where
before the plugin offered `ui/screencast` two of them were `unreachable …:
the offer does not name ui/screencast`:

```
holds       ui-screencast §3 the offer says how the app keeps time for a screencast exactly when it names ui/screencast, and never offers sampled
holds       ui-interfaces §4 a present asking mark: false of an instance that is not a dev instance is refused as mark_required
holds       ui-screencast §3 a cast naming the sampled clock is refused as unoffered_clock before anything plays
holds       ui-screencast §2 frames for a handle the endpoint never cast is refused as unknown_screencast
69 claims, 0 broken
```

What is open for a stepped screencast:

- **The Mac's capture.** `step_to` takes the snapshot through `PageHost`,
  which is WKWebView's `takeSnapshot` on macOS, and the hold and the clock
  are the library's on both; that the stepped casts above hold on the Mac
  is inferred, not run.
- **Animations.** The library says nothing of the animations a frame shows,
  so a frame answers no `animations` part, and a driver fits every easing.
- **Memory.** The endpoint keeps every frame's capture until the session's
  next cast or its end, so the longest cast at a large window holds
  thousands of PNGs; nothing bounds it but the offer's frame count.

**The Mac must also verify the provenance claims** ("Telling the host what it
delivers"). The macOS calls to the observer, the probe app's local monitor
and its `real` event, and the probe test's monitor claim are written and
never compiled. On the Mac, in the `x0k-ui-tauri` crate:

1. `cargo test -p x0k-ui-tauri -p x0k-ui-tauri-probe`: both compile, and the
   input suite's `every event the plugin delivers is told to the host first`
   holds: seven events told on the main thread, each page request finding
   its event told.
2. The same run's `an AppKit local event monitor sees none of the plugin's
   pointer events` holds, and its diagnostic says how many of the plugin's
   key downs the monitor saw. None means the plugin's events never reach a
   monitor at all; some, each a `KeyDown`, means WebKit hands back the key
   downs the page did not handle through `NSApplication`'s `sendEvent:`, and
   chariot must discount a monitor's key down whose timestamp is a told
   event's `platform_time`. Record which, here and in the section above.
3. Red first: with `teller.tell` moved after the view's responder call and
   deferred by `dispatch_after` 300 ms, the first claim is red as on Linux
   (`"told":0`); with the plugin's mouse events handed to the window's
   `sendEvent:` in place of the view's `mouseDown:`, the monitor claim is red,
   naming `LeftMouseDown`.
