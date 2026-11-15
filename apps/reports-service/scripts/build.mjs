import { spawnSync } from 'node:child_process';
import { cpSync } from 'node:fs';
const result=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.build.json'],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status??1);
cpSync('src/infrastructure/persistence/generated/client','dist/infrastructure/persistence/generated/client',{recursive:true});
