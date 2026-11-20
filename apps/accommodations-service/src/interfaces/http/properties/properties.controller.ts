import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Put, Res, ServiceUnavailableException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { STORAGE_PORT } from '@accommodations/application/ports/storage.port';
import { LocalStorageAdapter } from '@accommodations/infrastructure/files/local-storage.adapter';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PROPERTY_CREATE_BODY, PROPERTY_PHOTO_BODY, PROPERTY_REPLACE_BODY } from '@accommodations/interfaces/openapi/property-bodies';
import { AddPropertyPhotoUseCase } from '@accommodations/application/photos/add-property-photo.use-case';
import { CreatePropertyUseCase } from '@accommodations/application/properties/create-property.use-case';
import { GetPropertyUseCase } from '@accommodations/application/properties/get-property.use-case';
import { ReplacePropertyUseCase } from '@accommodations/application/properties/replace-property.use-case';
import type { Principal } from '@accommodations/domain/properties/property.types';
import { invalid } from '@accommodations/domain/shared/domain-error';
import { parseUuid } from '@accommodations/domain/shared/uuid';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import { OptionalJwtGuard } from '../auth/optional-jwt.guard';
import { CurrentPrincipal } from '../auth/principal.decorator';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../guards/roles.decorator';
import { parseCreateProperty } from './create-property.dto';
import { parsePhotoFile } from './photo-upload.dto';
import { PhotoUploadInterceptor } from './photo-upload.interceptor';
import { parseReplaceProperty } from './replace-property.dto';
import { presentPhoto, presentProperty, type PhotoView, type PropertyView } from './property.presenter';
import type { PropertyVerification } from '@accommodations/infrastructure/persistence/generated/prisma';
import { PrismaPropertyRepository, type PendingVerification } from '@accommodations/infrastructure/persistence/prisma/property.repository';

@ApiTags('Properties')
@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly createProperty: CreatePropertyUseCase,
    private readonly getProperty: GetPropertyUseCase,
    private readonly replaceProperty: ReplacePropertyUseCase,
    private readonly addPropertyPhoto: AddPropertyPhotoUseCase,
    private readonly properties: PrismaPropertyRepository,
    @Inject(STORAGE_PORT) private readonly storage: LocalStorageAdapter,
  ) {}

  @Get('verification/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('VERIFIER')
  pendingReviews(): Promise<PendingVerification[]> { return this.properties.pendingVerifications(); }

  @Get(':id/verification')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'VERIFIER')
  async verification(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<{ property: PropertyView; history: PropertyVerification[] }> {
    const { property, history } = await this.properties.verificationDetail(parseUuid(id, 'id'), principal);
    return { property: presentProperty(property, principal), history };
  }

  @Post(':id/verification')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  submit(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: unknown): Promise<PropertyVerification> {
    const input = verificationInput(body, ['version']);
    return this.properties.submitVerification(parseUuid(id, 'id'), principal.sub, input.version);
  }

  @Post(':id/verification/decision')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('VERIFIER')
  decide(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: unknown): Promise<PropertyVerification> {
    const input = verificationInput(body, ['version', 'status', 'reason']);
    if (input.status !== 'APPROVED' && input.status !== 'REJECTED') return invalid('status');
    if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 1000) return invalid('reason');
    return this.properties.decideVerification(parseUuid(id, 'id'), principal.sub, input.version, input.status, input.reason.trim());
  }

  @Get(':id/photos/:photoId')
  @UseGuards(OptionalJwtGuard)
  async getPhoto(@CurrentPrincipal() viewer: Principal | undefined, @Param('id') id: string, @Param('photoId') photoId: string, @Res() response: Response): Promise<void> {
    const propertyId = parseUuid(id, 'id');
    let property;
    if (viewer?.role === 'VERIFIER') {
      const review = await this.properties.verificationDetail(propertyId, viewer);
      if (review.property.status !== 'PUBLISHED' && !review.history.some(item => item.version === review.property.version && item.status === 'PENDING')) throw new NotFoundException();
      property = review.property;
    } else {
      property = await this.getProperty.execute(propertyId, viewer);
    }
    const photo = property.photos.find(item => item.id === parseUuid(photoId, 'photoId'));
    if (!photo) throw new NotFoundException();
    let bytes: Uint8Array;
    try { bytes = await this.storage.read(photo.storageKey); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new NotFoundException();
      throw new ServiceUnavailableException();
    }
    response.setHeader('Content-Type', photo.mediaType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(Buffer.from(bytes));
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @ApiBearerAuth('bearerAuth')
  async listMine(@CurrentPrincipal() principal: Principal): Promise<PropertyView[]> {
    const properties = await this.properties.findByOwner(principal.sub);
    return properties.map(property => presentProperty(property, principal));
  }

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @ApiBearerAuth('bearerAuth')
  @ApiBody({ required: true, schema: PROPERTY_CREATE_BODY })
  @ApiOperation({ operationId: 'createProperty', summary: 'Crear una propiedad en borrador' })
  @ApiResponse({ status: 201 }) @ApiResponse({ status: 400 }) @ApiResponse({ status: 401 }) @ApiResponse({ status: 403 }) @ApiResponse({ status: 503 })
  async create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<PropertyView> {
    const property = await this.createProperty.execute(principal, parseCreateProperty(body));
    return presentProperty(property, principal);
  }

  @Get(':id')
  @UseGuards(OptionalJwtGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiSecurity({})
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ operationId: 'getProperty', summary: 'Consultar una propiedad visible' })
  @ApiResponse({ status: 200 }) @ApiResponse({ status: 400 }) @ApiResponse({ status: 401 }) @ApiResponse({ status: 404 }) @ApiResponse({ status: 503 })
  async get(@CurrentPrincipal() viewer: Principal | undefined, @Param('id') id: string): Promise<PropertyView> {
    const property = await this.getProperty.execute(parseUuid(id, 'id'), viewer);
    return presentProperty(property, viewer);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @ApiBearerAuth('bearerAuth')
  @ApiBody({ required: true, schema: PROPERTY_REPLACE_BODY })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ operationId: 'replaceProperty', summary: 'Reemplazar la representación editable completa de una propiedad' })
  @ApiResponse({ status: 200 }) @ApiResponse({ status: 400 }) @ApiResponse({ status: 401 }) @ApiResponse({ status: 403 }) @ApiResponse({ status: 404 }) @ApiResponse({ status: 409 }) @ApiResponse({ status: 503 })
  async replace(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: unknown): Promise<PropertyView> {
    const property = await this.replaceProperty.execute(parseUuid(id, 'id'), principal, parseReplaceProperty(body));
    return presentProperty(property, principal);
  }

  @Post(':id/photos')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @UseInterceptors(PhotoUploadInterceptor)
  @ApiBearerAuth('bearerAuth')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ required: true, schema: PROPERTY_PHOTO_BODY })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ operationId: 'addPropertyPhoto', summary: 'Agregar una foto a una propiedad' })
  @ApiResponse({ status: 201 }) @ApiResponse({ status: 400 }) @ApiResponse({ status: 401 }) @ApiResponse({ status: 403 }) @ApiResponse({ status: 404 }) @ApiResponse({ status: 409 }) @ApiResponse({ status: 413 }) @ApiResponse({ status: 415 }) @ApiResponse({ status: 503 })
  async addPhoto(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @UploadedFile() file: { buffer?: Uint8Array } | undefined): Promise<PhotoView> {
    const photo = await this.addPropertyPhoto.execute(parseUuid(id, 'id'), principal, parsePhotoFile(file));
    return presentPhoto(photo);
  }
}

function verificationInput(body: unknown, keys: string[]): { version: number; status: unknown; reason: unknown } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('body');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !keys.includes(key))) return invalid('body');
  const version = input['version'];
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) return invalid('version');
  return { version, status: input['status'], reason: input['reason'] };
}
