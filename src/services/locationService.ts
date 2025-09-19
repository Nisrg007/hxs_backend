import { CartCurrent, CartLocation, ICartCurrent, ICartLocation } from '../models/CartLocation';
import { logger } from '../utils/logger';
import { calculateDistance, calculateSpeed } from '../utils/geospatial';

/**
 * Utility: validate coordinates
 */
function validateCoordinates(coords?: [number, number]): boolean {
  if (!coords) return false;
  const [lng, lat] = coords;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function assertValidLocation(doc: Partial<ICartLocation | ICartCurrent>) {
  if (!doc.location?.coordinates) {
    throw new Error("Missing coordinates");
  }
  const [lng, lat] = doc.location.coordinates;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error("Invalid coordinates");
  }
}

export class LocationService {
  /**
   * Upsert current location for a cart
   * Adds validation + rate limiting + fraud detection
   */

  async upsertCurrentLocation(locationDoc: Partial<ICartCurrent>): Promise<void> {
      
    assertValidLocation(locationDoc);
    try {
      if (!locationDoc.cart_id || !validateCoordinates(locationDoc.location?.coordinates)) {
        throw new Error("Invalid cart_id or coordinates");
      }

      // Rate limiting: avoid updates <30s apart
      const lastUpdate = await CartCurrent.findOne({ cart_id: locationDoc.cart_id });
      if (lastUpdate && locationDoc.timestamp) {
        const diff = (locationDoc.timestamp.getTime() - lastUpdate.updated_at.getTime()) / 1000;
        if (diff < 30) {
          logger.warn(`Rate limit: skipping update for cart ${locationDoc.cart_id}`);
          return;
        }
      }

      await CartCurrent.findOneAndUpdate(
        { cart_id: locationDoc.cart_id },
        { $set: locationDoc },
        { upsert: true, new: true }
      );

      logger.debug('Current location upserted', {
        cartId: locationDoc.cart_id,
        coordinates: locationDoc.location?.coordinates
      });

    } catch (error) {
      logger.error('Failed to upsert current location:', error);
      throw new Error(`Failed to upsert location for cart ${locationDoc.cart_id}`);
    }
  }

  /**
   * Insert location into historical collection
   * Computes speed + basic fraud flags
   */
  async insertLocationHistory(locationDoc: Partial<ICartLocation>): Promise<void> {
      
    assertValidLocation(locationDoc);
    try {
      if (!locationDoc.cart_id || !validateCoordinates(locationDoc.location?.coordinates)) {
        throw new Error("Invalid cart_id or coordinates");
      }

      const lastLocation = await CartLocation.findOne({ cart_id: locationDoc.cart_id })
        .sort({ timestamp: -1 });

      if (
  lastLocation &&
  locationDoc.timestamp &&
  lastLocation.timestamp &&
  locationDoc.location?.coordinates &&
  lastLocation.location?.coordinates
) {
  const distance = calculateDistance(
    lastLocation.location.coordinates[1], // lat
    lastLocation.location.coordinates[0], // lng
    locationDoc.location.coordinates[1],
    locationDoc.location.coordinates[0]
  );

  const timeDiff = locationDoc.timestamp.getTime() - lastLocation.timestamp.getTime();
  const speed = calculateSpeed(distance, timeDiff);
  (locationDoc as any).speed = speed;

  locationDoc.fraud_flags = {
    ...(locationDoc.fraud_flags || {}),
    unrealistic_speed: speed > 200,
    timestamp_skew: timeDiff < 0,
    mock_location: false
  };
}

      const location = new CartLocation(locationDoc);
      await location.save();

      logger.debug('Location history inserted', {
        cartId: locationDoc.cart_id,
        timestamp: locationDoc.timestamp,
        speed: (locationDoc as any).speed
      });

    } catch (error) {
      logger.error('Failed to insert location history:', error);
      throw new Error(`Failed to insert location history for cart ${locationDoc.cart_id}`);
    }
  }

  /**
   * Calculate next update interval based on cart state and schedule
   */
  async calculateNextUpdateInterval(
    cartId: string,
    isMoving: boolean,
    timestamp: Date
  ): Promise<number> {
    const hour = timestamp.getHours();

    if (hour >= 22 || hour < 6) {
      return 0; // Off hours → manual only
    }
    return isMoving ? 10 * 60 : 60 * 60; // 10m if moving, 60m if idle
  }

  /**
   * Get current location for cart
   */
  async getCurrentLocation(cartId: string): Promise<ICartCurrent | null> {
    return await CartCurrent.findOne({ cart_id: cartId });
  }

  /**
   * Get location history for cart
   */
  async getLocationHistory(
    cartId: string,
    fromDate?: Date,
    toDate?: Date,
    limit: number = 100
  ): Promise<ICartLocation[]> {
    const query: any = { cart_id: cartId };
    if (fromDate || toDate) {
      query.timestamp = {};
      if (fromDate) query.timestamp.$gte = fromDate;
      if (toDate) query.timestamp.$lte = toDate;
    }

    return await CartLocation.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Find carts within geographic bounds
   */
  async getCartsInBounds(
    southWest: [number, number],
    northEast: [number, number]
  ): Promise<ICartCurrent[]> {
    return await CartCurrent.find({
      location: {
        $geoWithin: {
          $box: [southWest, northEast]
        }
      }
    }).lean();
  }

  /**
   * Find nearby carts for a given cart using $near (optimized)
   */
  async findNearbyCarts(
    cartId: string,
    maxDistanceMeters = 500
  ): Promise<ICartCurrent[]> {
    const cart = await CartCurrent.findOne({ cart_id: cartId });
    if (!cart?.location) return [];

    return await CartCurrent.find({
      cart_id: { $ne: cartId },
      location: {
        $near: {
          $geometry: cart.location,
          $maxDistance: maxDistanceMeters
        }
      }
    }).lean();
  }

  /**
   * Check carts inactive for threshold hours
   */
  async checkInactiveCarts(thresholdHours: number = 6): Promise<string[]> {
    const cutoff = new Date(Date.now() - thresholdHours * 3600 * 1000);
    const inactiveCarts = await CartCurrent.find({
      updated_at: { $lt: cutoff }
    }).lean();

    return inactiveCarts.map(c => c.cart_id);
  }
   async findCartProximityPairs(maxDistanceMeters: number) {
    // Fetch all carts with latest location
    const carts = await CartLocation.find().lean();

    const pairs: {
      cart1: any;
      cart2: any;
      distance: number;
    }[] = [];

    // Compare each pair of carts
    for (let i = 0; i < carts.length; i++) {
      for (let j = i + 1; j < carts.length; j++) {
        const dist = this.calculateDistance(
          carts[i].location.coordinates,
          carts[j].location.coordinates
        );

        if (dist <= maxDistanceMeters) {
          pairs.push({
            cart1: carts[i],
            cart2: carts[j],
            distance: dist
          });
        }
      }
    }

    return pairs;
  }
   private calculateDistance(coord1: [number, number], coord2: [number, number]): number {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;

    const toRad = (val: number) => (val * Math.PI) / 180;

    const R = 6371000; // meters
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lon2 - lon1);

    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

}
