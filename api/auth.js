import crypto from "crypto";

const COOKIE = "nt_session";
const PASSWORD = process.env.NEXT_TRADER_PASSWORD || "NEXT2026";

function makeToken() {
  const value = "NEXT-TRADER-AI";
  const signature = crypto.createHmac("sha256", PASSWORD).update(value).digest("hex");
  return `${value}.${signature}`;
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function isAuthorized(req) {
  const cookieHeader = req.headers?.cookie || "";
  const found = cookieHeader.split(";").map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`));
  if (!found) return false;
  const received = decodeURIComponent(found.slice(`${COOKIE}=`.length));
  return safeEqual(received, makeToken());
}

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  try {
    const password = String(req.body?.password || "");
    if (!safeEqual(password, PASSWORD)) return res.status(401).json({ error: "Wrong password." });
    const token = makeToken();
    res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("AUTH ERROR:", error);
    return res.status(500).json({ error: "Authentication server error." });
  }
}
