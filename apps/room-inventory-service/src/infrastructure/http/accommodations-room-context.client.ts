import { Inject, Injectable, Optional } from '@nestjs/common';

import type { PropertyStatus, RoomContext, RoomContextPort } from '@inventory/application/ports/room-context.port';
import { InventoryError } from '@inventory/domain/inventory-errors';
import { INVENTORY_CONFIG } from '@inventory/infrastructure/config/config.module';
import type { InventoryConfig } from '@inventory/infrastructure/config/inventory-config';
import { InventoryMetrics } from '@inventory/infrastructure/observability/inventory-metrics';
import { OutboundServiceTokenProvider } from '@inventory/infrastructure/security/outbound-service-token.provider';

import { classifyAccommodationsStatus } from './remote-problem.mapper';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const STATUSES: readonly PropertyStatus[] = ['DRAFT', 'PUBLISHED', 'UNPUBLISHED'];
const KEYS = ['ownerId', 'propertyId', 'propertyStatus', 'roomExists', 'roomId'];
const MAX_BODY_BYTES = 16_384;

export type DependencyHealth = 'up' | 'down' | 'unknown';

/** Strict parsing of the closed provider schema; any deviation is an invalid response, never trusted. */
export function parseRoomContext(raw: string, expectedRoomId: string): RoomContext | null {
  if (raw.length > MAX_BODY_BYTES) return null;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (Object.keys(value).sort().join(',') !== KEYS.join(',')) return null;
  const { roomId, propertyId, ownerId, propertyStatus, roomExists } = value;
  if (typeof roomId !== 'string' || !UUID.test(roomId) || roomId.toLowerCase() !== expectedRoomId.toLowerCase()) return null;
  if (typeof propertyId !== 'string' || !UUID.test(propertyId)) return null;
  if (typeof ownerId !== 'string' || !UUID.test(ownerId)) return null;
  if (typeof propertyStatus !== 'string' || !(STATUSES as readonly string[]).includes(propertyStatus)) return null;
  if (roomExists !== true) return null;
  return { roomId: roomId.toLowerCase(), propertyId: propertyId.toLowerCase(), ownerId: ownerId.toLowerCase(), propertyStatus: propertyStatus as PropertyStatus };
}

/**
 * Consumer of `GET /internal/v1/rooms/{roomId}/inventory-context` (accommodations-inventory-context.openapi.yaml).
 * Short timeout, no retries (writes need an immediate authoritative answer) and a consecutive-failure circuit
 * breaker. 404 is a valid answer (room missing/hidden) and does not count as a failure.
 */
@Injectable()
export class AccommodationsRoomContextClient implements RoomContextPort {
  private failures = 0;
  private openUntil = 0;
  private lastOutcome: DependencyHealth = 'unknown';

  public constructor(
    @Inject(INVENTORY_CONFIG) private readonly config: InventoryConfig,
    private readonly tokens: OutboundServiceTokenProvider,
    @Optional() private readonly metrics?: InventoryMetrics,
    @Optional() @Inject('INVENTORY_CLOCK_MS') private readonly now: () => number = Date.now,
  ) {}

  /** `down` while the circuit is open or after a failure; `unknown` before the first call. */
  public health(): DependencyHealth {
    if (this.openUntil > this.now()) return 'down';
    return this.lastOutcome;
  }

  public async getContext(roomId: string, traceId: string): Promise<RoomContext> {
    if (this.openUntil > this.now()) {
      this.metrics?.accommodationsCall(0, 'circuit_open');
      throw new InventoryError('DEPENDENCY_UNAVAILABLE');
    }
    const started = process.hrtime.bigint();
    const seconds = (): number => Number(process.hrtime.bigint() - started) / 1e9;
    let response: Response;
    let raw: string;
    try {
      response = await fetch(`${this.config.accommodationsUrl}/internal/v1/rooms/${encodeURIComponent(roomId)}/inventory-context`, {
        method: 'GET',
        headers: { authorization: `Bearer ${await this.tokens.issue()}`, accept: 'application/json', 'x-request-id': traceId },
        signal: AbortSignal.timeout(this.config.accommodationsTimeoutMs),
      });
      raw = await response.text();
    } catch {
      this.metrics?.accommodationsCall(seconds(), 'unavailable');
      throw this.failure();
    }
    if (response.status === 200) {
      const context = parseRoomContext(raw, roomId);
      if (!context) {
        this.metrics?.accommodationsCall(seconds(), 'invalid_response');
        throw this.failure();
      }
      this.success();
      this.metrics?.accommodationsCall(seconds(), 'ok');
      return context;
    }
    if (classifyAccommodationsStatus(response.status) === 'not_found') {
      this.success();
      this.metrics?.accommodationsCall(seconds(), 'not_found');
      throw new InventoryError('ROOM_NOT_FOUND');
    }
    this.metrics?.accommodationsCall(seconds(), 'unavailable');
    throw this.failure();
  }

  private success(): void {
    this.failures = 0;
    this.openUntil = 0;
    this.lastOutcome = 'up';
  }

  private failure(): InventoryError {
    this.failures += 1;
    this.lastOutcome = 'down';
    if (this.failures >= this.config.accommodationsCircuitFailureThreshold) this.openUntil = this.now() + this.config.accommodationsCircuitResetMs;
    return new InventoryError('DEPENDENCY_UNAVAILABLE');
  }
}
