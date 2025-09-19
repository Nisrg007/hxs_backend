import express from 'express';
import { ingestLocation, ingestValidation } from '../controllers/ingestController';
import { handleValidationErrors } from '../middleware/validation';
import { authenticateCart } from '../middleware/auth';
import { rateLimitByCart } from '../middleware/rateLimiting';

const router = express.Router();

// All ingest routes require cart authentication
router.use(authenticateCart);
router.use(rateLimitByCart);

router.post(
  '/location',
  ingestValidation.location,
  handleValidationErrors,
  ingestLocation
);

export { router as ingestRoutes };