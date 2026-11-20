import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const base = 'http://localhost:5173/api/v1';
async function get(path) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path);
  return response.json();
}
async function snapshot() {
  const { properties } = JSON.parse(await readFile('.artifacts/demo-properties-state.json', 'utf8'));
  const ids = Object.values(properties).map(item => item.id);
  assert.equal(ids.length, 37);
  assert.equal(new Set(ids).size, 37);
  const listings = [];
  for (let page = 1; ; page++) {
    const result = await get('/search?q=StayHub%20demostraci%C3%B3n&pageSize=100&page=' + page);
    listings.push(...result.items.filter(item => item.name.startsWith('StayHub demostración ')));
    if (!result.hasNext) break;
  }
  assert.deepEqual(listings.map(item => item.accommodationId).sort(), ids.sort());
  const records = [];
  for (const [key, { id }] of Object.entries(properties)) {
    const property = await get('/properties/' + id);
    const listing = listings.find(item => item.accommodationId === id);
    assert.equal(property.status, 'PUBLISHED');
    assert.equal(property.location.country + '-' + property.location.city, key);
    assert.equal(property.name, listing.name);
    assert.ok(property.photos.length && listing.primaryPhotoUrl);
    const photos = [];
    for (const photo of property.photos) {
      const response = await fetch(base + '/properties/' + id + '/photos/' + photo.id);
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      photos.push([photo.id, createHash('sha256').update(bytes).digest('hex')]);
    }
    records.push({ key, id, version: property.version, location: property.location, photos, cover: listing.primaryPhotoUrl });
  }
  return records;
}
const before = await snapshot();
execFileSync(process.execPath, ['scripts/seed-demo-properties.mjs'], { stdio: 'inherit' });
assert.deepEqual(await snapshot(), before);
console.log('37 demos publicadas en Search: IDs, versiones, ubicaciones, portadas y contenido de fotos idénticos tras la recarga.');
