import { createHash } from 'node:crypto';
import { PrismaClient, type Prisma } from './persistence/generated/client';
import type { ReportResult, SnapshotPort } from '../application/get-report';
export class SnapshotStore implements SnapshotPort {
    readonly prisma: PrismaClient;
    constructor(url: string) { this.prisma = new PrismaClient({ datasourceUrl: url }); }
    async save(result: ReportResult): Promise<void> { const key = createHash('sha256').update(JSON.stringify([result.ownerId, result.from, result.to, result.group, result.propertyId, result.source])).digest('hex'); const data = { ownerId: result.ownerId, payload: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue, generatedAt: new Date(result.generatedAt) }; await this.prisma.reportSnapshot.upsert({ where: { key }, create: { key, ...data }, update: data }); }
    async ready(): Promise<boolean> { try {
        await this.prisma.reportSnapshot.findFirst({ select: { key: true } });
        return true;
    }
    catch {
        return false;
    } }
    async onModuleDestroy(): Promise<void> { await this.close(); }
    async close(): Promise<void> { await this.prisma.$disconnect(); }
}
