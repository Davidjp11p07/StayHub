import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  PayloadTooLargeException,
  Post,
  Put,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';

import {
  AccommodationsClient,
  type AccommodationsBody,
  type AccommodationsMultipart,
  type AccommodationsRequestContext,
} from '@gateway/infrastructure/http/accommodations.client';
import { traceIdFromRequest } from '@gateway/interfaces/http/trace-id';
import { extractBearerToken } from '@gateway/modules/auth/jwt.strategy';
import { OptionalAuth } from '@gateway/modules/auth/public.decorator';
import { Roles } from '@gateway/modules/auth/roles.guard';
import { PHOTO_MAX_BYTES } from '@gateway/modules/users/profile-streaming.interceptor';

import {
  AddPropertyPhotoApiDocs,
  CreatePropertyApiDocs,
  GetPropertyApiDocs,
  ReplacePropertyApiDocs,
} from './accommodations.openapi';

/**
 * Rutas públicas de alojamientos hacia Accommodations (RQ-03, RQ-05, RQ-06).
 *
 * - `GET /properties/{id}`: anónima; con bearer se valida e introspecciona y se reenvía para que el
 *   propietario vea sus borradores.
 * - `POST /properties`, `PUT /properties/{id}`, `POST /properties/{id}/photos`: rol OWNER.
 *
 * El Gateway no duplica las reglas de negocio: el cuerpo JSON se reenvía tal cual (Accommodations
 * aplica su validación estricta) y solo se acota aquí el tamaño de la foto (5.000.000 bytes).
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export const PROPERTY_PHOTO_MAX_BYTES = PHOTO_MAX_BYTES;
const MULTER_FILE_LIMIT = PHOTO_MAX_BYTES + 1;

interface MulterFile {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly size: number;
  readonly originalname?: string;
}

type MultipartRequest = Request & { file?: MulterFile };

@Controller('properties')
export class AccommodationsController {
  public constructor(private readonly accommodations: AccommodationsClient) {}

  @Get()
  @Roles('OWNER')
  public listMine(@Req() request: Request): Promise<unknown> {
    if (request.query['mine'] !== 'true' || Object.keys(request.query).length !== 1) throw new BadRequestException({ code: 'INVALID_QUERY_PARAMETER' });
    return this.accommodations.request('GET', '/properties?mine=true', contextOf(request));
  }

  @Get('verification/pending')
  @Roles('VERIFIER')
  pendingReviews(@Req() request: Request): Promise<unknown> {
    return this.accommodations.request('GET', '/properties/verification/pending', contextOf(request));
  }

  @Get(':propertyId/verification')
  @Roles('OWNER', 'VERIFIER')
  verification(@Req() request: Request): Promise<unknown> {
    return this.accommodations.request('GET', `/properties/${propertyIdOf(request)}/verification`, contextOf(request));
  }

  @Post(':propertyId/verification')
  @HttpCode(200)
  @Roles('OWNER')
  submit(@Req() request: Request, @Body() body: unknown): Promise<unknown> {
    return this.accommodations.request('POST', `/properties/${propertyIdOf(request)}/verification`, contextOf(request), verificationBody(body));
  }

  @Post(':propertyId/verification/decision')
  @HttpCode(200)
  @Roles('VERIFIER')
  decide(@Req() request: Request, @Body() body: unknown): Promise<unknown> {
    return this.accommodations.request('POST', `/properties/${propertyIdOf(request)}/verification/decision`, contextOf(request), verificationBody(body));
  }

  @Get(':propertyId/photos/:photoId')
  @OptionalAuth()
  public async getPhoto(@Req() request: Request, @Res() response: Response): Promise<void> {
    const photoId = request.params['photoId'] ?? '';
    if (!UUID_PATTERN.test(photoId)) throw new BadRequestException({ code: 'VALIDATION_ERROR' });
    const result = await this.accommodations.getPhoto(propertyIdOf(request), photoId, contextOf(request));
    response.setHeader('Content-Type', result.headers['content-type'] ?? 'application/octet-stream');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(Buffer.from(result.body));
  }

  @Post()
  @HttpCode(201)
  @Roles('OWNER')
  @CreatePropertyApiDocs()
  public create(@Body() body: unknown, @Req() request: Request): Promise<unknown> {
    return this.accommodations.createProperty(body, contextOf(request));
  }

  @Get(':propertyId')
  @OptionalAuth()
  @GetPropertyApiDocs()
  public get(@Req() request: Request): Promise<unknown> {
    return this.accommodations.getProperty(propertyIdOf(request), contextOf(request));
  }

  @Put(':propertyId')
  @Roles('OWNER')
  @ReplacePropertyApiDocs()
  public replace(@Body() body: unknown, @Req() request: Request): Promise<unknown> {
    return this.accommodations.replaceProperty(propertyIdOf(request), body, contextOf(request));
  }

  @Post(':propertyId/photos')
  @HttpCode(201)
  @Roles('OWNER')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTER_FILE_LIMIT, files: 1 } }))
  @AddPropertyPhotoApiDocs()
  public addPhoto(@Req() request: Request): Promise<unknown> {
    const propertyId = propertyIdOf(request);
    const multipart = photoMultipart((request as MultipartRequest).file);
    return this.accommodations.addPhoto(propertyId, multipart, contextOf(request));
  }
}

function contextOf(request: Request): AccommodationsRequestContext {
  return { traceId: traceIdFromRequest(request), bearer: extractBearerToken(request) ?? '' };
}

function propertyIdOf(request: Request): string {
  const id = request.params['propertyId'] ?? '';
  if (!UUID_PATTERN.test(id)) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      errors: [{ field: 'id', code: 'INVALID_VALUE' }],
    });
  }
  return id;
}

function photoMultipart(file: MulterFile | undefined): AccommodationsMultipart {
  if (file === undefined || file.size === 0) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      errors: [{ field: 'file', code: 'INVALID_VALUE' }],
    });
  }
  if (file.size > PHOTO_MAX_BYTES) {
    throw new PayloadTooLargeException({ code: 'PHOTO_TOO_LARGE' });
  }
  const boundary = `stayhub${randomUUID().replace(/-/g, '')}`;
  const filename = safeFilename(file.originalname);
  const mimetype = /^[\w.+-]+\/[\w.+-]+$/u.test(file.mimetype) ? file.mimetype : 'application/octet-stream';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
    ),
    file.buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body: new Uint8Array(body), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** Helper conservado para las pruebas y consumidores existentes del adaptador. */
export function multipart(file: Pick<MulterFile, 'buffer' | 'mimetype'>): AccommodationsBody {
  const value = buildPhotoMultipart(file.buffer, file.mimetype, undefined);
  return { bytes: value.body, contentType: value.contentType };
}

function buildPhotoMultipart(buffer: Buffer, mimetypeValue: string, originalname: string | undefined): AccommodationsMultipart {
  const boundary = `stayhub${randomUUID().replace(/-/g, '')}`;
  const filename = safeFilename(originalname);
  const mimetype = /^[\w.+-]+\/[\w.+-]+$/u.test(mimetypeValue) ? mimetypeValue : 'application/octet-stream';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body: new Uint8Array(body), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** El nombre original no se confía: solo caracteres seguros para la cabecera multipart. */
function safeFilename(name: string | undefined): string {
  const cleaned = (name ?? '').replace(/[^A-Za-z0-9._-]/gu, '').slice(0, 100);
  return cleaned === '' ? 'photo' : cleaned;
}

function verificationBody(body: unknown): AccommodationsBody {
  return { bytes: Buffer.from(JSON.stringify(body ?? null)), contentType: 'application/json' };
}
