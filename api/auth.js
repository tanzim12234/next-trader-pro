import crypto from "crypto";

const COOKIE = "nt_session";
const FALLBACK_PASSWORD = "NEXT2026";

function secret() {
  return process.env.NEXT_TRADER_PASSWORD || FALLBACK_PASSWORD;
}
function sign(value, key) {
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}
function token(key) {
  const value = "NEXT-TRADER-AI";
  return value + "." + sign(value, key);
}
function safeEqual(a,b) {
  const aa=Buffer.from(String(a)), bb=Buffer.from(String(b));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
export function isAuthorized(req) {
  const cookie=req.headers?.cookie||"";
  const found=cookie.split(";").map(v=>v.trim()).find(v=>v.startsWith(COOKIE+"="));
  if(!found)return false;
  const got=decodeURIComponent(found.slice(COOKIE.length+1));
  return safeEqual(got,token(secret()));
}
export default async function handler(req,res) {
  if(req.method!=="POST")return res.status(405).json({error:"Method Not Allowed"});
  const password=String(req.body?.password||"");
  if(!safeEqual(password,secret()))return res.status(401).json({error:"Wrong password."});
  res.setHeader("Set-Cookie",`${COOKIE}=${encodeURIComponent(token(secret()))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  return res.status(200).json({ok:true});
}
