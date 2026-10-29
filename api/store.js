import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

// Support both Upstash's standard variable names and Vercel Marketplace's KV names.
const redisUrl =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL ||
  process.env.REDIS_URL ||
  process.env.KV_URL;

const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN;

export async function command(...args) {
  if (!redisUrl || !redisToken) {
    throw new Error("Upstash Redis environment variables are missing.");
  }

  const response = await fetch(redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args),
    cache: "no-store"
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || "Redis request failed.");
  }

  return data.result;
}

export const redis = {
  async get(key) {
    return command("GET", key);
  },

  async set(key, value, options = {}) {
    const args = ["SET", key, String(value)];

    if (options.ex) args.push("EX", String(options.ex));
    if (options.nx) args.push("NX");

    return command(...args);
  },

  async del(key) {
    return command("DEL", key);
  },

  async smembers(key) {
    return command("SMEMBERS", key);
  },

  async sadd(key, value) {
    return command("SADD", key, value);
  },

  async srem(key, value) {
    return command("SREM", key, value);
  }
};

export function json(res, status, data) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.status(status).json(data);
}

export function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

export function validUsername(value) {
  return /^[a-z0-9_]{3,24}$/.test(value);
}

export async function hashPassword(password, salt) {
  const result = await scrypt(password, salt, 64);
  return result.toString("hex");
}

export async function getUser(username) {
  const raw = await redis.get(`user:${normalizeUsername(username)}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveUser(user) {
  return redis.set(
    `user:${normalizeUsername(user.username)}`,
    JSON.stringify(user)
  );
}

export function addCalendarMonths(timestamp, months) {
  const date = new Date(timestamp);
  const originalDay = date.getUTCDate();

  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);

  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
  ).getUTCDate();

  date.setUTCDate(Math.min(originalDay, lastDay));
  return date.getTime();
}

export async function currentUser(req) {
  const cookieHeader = req.headers.cookie || "";

  const cookie = cookieHeader
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith("nt_session="));

  if (!cookie) return null;

  const token = decodeURIComponent(cookie.slice("nt_session=".length));
  if (!/^[a-f0-9]{64}$/.test(token)) return null;

  const username = await redis.get(`session:${token}`);
  if (!username) return null;

  const activeToken = await redis.get(`active-session:${username}`);
  if (activeToken !== token) return null;

  const user = await getUser(username);
  if (!user) return null;

  return user;
}

export function subscriptionActive(user) {
  return Boolean(
    user &&
    user.status === "active" &&
    Number(user.subscriptionExpiresAt) > Date.now()
  );
}
