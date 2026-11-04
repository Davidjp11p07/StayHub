# Accommodations service

NestJS service base listening on internal port 3003. Install and run it from this directory with `npm ci`, `npm run start:dev`, `npm test`, `npm run lint`, and `npm run typecheck`.

Startup requires `ACCOMMODATIONS_PORT=3003`, `ACCOMMODATIONS_JWT_KID`, `ACCOMMODATIONS_JWT_ISSUER`, `ACCOMMODATIONS_JWT_AUDIENCE`, and exactly one of `ACCOMMODATIONS_JWT_PUBLIC_KEY` or `ACCOMMODATIONS_JWKS_URI`. The public key must be RSA with at least 2048 bits; JWKS must use HTTPS. JWT verification is a later task (ACC-014).

**Readiness deviation for ACC-007:** `/health/ready` currently depends on an injectable in-memory readiness indicator that reports ready. It does not connect to PostgreSQL; the real database check belongs to ACC-012 when Prisma is introduced. Integration tests replace the indicator with a test double.
