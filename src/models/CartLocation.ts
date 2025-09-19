import mongoose, { Document, Schema } from 'mongoose';

export interface ICartCurrent extends Document {
  cart_id: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  timestamp: Date;
  accuracy: number;
  speed?: number;
  heading?: number;
  battery_level?: number;
  is_moving: boolean;
  fraud_flags: {
    mock_location: boolean;
    unrealistic_speed: boolean;
    timestamp_skew: boolean;
  };
  device_info: {
    device_id: string;
    app_version: string;
    os_version: string;
  };
  updated_at: Date;
}

export interface ICartLocation extends Document {
  cart_id: string;
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  timestamp: Date;
  accuracy: number;
  speed?: number;
  heading?: number;
  battery_level?: number;
  is_moving: boolean;
  fraud_flags: {
    mock_location?: boolean;
    unrealistic_speed: boolean;
    timestamp_skew: boolean;
  };
  device_info: {
    device_id: string;
    app_version: string;
    os_version: string;
  };
  created_at: Date;
}

// Current location schema (one document per cart)
const CartCurrentSchema: Schema = new Schema({
  cart_id: {
    type: String,
    required: true,
    unique: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true
    },
    coordinates: {
      type: [Number],
      required: true
    }
  },
  timestamp: {
    type: Date,
    required: true
  },
  accuracy: {
    type: Number,
    required: true,
    min: 0
  },
  speed: {
    type: Number,
    min: 0
  },
  heading: {
    type: Number,
    min: 0,
    max: 360
  },
  battery_level: {
    type: Number,
    min: 0,
    max: 100
  },
  is_moving: {
    type: Boolean,
    required: true
  },
  fraud_flags: {
    mock_location: { type: Boolean, default: false },
    unrealistic_speed: { type: Boolean, default: false },
    timestamp_skew: { type: Boolean, default: false }
  },
  device_info: {
    device_id: String,
    app_version: String,
    os_version: String
  }
}, {
  timestamps: { 
    createdAt: false,
    updatedAt: 'updated_at'
  }
});

// Historical location schema
const CartLocationSchema: Schema = new Schema({
  cart_id: {
    type: String,
    required: true,
    index: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true
    },
    coordinates: {
      type: [Number],
      required: true
    }
  },
  timestamp: {
    type: Date,
    required: true,
    index: true
  },
  accuracy: {
    type: Number,
    required: true,
    min: 0
  },
  speed: {
    type: Number,
    min: 0
  },
  heading: {
    type: Number,
    min: 0,
    max: 360
  },
  battery_level: {
    type: Number,
    min: 0,
    max: 100
  },
  is_moving: {
    type: Boolean,
    required: true
  },
  fraud_flags: {
    mock_location: { type: Boolean, default: false },
    unrealistic_speed: { type: Boolean, default: false },
    timestamp_skew: { type: Boolean, default: false }
  },
  device_info: {
    device_id: String,
    app_version: String,
    os_version: String
  }
}, {
  timestamps: { 
    createdAt: 'created_at',
    updatedAt: false
  }
});

// Create geospatial indexes
CartCurrentSchema.index({ location: '2dsphere' });
CartLocationSchema.index({ location: '2dsphere' });

// Create other indexes
CartCurrentSchema.index({ cart_id: 1 }, { unique: true });
CartCurrentSchema.index({ updated_at: -1 });
CartCurrentSchema.index({ is_moving: 1, updated_at: -1 });

CartLocationSchema.index({ cart_id: 1, timestamp: -1 });
CartLocationSchema.index({ created_at: -1 });

// TTL index for data retention (90 days)
CartLocationSchema.index({ created_at: 1 }, { 
  expireAfterSeconds: 90 * 24 * 60 * 60 // 90 days
});

export const CartCurrent = mongoose.model<ICartCurrent>('CartCurrent', CartCurrentSchema);
export const CartLocation = mongoose.model<ICartLocation>('CartLocation', CartLocationSchema);