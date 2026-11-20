import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/**
 * Closed stub of the provider contract accommodations-inventory-context.openapi.yaml.
 * STUB ONLY: it proves the consumer side; it is not evidence of a real Accommodations integration (T025-T027).
 */
export interface RoomContextBody {
  roomId: string;
  propertyId: string;
  ownerId: string;
  propertyStatus: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
  roomExists: true;
}

export type StubBehaviour =
  | { kind: 'ok'; body: RoomContextBody }
  | { kind: 'status'; status: 400 | 401 | 403 | 404 | 500 | 503 }
  | { kind: 'raw'; status: number; body: string }
  | { kind: 'slow'; delayMs: number; body: RoomContextBody };

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly authorization: string | undefined;
  readonly requestId: string | undefined;
}

export interface AccommodationsStub {
  readonly url: string;
  readonly requests: RecordedRequest[];
  /** Registers a room owned by `ownerId` and returns its context. */
  addRoom(ownerId: string, overrides?: Partial<RoomContextBody>): RoomContextBody;
  setBehaviour(roomId: string, behaviour: StubBehaviour): void;
  /** Applies to every room (e.g. simulate an outage); `null` restores per-room behaviour. */
  setGlobal(behaviour: StubBehaviour | null): void;
  close(): Promise<void>;
}

const PATH = /^\/internal\/v1\/rooms\/([^/]+)\/inventory-context$/u;

function problem(response: ServerResponse, status: number): void {
  response.writeHead(status, { 'content-type': 'application/problem+json' });
  response.end(JSON.stringify({ type: 'about:blank', title: 'error', status, code: `HTTP_${status}`, traceId: 'stub' }));
}

function respond(response: ServerResponse, behaviour: StubBehaviour): void {
  if (behaviour.kind === 'ok') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(behaviour.body));
  } else if (behaviour.kind === 'status') {
    problem(response, behaviour.status);
  } else if (behaviour.kind === 'raw') {
    response.writeHead(behaviour.status, { 'content-type': 'application/json' });
    response.end(behaviour.body);
  } else {
    setTimeout(() => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(behaviour.body));
    }, behaviour.delayMs);
  }
}

export async function startAccommodationsStub(): Promise<AccommodationsStub> {
  const rooms = new Map<string, StubBehaviour>();
  const requests: RecordedRequest[] = [];
  let global: StubBehaviour | null = null;
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const path = request.url ?? '';
    requests.push({
      method: request.method ?? '', path,
      authorization: request.headers.authorization,
      requestId: typeof request.headers['x-request-id'] === 'string' ? request.headers['x-request-id'] : undefined,
    });
    const match = PATH.exec(path);
    if (request.method !== 'GET' || !match) return problem(response, 404);
    if (!request.headers.authorization?.startsWith('Bearer ')) return problem(response, 401);
    const behaviour = global ?? rooms.get(decodeURIComponent(match[1] ?? ''));
    // Missing and hidden rooms are indistinguishable for the consumer.
    return behaviour ? respond(response, behaviour) : problem(response, 404);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('stub did not start');
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    addRoom(ownerId, overrides = {}) {
      const body: RoomContextBody = { roomId: randomUUID(), propertyId: randomUUID(), ownerId, propertyStatus: 'PUBLISHED', roomExists: true, ...overrides };
      rooms.set(body.roomId, { kind: 'ok', body });
      return body;
    },
    setBehaviour(roomId, behaviour) { rooms.set(roomId, behaviour); },
    setGlobal(behaviour) { global = behaviour; },
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
