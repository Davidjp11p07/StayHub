import { readFileSync } from 'node:fs';
import jwt from '../apps/reports-service/node_modules/jsonwebtoken/index.js';
const role = process.argv[2] ?? 'OWNER';
const subject = process.argv[3] ?? process.env.REPORTS_DEMO_OWNER_ID ?? '11111111-1111-4111-8111-111111111111';
if (!['OWNER', 'ADMIN', 'GUEST'].includes(role)) throw Error('Use OWNER, ADMIN or GUEST');
const privateKey = readFileSync('.artifacts/reports-demo/private.pem', 'utf8');
console.log(jwt.sign({ role }, privateKey, { algorithm: 'RS256', keyid: 'reports-demo', issuer: 'stayhub-reports-demo', audience: 'stayhub-reports-access', subject, expiresIn: 300 }));
