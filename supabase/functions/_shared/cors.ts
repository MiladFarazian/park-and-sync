/**
 * CORS Headers Utility
 * 
 * Provides secure CORS headers for edge functions.
 * Restricts origins to allowed domains instead of using wildcard.
 */

// Get allowed origins from environment or use defaults
const getAllowedOrigins = (): string[] => {
  const envOrigins = Deno.env.get("ALLOWED_ORIGINS");
  if (envOrigins) {
    return envOrigins.split(",").map((origin) => origin.trim());
  }

  // Default allowed origins
  return [
    "https://useparkzy.com",
    "https://www.useparkzy.com",
    "https://parkzy.lovable.app",
    "https://id-preview--bcd0f814-3e2f-427f-8e4e-b211f7011a0e.lovable.app",
    "http://localhost:8080",
    "http://localhost:5173",
    "http://localhost:3000",
    // Capacitor iOS/Android native app origins
    "capacitor://localhost",
    "ionic://localhost",
  ];
};

/**
 * Get CORS headers based on the request origin
 * Only allows requests from configured origins
 */
export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowedOrigins = getAllowedOrigins();

  // Allow exact matches from allowlist, plus Lovable preview domains.
  // This prevents CORS breakage when the preview subdomain changes.
  const isLovablePreviewOrigin = (o: string) =>
    o.endsWith(".lovable.app") || o.endsWith(".lovableproject.com");

  // Check if this is a Capacitor native app origin
  const isCapacitorOrigin = (o: string) =>
    o === "capacitor://localhost" || o === "ionic://localhost";

  // If origin is provided and allowed, echo it back; otherwise default to first allowed origin
  // For null origins (like from native apps without origin header), use wildcard to allow the request
  let allowedOrigin: string;
  if (!origin) {
    // No origin header - likely from a native app; use wildcard
    allowedOrigin = "*";
  } else if (allowedOrigins.includes(origin) || isLovablePreviewOrigin(origin) || isCapacitorOrigin(origin)) {
    allowedOrigin = origin;
  } else {
    allowedOrigin = allowedOrigins[0];
  }

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-requested-with",
    "Access-Control-Allow-Credentials": allowedOrigin !== "*" ? "true" : "false",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
}

/**
 * Handle CORS preflight requests
 */
export function handleCorsPreflight(request: Request): Response | null {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request),
    });
  }
  return null;
}
