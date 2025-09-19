import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

export interface LocationUpdateEvent {
  cart_id: string;
  location: {
    latitude: number;
    longitude: number;
    timestamp: Date;
    accuracy: number;
    is_moving: boolean;
  };
  fraud_flags?: any;
}

export interface AlertEvent {
  alert_type: string;
  cart_ids: string[];
  severity: string;
  message: string;
  details: any;
  location?: {
    type: 'Point';
    coordinates: [number, number];
  };
}

export interface SyncEvent {
  cart_id: string;
  vendor_id: string;
  location: {
    latitude: number;
    longitude: number;
    timestamp: Date;
  };
  idempotency_key: string;
}

export class EventService {
  private get client() {
    return getRedisClient(); // ⬅ lazy load each time
  }

  async emitLocationUpdated(event: LocationUpdateEvent): Promise<void> {
    try {
      await this.client.publish('cart.location.updated', JSON.stringify(event));
      logger.debug('Location update event emitted', { cart_id: event.cart_id });
    } catch (error) {
      logger.error('Failed to emit location update event:', error);
    }
  }

  async emitAlertCreated(event: AlertEvent): Promise<void> {
    try {
      await this.client.publish('alert.created', JSON.stringify({
        ...event,
        created_at: new Date()
      }));
      logger.debug('Alert created event emitted', { alert_type: event.alert_type });
    } catch (error) {
      logger.error('Failed to emit alert created event:', error);
    }
  }

  async emitAlertResolved(alertId: string): Promise<void> {
    try {
      await this.client.publish('alert.resolved', JSON.stringify({
        alert_id: alertId,
        resolved_at: new Date()
      }));
      logger.debug('Alert resolved event emitted', { alert_id: alertId });
    } catch (error) {
      logger.error('Failed to emit alert resolved event:', error);
    }
  }

  async emitLocationSyncRequested(event: SyncEvent): Promise<void> {
    try {
      await this.client.publish('location.sync.requested', JSON.stringify(event));
      logger.debug('Location sync event emitted', { cart_id: event.cart_id });
    } catch (error) {
      logger.error('Failed to emit location sync event:', error);
    }
  }

  async emitCartAssignmentChanged(cartId: string, assignment: any): Promise<void> {
    try {
      await this.client.publish('cart.assignment.changed', JSON.stringify({
        cart_id: cartId,
        assignment
      }));
      logger.debug('Cart assignment changed event emitted', { cart_id: cartId });
    } catch (error) {
      logger.error('Failed to emit cart assignment event:', error);
    }
  }

  async emitBatchLocationUpdates(updates: LocationUpdateEvent[]): Promise<void> {
    try {
      await this.client.publish('batch.location.updates', JSON.stringify(updates));
      logger.debug('Batch location updates emitted', { count: updates.length });
    } catch (error) {
      logger.error('Failed to emit batch location updates:', error);
    }
  }
}