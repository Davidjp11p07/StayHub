import { EventEmitter } from 'node:events';

import { installGracefulShutdown, performShutdown } from '@inventory/infrastructure/lifecycle/graceful-shutdown';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));
const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 100 && !predicate(); attempt += 1) await tick();
  if (!predicate()) throw new Error('condition not met');
};

/** T063: ordered shutdown contract: stop accepting work, wait for in-flight work, close resources, then exit. */
describe('graceful shutdown contract', () => {
  it('closes the Nest app (HTTP + Prisma) and exits 0 on SIGTERM', async () => {
    const signals = new EventEmitter();
    const exit = jest.fn();
    const close = jest.fn(async (): Promise<void> => undefined);

    installGracefulShutdown({ close }, { graceMs: 1000, exit, signals });
    signals.emit('SIGTERM');
    await waitFor(() => exit.mock.calls.length === 1);

    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('waits for in-flight requests before exiting', async () => {
    const signals = new EventEmitter();
    const exit = jest.fn();
    let finish: (() => void) | undefined;
    const close = jest.fn((): Promise<void> => new Promise((resolve) => { finish = resolve; }));

    installGracefulShutdown({ close }, { graceMs: 1000, exit, signals });
    signals.emit('SIGINT');
    await tick();
    expect(exit).not.toHaveBeenCalled();

    finish?.();
    await waitFor(() => exit.mock.calls.length === 1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('exits 1 when the grace period expires with pending work', async () => {
    const signals = new EventEmitter();
    const exit = jest.fn();
    const close = jest.fn((): Promise<void> => new Promise(() => undefined));

    installGracefulShutdown({ close }, { graceMs: 20, exit, signals });
    signals.emit('SIGTERM');
    await waitFor(() => exit.mock.calls.length === 1);

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('is idempotent: a second signal does not close twice or exit twice', async () => {
    const signals = new EventEmitter();
    const exit = jest.fn();
    const close = jest.fn(async (): Promise<void> => undefined);

    installGracefulShutdown({ close }, { graceMs: 1000, exit, signals });
    signals.emit('SIGTERM');
    signals.emit('SIGINT');
    await waitFor(() => exit.mock.calls.length >= 1);

    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('maps a failed close to exit code 1', async () => {
    await expect(performShutdown({ close: async () => Promise.reject(new Error('close failed')) }, { graceMs: 1000 })).resolves.toBe(1);
  });
});
