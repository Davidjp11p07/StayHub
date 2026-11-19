import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if(process.env.REPORTS_DATABASE_URL_FILE)process.env.REPORTS_DATABASE_URL=readFileSync(process.env.REPORTS_DATABASE_URL_FILE,'utf8').trim();
const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma'],{stdio:'inherit',env:process.env});process.exitCode=result.status??1;
