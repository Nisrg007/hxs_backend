import mongoose, { Document, Schema } from 'mongoose';

export interface IAdminAuditLog extends Document {
  admin_user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: any;
  ip_address: string;
  user_agent: string;
  timestamp: Date;
}

const AdminAuditLogSchema: Schema = new Schema({
  admin_user_id: {
    type: String,
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  resource_type: {
    type: String,
    required: true,
    index: true
  },
  resource_id: {
    type: String,
    required: true,
    index: true
  },
  details: {
    type: Schema.Types.Mixed,
    default: {}
  },
  ip_address: {
    type: String,
    required: true
  },
  user_agent: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Indexes
AdminAuditLogSchema.index({ admin_user_id: 1, timestamp: -1 });
AdminAuditLogSchema.index({ action: 1, timestamp: -1 });
AdminAuditLogSchema.index({ resource_type: 1, resource_id: 1 });
AdminAuditLogSchema.index({ timestamp: -1 });

// TTL index for log retention (1 year)
AdminAuditLogSchema.index({ timestamp: 1 }, { 
  expireAfterSeconds: 365 * 24 * 60 * 60
});

export const AdminAuditLog = mongoose.model<IAdminAuditLog>('AdminAuditLog', AdminAuditLogSchema);