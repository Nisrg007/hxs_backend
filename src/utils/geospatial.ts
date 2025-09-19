// Haversine formula to calculate distance between two points
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
};

export const calculateSpeed = (distance: number, timeDiff: number): number => {
  // distance in meters, timeDiff in milliseconds
  const timeInHours = timeDiff / 1000 / 3600;
  const distanceInKm = distance / 1000;
  return timeInHours > 0 ? distanceInKm / timeInHours : 0;
};

export const isPointInBounds = (
  point: { lat: number; lng: number },
  bounds: { sw: { lat: number; lng: number }; ne: { lat: number; lng: number } }
): boolean => {
  return (
    point.lat >= bounds.sw.lat &&
    point.lat <= bounds.ne.lat &&
    point.lng >= bounds.sw.lng &&
    point.lng <= bounds.ne.lng
  );
};