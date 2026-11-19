import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
@Injectable()
export class ReportsSupplyQuery {
    constructor(private readonly prisma: PrismaService) { }
    async execute(ownerId: string, after: string | undefined, limit: number): Promise<unknown> {
        const rows = await this.prisma.$queryRaw<Array<{
            id: bigint;
            propertyId: string;
            name: string;
            capturedAt: Date;
            roomIds: string[];
        }>> `SELECT "id","propertyId","name","capturedAt","roomIds" FROM "ReportSupplyVersion" WHERE "ownerId"=${ownerId}::uuid AND "id">${after ?? '0'}::bigint ORDER BY "id" ASC LIMIT ${limit + 1}`;
        return { items: rows.slice(0, limit).map(row => ({ ...row, id: row.id.toString(), capturedAt: row.capturedAt.toISOString() })), nextCursor: rows.length > limit ? rows[limit - 1]!.id.toString() : null };
    }
}
