import { Worker, Job } from 'bullmq';
import { LocationService } from '../services/locationService';
import { AlertService } from '../services/alertService';
import { EventService } from '../services/eventService';
import { logger } from '../utils/logger';
import { config } from '../config/environment';
import { getRedisClient } from '../config/redis';

interface ProximityCheckJob {
  maxDistanceMeters: number;
  skipCartIds?: string[];
}

const PROXIMITY_THRESHOLD = config.proximity.maxDistance;
const ALERT_COOLDOWN = config.proximity.alertCooldown;

export class ProximityWorker {
  private locationService: LocationService;
  private alertService: AlertService;
  private eventService: EventService;
  private worker: Worker;

  constructor() {
    this.locationService = new LocationService();
    this.alertService = new AlertService();
    this.eventService = new EventService();

    this.worker = new Worker(
      'proximity-checks',
      this.processProximityCheck.bind(this),
      {
        connection: getRedisClient() as any,
        concurrency: 1,
        limiter: {
          max: 1,
          duration: config.proximity.checkInterval
        }
      }
    );

    this.setupWorkerEvents();
  }

  private setupWorkerEvents(): void {
    this.worker.on('completed', (job: Job) => {
      logger.info('Proximity check completed', { 
        jobId: job.id,
        pairsFound: job.returnvalue?.proximityPairs?.length || 0
      });
    });

    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      logger.error('Proximity check failed', { 
        jobId: job?.id,
        error: error.message 
      });
    });

    this.worker.on('error', (error: Error) => {
      logger.error('Proximity worker error:', error);
    });
  }

  async processProximityCheck(job: Job): Promise<{ proximityPairs: number; alertsCreated: number }> {
    const { maxDistanceMeters = PROXIMITY_THRESHOLD, skipCartIds = [] } = job.data as ProximityCheckJob;

    logger.info('Starting proximity check', { 
      maxDistanceMeters,
      skipCartIds: skipCartIds.length
    });

    // Find all proximity pairs
    const proximityPairs = await this.locationService.findCartProximityPairs(maxDistanceMeters);
    
    let alertsCreated = 0;

    for (const pair of proximityPairs) {
      // Skip if either cart is in skip list
      if (skipCartIds.includes(pair.cart1.cart_id) || skipCartIds.includes(pair.cart2.cart_id)) {
        continue;
      }

      try {
        const alert = await this.alertService.createProximityAlert(
          [pair.cart1.cart_id, pair.cart2.cart_id],
          pair.distance
        );

        if (alert) {
          alertsCreated++;
          
          // Emit real-time alert event
          await this.eventService.emitAlertCreated({
            alert_type: 'proximity',
            cart_ids: [pair.cart1.cart_id, pair.cart2.cart_id],
            severity: this.getProximitySeverity(pair.distance),
            message: `Carts ${pair.cart1.cart_id} and ${pair.cart2.cart_id} are too close (${pair.distance}m)`,
            details: {
              distance: pair.distance,
              cart1_location: pair.cart1.location,
              cart2_location: pair.cart2.location
            },
            location: {
              type: 'Point',
              coordinates: [
                (pair.cart1.location.coordinates[0] + pair.cart2.location.coordinates[0]) / 2,
                (pair.cart1.location.coordinates[1] + pair.cart2.location.coordinates[1]) / 2
              ]
            }
          });
        }
      } catch (error) {
        logger.error('Failed to create proximity alert:', {
          cart1: pair.cart1.cart_id,
          cart2: pair.cart2.cart_id,
          error: (error as Error).message
        });
      }
    }

    logger.info('Proximity check completed', {
      totalPairs: proximityPairs.length,
      alertsCreated,
      skippedPairs: skipCartIds.length > 0 ? proximityPairs.length - alertsCreated : 0
    });

    return { proximityPairs: proximityPairs.length, alertsCreated };
  }

  private getProximitySeverity(distance: number): string {
    if (distance <= 100) return 'high';
    if (distance <= 250) return 'medium';
    return 'low';
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}