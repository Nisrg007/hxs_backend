import mongoose, { Document, Schema } from 'mongoose';

export interface ICart extends Document {
  cart_id: string;
  vendor_id: string;
  cart_model: string;
  serial_number?: string;
  status: 'active' | 'maintenance' | 'retired';
  created_at: Date;
  updated_at: Date;
}

const CartSchema: Schema = new Schema({
  cart_id: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  vendor_id: {
    type: String,
    required: true,
    index: true
  },
  cart_model: {
    type: String,
    required: true
  },
  serial_number: {
    type: String,
    sparse: true // Allows multiple null values
  },
  status: {
    type: String,
    enum: ['active', 'maintenance', 'retired'],
    default: 'active'
  }
}, {
  timestamps: { 
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Create indexes
CartSchema.index({ cart_id: 1 }, { unique: true });
CartSchema.index({ vendor_id: 1 });
CartSchema.index({ status: 1 });
CartSchema.index({ created_at: -1 });

export const Cart = mongoose.model<ICart>('Cart', CartSchema);