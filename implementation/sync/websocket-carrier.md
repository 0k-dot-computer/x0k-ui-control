# The operation wire over a WebSocket

```turtle folio:document
implementation:sync\/websocket-carrier a x0k:Implementation ;
    x0k:status "draft" ;
    x0k:summary "A WebSocket as the byte stream an operation-wire session runs on, either side dialling, so a page in a browser speaks the same canonical CBOR frames as a process on a unix socket." ;
    x0k:concerns "operation-wire", "protocol", "websocket" ;
    x0k:cites implementation:sync\/operation-session,
        implementation:ui-control\/websocket ;
    folio:tangleCrate "crates/x0k-operation-session" ;
    folio:tangleRoot "src/websocket.rs" .
```

The operation wire's session runs on any byte stream
(`x0k:implementation/sync/operation-session`). KERNEL names its carriers: a
conveyed unix socket, a fleet stream, or a WebSocket, with the frames the same
on each. This is the WebSocket. A browser cannot open a unix socket, so a page
that calls an operation, or subscribes to one, does it over this.

Each write is one binary message, and a read takes bytes from whichever
messages have come. A frame may span messages or share one, because a frame's
length prefix says where it ends, not the WebSocket. That keeps the frames the
same on every carrier, and a client in another language only has to do the
same.

Who dials and who answers are separate questions. `accept_websocket` and
`dial_websocket` decide who dialled and give the same stream either way.
`serve` on it makes this end the callee, and `Session::open` on it makes this
end the caller. An end that makes its own handshake, to read a request's
headers or refuse it, wraps the WebSocket it opened with `WebSocketBytes::new`. The UI-control endpoint takes its WebSocket from here
(`x0k:implementation/ui-control/websocket`).

It sits behind x0k-operation-session's `websocket` feature, so a consumer on a unix
socket does not pull a WebSocket stack through this crate.

<a name="chunk-websocket"></a><sub>[`src/websocket.rs`](../../crates/x0k-operation-session/src/websocket.rs) · `#websocket`</sub>

```rust {#websocket file="src/websocket.rs"}
//! The operation wire's frames over a WebSocket
//! (`corpora/x0k/implementation/sync/websocket-carrier.md`).

use std::io;
use std::pin::Pin;
use std::task::{ready, Context, Poll};

use futures::{Sink, Stream};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::net::{TcpListener, TcpStream, ToSocketAddrs};
use tokio_tungstenite::tungstenite::{Error as WebSocketError, Message};
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

/// A WebSocket as the byte stream a session runs on.
pub struct WebSocketBytes<S> {
    socket: WebSocketStream<S>,
    /// A message's bytes not yet read.
    unread: Vec<u8>,
    at: usize,
}

impl<S> WebSocketBytes<S> {
    /// The byte stream over a WebSocket already open: for an end that makes
    /// its own handshake, to read the request's headers or refuse it.
    pub fn new(socket: WebSocketStream<S>) -> Self {
        WebSocketBytes { socket, unread: Vec::new(), at: 0 }
    }
}

/// The WebSocket a dial to `url` opens.
pub async fn dial_websocket(url: &str) -> Result<WebSocketBytes<MaybeTlsStream<TcpStream>>, WebSocketError> {
    let (socket, _) = tokio_tungstenite::connect_async(url).await?;
    Ok(WebSocketBytes::new(socket))
}

/// The WebSocket the next dial to `listener` opens.
pub async fn accept_websocket(listener: &TcpListener) -> Result<WebSocketBytes<TcpStream>, WebSocketError> {
    let (stream, _) = listener.accept().await.map_err(WebSocketError::Io)?;
    Ok(WebSocketBytes::new(tokio_tungstenite::accept_async(stream).await?))
}

/// A listener for WebSockets at `address`.
pub async fn websocket_listener(address: impl ToSocketAddrs) -> io::Result<TcpListener> {
    TcpListener::bind(address).await
}

fn io_error(error: WebSocketError) -> io::Error {
    match error {
        WebSocketError::Io(error) => error,
        other => io::Error::other(other),
    }
}

impl<S: AsyncRead + AsyncWrite + Unpin> AsyncRead for WebSocketBytes<S> {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        loop {
            if this.at < this.unread.len() {
                let taken = (this.unread.len() - this.at).min(buf.remaining());
                buf.put_slice(&this.unread[this.at..this.at + taken]);
                this.at += taken;
                return Poll::Ready(Ok(()));
            }
            match ready!(Pin::new(&mut this.socket).poll_next(cx)) {
                Some(Ok(Message::Binary(bytes))) => {
                    this.unread = bytes.into();
                    this.at = 0;
                }
                Some(Ok(Message::Close(_))) | None => return Poll::Ready(Ok(())),
                // Pings are answered inside the socket; nothing else carries frames.
                Some(Ok(_)) => {}
                Some(Err(error)) => return Poll::Ready(Err(io_error(error))),
            }
        }
    }
}

impl<S: AsyncRead + AsyncWrite + Unpin> AsyncWrite for WebSocketBytes<S> {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        bytes: &[u8],
    ) -> Poll<io::Result<usize>> {
        let this = self.get_mut();
        ready!(Pin::new(&mut this.socket).poll_ready(cx)).map_err(io_error)?;
        Pin::new(&mut this.socket).start_send(Message::binary(bytes.to_vec())).map_err(io_error)?;
        Poll::Ready(Ok(bytes.len()))
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.get_mut().socket).poll_flush(cx).map_err(io_error)
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.get_mut().socket).poll_close(cx).map_err(io_error)
    }
}
```

## Holding it to the claim

The claim is that the carrier changes nothing. So the tests open a session on
a loopback WebSocket with the caller dialling and with the callee dialling, and
call through it. The third test sends a frame larger than any one read, so it
has to cross the carrier's messages whole.

<a name="chunk-websocket-test"></a><sub>[`tests/websocket.rs`](../../crates/x0k-operation-session/tests/websocket.rs) · `#websocket-test`</sub>

```rust {#websocket-test file="tests/websocket.rs"}
//! The operation wire over a WebSocket, whichever end dialled.

#![cfg(feature = "websocket")]

use std::collections::BTreeMap;
use std::sync::Arc;

use x0k_datum::shape::{DeclaredShapes, Pinner, Unpinnable};
use x0k_datum::Datum;
use x0k_operation_wire::EffectCeiling;
use x0k_operation_session::session::{serve, Answer, Ask, Callee, Heard, Session, SessionPolicy, Shapes};
use x0k_operation_session::websocket::{accept_websocket, dial_websocket, websocket_listener};

/// A callee that answers each call with its argument.
struct Echo;

impl Callee for Echo {
    async fn call(&self, heard: Heard) -> Answer {
        Answer::Reply(heard.argument)
    }
}

/// Pins a shape to its canonical CBOR in hex.
struct Spelled;

impl Pinner for Spelled {
    fn pin(&self, value: &Datum) -> Result<String, Unpinnable> {
        Ok(value.to_cbor().iter().map(|byte| format!("{byte:02x}")).collect())
    }
}

fn shapes() -> Shapes {
    Shapes::new(BTreeMap::from([("echo".to_string(), DeclaredShapes::default())]), Arc::new(Spelled)).unwrap()
}

fn echo(id: &str, argument: Datum) -> Ask {
    Ask::new(id, "echo", EffectCeiling::ReadOnly, argument)
}

#[tokio::test]
async fn a_session_answers_over_a_websocket_its_caller_dialled() {
    let listening = websocket_listener("127.0.0.1:0").await.expect("a port");
    let url = format!("ws://{}", listening.local_addr().expect("an address"));
    tokio::spawn(async move {
        let carrier = accept_websocket(&listening).await.expect("the callee accepts");
        serve(carrier, Arc::new(Echo), SessionPolicy::DEFAULT, Arc::new(shapes()), None).await
    });
    let carrier = dial_websocket(&url).await.expect("the caller dials");
    let (session, _) = Session::open(carrier, SessionPolicy::DEFAULT, &shapes()).await.expect("a session");
    let hello = Datum::Text("hello".to_string());
    assert_eq!(session.call(echo("1", hello.clone())).await.expect("an answer"), hello);
}

#[tokio::test]
async fn a_session_answers_over_a_websocket_its_callee_dialled() {
    let listening = websocket_listener("127.0.0.1:0").await.expect("a port");
    let url = format!("ws://{}", listening.local_addr().expect("an address"));
    tokio::spawn(async move {
        let carrier = dial_websocket(&url).await.expect("the callee dials");
        serve(carrier, Arc::new(Echo), SessionPolicy::DEFAULT, Arc::new(shapes()), None).await
    });
    let carrier = accept_websocket(&listening).await.expect("the caller accepts");
    let (session, _) = Session::open(carrier, SessionPolicy::DEFAULT, &shapes()).await.expect("a session");
    let calls: Vec<_> = (0..8).map(|n| session.call(echo(&n.to_string(), Datum::Text(n.to_string())))).collect();
    let answers = futures::future::join_all(calls).await;
    let answered: Vec<Datum> = answers.into_iter().map(|answer| answer.expect("an answer")).collect();
    assert_eq!(answered, (0..8).map(|n| Datum::Text(n.to_string())).collect::<Vec<_>>(), "calls in flight together");
}

#[tokio::test]
async fn a_frame_larger_than_a_read_crosses_whole() {
    let listening = websocket_listener("127.0.0.1:0").await.expect("a port");
    let url = format!("ws://{}", listening.local_addr().expect("an address"));
    tokio::spawn(async move {
        let carrier = accept_websocket(&listening).await.expect("the callee accepts");
        serve(carrier, Arc::new(Echo), SessionPolicy::DEFAULT, Arc::new(shapes()), None).await
    });
    let (session, _) = Session::open(dial_websocket(&url).await.expect("the caller dials"), SessionPolicy::DEFAULT, &shapes())
        .await.expect("a session");
    let large = Datum::Bytes((0..3u32 << 20).map(|n| (n % 251) as u8).collect());
    assert_eq!(session.call(echo("1", large.clone())).await.expect("an answer"), large);
}
```
