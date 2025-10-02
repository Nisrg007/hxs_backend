import { Request, Response } from 'express';
import { body } from 'express-validator';
import { CartAssignment } from '../models/CartAssignment';
import { Cart } from '../models/Cart';
import { generateCartToken, verifyToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import bcrypt from 'bcryptjs';

export const loginWithAssignmentToken = asyncHandler(async (req: Request, res: Response) => {
  const { assignment_token, device_fingerprint, otp } = req.body;


  // Verify assignment token
  let decoded;
  try {
    decoded = verifyToken(assignment_token, 'access');
  } catch (error) {
    return res.status(401).json({
      error: 'invalid_token',
      message: 'Invalid or expired assignment token'
    });
  }

  // Find assignment
  const assignment = await CartAssignment.findOne({
    cart_id: decoded.cart_id,
    status: 'pending'
  });

  if (!assignment) {
    return res.status(401).json({
      error: 'invalid_assignment',
      message: 'Assignment not found or already activated'
    });
  }

  // Verify assignment token matches
  const isValidToken = await assignment.compareToken(assignment_token, 'assignment');
  if (!isValidToken) {
    return res.status(401).json({
      error: 'invalid_token',
      message: 'Invalid assignment token'
    });
  }

  // Check if assignment is expired
  if (assignment.expires_at < new Date()) {
    await CartAssignment.findByIdAndUpdate(assignment._id, {
      status: 'expired'
    });
    
    return res.status(401).json({
      error: 'token_expired',
      message: 'Assignment token has expired'
    });
  }

  // Verify OTP (simplified - in production, use SMS service)
  if (otp !== '123456') { // Default OTP for development
    return res.status(401).json({
      error: 'invalid_otp',
      message: 'Invalid OTP code'
    });
  }

  // Get cart details
  const cart = await Cart.findOne({ cart_id: decoded.cart_id });
  if (!cart) {
    return res.status(404).json({
      error: 'cart_not_found',
      message: 'Cart not found'
    });
  }

  // Generate new tokens
  const tokens = generateCartToken({
    cart_id: decoded.cart_id,
    vendor_id: cart.vendor_id,
    device_fingerprint
  });

   // Update assignment with new device and tokens
  await CartAssignment.findByIdAndUpdate(assignment._id, {
    device_fingerprint,
    access_token_hash: await bcrypt.hash(tokens.access_token!, 10),
    refresh_token_hash: await bcrypt.hash(tokens.refresh_token!, 10),
    status: 'active',
    activated_at: new Date()
  });


  logger.info('Cart assignment activated', {
    cart_id: decoded.cart_id,
    device_fingerprint
  });

  return res.json({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: 31557600, // 15 minutes in seconds
    cart: {
      cart_id: cart.cart_id,
      vendor_id: cart.vendor_id,
      model: cart.model,
      status: cart.status
    }
  });
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({
      error: 'refresh_token_required',
      message: 'Refresh token is required'
    });
  }

  // Verify refresh token
  let decoded;
  try {
    decoded = verifyToken(refresh_token, 'refresh');
    console.log(decoded);
  } catch (error) {
    return res.status(401).json({
      error: 'invalid_token',
      message: 'Invalid or expired refresh token'
    });
  }

  // Find assignment and verify refresh token
  const assignment = await CartAssignment.findOne({
    cart_id: decoded.cart_id,
    device_fingerprint: decoded.device_fingerprint,
    status: 'active'
  });

  if (!assignment) {
    return res.status(401).json({
      error: 'invalid_session',
      message: 'Session not found or revoked'
    });
  }

  const isValidToken = await assignment.compareToken(refresh_token, 'refresh');
  if (!isValidToken) {
    return res.status(401).json({
      error: 'invalid_token',
      message: 'Invalid refresh token'
    });
  }

  // FIX: Generate a full new set of tokens
  const newTokens = generateCartToken({
    cart_id: decoded.cart_id,
    vendor_id: decoded.vendor_id, // Make sure vendor_id is in the refresh token payload
    device_fingerprint: decoded.device_fingerprint
  });

  // FIX: Update BOTH token hashes in the database
  await CartAssignment.findByIdAndUpdate(assignment._id, {
    access_token_hash: await bcrypt.hash(newTokens.access_token!, 10),  // ✅ Hash it
    refresh_token_hash: await bcrypt.hash(newTokens.refresh_token!, 10)
  });

  // FIX: Return BOTH new tokens to the client
  return res.json({
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token, // Send the new refresh token
    expires_in: 31557600
  });
});

export const logout = asyncHandler(async (req: any, res: Response) => {
  const { cart_id, device_fingerprint } = req.cartContext;

  // Revoke assignment
  await CartAssignment.findOneAndUpdate(
    {
      cart_id,
      device_fingerprint,
      status: 'active'
    },
    {
      status: 'revoked',
      revoked_at: new Date(),
      revoked_reason: 'user_logout'
    }
  );

  logger.info('User logged out', { cart_id, device_fingerprint });

  res.json({
    message: 'Successfully logged out'
  });
});

// Validation rules
export const authValidation = {
  login: [
    body('assignment_token')
      .isJWT()
      .withMessage('Valid assignment token required'),
    body('device_fingerprint')
      .isLength({ min: 1 })
      .withMessage('Device fingerprint required'),
    body('otp')
      .isLength({ min: 6, max: 6 })
      .withMessage('Valid OTP required')
  ],
  refresh: [
    body('refresh_token')
      .isJWT()
      .withMessage('Valid refresh token required')
  ]
};