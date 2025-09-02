export function validateGoogleMapsUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }
    try {
        const parsedUrl = new URL(url);
        const validDomains = [
            'maps.google.com',
            'www.google.com',
            'google.com',
            'maps.app.goo.gl',
            'goo.gl'
        ];
        const isGoogleDomain = validDomains.some(domain => parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain));
        if (!isGoogleDomain) {
            return false;
        }
        const pathname = parsedUrl.pathname;
        const searchParams = parsedUrl.searchParams;
        if (pathname.includes('/maps/place/')) {
            return true;
        }
        if (pathname.includes('/search') && searchParams.has('q')) {
            return true;
        }
        if (pathname.includes('/maps') && searchParams.has('place_id')) {
            return true;
        }
        if (parsedUrl.hostname.includes('goo.gl')) {
            return true;
        }
        if (pathname.includes('/maps/@') && pathname.match(/@-?\d+\.\d+,-?\d+\.\d+/)) {
            return true;
        }
        return false;
    }
    catch (error) {
        return false;
    }
}
export function parseGoogleMapsUrl(url) {
    const result = {
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
        const placeIdParam = searchParams.get('place_id');
        if (placeIdParam) {
            result.placeId = placeIdParam;
            result.urlType = 'place';
        }
        if (pathname.includes('/maps/place/')) {
            const complexPlaceMatch = pathname.match(/\/maps\/place\/([^\/]+)\/.*data=.*!1s([^!]+)/);
            if (complexPlaceMatch) {
                result.placeName = decodeURIComponent(complexPlaceMatch[1].replace(/\+/g, ' '));
                result.placeId = complexPlaceMatch[2];
                result.urlType = 'place';
            }
            else {
                const simplePlaceMatch = pathname.match(/\/maps\/place\/([^\/]+)/);
                if (simplePlaceMatch) {
                    result.placeName = decodeURIComponent(simplePlaceMatch[1].replace(/\+/g, ' '));
                    result.urlType = 'place';
                }
            }
        }
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
        if (result.urlType === 'invalid') {
            const searchQuery = searchParams.get('q');
            if (searchQuery) {
                result.placeName = decodeURIComponent(searchQuery);
                result.urlType = 'search';
            }
        }
        if (result.urlType === 'coordinates' && result.placeName) {
            result.urlType = 'place';
        }
        return result;
    }
    catch (error) {
        return result;
    }
}
export function normalizeGoogleMapsUrl(url) {
    const parsed = parseGoogleMapsUrl(url);
    if (!parsed.isValid) {
        return url;
    }
    if (parsed.placeId) {
        return `https://maps.google.com/maps?place_id=${parsed.placeId}`;
    }
    if (parsed.placeName) {
        return `https://maps.google.com/search?q=${encodeURIComponent(parsed.placeName)}`;
    }
    if (parsed.coordinates) {
        return `https://maps.google.com/maps/@${parsed.coordinates.lat},${parsed.coordinates.lng}`;
    }
    return url;
}
//# sourceMappingURL=urlValidator.js.map