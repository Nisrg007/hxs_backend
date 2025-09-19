import express from 'express';
import { body } from 'express-validator';
import { syncVendorLocation } from '../controllers/internalController';
import { handleValidationErrors } from '../middleware/validation';
import { authenticateService } from '../middleware/auth';

const router = express.Router();

// Internal service-to-service routes
router.use(authenticateService);

router.patch(
  '/sync/vendor/:vendorId/location',
  [
    body('latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    body('longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    body('timestamp')
      .isISO8601()
      .withMessage('Timestamp must be a valid ISO 8601 date'),
    body('idempotency_key')
      .isLength({ min: 1 })
      .withMessage('Idempotency key is required')
  ],
  handleValidationErrors,
  syncVendorLocation
);

export { router as internalRoutes };