import { loadConfig } from '../src/infrastructure/config';
import { config } from './support';
function environment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { REPORTS_DATABASE_URL: config.databaseUrl };
  for (const [name, settings] of Object.entries({ USER: config.user, GATEWAY: config.gateway, BOOKINGS: config.targets.bookings.jwt, PAYMENTS: config.targets.payments.jwt, ACCOMMODATIONS: config.targets.accommodations.jwt })) {
    for (const [key, value] of Object.entries(settings)) env['REPORTS_' + name + '_' + key.toUpperCase()] = value;
  }
  for (const name of ['BOOKINGS', 'PAYMENTS', 'ACCOMMODATIONS']) env['REPORTS_' + name + '_URL'] = 'http://source';
  return env;
}
describe('Reports fail-closed configuration', () => {
  test('loads real sources by default and explicit demo separately', () => { expect(loadConfig(environment()).mode).toBe('LIVE'); expect(loadConfig({ ...environment(), REPORTS_MODE: 'DEMO', NODE_ENV: 'development' }).mode).toBe('DEMO'); });
  test.each([{ REPORTS_DATABASE_URL: 'postgresql://test:test@db/another_db' }, { REPORTS_TIMEOUT_MS: 'NaN' }, { REPORTS_TIMEOUT_MS: '50' }, { REPORTS_MODE: 'unknown' }, { REPORTS_BOOKINGS_URL: 'file:///secrets' }, { REPORTS_PAYMENTS_URL: 'http://user:password@source' }, { REPORTS_MODE: 'DEMO', NODE_ENV: 'production' }, { REPORTS_USER_KEY: '' }, { REPORTS_USER_KEY: config.targets.bookings.jwt.key }])('rejects invalid configuration %j', overrides => expect(() => loadConfig({ ...environment(), ...overrides })).toThrow());
  test('supports escaped PEM newlines', () => { expect(loadConfig({ ...environment(), REPORTS_USER_KEY: config.user.key.replace(/\n/g, '\\n') }).user.key).toBe(config.user.key); });
});
