import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';

const base = 'http://localhost:5173/api/v1';
const state = JSON.parse(await readFile('.artifacts/demo-properties-state.json', 'utf8'));
const directory = '.artifacts/demo-inventory';
const plans = [
  ['Leticia', 'PRODUCT', 'Mosquitera de demostración', 2],
  ['Medellín', 'SERVICE', 'Lavandería de demostración', 3],
  ['Arauca', 'PRODUCT', 'Toalla de demostración', 4],
  ['Barranquilla', 'PRODUCT', 'Almohada de demostración', 2],
  ['Cartagena', 'SERVICE', 'Limpieza de demostración', 1],
  ['Tunja', 'PRODUCT', 'Manta de demostración', 2],
  ['Manizales', 'PRODUCT', 'Cafetera de demostración', 1],
  ['Florencia', 'SERVICE', 'Desayuno de demostración', 2],
  ['Yopal', 'PRODUCT', 'Ventilador de demostración', 1],
  ['Popayán', 'SERVICE', 'Planchado de demostración', 3],
];
let token;
async function api(path, body) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { ...(token && { authorization: 'Bearer ' + token }), ...(body && { 'content-type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw Error(path + ': HTTP ' + response.status);
  return response.json();
}
token = (await api('/auth/login', { email: state.email, password: state.password })).accessToken;
await mkdir(directory, { recursive: true });
let added = 0;
for (const [city, type, name, quantityAvailable] of plans) {
  const property = await api('/properties/' + state.properties['CO-' + city].id);
  assert.equal(property.location.city, city);
  const rooms = property.rooms.filter(room => room.name === 'Habitación principal');
  assert.equal(rooms.length, 1);
  const roomId = rooms[0].id;
  const path = '/inventory/rooms/' + roomId;
  const file = directory + '/' + roomId + '.json';
  const before = await api(path);
  assert.equal(before.propertyId, property.id);
  let receipt;
  try { receipt = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let inventory = before;
  let item;
  if (receipt?.id) {
    item = before.items.find(row => row.id === receipt.id);
    assert.ok(item, city + ': falta el artículo registrado; revisar antes de recrearlo.');
  } else {
    const matches = before.items.filter(row => row.name === name && row.type === type);
    assert.ok(matches.length <= 1, city + ': coincidencia ambigua');
    item = matches[0];
    if (!item) {
      assert.ok(!receipt, city + ': hay un alta pendiente; comprobar antes de repetirla.');
      // Exclusive intent protects parallel runs and retries after an uncertain POST.
      await writeFile(file, JSON.stringify({ pending: true }), { flag: 'wx' });
      await api(path + '/items', { name, type, quantityAvailable, active: true });
      inventory = await api(path);
      const created = inventory.items.filter(row => row.name === name && row.type === type);
      assert.equal(created.length, 1);
      item = created[0];
      assert.equal(item.quantityAvailable, quantityAvailable);
      assert.equal(item.active, true);
      for (const previous of before.items) assert.deepEqual(inventory.items.find(row => row.id === previous.id), previous);
      added++;
    }
    const tmp = file + '.' + process.pid + '.tmp';
    await writeFile(tmp, JSON.stringify({ id: item.id }));
    await rename(tmp, file);
  }
  console.log(JSON.stringify({ city, roomId, version: inventory.version, items: inventory.items }));
}
console.log('Artículos añadidos: ' + added);
