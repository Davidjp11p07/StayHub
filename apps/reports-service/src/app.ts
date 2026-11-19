import { Module } from '@nestjs/common';
import { GetReport } from './application/get-report';
import { loadConfig, type ReportsConfig } from './infrastructure/config';
import { LiveSources } from './infrastructure/sources';
import { SnapshotStore } from './infrastructure/store';
import { CONFIG, HealthController, ReportsController } from './interfaces/http';
@Module({ controllers: [HealthController, ReportsController], providers: [{ provide: CONFIG, useFactory: () => loadConfig() }, { provide: SnapshotStore, useFactory: (c: ReportsConfig) => new SnapshotStore(c.databaseUrl), inject: [CONFIG] }, { provide: LiveSources, useFactory: (c: ReportsConfig) => new LiveSources(c), inject: [CONFIG] }, { provide: GetReport, useFactory: (sources: LiveSources, store: SnapshotStore) => new GetReport(sources, store), inject: [LiveSources, SnapshotStore] }] })
export class ReportsModule {
}
