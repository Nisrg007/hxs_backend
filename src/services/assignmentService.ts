import { CartAssignment } from '../models/CartAssignment';
import { logger } from '../utils/logger';

export class AssignmentService {
  async createAssignment(
    cartId: string, 
    renterPhone: string, 
    assignedBy: string, 
    durationHours: number = 24
  ): Promise<{ assignmentToken: string; expiresAt: Date }> {
    // Check for existing active assignment
    const existingAssignment = await CartAssignment.findOne({
      cart_id: cartId,
      status: 'active'
    });

    if (existingAssignment) {
      throw new Error('Cart is already assigned');
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + durationHours);

    // Generate a simple token (in production, use JWT)
    const assignmentToken = this.generateAssignmentToken();

    const assignment = new CartAssignment({
      cart_id: cartId,
      assignment_token_hash: assignmentToken,
      renter_phone: renterPhone,
      assigned_by: assignedBy,
      expires_at: expiresAt
    });

    await assignment.save();

    logger.info('Cart assignment created', {
      cartId,
      renterPhone,
      expiresAt,
      assignedBy
    });

    return { assignmentToken, expiresAt };
  }

  async activateAssignment(
    assignmentToken: string, 
    deviceFingerprint: string
  ): Promise<{ cartId: string; vendorId: string }> {
    const assignment = await CartAssignment.findOne({
      assignment_token_hash: assignmentToken,
      status: 'pending'
    });

    if (!assignment) {
      throw new Error('Invalid or expired assignment token');
    }

    if (assignment.expires_at < new Date()) {
      await CartAssignment.findByIdAndUpdate(assignment._id, {
        status: 'expired'
      });
      throw new Error('Assignment token has expired');
    }

    // Update assignment with device information
    await CartAssignment.findByIdAndUpdate(assignment._id, {
      device_fingerprint: deviceFingerprint,
      status: 'active',
      activated_at: new Date()
    });

    logger.info('Cart assignment activated', {
      cartId: assignment.cart_id,
      deviceFingerprint
    });

    return { cartId: assignment.cart_id, vendorId: 'vendor-id' }; // vendorId should come from cart
  }

  async revokeAssignment(cartId: string, reason: string = 'admin_revoked'): Promise<void> {
    const assignment = await CartAssignment.findOneAndUpdate(
      {
        cart_id: cartId,
        status: 'active'
      },
      {
        status: 'revoked',
        revoked_at: new Date(),
        revoked_reason: reason
      }
    );

    if (!assignment) {
      throw new Error('No active assignment found for cart');
    }

    logger.info('Cart assignment revoked', {
      cartId,
      reason
    });
  }

  async getActiveAssignment(cartId: string): Promise<any> {
    return await CartAssignment.findOne({
      cart_id: cartId,
      status: 'active'
    }).lean();
  }

  async getAssignmentHistory(cartId: string, limit: number = 20): Promise<any[]> {
    return await CartAssignment.find({ cart_id: cartId })
      .sort({ assigned_at: -1 })
      .limit(limit)
      .lean();
  }

  async cleanupExpiredAssignments(): Promise<number> {
    const result = await CartAssignment.updateMany(
      {
        status: { $in: ['pending', 'active'] },
        expires_at: { $lt: new Date() }
      },
      {
        status: 'expired'
      }
    );

    if (result.modifiedCount > 0) {
      logger.info('Expired assignments cleaned up', {
        count: result.modifiedCount
      });
    }

    return result.modifiedCount;
  }

  private generateAssignmentToken(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}