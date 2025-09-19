import mongoose, { Document, Schema } from 'mongoose';

export interface IAlert extends Document {
  alert_type: 'proximity' | 'fraud' | 'offline' | 'battery_low';
  cart_ids: string[];
  severity: 'low' | 'medium' | 'high';
  message: string;
  details: any;
  location?: {
    type: 'Point';
    coordinates: [number, number];
  };
  status: 'active' | 'acknowledged' | 'resolved' | 'dismissed';
  created_at: Date;
  acknowledged_at?: Date;
  acknowledged_by?: string;
  resolved_at?: Date;
  dismissed_at?: Date;
  dismissed_by?: string;
}

const locationSchema = new Schema({
  type: {
    type: String,
    enum: ['Point'],
    required: true
  },
  coordinates: {
    type: [Number],
    required: true
  }
}, { _id: false });

const AlertSchema: Schema = new Schema({
  alert_type: {
    type: String,
    enum: ['proximity', 'fraud', 'offline', 'battery_low'],
    required: true,
    index: true
  },
  cart_ids: [{
    type: String,
    required: true,
    index: true
  }],
  severity: {
    type: String,
    enum: ['low', 'medium', 'high'],
    required: true,
    index: true
  },
  message: {
    type: String,
    required: true
  },
  details: {
    type: Schema.Types.Mixed,
    default: {}
  },
  location: {
    type: locationSchema
  },
  status: {
    type: String,
    enum: ['active', 'acknowledged', 'resolved', 'dismissed'],
    default: 'active',
    index: true
  },
  acknowledged_at: {
    type: Date
  },
  acknowledged_by: {
    type: String
  },
  resolved_at: {
    type: Date
  },
  dismissed_at: {
    type: Date
  },
  dismissed_by: {
    type: String
  }
}, {
  timestamps: { 
    createdAt: 'created_at',
    updatedAt: false
  }
});

// Indexes
AlertSchema.index({ alert_type: 1, status: 1 });
AlertSchema.index({ cart_ids: 1 });
AlertSchema.index({ status: 1, created_at: -1 });
AlertSchema.index({ location: '2dsphere' });
AlertSchema.index({ severity: 1, status: 1 });
AlertSchema.index({ created_at: -1 });

// Compound indexes
AlertSchema.index({ status: 1, alert_type: 1, created_at: -1 });

export const Alert = mongoose.model<IAlert>('Alert', AlertSchema);