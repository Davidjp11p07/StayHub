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
  const match = message.trim().match(/^¿?\s*(?:cu[aá]nt[oa]s?|(?:cantidad|n[uú]mero|total)\s+de)\s+(?:inmuebles?|alojamientos?|propiedades?|casas?|apartamentos?|hoteles?)\s+(?:hay\s+)?en\s+([\p{L}][\p{L}\s.'-]{0,118})\s*\??$/iu);
  return match?.[1]?.trim();
}
