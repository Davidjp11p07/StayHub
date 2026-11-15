import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';

import type { InventoryConfig } from '@inventory/infrastructure/config/inventory-config';

let telemetry: NodeSDK | undefined;

export function startTelemetry(config: Pick<InventoryConfig, 'otlpEndpoint' | 'accommodationsTimeoutMs'>): void {
  if (telemetry) return;
  const endpoint = config.otlpEndpoint.replace(/\/$/u, '');
  telemetry = new NodeSDK({
    serviceName: 'stayhub-room-inventory-service',
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, timeoutMillis: config.accommodationsTimeoutMs }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics`, timeoutMillis: config.accommodationsTimeoutMs }),
      exportIntervalMillis: 30_000,
    }),
    instrumentations: [],
  });
  telemetry.start();
}

export async function stopTelemetry(): Promise<void> {
  const sdk = telemetry;
  telemetry = undefined;
  await sdk?.shutdown();
}
