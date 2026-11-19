import { readFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey } from 'node:crypto';
export interface JwtSettings {
    issuer: string;
    audience: string;
    kid: string;
    key: string;
}
export interface Target {
    url: string;
    jwt: JwtSettings;
}
export interface ReportsConfig {
    databaseUrl: string;
    user: JwtSettings;
    gateway: JwtSettings;
    targets: {
        bookings: Target;
        payments: Target;
        accommodations: Target;
    };
    timeoutMs: number;
    mode: 'LIVE' | 'DEMO';
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ReportsConfig {
    const get = (name: string): string => { const value = env[name + '_FILE'] ? readFileSync(env[name + '_FILE']!, 'utf8').trim() : env[name]?.trim(); if (!value)
        throw new Error('Missing configuration: ' + name); return value; };
    const jwt = (prefix: string, privateKey = false): JwtSettings => { const key = get(prefix + '_KEY').replace(/\\n/g, '\n'); const parsed = privateKey ? createPrivateKey(key) : createPublicKey(key); if (parsed.asymmetricKeyType !== 'rsa' || (parsed.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 || (!privateKey && key.includes('PRIVATE KEY')))
        throw new Error('Invalid RSA key: ' + prefix); return { issuer: get(prefix + '_ISSUER'), audience: get(prefix + '_AUDIENCE'), kid: get(prefix + '_KID'), key }; };
    const target = (name: string): Target => { const raw = get('REPORTS_' + name + '_URL'); const parsed = new URL(raw); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
        throw new Error('Invalid source URL'); return { url: raw.replace(/\/$/, ''), jwt: jwt('REPORTS_' + name, true) }; };
    const databaseUrl = get('REPORTS_DATABASE_URL');
    const db = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.pathname !== '/reports_db')
        throw new Error('Expected reports_db');
    const timeoutMs = Number(env.REPORTS_TIMEOUT_MS ?? 5000);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000)
        throw new Error('Invalid timeout');
    const mode = env.REPORTS_MODE ?? 'LIVE';
    if (mode !== 'LIVE' && mode !== 'DEMO')
        throw new Error('Invalid REPORTS_MODE');
    if (mode === 'DEMO' && env.NODE_ENV === 'production')
        throw new Error('DEMO forbidden in production');
    return { databaseUrl, user: jwt('REPORTS_USER'), gateway: jwt('REPORTS_GATEWAY'), targets: { bookings: target('BOOKINGS'), payments: target('PAYMENTS'), accommodations: target('ACCOMMODATIONS') }, timeoutMs, mode };
}
