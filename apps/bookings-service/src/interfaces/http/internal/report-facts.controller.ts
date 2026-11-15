import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { readFileSync } from 'node:fs';
import { BadRequestException, Controller, ForbiddenException, Get, Inject, Injectable, Query, UnauthorizedException, UseGuards, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { ServiceJwtVerifier } from '@bookings/infrastructure/security/service-jwt.verifier';
import { ReportsBookingFactsQuery } from '@bookings/infrastructure/persistence/prisma/reports-facts.query';
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
@Injectable()
export class ReportsFactsGuard implements CanActivate {
    private readonly reportsVerifier: ServiceJwtVerifier;
    constructor(verifier: ServiceJwtVerifier,
    @Inject(BOOKINGS_CONFIG)
    private readonly config: BookingsConfig) { const file = process.env.REPORTS_SOURCE_PUBLIC_KEY_FILE; this.reportsVerifier = file ? new ServiceJwtVerifier({ ...config, jwtPublicKeys: { [process.env.REPORTS_SOURCE_KID ?? 'reports-v1']: readFileSync(file, 'utf8') }, jwtIssuer: process.env.REPORTS_SOURCE_ISSUER ?? 'stayhub-reports-service' }) : verifier; }
    async canActivate(ctx: ExecutionContext): Promise<boolean> { const request = ctx.switchToHttp().getRequest<Request>(); const token = request.headers.authorization; if (!token?.startsWith('Bearer '))
        throw new UnauthorizedException(); const p = await this.reportsVerifier.verify(token.slice(7), { scope: 'reports:read', audience: this.config.jwtAudience }); if (typeof p.claims.iat !== 'number' || typeof p.claims.exp !== 'number' || p.claims.exp - p.claims.iat > 300 || Math.floor(Date.now() / 1000) - p.claims.iat > 300)
        throw new UnauthorizedException(); if (p.sub !== 'reports-service' || p.claims.scope !== 'reports:read')
        throw new ForbiddenException(); return true; }
}
const factsResponseSchema: SchemaObject = { "type": "object", "additionalProperties": false, "required": ["items", "nextCursor"], "properties": { "items": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["id", "ownerId", "propertyId", "roomId", "status", "createdAt", "cancelledAt", "checkIn", "checkOut"], "properties": { "id": { "type": "string", "format": "uuid" }, "ownerId": { "type": "string", "format": "uuid" }, "propertyId": { "type": "string", "format": "uuid" }, "roomId": { "type": "string", "format": "uuid" }, "status": { "type": "string", "enum": ["PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN", "COMPLETED", "PAYMENT_FAILED", "EXPIRED", "CANCELLED_BY_GUEST", "CANCELLED_BY_OWNER"] }, "createdAt": { "type": "string", "format": "date-time" }, "cancelledAt": { "type": "string", "format": "date-time", "nullable": true }, "checkIn": { "type": "string", "format": "date" }, "checkOut": { "type": "string", "format": "date" } } } }, "nextCursor": { "type": "string", "nullable": true } } };
@ApiResponse({ status: 400 })
@ApiResponse({ status: 401 })
@ApiResponse({ status: 403 })
@ApiResponse({ status: 503 })
@ApiTags('internal-reports')
@ApiBearerAuth()
@UseGuards(ReportsFactsGuard)
@Controller('internal/v1/reports')
export class ReportFactsController {
    constructor(private readonly query: ReportsBookingFactsQuery) { }
    @Get('bookings')
    @ApiQuery({ name: 'ownerId', required: true })
    @ApiQuery({ name: 'after', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @ApiOkResponse({ schema: factsResponseSchema, description: 'Owner-scoped booking facts without guest identity; keyset cursor by UUID' })
    async list(
    @Query()
    q: Record<string, unknown>): Promise<unknown> {
        if (Object.values(q).some(v => typeof v !== 'string') || Object.keys(q).some(k => !['ownerId', 'after', 'limit'].includes(k)) || !uuid(q.ownerId) || (q.after !== undefined && !uuid(q.after)))
            throw new BadRequestException();
        const limit = q.limit === undefined ? 200 : Number(q.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200)
            throw new BadRequestException();
        return this.query.execute(q.ownerId, q.after, limit);
    }
}
