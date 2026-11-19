import { BadRequestException, Controller, Get, Header, Module, Param, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { GATEWAY_CONFIG, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { ReportsClient } from '@gateway/infrastructure/http/reports.client';
import { principalFrom } from '@gateway/modules/auth/access.guard';
import { Roles } from '@gateway/modules/auth/roles.guard';
import { traceIdFromRequest } from '@gateway/interfaces/http/trace-id';
import { BookingsRateLimitGuard } from '@gateway/modules/rate-limit/bookings-rate-limit.guard';
function query(request: Request, allowOwner: boolean): string { const params = new URLSearchParams(); for (const [key, value] of Object.entries(request.query)) {
    if (!['from', 'to', 'group', 'propertyId', ...(allowOwner ? ['ownerId'] : [])].includes(key) || typeof value !== 'string')
        throw new BadRequestException();
    params.set(key, value);
} return '?' + params.toString(); }
@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@Roles('OWNER', 'ADMIN')
@UseGuards(BookingsRateLimitGuard)
export class GatewayReportsController {
    constructor(private readonly reports: ReportsClient) { }
    @Get('owner/:id')
    @Header('Cache-Control', 'no-store')
    @ApiOperation({ summary: 'Reports for an authorized owner' })
    owner(
    @Param('id')
    id: string,
    @Req()
    request: Request): Promise<unknown> { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
        throw new BadRequestException(); const principal = principalFrom(request); if (!principal)
        throw new UnauthorizedException(); return this.reports.request({ traceId: traceIdFromRequest(request), userId: principal.userId, role: principal.role }, 'GET', '/reports/owner/' + encodeURIComponent(id) + query(request, false)); }
    @Get('occupancy')
    @Header('Cache-Control', 'no-store')
    @ApiOperation({ summary: 'Occupancy report' })
    occupancy(
    @Req()
    request: Request): Promise<unknown> { return this.forward(request, 'occupancy'); }
    @Get('revenue')
    @Header('Cache-Control', 'no-store')
    @ApiOperation({ summary: 'Revenue per currency' })
    revenue(
    @Req()
    request: Request): Promise<unknown> { return this.forward(request, 'revenue'); }
    private forward(request: Request, name: string): Promise<unknown> { const principal = principalFrom(request); if (!principal)
        throw new UnauthorizedException(); return this.reports.request({ traceId: traceIdFromRequest(request), userId: principal.userId, role: principal.role }, 'GET', '/reports/' + name + query(request, true)); }
}
@Module({ controllers: [GatewayReportsController], providers: [BookingsRateLimitGuard, { provide: ReportsClient, useFactory: (config: GatewayConfig): ReportsClient => new ReportsClient(config), inject: [GATEWAY_CONFIG] }] })
export class ReportsProxyModule {
}
