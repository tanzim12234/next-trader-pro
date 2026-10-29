import crypto from "node:crypto";
import {
  redis,
  json,
  getUser,
  saveUser,
  addCalendarMonths
} from "./store.js";

function secureEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));

  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function authorized(req) {
  const expected = process.env.NEXT_TRADER_ADMIN_PASSWORD;
  const supplied = req.headers["x-admin-password"];

  if (!expected || !supplied) return false;

  return secureEqual(supplied, expected);
}

async function readPayment(username) {
  const raw = await redis.get(`payment-user:${username}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    if (!authorized(req)) {
      return json(res, 401, { error: "Admin authorization required." });
    }

    if (req.method === "GET") {
      const usernames = await redis.smembers("payment-pending-users");
      const payments = [];

      for (const username of usernames || []) {
        const payment = await readPayment(username);

        if (payment?.status === "pending") {
          payments.push(payment);
        } else {
          await redis.srem("payment-pending-users", username);
        }
      }

      return json(res, 200, { payments });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return json(res, 405, { error: "Method not allowed." });
    }

    const body = req.body || {};
    const action = String(body.action || "").toLowerCase();
    const username = String(body.username || "").trim().toLowerCase();

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return json(res, 400, { error: "Invalid username." });
    }

    if (!["approve", "reject"].includes(action)) {
      return json(res, 400, { error: "Action must be approve or reject." });
    }

    const payment = await readPayment(username);

    if (!payment || payment.status !== "pending") {
      return json(res, 404, {
        error: "No pending payment found for this user."
      });
    }

    if (action === "reject") {
      payment.status = "rejected";
      payment.reviewedAt = new Date().toISOString();

      await redis.set(`payment-user:${username}`, JSON.stringify(payment));
      await redis.set(
        `payment-tx:${payment.txid.toLowerCase()}`,
        JSON.stringify(payment)
      );
      await redis.srem("payment-pending-users", username);

      return json(res, 200, {
        ok: true,
        message: "Payment rejected."
      });
    }

    // IMPORTANT: Check the payment on Binance before approving.
    const user = await getUser(username);

    if (!user) {
      return json(res, 404, { error: "User account not found." });
    }

    const start = Math.max(
      Date.now(),
      Number(user.subscriptionExpiresAt) || 0
    );

    user.status = "active";
    user.subscriptionExpiresAt = addCalendarMonths(start, 2);
    user.lastPaymentTxid = payment.txid;

    await saveUser(user);

    payment.status = "approved";
    payment.reviewedAt = new Date().toISOString();
    payment.subscriptionExpiresAt = user.subscriptionExpiresAt;

    await redis.set(`payment-user:${username}`, JSON.stringify(payment));
    await redis.set(
      `payment-tx:${payment.txid.toLowerCase()}`,
      JSON.stringify(payment)
    );
    await redis.srem("payment-pending-users", username);

    return json(res, 200, {
      ok: true,
      message: "Payment approved; subscription activated.",
      subscriptionExpiresAt: user.subscriptionExpiresAt
    });
  } catch (error) {
    console.error("ADMIN ERROR:", error);
    return json(res, 500, { error: "Admin operation failed." });
  }
}
