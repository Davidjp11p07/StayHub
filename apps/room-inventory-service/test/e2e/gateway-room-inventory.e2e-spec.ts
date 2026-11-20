import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const gatewayUrl = process.env.INVENTORY_E2E_GATEWAY_URL?.replace(/\/$/u, '');
const accessToken = process.env.INVENTORY_E2E_ACCESS_TOKEN;
const roomId = process.env.INVENTORY_E2E_ROOM_ID;
const describeE2E = gatewayUrl && accessToken && roomId ? describe : describe.skip;

interface InventoryItem { id: string; type: string; name: string; quantityAvailable: number; active: boolean }
interface Inventory { roomId: string; propertyId: string; version: number; items: InventoryItem[] }

/**
 * T077: real Gateway -> Inventory -> Accommodations + PostgreSQL flow.
 * Requires a disposable room owned by the token's user and a running Compose stack.
 */
describeE2E('Gateway -> Inventory -> Accommodations + PostgreSQL (T077)', () => {
  async function call(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<{ status: number; body: Inventory }> {
    const url = new URL(`${gatewayUrl}${path}`);
    const requester = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const request = requester(url, {
        method,
        rejectUnauthorized: false,
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
          ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }),
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          try { resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Inventory }); }
          catch (error) { reject(error instanceof Error ? error : new Error('invalid JSON response')); }
        });
      });
      request.on('error', reject);
      if (payload !== undefined) request.write(payload);
      request.end();
    });
  }

  const base = `/inventory/rooms/${roomId}`;

  it('runs GET empty/current, POST, PUT, idempotent replay and stale 409 through the Gateway', async () => {
    const initial = await call('GET', base);
    expect(initial.status).toBe(200);
    expect(initial.body.roomId).toBe(roomId);

    const created = await call('POST', `${base}/items`, {
      type: 'PRODUCT', name: `E2E ${randomUUID().slice(0, 8)}`, quantityAvailable: 3, active: true,
    });
    expect(created.status).toBe(201);
    expect(created.body.version).toBe(initial.body.version + 1);
    const item = created.body.items.find((candidate) => candidate.name.startsWith('E2E '));
    expect(item).toBeDefined();

    const replacement = {
      expectedVersion: created.body.version,
      items: [{ id: item!.id, type: 'SERVICE', name: 'E2E servicio', quantityAvailable: 1, active: true }],
    };
    const replaced = await call('PUT', base, replacement);
    expect(replaced.status).toBe(200);
    expect(replaced.body.version).toBe(created.body.version + 1);
    expect(replaced.body.items).toEqual([expect.objectContaining({ id: item!.id, type: 'SERVICE', name: 'E2E servicio', active: true })]);

    const replay = await call('PUT', base, replacement);
    expect(replay.status).toBe(200);
    expect(replay.body.version).toBe(replaced.body.version);

    const stale = await call('PUT', base, {
      expectedVersion: created.body.version,
      items: [{ id: item!.id, type: 'PRODUCT', name: 'E2E divergente', quantityAvailable: 9, active: false }],
    });
    expect(stale.status).toBe(409);

    const finalRead = await call('GET', base);
    expect(finalRead.status).toBe(200);
    expect(finalRead.body.version).toBe(replaced.body.version);
  }, 60_000);
});
