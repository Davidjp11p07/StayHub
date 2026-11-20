type Item = { name?: unknown; location?: unknown; capacity?: unknown; minNightlyPrice?: unknown; currency?: unknown; amenities?: unknown };
export interface CatalogExplanationData {
  outOfScope?: boolean;
  total?: number;
  filterSource?: 'text' | 'ollama' | 'global';
  filters?: Record<string, unknown>;
  availabilityKind?: string | null;
  items?: Item[];
  details?: Array<{ property?: unknown; reviews?: unknown }>;
}

/** Describe only the query and facts returned by Search, without inferring its ranking. */
export function explainCatalog(data: CatalogExplanationData): string {
  const f = data.filters ?? {};
  const criteria: string[] = [];
  if (typeof f.q === 'string') criteria.push(`nombre: ${f.q}`);
  if (typeof f.countryCode === 'string') criteria.push('país: ' + f.countryCode);
  if (typeof f.location === 'string') criteria.push(`ubicación: ${f.location}`);
  if (typeof f.checkIn === 'string' && typeof f.checkOut === 'string') criteria.push(`fechas: ${f.checkIn} a ${f.checkOut}`);
  if (typeof f.guests === 'number') criteria.push(`huéspedes: ${f.guests}`);
  if (typeof f.currency === 'string') {
    if (typeof f.minPrice === 'number') criteria.push(`precio mínimo: ${f.minPrice} ${f.currency}`);
    if (typeof f.maxPrice === 'number') criteria.push(`precio máximo: ${f.maxPrice} ${f.currency}`);
  }
  if (Array.isArray(f.amenities) && f.amenities.every(a => typeof a === 'string') && f.amenities.length) criteria.push(`servicios: ${f.amenities.join(', ')}`);
  const lines = ['Fuente consultada: Search (catálogo público de alojamientos).'];
  if (data.filterSource === 'ollama') lines.push('Se intentó extraer los filtros con Ollama y se comprobaron contra el texto de la consulta.');
  if (data.filterSource === 'text') lines.push('La ubicación se tomó directamente del texto de la pregunta.');
  if (data.filterSource === 'global') lines.push('La pregunta solicitó el catálogo completo.');
  if (Array.isArray(data.details) && data.details.some(detail => detail && typeof detail === 'object')) lines.push('También se consultaron Accommodations y Reviews para una muestra de hasta tres resultados.');
  if (typeof data.total === 'number') lines.push(`Resultados recuperados: ${data.total}.`);
  lines.push(criteria.length ? `Filtros enviados al buscador: ${criteria.join('; ')}.` : 'No se aplicaron filtros de búsqueda.');
  if (Array.isArray(data.items) && data.items.length) {
    lines.push('Datos publicados de algunos resultados:');
    for (const item of data.items.slice(0, 3)) {
      const facts: string[] = [];
      if (typeof item.location === 'string') facts.push(`ubicación: ${item.location}`);
      if (typeof item.capacity === 'number') facts.push(`capacidad: ${item.capacity}`);
      if (typeof item.minNightlyPrice === 'number' && typeof item.currency === 'string') facts.push(`desde ${item.minNightlyPrice} ${item.currency} por noche`);
      if (Array.isArray(item.amenities) && item.amenities.every(a => typeof a === 'string') && item.amenities.length) facts.push(`servicios: ${item.amenities.join(', ')}`);
      lines.push(`• ${typeof item.name === 'string' ? item.name : 'Alojamiento'}: ${facts.length ? facts.join('; ') : 'detalles no disponibles'}.`);
    }
    lines.push('Es una muestra; el buscador no informa por qué ordenó estos resultados.');
    if (Array.isArray(data.details) && data.details.some(detail => detail.property === null)) lines.push('Los detalles de algunas propiedades no están disponibles.');
    if (Array.isArray(data.details) && data.details.some(detail => detail.reviews === null)) lines.push('Las reseñas de algunas propiedades no están disponibles.');
  }
  if (data.availabilityKind === 'PROJECTED') lines.push('La disponibilidad es estimada y se confirma al reservar.');
  return lines.join('\n');
}
