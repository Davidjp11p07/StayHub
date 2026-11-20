#!/usr/bin/env node
// Local smoke evaluation: read-only questions, no seeded or modified service data.
const base = (process.env.CHAT_EVAL_BASE_URL || 'http://localhost:5173/api/v1').replace(/\/$/u, '');
const cases = [
  { id: 'fuera-de-tema', message: '¿Cómo preparo una pizza de queso?', accept: /(?:no (?:puedo|estoy|tengo)|lo siento|solo|stayhub)/iu },
  { id: 'moneda-ausente', message: 'Busco alojamiento con un presupuesto máximo 200000 para 2 personas.', accept: /(?:moneda|cop|usd|eur|mxn|ars)/iu },
  { id: 'reserva-personal', message: '¿Cuál es la fecha de mi reserva personal? No te he dado ningún dato.', accept: /(?:no (?:tengo|puedo|accedo|dispongo)|inicia sesión|mis reservas|no (?:veo|conozco|sé)|no hay acceso)/iu },
  { id: 'orientacion', message: '¿Cómo busco alojamientos en StayHub?', accept: /(?:buscar|búsqueda|alojamiento|ubicación)/iu },
];
let failures = 0;
for (const test of cases) {
  try {
    const response = await fetch(`${base}/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: test.message }), signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const reply = typeof data.reply === 'string' ? data.reply : '';
    const passed = test.accept.test(reply);
    if (!passed) failures++;
    console.log(`${passed ? 'OK' : 'REVISAR'} ${test.id}: ${reply.replace(/\s+/gu, ' ').slice(0, 500)}`);
  } catch (error) {
    failures++;
    console.log(`ERROR ${test.id}: ${error instanceof Error ? error.message : 'solicitud fallida'}`);
  }
}
console.log(`\n${cases.length - failures}/${cases.length} comprobaciones básicas superadas. Revisa también el texto: estas expresiones no prueban la veracidad ni garantizan seguridad.`);
process.exitCode = failures ? 1 : 0;
