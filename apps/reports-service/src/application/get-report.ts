import { aggregate, previous, type Facts, type Range, type Group, type Metrics } from '../domain/metrics';
export interface ReportQuery {
    ownerId: string;
    range: Range;
    group: Group;
    propertyId?: string;
}
export interface ReportResult {
    ownerId: string;
    from: string;
    to: string;
    group: Group;
    propertyId: string | null;
    generatedAt: string;
    source: 'LIVE' | 'DEMO';
    timezone: 'UTC';
    metrics: Metrics;
    previous: Metrics;
    properties: Array<{
        id: string;
        name: string;
    }>;
}
export interface SourcesPort {
    load(query: ReportQuery, from: string): Promise<Facts>;
    source: 'LIVE' | 'DEMO';
}
export interface SnapshotPort {
    save(result: ReportResult): Promise<void>;
}
export class GetReport {
    constructor(private readonly sources: SourcesPort, private readonly snapshots: SnapshotPort) { }
    async execute(q: ReportQuery): Promise<ReportResult> { const prior = previous(q.range); const facts = await this.sources.load(q, prior.from); if (facts.bookings.some(b => b.ownerId !== q.ownerId))
        throw new Error('SOURCE_OWNER_MISMATCH'); const properties = new Map<string, string>(); for (const s of facts.supply)
        properties.set(s.propertyId, s.name); const result: ReportResult = { ownerId: q.ownerId, from: q.range.from, to: q.range.to, group: q.group, propertyId: q.propertyId ?? null, generatedAt: new Date().toISOString(), source: this.sources.source, timezone: 'UTC', metrics: aggregate(facts, q.range, q.group, q.propertyId), previous: aggregate(facts, prior, q.group, q.propertyId), properties: [...properties].map(([id, name]) => ({ id, name })) }; await this.snapshots.save(result); return result; }
}
