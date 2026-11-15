import type { Config } from 'jest';
const config: Config = {testEnvironment:'node',testMatch:['<rootDir>/test/**/*.spec.ts'],transform:{'^.+\\.ts$':['ts-jest',{tsconfig:'tsconfig.json'}]},modulePathIgnorePatterns:['<rootDir>/dist/','<rootDir>/src/infrastructure/generated/','<rootDir>/src/infrastructure/persistence/generated/'],collectCoverageFrom:['src/**/*.ts','!src/main.ts','!src/**/generated/**'],coverageThreshold:{global:{statements:70,branches:70,functions:70,lines:70}}};
export default config;
