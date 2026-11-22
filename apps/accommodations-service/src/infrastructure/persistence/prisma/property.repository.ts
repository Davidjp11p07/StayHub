import { assertPublishable } from '@accommodations/domain/properties/publication.policy';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type PropertyVerification } from '../generated/prisma';
import { PrismaService } from './prisma.service';
import type { NewPhoto, NewProperty, PropertyRepository } from '@accommodations/application/ports/property.repository';
import type { Photo, PhotoMediaType, Property, ReplacementPlan, RoomData } from '@accommodations/domain/properties/property.types';
import { columnsToLocation, locationToColumns } from '@accommodations/domain/properties/location';
import { DomainError, invalid } from '@accommodations/domain/shared/domain-error';

const include = {
  rooms: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  features: { include: { feature: true }, orderBy: { featureCode: 'asc' } },
  photos: { orderBy: { position: 'asc' } },
} satisfies Prisma.PropertyInclude;
type PropertyRow = Prisma.PropertyGetPayload<{ include: typeof include }>;
type PhotoRow = PropertyRow['photos'][number];
type Tx = Prisma.TransactionClient;
export type PendingVerification = PropertyVerification & { property: { name: string } };
const reviewKey = (propertyId: string, version: number): Prisma.PropertyVerificationWhereUniqueInput => ({ propertyId_version: { propertyId, version } });
const TRANSACTION = { maxWait: 5_000, timeout: 15_000 } as const;

function photoToDomain(row: PhotoRow): Photo {
  return { id: row.id, storageKey: row.storageKey, mediaType: row.mediaType as PhotoMediaType, byteSize: row.byteSize, position: row.position, createdAt: row.createdAt };
}

function toDomain(row: PropertyRow): Property {
  return {
    id: row.id, ownerId: row.ownerId, type: row.type, name: row.name, description: row.description,
    location: columnsToLocation({
      addressLine: row.addressLine, city: row.city, region: row.region, country: row.country, postalCode: row.postalCode,
      latitude: row.latitude === null ? null : row.latitude.toNumber(), longitude: row.longitude === null ? null : row.longitude.toNumber(),
    }),
    status: row.status, version: row.version,
    rooms: row.rooms.map((room) => ({
      id: room.id, name: room.name, capacity: room.capacity,
      ...(room.breakfastAmount != null && room.basePriceCurrency ? { breakfastPerGuestNight: { amount: room.breakfastAmount.toFixed(2), currency: room.basePriceCurrency } } : {}),
      basePrice: room.basePriceAmount === null || room.basePriceCurrency === null ? null : { amount: room.basePriceAmount.toFixed(2), currency: room.basePriceCurrency },
    })),
    features: row.features.map(({ feature }) => ({ code: feature.code, name: feature.name })),
    photos: row.photos.map(photoToDomain),
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

function roomColumns(room: RoomData): { name: string; capacity: number; basePriceAmount: Prisma.Decimal | null; basePriceCurrency: string | null; breakfastAmount: Prisma.Decimal | null } {
  return {
    name: room.name, capacity: room.capacity,
    breakfastAmount: room.breakfastPerGuestNight ? new Prisma.Decimal(room.breakfastPerGuestNight.amount) : null,
    basePriceAmount: room.basePrice ? new Prisma.Decimal(room.basePrice.amount) : null, basePriceCurrency: room.basePrice?.currency ?? null,
  };
}

async function captureReportSupply(tx: Tx, propertyId: string): Promise<void> {
 await tx.$executeRaw`INSERT INTO "ReportSupplyVersion"("propertyId","ownerId","name","roomIds") SELECT p.id,p."ownerId",p.name,CASE WHEN p.status='PUBLISHED' THEN COALESCE((SELECT jsonb_agg(r.id ORDER BY r.id) FROM "Room" r WHERE r."propertyId"=p.id),'[]'::jsonb) ELSE '[]'::jsonb END FROM "Property" p WHERE p.id=${propertyId}::uuid`;
}

async function assertKnownFeatures(tx: Tx, codes: readonly string[]): Promise<void> {
  if (codes.length === 0) return;
  const known = await tx.feature.count({ where: { code: { in: [...codes] } } });
  if (known !== codes.length) invalid('featureCodes');
}

async function lockAndLoad(tx: Tx, id: string): Promise<Property | null> {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Property" WHERE "id" = ${id}::uuid FOR UPDATE`;
  if (locked.length === 0) return null;
  return toDomain(await tx.property.findUniqueOrThrow({ where: { id }, include }));
}

function translate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') invalid('featureCodes');
  throw error;
}

@Injectable()
export class PrismaPropertyRepository implements PropertyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async pendingVerifications(): Promise<PendingVerification[]> {
    return this.prisma.propertyVerification.findMany({
      where: { status: 'PENDING' }, orderBy: [{ requestedAt: 'asc' }, { propertyId: 'asc' }],
      include: { property: { select: { name: true } } },
    });
  }

  async verificationDetail(id: string, principal: { sub: string; role: string }): Promise<{ property: Property; history: PropertyVerification[] }> {
    return this.prisma.$transaction(async tx => {
      const property = await lockAndLoad(tx, id);
      if (!property || (principal.role !== 'VERIFIER' && property.ownerId !== principal.sub)) throw new DomainError('NOT_FOUND');
      const history = await tx.propertyVerification.findMany({ where: { propertyId: id }, orderBy: { version: 'desc' } });
      if (principal.role === 'VERIFIER' && property.status !== 'PUBLISHED' && !history.some(row => row.version === property.version && row.status === 'PENDING')) throw new DomainError('NOT_FOUND');
      return { property, history };
    });
  }

  async submitVerification(id: string, ownerId: string, version: number): Promise<PropertyVerification> {
    return this.prisma.$transaction(async tx => {
      const property = await lockAndLoad(tx, id);
      if (!property || property.ownerId !== ownerId) throw new DomainError('NOT_FOUND');
      if (property.version !== version) throw new DomainError('VERSION_CONFLICT');
      if (property.status === 'PUBLISHED') throw new DomainError('STATE_CONFLICT');
      assertPublishable({ ...property, photoCount: property.photos.length });
      const existing = await tx.propertyVerification.findUnique({ where: reviewKey(id, version) });
      if (existing && existing.status !== 'PENDING') throw new DomainError('STATE_CONFLICT');
      return existing ?? tx.propertyVerification.create({ data: { propertyId: id, version, requestedBy: ownerId, snapshot: {
        nombre: property.name, descripción: property.description, tipo: property.type,
        ubicación: JSON.stringify(property.location), habitaciones: JSON.stringify(property.rooms),
        servicios: property.features.map(row=>row.code), fotos: property.photos.map(row=>row.id),
      } } });
    });
  }

  async decideVerification(id: string, reviewerId: string, version: number, status: 'APPROVED' | 'REJECTED', reason: string): Promise<PropertyVerification> {
    return this.prisma.$transaction(async tx => {
      const property = await lockAndLoad(tx, id);
      if (!property) throw new DomainError('NOT_FOUND');
      if (property.ownerId === reviewerId) throw new DomainError('FORBIDDEN');
      const where = reviewKey(id, version);
      const review = await tx.propertyVerification.findUnique({ where });
      if (!review) throw new DomainError('NOT_FOUND');
      if (review.status === status && review.reviewerId === reviewerId && review.reason === reason) return review;
      if (property.version !== version || review.status !== 'PENDING') throw new DomainError('STATE_CONFLICT');
      if (status === 'APPROVED') {
        assertPublishable({ ...property, photoCount: property.photos.length });
        await tx.property.update({ where: { id }, data: { status: 'PUBLISHED', version: { increment: 1 } } });
        await captureReportSupply(tx, id);
      }
      return tx.propertyVerification.update({ where, data: { status, reason, reviewerId, decidedAt: new Date() } });
    });
  }

  async findByOwner(ownerId: string): Promise<Property[]> {
    const rows = await this.prisma.property.findMany({ where: { ownerId }, include, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return rows.map(toDomain);
  }

  async create(property: NewProperty): Promise<Property> {
    return this.prisma.$transaction(async (tx) => {
      await assertKnownFeatures(tx, property.featureCodes);
      await tx.property.create({
        data: {
          id: property.id, ownerId: property.ownerId, type: property.type, name: property.name, description: property.description,
          ...locationToColumns(property.location),
          rooms: { createMany: { data: property.rooms.map((room) => ({ id: room.id, ...roomColumns(room) })) } },
          features: { createMany: { data: property.featureCodes.map((featureCode) => ({ featureCode })) } },
        },
      });
      await captureReportSupply(tx, property.id);
      return toDomain(await tx.property.findUniqueOrThrow({ where: { id: property.id }, include }));
    }, TRANSACTION).catch(translate);
  }

  async findById(id: string): Promise<Property | null> {
    const row = await this.prisma.property.findUnique({ where: { id }, include });
    return row ? toDomain(row) : null;
  }

  async findByRoomId(roomId: string): Promise<Property | null> {
    const row = await this.prisma.property.findFirst({ where: { rooms: { some: { id: roomId } } }, include });
    return row ? toDomain(row) : null;
  }

  async replace(id: string, decide: (current: Property) => ReplacementPlan): Promise<Property | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await lockAndLoad(tx, id);
      if (!current) return null;
      const plan = decide(current);
      if (plan.status === 'PUBLISHED') throw new DomainError('FORBIDDEN');
      const review = await tx.propertyVerification.findUnique({ where: reviewKey(id, current.version) });
      if (review?.status === 'PENDING') throw new DomainError('STATE_CONFLICT');
      await assertKnownFeatures(tx, plan.featureCodes);
      const kept = plan.rooms.flatMap((room) => (room.id ? [room.id] : []));
      await tx.room.deleteMany({ where: { propertyId: id, id: { notIn: kept } } });
      for (const [index, room] of plan.rooms.entries()) {
        if (!room.id) continue;
        const updated = await tx.room.updateMany({ where: { id: room.id, propertyId: id }, data: roomColumns(room) });
        if (updated.count !== 1) invalid(`rooms[${index}].id`);
      }
      const created = plan.rooms.filter((room) => !room.id).map((room) => ({ id: randomUUID(), propertyId: id, ...roomColumns(room) }));
      if (created.length > 0) await tx.room.createMany({ data: created });
      await tx.propertyFeature.deleteMany({ where: { propertyId: id } });
      if (plan.featureCodes.length > 0) await tx.propertyFeature.createMany({ data: plan.featureCodes.map((featureCode) => ({ propertyId: id, featureCode })) });
      const updated = await tx.property.updateMany({
        where: { id, version: current.version },
        data: { type: plan.type, name: plan.name, description: plan.description, status: plan.status, ...locationToColumns(plan.location), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      await captureReportSupply(tx, id);
      return toDomain(await tx.property.findUniqueOrThrow({ where: { id }, include }));
    }, TRANSACTION).catch(translate);
  }

  async chooseCover(id: string, ownerId: string, photoId: string, version: number): Promise<void> {
    await this.prisma.$transaction(async tx => {
      const current = await lockAndLoad(tx,id);
      if (!current || current.ownerId !== ownerId) throw new DomainError('NOT_FOUND');
      if (current.version !== version) throw new DomainError('VERSION_CONFLICT');
      const review = await tx.propertyVerification.findUnique({where:reviewKey(id,version)});
      if (current.status === 'PUBLISHED' || review?.status === 'PENDING') throw new DomainError('STATE_CONFLICT');
      const chosen = current.photos.find(photo=>photo.id===photoId);
      const first = current.photos[0];
      if (!chosen || !first) throw new DomainError('NOT_FOUND');
      if (first.id === chosen.id) return;
      await tx.$executeRaw`SET CONSTRAINTS "Photo_propertyId_position_key" DEFERRED`;
      await tx.photo.update({where:{id:first.id},data:{position:chosen.position}});
      await tx.photo.update({where:{id:chosen.id},data:{position:first.position}});
      await tx.property.update({where:{id},data:{version:{increment:1}}});
    });
  }

  async addPhoto(id: string, decide: (current: Property) => Promise<NewPhoto>): Promise<Photo | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await lockAndLoad(tx, id);
      if (!current) return null;
      const review = await tx.propertyVerification.findUnique({ where: reviewKey(id, current.version) });
      if (current.status === 'PUBLISHED' || review?.status === 'PENDING') throw new DomainError('STATE_CONFLICT');
      const photo = await decide(current);
      if (review) await tx.property.update({ where: { id }, data: { version: { increment: 1 } } });
      return photoToDomain(await tx.photo.create({ data: { ...photo, propertyId: id } }));
    }, TRANSACTION);
  }
}
