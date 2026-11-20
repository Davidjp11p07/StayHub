import { CreateBookingUseCase } from '@bookings/application/create-booking/create-booking.use-case';
describe('CreateBookingUseCase',()=>{it('uses authoritative quote and exact total',async()=>{const quotes={getQuote:jest.fn().mockResolvedValue({propertyId:'00000000-0000-4000-8000-000000000001',roomId:'00000000-0000-4000-8000-000000000002',ownerId:'00000000-0000-4000-8000-000000000003',propertyName:'P',roomName:'R',propertyStatus:'PUBLISHED',capacity:2,basePrice:{amount:'10.50',currency:'USD'},propertyVersion:1,roomUpdatedAt:'2029-01-01T00:00:00Z'})};const uow={replay:jest.fn().mockResolvedValue(null),create:jest.fn(async({booking})=>({totalAmount:booking.total.toString()}))};const uc=new CreateBookingUseCase(quotes,{now:()=>new Date('2029-01-01T00:00:00Z'),today:()=> '2029-01-01'},uow as never,{paymentHoldMinutes:15} as never);const result=await uc.execute({guestId:'00000000-0000-4000-8000-000000000004',propertyId:'00000000-0000-4000-8000-000000000001',roomId:'00000000-0000-4000-8000-000000000002',checkIn:'2030-01-01',checkOut:'2030-01-03',guests:2,idempotencyKey:'abcdefghijklmnop'});expect(result.totalAmount).toBe('21.00');expect(uow.create).toHaveBeenCalledTimes(1);});});

it.each(['EUR', 'USD'])('rejects %s when only COP can be charged', async currency => {
  const quotes = { getQuote: jest.fn().mockResolvedValue({ basePrice: { amount: '120.00', currency } }) };
  const clock = { now: () => new Date('2029-01-01T00:00:00Z'), today: () => '2029-01-01' };
  const uow = { replay: jest.fn().mockResolvedValue(null), create: jest.fn() };
  const useCase = new CreateBookingUseCase(quotes, clock, uow, {
    paymentHoldMinutes: 15, cancellationPolicyVersion: 'v1', allowedPaymentCurrencies: ['COP'],
  });
  const stay = { guestId: 'guest', propertyId: 'property', roomId: 'room', guests: 1,
    checkIn: '2029-01-02', checkOut: '2029-01-03', idempotencyKey: 'key' };
  await expect(useCase.preview(stay)).rejects.toMatchObject({ code: 'ACCOMMODATION_CONFLICT' });
  await expect(useCase.execute(stay)).rejects.toMatchObject({ code: 'ACCOMMODATION_CONFLICT' });
  expect(uow.create).not.toHaveBeenCalled();
});
