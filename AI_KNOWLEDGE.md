<!-- docs: sync from coderbuzz/codex@b1e2bde -->

# Velox Wire Server — AI Agent Knowledge File

**Package:** `@coderbuzz/velox-ws-wire-server`
**Purpose:** Server-side Wire Protocol handler for `@coderbuzz/velox`. Mount as middleware.
**Distribution:** ESM only (`dist/index.js` + `dist/index.d.ts`).

---

## Mental Model

Thin server-side handler that wraps Velox WebSocket with binary Wire Protocol encoding/decoding. Mount via `app.use("/path", wireProtocol({...}))`.

```
wireProtocol(handler)
  ├── handles auth (upgrade data or post-connect token)
  ├── auto-encodes outgoing, decodes incoming
  ├── manages pub/sub topics (peer.subscribe/publish/broadcast)
  ├── correlates request-response (peer.sendWait)
  ├── handles heartbeat (auto PING/PONG)
  └── forwards domain messages to your handler
```

---

## Import Map

```ts
import { wireProtocol } from "@coderbuzz/velox-ws-wire-server";
import type { WirePeer, WireHandler } from "@coderbuzz/velox-ws-wire-server";
```

---

## Handler Type

```ts
type WireHandler<T = unknown> = {
  upgrade?: (req: Request) => T | null | Promise<T | null>;
  open?: (peer: WirePeer<T>) => void;
  message?: (peer: WirePeer<T>, data: unknown) => void;
  close?: (peer: WirePeer<T>, code: number, reason: string) => void;
  ping?: (peer: WirePeer<T>) => void;
  pong?: (peer: WirePeer<T>) => void;
  error?: (peer: WirePeer<T>, error: Error) => void;
  authenticate?: (token: string) => T | null | Promise<T | null>;
};
```

---

## wireProtocol(handler, options?): App

Returns a Velox `App` instance. Always mount with `app.use()`, never standalone.

```ts
import { AppServer } from "@coderbuzz/velox";
import { wireProtocol } from "@coderbuzz/velox-ws-wire-server";

const app = new AppServer({ port: 3000 });

app.use("/ws", wireProtocol({
  message(peer, msg) {
    peer.send(`echo: ${msg}`);
  },
}));

await app.run();
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `maxPayloadLength` | `number` | `16777216` | Max message size (bytes, 16 MB) |
| `pingInterval` | `number` | `30_000` | Ping interval ms |
| `pongTimeout` | `number` | `5_000` | Wait for pong response ms |
| `idleTimeout` | `number` | `120` | Idle disconnect seconds |
| `perMessageDeflate` | `boolean` | `false` | Enable per-message compression |
| `tokenParam` | `string` | `'token'` | Query param name for token auth |

### Handler Callbacks

| Callback | Signature | When |
|---|---|---|
| `upgrade` | `(req: Request) => T \| null` | During WebSocket upgrade — extract data from request headers/query |
| `authenticate` | `(token: string) => T \| null` | When client sends AUTH frame — validate token, return data or null |
| `open` | `(peer: WirePeer<T>) => void` | After connection established (and auth if configured) |
| `message` | `(peer: WirePeer<T>, data: unknown) => void` | When client sends a MESSAGE frame |
| `close` | `(peer: WirePeer<T>, code: number, reason: string) => void` | On connection close |
| `ping` | `(peer: WirePeer<T>) => void` | When server receives PING frame |
| `pong` | `(peer: WirePeer<T>) => void` | When server receives PONG frame |
| `error` | `(peer: WirePeer<T>, error: Error) => void` | On error |

---

## WirePeer

`WirePeer` wraps the Velox `WsPeer` with additional Wire Protocol methods:

| Method | Description |
|---|---|
| `peer.send(data)` | Encode + send domain message as MESSAGE frame |
| `peer.sendWait(payload, timeout?)` | Send REQUEST frame + wait for correlated RESPONSE from client |
| `peer.subscribe(topic)` | Join pub/sub topic |
| `peer.publish(topic, data)` | Publish to topic (excludes sender) |
| `peer.broadcast(topic, data)` | Publish to all peers in topic (includes sender) |
| `peer.close(code?)` | Close WebSocket connection |
| `peer.data` | Typed data from `upgrade` or `authenticate` callback |

```ts
app.use("/ws", wireProtocol<{ userId: string }>({
  authenticate: async (token) => {
    const user = await db.verifySession(token);
    if (!user) return null;                    // auth failed → close connection
    return { userId: user.id };                // stored in peer.data
  },
  open(peer) {
    console.log("User connected:", peer.data.userId);
  },
  message(peer, msg) {
    // peer.data.userId available here
  },
}));
```

---

## Auth Flow

### Mode 1: `upgrade` (pre-connect)

Server extracts token from query parameter `?token=` during WebSocket upgrade. Data returned becomes `peer.data`.

```ts
const wss = wireProtocol<{ sessionId: string }>({
  upgrade(req) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return null;              // null = 401 reject
    const session = db.validateSession(token);
    if (!session) return null;
    return { sessionId: session.id };     // peer.data
  },
  open(peer) {
    console.log("Authed:", peer.data.sessionId);
  },
});
```

**Flow:** Client connects to `ws://host/ws?token=xxx` → server validates on upgrade → connection opened with `peer.data`.

### Mode 2: `authenticate` (post-connect)

Client connects without token. First message must be AUTH frame with token. Handler validates.

```ts
const wss = wireProtocol<{ userId: string }>({
  authenticate: async (token) => {
    const user = await db.verifyToken(token);
    if (!user) return null;               // auth failed → connection closed
    return { userId: user.id };           // peer.data
  },
});
```

**Flow:** Client connects → receives binary frames → AUTH frame (0x09) triggers `authenticate` → connection proceeds or closes.

### Both modes combined:

```ts
const wss = wireProtocol<{ userId: string }>({
  upgrade(req) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    return token ? db.validateToken(token) : null;
  },
  authenticate: async (token) => {
    const user = await db.verifyToken(token);
    return user ? { userId: user.id } : null;
  },
});
```

Upgrade auth takes priority: if `upgrade` returns data, `authenticate` is never called. If `upgrade` returns null, server waits for post-connect AUTH frame.

---

## Pub/Sub Internals

The server uses Velox's built-in pub/sub system. Wire topic names map directly to Velox topics.

**subscribe:**
```
Client sends SUBSCRIBE frame (topic: "chat")
  → server calls peer.subscribe("chat")
  → Velox adds peer to "chat" topic set
```

**publish:**
```
Client sends PUBLISH frame (topic: "chat", payload)
  → server calls peer.publish("chat", decodedPayload)
  → Velox sends to all peers in "chat" topic EXCEPT sender
```

**broadcast:**
```
Handler calls peer.broadcast("chat", data)
  → sends to ALL peers in "chat" topic INCLUDING sender
```

**message:**
```
Client sends MESSAGE frame (topic: "chat", payload)
  → server fires handler.message(peer, decodedPayload)
  → handler decides what to do (echo, publish, broadcast, etc.)
```

**Unsubscribe:**
```
Client sends UNSUBSCRIBE frame (topic: "chat")
  → server calls peer.unsubscribe("chat")
  → Velox removes peer from "chat" topic set
```

All pub/sub is cleaned up on connection close via Velox.

---

## Request-Response Correlation

Server-side `peer.sendWait(payload, timeout?)`:

1. Encodes payload as REQUEST frame with auto-generated corrId
2. Stores `{ resolve, reject, timer }` in pending map
3. Sends frame to client
4. Waits for RESPONSE frame with matching corrId
5. On match: clears timer, resolves with decoded payload
6. On timeout: rejects, removes from pending map

Client must respond with RESPONSE frame echoing the same corrId.

---

## Wire Frame Processing

Incoming binary frames are decoded and dispatched:

| Frame | Server Action |
|---|---|
| PING (0x01) | Fire `handler.ping(peer)`, auto-send PONG |
| PONG (0x02) | Fire `handler.pong(peer)`, reset pong timer |
| REQUEST (0x03) | Match corrId in pending map → resolve pending `sendWait` |
| RESPONSE (0x04) | Match corrId in pending map → resolve pending `sendWait` |
| SUBSCRIBE (0x05) | `peer.subscribe(topic)` |
| UNSUBSCRIBE (0x06) | `peer.unsubscribe(topic)` |
| PUBLISH (0x07) | `peer.publish(topic, payload)` |
| MESSAGE (0x08) | Fire `handler.message(peer, payload)` |
| AUTH (0x09) | Fire `handler.authenticate(token)` → set `peer.data` on success |
| AUTH_OK (0x0A) | Internal (client responding to server's auth) |
| AUTH_FAIL (0x0B) | Internal |
| Unknown | Silently ignored |

---

## Gotchas

1. Requires `@coderbuzz/velox` and `@coderbuzz/velox-ws-wire` as peer dependencies.
2. `wireProtocol()` returns an `App` — always mount with `app.use()`, never standalone.
3. Auth can be pre-connect (via `upgrade` extracting from req) or post-connect (via `authenticate` callback). If `upgrade` returns data, `authenticate` is skipped.
4. `authenticate` is called when server receives an AUTH frame (0x09). If it returns non-null, connection proceeds; if null, connection is closed.
5. Does NOT add HTTP routes — only WebSocket upgrade. Additional HTTP routes must be added separately.
6. `peer.publish(topic, data)` excludes the sender. Use `peer.broadcast(topic, data)` to include sender.
7. Payload serialization (JSON.stringify/parse) is caller's responsibility — the server only passes binary payloads to Wire codec.
8. Server auto-responds to PING with PONG. Handler `ping`/`pong` callbacks are for monitoring, not for manual response.
