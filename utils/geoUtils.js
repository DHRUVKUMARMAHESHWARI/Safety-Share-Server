import polyline from '@mapbox/polyline';

// Haversine formula to calculate the distance between two points on the Earth's surface
export const calculateDistance = (coord1, coord2) => {
  const R = 6371e3; // Earth radius in meters
  const lat1 = (coord1.lat * Math.PI) / 180; // φ, λ in radians
  const lat2 = (coord2.lat * Math.PI) / 180;
  const deltaLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const deltaLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

// Calculate initial bearing between two points
export const calculateBearing = (startCoord, endCoord) => {
  const startLat = (startCoord.lat * Math.PI) / 180;
  const startLng = (startCoord.lng * Math.PI) / 180;
  const endLat = (endCoord.lat * Math.PI) / 180;
  const endLng = (endCoord.lng * Math.PI) / 180;

  const y = Math.sin(endLng - startLng) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);
  
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360; // Normalize to 0-360
};

// Decode polyline string to [ [lat, lng], ... ]
export const decodePolyline = (encodedPolyline) => {
  if (!encodedPolyline) return [];
  try {
      return polyline.decode(encodedPolyline);
  } catch (error) {
      console.error('Error decoding polyline:', error);
      return [];
  }
};

// Calculate perpendicular distance from a point to a line segment
const distanceFromLineSegment = (point, lineStart, lineEnd) => {
    const x = point.lat;
    const y = point.lng;
    const x1 = lineStart[0];
    const y1 = lineStart[1];
    const x2 = lineEnd[0];
    const y2 = lineEnd[1];

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    
    let param = -1;
    if (len_sq !== 0) // in case of 0 length line
        param = dot / len_sq;

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;
    
    // Approximate distance in degrees (rough, but fast for check)
    // To be precise we should convert back to meters, but for 'isNear' check
    // we can use a small degree threshold or convert distances.
    // Let's use haversine on the projected point for accuracy.
    return calculateDistance({lat: x, lng: y}, {lat: xx, lng: yy});
}

// Check if a point is near any segment of the polyline
export const isPointNearRoute = (point, decodedPath, thresholdMeters = 50) => {
    if (!decodedPath || decodedPath.length < 2) return false;

    for (let i = 0; i < decodedPath.length - 1; i++) {
        const dist = distanceFromLineSegment(point, decodedPath[i], decodedPath[i+1]);
        if (dist <= thresholdMeters) return true;
    }
    return false;
};

// Check if the bearing is within a certain angle of the user's heading
// This determines if the hazard is "ahead" or roughly in same direction
export const isBearingWithinRange = (heading, bearing, range = 45) => {
    const diff = Math.abs(heading - bearing);
    const minDiff = Math.min(diff, 360 - diff);
    return minDiff <= range;
}
