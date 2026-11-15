import { Inject, Injectable } from '@nestjs/common';
import { importSPKI, jwtVerify, type JWTPayload, type KeyLike } from 'jose';

import { InventoryError } from '@inventory/domain/inventory-errors';
import { INVENTORY_CONFIG } from '@inventory/infrastructure/config/config.module';
import type { InventoryConfig } from '@inventory/infrastructure/config/inventory-config';

import { toInventoryPrincipal, type InventoryPrincipal } from './inventory-principal';

/**
 * Verifies the Gateway's delegated JWT: RS256 only, known `kid`, exact issuer/audience, `exp`/`iat`/`sub`,
 * the exact scope and a known role. Any failure is a generic UNAUTHENTICATED (no detail leaks).
 */
@Injectable()
export class ServiceJwtVerifier {
  private readonly keys = new Map<string, Promise<KeyLike>>();

  public constructor(@Inject(INVENTORY_CONFIG) private readonly config: InventoryConfig) {}

  public async verify(token: string): Promise<InventoryPrincipal> {
    const kid = this.kidOf(token);
    const pem = this.config.jwtPublicKeys[kid];
    if (!pem) throw new InventoryError('UNAUTHENTICATED');
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, await this.key(kid, pem), {
        algorithms: ['RS256'],
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
        requiredClaims: ['sub', 'iat', 'exp'],
        clockTolerance: 5,
      }));
    } catch {
      throw new InventoryError('UNAUTHENTICATED');
    }
    if (typeof payload.iat !== 'number' || payload.iat > Math.floor(Date.now() / 1000) + 5) throw new InventoryError('UNAUTHENTICATED');
    const scopes = typeof payload.scope === 'string' ? payload.scope.split(/\s+/u).filter(Boolean) : [];
    if (!scopes.includes(this.config.jwtScope)) throw new InventoryError('UNAUTHENTICATED');
    return toInventoryPrincipal(payload);
  }

  private kidOf(token: string): string {
    const [header] = token.split('.');
    if (!header) throw new InventoryError('UNAUTHENTICATED');
    let parsed: { alg?: unknown; kid?: unknown };
    try {
      parsed = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { alg?: unknown; kid?: unknown };
    } catch {
      throw new InventoryError('UNAUTHENTICATED');
    }
    if (parsed.alg !== 'RS256' || typeof parsed.kid !== 'string' || !parsed.kid) throw new InventoryError('UNAUTHENTICATED');
    return parsed.kid;
  }

  private key(kid: string, pem: string): Promise<KeyLike> {
    let key = this.keys.get(kid);
    if (!key) {
      key = importSPKI(pem, 'RS256');
      this.keys.set(kid, key);
    }
    return key;
  }
}
