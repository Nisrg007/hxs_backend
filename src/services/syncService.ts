import axios from 'axios';
import { logger } from '../utils/logger';
import { config } from '../config/environment';
import { retry } from '../utils/helpers';

export class SyncService {
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 2000;

  async syncLocationToStreefi(
    vendorId: string,
    location: {
      latitude: number;
      longitude: number;
      timestamp: Date;
    },
    idempotencyKey: string
  ): Promise<boolean> {
    try {
      await retry(async () => {
        const response = await axios.patch(
          `${config.streefi.apiUrl}/vendors/${vendorId}/location`,
          {
            latitude: location.latitude,
            longitude: location.longitude,
            timestamp: location.timestamp.toISOString(),
            idempotency_key: idempotencyKey
          },
          {
            headers: {
              'Authorization': `Bearer ${config.streefi.apiKey}`,
              'X-Client-ID': config.streefi.clientId,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );

        logger.debug('Location synced to Streefi', {
          vendorId,
          status: response.status
        });
      }, this.MAX_RETRIES, this.RETRY_DELAY);

      return true;

    } catch (error: any) {
      if (error.response?.status === 409) {
        // Duplicate request, safe to ignore
        logger.debug('Duplicate sync request ignored', {
          vendorId,
          idempotencyKey
        });
        return true;
      }

      logger.error('Failed to sync location to Streefi', {
        vendorId,
        error: error.message,
        status: error.response?.status
      });

      return false;
    }
  }

  async batchSyncLocations(
    locations: Array<{
      vendorId: string;
      location: {
        latitude: number;
        longitude: number;
        timestamp: Date;
      };
      idempotencyKey: string;
    }>
  ): Promise<{ success: number; failed: number }> {
    const results = await Promise.allSettled(
      locations.map(loc => 
        this.syncLocationToStreefi(loc.vendorId, loc.location, loc.idempotencyKey)
      )
    );

    const success = results.filter(r => r.status === 'fulfilled' && r.value).length;
    const failed = results.length - success;

    if (failed > 0) {
      logger.warn('Batch sync completed with failures', {
        total: locations.length,
        success,
        failed
      });
    } else {
      logger.info('Batch sync completed successfully', {
        total: locations.length,
        success
      });
    }

    return { success, failed };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${config.streefi.apiUrl}/health`, {
        timeout: 5000,
        headers: {
          'Authorization': `Bearer ${config.streefi.apiKey}`,
          'X-Client-ID': config.streefi.clientId
        }
      });

      return response.status === 200;
    } catch (error) {
      logger.error('Streefi health check failed', { error: (error as any).message });
      return false;
    }
  }
}