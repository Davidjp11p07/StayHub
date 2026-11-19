import { BookingsController } from '../../src/interfaces/http/bookings/bookings.controller';
import { PrismaOwnerBookingHistoryQuery } from '../../src/infrastructure/persistence/prisma/owner-booking-history.query';
import { OwnerBookingHistoryQueryDto } from '../../src/interfaces/http/dto/owner-booking-history.dto';

describe('guest booking history', () => {
  it('uses the verified guest identity and rejects another requested guest', async () => {
    const findGuestPage = jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, hasNext: false });
    const controller = new BookingsController({} as never, {} as never, {} as never, {} as never, {} as never, { findGuestPage } as never);
    const request = { principal: { sub: 'guest-one', role: 'GUEST' } } as never;
    await controller.guestList(new OwnerBookingHistoryQueryDto(), request);
    expect(findGuestPage).toHaveBeenCalledWith(expect.objectContaining({ guestId: 'guest-one' }));
    await expect(controller.guestList(Object.assign(new OwnerBookingHistoryQueryDto(), { guestId: 'guest-two' }), request)).rejects.toThrow();
    await expect(controller.guestList(new OwnerBookingHistoryQueryDto(), { principal: { sub: 'owner', role: 'OWNER' } } as never)).rejects.toThrow();
    expect(findGuestPage).toHaveBeenCalledTimes(1);
  });

  it('constrains both count and results to the authenticated guest', async () => {
    const count = jest.fn().mockReturnValue('count');
    const findMany = jest.fn().mockReturnValue('rows');
    const prisma = { booking: { count, findMany }, $transaction: jest.fn().mockResolvedValue([0, []]) };
    const query = new PrismaOwnerBookingHistoryQuery(prisma as never);
    await query.findGuestPage({ guestId: 'guest-one', page: 1, pageSize: 20 });
    expect(count).toHaveBeenCalledWith({ where: { guestId: 'guest-one' } });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { guestId: 'guest-one' } }));
  });
});
