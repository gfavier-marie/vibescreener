// Relais : une « room » par appairage (Durable Object). Il retransmet les messages
// binaires aux autres participants sans pouvoir les lire (chiffrés de bout en bout).
// Il garde aussi les projets partagés par lien (R2) : des objets chiffrés, dont la clé reste dans le lien.

import { DurableObject } from 'cloudflare:workers';
import { MAX_MESSAGE_BYTES } from '@pastille/shared/protocol';
import { SHARE_ID, SHARE_NAME } from '@pastille/shared/share';
import { share } from './share.ts';

const MAX_PEERS = 4;

type Env = { ROOM: DurableObjectNamespace<Room>; ASSETS: Fetcher; SHARES: R2Bucket };

export class Room extends DurableObject<Env> {
  override async fetch(): Promise<Response> {
    if (this.ctx.getWebSockets().length >= MAX_PEERS) return new Response('Room pleine', { status: 429 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server!);
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    if (typeof message === 'string' || message.byteLength > MAX_MESSAGE_BYTES) return;
    for (const peer of this.ctx.getWebSockets()) if (peer !== ws) peer.send(message);
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code, reason);
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const room = path.match(/^\/ws\/([A-Za-z0-9_-]{16,64})$/)?.[1];
    if (room && request.headers.get('Upgrade') === 'websocket') {
      return env.ROOM.get(env.ROOM.idFromName(room)).fetch(request);
    }
    const [, id, name] = path.match(/^\/share\/([^/]+)(?:\/([^/]+))?$/) ?? [];
    if (id) {
      if (!SHARE_ID.test(id) || (name !== undefined && !SHARE_NAME.test(name))) return new Response(null, { status: 404 });
      return share(request, env.SHARES, id, name);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
