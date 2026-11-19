type Currency = 'COP' | 'USD' | 'EUR' | 'GBP';
type Turn = { role: 'user' | 'assistant'; text: string };

// User-supplied reference rates, expressed in COP per unit. These are not live rates.
const COP_PER_UNIT: Record<Currency, number> = { COP: 1, USD: 3300, EUR: 3626, GBP: 4353 };
const TOKEN = '(?:COP|USD|EUR|GBP|MXN|ARS|CAD|BRL|JPY|CHF|AUD|INR|CNY|CLP|PEN|d+olares?|pesos?|euros?|libras?|yenes?|yuanes?|reales?|francos?|bolivares?|soles?)';

function currency(token: string): Currency | undefined {
  const word = token.toUpperCase();
  if (word === 'COP' || /^PESOS?$/u.test(word)) return 'COP';
  if (word === 'USD' || /^D+OLARES?$/u.test(word)) return 'USD';
  if (word === 'EUR' || /^EUROS?$/u.test(word)) return 'EUR';
  if (word === 'GBP' || /^LIBRAS?$/u.test(word)) return 'GBP';
  return undefined;
}

function amount(raw: string): number | undefined {
  // Both 250.000 and 250,000 are grouped integers; decimals may use a comma or dot.
  let value: string;
  if (/^\d{1,3}(?:[.,]\d{3})+$/u.test(raw)) value = raw.replace(/[.,]/gu, '');
  else if (/^\d+(?:[.,]\d{1,2})?$/u.test(raw)) value = raw.replace(',', '.');
  else return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1_000_000_000_000 ? parsed : undefined;
}

function moneyIn(text: string): Array<{ value: number; code: Currency }> {
  const out: Array<{ value: number; code: Currency }> = [];
  const pattern = new RegExp(`(?<![\\d.,-])(\\d[\\d.,]*)\\s*(${TOKEN})(?![a-z])`, 'giu');
  for (const match of text.matchAll(pattern)) {
    const value = amount(match[1]!);
    const code = currency(match[2]!);
    if (value !== undefined && code) out.push({ value, code });
  }
  const prefix = new RegExp(`\\b(${TOKEN})\\s+(\\d[\\d.,]*)(?![\\d.,])`, 'giu');
  for (const match of text.matchAll(prefix)) {
    const value = amount(match[2]!);
    const code = currency(match[1]!);
    if (value !== undefined && code) out.push({ value, code });
  }
  return out;
}

/** Returns null when the message is not a currency-conversion request. */
export function currencyReply(text: string, history: Turn[]): string | null {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f¿¡]/gu, '').trim();
  const mentionsMoney = new RegExp(`\\b${TOKEN}\\b`, 'iu').test(normalized);
  const explicit = /\b(?:convertir|conversion|convertirlo|cambiar|equivale|equivalen|cuanto|cuantos|cuanta|cuantas|tipo de cambio|tasa de cambio)\b/iu.test(normalized);
  const targetPattern = new RegExp(`\\b(?:en|a)\\s+(${TOKEN})\\b`, 'iu');
  const targetMatch = normalized.match(targetPattern) ?? normalized.match(new RegExp(`\\bcuantos?\\s+(${TOKEN})\\b`, 'iu'));
  const bareCurrency = normalized.match(new RegExp(`^(?:y\\s+)?(${TOKEN})[\\s?!.]*$`, 'iu'));
  const lastPrice = [...history].reverse().find(turn => turn.role === 'assistant' && moneyIn(turn.text).length > 0);
  const previousAmounts = lastPrice ? moneyIn(lastPrice.text.includes('Cálculo con las tasas fijas') ? lastPrice.text.split(' equivalen ')[0]! : lastPrice.text) : [];
  const conversion = (mentionsMoney || (explicit && /\d/u.test(normalized))) && (explicit || Boolean(targetMatch && (previousAmounts.length || moneyIn(normalized).length)) || Boolean(bareCurrency && previousAmounts.length));
  if (!conversion) return null;
  const otherTarget = normalized.match(/\b(?:en|a)\s+([a-z]{3,})\b/iu);
  const targetWord = targetMatch?.[1] ?? bareCurrency?.[1] ?? otherTarget?.[1];
  if (!targetWord) return '¿A qué moneda quieres convertir el precio? Puedo usar COP, USD, EUR o GBP.';
  const targetCode = currency(targetWord);
  if (!targetCode) return 'Solo puedo convertir entre COP, USD, EUR y GBP con las tasas de referencia indicadas.';
  const sourceToken = normalized.match(new RegExp(`(?<![\\d.,-])\\d[\\d.,]*\\s*(${TOKEN})(?![a-z])`, 'iu'))?.[1] ?? normalized.match(/(?<![\d.,-])\d[\d.,]*\s*([A-Z]{3})\b/u)?.[1];
  if (sourceToken && !currency(sourceToken)) return 'Solo puedo convertir entre COP, USD, EUR y GBP con las tasas de referencia indicadas.';
  const currentAmounts = moneyIn(normalized);
  const sources = currentAmounts.length ? currentAmounts : previousAmounts;
  if (sources.length !== 1) return 'Indica un único importe y su moneda de origen, por ejemplo: 250000 COP a USD.';
  const source = sources[0]!;
  const result = source.value * COP_PER_UNIT[source.code] / COP_PER_UNIT[targetCode];
  const formatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
  return `${formatter.format(source.value)} ${source.code} equivalen aproximadamente a ${formatter.format(result)} ${targetCode}. Cálculo con las tasas fijas de referencia indicadas; no son tasas en tiempo real.`;
}
