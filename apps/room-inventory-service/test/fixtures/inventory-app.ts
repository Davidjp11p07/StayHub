import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import type { AddInventoryItemPersistenceInput, InventoryRepository } from '@inventory/application/ports/inventory.repository';
import { AddInventoryItemUseCase } from '@inventory/application/use-cases/add-inventory-item.use-case';
import { GetRoomInventoryUseCase } from '@inventory/application/use-cases/get-room-inventory.use-case';
import { ReplaceRoomInventoryUseCase } from '@inventory/application/use-cases/replace-room-inventory.use-case';
import { InventoryError } from '@inventory/domain/inventory-errors';
import type { PersistedRoomInventory } from '@inventory/domain/room-inventory';
import { replacementTransition } from '@inventory/domain/room-inventory';
import { INVENTORY_CONFIG } from '@inventory/infrastructure/config/config.module';
import type { InventoryConfig } from '@inventory/infrastructure/config/inventory-config';
import { AccommodationsRoomContextClient } from '@inventory/infrastructure/http/accommodations-room-context.client';
import { InventoryLogger } from '@inventory/infrastructure/observability/inventory-logger';
import { InventoryMetrics } from '@inventory/infrastructure/observability/inventory-metrics';
import { OutboundServiceTokenProvider } from '@inventory/infrastructure/security/outbound-service-token.provider';
import { ServiceJwtVerifier } from '@inventory/infrastructure/security/service-jwt.verifier';
import { configureHttp } from '@inventory/interfaces/http/configure-http';
import { InventoryAccessGuard } from '@inventory/interfaces/http/guards/inventory-access.guard';
import { ServiceAuthGuard } from '@inventory/interfaces/http/guards/service-auth.guard';
import { InventoryController } from '@inventory/interfaces/http/inventory/inventory.controller';

import { startAccommodationsStub, type AccommodationsStub } from './accommodations-context.fixture';
import { testConfig } from './jwt.fixture';

/** In-memory repository for HTTP-level tests; PostgreSQL behaviour is covered by integration tests. */
export class MemoryInventoryRepository implements InventoryRepository {
  public readonly rows = new Map<string, PersistedRoomInventory>();
  public readonly findByRoomId = jest.fn(async (roomId: string) => this.rows.get(roomId) ?? null);
  public readonly addItem = jest.fn(async (input: AddInventoryItemPersistenceInput): Promise<PersistedRoomInventory> => {
    const current = this.rows.get(input.roomId);
    if ((current?.items.length ?? 0) + 1 > input.maxItems) throw new InventoryError('INVENTORY_LIMIT_EXCEEDED');
    const now = new Date();
    const row: PersistedRoomInventory = {
      roomId: input.roomId, propertyId: input.propertyId, ownerId: input.ownerId,
      version: (current?.version ?? 0) + 1, createdAt: current?.createdAt ?? now, updatedAt: now,
      items: [...(current?.items ?? []), { id: randomUUID(), ...input.item, createdAt: now, updatedAt: now }],
    };
    this.rows.set(input.roomId, row);
    return row;
  });

  public seedFull(roomId: string, propertyId: string, ownerId: string): void {
    const now = new Date();
    this.rows.set(roomId, {
      roomId, propertyId, ownerId, version: 1, createdAt: now, updatedAt: now,
      items: Array.from({ length: 200 }, (_, index) => ({ id: randomUUID(), type: 'PRODUCT', name: `Item ${index}`, quantityAvailable: index, active: true, createdAt: now, updatedAt: now })),
    });
  }

  public seedPair(roomId: string, propertyId: string, ownerId: string): { first: string; second: string } {
    const now = new Date(); const first = randomUUID(); const second = randomUUID();
    this.rows.set(roomId, { roomId, propertyId, ownerId, version: 1, createdAt: now, updatedAt: now, items: [
      { id: first, type: 'PRODUCT', name: 'Agua', quantityAvailable: 2, active: true, createdAt: now, updatedAt: now },
      { id: second, type: 'SERVICE', name: 'Spa', quantityAvailable: 1, active: true, createdAt: now, updatedAt: now },
    ] });
    return { first, second };
  }

  public readonly replace = jest.fn(async (input: import('@inventory/application/ports/inventory.repository').ReplaceRoomInventoryPersistenceInput): Promise<PersistedRoomInventory | null> => {
    const current = this.rows.get(input.roomId) ?? null;
    const transition = replacementTransition(current?.items ?? [], input.items, input.maxItems, input.maxQuantity);
    if (input.expectedVersion !== (current?.version ?? 0)) {
      if (!transition.changed) return current;
      throw new InventoryError('VERSION_CONFLICT');
    }
    if (!transition.changed) return current;
    if (!current) throw new InventoryError('UNKNOWN_ITEM');
    const now = new Date();
    const updated = { ...current, propertyId: input.propertyId, ownerId: input.ownerId, version: current.version + 1, updatedAt: now, items: transition.items.map((item) => ({ ...item, updatedAt: now })) };
    this.rows.set(input.roomId, updated);
    return updated;
  });
}

export interface InventoryTestApp {
  app: INestApplication;
  stub: AccommodationsStub;
  repository: MemoryInventoryRepository;
  metrics: InventoryMetrics;
  logger: InventoryLogger;
  close(): Promise<void>;
}

export interface InventoryTestAppOptions {
  readonly metrics?: InventoryMetrics;
  readonly logger?: InventoryLogger;
}

/** Real controller, DTOs, guards, JWT verifier, use case and Accommodations client (against the stub). */
export async function createInventoryTestApp(options: InventoryTestAppOptions = {}): Promise<InventoryTestApp> {
  const stub = await startAccommodationsStub();
  const repository = new MemoryInventoryRepository();
  const config = testConfig({ accommodationsUrl: stub.url, accommodationsCircuitFailureThreshold: 100 });
  const metrics = options.metrics ?? new InventoryMetrics();
  const logger = options.logger ?? new InventoryLogger(config);
  const moduleRef = await Test.createTestingModule({
    controllers: [InventoryController],
    providers: [
      { provide: INVENTORY_CONFIG, useValue: config },
      { provide: InventoryMetrics, useValue: metrics },
      { provide: InventoryLogger, useValue: logger },
      ServiceJwtVerifier,
      ServiceAuthGuard,
      InventoryAccessGuard,
      OutboundServiceTokenProvider,
      {
        provide: AccommodationsRoomContextClient,
        useFactory: (configValue: InventoryConfig, tokens: OutboundServiceTokenProvider): AccommodationsRoomContextClient =>
          new AccommodationsRoomContextClient(configValue, tokens, metrics),
        inject: [INVENTORY_CONFIG, OutboundServiceTokenProvider],
      },
      {
        provide: GetRoomInventoryUseCase,
        useFactory: (client: AccommodationsRoomContextClient): GetRoomInventoryUseCase => new GetRoomInventoryUseCase(client, repository),
        inject: [AccommodationsRoomContextClient],
      },
      {
        provide: AddInventoryItemUseCase,
        useFactory: (client: AccommodationsRoomContextClient): AddInventoryItemUseCase => new AddInventoryItemUseCase(client, repository, config),
        inject: [AccommodationsRoomContextClient],
      },
      {
        provide: ReplaceRoomInventoryUseCase,
        useFactory: (client: AccommodationsRoomContextClient): ReplaceRoomInventoryUseCase => new ReplaceRoomInventoryUseCase(client, repository, config),
        inject: [AccommodationsRoomContextClient],
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false });
  app.useBodyParser('json', { limit: '64kb' });
  configureHttp(app);
  await app.init();
  return { app, stub, repository, metrics, logger, close: async () => { await app.close(); await stub.close(); } };
}
