import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

export function buildInventoryOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('StayHub Room Inventory Service API')
    .setDescription('Products and services available per room (Sprint 4). Published externally through API Gateway.')
    .setVersion('1.0.0')
    .addServer('http://room-inventory-service:3008')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Delegated RS256 JWT from API Gateway (sub, role, scope inventory:manage).' }, 'delegatedJwt')
    .build();
  return SwaggerModule.createDocument(app, config);
}

/** Swagger UI at /docs and the JSON document at /docs-json. */
export function configureInventoryOpenApi(app: INestApplication): void {
  SwaggerModule.setup('docs', app, buildInventoryOpenApi(app));
}
