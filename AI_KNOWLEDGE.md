<!-- docs: sync from coderbuzz/codex@cd4a13b -->

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
  ├── manages pub/sub topics
  ├── correlates request-response
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

## WirePeer

`WirePeer` wraps the Velox WsPeer with additional methods:

- `peer.send(data)` — encode + send
- `peer.sendWait(payload, timeout?)` — encode + send + wait for correlated response
- `peer.subscribe(topic)` — join topic
- `peer.publish(topic, data)` — publish to topic
- `peer.broadcast(topic, data)` — publish to all in topic
- `peer.close(code?)` — close connection
- `peer.data` — typed data from upgrade/auth

---

## Gotchas

1. Requires `@coderbuzz/velox` and `@coderbuzz/velox-ws-wire` as peer dependencies.
2. `wireProtocol()` returns an `App` — always mount with `app.use()`, never standalone.
3. Auth can be pre-connect (via `upgrade` extracting from req) or post-connect (via `authenticate` callback).
4. `authenticate` is called when server receives an auth frame (`0xFD`). If it returns non-null, connection proceeds; if null, connection is closed.
5. Does NOT add HTTP routes — only WebSocket upgrade.
