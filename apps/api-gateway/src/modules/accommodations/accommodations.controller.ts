import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  PayloadTooLargeException,
  Post,
  Put,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';

import {
  AccommodationsClient,
  type AccommodationsBody,
  type AccommodationsRequestContext,
} from '@gateway/infrastructure/http/accommodations.client';
import { traceIdFromRequest } from '@gateway/interfaces/http/trace-id';
import { extractBearerToken } from '@gateway/modules/auth/jwt.strategy';
import { Public } from '@gateway/modules/auth/public.decorator';
import { Roles } from '@gateway/modules/auth/roles.guard';

import {
  AddPhotoApiDocs,
  CreatePropertyApiDocs,
  GetPropertyApiDocs,
  ReplacePropertyApiDocs,
} from './accommodations.openapi';

export const PROPERTY_PHOTO_MAX_BYTES = 5_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

interface MulterFile {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly originalname: string;
  readonly size: number;
}

/**
 * Rutas públicas de alojamientos (RQ-03/05/06). La validación de negocio y la propiedad del recurso
 * pertenecen a Accommodations; aquí solo se exige rol, se valida la forma del id y se acota la foto.
 */
@Controller('properties')
export class AccommodationsController {
  public constructor(private readonly accommodations: AccommodationsClient) {}

  @Post()
  @Roles('OWNER')
  @CreatePropertyApiDocs()
  public create(@Req() request: Request): Promise<unknown> {
    return this.accommodations.request('POST', '/properties', context(request), json(request));
  }

  /** Pública: sin bearer devuelve solo PUBLISHED; con bearer el dueño ve también sus borradores. */
  @Get(':id')
  @Public()
  @GetPropertyApiDocs()
  public get(@Req() request: Request): Promise<unknown> {
    return this.accommodations.request('GET', `/properties/${propertyId(request)}`, context(request));
  }

  @Put(':id')
  @Roles('OWNER')
  @ReplacePropertyApiDocs()
  public replace(@Req() request: Request): Promise<unknown> {
    return this.accommodations.request('PUT', `/properties/${propertyId(request)}`, context(request), json(request));
  }

  @Post(':id/photos')
  @HttpCode(201)
  @Roles('OWNER')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PROPERTY_PHOTO_MAX_BYTES + 1, files: 1 } }))
  @AddPhotoApiDocs()
  public addPhoto(@Req() request: Request): Promise<unknown> {
    const id = propertyId(request);
    const file = (request as Request & { file?: MulterFile }).file;
    if (file === undefined) throw new BadRequestException({ code: 'VALIDATION_ERROR', errors: [{ field: 'file', code: 'required' }] });
    if (file.size > PROPERTY_PHOTO_MAX_BYTES) throw new PayloadTooLargeException({ code: 'PHOTO_TOO_LARGE' });
    return this.accommodations.request('POST', `/properties/${id}/photos`, context(request), multipart(file));
  }
}

function context(request: Request): AccommodationsRequestContext {
  return { traceId: traceIdFromRequest(request), bearer: extractBearerToken(request) ?? undefined };
}

function propertyId(request: Request): string {
  const id = request.params['id'] ?? '';
  if (!UUID.test(id)) throw new BadRequestException({ code: 'VALIDATION_ERROR', errors: [{ field: 'id', code: 'not_a_uuid' }] });
  return encodeURIComponent(id);
}

function json(request: Request): AccommodationsBody {
  const body: unknown = request.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR' });
  }
  return { bytes: new TextEncoder().encode(JSON.stringify(body)), contentType: 'application/json' };
}

/** Reconstruye el multipart con un único campo `file`; Accommodations decide el tipo por magic bytes. */
export function multipart(file: Pick<MulterFile, 'buffer' | 'mimetype'>): AccommodationsBody {
  const boundary = `stayhub${randomUUID().replace(/-/g, '')}`;
  const mimetype = /^[a-z]+\/[a-z0-9.+-]+$/iu.test(file.mimetype) ? file.mimetype : 'application/octet-stream';
  const bytes = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo"\r\nContent-Type: ${mimetype}\r\n\r\n`),
    file.buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { bytes: new Uint8Array(bytes), contentType: `multipart/form-data; boundary=${boundary}` };
}
