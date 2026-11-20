import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
export function createDocument(app: INestApplication) { return SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('StayHub Reports').setVersion('1.0.0').setDescription('UTC [from,to). Minor units are strings. Currency totals remain separate. Occupancy measures published room-night supply; missing historical supply is explicit.').addBearerAuth().build()); }
