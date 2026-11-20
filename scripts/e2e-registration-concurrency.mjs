import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.STAYHUB_API_URL || 'https://127.0.0.1:18080/api/v1';
const guest = () => ({ name: 'Registro concurrente', role: 'GUEST',
  email: `registro-${randomUUID()}@stayhub.test`, password: `Test-${randomUUID()}` });
async function register(input, key) {
  const response = await fetch(`${base}/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify(input),
  });
  return { status: response.status, data: await response.json() };
}
const input = guest();
const key = randomUUID();
const pair = await Promise.all([register(input, key), register(input, key)]);
const replay = await register(input, key);
for (const result of [...pair, replay]) {
  assert.equal(result.status, 201);
  assert.ok(result.data.id);
  assert.equal(result.data.id, pair[0].data.id);
}
assert.equal((await register({ ...input, name: 'Solicitud distinta' }, key)).status, 409);
const separate = await Promise.all([register(guest(), randomUUID()), register(guest(), randomUUID())]);
assert.deepEqual(separate.map(result => result.status), [201, 201]);
assert.notEqual(separate[0].data.id, separate[1].data.id);
console.log('Misma clave: 201/201 y repetición con el mismo ID. Cambio de contenido: 409. Dos altas independientes: 201/201.');
