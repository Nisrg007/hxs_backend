import { Request, Response } from 'express';
import { body, query } from 'express-validator';
import { Cart } from '../models/Cart';
import { CartCurrent, CartLocation } from '../models/CartLocation';
import { CartAssignment } from '../models/CartAssignment';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { AdminAuditLog } from '../models/AdminAuditLog';
import { generateCartToken } from '../utils/jwt';

export const createCart = asyncHandler(async (req: Request, res: Response) => {
  const { cart_id, vendor_id, cart_model, serial_number, status } = req.body;

  // Check if cart already exists
  const existingCart = await Cart.findOne({ cart_id });
  if (existingCart) {
    return res.status(409).json({
      error: 'cart_exists',
      message: 'Cart with this ID already exists'
    });
  }

  const cart = new Cart({
    cart_id,
    vendor_id,
    cart_model,
    serial_number,
    status: status || 'active'
  });

  await cart.save();

  // Log admin action
  await AdminAuditLog.create({
    admin_user_id: req.headers['x-admin-user'] as string || 'system',
    action: 'create_cart',
    resource_type: 'cart',
    resource_id: cart_id,
    details: req.body,
    ip_address: req.ip || 'unknown',
    user_agent: req.get('User-Agent') || 'unknown'
  });

  logger.info('Cart created', { cart_id, vendor_id });

  return res.status(201).json({
    message: 'Cart created successfully',
    cart: {
      cart_id: cart.cart_id,
      vendor_id: cart.vendor_id,
      cart_model: cart.cart_model,
      serial_number: cart.serial_number,
      status: cart.status,
      created_at: cart.created_at
    }
  });
});

export const getCarts = asyncHandler(async (req: Request, res: Response) => {
  const { status, vendor_id, page = 1, limit = 50, search } = req.query;
  
  const query: any = {};
  
  if (status) query.status = status;
  if (vendor_id) query.vendor_id = vendor_id;
  
  if (search) {
    query.$text = { $search: search as string };
  }

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [carts, total] = await Promise.all([
    Cart.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Cart.countDocuments(query)
  ]);

  // Get current locations for carts
  const cartIds = carts.map(cart => cart.cart_id);
  const currentLocations = await CartCurrent.find({
    cart_id: { $in: cartIds }
  }).lean();

  const cartsWithLocation = carts.map(cart => {
    const location = currentLocations.find(loc => loc.cart_id === cart.cart_id);
    return {
      ...cart,
      current_location: location ? {
        latitude: location.location.coordinates[1],
        longitude: location.location.coordinates[0],
        timestamp: location.timestamp,
        accuracy: location.accuracy,
        is_moving: location.is_moving
      } : null
    };
  });

  res.json({
    carts: cartsWithLocation,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
});

export const getCart = asyncHandler(async (req: Request, res: Response) => {
  const { cartId } = req.params;

  const [cart, currentLocation, assignment] = await Promise.all([
    Cart.findOne({ cart_id: cartId }).lean(),
    CartCurrent.findOne({ cart_id: cartId }).lean(),
    CartAssignment.findOne({ cart_id: cartId, status: 'active' }).lean()
  ]);

  if (!cart) {
    return res.status(404).json({
      error: 'cart_not_found',
      message: 'Cart not found'
    });
  }

  return res.json({
    cart: {
      ...cart,
      current_location: currentLocation ? {
        latitude: currentLocation.location.coordinates[1],
        longitude: currentLocation.location.coordinates[0],
        timestamp: currentLocation.timestamp,
        accuracy: currentLocation.accuracy,
        speed: currentLocation.speed,
        heading: currentLocation.heading,
        battery_level: currentLocation.battery_level,
        is_moving: currentLocation.is_moving,
        fraud_flags: currentLocation.fraud_flags
      } : null,
      assignment: assignment ? {
        renter_phone: assignment.renter_phone,
        device_fingerprint: assignment.device_fingerprint,
        assigned_at: assignment.assigned_at,
        expires_at: assignment.expires_at,
        status: assignment.status
      } : null
    }
  });
});

export const updateCart = asyncHandler(async (req: Request, res: Response) => {
  const { cartId } = req.params;
  const { cart_model, serial_number, status } = req.body;

  const cart = await Cart.findOneAndUpdate(
    { cart_id: cartId },
    { cart_model, serial_number, status },
    { new: true, runValidators: true }
  );

  if (!cart) {
    return res.status(404).json({
      error: 'cart_not_found',
      message: 'Cart not found'
    });
  }

  // Log admin action
  await AdminAuditLog.create({
    admin_user_id: req.headers['x-admin-user'] as string || 'system',
    action: 'update_cart',
    resource_type: 'cart',
    resource_id: cartId,
    details: req.body,
    ip_address: req.ip || 'unknown',
    user_agent: req.get('User-Agent') || 'unknown'
  });

  logger.info('Cart updated', { cart_id: cartId });

  return res.json({
    message: 'Cart updated successfully',
    cart: {
      cart_id: cart.cart_id,
      vendor_id: cart.vendor_id,
      cart_model: cart.cart_model,
      serial_number: cart.serial_number,
      status: cart.status,
      updated_at: cart.updated_at
    }
  });
});

export const deleteCart = asyncHandler(async (req: Request, res: Response) => {
  const { cartId } = req.params;

  const cart = await Cart.findOneAndDelete({ cart_id: cartId });

  if (!cart) {
    return res.status(404).json({
      error: 'cart_not_found',
      message: 'Cart not found'
    });
  }

  // Clean up related data
  await Promise.all([
    CartCurrent.deleteOne({ cart_id: cartId }),
    CartAssignment.deleteMany({ cart_id: cartId })
  ]);

  // Log admin action
  await AdminAuditLog.create({
    admin_user_id: req.headers['x-admin-user'] as string || 'system',
    action: 'delete_cart',
    resource_type: 'cart',
    resource_id: cartId,
    details: { cart_id: cartId },
    ip_address: req.ip || 'unknown',
    user_agent: req.get('User-Agent') || 'unknown'
  });

  logger.info('Cart deleted', { cart_id: cartId });

  return res.status(204).send();
});

export const assignCart = asyncHandler(async (req: Request, res: Response) => {
  const { cart_id, renter_phone, duration_hours = 24 } = req.body;

  // Check if cart exists
  const cart = await Cart.findOne({ cart_id });
  if (!cart) {
    return res.status(404).json({
      error: 'cart_not_found',
      message: 'Cart not found'
    });
  }

  // Check for active assignments
  const activeAssignment = await CartAssignment.findOne({
    cart_id,
    status: 'active'
  });

  if (activeAssignment) {
    return res.status(409).json({
      error: 'cart_already_assigned',
      message: 'Cart is already assigned to another user'
    });
  }

  // Generate assignment token
  const assignmentToken = generateCartToken({
    cart_id,
    vendor_id: cart.vendor_id,
    device_fingerprint: 'pending' // Will be set during activation
  }, 'access');

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + duration_hours);

  const assignment = new CartAssignment({
    cart_id,
    assignment_token_hash: assignmentToken.access_token,
    renter_phone,
    assigned_by: req.headers['x-admin-user'] as string || 'system',
    expires_at: expiresAt
  });

  await assignment.save();

  // Log admin action
  await AdminAuditLog.create({
    admin_user_id: req.headers['x-admin-user'] as string || 'system',
    action: 'assign_cart',
    resource_type: 'cart',
    resource_id: cart_id,
    details: { renter_phone, duration_hours },
    ip_address: req.ip || 'unknown',
    user_agent: req.get('User-Agent') || 'unknown'
  });

  logger.info('Cart assigned', { cart_id, renter_phone });

  return res.status(201).json({
    assignment_token: assignmentToken.access_token,
    expires_at: expiresAt,
    qr_code_data: `hocco://assign?token=${assignmentToken.access_token}&phone=${encodeURIComponent(renter_phone)}`,
    message: 'Cart assigned successfully'
  });
});
export const getCurrentCartLocations = asyncHandler(async (req: Request, res: Response) => {
  const { status, vendor_id, bounds } = req.query;
  
  const query: any = {};
  
  if (status) query.status = status;
  if (vendor_id) query.vendor_id = vendor_id;
  
  // Handle geographic bounds
  if (bounds) {
    const [swLat, swLng, neLat, neLng] = (bounds as string).split(',').map(parseFloat);
    
    if ([swLat, swLng, neLat, neLng].every(coord => !isNaN(coord))) {
      query.location = {
        $geoWithin: {
          $box: [[swLng, swLat], [neLng, neLat]]
        }
      };
    }
  }

  const currentLocations = await CartCurrent.find(query).lean();

  // Get cart details for each location
  const cartIds = currentLocations.map(loc => loc.cart_id);
  const carts = await Cart.find({ cart_id: { $in: cartIds } }).lean();

  const formattedLocations = currentLocations.map(location => {
    const cart = carts.find(c => c.cart_id === location.cart_id);
    return {
      cart: {
        cart_id: location.cart_id,
        vendor_id: cart?.vendor_id,
        model: cart?.model,
        status: cart?.status
      },
      current_location: {
        latitude: location.location.coordinates[1],
        longitude: location.location.coordinates[0],
        timestamp: location.timestamp,
        accuracy: location.accuracy,
        speed: location.speed,
        heading: location.heading,
        battery_level: location.battery_level,
        is_moving: location.is_moving
      },
      fraud_flags: location.fraud_flags,
      last_seen: location.updated_at
    };
  });

  res.json({
    carts: formattedLocations,
    total: formattedLocations.length
  });
});

export const getCartLocationHistory = asyncHandler(async (req: Request, res: Response) => {
  const { cartId } = req.params;
  const { from, to, limit = 100 } = req.query;

  // Validate cart exists
  const cart = await Cart.findOne({ cart_id: cartId });
  if (!cart) {
    return res.status(404).json({
      error: 'cart_not_found',
      message: 'Cart not found'
    });
  }

  const query: any = { cart_id: cartId };
  
  // Date range filtering
  if (from || to) {
    query.timestamp = {};
    if (from) query.timestamp.$gte = new Date(from as string);
    if (to) query.timestamp.$lte = new Date(to as string);
  }

  const locations = await CartLocation.find(query)
    .sort({ timestamp: -1 })
    .limit(parseInt(limit as string))
    .lean();

  const formattedLocations = locations.map(location => ({
    latitude: location.location.coordinates[1],
    longitude: location.location.coordinates[0],
    timestamp: location.timestamp,
    accuracy: location.accuracy,
    speed: location.speed,
    heading: location.heading,
    battery_level: location.battery_level,
    is_moving: location.is_moving,
    fraud_flags: location.fraud_flags,
    created_at: location.created_at
  }));

  return res.json({
    cart_id: cartId,
    locations: formattedLocations,
    has_more: locations.length === parseInt(limit as string)
  });
});

// Validation rules
export const cartValidation = {
  create: [
    body('cart_id')
      .isLength({ min: 3, max: 50 })
      .withMessage('Cart ID must be between 3 and 50 characters')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Cart ID can only contain letters, numbers, underscores and hyphens'),
    body('vendor_id')
      .isLength({ min: 1 })
      .withMessage('Vendor ID is required'),
    body('cart_model')
      .isLength({ min: 1 })
      .withMessage('cart_model is required'),
    body('status')
      .optional()
      .isIn(['active', 'maintenance', 'retired'])
      .withMessage('Status must be active, maintenance, or retired')
  ],
  update: [
    body('cart_model')
      .optional()
      .isLength({ min: 1 })
      .withMessage('Model cannot be empty'),
    body('status')
      .optional()
      .isIn(['active', 'maintenance', 'retired'])
      .withMessage('Status must be active, maintenance, or retired')
  ],
  assign: [
    body('cart_id')
      .isLength({ min: 1 })
      .withMessage('Cart ID is required'),
    body('renter_phone')
      .isLength({ min: 10 })
      .withMessage('Valid phone number is required'),
    body('duration_hours')
      .optional()
      .isInt({ min: 1, max: 168 })
      .withMessage('Duration must be between 1 and 168 hours')
  ],
  query: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn(['active', 'maintenance', 'retired'])
      .withMessage('Status must be active, maintenance, or retired')
  ],
  locationHistory: [
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
  ]
};