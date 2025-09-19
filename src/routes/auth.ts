import express from 'express';
import { loginWithAssignmentToken, refreshToken, logout, authValidation } from '../controllers/authController';
import { handleValidationErrors } from '../middleware/validation';
import { authenticateCart } from '../middleware/auth';

const router = express.Router();

// Public routes
router.post(
  '/login',
  authValidation.login,
  handleValidationErrors,
  loginWithAssignmentToken
);

router.post(
  '/refresh',
  authValidation.refresh,
  handleValidationErrors,
  refreshToken
);

// Protected routes
router.post(
  '/logout',
  authenticateCart,
  logout
);

export { router as authRoutes };