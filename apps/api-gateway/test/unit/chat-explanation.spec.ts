import { explainCatalog } from '../../src/modules/chat/chat-explanation';

describe('chat search explanation', () => {
  it('reports applied criteria and returned facts without inventing ranking or missing data', () => {
    const result = explainCatalog({
      filters: { location: 'Bogotá', guests: 2, maxPrice: 200000, currency: 'COP', amenities: ['wifi'] },
      items: [{ name: 'Casa', location: 'Bogotá', capacity: 3, minNightlyPrice: 180000, currency: 'COP', amenities: ['wifi'] }, { name: 'Otra' }],
      details: [{ property: null, reviews: null }],
    });
    expect(result).toContain('ubicación: Bogotá');
    expect(result).toContain('precio máximo: 200000 COP');
    expect(result).toContain('capacidad: 3');
    expect(result).toContain('desde 180000 COP por noche');
    expect(result).toContain('detalles no disponibles');
    expect(result).toContain('no informa por qué ordenó');
    expect(result).toContain('reseñas de algunas propiedades no están disponibles');
    expect(result).not.toContain('disponibilidad es estimada');
  });

  it('labels dates as projected and leaves unsupported criteria out', () => {
    const result = explainCatalog({ filters: { checkIn: '2027-01-01', checkOut: '2027-01-03', maxPrice: 100 }, availabilityKind: 'PROJECTED' });
    expect(result).toContain('2027-01-01 a 2027-01-03');
    expect(result).toContain('disponibilidad es estimada');
    expect(result).not.toContain('precio máximo');
    expect(explainCatalog({ filters: {} })).toContain('No se aplicaron filtros');
  });
});
