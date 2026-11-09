# A webview on the UI-control endpoint

```turtle folio:document
implementation:ui-control\/webview a x0k:Implementation ;
    x0k:status "proposed" ;
    x0k:summary "How a web page in a Tauri webview or a browser tab answers the UI-control endpoint: the page holds its own frame producers still while its host captures, so the layout, the state and the pixels of one observation come from one page state; input goes through the platform's own input path; and a page reaches its endpoint through its host over IPC, or by dialing out over a WebSocket." ;
    x0k:concerns "ui-control", "webview", "tauri", "protocol", "conformance" ;
    x0k:motivatedBy intent:8d711b07-19f6-2fdb-7953-12b8e01cd576 ;
    x0k:implements architecture:ui-control-channel,
        architecture:ui-interfaces ;
    x0k:cites implementation:ui-control\/protocol,
        implementation:ui-control\/endpoint,
        implementation:ui-control\/shell-endpoint,
        implementation:ui-control\/conformance,
        implementation:ui-control\/websocket,
        implementation:sync\/operation-wire-anywhere,
        implementation:platform\/datum .
```

`x0k:architecture/ui-control-channel` §8 says that every part of one observation
comes from one presented frame, and names it. x0k's shell keeps that promise on
one thread. It draws the frame that is due, then reads the serial, the tree and
the pixels, and nothing can run between them
(`x0k:implementation/ui-control/shell-endpoint`, "One frame"). A web page cannot
do that. The browser engine makes its pixels in another process. The host that
calls the platform's snapshot cannot stop the page's main thread meanwhile.

Two units build to this design. One is an in-page library in TypeScript
(intent `30ebc190`). The other is a Tauri plugin that holds a Tauri app's
endpoint (intent `67a00012`). It holds no code yet. Its central idea is this:
**the page holds its own frame producers still, and the host captures the still
page.** The library defers the page's animation-frame callbacks and pauses its
animations, lets two rendering updates pass, and reads the layout and the state.
The host takes the platform snapshot. The library checks that nothing changed
the page meanwhile, and lets it go. A frame's identity names the page state that
was held. The measurements below show that every simpler mechanism fails on at
least one engine.

The carried example is 0k.computer's web UI, the library's first user. Alice
runs it in a Tauri window on her Mac, and a driver on arca runs it in a headless
Chromium tab for its tests. Both are driven by the same procedure, over the same
endpoint frames.

## The parts and who holds what

Three parties take part, and each section below says which one does what.

- **The page** is the web content: 0k.computer's DOM, its scripts and its
  styles.
- **The library** is the in-page TypeScript that the page installs before its
  own scripts run. It knows the DOM, the page's actions and its state. It
  cannot read pixels.
- **The host** holds the endpoint and can read the page's pixels. In a Tauri
  app the host is the plugin, which calls the platform webview's snapshot. For
  a tab under test, the host is a relay that holds a Chrome DevTools Protocol
  (CDP) session to the same browser. A plain tab with nobody holding such a
  session has no host.

In a Tauri app the library never holds a socket to the world. That keeps the
trust line `ui-control-channel` §5 draws: the endpoint is the host's.

## What must hold

These are the invariants of `ui-control-channel` §8 to §10, said of a page:

- Every part of one observation is read from one page state, and the answer
  names that state's frame.
- Layout bounds are in the capture's own pixels, device pixel ratio included.
- Observing changes no state of the page. The hold delays the page's frame
  producers by two or three rendering updates and changes nothing else.
- Input reaches the page through the platform's input path, so the page's own
  hit-testing and focus decide its target, and its events are trusted.
- An action or an input sequence answers the frame of the first page state
  rendered after it took effect.
- A part the page cannot produce is refused by name, and the other parts are
  kept. A page with no host refuses `capture`, and its offer does not name
  `ui/input`.

**Cost bound.** An observation that asks for a capture costs one hold, one
platform capture and one layout walk. The hold measured a median of 24 to 44 ms
and a maximum of 50 ms on both engines below. The bound for the library's own
test is 100 ms at the 90th percentile on the probe page. An observation without
a capture runs in one script task and needs no hold.

## 1. Frame identity in a page

**Decides:** what a presented frame is for a page, and how the page names it.

**Invariants:**

- a frame name is `<epoch>` of the library instance, an integer the library
  raises whenever the page state may have changed;
- two observations of a page that did not change name the same frame;
- an observation that holds a capture names the epoch at which the page was
  held, and the epoch did not move while the host captured.

**On failure:** an epoch that moves during a capture is retried (§2). A page
that never holds still for the retry bound gets its capture refused by name, and
keeps its layout and its state.

**Checked by:** the library's probe test (§2), and the suite's existing
`ui/observe` claims, which hold that a node keeps its id and that observing
moves no head.

A browser offers no identity for a presented frame. `requestAnimationFrame`
runs before the frame's style, layout and paint, so it names a frame about to
be made, not one shown ([HTML, "update the rendering"][html-rendering]). The
Paint Timing mixin has a `presentationTime`, which may be absent. It is only on
sparse entries: first paint, largest contentful paint, and long animation
frames over 50 ms ([Paint Timing][paint-timing], [Long Animation
Frames][loaf]). No engine below gives a frame serial to the page or the host.

So a page's frame is named by its **state**, not by its compositor's count. The
epoch rises on each of these:

- a batch of `MutationObserver` records anywhere in the document, including
  open shadow roots and same-origin frames;
- a `scroll`, `resize` or `visualViewport` change;
- a trusted input event, and a change of focus;
- a Web Animation that starts, finishes or is cancelled;
- the page's own call to `ui.changed()`, for what the library cannot see.

The last item names what is hard. A canvas drawn from a timer, a video frame and
a style that changes with the pointer's hover change pixels without a DOM
mutation. A canvas drawn in an animation-frame callback is held by §2. The rest
are invisible to the library, and a page that has them calls `ui.changed()`.

This is the shell's "frame" with a different counter. The shell's serial counts
frames drawn, and an idle shell draws none, so it keeps its serial. An idle page
keeps its epoch for the same reason.

## 2. Tying the capture to that frame

**Decides:** how the host's capture and the library's layout come from one page
state.

**Invariants:**

- the library holds the page before the host captures, and releases it after;
- while held, no animation-frame callback of the page runs and no Web Animation
  advances;
- the page is held through two rendering updates before it is read;
- the epoch read after the capture equals the epoch read before it;
- a release restores each paused animation to the time it would have reached,
  so no timeline is left behind by the hold.

**On failure:** a moved epoch drops the capture and the read, and the hold is
tried again, up to three times. After that, `capture` is refused as
`page_unsettled`, naming the epochs seen, and the layout and the state of the
last read are answered. A host whose capture fails refuses `capture` with the
platform's reason.

**Checked by:** a probe page in the library's tests, run in every host. The page
paints its own counter into a pixel patch and moves one element by script and
one by a CSS animation. The test holds that the painted counter equals the held
epoch's counter, and that both elements' pixels lie where the layout says. The
measurements below show this test red for each mechanism that lacks the hold.

### What each platform's snapshot guarantees

| Host | Snapshot | What its documentation promises |
|---|---|---|
| macOS, WKWebView | `takeSnapshot(with:)` | Asynchronous. With `afterScreenUpdates` true, the default, it "incorporate[s] any recent changes to the view's content". The `rect` is in view points, inside the view's bounds. No ordering against script is stated ([Apple][wk-snapshot], [Apple][wk-after]). |
| Windows, WebView2 | `CapturePreview` | Asynchronous, into a stream, "an image of what WebView is displaying". During a navigation it captures the page being left. No frame identity ([Microsoft][wv2-capture]). |
| Windows, WebView2 | `CallDevToolsProtocolMethod` | Any CDP method, among them `Page.captureScreenshot` and `Input.*`. Calls may be processed out of order unless each waits for the last ([Microsoft][wv2-cdp]). |
| Linux, WebKitGTK | `webkit_web_view_get_snapshot` | Asynchronous, the visible region or the full document. It does not say whether it paints afresh ([WebKitGTK][wkgtk-snapshot]). |
| Chromium, over CDP | `Page.captureScreenshot` | No frame identity. `HeadlessExperimental.beginFrame` gives one, but only for a target created with begin-frame control in the old headless shell ([CDP Page][cdp-page], [CDP HeadlessExperimental][cdp-headless]). |
| Any browser, over WebDriver BiDi | `browsingContext.captureScreenshot` | Taken "immediately after the next invocation of the run the animation frame callbacks algorithm", with an editorial note that this ought to be stated more exactly ([WebDriver BiDi][bidi]). |
| A tab with no host | `getDisplayMedia` | Needs a person's gesture and a permission prompt, so a page cannot capture itself silently ([MDN, user activation][mdn-activation], [Chrome, Element Capture][element-capture]). |

No snapshot names the frame it shows, and none promises that it matches a DOM
read made beside it. What the engines on arca do in practice is under
"Measured on arca" below. In short:

- WebKitGTK paints its snapshot afresh from the DOM as it stands. It agrees with
  a read made just before it, while the screen lags by one or two rendering
  updates. With accelerated compositing it draws a CSS transform animation at a
  fixed wrong place.
- Chromium's capture waits for a new frame, about 35 to 50 ms. A page that
  animates every frame has moved three frames on when it returns.

### The mechanism

Four mechanisms were weighed.

1. **Read before and after, and retry when the identity moved.** It needs no
   change to the page. On WebKitGTK it agreed in 39 of 40 trials on a page that
   changes every frame. On Chromium it agreed in none of 40, because the capture
   spans three frames. It also cannot see a compositor animation, which moves no
   epoch. It fails.
2. **Stamp the identity into the pixels.** A patch of pixels that encodes the
   epoch tells the host which state was painted. It changes what a person sees,
   it can be covered or clipped, and it says nothing about whether the layout
   matches. It is the right tool for the probe test, and the wrong one for a
   product.
3. **Ask the engine for one frame.** `beginFrame` would give a frame and its
   screenshot together. It answered "'HeadlessExperimental.beginFrame' wasn't
   found" on Chromium 148 on arca, it exists in no desktop webview, and WebView2
   does not create targets with begin-frame control. HTML-in-canvas has
   same-frame semantics, but only for a canvas's `drawable` children, in a
   Chromium origin trial ([WICG][html-in-canvas]).
4. **Hold the page still, then capture and verify.** It is chosen.

The hold is the shell's one-thread read, moved to where a page can do it. The
shell stops everything else by running the read on the event-loop thread. A
page cannot stop its engine, so it stops its own producers of change:

1. The host asks the library to hold.
2. The library defers every animation-frame callback the page asks for. It
   installs its own `requestAnimationFrame` before the page's scripts run.
3. It pauses every running animation in `document.getAnimations()`, which
   includes CSS animations and transitions, and waits for each one's `ready`.
4. It waits through two rendering updates, so the paused state reaches the
   compositor and the screen.
5. It reads the epoch, the layout tree and the state in one script task, and
   answers them to the host.
6. The host takes the platform snapshot.
7. The host asks the library to verify. The library answers the epoch and
   releases the page. It gives each paused animation back its own start time,
   so it runs on as if it had never paused, and runs the deferred callbacks in
   the next update.
8. When the two epochs are equal, the host answers the observation. When they
   differ, it goes back to step 1, up to the bound.

The page holds still through two rendering updates. So the mechanism does not
depend on whether a snapshot is a fresh paint or the compositor's last frame:
both show the held state. That is what makes one design serve
WKWebView, WebView2 and WebKitGTK, whose documentation does not say which they
are.

The hold cannot stop a task that no animation frame scheduled: a timer, a
network reply, a message, a person's input. Each of
those that changes the page moves the epoch, and the retry catches it. Some
pages change on a timer faster than the hold lasts. Their captures are refused
as unsettled, which names the problem for the page's author.

**Hard.** The release gives each paused animation back its own start time,
rather than resuming it with `play()` and a seek. With that release, a CSS
animation on Chromium at a device pixel ratio of 1 lies where its layout read
says in 80 of 80 trials, in each of two runs. Released by `play()`, it is
painted a frame ahead of its read in 6 to 10 of 40. The cause is inferred: a
release by `play()` leaves the animation's play pending, and the compositor
then starts it on its own clock. With `--disable-threaded-animation` the
release by `play()` agrees in every trial too. Pausing from outside with CDP
`Animation.setPlaybackRate` at 0 makes it worse: 2 of 40. The two rendering
updates of settling are not shown necessary on arca's engines, where waiting
for each pause's `ready` already passes an update. They stay for a host whose
snapshot is the compositor's last frame. The measurements are in
`x0k:implementation/ui-control/page-hold`.

**Observing changes nothing.** The hold changes no state of the page. It does
stall the page's motion for two or three rendering updates. A person sees a
brief stutter on each observation that holds a capture. The release gives each
animation back its own start time, so no animation ends later than it would
have. A deferred
callback runs one frame late with that frame's timestamp, as after any long
task. A simulation that integrates its own time step sees one long step.

### What a plain tab can capture of itself

A plain tab with no host cannot capture its own pixels without a person.
`getDisplayMedia` with `preferCurrentTab`, Region Capture and Element Capture
all need a gesture and a prompt. Element Capture is in desktop Chrome only. A
library that re-paints the DOM into a canvas, as html2canvas does, makes a new
image and not the page's frame. So a plain tab with no host answers `layout` and
`state`, and refuses `capture` by name. `ui-control-channel` §8 allows that for
an app that presents no frame.

Under test on arca, the tab has a host. The relay that receives the tab's
dial-out also holds a CDP session to the browser. It captures with
`Page.captureScreenshot` and runs the same hold. A person may also give a plain
tab self-capture once, with a gesture. The library can then take a frame from
the current tab's capture track during the hold. That path is optional, and the
first library leaves it out.

## 3. The layout tree

**Decides:** which DOM nodes become layout nodes, what each carries, and how a
node keeps its id.

**Invariants:**

- bounds are the node's `getBoundingClientRect` cut to its clipping ancestors
  and the viewport, times the capture's scale, and offset by the capture's
  region;
- `laid_out` is the uncut box, present only when clipping cut it;
- no two nodes of a frame share an id;
- a node keeps its id for as long as its element stands;
- an element with an author key keeps its id when the framework replaces the
  element with an equal one.

**On failure:** some parts of a page cannot be walked: a cross-origin frame
without the library, or a closed shadow root made before the library was
installed. Each is one leaf node, with its bounds, its role, and a `source`
that names why it is opaque.

**Checked by:** the suite's `check_observation` (no shared id, visible nodes
inside the capture) and its node-id claim. The probe test holds that bounds land
on the pixels, at more than one device pixel ratio. Both are in
`x0k:implementation/ui-control/page-walk`, which builds this section and takes
the capture's scale from the capture itself.

**Coordinates.** A capture is in physical pixels and a layout read is in CSS
pixels. The ratio between them is the capture's scale: its pixel width over
the viewport's CSS width, read in the same hold. `scale_factor` in the capture
is that ratio. `devicePixelRatio` is not enough: WebKitGTK 2.50 under Xvfb
answers 1 while it captures at 1.043, and at 1.504 at 144 dots per inch,
because it takes the X server's dots per inch as a zoom it does not report
(measured in `x0k:implementation/ui-control/page-walk`). An observation with
no capture uses `devicePixelRatio`. A visual viewport that is pinch-zoomed adds its
offset and scale. A transform gives the axis-aligned box of the transformed
element, which is what `getBoundingClientRect` answers.

**Which nodes.** The DOM holds many wrappers that mean nothing to a person. The
library keeps the nodes the accessibility tree keeps, and promotes the children
of the rest:

- an element with a role, explicit or implied by its tag (HTML-AAM);
- an element with an accessible name;
- a focusable element, or one with a declared action;
- an element with text of its own.

A node's `role` and `label` are computed by the ARIA and accessible-name rules.
No browser gives a page its computed accessibility tree: the Accessibility
Object Model's `getComputedAccessibleNode` never shipped ([WICG AOM][aom]). The
library adopts `dom-accessibility-api`, which implements the accessible-name
specification and the role mapping ([dom-accessibility-api][dom-a11y]). Where a
host holds the engine's own tree (CDP `Accessibility.getFullAXTree`), the
host's test compares the two and names each difference.

The other fields:

- `value`: an input's value, or `aria-valuetext`, or `aria-valuenow`.
- `visible`: `checkVisibility()` and a cut box of non-zero area. Being covered
  by another element is not represented, as in the shell.
- `enabled`: not `disabled`, inherited from a disabled fieldset, and not
  `aria-disabled`.
- `focused`: the deepest active element, through shadow roots and frames.
- `interactive`: focusable, an interactive role, or a declared action. A
  listener added with `addEventListener` is invisible to a page, so an element
  that is clickable only through one is not marked. The page declares it.
- `action`: the action the page binds to the element (§5).
- `source`: set on a grafted subtree, below.

**Shadow roots and frames.** The walk follows the flat tree: open shadow roots,
slotted children where they are shown, and same-origin frames with their offset.
A closed shadow root is walked when the library was installed before it was
made, because the library keeps the roots it sees attached. A cross-origin frame
that runs the library grafts its own tree in, through `postMessage`, marked with
its origin as `source`. That is the graft `ui-control-channel` §8 describes for
a part that reports its own semantics.

**Ids across frames.** The shell builds ids from named widgets, then a path of
types and indices beneath them. The library does the same with what a page
names:

1. An element with `data-ui-id` or an `id` attribute is an anchor. Its id is
   the id of the anchor above it, then its own key.
2. Beneath an anchor, an element's id is a path of role and sibling index:
   `toolbar/save` or `seed-list/listitem[2]`.
3. The library remembers each element's id in a `WeakMap` while the element
   stands. A sibling inserted before it does not move its id.
4. An element first seen whose path an element still standing holds takes a
   suffix, so no two nodes of a frame share an id.

So an anchored element keeps its id across a framework's re-render, and an
unanchored one keeps it while it stands. As in the shell, a re-render that
changes a sibling count moves the paths of unanchored elements after it. A page
that wants a node to last gives it a key.

## 4. Input

**Decides:** how `ui/input` reaches a page.

**Invariants:**

- input goes into the platform's input path, never as events built by script;
- a position is in the named frame's capture pixels, and the host divides by the
  frame's ratio to reach view or CSS units;
- a move to a node resolves to the centre of that node's bounds in the frame
  that names it, which the library still holds;
- the answer names the epoch after the whole sequence was handled and one
  rendering update passed.

**On failure:** a host with no trusted input path does not name `ui/input` in
its offer, so a call to it is refused as `no_input_interface`. A source kind the
host cannot deliver (touch into a WKWebView on macOS) is refused by name before
any of the sequence runs.

**Checked by:** the suite's `ui/input` vectors, and a host test that clicks a
probe button and reads that its event was trusted and that its focus moved.

Three paths were compared.

- **Events dispatched by script.** `dispatchEvent` and `element.click()` make
  events with `isTrusted` false. Measured in Chromium 148: a CDP click arrived
  trusted, and both script-made clicks arrived untrusted. An untrusted event
  grants no user activation, so a pop-up, the clipboard, full screen and the
  file pickers refuse it ([MDN][mdn-activation]). A script-made key event types
  no text into a field. This is not input as a person makes it.
- **The host's native injection.** It enters the engine's input path, so the
  page's own hit-testing and focus decide the target and its events are
  trusted. WebKitGTK has no public injection call. Tauri's GTK 3 webview
  should take synthesized GDK events, as WebKit's own automation does; that
  is inferred from WebKit's source. WKWebView should take synthesized
  `NSEvent`s sent to the view; that is inferred too. WebView2 takes
  `SendMouseInput` only in visual hosting, which Tauri does not use
  ([Microsoft][wv2-composition]), so its host uses CDP.
- **CDP's `Input` domain.** Its events are trusted, measured above. It is the
  path for a Chromium tab under a relay and for WebView2.

The host injects, and the library resolves. The library holds the layout of the
last eight frames it answered, as the shell holds its last few. So a sequence
may name a recent frame and a node in it. The endpoint makes `check_perform`
against those frames before any input runs
(`x0k:implementation/ui-control/protocol`, "A sequence of input").

WKWebView event synthesis and WebView2's CDP input are untested here. The
plugin's first test on each platform reads `isTrusted` and a focus change from
a probe page.

## 5. Actions and state

**Decides:** how a page declares its named actions and its presentable state.

**Invariants:**

- each action has a name, a description, an argument shape and a result shape
  in x0k-datum's shape language, and a side-effect class;
- an action with no class declared is `non_idempotent`, the bias
  `ui-control-channel` gives an action with no published spec;
- the state is a JSON value with a shape, a head and the shape's fingerprint;
- shapes are pinned by the same code as `x0k-ui-protocol`'s.

**On failure:** the endpoint refuses an action the offer does not list, or whose
arguments misfit, before the page hears it (§6). An action that throws answers
`failed` with the error's message.

**Checked by:** the suite's offer and `ui/act` claims, and the protocol's
vectors run against the library's shape pins.

A page declares what it offers when it installs the library. Two lines:

```typescript
const ui = install({ app: "0k.computer", state: { shape: seedView, read: () => store.view() } });
ui.action("canvas.focus", { args: { kind: "struct", open: false, fields: { seed: { shape: { kind: "text" } } } }, result: { kind: "null" }, effect: "idempotent_write" }, ({ seed }) => canvas.focus(seed));
```

`canvas.focus` here is an illustration, not one of 0k.computer's actions. A
shape is a spelling of x0k-datum's shape language as JSON, the same spelling the
offer carries (`x0k:implementation/platform/datum`). An element binds to an
action with `data-ui-action="canvas.focus"`, which sets the node's `action`.

**One home for the checks.** `x0k-ui-protocol` depends on x0k-datum alone, and
it builds for `wasm32-unknown-unknown`, as does `x0k-operation-wire` (measured
in this unit's lane). So the library does not port the shape pin, the
fingerprints or the checks to TypeScript, and does not run them in the page
either: the page hands its host what it declares, raw, and the host makes the
values and the checks with the same crate, natively in Rust or as WebAssembly
in a host in JavaScript. A page then loads no WebAssembly, so a page whose
content security policy forbids it still answers, and the protocol's vectors
hold the library's host by construction.

**State.** `read` answers the presentable state. Its head is what the page gives
with `head()`, or else a digest of the state's canonical encoding. A page that
takes state fixtures adds `present(state)` and `release()` hooks, and its offer
says so (`x0k:architecture/ui-interfaces` §4). The first library leaves
`ui/history` out, and its offer says `live`.

**The frame after.** An `invoke` waits for the action's promise, then for one
rendering update, and answers the epoch then. That is the first page state
rendered after the action took effect (`ui-control-channel` §9).

## 6. Reaching the endpoint

**Decides:** where a page's endpoint is, and what carries the requester.

**Invariants:**

- the host's checks run before the library hears a call: the endpoint's,
  where `Endpoint` holds the app (`x0k:implementation/ui-control/endpoint`);
- in a Tauri app, the frames end at the plugin, and the library speaks the
  protocol's values as JSON over Tauri's IPC;
- in a plain tab, the frames reach the page over the WebSocket carrier
  (`x0k:implementation/ui-control/websocket`), and the page answers as if it
  had accepted the connection;
- the requester is known from the connection the call came on, never from the
  page.

**On failure:** an IPC answer that does not carry the nonce of the request it
answers is dropped, and the request times out as unanswered. A dial-out whose
ticket the listening end does not hold, or whose `Origin` is not the page's, is
refused at the handshake.

**Checked by:** the suite over the plugin's unix socket, and over the
WebSocket with `ui-conformance --listen` as the end a page dials. The plugin's
test sends an answer without a nonce and holds that it is dropped.

**In a Tauri app.** The plugin binds the endpoint under the profile's runtime
directory, as `ui-control-channel` §5 decides, and serves it with
`x0k-ui-endpoint`. Its `UiApp` forwards each call to the library:

1. The plugin evaluates a script in the webview that hands the library the
   call and a fresh nonce.
2. The library answers through a plugin command, with the nonce.
3. The plugin checks that the command came from the webview it asked, and that
   the nonce is the one it gave.

A Tauri command receives the `Webview` that called it. A capability grants the
plugin's commands to the app's own windows and local origin only
([Tauri, capabilities][tauri-capabilities], [Tauri, Webview][tauri-webview]).
On Linux, Tauri cannot tell an embedded frame from its window. The nonce keeps
a frame in the page from answering for the page. Tauri's IPC carries
JSON, and the protocol's values are JSON's model
(`x0k:implementation/ui-control/protocol`). A capture's PNG never crosses the
IPC: the plugin takes it natively.

The requester of a call on the local socket is the peer's credentials, as
`ui-interfaces` §6 says. The library hears only the plugin, which is the same
app.

**In a plain tab.** The library dials out over the WebSocket carrier to a URL its
host names. The host is whoever served or started the page. A development
server puts the URL in the page's configuration. A test harness passes it in the
page's address. The URL carries a ticket the host minted for that page, and the
listening end checks the ticket and the handshake's `Origin`. A browser sends
`Origin` on every WebSocket handshake, so another site's page that dials the
relay is refused.

The listening end is one of two:

- the daemon, where one runs, which then projects the page's offer as it does
  every endpoint's (`ui-control-channel` §5);
- a relay on the node, for a node with no daemon, which serves each page's
  session as an endpoint under the profile's runtime directory. Local discovery
  then sees a page as it sees any app.

`ui-conformance --listen` is the smallest such listener, and the websocket
chapter's tests already run the suite through it with the app dialing.

The page's end of the session is `x0k-operation-wire` in WebAssembly, as the
callee. That crate already holds both ends of a session with no socket
(`x0k:implementation/sync/operation-wire-anywhere`). The checks `Endpoint`
makes before an app hears a call are `x0k-ui-protocol`'s functions, so that
callee makes them in the same wasm, beside the page and not inside the
library.

The requester in a plain tab is the listening end's to name. A relay knows its
local driver from that driver's socket credentials, and forwards the call with
`on_behalf_of`. `ui-interfaces` §6 honours `on_behalf_of` only on the daemon's
connection, so a relay's forwarding needs the operator's word (§7).

## 7. What this asks of the accepted decisions

Nothing here edits `ui-control-channel` or `ui-interfaces`. Four points need the
operator, because they read or extend those decisions.

1. **What a presented frame is, for a page** (`ui-control-channel` §8). This
   design takes a page's frame to be a page state held still through two
   rendering updates, and its capture to be the host's rendering of that state.
   The screen showed the same state at most two rendering updates later, as
   measured. The recommendation is to accept that reading. Otherwise a frame
   must be what the compositor presented, and no host here can name one.
2. **A hold is a visible stall** (`ui-control-channel` §8, "observing changes
   nothing in the app"). Each observation with a capture stalls the page's
   motion for two or three rendering updates, and changes no state. The
   recommendation is that this counts as changing nothing. The alternative is
   to answer captures only from pages that are idle, which fails every
   animated page.
3. **A relay's `on_behalf_of`** (`ui-interfaces` §6). A plain tab on a node with
   no daemon is reached through a relay, whose forwarded requester §6 does not
   honour. The recommended default is that the daemon is the listening end
   wherever one runs, and that a relay's calls carry the relay's own principal
   until the operator extends §6 to a listening end the page's host named. The
   alternative is to extend §6 now.
4. **A source kind a host cannot deliver** (`ui-control-channel` §10). §10
   refuses an unknown source kind, but not a known kind that the app cannot
   deliver, such as touch into a WKWebView on macOS. The recommendation is to
   add that refusal to §10's "On failure", and a code for it to the protocol's
   `RefusalCode`. The alternative is to refuse it as `unknown_source`, which
   misnames it.

`ui-interfaces` §7 names the `ui-control` edge for "a web or Tauri app through
its shell". This design keeps that: the plugin and the relay are the page's
host, not the `cdp` edge, even when the relay captures over CDP. The hold makes
its capture and the library's layout one answer from one handler, which is why
this is not a fallback between edges.

## Measured on arca

Scratch programs outside the repository took these. The WebKitGTK probe is
Python over `webkit2gtk-4.1` 2.52.3, the ABI Tauri 2 uses on Linux, in a 400 by
300 window under Xvfb with Mesa's software renderer. The Chromium probe is
Node 24 over CDP to Chromium 148.0.7778.215 in its new headless mode with
SwiftShader, at 400 by 300 CSS pixels. Each ran with its own runtime, home,
cache and configuration directories. Each row is 40 trials, with a random 0 to
40 ms gap between trials on the animated page.

The probe page paints a counter into a 64-pixel patch in each animation frame,
moves one element by script to the counter's position, and slides one element
with a CSS transform animation.

| Question | WebKitGTK | Chromium |
|---|---|---|
| Round trip of one capture, median (maximum) | 0.11 to 0.35 ms (0.9 ms) | 33 to 51 ms (61 ms) |
| A mutation made by a script just before the capture shows in it | 40/40, all three compositing policies | 40/40 |
| Animated page, read before, capture, read after: the capture shows the state read before | 39/40; in the other trial it shows the state read after | 0/40; it shows the state after, three frames on, in 40/40 |
| The screen, read from the X server right after the capture | one frame behind the capture in 19/40 without compositing; two frames behind in 40/40 with it | not read |
| A CSS transform animation in the capture lies where its layout says | 40/40 without compositing; 0 to 2/40 with it, drawn at a fixed place | 37 to 39/40, between the reads before and after |
| Animations paused, no wait | 15/40 with compositing | not run |
| Animations paused, then two rendering updates | 40/40 with compositing | not run |
| The full hold: counter, epoch, script motion and CSS animation agree | 40/40 with and without compositing | counter, epoch, script motion 40/40; CSS animation 26 to 30/40 at ratio 1, 40/40 at ratio 2 |
| The hold's own cost, median (maximum) | 24 to 28 ms (48 ms) | 34 to 44 ms (50 ms) |
| `devicePixelRatio`, and bounds times it landing on pixels | 1.0427 under Xvfb, 40/40 | 1 and 2, 40/40 |
| A click's `isTrusted` | not run | CDP `Input.dispatchMouseEvent`: true; `dispatchEvent` and `click()`: false |
| `HeadlessExperimental.beginFrame` | absent | "'HeadlessExperimental.beginFrame' wasn't found" |
| `DOMSnapshot.captureSnapshot`, `Accessibility.getFullAXTree` | absent | 0.58 ms; 6 nodes |

Two things follow. WebKitGTK's snapshot is a fresh paint of the DOM as it
stands, not the frame on the screen, and the screen lags it. Chromium's capture
makes a new frame and takes long enough for a busy page to move several frames
on. Only the hold agreed on both engines, with the one gap that §2 names.

Not tested here: WKWebView, WebView2, and input injection into WebKitGTK. The
first two cannot run on arca. Their rows in §2's table are from their
documentation only. The Tauri plugin's first tests on the Mac and on Windows are
the probe test and the trusted-click test.

## What the units build first

The library (`30ebc190`), in this order:

1. The hold and its epoch, and the probe page test, run in headless Chromium
   under a CDP relay and in WebKitGTK. This is the mechanism everything rests
   on, and the test is already seen red without it. Built in
   `x0k:implementation/ui-control/page-hold`.
2. The layout walk with its ids, held by `check_observation` and the node-id
   claim, against 0k.computer's web UI. Built in
   `x0k:implementation/ui-control/page-walk`.
3. `install` and `action`, and what the page gives its host, raw, with
   `x0k-ui-protocol`'s values and checks made by the host, held by the whole
   conformance suite. Built in `x0k:implementation/ui-control/page-answer`.
4. The wasm build of `x0k-operation-wire` as the page's end of the session,
   with the dial-out and its ticket.
5. 0k.computer declaring its actions and its state.

The plugin (`67a00012`), in this order:

1. WebKitGTK through `with_webview`: the hold handshake over IPC with its nonce,
   `get_snapshot`, and the probe test against a minimal Tauri app on arca.
2. The endpoint under the runtime directory through `x0k-ui-endpoint`, with the
   suite run against it.
3. Input through synthesized GDK events, with the trusted-click test.
4. WKWebView on the Mac: `takeSnapshot` and `NSEvent` input, and the same
   tests. Then WebView2 through CDP.

## Sources

[html-rendering]: https://html.spec.whatwg.org/multipage/webappapis.html#update-the-rendering
[paint-timing]: https://w3c.github.io/paint-timing/
[loaf]: https://w3c.github.io/long-animation-frames/
[wk-snapshot]: https://developer.apple.com/documentation/webkit/wkwebview/takesnapshot(with:completionhandler:)
[wk-after]: https://developer.apple.com/documentation/webkit/wksnapshotconfiguration/afterscreenupdates
[wv2-capture]: https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2#capturepreview
[wv2-cdp]: https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/chromium-devtools-protocol
[wv2-composition]: https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2compositioncontroller
[wkgtk-snapshot]: https://webkitgtk.org/reference/webkitgtk/stable/method.WebView.get_snapshot.html
[cdp-page]: https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-captureScreenshot
[cdp-headless]: https://chromedevtools.github.io/devtools-protocol/tot/HeadlessExperimental/
[bidi]: https://w3c.github.io/webdriver-bidi/#command-browsingContext-captureScreenshot
[mdn-activation]: https://developer.mozilla.org/en-US/docs/Web/Security/User_activation
[element-capture]: https://developer.chrome.com/docs/web-platform/element-capture
[html-in-canvas]: https://github.com/WICG/html-in-canvas
[aom]: https://wicg.github.io/aom/caniuse.html
[dom-a11y]: https://github.com/eps1lon/dom-accessibility-api
[tauri-capabilities]: https://v2.tauri.app/security/capabilities/
[tauri-webview]: https://docs.rs/tauri/latest/tauri/webview/struct.Webview.html

- Playwright waits for two consecutive screenshots to match before it compares
  one, and calls an element stable when its box held for two animation frames
  ([Playwright assertions](https://playwright.dev/docs/api/class-pageassertions),
  [Playwright actionability](https://playwright.dev/docs/actionability)). The
  hold adopts the two frames. It does not adopt the repeated screenshots, which
  cost a capture each and do not tie the layout to the pixels.
- Tauri's WebDriver support covers Linux and Windows only, since macOS has no
  WKWebView driver ([Tauri, WebDriver](https://v2.tauri.app/develop/tests/webdriver/)).
  That is one reason the plugin, and not WebDriver, is the Tauri host.

The hard parts stay open in the units that build this: a compositor animation
on Chromium at a ratio of 1, the change the library cannot see without the
page's word, and input on the two platforms arca cannot run.
