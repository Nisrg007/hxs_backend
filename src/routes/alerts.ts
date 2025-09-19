import express from 'express';
import { 
  getAlerts, 
  getAlert, 
  acknowledgeAlert, 
  dismissAlert, 
  resolveAlert, 
  alertValidation 
} from '../controllers/alertController';
import { handleValidationErrors } from '../middleware/validation';
import { authenticateAdmin } from '../middleware/auth';
import { adminRateLimiter } from '../middleware/rateLimiting';

const router = express.Router();

// All alert routes require admin authentication
router.use(authenticateAdmin);
router.use(adminRateLimiter);

router.get(
  '/',
  alertValidation.query,
  handleValidationErrors,
  getAlerts
);

router.get(
  '/:alertId',
  alertValidation.param,
  handleValidationErrors,
  getAlert
);

router.post(
  '/:alertId/acknowledge',
  alertValidation.param,
  handleValidationErrors,
  acknowledgeAlert
);

router.post(
  '/:alertId/dismiss',
  alertValidation.param,
  alertValidation.dismiss,
  handleValidationErrors,
  dismissAlert
);

router.post(
  '/:alertId/resolve',
  alertValidation.param,
  handleValidationErrors,
  resolveAlert
);

export { router as alertRoutes };