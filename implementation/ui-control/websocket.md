
# The endpoint over a WebSocket

```turtle folio:document
implementation:ui-control\/websocket a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "The UI-control endpoint's frames over a WebSocket, as a byte stream either side can dial, so an app in a browser or a webview answers exactly as one on a unix socket does." ;
    x0k:concerns "ui-control", "protocol", "publication" ;
    x0k:cites implementation:ui-control\/endpoint,
        implementation:ui-control\/conformance,
        implementation:sync\/websocket-carrier ;
    x0k:implements architecture:ui-control-channel ;
    folio:tangleCrate "crates/x0k-ui-endpoint" ;
    folio:tangleRoot "tests/websocket.rs" .
```

`x0k:architecture/ui-control-channel` §7 says the carrier follows from where the app
runs, and the frames do not change. An app in a browser or a webview, or on a phone,
uses a WebSocket. An app that cannot listen dials out to an endpoint its host names,
and once the connection stands it answers as if it had accepted it.

The endpoint is a session on the operation wire, and the wire runs on any byte stream.
Its WebSocket is the wire's own (`x0k:implementation/sync/websocket-carrier`), in
x0k-operation-session: each write one binary message, a frame's length prefix saying where it
ends, so the frames are the same on every carrier.

Who dials and who answers are separate questions. `accept_websocket` and
`dial_websocket` decide who dialled and give the same stream either way.
`serve_connection` on it makes this end the app, and `UiClient::open` on it makes this
end the driver.

The endpoint's `websocket` feature turns on x0k-operation-session's, so a consumer on a unix
socket pulls no WebSocket stack through either crate.

## Holding it to the decision

The claim is that the carrier changes nothing, so the test is the conformance suite on
a real loopback WebSocket, with the app dialling and with the driver dialling. Its
small app holds the whole offer, and the suite exercises every operation through the
carrier. A frame larger than one message would be is the reason for the third test: a
capture crosses in one piece.

<a name="chunk-websocket-test"></a><sub>[`tests/websocket.rs`](../../crates/x0k-ui-endpoint/tests/websocket.rs) · `#websocket-test`</sub>

```rust {#websocket-test file="tests/websocket.rs"}
//! The suite, over a WebSocket, whichever end dialled.

#![cfg(feature = "websocket")]

use std::sync::Arc;

use serde_json::{json, Value};
use x0k_ui_endpoint::client::UiClient;
use x0k_ui_endpoint::conformance::{run, Options, Report};
use x0k_ui_endpoint::server::{serve_connection, Endpoint, UiApp};
use x0k_operation_session::websocket::{accept_websocket, dial_websocket, websocket_listener};
use x0k_ui_protocol::act::{Grant, Outcome};
use x0k_ui_protocol::input::{HeldFrame, Perform, Resolved};
use x0k_ui_protocol::observe::{Bounds, Capture, LayoutNode, Observation, ObserveCall, Part, StatePart};
use x0k_ui_protocol::offer::{Action, Offer, SideEffect};
use x0k_ui_protocol::shapes::interfaces;

const WIDTH: u32 = 400;
const HEIGHT: u32 = 300;
/// Past the size of any one read, so a frame has to span the carrier's messages.
const CAPTURE_BYTES: usize = 3 << 20;

struct Browserish;

fn png() -> Vec<u8> {
    let mut png = vec![137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13];
    png.extend_from_slice(b"IHDR");
    png.extend_from_slice(&WIDTH.to_be_bytes());
    png.extend_from_slice(&HEIGHT.to_be_bytes());
    png.resize(CAPTURE_BYTES, 7);
    png
}

fn root() -> LayoutNode {
    LayoutNode {
        id: "root".to_string(),
        role: "window".to_string(),
        label: None,
        value: None,
        bounds: Bounds { x: 0.0, y: 0.0, width: f64::from(WIDTH), height: f64::from(HEIGHT) },
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

impl UiApp for Browserish {
    async fn offer(&self) -> Offer {
        let action = Action {
            name: "count".to_string(),
            description: String::new(),
            args: json!({ "kind": "null" }),
            result: json!({ "kind": "any" }),
            side_effect: SideEffect::ReadOnly,
        };
        Offer {
            app: "browserish".to_string(),
            instance: "1".to_string(),
            interfaces: interfaces(),
            actions: vec![action],
            state_head: Some("s1".to_string()),
            history: None,
            grades: Vec::new(),
            replay_policy: Vec::new(),
            sandboxes: Vec::new(),
            input: None,
            dev_instance: false,
            screencast: None,
        }
    }

    async fn observe(&self, call: ObserveCall) -> Observation {
        let wants = |part: Part| call.parts.contains(&part);
        let whole = call.scale.is_none() && call.region.is_none();
        let refused = (wants(Part::Capture) && !whole).then(|| x0k_ui_protocol::observe::PartRefused {
            part: Part::Capture,
            code: None,
            why: "whole frames only".to_string(),
        });
        let capture = Capture { png: png(), width: WIDTH, height: HEIGHT, scale_factor: 1.0, presented: false };
        let state = StatePart { value: json!({}), head: "s1".to_string(), fingerprint: "none".to_string() };
        Observation {
            frame: Some("live".to_string()),
            capture: (wants(Part::Capture) && whole).then_some(capture),
            layout: wants(Part::Layout).then(root),
            state: wants(Part::State).then_some(state),
            refused: refused.into_iter().collect(),
            shown: Some(x0k_ui_protocol::history::Shown::Live),
        }
    }

    async fn invoke(&self, _action: &Action, args: Value) -> Outcome {
        Outcome::Done { result: args, frame: Some("live".to_string()) }
    }

    async fn held_frames(&self) -> Vec<HeldFrame> {
        vec![HeldFrame { frame: "live".to_string(), width: WIDTH, height: HEIGHT, layout: Some(root()) }]
    }

    async fn perform(&self, _perform: Perform, _resolved: Vec<Resolved>) -> Option<String> {
        Some("live".to_string())
    }
}

fn endpoint() -> Arc<Endpoint<Browserish>> {
    Arc::new(Endpoint::new(Browserish, Grant { classes: vec![SideEffect::ReadOnly] }))
}

fn assert_holds(report: &Report) {
    assert_eq!(report.app, "browserish");
    assert!(report.broken().is_empty(), "{:?}", report.broken());
    assert!(report.cases.len() > 15, "the suite ran: {}", report.cases.len());
}

#[tokio::test]
async fn an_app_that_dials_out_answers_as_if_it_had_accepted() {
    let listening = websocket_listener("127.0.0.1:0").await.expect("a port");
    let url = format!("ws://{}", listening.local_addr().expect("an address"));
    tokio::spawn(async move {
        let carrier = dial_websocket(&url).await.expect("the app dials");
        serve_connection(carrier, endpoint()).await
    });
    let carrier = accept_websocket(&listening).await.expect("the driver accepts");
    let client = UiClient::open(carrier).await.expect("a session");
    assert_holds(&run(&client, &Options::default()).await.expect("a report"));
}

/// The program's verdict on an app, as its exit code.
fn the_program(args: &[String]) -> std::process::Child {
    std::process::Command::new(env!("CARGO_BIN_EXE_ui-conformance"))
        .args(args)
        .stdout(std::process::Stdio::null())
        .spawn()
        .expect("the program starts")
}

#[tokio::test]
async fn the_program_dials_a_url() {
    let listening = websocket_listener("127.0.0.1:0").await.expect("a port");
    let url = format!("ws://{}", listening.local_addr().expect("an address"));
    tokio::spawn(async move {
        let carrier = accept_websocket(&listening).await.expect("the app accepts");
        serve_connection(carrier, endpoint()).await
    });
    let verdict = tokio::task::spawn_blocking(move || the_program(&[url]).wait()).await;
    assert!(verdict.expect("it ran").expect("it ended").success());
}

#[tokio::test]
async fn the_program_listens_for_a_page_that_dials_out() {
    let free = websocket_listener("127.0.0.1:0").await.expect("a port");
    let address = free.local_addr().expect("an address");
    drop(free);
    let program = the_program(&["--listen".to_string(), address.to_string()]);
    let url = format!("ws://{address}");
    let carrier = loop {
        match dial_websocket(&url).await {
            Ok(carrier) => break carrier,
            Err(_) => tokio::time::sleep(std::time::Duration::from_millis(20)).await,
        }
    };
    tokio::spawn(serve_connection(carrier, endpoint()));
    let verdict = tokio::task::spawn_blocking(move || { let mut program = program; program.wait() }).await;
    assert!(verdict.expect("it ran").expect("it ended").success());
}

#[tokio::test]
async fn a_driver_can_dial_an_app_that_listens() {
    let listening = websocket_listener("127.0.0.1:0").await.expect("a port");
    let url = format!("ws://{}", listening.local_addr().expect("an address"));
    tokio::spawn(async move {
        let carrier = accept_websocket(&listening).await.expect("the app accepts");
        serve_connection(carrier, endpoint()).await
    });
    let client = UiClient::open(dial_websocket(&url).await.expect("the driver dials")).await.expect("a session");
    assert_holds(&run(&client, &Options::default()).await.expect("a report"));
}

#[tokio::test]
async fn a_capture_crosses_whole() {
    let listening = websocket_listener("127.0.0.1:0").await.expect("a port");
    let url = format!("ws://{}", listening.local_addr().expect("an address"));
    tokio::spawn(async move {
        let carrier = accept_websocket(&listening).await.expect("the app accepts");
        serve_connection(carrier, endpoint()).await
    });
    let client = UiClient::open(dial_websocket(&url).await.expect("the driver dials")).await.expect("a session");
    let call = ObserveCall { parts: vec![Part::Capture], region: None, scale: None, frame_only: false };
    let capture = client.observe(&call).await.expect("an observation").capture.expect("a capture");
    assert_eq!(capture.png, png());
}
```
