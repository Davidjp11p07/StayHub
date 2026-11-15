import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import type { InventoryRepository } from '@inventory/application/ports/inventory.repository';
import { GetRoomInventoryUseCase } from '@inventory/application/use-cases/get-room-inventory.use-case';
import type { PersistedRoomInventory } from '@inventory/domain/room-inventory';
import { INVENTORY_CONFIG } from '@inventory/infrastructure/config/config.module';
import { AccommodationsRoomContextClient } from '@inventory/infrastructure/http/accommodations-room-context.client';
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
}

export interface InventoryTestApp {
  app: INestApplication;
  stub: AccommodationsStub;
  repository: MemoryInventoryRepository;
  close(): Promise<void>;
}

/** Real controller, DTOs, guards, JWT verifier, use case and Accommodations client (against the stub). */
export async function createInventoryTestApp(): Promise<InventoryTestApp> {
  const stub = await startAccommodationsStub();
  const repository = new MemoryInventoryRepository();
  const config = testConfig({ accommodationsUrl: stub.url, accommodationsCircuitFailureThreshold: 100 });
  const moduleRef = await Test.createTestingModule({
    controllers: [InventoryController],
    providers: [
      { provide: INVENTORY_CONFIG, useValue: config },
      ServiceJwtVerifier,
      ServiceAuthGuard,
      InventoryAccessGuard,
      OutboundServiceTokenProvider,
      AccommodationsRoomContextClient,
      {
        provide: GetRoomInventoryUseCase,
        useFactory: (client: AccommodationsRoomContextClient): GetRoomInventoryUseCase => new GetRoomInventoryUseCase(client, repository),
        inject: [AccommodationsRoomContextClient],
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureHttp(app);
  await app.init();
  return { app, stub, repository, close: async () => { await app.close(); await stub.close(); } };
}
