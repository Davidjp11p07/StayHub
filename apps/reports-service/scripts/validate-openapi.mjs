import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import parser from '@apidevtools/swagger-parser';
import http from '../dist/interfaces/http.js';
import application from '../dist/application/get-report.js';
import store from '../dist/infrastructure/store.js';
import openapi from '../dist/openapi.js';
class ContractModule {}
Module({controllers:[http.ReportsController,http.HealthController],providers:[{provide:application.GetReport,useValue:{}},{provide:store.SnapshotStore,useValue:{}},{provide:http.CONFIG,useValue:{}}]})(ContractModule);
const app=await NestFactory.create(ContractModule,{logger:false});await app.init();const doc=openapi.createDocument(app);await parser.validate(JSON.parse(JSON.stringify(doc)));for(const path of ['/reports/owner/{id}','/reports/occupancy','/reports/revenue'])if(!doc.paths[path]?.get)throw Error('Missing '+path);writeFileSync('../../specs/006-reportes/contracts/openapi-reports.json',JSON.stringify(doc,null,2)+'\n');await app.close();console.log('Reports OpenAPI valid: three protected report operations.');
