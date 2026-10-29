import {
  redis,
  json,
  currentUser
} from "./lib/store.js";

const ALLOWED_NETWORKS = ["TRC20", "BEP20", "ERC20"];

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return json(res, 405, { error: "Method not allowed." });
    }

    const user = await currentUser(req);

    if (!user) {
      return json(res, 401, { error: "Please log in again." });
    }

    const body = req.body || {};
    const txid = String(body.txid || "").trim();
    const network = String(body.network || "").trim().toUpperCase();

    if (!ALLOWED_NETWORKS.includes(network)) {
      return json(res, 400, {
        error: "Select TRC20, BEP20 or ERC20."
      });
    }

    if (!/^[a-fA-F0-9]{32,128}$/.test(txid)) {
      return json(res, 400, {
        error: "Enter a valid transaction hash/TxID."
      });
    }

    const existingRaw = await redis.get(`payment-user:${user.username}`);

    if (existingRaw) {
      let existing;

      try {
        existing = JSON.parse(existingRaw);
      } catch {
        existing = null;
      }

      if (existing?.status === "pending") {
        return json(res, 409, {
          error: "You already have a payment awaiting review."
        });
      }
    }

    const payment = {
      username: user.username,
      txid,
      network,
      amountUSD: 50,
      durationMonths: 2,
      status: "pending",
      submittedAt: new Date().toISOString()
    };

    // NX prevents the same TxID from being submitted twice.
    const created = await redis.set(
      `payment-tx:${txid.toLowerCase()}`,
      JSON.stringify(payment),
      { nx: true }
    );

    if (created !== "OK") {
      return json(res, 409, {
        error: "This TxID has already been submitted."
      });
    }

    await redis.set(
      `payment-user:${user.username}`,
      JSON.stringify(payment)
    );

    await redis.sadd("payment-pending-users", user.username);

    return json(res, 201, {
      ok: true,
      message: "Payment submitted. Wait for admin verification."
    });
  } catch (error) {
    console.error("PAYMENT ERROR:", error);
    return json(res, 500, { error: "Could not submit payment." });
  }
}
