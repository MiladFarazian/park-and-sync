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
    "http://localhost:8080",
    "http://localhost:5173",
    "http://localhost:3000",
  ];
};

/**
 * Get CORS headers based on the request origin
 * Only allows requests from configured origins
 */
export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowedOrigins = getAllowedOrigins();

  // If origin is provided and in allowed list, use it; otherwise use first allowed origin
  const allowedOrigin =
    origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-requested-with",
    "Access-Control-Allow-Credentials": "true",
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
