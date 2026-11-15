import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { readFileSync } from 'node:fs';
import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, Inject, Injectable, Post, UnauthorizedException, UseGuards, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsUUID } from 'class-validator';
import type { Request } from 'express';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../../infrastructure/config/payments-config';
import { verifyServiceJwt } from '../../infrastructure/security/jwt.verifier';
import { ReportsPaymentFactsQuery } from '../../infrastructure/persistence/prisma/reports-facts.query';
class MovementsQuery {
    @ApiProperty({ type: [String], maxItems: 200 })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(200)
    @ArrayUnique()
    @IsUUID('4', { each: true })
    bookingIds!: string[];
    @ApiProperty({ format: 'date' })
    @IsDateString({ strict: true })
    from!: string;
    @ApiProperty({ format: 'date' })
    @IsDateString({ strict: true })
    to!: string;
}
@Injectable()
export class ReportsMovementsGuard implements CanActivate {
    constructor(
    @Inject(PAYMENTS_CONFIG)
    private readonly config: PaymentsConfig) { }
    canActivate(ctx: ExecutionContext): boolean { const token = ctx.switchToHttp().getRequest<Request>().headers.authorization; if (!token?.startsWith('Bearer '))
        throw new UnauthorizedException(); const file = process.env.REPORTS_SOURCE_PUBLIC_KEY_FILE; const settings = file ? { ...this.config.serviceJwt, issuer: process.env.REPORTS_SOURCE_ISSUER ?? 'stayhub-reports-service', kid: process.env.REPORTS_SOURCE_KID ?? 'reports-v1', publicKey: readFileSync(file, 'utf8') } : this.config.serviceJwt; const claims = verifyServiceJwt(token.slice(7), settings, 300); if (claims.scope !== 'reports:read' || claims.sub !== 'reports-service')
        throw new ForbiddenException(); return true; }
}
const factsResponseSchema: SchemaObject = { "type": "object", "additionalProperties": false, "required": ["items"], "properties": { "items": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["id", "bookingId", "kind", "amountMinor", "currency", "occurredAt"], "properties": { "id": { "type": "string" }, "bookingId": { "type": "string", "format": "uuid" }, "kind": { "type": "string", "enum": ["CHARGE", "REFUND"] }, "amountMinor": { "type": "string", "pattern": "^[0-9]+$" }, "currency": { "type": "string", "enum": ["COP", "USD"] }, "occurredAt": { "type": "string", "format": "date-time" } } } } } };
@ApiResponse({ status: 400 })
@ApiResponse({ status: 401 })
@ApiResponse({ status: 403 })
@ApiResponse({ status: 503 })
@ApiTags('internal-reports')
@ApiBearerAuth('serviceJwt')
@UseGuards(ReportsMovementsGuard)
@Controller('internal/v1/reports')
export class ReportsMovementsController {
    constructor(private readonly query: ReportsPaymentFactsQuery) { }
    @Post('movements')
    @HttpCode(200)
    @ApiOkResponse({ schema: factsResponseSchema, description: 'Confirmed charges and refunds for authorized booking IDs, by movement date; minor units as strings' })
    async list(
    @Body()
    body: MovementsQuery): Promise<unknown> {
        const from = new Date(body.from + 'T00:00:00.000Z');
        const to = new Date(body.to + 'T00:00:00.000Z');
        const span = to.getTime() - from.getTime();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.from) || !/^\d{4}-\d{2}-\d{2}$/.test(body.to) || !Number.isFinite(span) || span <= 0 || span > 732 * 86400000)
            throw new BadRequestException();
        return this.query.execute(body.bookingIds, from, to);
    }
}
