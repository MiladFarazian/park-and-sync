import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.miladfarazian.parkzy',
  appName: 'Parkzy',
  webDir: 'dist',
  server: {
    // Allow the iOS app to make requests to external APIs
    allowNavigation: [
      'mqbupmusmciijsjmzbcu.supabase.co',
      '*.supabase.co',
      '*.mapbox.com',
      'api.mapbox.com',
      'events.mapbox.com'
    ]
  },
  ios: {
    // Allow mixed content and external requests
    allowsLinkPreview: false,
    // Set to 'never' so only CSS env(safe-area-inset-*) handles safe areas
    contentInset: 'never'
  }
};

export default config;
