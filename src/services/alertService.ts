import { Alert } from '../models/Alert';
import { logger } from '../utils/logger';
import { config } from '../config/environment';

export class AlertService {
  private readonly ALERT_COOLDOWN = config.proximity.alertCooldown;

  async createProximityAlert(cartIds: string[], distance: number): Promise<any> {
    // Check if similar alert already exists and is still active
    const existingAlert = await Alert.findOne({
      alert_type: 'proximity',
      cart_ids: { $all: cartIds },
      status: 'active',
      created_at: { $gte: new Date(Date.now() - this.ALERT_COOLDOWN) }
    });

    if (existingAlert) {
      logger.debug('Proximity alert already exists, skipping', {
        cartIds,
        existingAlertId: existingAlert._id
      });
      return null;
    }

    const severity = this.getProximitySeverity(distance);

    const alert = new Alert({
      alert_type: 'proximity',
      cart_ids: cartIds,
      severity,
      message: `Carts ${cartIds.join(' and ')} are too close (${distance}m apart)`,
      details: {
        distance,
        threshold: config.proximity.maxDistance
      },
      status: 'active'
    });

    await alert.save();

    logger.info('Proximity alert created', {
      alertId: alert._id,
      cartIds,
      distance,
      severity
    });

    return alert;
  }

  async createFraudAlert(cartId: string, fraudType: string, details: any): Promise<any> {
    const alert = new Alert({
      alert_type: 'fraud',
      cart_ids: [cartId],
      severity: 'high',
      message: `Fraud detected: ${fraudType} for cart ${cartId}`,
      details,
      status: 'active'
    });

    await alert.save();

    logger.warn('Fraud alert created', {
      alertId: alert._id,
      cartId,
      fraudType
    });

    return alert;
  }

  async createOfflineAlert(cartId: string, offlineMinutes: number): Promise<any> {
    const alert = new Alert({
      alert_type: 'offline',
      cart_ids: [cartId],
      severity: offlineMinutes > 120 ? 'high' : 'medium',
      message: `Cart ${cartId} has been offline for ${offlineMinutes} minutes`,
      details: { offlineMinutes },
      status: 'active'
    });

    await alert.save();

    logger.warn('Offline alert created', {
      alertId: alert._id,
      cartId,
      offlineMinutes
    });

    return alert;
  }

  async createLowBatteryAlert(cartId: string, batteryLevel: number): Promise<any> {
    const alert = new Alert({
      alert_type: 'battery_low',
      cart_ids: [cartId],
      severity: batteryLevel < 10 ? 'high' : 'medium',
      message: `Cart ${cartId} has low battery (${batteryLevel}%)`,
      details: { batteryLevel },
      status: 'active'
    });

    await alert.save();

    logger.warn('Low battery alert created', {
      alertId: alert._id,
      cartId,
      batteryLevel
    });

    return alert;
  }

  async acknowledgeAlert(alertId: string, adminUserId: string): Promise<any> {
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
      throw new Error('Alert not found');
    }

    return alert;
  }

  async dismissAlert(alertId: string, adminUserId: string, reason?: string): Promise<any> {
    const alert = await Alert.findByIdAndUpdate(
      alertId,
      {
        status: 'dismissed',
        dismissed_at: new Date(),
        dismissed_by: adminUserId,
        ...(reason && { 'details.dismissal_reason': reason })
      },
      { new: true }
    );

    if (!alert) {
      throw new Error('Alert not found');
    }

    return alert;
  }

  async resolveAlert(alertId: string): Promise<any> {
    const alert = await Alert.findByIdAndUpdate(
      alertId,
      {
        status: 'resolved',
        resolved_at: new Date()
      },
      { new: true }
    );

    if (!alert) {
      throw new Error('Alert not found');
    }

    return alert;
  }

  async getActiveAlerts(): Promise<any[]> {
    return await Alert.find({ status: 'active' })
      .sort({ created_at: -1 })
      .lean();
  }

  async getAlertsByCart(cartId: string, limit: number = 50): Promise<any[]> {
    return await Alert.find({ cart_ids: cartId })
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();
  }

  private getProximitySeverity(distance: number): string {
    if (distance <= 100) return 'high';
    if (distance <= 250) return 'medium';
    return 'low';
  }
}