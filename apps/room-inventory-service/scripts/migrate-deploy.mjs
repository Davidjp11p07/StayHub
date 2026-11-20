import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Applies Inventory migrations only to inventory_db. Accepts INVENTORY_DATABASE_URL or INVENTORY_DATABASE_URL_FILE.
const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(serviceRoot, '../..');
const env = { ...process.env };
const databaseUrlFile = env.INVENTORY_DATABASE_URL_FILE?.trim();

if (databaseUrlFile) {
  try {
    env.INVENTORY_DATABASE_URL = readFileSync(databaseUrlFile, 'utf8').trim();
  } catch {
    process.stderr.write('INVENTORY_DATABASE_URL_FILE could not be read.\n');
    process.exit(1);
  }
}

if (!env.INVENTORY_DATABASE_URL?.trim()) {
  process.stderr.write('INVENTORY_DATABASE_URL or INVENTORY_DATABASE_URL_FILE is required.\n');
  process.exit(1);
}

const databaseUrl = new URL(env.INVENTORY_DATABASE_URL);
if (!['/inventory_db', '/inventory_test'].includes(databaseUrl.pathname)) {
  process.stderr.write('Inventory migrations require the inventory_db (or inventory_test) database.\n');
  process.exit(1);
}

const prismaCli = path.join(repositoryRoot, 'node_modules', 'prisma', 'build', 'index.js');
const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { cwd: serviceRoot, env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
