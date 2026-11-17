import type { INestApplication } from '@nestjs/common';

import type { InventoryLogger } from '@inventory/infrastructure/observability/inventory-logger';

export type ShutdownSignal = 'SIGTERM' | 'SIGINT';

/** Minimal signal source so tests can drive shutdown without signalling the test process. */
export interface SignalSource {
  once(signal: ShutdownSignal, listener: () => void): unknown;
}

export interface ShutdownOptions {
  readonly graceMs: number;
  readonly exit?: (code: number) => void;
  readonly signals?: SignalSource;
  readonly logger?: Pick<InventoryLogger, 'warn' | 'error'>;
}

/**
 * Stops accepting new HTTP work, waits for in-flight requests through Nest's `close()` (which also closes the Prisma
 * pool) and enforces the shutdown grace period. Returns the process exit code instead of exiting, so it is testable.
 */
export async function performShutdown(
  app: Pick<INestApplication, 'close'>,
  options: Pick<ShutdownOptions, 'graceMs' | 'logger'>,
): Promise<0 | 1> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<1>((resolve) => {
    timer = setTimeout(() => {
      options.logger?.warn({ event: 'shutdown.timeout' }, 'Lifecycle');
      resolve(1);
    }, options.graceMs);
    timer.unref?.();
  });
  const closed = app.close().then(
    () => 0 as const,
    () => {
      options.logger?.error({ event: 'shutdown.failed' }, 'Lifecycle');
      return 1 as const;
    },
  );
  const code = await Promise.race([closed, timeout]);
  if (timer) clearTimeout(timer);
  return code;
}

/** Installs idempotent SIGTERM/SIGINT handlers; a second signal never starts a second close. */
export function installGracefulShutdown(app: Pick<INestApplication, 'close'>, options: ShutdownOptions): void {
  const signals = options.signals ?? process;
  const exit = options.exit ?? ((code: number): void => process.exit(code));
  let started = false;
  const handler = (): void => {
    if (started) return;
    started = true;
    void performShutdown(app, options).then(exit);
  };
  signals.once('SIGTERM', handler);
  signals.once('SIGINT', handler);
}
