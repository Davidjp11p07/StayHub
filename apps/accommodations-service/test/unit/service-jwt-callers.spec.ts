import { INVENTORY_SCOPE, INVENTORY_SERVICE_ISSUER, SERVICE_ISSUER, SERVICE_SCOPE, inventoryServiceToken, serviceToken, testConfig } from '../fixtures/config.fixture';
import { verifyServiceToken } from '../../src/infrastructure/security/service-jwt.verifier';

/** T027: each caller has its own key and only the scopes explicitly granted to it. */
describe('service JWT callers and per-endpoint scopes', () => {
  const config = testConfig();

  it('accepts Booking Quote with its own scope and Inventory with the inventory scope', () => {
    expect(verifyServiceToken(serviceToken(), config, SERVICE_SCOPE)).toMatchObject({ scopes: [SERVICE_SCOPE] });
    expect(verifyServiceToken(inventoryServiceToken(), config, INVENTORY_SCOPE)).toMatchObject({ scopes: [INVENTORY_SCOPE] });
  });

  it('rejects a caller using a scope granted to another endpoint', () => {
    expect(() => verifyServiceToken(serviceToken(), config, INVENTORY_SCOPE)).toThrow('INVALID_SERVICE_TOKEN');
    expect(() => verifyServiceToken(inventoryServiceToken(), config, SERVICE_SCOPE)).toThrow('INVALID_SERVICE_TOKEN');
    expect(() => verifyServiceToken(serviceToken(SERVICE_ISSUER, INVENTORY_SCOPE), config, INVENTORY_SCOPE)).toThrow('INVALID_SERVICE_TOKEN');
  });

  it('rejects unknown issuers and keys', () => {
    expect(() => verifyServiceToken(serviceToken('stayhub-bookings-service', SERVICE_SCOPE, { iss: 'unknown-caller' }), config, SERVICE_SCOPE)).toThrow('INVALID_SERVICE_TOKEN');
    expect(() => verifyServiceToken(serviceToken('stayhub-bookings-service', SERVICE_SCOPE, {}, { keyid: 'unknown-kid' }), config, SERVICE_SCOPE)).toThrow('INVALID_SERVICE_TOKEN');
    expect(() => verifyServiceToken(inventoryServiceToken(INVENTORY_SERVICE_ISSUER, INVENTORY_SCOPE, { iss: 'other' }), config, INVENTORY_SCOPE)).toThrow('INVALID_SERVICE_TOKEN');
  });
});
