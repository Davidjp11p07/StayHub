import { createHash } from 'node:crypto';
import { ACCOMMODATION_QUOTE_PORT, type AccommodationQuotePort } from '@bookings/application/ports/accommodation-quote.port';
import { CLOCK_PORT, type ClockPort } from '@bookings/application/ports/clock.port';
import { CREATE_BOOKING_UOW, type CreateBookingUnitOfWork, type StoredBooking } from '@bookings/application/ports/create-booking.unit-of-work';
import type { BookingSettings } from '@bookings/application/ports/booking-settings.port';
import { StayPeriod } from '@bookings/domain/bookings/stay-period';
import { Money } from '@bookings/domain/money/money';
import { DomainError, invalid } from '@bookings/domain/shared/domain-error';
import { Booking } from '@bookings/domain/bookings/booking';

export interface CreateBookingCommand { guestId: string; propertyId: string; roomId: string; checkIn: string; checkOut: string; guests: number; breakfastSelected?: boolean; expectedPropertyVersion?: number; idempotencyKey: string; traceId?: string; }
export class CreateBookingUseCase {
  public static readonly dependencies = [ACCOMMODATION_QUOTE_PORT, CLOCK_PORT, CREATE_BOOKING_UOW] as const;
  public constructor(private readonly quotes: AccommodationQuotePort, private readonly clock: ClockPort, private readonly uow: CreateBookingUnitOfWork, private readonly config: BookingSettings) {}
  private async price(command: Omit<CreateBookingCommand, 'idempotencyKey'>): Promise<Booking> {
    const period = StayPeriod.create(command.checkIn, command.checkOut, this.clock.today());
    const quote = await this.quotes.getQuote(command.propertyId, command.roomId, command.guests, command.traceId);
    if (command.expectedPropertyVersion !== undefined && command.expectedPropertyVersion !== quote.propertyVersion) {
      throw new DomainError('ACCOMMODATION_CONFLICT');
    }
    const currencies = this.config.allowedPaymentCurrencies ?? ['COP', 'USD'];
    if (!currencies.includes(quote.basePrice.currency)) {
      throw new DomainError('ACCOMMODATION_CONFLICT', 'basePrice.currency');
    }
    const rate = quote.breakfastPerGuestNight;
    if (command.breakfastSelected && !rate) throw new DomainError('ACCOMMODATION_CONFLICT');
    return new Booking({
      guestId: command.guestId, guests: command.guests, period,
      nightlyPrice: Money.parse(quote.basePrice.amount, quote.basePrice.currency),
      ...(command.breakfastSelected && rate ? { breakfastUnitPrice: Money.parse(rate.amount, rate.currency) } : {}),
      snapshot: {
        propertyId: quote.propertyId, roomId: quote.roomId, ownerId: quote.ownerId, propertyName: quote.propertyName,
        roomName: quote.roomName, capacity: quote.capacity, propertyVersion: quote.propertyVersion,
        roomUpdatedAt: new Date(quote.roomUpdatedAt),
      },
      holdExpiresAt: new Date(this.clock.now().getTime() + this.config.paymentHoldMinutes * 60_000),
    });
  }

  public async preview(command: Omit<CreateBookingCommand, 'idempotencyKey'>): Promise<BookingPricePreview> {
    const booking = await this.price(command);
    return {
      propertyVersion: booking.data.snapshot.propertyVersion, currency: booking.total.currency,
      lodging: booking.lodging.toString(), breakfast: booking.breakfast?.toString() ?? '0.00', total: booking.total.toString(),
    };
  }

  public async execute(command: CreateBookingCommand): Promise<StoredBooking> {
    if (command.breakfastSelected && command.expectedPropertyVersion === undefined) invalid('expectedPropertyVersion');
    const canonical = JSON.stringify({
      propertyId: command.propertyId, roomId: command.roomId, checkIn: command.checkIn, checkOut: command.checkOut, guests: command.guests,
      ...(command.breakfastSelected ? { breakfastSelected: true } : {}),
      ...(command.expectedPropertyVersion !== undefined ? { expectedPropertyVersion: command.expectedPropertyVersion } : {}),
    });
    const requestHash = createHash('sha256').update(canonical).digest('hex');
    const existing = await this.uow.replay(command.guestId, command.idempotencyKey, requestHash);
    if (existing) return existing;
    const booking = await this.price(command);
    return this.uow.create({ booking, idempotencyKey: command.idempotencyKey, requestHash, ...(command.traceId ? { traceId: command.traceId } : {}) });
  }
}

export interface BookingPricePreview { propertyVersion: number; currency: string; lodging: string; breakfast: string; total: string }
