import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { readFileSync } from 'node:fs';
import { BadRequestException, Controller, ForbiddenException, Get, Inject, Injectable, Query, UnauthorizedException, UseGuards, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ACCOMMODATIONS_CONFIG, type AccommodationsConfig } from '@accommodations/infrastructure/config/accommodations-config';
import { verifyServiceToken } from '@accommodations/infrastructure/security/service-jwt.verifier';
import { ReportsSupplyQuery } from '@accommodations/infrastructure/persistence/prisma/reports-supply.query';
@Injectable()
export class ReportsSupplyGuard implements CanActivate {
    constructor(
    @Inject(ACCOMMODATIONS_CONFIG)
    private readonly config: AccommodationsConfig) { }
    canActivate(ctx: ExecutionContext): boolean { const auth = ctx.switchToHttp().getRequest<Request>().headers.authorization; if (!auth?.startsWith('Bearer '))
        throw new UnauthorizedException(); let principal; try {
        const file = process.env.REPORTS_SOURCE_PUBLIC_KEY_FILE;
        principal = verifyServiceToken(auth.slice(7), { ...this.config.serviceJwt, scope: 'reports:read', ...(file ? { issuer: process.env.REPORTS_SOURCE_ISSUER ?? 'stayhub-reports-service', kid: process.env.REPORTS_SOURCE_KID ?? 'reports-v1', publicKey: readFileSync(file, 'utf8') } : {}) });
    }
    catch {
        throw new UnauthorizedException();
    } if (principal.sub !== 'reports-service' || principal.scopes.length !== 1)
        throw new ForbiddenException(); return true; }
}
const factsResponseSchema: SchemaObject = { "type": "object", "additionalProperties": false, "required": ["items", "nextCursor"], "properties": { "items": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["id", "propertyId", "name", "capturedAt", "roomIds"], "properties": { "id": { "type": "string", "pattern": "^[0-9]+$" }, "propertyId": { "type": "string", "format": "uuid" }, "name": { "type": "string" }, "capturedAt": { "type": "string", "format": "date-time" }, "roomIds": { "type": "array", "items": { "type": "string", "format": "uuid" } } } } }, "nextCursor": { "type": "string", "nullable": true } } };
@ApiResponse({ status: 400 })
@ApiResponse({ status: 401 })
@ApiResponse({ status: 403 })
@ApiResponse({ status: 503 })
@ApiTags('internal-reports')
@ApiBearerAuth('serviceJwt')
@UseGuards(ReportsSupplyGuard)
@Controller('internal/v1/reports')
export class ReportSupplyController {
    constructor(private readonly query: ReportsSupplyQuery) { }
    @Get('supply')
    @ApiQuery({ name: 'ownerId', required: true })
    @ApiQuery({ name: 'after', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @ApiOkResponse({ schema: factsResponseSchema, description: 'Historical published room supply versions; earlier availability is unknown' })
    async list(
    @Query()
    q: Record<string, unknown>): Promise<unknown> {
        if (Object.values(q).some(v => typeof v !== 'string') || Object.keys(q).some(k => !['ownerId', 'after', 'limit'].includes(k)) || typeof q.ownerId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q.ownerId) || (q.after !== undefined && (typeof q.after !== 'string' || !/^\d{1,18}$/.test(q.after))))
            throw new BadRequestException();
        const limit = q.limit === undefined ? 200 : Number(q.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200)
            throw new BadRequestException();
        return this.query.execute(q.ownerId, q.after, limit);
    }
}
