import { describe, expect, it } from 'vitest';
import { currencyReply } from './chatCurrency';

describe('currencyReply', () => {
  it('converts COP to USD from the prior price without changing the original amount', () => {
    expect(currencyReply('¿En USD?', [{ role: 'assistant', text: 'El precio es 250.000 COP por noche.' }])).toContain('250.000 COP equivalen aproximadamente a 75,76 USD');
  });
  it('handles direct conversions, inverse conversions and cross rates', () => {
    expect(currencyReply('Convertir 2 USD a COP', [])).toContain('6.600 COP');
    expect(currencyReply('Convertir 3626 COP a EUR', [])).toContain('1 EUR');
    expect(currencyReply('Convertir 1 GBP a USD', [])).toContain('1,32 USD');
  });
  it('handles currency synonyms and a follow-up conversion', () => {
    const prior = [{ role: 'assistant' as const, text: '250.000 COP equivalen aproximadamente a 75,76 USD. Cálculo con las tasas fijas de referencia indicadas; no son tasas en tiempo real.' }];
    expect(currencyReply('en ddolares cuanto es', prior)).toContain('75,76 USD');
    expect(currencyReply('¿Y en euros?', prior)).toContain('68,95 EUR');
  });
  it('rejects unsupported currencies and asks for an unambiguous source amount', () => {
    expect(currencyReply('Convertir 1000 COP a MXN', [])).toContain('Solo puedo convertir');
    expect(currencyReply('Convertir 1000 MXN a USD', [])).toContain('Solo puedo convertir');
    expect(currencyReply('Convertir 1000 COP a rupias', [])).toContain('Solo puedo convertir');
    expect(currencyReply('Convertir USD 2 a COP', [])).toContain('6.600 COP');
    expect(currencyReply('¿Cuánto es en GBP?', [])).toContain('único importe');
    expect(currencyReply('¿En USD?', [{ role: 'assistant', text: 'Una cuesta 50000 COP y otra 75000 COP.' }])).toContain('único importe');
  });
  it('does not intercept a new search in a supported currency', () => {
    expect(currencyReply('Busca alojamientos con precio en USD', [])).toBeNull();
  });
});
