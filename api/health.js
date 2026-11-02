import { json, redis } from "./store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { ok: false, error: "Method not allowed." });
  }

  const providers = {
    gemini: Boolean(process.env.GEMINI_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY)
  };

  let storage = false;
  try {
    await redis.set("nextai:health:probe", String(Date.now()), { ex: 30 });
    storage = true;
  } catch (error) {
    console.error("NEXT AI health storage check failed:", error?.name || "unknown");
  }

  const modelReady = providers.gemini || providers.openai;
  return json(res, modelReady && storage ? 200 : 503, {
    ok: modelReady && storage,
    service: "NEXT AI",
    modelReady,
    providers,
    storage,
    checkedAt: new Date().toISOString()
  });
}
