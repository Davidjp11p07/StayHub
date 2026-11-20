import { BadRequestException, Catch, Controller, Get, Header, HttpException, HttpStatus, Inject, Param, Query, Req, ServiceUnavailableException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { GetReport } from '../application/get-report';
import { parseRange, ReportInputError, type Group } from '../domain/metrics';
import { authenticate, isUuid, ReportAuthError } from '../infrastructure/auth';
import type { ReportsConfig } from '../infrastructure/config';
import { SnapshotStore } from '../infrastructure/store';
import { reportSchema } from './report-schema';
export const CONFIG = Symbol('REPORTS_CONFIG');
@ApiTags('reports')
@ApiBearerAuth()
@ApiResponse({ status: 400, description: 'Invalid filters' })
@ApiResponse({ status: 401, description: 'Invalid bearer token' })
@ApiResponse({ status: 403, description: 'Owner or role not authorized' })
@ApiResponse({ status: 503, description: 'Source or storage unavailable; no partial result' })
@Controller('reports')
export class ReportsController {
    constructor(private readonly reports: GetReport,
    @Inject(CONFIG)
    private readonly config: ReportsConfig) { }
    @Get('owner/:id')
    @Header('Cache-Control', 'no-store')
    @ApiOperation({ summary: 'Owner reservations, cancellations, revenue, occupancy and trends' })
    @ApiOkResponse({ schema: reportSchema })
    @ApiQuery({ name: 'from', required: true })
    @ApiQuery({ name: 'to', required: true })
    @ApiQuery({ name: 'group', required: false, enum: ['day', 'month'] })
    @ApiQuery({ name: 'propertyId', required: false })
    owner(
    @Param('id')
    id: string,
    @Query()
    query: Record<string, unknown>,
    @Req()
    request: Request) { return this.execute(id, query, request, false); }
    @Get('occupancy')
    @Header('Cache-Control', 'no-store')
    @ApiOperation({ summary: 'Occupancy over published room-night supply, with completeness and trends' })
    @ApiOkResponse({ schema: reportSchema })
    @ApiQuery({ name: 'from', required: true })
    @ApiQuery({ name: 'to', required: true })
    @ApiQuery({ name: 'ownerId', required: false })
    @ApiQuery({ name: 'propertyId', required: false })
    @ApiQuery({ name: 'group', required: false, enum: ['day', 'month'] })
    occupancy(
    @Query()
    query: Record<string, unknown>,
    @Req()
    request: Request) { return this.execute(undefined, query, request, true); }
    @Get('revenue')
    @Header('Cache-Control', 'no-store')
    @ApiOperation({ summary: 'Charged, refunded and net amounts per currency by confirmed movement date' })
    @ApiOkResponse({ schema: reportSchema })
    @ApiQuery({ name: 'from', required: true })
    @ApiQuery({ name: 'to', required: true })
    @ApiQuery({ name: 'ownerId', required: false })
    @ApiQuery({ name: 'propertyId', required: false })
    @ApiQuery({ name: 'group', required: false, enum: ['day', 'month'] })
    revenue(
    @Query()
    query: Record<string, unknown>,
    @Req()
    request: Request) { return this.execute(undefined, query, request, true); }
    private async execute(id: string | undefined, query: Record<string, unknown>, request: Request, allowOwner: boolean) {
        const auth = request.headers.authorization;
        const count = request.rawHeaders.filter((_, i) => i % 2 === 0 && request.rawHeaders[i]?.toLowerCase() === 'authorization').length;
        if (count !== 1 || !auth?.startsWith('Bearer ') || /\s/.test(auth.slice(7)))
            throw new ReportAuthError(401);
        const principal = authenticate(auth.slice(7), this.config);
        if (Object.keys(query).some(key => !['from', 'to', 'propertyId', 'group', ...(allowOwner ? ['ownerId'] : [])].includes(key)) || Object.values(query).some(v => typeof v !== 'string'))
            throw new BadRequestException('INVALID_FILTERS');
        const ownerId = id ?? (query.ownerId as string | undefined) ?? principal.sub;
        if (!isUuid(ownerId))
            throw new BadRequestException('INVALID_OWNER_ID');
        if (principal.role === 'OWNER' && principal.sub !== ownerId)
            throw new ReportAuthError(403);
        if (principal.role === 'ADMIN' && !id && !query.ownerId)
            throw new BadRequestException('OWNER_ID_REQUIRED');
        if (typeof query.from !== 'string' || typeof query.to !== 'string')
            throw new BadRequestException('DATES_REQUIRED');
        const range = parseRange(query.from, query.to);
        const group = query.group ?? 'day';
        if (group !== 'day' && group !== 'month')
            throw new BadRequestException('INVALID_GROUP');
        if (query.propertyId !== undefined && !isUuid(query.propertyId))
            throw new BadRequestException('INVALID_PROPERTY_ID');
        return this.reports.execute({ ownerId, range, group: group as Group, ...(query.propertyId ? { propertyId: query.propertyId as string } : {}) });
    }
}
@Controller('health')
export class HealthController {
    constructor(private readonly store: SnapshotStore) { }
    @Get('live')
    live() { return { status: 'ok' }; }
    @Get('ready')
    async ready() { if (!await this.store.ready())
        throw new ServiceUnavailableException(); return { status: 'ok' }; }
}
@Catch()
export class ReportsErrorFilter implements ExceptionFilter {
    catch(error: unknown, host: ArgumentsHost): void { const res = host.switchToHttp().getResponse<Response>(); const status = error instanceof ReportAuthError ? error.status : error instanceof ReportInputError ? 400 : error instanceof HttpException ? error.getStatus() : 503; const code = status === 400 ? 'INVALID_REPORT_QUERY' : status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'REPORT_SOURCE_OR_STORAGE_UNAVAILABLE'; res.status(status).type('application/problem+json').set('Cache-Control', 'no-store').json({ type: 'about:blank', title: code, status: status || HttpStatus.SERVICE_UNAVAILABLE, code }); }
}
