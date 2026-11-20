import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ReportsModule } from '../src/app';
import { CONFIG, ReportsErrorFilter } from '../src/interfaces/http';
import { SnapshotStore } from '../src/infrastructure/store';
import { LiveSources } from '../src/infrastructure/sources';
import { createDocument } from '../src/openapi';
import { config, owner, token } from './support';
test('real application composition publishes all protected contracts and executes the query', async () => {
  const module = await Test.createTestingModule({ imports: [ReportsModule] }).overrideProvider(CONFIG).useValue(config).overrideProvider(SnapshotStore).useValue({ save: async () => undefined, ready: async () => true }).overrideProvider(LiveSources).useValue({ source: 'LIVE', load: async () => ({ bookings: [], movements: [], supply: [] }) }).compile();
  const app = module.createNestApplication(); app.useGlobalFilters(new ReportsErrorFilter()); await app.init();
  try {
    const doc = createDocument(app);
    for (const path of ['/reports/owner/{id}', '/reports/occupancy', '/reports/revenue']) expect(doc.paths[path]?.get?.security).toEqual([{ bearer: [] }]);
    await request(app.getHttpServer()).get('/reports/owner/' + owner + '?from=2026-11-01&to=2026-11-11').auth(token(), { type: 'bearer' }).expect(200);
  } finally { await app.close(); }
});
