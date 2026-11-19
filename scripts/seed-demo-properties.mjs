#!/usr/bin/env node
// Development-only seed. State is retained locally to avoid duplicate writes after retries.
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = 'http://localhost:5173/api/v1';
const statePath = resolve('.artifacts/demo-properties-state.json');
const photos = ['070021','070027','070033','070037','070041','070048','070418','070435','070447','070500'];
const places = [
  ['Leticia','Amazonas','CO'],['Medellín','Antioquia','CO'],['Arauca','Arauca','CO'],['Barranquilla','Atlántico','CO'],
  ['Cartagena','Bolívar','CO'],['Tunja','Boyacá','CO'],['Manizales','Caldas','CO'],['Florencia','Caquetá','CO'],
  ['Yopal','Casanare','CO'],['Popayán','Cauca','CO'],['Valledupar','Cesar','CO'],['Quibdó','Chocó','CO'],
  ['Montería','Córdoba','CO'],['Bogotá','Cundinamarca','CO'],['Inírida','Guainía','CO'],['San José del Guaviare','Guaviare','CO'],
  ['Neiva','Huila','CO'],['Riohacha','La Guajira','CO'],['Santa Marta','Magdalena','CO'],['Villavicencio','Meta','CO'],
  ['Pasto','Nariño','CO'],['Cúcuta','Norte de Santander','CO'],['Mocoa','Putumayo','CO'],['Armenia','Quindío','CO'],
  ['Pereira','Risaralda','CO'],['San Andrés','San Andrés y Providencia','CO'],['Bucaramanga','Santander','CO'],['Sincelejo','Sucre','CO'],
  ['Ibagué','Tolima','CO'],['Cali','Valle del Cauca','CO'],['Mitú','Vaupés','CO'],['Puerto Carreño','Vichada','CO'],
  ['Washington D. C.','Distrito de Columbia','US'],['Madrid','Madrid','ES'],['Roma','Lazio','IT'],['Berlín','Berlín','DE'],['Londres','Inglaterra','GB'],
];
// Approximate city-center coordinates, used solely as illustrative locations for fictitious properties.
const coordinates = [
  [-4.2153,-69.9406],[6.2442,-75.5812],[7.0847,-70.7591],[10.9685,-74.7813],
  [10.3910,-75.4794],[5.5353,-73.3678],[5.0703,-75.5138],[1.6144,-75.6062],
  [5.3378,-72.3959],[2.4448,-76.6147],[10.4631,-73.2532],[5.6947,-76.6611],
  [8.7479,-75.8814],[4.7110,-74.0721],[3.8653,-67.9239],[2.5729,-72.6459],
  [2.9273,-75.2819],[11.5444,-72.9072],[11.2408,-74.1990],[4.1420,-73.6266],
  [1.2136,-77.2811],[7.8939,-72.5078],[1.1498,-76.6467],[4.5339,-75.6811],
  [4.8087,-75.6906],[12.5847,-81.7006],[7.1193,-73.1227],[9.3047,-75.3978],
  [4.4389,-75.2322],[3.4516,-76.5320],[1.1983,-70.1733],[6.1890,-67.4859],
  [38.9072,-77.0369],[40.4168,-3.7038],[41.9028,12.4964],[52.5200,13.4050],[51.5074,-0.1278],
];
await mkdir(resolve('.artifacts'), { recursive: true });
let state;
try { state = JSON.parse(await readFile(statePath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; state = { email: `demo-owner-${randomUUID()}@stayhub.test`, password: `Demo-${randomUUID()}`, registerKey: randomUUID(), registered: false, properties: {} }; }
async function save() { const tmp = `${statePath}.tmp`; await writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 }); await rename(tmp, statePath); }
await save();
async function api(method, path, { token, json, form, headers = {} } = {}) {
  const init = { method, headers: { accept: 'application/json', ...headers } };
  if (token) init.headers.authorization = `Bearer ${token}`;
  if (json) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(json); }
  if (form) init.body = form;
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text(); let body; try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${body?.code || ''}`);
  return body;
}
if (!state.registered) {
  await api('POST', '/auth/register', { headers: { 'Idempotency-Key': state.registerKey }, json: { name: 'Anfitrión demostración', email: state.email, password: state.password, role: 'OWNER' } });
  state.registered = true; await save();
}
let token;
for (let i = 0; i < 20; i++) { try { token = (await api('POST', '/auth/login', { json: { email: state.email, password: state.password } })).accessToken; break; } catch { await new Promise(r => setTimeout(r, 500)); } }
if (!token) throw new Error('No se pudo iniciar sesión con el anfitrión de demostración.');
for (const [i, [city, region, country]] of places.entries()) {
  const [latitude, longitude] = coordinates[i];
  const key = `${country}-${city}`;
  const item = state.properties[key] ??= {};
  if (item.creating && !item.id) throw new Error(`Creación anterior incierta para ${key}; reconciliar antes de reintentar para evitar duplicados.`);
  if (!item.id) {
    item.creating = true; await save();
    const property = await api('POST', '/properties', { token, json: {
      type: 'APARTMENT', name: `StayHub demostración ${city}`,
      description: `Alojamiento ficticio de demostración en ${city}. Las fotografías son ilustrativas y no identifican un inmueble real. El mapa muestra una ubicación aproximada de la ciudad.`,
      location: { addressLine: 'Dirección ficticia de demostración', city, region, country, latitude, longitude },
      featureCodes: i % 3 === 0 ? ['WIFI','PARKING','POOL'] : ['WIFI','PARKING'],
      rooms: [{ name: 'Habitación principal', capacity: 2 + (i % 3), basePrice: { amount: country === 'CO' ? `${120000 + i * 3000}.00` : '120.00', currency: country === 'CO' ? 'COP' : country === 'US' ? 'USD' : country === 'GB' ? 'GBP' : 'EUR' } }],
    } });
    item.id = property.id; delete item.creating; await save();
  }
  let current = await api('GET', `/properties/${item.id}`, { token });
  if (!current.photos.length) {
    if (item.uploading) throw new Error(`Carga de foto incierta para ${key}; revisar antes de reintentar.`);
    item.uploading = true; await save();
    const bytes = await readFile(resolve(`assets/demo-photos/${photos[i % photos.length]}.png`));
    const form = new FormData(); form.append('file', new Blob([bytes], { type: 'image/png' }), 'demo.png');
    await api('POST', `/properties/${item.id}/photos`, { token, form });
    delete item.uploading; await save();
    current = await api('GET', `/properties/${item.id}`, { token });
  } else if (item.uploading) { delete item.uploading; await save(); }
  const needsCoordinates = current.location.latitude == null && current.location.longitude == null;
  const description = needsCoordinates ? `${current.description} El mapa muestra una ubicación aproximada de la ciudad.` : current.description;
  if (current.status !== 'PUBLISHED' || needsCoordinates) {
    const location = needsCoordinates ? { ...current.location, latitude, longitude } : current.location;
    await api('PUT', `/properties/${item.id}`, { token, json: { type: current.type, name: current.name, description, location, featureCodes: current.features.map(f => f.code), status: 'PUBLISHED', version: current.version, rooms: current.rooms.map(r => ({ id: r.id, name: r.name, capacity: r.capacity, basePrice: r.basePrice })) } });
  }
  console.log(`${i + 1}/${places.length} ${city}: ${item.id}`);
}
console.log('Propiedades de demostración procesadas:', places.length);
