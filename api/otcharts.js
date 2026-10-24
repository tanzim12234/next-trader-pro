import { isAuthorized } from "./auth.js";

const BASE_URL = "https://otcharts.com";

const ALLOWED_TF = new Set([
  5, 15, 30, 60, 120, 180, 300,
  600, 900, 1800, 3600, 14400, 86400
]);

function errorResponse(res, status, error) {
  return res.status(status).json({ error });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return errorResponse(res, 405, "Method not allowed");
  }

  if (!isAuthorized(req)) {
    return errorResponse(res, 401, "Login required");
  }

  const apiKey = process.env.OTCHARTS_API_KEY;

  if (!apiKey) {
    return errorResponse(
      res,
      500,
      "OTCHARTS_API_KEY is missing in Vercel"
    );
  }

  const mode = String(req.query?.mode || "candles");
  const symbol = String(
    req.query?.symbol || "EURUSD_otc"
  ).trim();

  if (!/^[A-Z0-9#._-]{1,40}$/.test(symbol)) {
    return errorResponse(res, 400, "Invalid symbol");
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json"
  };

  try {
    // Check API account usage without repeatedly requesting candles.
    if (mode === "usage") {
      const response = await fetch(
        `${BASE_URL}/v1/usage`,
        { headers, cache: "no-store" }
      );

      const body = await response.text();

      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
      );

      return res.status(response.status).send(body);
    }

    // Fetch historical candles.
    if (mode === "candles") {
      const tf = Number(req.query?.tf || 60);
      const requestedLimit = Number(
        req.query?.limit || 30
      );

      const limit = Number.isFinite(requestedLimit)
        ? Math.max(1, Math.min(300, requestedLimit))
        : 30;

      if (!ALLOWED_TF.has(tf)) {
        return errorResponse(
          res,
          400,
          "Unsupported timeframe"
        );
      }

      const url = new URL(`${BASE_URL}/v1/candles`);

      url.searchParams.set("venue", "quotex");
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("tf", String(tf));
      url.searchParams.set("limit", String(limit));

      const response = await fetch(url, {
        headers,
        cache: "no-store"
      });

      const body = await response.text();

      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
      );

      return res.status(response.status).send(body);
    }

    // Proxy the live SSE stream without exposing the API key.
    if (mode === "stream") {
      const controller = new AbortController();

      res.on("close", () => controller.abort());

      const url = new URL(`${BASE_URL}/v1/stream`);
      url.searchParams.set("venue", "quotex");
      url.searchParams.set("symbol", symbol);

      const response = await fetch(url, {
        headers: {
          ...headers,
          Accept: "text/event-stream"
        },
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        const body = await response.text().catch(() => "");

        return errorResponse(
          res,
          response.status || 502,
          `OTCharts stream failed: ${body.slice(0, 250)}`
        );
      }

      res.statusCode = 200;
      res.setHeader(
        "Content-Type",
        "text/event-stream; charset=utf-8"
      );
      res.setHeader(
        "Cache-Control",
        "no-cache, no-transform"
      );
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      const reader = response.body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done || res.destroyed) break;

          if (!res.write(Buffer.from(value))) {
            await new Promise(resolve =>
              res.once("drain", resolve)
            );
          }
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {}
      }

      if (!res.destroyed) res.end();
      return;
    }

    return errorResponse(
      res,
      400,
      "Unknown mode. Use candles, stream, or usage."
    );

  } catch (error) {
    if (error?.name === "AbortError") return;

    console.error("OTCharts API error:", error);

    return errorResponse(
      res,
      502,
      "Unable to connect to OTCharts"
    );
  }
}
