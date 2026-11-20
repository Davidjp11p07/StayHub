import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { importPKCS8, SignJWT, type KeyLike } from 'jose';

import { INVENTORY_CONFIG } from '@inventory/infrastructure/config/config.module';
import type { InventoryConfig } from '@inventory/infrastructure/config/inventory-config';

export const SERVICE_SUBJECT = 'stayhub-room-inventory-service';

/**
 * Service JWT for Inventory -> Accommodations: RS256 with Inventory's own key and kid, exact audience and the single
 * scope `accommodations:inventory-context`. A fresh short-lived token is signed per call (Accommodations rejects
 * tokens older than 300 s), so no long-lived token is ever stored.
 */
@Injectable()
export class OutboundServiceTokenProvider {
  private key?: Promise<KeyLike>;

  public constructor(@Inject(INVENTORY_CONFIG) private readonly config: Pick<InventoryConfig, 'outbound'>) {}

  public async issue(): Promise<string> {
    const { outbound } = this.config;
    this.key ??= importPKCS8(outbound.privateKey, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ scope: outbound.scope })
      .setProtectedHeader({ alg: 'RS256', kid: outbound.kid, typ: 'JWT' })
      .setIssuer(outbound.issuer)
      .setAudience(outbound.audience)
      .setSubject(SERVICE_SUBJECT)
      .setJti(randomUUID())
      .setIssuedAt(now)
      .setExpirationTime(now + outbound.ttlSeconds)
      .sign(await this.key);
  }
}
