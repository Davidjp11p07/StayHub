import { assertNoDuplicateJsonKeys } from './json-token';
import { decode, verify, type JwtPayload } from 'jsonwebtoken';
import type { ReportsConfig, JwtSettings } from './config';
export class ReportAuthError extends Error {
    constructor(public readonly status: number) { super(status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN'); }
}
export interface Principal {
    sub: string;
    role: 'OWNER' | 'ADMIN';
}
export function authenticate(token: string, config: Pick<ReportsConfig, 'user' | 'gateway'>, now = Math.floor(Date.now() / 1000)): Principal {
    let decoded: ReturnType<typeof decode>;
    try {
        if (token.length > 16384 || token.split('.').length !== 3)
            throw new Error();
        for (const part of token.split('.').slice(0, 2)) {
            const raw = Buffer.from(part, 'base64url').toString('utf8');
            JSON.parse(raw);
            assertNoDuplicateJsonKeys(raw);
        }
        decoded = decode(token, { complete: true });
    }
    catch {
        throw new ReportAuthError(401);
    }
    if (!decoded || typeof decoded === 'string')
        throw new ReportAuthError(401);
    const settings: JwtSettings = decoded.payload && typeof decoded.payload === 'object' && decoded.payload.iss === config.gateway.issuer && decoded.payload.aud === config.gateway.audience ? config.gateway : config.user;
    let claims: JwtPayload;
    try {
        if (decoded.header.alg !== 'RS256' || decoded.header.kid !== settings.kid)
            throw new Error();
        const payload = verify(token, settings.key, { algorithms: ['RS256'], issuer: settings.issuer, audience: settings.audience, clockTimestamp: now, maxAge: settings === config.gateway ? 300 : 900 });
        if (typeof payload === 'string')
            throw new Error();
        claims = payload;
        if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.iat! > now || claims.exp! <= now || claims.exp! <= claims.iat! || claims.exp! - claims.iat! > (settings === config.gateway ? 300 : 900) || !isUuid(claims.sub))
            throw new Error();
    }
    catch {
        throw new ReportAuthError(401);
    }
    if (settings === config.gateway && claims.scope !== 'reports:read')
        throw new ReportAuthError(403);
    if (claims.role !== 'OWNER' && claims.role !== 'ADMIN')
        throw new ReportAuthError(403);
    return { sub: claims.sub!, role: claims.role };
}
export function isUuid(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
