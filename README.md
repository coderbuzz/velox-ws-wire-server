<!-- docs: sync from coderbuzz/codex@e9b6bce -->

# Velox Wire Server &mdash; `@coderbuzz/velox-ws-wire-server`

> **Server-side Wire Protocol handler for `@coderbuzz/velox`.** Mount binary WebSocket handling on any route.
> AI agents: see [AI_KNOWLEDGE.md](https://github.com/coderbuzz/velox-ws-wire-server/blob/main/AI_KNOWLEDGE.md) for expert context.
<p align="center">
  <a href="https://www.npmjs.com/package/@coderbuzz/velox-ws-wire-server"><img src="https://img.shields.io/npm/v/@coderbuzz/velox-ws-wire-server.svg?style=flat-square" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@coderbuzz/velox-ws-wire-server"><img src="https://img.shields.io/npm/dm/@coderbuzz/velox-ws-wire-server.svg?style=flat-square" alt="npm downloads" /></a>
  <a href="https://github.com/coderbuzz/velox-ws-wire-server/blob/main/LICENSE"><img src="https://img.shields.io/github/license/coderbuzz/velox-ws-wire-server.svg?style=flat-square" alt="MIT License" /></a>
  <a href="https://github.com/coderbuzz/velox-ws-wire-server"><img src="https://img.shields.io/github/stars/coderbuzz/velox-ws-wire-server.svg?style=flat-square" alt="GitHub Stars" /></a>
  <a href="https://github.com/coderbuzz/velox-ws-wire-server/actions/workflows/ci.yml"><img src="https://github.com/coderbuzz/velox-ws-wire-server/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://codecov.io/gh/coderbuzz/velox-ws-wire-server"><img src="https://codecov.io/gh/coderbuzz/velox-ws-wire-server/graph/badge.svg" alt="Codecov" /></a>
</p>

Wire Server provides `wireProtocol()` — a Velox middleware that handles the binary WebSocket Wire Protocol transparently. Authentication, heartbeat, pub/sub, request-response correlation are all managed internally. Your handler receives only domain messages.

---

**Client counterpart** — use with `@coderbuzz/velox-ws-wire-client` for end-to-end binary WebSocket communication, or any client implementing the Wire Protocol via `@coderbuzz/velox-ws-wire`.

---

## Features

- **Binary protocol** — automatic encode/decode of Wire frames
- **Auth** — token-based authentication with upgrade or post-connect
- **Heartbeat** — automatic ping/pong handling
- **Pub/Sub** — topic management via `peer.subscribe()`, `peer.publish()`, `peer.broadcast()`
- **Request-response** — correlation ID matching
- **Velox integration** — mounts as a standard `app.use()` middleware

---

## Installation

```sh
npm install @coderbuzz/velox @coderbuzz/velox-ws-wire @coderbuzz/velox-ws-wire-server
```

Both `@coderbuzz/velox` and `@coderbuzz/velox-ws-wire` are required as peer dependencies.

---

## Quick Start

```ts
import { AppServer } from "@coderbuzz/velox";
import { wireProtocol } from "@coderbuzz/velox-ws-wire-server";

const app = new AppServer({ port: 3000 });

app.use("/ws", wireProtocol({
  open(peer) { console.log("connected"); },
  message(peer, msg) { peer.send(`echo: ${msg}`); },
  close(peer, code, reason) { console.log("disconnected"); },
}));

await app.run();
```

### With Authentication

```ts
app.use("/ws", wireProtocol<{ userId: string }>({
  authenticate: async (token) => {
    const user = await verifyJwt(token, "secret");
    return user ? { userId: String(user.sub) } : null;
  },
  open(peer) { console.log("authed:", peer.data.userId); },
}));
```

---

## API

### `wireProtocol(handler, options?): App`

Returns a Velox `App` instance. Mount with `app.use()`.

Handler callbacks:

| Callback | Signature | Description |
|---|---|---|
| `upgrade` | `(req) => DataType \| null \| Promise<...>` | Extract data from upgrade request |
| `open` | `(peer) => void` | Connection opened (after auth if configured) |
| `message` | `(peer, data) => void` | Domain message received |
| `close` | `(peer, code, reason) => void` | Connection closed |
| `ping` / `pong` | `(peer) => void` | Heartbeat events |
| `error` | `(peer, error) => void` | Error occurred |
| `authenticate` | `(token) => DataType \| null` | Post-connect auth |

Options (passed through to Velox WebSocket):

| Option | Type | Default | Description |
|---|---|---|---|
| `maxPayloadLength` | `number` | `16777216` | Max message size (bytes) |
| `pingInterval` | `number` | `30_000` | Ping interval ms |
| `pongTimeout` | `number` | `5_000` | Wait for pong ms |
| `idleTimeout` | `number` | `120` | Idle disconnect seconds |
| `perMessageDeflate` | `boolean` | `false` | Enable compression |
| `tokenParam` | `string` | `'token'` | Query param name |

### Peer Methods

| Method | Description |
|---|---|
| `peer.send(data)` | Send message |
| `peer.sendWait(payload, timeout?)` | Send + wait for response |
| `peer.subscribe(topic)` | Join topic |
| `peer.publish(topic, data)` | Publish to topic |
| `peer.broadcast(topic, data)` | Publish to all in topic |
| `peer.close(code?)` | Close connection |

---

## License

MIT &copy; 2026 Indra Gunawan
