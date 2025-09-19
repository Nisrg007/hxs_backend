import express from 'express';
import { 
  createCart, 
  getCarts, 
  getCart, 
  updateCart, 
  deleteCart, 
  assignCart, 
  cartValidation 
} from '../controllers/cartController';
import { handleValidationErrors } from '../middleware/validation';
import { authenticateAdmin } from '../middleware/auth';
import { adminRateLimiter } from '../middleware/rateLimiting';
import { CartLocation } from '../models/CartLocation';
import { getCartLocationHistory, getCurrentCartLocations } from '../controllers/cartController';
import { body, query } from 'express-validator';

const router = express.Router();

// All cart routes require admin authentication
router.use(authenticateAdmin);
router.use(adminRateLimiter);

// Cart management
router.post(
  '/',
  cartValidation.create,
  handleValidationErrors,
  createCart
);

router.get(
  '/',
  cartValidation.query,
  handleValidationErrors,
  getCarts
);

router.get(
  '/:cartId',
  getCart
);

router.put(
  '/:cartId',
  cartValidation.update,
  handleValidationErrors,
  updateCart
);

router.delete(
  '/:cartId',
  deleteCart
);

// Cart assignment
router.post(
  '/assign-cart',
  cartValidation.assign,
  handleValidationErrors,
  assignCart
);

router.get(
  '/current/locations',
  [
    query('status')
      .optional()
      .isIn(['active', 'maintenance', 'retired'])
      .withMessage('Status must be active, maintenance, or retired'),
    query('vendor_id')
      .optional()
      .isLength({ min: 1 })
      .withMessage('Vendor ID must be provided'),
    query('bounds')
      .optional()
      .isString()
      .withMessage('Bounds must be a string in format "sw_lat,sw_lng,ne_lat,ne_lng"')
  ],
  handleValidationErrors,
  getCurrentCartLocations
);

router.get(
  '/:cartId/locations',
  [
    query('from')
      .optional()
      .isISO8601()
      .withMessage('From date must be valid ISO 8601 format'),
    query('to')
      .optional()
      .isISO8601()
      .withMessage('To date must be valid ISO 8601 format'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1000')
  ],
  handleValidationErrors,
  getCartLocationHistory
);

export { router as cartRoutes };