import { Injectable } from '@nestjs/common';
import { metrics, type Attributes, type Counter, type Histogram } from '@opentelemetry/api';

/** Base metrics. Attributes never include room ids, item names, tokens or bodies. */
@Injectable()
export class InventoryMetrics {
  private readonly meter = metrics.getMeter('stayhub-room-inventory-service');
  private readonly http: Histogram = this.meter.createHistogram('inventory_http_duration_seconds', { unit: 's' });
  private readonly db: Histogram = this.meter.createHistogram('inventory_db_duration_seconds', { unit: 's' });
  private readonly remote: Histogram = this.meter.createHistogram('inventory_accommodations_duration_seconds', { unit: 's' });
  private readonly remoteErrors: Counter = this.meter.createCounter('inventory_accommodations_errors_total');

  public httpDuration(seconds: number, attributes: Attributes = {}): void {
    this.http.record(seconds, attributes);
  }

  public dbDuration(seconds: number, attributes: Attributes = {}): void {
    this.db.record(seconds, attributes);
  }

  /** `outcome`: ok | not_found | unavailable | circuit_open | invalid_response. */
  public accommodationsCall(seconds: number, outcome: string): void {
    this.remote.record(seconds, { outcome });
    if (outcome !== 'ok' && outcome !== 'not_found') this.remoteErrors.add(1, { outcome });
  }
}
