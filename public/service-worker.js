// Service Worker for Push Notifications
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event.notification.tag);
  event.notification.close();

  // Handle notification clicks with deep-linking
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Get the notification data including type and bookingId
      const data = event.notification.data || {};
      const url = data.url || '/activity';
      
      // Build absolute URL for navigation
      const baseUrl = self.location.origin;
      const absoluteUrl = url.startsWith('/') ? baseUrl + url : url;
      
      console.log('[Service Worker] Navigating to:', absoluteUrl, 'with data:', data);

      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Post message with full notification data for in-app handling
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: {
              url: url,
              notificationType: data.type || null,
              bookingId: data.bookingId || null,
            }
          });
          return client.focus().then(() => client.navigate(absoluteUrl));
        }
      }

      // Open a new window if no existing window
      if (self.clients.openWindow) {
        return self.clients.openWindow(absoluteUrl);
      }
    })
  );
});

self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);
  
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/parkzy-logo.png',
      badge: '/favicon.png',
      tag: data.tag || 'default',
      data: data.data || {},
      requireInteraction: data.requireInteraction || false,
      vibrate: [200, 100, 200],
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});
