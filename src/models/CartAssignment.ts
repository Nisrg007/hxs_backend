import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';

export interface ICartAssignment extends Document {
  cart_id: string;
  assignment_token_hash?: string;
  renter_phone?: string;
  device_fingerprint?: string;
  access_token_hash?: string;
  refresh_token_hash?: string;
  status: 'pending' | 'active' | 'expired' | 'revoked';
  assigned_by: string;
  assigned_at: Date;
  activated_at?: Date;
  expires_at: Date;
  revoked_at?: Date;
  revoked_reason?: string;

  compareToken(token: string, type: 'assignment' | 'access' | 'refresh'): Promise<boolean>;
}

const CartAssignmentSchema = new Schema<ICartAssignment>(
  {
    cart_id: { type: String, required: true, index: true },
    assignment_token_hash: { type: String, sparse: true },
    renter_phone: String,
    device_fingerprint: { type: String, index: true },
    access_token_hash: { type: String, sparse: true },
    refresh_token_hash: { type: String, sparse: true },
    status: {
      type: String,
      enum: ['pending', 'active', 'expired', 'revoked'],
      default: 'pending',
    },
    assigned_by: { type: String, required: true },
    assigned_at: { type: Date, default: Date.now },
    activated_at: Date,
    expires_at: { type: Date, required: true },
    revoked_at: Date,
    revoked_reason: String,
  },
  { timestamps: true }
);

CartAssignmentSchema.pre('save', async function (next) {
  if (this.isModified('assignment_token_hash') && this.assignment_token_hash) {
    this.assignment_token_hash = await bcrypt.hash(this.assignment_token_hash, 12);
  }
  if (this.isModified('access_token_hash') && this.access_token_hash) {
    this.access_token_hash = await bcrypt.hash(this.access_token_hash, 12);
  }
  if (this.isModified('refresh_token_hash') && this.refresh_token_hash) {
    this.refresh_token_hash = await bcrypt.hash(this.refresh_token_hash, 12);
  }
  next();
});

CartAssignmentSchema.methods.compareToken = async function (
  candidateToken: string,
  tokenType: 'assignment' | 'access' | 'refresh'
): Promise<boolean> {
  const hashMap: Record<typeof tokenType, string | undefined> = {
    assignment: this.assignment_token_hash,
    access: this.access_token_hash,
    refresh: this.refresh_token_hash,
  };

  const hash = hashMap[tokenType];
  if (!hash) {
    logger.warn(`No ${tokenType} token hash found for comparison`);
    return false;
  }

  return bcrypt.compare(candidateToken, hash);
};

// Indexes
CartAssignmentSchema.index({ cart_id: 1, status: 1 });
CartAssignmentSchema.index({ device_fingerprint: 1 });
CartAssignmentSchema.index({ assigned_at: -1 });
CartAssignmentSchema.index({ expires_at: 1 });

export const CartAssignment = mongoose.model<ICartAssignment>(
  'CartAssignment',
  CartAssignmentSchema
);
