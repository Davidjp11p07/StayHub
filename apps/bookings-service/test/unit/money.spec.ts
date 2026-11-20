import { Money } from '@bookings/domain/money/money';
describe('Money',()=>{ it('keeps decimal arithmetic exact',()=>expect(Money.parse('10.10','USD').multiply(3).toString()).toBe('30.30')); it.each([['0.00','USD'],['1.001','USD'],['1.00','usd']])('rejects invalid money',(a,c)=>expect(()=>Money.parse(a,c)).toThrow()); });

describe('room and breakfast charges', () => {
  it('adds guest-night charges without rounding intermediate amounts', () => {
    const lodging = Money.parse('90.01', 'EUR').multiply(3);
    const breakfast = Money.parse('0.29', 'EUR').multiply(2).multiply(3);
    expect(lodging.add(breakfast).toString()).toBe('271.77');
  });

  it('rejects a breakfast denominated in another currency', () => {
    expect(() => Money.parse('10.00', 'COP').add(Money.parse('1.00', 'USD'))).toThrow('VALIDATION_ERROR');
  });
});
