import { Request, Response } from 'express';
import { query, param, body } from 'express-validator';
import { Alert } from '../models/Alert';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { AdminAuditLog } from '../models/AdminAuditLog';

export const getAlerts = asyncHandler(async (req: Request, res: Response) => {
  const { status, alert_type, severity, page = 1, limit = 50 } = req.query;
  
  const query: any = {};
  
  if (status) query.status = status;
  if (alert_type) query.alert_type = alert_type;
  if (severity) query.severity = severity;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [alerts, total] = await Promise.all([
    Alert.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Alert.countDocuments(query)
  ]);

  res.json({
    alerts,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
});

export const getAlert = asyncHandler(async (req: Request, res: Response) => {
  const { alertId } = req.params;

  const alert = await Alert.findById(alertId);

  if (!alert) {
    return res.status(404).json({
      error: 'alert_not_found',
      message: 'Alert not found'
    });
  }

  return res.json({ alert });
});

export const acknowledgeAlert = asyncHandler(async (req: Request, res: Response) => {
  const { alertId } = req.params;
  const adminUserId = req.headers['x-admin-user'] as string;

  const alert = await Alert.findByIdAndUpdate(
    alertId,
    {
      status: 'acknowledged',
      acknowledged_at: new Date(),
      acknowledged_by: adminUserId
    },
    { new: true }
  );

  if (!alert) {
    return res.status(404).json({
      error: 'alert_not_found',
      message: 'Alert not found'
    });
  }

  // Log admin action
  await AdminAuditLog.create({
    admin_user_id: adminUserId,
    action: 'acknowledge_alert',
    resource_type: 'alert',
    resource_id: alertId,
    details: { alert_id: alertId },
    ip_address: req.ip || 'unknown',
    user_agent: req.get('User-Agent') || 'unknown'
  });

  logger.info('Alert acknowledged', { alert_id: alertId, admin_user_id: adminUserId });

  return res.json({
    message: 'Alert acknowledged successfully',
    alert
  });
});

export const dismissAlert = asyncHandler(async (req: Request, res: Response) => {
  const { alertId } = req.params;
  const { reason } = req.body;
  const adminUserId = req.headers['x-admin-user'] as string;

  const alert = await Alert.findByIdAndUpdate(
    alertId,
    {
      status: 'dismissed',
      dismissed_at: new Date(),
      dismissed_by: adminUserId
    },
    { new: true }
  );

  if (!alert) {
    return res.status(404).json({
      error: 'alert_not_found',
      message: 'Alert not found'
    });
  }

  // Log admin action
  await AdminAuditLog.create({
    admin_user_id: adminUserId,
    action: 'dismiss_alert',
    resource_type: 'alert',
    resource_id: alertId,
    details: { alert_id: alertId, reason },
    ip_address: req.ip || 'unknown',
    user_agent: req.get('User-Agent') || 'unknown'
  });

  logger.info('Alert dismissed', { alert_id: alertId, admin_user_id: adminUserId, reason });

  return res.json({
    message: 'Alert dismissed successfully',
    alert
  });
});

export const resolveAlert = asyncHandler(async (req: Request, res: Response) => {
  const { alertId } = req.params;
  const adminUserId = req.headers['x-admin-user'] as string;

  const alert = await Alert.findByIdAndUpdate(
    alertId,
    {
      status: 'resolved',
      resolved_at: new Date()
    },
    { new: true }
  );

  if (!alert) {
    return res.status(404).json({
      error: 'alert_not_found',
      message: 'Alert not found'
    });
  }

  // Log admin action
  await AdminAuditLog.create({
    admin_user_id: adminUserId,
    action: 'resolve_alert',
    resource_type: 'alert',
    resource_id: alertId,
    details: { alert_id: alertId },
    ip_address: req.ip || 'unknown',
    user_agent: req.get('User-Agent') || 'unknown'
  });

  logger.info('Alert resolved', { alert_id: alertId, admin_user_id: adminUserId });

  return res.json({
    message: 'Alert resolved successfully',
    alert
  });
});

// Validation rules
export const alertValidation = {
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
      .isIn(['active', 'acknowledged', 'resolved', 'dismissed'])
      .withMessage('Invalid status'),
    query('alert_type')
      .optional()
      .isIn(['proximity', 'fraud', 'offline', 'battery_low'])
      .withMessage('Invalid alert type'),
    query('severity')
      .optional()
      .isIn(['low', 'medium', 'high'])
      .withMessage('Invalid severity')
  ],
  dismiss: [
    body('reason')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Reason must be less than 500 characters')
  ],
  param: [
    param('alertId')
      .isMongoId()
      .withMessage('Valid alert ID required')
  ]
};