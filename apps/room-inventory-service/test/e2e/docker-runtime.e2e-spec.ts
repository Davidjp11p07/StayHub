import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const dockerfile = readFileSync(resolve(ROOT, 'infra/docker/room-inventory/Dockerfile'), 'utf8');
const compose = readFileSync(resolve(ROOT, 'docker-compose.yml'), 'utf8');
const container = process.env.INVENTORY_E2E_CONTAINER;
const baseUrl = process.env.INVENTORY_E2E_BASE_URL;
const dockerAvailable = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8' }).status === 0;
const podmanAvailable = spawnSync('podman', ['version', '--format', '{{.Client.Version}}'], { encoding: 'utf8' }).status === 0;
const runtime = process.env.INVENTORY_E2E_RUNTIME ?? (dockerAvailable ? 'docker' : podmanAvailable ? 'podman' : undefined);
const describeRuntime = runtime !== undefined && container ? describe : describe.skip;
const describeHttp = baseUrl ? describe : describe.skip;

/** T069: runtime image/compose evidence. Static checks always run; live checks need Docker + Compose. */
describe('Docker runtime configuration (T069)', () => {
  it('builds a non-root runtime and keeps the migration as a separate target', () => {
    expect(dockerfile).toContain('AS migration');
    expect(dockerfile).toContain('AS runtime');
    expect(dockerfile).toMatch(/USER node/u);
    expect(dockerfile).toContain('HEALTHCHECK');
    expect(dockerfile).toContain('ENTRYPOINT ["/usr/bin/tini", "--"]');
  });

  it('declares inventory-db, a one-shot migration and a read-only service with health checks', () => {
    expect(compose).toMatch(/inventory-db:/u);
    expect(compose).toMatch(/room-inventory-migrate:/u);
    expect(compose).toMatch(/room-inventory-service:/u);
    expect(compose).toMatch(/INVENTORY_PORT: "3008"/u);
    expect(compose).toContain('read_only: true');
    expect(compose).toContain('cap_drop: [ALL]');
    expect(compose).toContain('security_opt: [no-new-privileges:true]');
    expect(compose).toContain('room-inventory-migrate: { condition: service_completed_successfully }');
    expect(compose).toContain("fetch('http://127.0.0.1:3008/health/ready')");
  });
});

describeRuntime('live container contract', () => {
  const inspect = (): Record<string, unknown> => {
    const result = spawnSync(runtime ?? 'docker', ['inspect', container ?? ''], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error('runtime inspect failed');
    const parsed = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    return parsed[0] ?? {};
  };

  it('runs as a non-root user with a read-only root filesystem and healthy state', () => {
    const details = inspect();
    const config = details['Config'] as { User?: string };
    const host = details['HostConfig'] as { ReadonlyRootfs?: boolean; CapDrop?: string[] };
    expect(config.User).not.toBe('');
    expect(config.User).not.toBe('root');
    expect(host.ReadonlyRootfs).toBe(true);
    if (runtime === 'docker') expect(host.CapDrop).toContain('ALL');
    if (runtime === 'docker') expect((details['State'] as { Health?: { Status?: string } }).Health?.Status).toBe('healthy');
  });

  it('restarts and becomes healthy again', async () => {
    const restart = spawnSync(runtime ?? 'docker', ['restart', container ?? ''], { encoding: 'utf8' });
    expect(restart.status).toBe(0);
    let healthy = false;
    for (let attempt = 0; attempt < 30 && !healthy; attempt += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
      if (baseUrl !== undefined) {
        healthy = await fetch(`${baseUrl.replace(/\/$/u, '')}/health/live`).then((response) => response.ok).catch(() => false);
      } else {
        healthy = (inspect()['State'] as { Running?: boolean }).Running === true;
      }
    }
    expect(healthy).toBe(true);
  }, 45_000);
});

describeHttp('live health endpoints', () => {
  it.each(['/health/live', '/health/ready'])('reports %s', async (path) => {
    const response = await fetch(`${baseUrl?.replace(/\/$/u, '')}${path}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status?: string };
    expect(['ok', 'ready']).toContain(body.status);
  });
});
