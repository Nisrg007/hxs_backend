import { logger } from '../utils/logger';
import { calculateDistance, calculateSpeed } from '../utils/geospatial';
import { LocationService } from './locationService';
import { config } from '../config/environment';

interface FraudResult {
  flagged: boolean;
  flags: {
    mock_location: boolean;
    unrealistic_speed: boolean;
    timestamp_skew: boolean;
    rooted_device: boolean;
  };
  warnings: string[];
  confidence: number;
}

interface LocationData {
  cart_id: string;
  latitude: number;
  longitude: number;
  timestamp: Date;
  accuracy: number;
  speed?: number;
  device_info: {
    is_mock_location?: boolean;
    is_rooted?: boolean;
    app_version: string;
    os_version: string;
  };
}

export class AntifraudService {
  private locationService: LocationService;

  constructor() {
    this.locationService = new LocationService();
  }

  async validateLocation(locationData: LocationData, cartId: string): Promise<FraudResult> {
    const result: FraudResult = {
      flagged: false,
      flags: {
        mock_location: false,
        unrealistic_speed: false,
        timestamp_skew: false,
        rooted_device: false
      },
      warnings: [],
      confidence: 0
    };

    let fraudScore = 0;

    // 1. Check for mock location (Android Developer Options)
    if (locationData.device_info.is_mock_location) {
      result.flags.mock_location = true;
      fraudScore += 80;
      result.warnings.push('Mock location detected from device settings');
    }

    // 2. Check for rooted/jailbroken device
    if (locationData.device_info.is_rooted) {
      result.flags.rooted_device = true;
      fraudScore += 60;
      result.warnings.push('Rooted/jailbroken device detected');
    }

    // 3. Check timestamp skew
    const now = new Date();
    const timestampSkew = Math.abs(now.getTime() - locationData.timestamp.getTime());
    if (timestampSkew > config.location.maxTimestampSkew) {
      result.flags.timestamp_skew = true;
      fraudScore += 40;
      result.warnings.push(`Timestamp skew detected: ${Math.round(timestampSkew / 1000)}s`);
    }

    // 4. Check unrealistic speed by comparing with previous location
    try {
      const previousLocation = await this.locationService.getCurrentLocation(cartId);
      if (previousLocation && previousLocation.timestamp) {
        const timeDiff = locationData.timestamp.getTime() - previousLocation.timestamp.getTime();
        
        if (timeDiff > 0) {
          const distance = calculateDistance(
            previousLocation.location.coordinates[1],
            previousLocation.location.coordinates[0],
            locationData.latitude,
            locationData.longitude
          );

          const calculatedSpeed = calculateSpeed(distance, timeDiff);
          
          if (calculatedSpeed > config.location.maxRealisticSpeed) {
            result.flags.unrealistic_speed = true;
            fraudScore += 70;
            result.warnings.push(
              `Unrealistic speed detected: ${Math.round(calculatedSpeed)} km/h ` +
              `(moved ${Math.round(distance)}m in ${Math.round(timeDiff / 1000)}s)`
            );
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to check speed validation', {
        cartId,
        error: (error as Error).message
      });
    }

    // 5. Check accuracy threshold
    if (locationData.accuracy > config.location.maxAccuracy) {
      fraudScore += 30;
      result.warnings.push(`Low accuracy location: ${locationData.accuracy.toFixed(1)}m`);
    }

    // 6. Check for impossible locations (middle of ocean, etc.)
    if (this.isImpossibleLocation(locationData.latitude, locationData.longitude)) {
      fraudScore += 90;
      result.warnings.push('Location appears to be in an impossible area');
    }

    // Calculate confidence score (0-100)
    result.confidence = Math.min(100, fraudScore);
    result.flagged = fraudScore >= 50;

    if (result.flagged) {
      logger.warn('Fraud flags detected', {
        cartId,
        flags: result.flags,
        warnings: result.warnings,
        confidence: result.confidence
      });
    }

    return result;
  }

  private isImpossibleLocation(latitude: number, longitude: number): boolean {
    // Simple check for obviously impossible locations
    // In production, this would use a geofencing service or database
    const impossibleAreas = [
      // Middle of oceans
      { lat: [ -90, 90 ], lng: [ -180, -120 ] }, // Pacific Ocean
      { lat: [ -90, 90 ], lng: [ 120, 180 ] },   // Pacific Ocean
      // North Pole
      { lat: [ 85, 90 ], lng: [ -180, 180 ] },
      // South Pole
      { lat: [ -90, -85 ], lng: [ -180, 180 ] },
      // Test coordinates (Null Island)
      { lat: [ 0, 0 ], lng: [ 0, 0 ] }
    ];

    return impossibleAreas.some(area => 
      latitude >= area.lat[0] && latitude <= area.lat[1] &&
      longitude >= area.lng[0] && longitude <= area.lng[1]
    );
  }

  // Additional fraud detection methods can be added here
  async detectPatternAnomalies(cartId: string): Promise<FraudResult> {
    // This would analyze historical patterns for anomalies
    // For now, return a basic result
    return {
      flagged: false,
      flags: {
        mock_location: false,
        unrealistic_speed: false,
        timestamp_skew: false,
        rooted_device: false
      },
      warnings: [],
      confidence: 0
    };
  }
}