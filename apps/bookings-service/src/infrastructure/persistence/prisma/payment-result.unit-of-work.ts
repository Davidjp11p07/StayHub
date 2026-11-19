import { Injectable } from '@nestjs/common';
import type { PaymentResultEvent, PaymentResultUnitOfWork } from '@bookings/application/ports/payment-saga.port';
import { DomainError } from '@bookings/domain/shared/domain-error';
import { PrismaService } from './prisma.service';
import { Prisma } from '../generated/client';

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class PrismaPaymentResultUnitOfWork implements PaymentResultUnitOfWork {
  public constructor(private readonly prisma: PrismaService) {}

  public async apply(event: PaymentResultEvent, hash: string): Promise<'APPLIED' | 'DUPLICATE'> {
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.processedEvent.findUnique({ where: { eventId: event.eventId } });
      if (prior) {
        if (prior.payloadHash !== hash) throw new DomainError('EVENT_ID_CONFLICT');
        return 'DUPLICATE';
      }

      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${event.bookingId}::uuid FOR UPDATE`;
      const booking = await tx.booking.findUnique({ where: { id: event.bookingId } });
      if (!booking) throw new DomainError('PAYMENT_BOOKING_MISMATCH');
      if (!booking.paymentOrderId) throw new DomainError('PAYMENT_BOOKING_NOT_READY');
      if (booking.paymentOrderId !== event.paymentId) throw new DomainError('PAYMENT_BOOKING_MISMATCH');

      let outcome = 'IGNORED_TERMINAL';

      if (event.eventType === 'payment.v1.approved') {
        if ((booking.status === 'CANCELLED_BY_GUEST' || booking.status === 'CANCELLED_BY_OWNER') && (booking.paymentStatus === 'PENDING' || booking.paymentStatus === 'REVIEW_REQUIRED')) {
          const transition = await tx.bookingTransition.findFirst({ where: { bookingId: booking.id, toStatus: booking.status }, orderBy: { occurredAt: 'desc' } });
          const metadata = transition?.metadata as { refundAmount?: unknown } | undefined;
          const amount = booking.status === 'CANCELLED_BY_OWNER' ? booking.totalAmount : typeof metadata?.refundAmount === 'string' && /^\d+(\.\d{1,2})?$/.test(metadata.refundAmount) ? new Prisma.Decimal(metadata.refundAmount) : null;
          if (amount && amount.greaterThanOrEqualTo(0) && amount.lessThanOrEqualTo(booking.totalAmount)) {
            if (amount.greaterThan(0)) await tx.paymentWork.upsert({ where: { bookingId_operation: { bookingId: booking.id, operation: 'REQUEST_REFUND' } }, update: {}, create: { id: crypto.randomUUID(), bookingId: booking.id, operation: 'REQUEST_REFUND', idempotencyKey: `booking:${booking.id}:refund`, amount, currency: booking.currency } });
            await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: amount.greaterThan(0) ? 'REFUND_PENDING' : 'CAPTURED', version: { increment: 1 } } });
            outcome = 'APPLIED';
          } else {
            await tx.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'REVIEW_REQUIRED', version: { increment: 1 } } });
            outcome = 'REVIEW_REQUIRED';
          }
        }
        if (booking.status === 'PENDING_PAYMENT') {
          const changed = await tx.booking.updateMany({
            where: { id: booking.id, status: 'PENDING_PAYMENT' },
            data: { status: 'CONFIRMED', paymentStatus: 'CAPTURED', holdExpiresAt: null, version: { increment: 1 } },
          });
          if (changed.count === 1) {
            await tx.bookingTransition.create({ data: { id: crypto.randomUUID(), bookingId: booking.id, fromStatus: 'PENDING_PAYMENT', toStatus: 'CONFIRMED', actorType: 'SYSTEM', reasonCode: 'PAYMENT_CONFIRMED', metadata: { eventId: event.eventId, paymentId: event.paymentId } } });
            const checkIn = dateOnly(booking.checkIn);
            const payload = {
              bookingId: booking.id,
              guestId: booking.guestId,
              propertyName: booking.propertyName,
              roomName: booking.roomName,
              checkIn,
              checkOut: dateOnly(booking.checkOut),
              guests: booking.guests,
              totalPrice: booking.totalAmount.toFixed(2),
              checkInAt: `${checkIn}T00:00:00.000Z`,
            };
            await tx.outboxEvent.create({ data: { id: crypto.randomUUID(), aggregateId: booking.id, eventType: 'booking.v1.confirmed', payload } });
            await tx.notificationWork.create({ data: { id: crypto.randomUUID(), bookingId: booking.id, operation: 'BOOKING_CONFIRMED', status: 'PENDING', nextAttemptAt: new Date() } });
            outcome = 'APPLIED';
          }
        }
      } else if (event.eventType === 'payment.v1.declined' || event.eventType === 'payment.v1.failed') {
        if (booking.status === 'PENDING_PAYMENT') {
          const changed = await tx.booking.updateMany({
            where: { id: booking.id, status: 'PENDING_PAYMENT' },
            data: { status: 'PAYMENT_FAILED', paymentStatus: 'FAILED', holdExpiresAt: null, version: { increment: 1 } },
          });
          if (changed.count === 1) {
            const reasonCode = event.eventType === 'payment.v1.declined' ? 'PAYMENT_DECLINED' : 'PAYMENT_FAILED_FINAL';
            await tx.bookingTransition.create({ data: { id: crypto.randomUUID(), bookingId: booking.id, fromStatus: 'PENDING_PAYMENT', toStatus: 'PAYMENT_FAILED', actorType: 'SYSTEM', reasonCode, metadata: { eventId: event.eventId, paymentId: event.paymentId, failureCode: event.failureCode } } });
            outcome = 'APPLIED';
          }
        }
      } else if (event.eventType === 'payment.v1.review_required') {
        if (booking.status === 'PENDING_PAYMENT' && booking.paymentStatus !== 'REVIEW_REQUIRED') {
          const changed = await tx.booking.updateMany({
            where: { id: booking.id, status: 'PENDING_PAYMENT', paymentStatus: { not: 'REVIEW_REQUIRED' } },
            data: { paymentStatus: 'REVIEW_REQUIRED', version: { increment: 1 } },
          });
          if (changed.count === 1) {
            await tx.bookingTransition.create({ data: { id: crypto.randomUUID(), bookingId: booking.id, fromStatus: 'PENDING_PAYMENT', toStatus: 'PENDING_PAYMENT', actorType: 'SYSTEM', reasonCode: 'PAYMENT_REVIEW_REQUIRED', metadata: { eventId: event.eventId, paymentId: event.paymentId, reasonCode: event.reasonCode } } });
            outcome = 'APPLIED';
          }
        }
      }

      await tx.processedEvent.create({ data: { eventId: event.eventId, eventType: event.eventType, payloadHash: hash, outcome } });
      return 'APPLIED';
    });
  }
}
