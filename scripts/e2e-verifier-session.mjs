import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = 'https://127.0.0.1:18080/api/v1';
const credentials = { email: `verifier-${randomUUID()}@stayhub.test`, password: `Test-${randomUUID()}` };
async function post(path, body, headers = {}) {
  return fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}
async function register(role) {
  return post('/auth/register', { name: 'Verificación sintética', ...credentials, role }, { 'idempotency-key': randomUUID() });
}

assert.equal((await register('VERIFIER')).status, 400);
const registered = await register('GUEST');
assert.equal(registered.status, 201);
const { id } = await registered.json();
assert.match(id, /^[0-9a-f-]{36}$/i);
const assignment = readFileSync(new URL('./assign-property-verifier.sql', import.meta.url));
for (let attempt = 0; attempt < 2; attempt++) {
  execFileSync('docker', ['exec', '-i', 'stayhub-integracion-local-users-db-1', 'psql', '-X', '-U', 'users',
    '-d', 'users_db', '-v', `user_id=${id}`], { input: assignment });
}
const login = await post('/auth/login', credentials);
assert.equal(login.status, 200);
const { accessToken, user } = await login.json();
assert.equal(user.role, 'VERIFIER');
const headers = { authorization: `Bearer ${accessToken}` };
const profile = await fetch(`${base}/users/${id}/profile`, { headers });
assert.equal(profile.status, 200);
assert.equal((await profile.json()).role, 'VERIFIER');
const report = await fetch(`${base}/reports/owner/${id}`, { headers });
assert.equal(report.status, 403);
console.log('Registro VERIFIER 400, asignación repetida, login VERIFIER 200, perfil propio 200, reporte restringido 403.');
