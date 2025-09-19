import { Request, Response } from 'express';
import { body } from 'express-validator';
import { LocationService } from '../services/locationService';
import { AntifraudService } from '../services/antifraudService';
import { EventService } from '../services/eventService';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

const locationService = new LocationService();
const antifraudService = new AntifraudService();
const eventService = new EventService();

export const ingestLocation = asyncHandler(async (req: AuthRequest, res: Response) => {
    const cartContext = req.cartContext!;

    const {
        latitude,
        longitude,
        timestamp,
        accuracy,
        speed,
        heading,
        battery_level,
        is_moving,
        device_info
    } = req.body;

    // Validate location data
    if (accuracy > 1000) {
        return res.status(400).json({
            error: 'invalid_accuracy',
            message: 'Location accuracy is too low'
        });
    }

    // Anti-fraud validation
    const fraudResult = await antifraudService.validateLocation({
        cart_id: cartContext.cart_id,
        latitude,
        longitude,
        timestamp: new Date(timestamp),
        accuracy,
        speed,
        device_info
    }, cartContext.cart_id);

    // Calculate next update interval
    const nextUpdateInterval =await locationService.calculateNextUpdateInterval(
        cartContext.cart_id,
        is_moving,
        new Date(timestamp)
    );

    // Prepare location document
    const locationDoc = {
        cart_id: cartContext.cart_id,
        location: {
            type: 'Point' as const,
            coordinates: [longitude, latitude] as [number, number]
        },
        timestamp: new Date(timestamp),
        accuracy,
        speed,
        heading,
        battery_level,
        is_moving,
        fraud_flags: fraudResult.flags,
        device_info: {
            device_id: cartContext.device_fingerprint,
            app_version: device_info.app_version,
            os_version: device_info.os_version
        }
    };

    // Store location data
    await Promise.all([
        locationService.upsertCurrentLocation(locationDoc),
        locationService.insertLocationHistory(locationDoc)
    ]);

    // Emit real-time events
    await eventService.emitLocationUpdated({
        cart_id: cartContext.cart_id,
        location: {
            latitude,
            longitude,
            timestamp: new Date(timestamp),
            accuracy,
            is_moving
        },
        fraud_flags: fraudResult.flags
    });

    await eventService.emitLocationSyncRequested({
        cart_id: cartContext.cart_id,
        vendor_id: cartContext.vendor_id,
        location: {
            latitude,
            longitude,
            timestamp: new Date(timestamp)
        },
        idempotency_key: `${cartContext.cart_id}-${new Date(timestamp).getTime()}`
    });

    logger.info('Location ingested', {
        cart_id: cartContext.cart_id,
        coordinates: [longitude, latitude],
        fraud_detected: fraudResult.flagged,
        next_update_in: nextUpdateInterval || 0
    });

    return res.json({
        status: 'success',
        next_update_in: nextUpdateInterval || 0,
        fraud_detected: fraudResult.flagged,
        warnings: fraudResult.warnings,
        server_time: new Date().toISOString()
    });
});

// Validation rules
export const ingestValidation = {
    location: [
        body('latitude')
            .isFloat({ min: -90, max: 90 })
            .withMessage('Latitude must be between -90 and 90'),
        body('longitude')
            .isFloat({ min: -180, max: 180 })
            .withMessage('Longitude must be between -180 and 180'),
        body('timestamp')
            .isISO8601()
            .withMessage('Timestamp must be a valid ISO 8601 date'),
        body('accuracy')
            .isFloat({ min: 0, max: 10000 })
            .withMessage('Accuracy must be between 0 and 10000 meters'),
        body('speed')
            .optional()
            .isFloat({ min: 0, max: 500 })
            .withMessage('Speed must be between 0 and 500 km/h'),
        body('heading')
            .optional()
            .isFloat({ min: 0, max: 360 })
            .withMessage('Heading must be between 0 and 360 degrees'),
        body('battery_level')
            .optional()
            .isInt({ min: 0, max: 100 })
            .withMessage('Battery level must be between 0 and 100'),
        body('is_moving')
            .isBoolean()
            .withMessage('is_moving must be a boolean'),
        body('device_info')
            .isObject()
            .withMessage('device_info must be an object'),
        body('device_info.app_version')
            .isLength({ min: 1 })
            .withMessage('app_version is required'),
        body('device_info.os_version')
            .isLength({ min: 1 })
            .withMessage('os_version is required'),
        body('device_info.is_mock_location')
            .optional()
            .isBoolean()
            .withMessage('is_mock_location must be a boolean'),
        body('device_info.is_rooted')
            .optional()
            .isBoolean()
            .withMessage('is_rooted must be a boolean')
    ]
};