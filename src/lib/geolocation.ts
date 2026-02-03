/**
 * Unified Geolocation Utility
 *
 * Uses native Capacitor Geolocation on iOS/Android for faster, more reliable location.
 * Falls back to web Geolocation API for PWA/browser.
 */

import { Capacitor } from '@capacitor/core';
import { Geolocation, Position, PermissionStatus } from '@capacitor/geolocation';

export interface GeolocationCoords {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}

export interface GeolocationResult {
  coords: GeolocationCoords;
  timestamp: number;
}

export interface GeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

const DEFAULT_OPTIONS: GeolocationOptions = {
  enableHighAccuracy: true,
  timeout: 10000, // 10 seconds - native is faster
  maximumAge: 30000, // 30 seconds - allow cached location
};

/**
 * Check if we should use native geolocation
 */
function shouldUseNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Check and request geolocation permissions
 * Returns true if permission is granted
 */
export async function checkPermissions(): Promise<boolean> {
  if (shouldUseNative()) {
    try {
      const status = await Geolocation.checkPermissions();
      if (status.location === 'granted' || status.coarseLocation === 'granted') {
        return true;
      }
      // Request permissions if not granted
      const requested = await Geolocation.requestPermissions();
      return requested.location === 'granted' || requested.coarseLocation === 'granted';
    } catch (error) {
      console.error('[geolocation] Native permission check failed:', error);
      return false;
    }
  } else {
    // For web, we can't pre-check permissions easily - just return true
    // The actual permission prompt will happen when getCurrentPosition is called
    return true;
  }
}

/**
 * Get current position using native plugin on iOS/Android, web API on browser
 */
export async function getCurrentPosition(
  options: GeolocationOptions = {}
): Promise<GeolocationResult> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  if (shouldUseNative()) {
    return getNativePosition(mergedOptions);
  } else {
    return getWebPosition(mergedOptions);
  }
}

/**
 * Native Capacitor Geolocation - uses CLLocationManager on iOS
 */
async function getNativePosition(options: GeolocationOptions): Promise<GeolocationResult> {
  try {
    const position: Position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: options.enableHighAccuracy,
      timeout: options.timeout,
      maximumAge: options.maximumAge,
    });

    return {
      coords: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        altitudeAccuracy: position.coords.altitudeAccuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
      },
      timestamp: position.timestamp,
    };
  } catch (error: any) {
    // Map native errors to standard GeolocationPositionError codes
    const errorMessage = error?.message || 'Unknown error';

    if (errorMessage.includes('denied') || errorMessage.includes('permission')) {
      throw createGeolocationError(1, 'Location permission denied');
    } else if (errorMessage.includes('unavailable')) {
      throw createGeolocationError(2, 'Location unavailable');
    } else if (errorMessage.includes('timeout')) {
      throw createGeolocationError(3, 'Location request timed out');
    }

    throw createGeolocationError(2, errorMessage);
  }
}

/**
 * Web Geolocation API fallback
 */
function getWebPosition(options: GeolocationOptions): Promise<GeolocationResult> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(createGeolocationError(2, 'Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
          },
          timestamp: position.timestamp,
        });
      },
      (error) => {
        reject(createGeolocationError(error.code, error.message));
      },
      {
        enableHighAccuracy: options.enableHighAccuracy,
        timeout: options.timeout,
        maximumAge: options.maximumAge,
      }
    );
  });
}

/**
 * Watch position changes
 * Returns a cleanup function to stop watching
 */
export function watchPosition(
  onSuccess: (result: GeolocationResult) => void,
  onError: (error: GeolocationError) => void,
  options: GeolocationOptions = {}
): () => void {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  if (shouldUseNative()) {
    let watchId: string | null = null;

    Geolocation.watchPosition(
      {
        enableHighAccuracy: mergedOptions.enableHighAccuracy,
        timeout: mergedOptions.timeout,
        maximumAge: mergedOptions.maximumAge,
      },
      (position, err) => {
        if (err) {
          onError(createGeolocationError(2, err.message));
        } else if (position) {
          onSuccess({
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              altitude: position.coords.altitude,
              altitudeAccuracy: position.coords.altitudeAccuracy,
              heading: position.coords.heading,
              speed: position.coords.speed,
            },
            timestamp: position.timestamp,
          });
        }
      }
    ).then((id) => {
      watchId = id;
    });

    return () => {
      if (watchId) {
        Geolocation.clearWatch({ id: watchId });
      }
    };
  } else {
    if (!navigator.geolocation) {
      onError(createGeolocationError(2, 'Geolocation not supported'));
      return () => {};
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        onSuccess({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
          },
          timestamp: position.timestamp,
        });
      },
      (error) => {
        onError(createGeolocationError(error.code, error.message));
      },
      {
        enableHighAccuracy: mergedOptions.enableHighAccuracy,
        timeout: mergedOptions.timeout,
        maximumAge: mergedOptions.maximumAge,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }
}

/**
 * GeolocationError interface matching web API
 */
export interface GeolocationError {
  code: number;
  message: string;
  PERMISSION_DENIED: 1;
  POSITION_UNAVAILABLE: 2;
  TIMEOUT: 3;
}

function createGeolocationError(code: number, message: string): GeolocationError {
  return {
    code,
    message,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  };
}

/**
 * Check if geolocation error is a permission denial
 */
export function isPermissionDenied(error: GeolocationError): boolean {
  return error.code === 1;
}

/**
 * Check if geolocation error is a timeout
 */
export function isTimeout(error: GeolocationError): boolean {
  return error.code === 3;
}
