import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(eslint.configs.recommended,...tseslint.configs.recommended,{ignores:['node_modules/','dist/','coverage/','**/generated/**']},{files:['src/domain/**/*.ts','src/application/**/*.ts'],rules:{'no-restricted-imports':['error',{patterns:['@nestjs/*','@prisma/*','../infrastructure/*']}]}});
