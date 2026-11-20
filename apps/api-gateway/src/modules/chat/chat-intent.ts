import { isISO31661Alpha2 } from 'class-validator';

/** Detects explicit quantity questions; this does not infer a location or invent filters. */
export function isCountQuestion(message: string): boolean {
  return /(?:cu[aá]nt[oa]s?|cantidad|n[uú]mero|total)\s+(?:(?:de|hay|son)\s+){0,2}(?:inmb?uebles?|alojamientos?|propiedades?|casas?|apartamentos?|hoteles?)/iu.test(message)
    || /cu[aá]nt[oa]s?\s+(?:inmuebles?|alojamientos?|propiedades?|casas?|apartamentos?|hoteles?)\s+hay/iu.test(message);
}

export function isGlobalCount(message: string, history: string[]): boolean {
  const globalScope = /\b(?:en\s+)?(?:todo|toda)\s+(?:el\s+)?(?:stayhub|cat[aá]logo|plataforma)\b|\ben\s+total\b/iu.test(message);
  return globalScope && (isCountQuestion(message) || history.some(turn => turn.startsWith('Usuario: ') && isCountQuestion(turn.slice(9))));
}

/** A simple city count needs no model inference; more complex questions use the extractor. */
export function simpleCityCount(message: string): string | undefined {
  const match = message.trim().match(/^¿?\s*(?:cu[aá]nt[oa]s?|(?:cantidad|n[uú]mero|total)\s+de)\s+(?:inmuebles?|alojamientos?|propiedades?|casas?|apartamentos?|hoteles?)\s+(?:hay\s+)?en\s+([\p{L}][\p{L}\s.,'-]{0,118})\s*\??$/iu);
  return match?.[1]?.trim();
}

const foldPlace = (text: string): string => text.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/gu, '');
const countries = new Map<string, string>();
const names = new Intl.DisplayNames(['es'], { type: 'region' });
for (const first of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
  for (const second of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const code = first + second;
    if (!isISO31661Alpha2(code)) continue;
    countries.set(code.toLowerCase(), code);
    const name = names.of(code);
    if (name) countries.set(foldPlace(name), code);
  }
}

export function placeFilters(text: string): { location?: string; countryCode?: string } {
  const parts = text.split(',').map(part => part.trim());
  const countryCode = countries.get(foldPlace(parts[parts.length - 1]!));
  if (!countryCode || parts.length > 2) return { location: text };
  return parts.length === 1 ? { countryCode } : { location: parts[0]!, countryCode };
}