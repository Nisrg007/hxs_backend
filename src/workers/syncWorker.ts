import { Worker, Job } from 'bullmq';
import axios from 'axios';
import { logger } from '../utils/logger';
import { config } from '../config/environment';
import { getRedisClient } from '../config/redis';

interface SyncJob {
  cart_id: string;
  vendor_id: string;
  location: {
    latitude: number;
    longitude: number;
    timestamp: string;
  };
  idempotency_key: string;
}

export class SyncWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      'streefi-sync',
      this.processSyncJob.bind(this),
      {
        connection: getRedisClient() as any,
        concurrency: 5,
        limiter: {
          max: 10,
          duration: 1000
        }
      }
    );

    this.setupWorkerEvents();
  }

  private setupWorkerEvents(): void {
    this.worker.on('completed', (job: Job) => {
      logger.info('Sync job completed', { 
        jobId: job.id,
        cartId: job.data.cart_id,
        vendorId: job.data.vendor_id
      });
    });

    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      logger.error('Sync job failed', { 
        jobId: job?.id,
        cartId: job?.data.cart_id,
        error: error.message 
      });
    });

    this.worker.on('error', (error: Error) => {
      logger.error('Sync worker error:', error);
    });
  }

  async processSyncJob(job: Job): Promise<void> {
    const { cart_id, vendor_id, location, idempotency_key } = job.data as SyncJob;

    try {
      // Call Streefi API to sync location
      const response = await axios.patch(
        `${config.streefi.apiUrl}/vendors/${vendor_id}/location`,
        {
          latitude: location.latitude,
          longitude: location.longitude,
          timestamp: location.timestamp,
          idempotency_key
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
        cart_id,
        vendor_id,
        status: response.status
      });

    } catch (error: any) {
      if (error.response?.status === 409) {
        // Duplicate request, safe to ignore
        logger.debug('Duplicate sync request ignored', {
          cart_id,
          vendor_id,
          idempotency_key
        });
        return;
      }

      if (error.response?.status >= 400 && error.response?.status < 500) {
        // Client error, don't retry
        logger.warn('Sync failed with client error', {
          cart_id,
          vendor_id,
          status: error.response?.status,
          error: error.response?.data?.message || error.message
        });
        throw new Error('PERMANENT_FAILURE');
      }

      // Network or server error, retry
      logger.error('Sync failed with retryable error', {
        cart_id,
        vendor_id,
        error: error.message
      });
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}