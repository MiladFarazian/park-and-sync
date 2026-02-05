import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// APNs (Apple Push Notification Service) Implementation
// =============================================================================

/**
 * Generate JWT for APNs authentication
 * APNs requires ES256 signed JWT with team_id and key_id
 */
async function generateApnsJwt(): Promise<string | null> {
  const apnsKeyId = Deno.env.get('APNS_KEY_ID');
  const apnsTeamId = Deno.env.get('APNS_TEAM_ID');
  const apnsPrivateKey = Deno.env.get('APNS_PRIVATE_KEY');

  if (!apnsKeyId || !apnsTeamId || !apnsPrivateKey) {
    console.log('[APNs] Missing APNs configuration, skipping native push');
    return null;
  }

  try {
    // Parse the private key (PEM format)
    const pemContents = apnsPrivateKey
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, '');

    const privateKeyBytes = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

    // Import the private key for ES256 signing
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyBytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );

    // Create JWT header and payload
    const header = { alg: 'ES256', kid: apnsKeyId };
    const payload = {
      iss: apnsTeamId,
      iat: Math.floor(Date.now() / 1000),
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    // Sign the token
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      new TextEncoder().encode(unsignedToken)
    );

    // Convert signature to base64url (APNs expects raw r||s format)
    const signatureArray = new Uint8Array(signature);
    const signatureBase64 = base64UrlEncode(signatureArray);

    return `${unsignedToken}.${signatureBase64}`;
  } catch (error) {
    console.error('[APNs] Error generating JWT:', error);
    return null;
  }
}

/**
 * Send push notification via APNs
 */
async function sendApnsNotification(
  deviceToken: string,
  payload: { title: string; body: string; type?: string; bookingId?: string; url?: string },
  isProduction: boolean = true
): Promise<boolean> {
  const bundleId = Deno.env.get('APNS_BUNDLE_ID') || 'com.useparkzy.parkzy';
  const jwt = await generateApnsJwt();

  if (!jwt) {
    return false;
  }

  try {
    // Use production or sandbox APNs server
    const apnsHost = isProduction
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com';

    const apnsPayload = {
      aps: {
        alert: {
          title: payload.title,
          body: payload.body,
        },
        sound: 'default',
        badge: 1,
        'mutable-content': 1,
      },
      // Custom data for handling notification taps
      type: payload.type || null,
      bookingId: payload.bookingId || null,
      url: payload.url || '/activity',
    };

    const response = await fetch(`${apnsHost}/3/device/${deviceToken}`, {
      method: 'POST',
      headers: {
        'authorization': `bearer ${jwt}`,
        'apns-topic': bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': '0',
        'content-type': 'application/json',
      },
      body: JSON.stringify(apnsPayload),
    });

    if (response.ok) {
      console.log(`[APNs] Push sent successfully to: ${deviceToken.substring(0, 20)}...`);
      return true;
    } else {
      const errorBody = await response.text();
      console.error(`[APNs] Push failed: ${response.status} - ${errorBody}`);

      // If token is invalid, it should be removed
      if (response.status === 400 || response.status === 410) {
        console.log(`[APNs] Token ${deviceToken.substring(0, 20)}... is invalid, should be removed`);
      }
      return false;
    }
  } catch (error) {
    console.error('[APNs] Error sending notification:', error);
    return false;
  }
}

// =============================================================================
// Web Push (VAPID) Implementation
// =============================================================================

// Web Push VAPID signature implementation
async function generateVapidAuthHeader(
  audience: string,
  subject: string,
  publicKey: string,
  privateKey: string
): Promise<{ authorization: string; cryptoKey: string }> {
  // Decode the keys from base64url
  const publicKeyBytes = base64UrlToUint8Array(publicKey);
  const privateKeyBytes = base64UrlToUint8Array(privateKey);

  // The public key is in uncompressed format: 0x04 + x (32 bytes) + y (32 bytes)
  // Extract x and y coordinates (skip the 0x04 prefix byte)
  const x = publicKeyBytes.slice(1, 33);
  const y = publicKeyBytes.slice(33, 65);

  // The private key is the raw 32-byte 'd' value
  const d = privateKeyBytes;

  // Construct JWK for the private key
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(x),
    y: base64UrlEncode(y),
    d: base64UrlEncode(d),
  };

  // Create JWT header and payload
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12 hours
    sub: subject,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Import private key for signing using JWK format
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign the token
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureArray = new Uint8Array(signature);
  const r = signatureArray.slice(0, 32);
  const s = signatureArray.slice(32, 64);
  const signatureBase64 = base64UrlEncode(new Uint8Array([...r, ...s]));

  const jwt = `${unsignedToken}.${signatureBase64}`;

  return {
    authorization: `vapid t=${jwt}, k=${publicKey}`,
    cryptoKey: publicKey,
  };
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function base64UrlEncode(data: string | Uint8Array): string {
  let base64: string;
  if (typeof data === 'string') {
    base64 = btoa(data);
  } else {
    base64 = btoa(String.fromCharCode(...data));
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; tag?: string; url?: string; requireInteraction?: boolean; type?: string; bookingId?: string }
): Promise<boolean> {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('VAPID keys not configured');
    return false;
  }

  try {
    const endpoint = new URL(subscription.endpoint);
    const audience = `${endpoint.protocol}//${endpoint.host}`;

    const vapidHeaders = await generateVapidAuthHeader(
      audience,
      'mailto:support@useparkzy.com',
      vapidPublicKey,
      vapidPrivateKey
    );

    // Create the push message payload with deep-link data
    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      tag: payload.tag || 'parkzy-notification',
      data: { 
        url: payload.url || '/activity',
        type: payload.type || null,
        bookingId: payload.bookingId || null,
      },
      requireInteraction: payload.requireInteraction || false,
    });

    // For now, send unencrypted payload (most browsers accept this for testing)
    // In production, you'd want to implement proper encryption
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': vapidHeaders.authorization,
        'Content-Type': 'application/json',
        'TTL': '86400',
        'Urgency': 'high',
      },
      body: pushPayload,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[send-push-notification] Push failed for endpoint: ${response.status} - ${errorText}`);
      console.error(`[send-push-notification] Endpoint was: ${subscription.endpoint.substring(0, 80)}...`);
      
      // If subscription is no longer valid, we should mark it for deletion
      if (response.status === 404 || response.status === 410) {
        console.log('Subscription expired, should be removed');
        return false;
      }
      return false;
    }

    console.log(`[send-push-notification] Push sent successfully to: ${subscription.endpoint.substring(0, 80)}...`);
    return true;
  } catch (error) {
    console.error('Error sending push notification:', error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization - accept either service role key or valid user JWT
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!authHeader) {
      console.warn('[send-push-notification] No authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if it's a service role call (from other edge functions) or user JWT (from client)
    const isServiceRoleCall = authHeader.includes(serviceRoleKey || '');
    let authenticatedUserId: string | null = null;

    if (!isServiceRoleCall) {
      // Verify user JWT token
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

      if (userError || !user) {
        console.warn('[send-push-notification] Invalid user token');
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }
      authenticatedUserId = user.id;
      console.log(`[send-push-notification] Client call from user: ${authenticatedUserId}`);
    } else {
      console.log('[send-push-notification] Service role call');
    }

    const { userId, userIds, title, body, tag, url, requireInteraction, type, bookingId, senderId } = await req.json();

    const targetUserIds = userIds || (userId ? [userId] : []);

    if (targetUserIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No user IDs provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // For new_message type, look up sender's name for personalized notification
    let notificationTitle = title;
    if (type === 'new_message' && senderId) {
      const { data: senderProfile } = await supabaseClient
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', senderId)
        .single();

      if (senderProfile) {
        const senderName = senderProfile.last_name
          ? `${senderProfile.first_name} ${senderProfile.last_name.charAt(0)}.`
          : senderProfile.first_name;
        notificationTitle = `New Message from ${senderName}`;
      } else {
        notificationTitle = 'New Message';
      }
    }

    console.log(`[send-push-notification] Sending to ${targetUserIds.length} users: "${notificationTitle}"`);
    console.log(`[send-push-notification] Target user IDs:`, targetUserIds);
    console.log(`[send-push-notification] Payload:`, { title: notificationTitle, body, tag, url, type });

    // Track results
    let webPushSuccess = 0;
    let webPushTotal = 0;
    let apnsSuccess = 0;
    let apnsTotal = 0;
    const expiredEndpoints: string[] = [];
    const expiredDeviceTokens: string[] = [];

    // ==========================================================================
    // 1. Web Push Notifications (VAPID)
    // ==========================================================================
    const { data: subscriptions, error: fetchError } = await supabaseClient
      .from('push_subscriptions')
      .select('*')
      .in('user_id', targetUserIds);

    if (fetchError) {
      console.error('Error fetching web push subscriptions:', fetchError);
    }

    if (subscriptions && subscriptions.length > 0) {
      console.log(`[send-push-notification] Found ${subscriptions.length} web push subscriptions`);
      webPushTotal = subscriptions.length;

      const payload = { title: notificationTitle, body, tag, url, requireInteraction, type, bookingId };

      for (const sub of subscriptions) {
        const success = await sendPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload
        );
        if (success) {
          webPushSuccess++;
        } else {
          expiredEndpoints.push(sub.endpoint);
        }
      }

      // Clean up expired web push subscriptions
      if (expiredEndpoints.length > 0) {
        console.log(`Removing ${expiredEndpoints.length} expired web push subscriptions`);
        await supabaseClient
          .from('push_subscriptions')
          .delete()
          .in('endpoint', expiredEndpoints);
      }
    } else {
      console.log(`[send-push-notification] No web push subscriptions found`);
    }

    // ==========================================================================
    // 2. APNs (Apple Push Notifications)
    // ==========================================================================
    const { data: deviceTokens, error: deviceTokenError } = await supabaseClient
      .from('device_tokens')
      .select('*')
      .in('user_id', targetUserIds)
      .eq('platform', 'ios');

    if (deviceTokenError) {
      console.error('Error fetching device tokens:', deviceTokenError);
    }

    if (deviceTokens && deviceTokens.length > 0) {
      console.log(`[send-push-notification] Found ${deviceTokens.length} iOS device tokens`);
      apnsTotal = deviceTokens.length;

      // Group tokens by environment for logging
      const devTokens = deviceTokens.filter(d => d.environment === 'development');
      const prodTokens = deviceTokens.filter(d => d.environment !== 'development');
      console.log(`[send-push-notification] Token breakdown: ${devTokens.length} development, ${prodTokens.length} production`);

      for (const device of deviceTokens) {
        // Route each token to its appropriate APNs server based on stored environment
        // Development tokens (from Xcode) go to sandbox, production tokens (TestFlight/App Store) go to production
        const isProduction = device.environment !== 'development';

        const success = await sendApnsNotification(
          device.token,
          { title: notificationTitle, body, type, bookingId, url },
          isProduction
        );
        if (success) {
          apnsSuccess++;
        } else {
          expiredDeviceTokens.push(device.token);
        }
      }

      // Clean up expired device tokens
      if (expiredDeviceTokens.length > 0) {
        console.log(`Removing ${expiredDeviceTokens.length} expired device tokens`);
        await supabaseClient
          .from('device_tokens')
          .delete()
          .in('token', expiredDeviceTokens);
      }
    } else {
      console.log(`[send-push-notification] No iOS device tokens found`);
    }

    const totalSent = webPushSuccess + apnsSuccess;
    const totalAttempted = webPushTotal + apnsTotal;

    console.log(`[send-push-notification] Results: web=${webPushSuccess}/${webPushTotal}, apns=${apnsSuccess}/${apnsTotal}`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: totalSent,
        total: totalAttempted,
        webPush: { sent: webPushSuccess, total: webPushTotal, expired: expiredEndpoints.length },
        apns: { sent: apnsSuccess, total: apnsTotal, expired: expiredDeviceTokens.length },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in send-push-notification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
