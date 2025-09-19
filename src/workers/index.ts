import { ProximityWorker } from './proximityWorker';
import { SyncWorker } from './syncWorker';
import { logger } from '../utils/logger';

let proximityWorker: ProximityWorker;
let syncWorker: SyncWorker;

export const initializeWorkers = async (): Promise<void> => {
  try {
    proximityWorker = new ProximityWorker();
    syncWorker = new SyncWorker();

    logger.info('✅ Background workers initialized');
  } catch (error) {
    logger.error('❌ Failed to initialize workers:', error);
    throw error;
  }
};

export const closeWorkers = async (): Promise<void> => {
  try {
    await Promise.all([
      proximityWorker?.close(),
      syncWorker?.close()
    ]);
    logger.info('Background workers closed');
  } catch (error) {
    logger.error('Error closing workers:', error);
  }
};