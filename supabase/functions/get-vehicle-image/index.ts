import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight requests
  const preflightResponse = handleCorsPreflight(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const { make, model, year, color } = await req.json();

    if (!make || !model) {
      return new Response(
        JSON.stringify({ error: "Make and model are required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const apiKey = Deno.env.get("CARSXE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "CarsXE API key not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Build query params
    const params = new URLSearchParams({
      key: apiKey,
      make: make.toLowerCase(),
      model: model.toLowerCase(),
      format: "json",
      angle: "side",
      size: "Medium",
      transparent: "true",
    });

    if (year) {
      params.append("year", year.toString());
    }
    if (color) {
      params.append("color", color.toLowerCase());
    }

    const response = await fetch(`https://api.carsxe.com/images?${params.toString()}`);
    const data = await response.json();

    if (!data.success || !data.images || data.images.length === 0) {
      return new Response(
        JSON.stringify({ imageUrl: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return the first image's link
    const bestImage = data.images[0];
    
    return new Response(
      JSON.stringify({ 
        imageUrl: bestImage.link,
        thumbnailUrl: bestImage.thumbnailLink,
        accentColor: bestImage.accentColor,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error fetching vehicle image:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
