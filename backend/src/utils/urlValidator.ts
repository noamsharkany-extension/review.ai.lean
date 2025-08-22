/**
 * Google URL validation and parsing utilities
 * Supports various Google URL formats that show reviews including Maps, Search results, and direct links
 */

export interface ParsedGoogleUrl {
  isValid: boolean;
  placeId?: string;
  placeName?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  urlType: 'place' | 'search' | 'coordinates' | 'invalid';
  originalUrl: string;
}

/**
 * Validates if a URL is a valid Google URL that contains reviews
 */
export function validateGoogleMapsUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    
    // Check if it's a Google domain
    const validDomains = [
      'maps.google.com',
      'www.google.com',
      'google.com',
      'maps.app.goo.gl',
      'goo.gl'
    ];
    
    const isGoogleDomain = validDomains.some(domain => 
      parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain)
    );
    
    if (!isGoogleDomain) {
      return false;
    }

    // Check for various Google Maps URL patterns
    const pathname = parsedUrl.pathname;
    const searchParams = parsedUrl.searchParams;
    
    // Pattern 1: /maps/place/ URLs
    if (pathname.includes('/maps/place/')) {
      return true;
    }
    
    // Pattern 2: /search URLs with place queries
    if (pathname.includes('/search') && searchParams.has('q')) {
      return true;
    }
    
    // Pattern 3: /maps URLs with place_id parameter
    if (pathname.includes('/maps') && searchParams.has('place_id')) {
      return true;
    }
    
    // Pattern 4: Short URLs (goo.gl, maps.app.goo.gl)
    if (parsedUrl.hostname.includes('goo.gl')) {
      return true;
    }
    
    // Pattern 5: /maps/@coordinates URLs
    if (pathname.includes('/maps/@') && pathname.match(/@-?\d+\.\d+,-?\d+\.\d+/)) {
      return true;
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Parses a Google URL and extracts relevant information
 */
export function parseGoogleMapsUrl(url: string): ParsedGoogleUrl {
  const result: ParsedGoogleUrl = {
    isValid: false,
    urlType: 'invalid',
    originalUrl: url
  };

  if (!validateGoogleMapsUrl(url)) {
    return result;
  }

  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    const searchParams = parsedUrl.searchParams;
    
    result.isValid = true;

    // Priority 1: Extract place ID from URL parameters (most reliable)
    const placeIdParam = searchParams.get('place_id');
    if (placeIdParam) {
      result.placeId = placeIdParam;
      result.urlType = 'place';
    }

    // Priority 2: Extract place information from /maps/place/ URLs
    if (pathname.includes('/maps/place/')) {
      // Try complex format first (with data parameters)
      const complexPlaceMatch = pathname.match(/\/maps\/place\/([^\/]+)\/.*data=.*!1s([^!]+)/);
      if (complexPlaceMatch) {
        result.placeName = decodeURIComponent(complexPlaceMatch[1].replace(/\+/g, ' '));
        result.placeId = complexPlaceMatch[2];
        result.urlType = 'place';
      } else {
        // Try simpler format
        const simplePlaceMatch = pathname.match(/\/maps\/place\/([^\/]+)/);
        if (simplePlaceMatch) {
          result.placeName = decodeURIComponent(simplePlaceMatch[1].replace(/\+/g, ' '));
          result.urlType = 'place';
        }
      }
    }

    // Priority 3: Extract coordinates from /@lat,lng URLs (only if not already a place)
    if (result.urlType === 'invalid') {
      const coordMatch = pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (coordMatch) {
        result.coordinates = {
          lat: parseFloat(coordMatch[1]),
          lng: parseFloat(coordMatch[2])
        };
        result.urlType = 'coordinates';
      }
    }

    // Priority 4: Extract place name from search queries (only if not already identified)
    if (result.urlType === 'invalid') {
      const searchQuery = searchParams.get('q');
      if (searchQuery) {
        result.placeName = decodeURIComponent(searchQuery);
        result.urlType = 'search';
      }
    }

    // If we found coordinates but also have a place name, prioritize place
    if (result.urlType === 'coordinates' && result.placeName) {
      result.urlType = 'place';
    }

    return result;
  } catch (error) {
    return result;
  }
}

/**
 * Normalizes a Google URL to a standard format for consistent processing
 */
export function normalizeGoogleMapsUrl(url: string): string {
  const parsed = parseGoogleMapsUrl(url);
  
  if (!parsed.isValid) {
    return url;
  }

  // Priority 1: If we have a place ID, create a canonical URL
  if (parsed.placeId) {
    return `https://maps.google.com/maps?place_id=${parsed.placeId}`;
  }

  // Priority 2: If we have a place name, create a search-based URL
  if (parsed.placeName) {
    return `https://maps.google.com/search?q=${encodeURIComponent(parsed.placeName)}`;
  }

  // Priority 3: If we have coordinates, create a coordinate-based URL
  if (parsed.coordinates) {
    return `https://maps.google.com/maps/@${parsed.coordinates.lat},${parsed.coordinates.lng}`;
  }

  // Return original URL if we can't normalize
  return url;
}