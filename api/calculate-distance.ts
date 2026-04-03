// ============================================================
// Vercel Serverless Function — Calculate driving distance
// Uses Google Maps Distance Matrix API
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  // Verify auth via Bearer token (same as other API endpoints)
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { origin, destination } = req.body;
  if (!origin || !destination) {
    return res.status(400).json({ error: "Missing origin or destination address" });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "Google Maps API key not configured. Add GOOGLE_MAPS_API_KEY to environment variables." });
  }

  try {
    const params = new URLSearchParams({
      origins: origin,
      destinations: destination,
      units: "imperial",
      key: apiKey,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`
    );
    const data = await response.json();

    if (data.status !== "OK") {
      return res.status(500).json({ error: `Google Maps API error: ${data.status}`, details: data.error_message });
    }

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== "OK") {
      return res.status(400).json({ error: `Could not calculate distance: ${element?.status || "unknown"}` });
    }

    // Distance in meters → miles (one way)
    const distanceMeters = element.distance.value;
    const distanceMiles = Math.round((distanceMeters / 1609.344) * 10) / 10;

    return res.status(200).json({
      distanceMiles,
      distanceText: element.distance.text,
      durationText: element.duration.text,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to calculate distance" });
  }
}
