import {
  redis,
  json,
  currentUser,
  subscriptionActive
} from "./store.js";

const ALLOWED_NETWORKS = ["BINANCE_PAY", "TRC20", "BEP20", "ERC20"];

export default async function handler(req, res) {
  try {
    if (!["GET", "POST"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST");
      return json(res, 405, { error: "Method not allowed." });
    }

    const user = await currentUser(req);

    if (!user) {
      return json(res, 401, { error: "Please log in again." });
    }

    if (req.method === "GET") {
      const raw = await redis.get(`payment-user:${user.username}`);
      let payment = null;

      if (raw) {
        try {
          const saved = JSON.parse(raw);
          payment = {
            status: saved.status || "unknown",
            network: saved.network || null,
            txid: saved.txid || null,
            amountUSD: saved.amountUSD || 50,
            durationMonths: saved.durationMonths || 2,
            submittedAt: saved.submittedAt || null,
            reviewedAt: saved.reviewedAt || null,
            subscriptionExpiresAt: saved.subscriptionExpiresAt || null
          };
        } catch {
          payment = null;
        }
      }

      return json(res, 200, {
        user: {
          username: user.username,
          status: user.status,
          subscriptionActive: subscriptionActive(user),
          subscriptionExpiresAt: user.subscriptionExpiresAt || null
        },
        payment
      });
    }

    const body = req.body || {};
    const txid = String(body.txid || "").trim();
    const network = String(body.network || "").trim().toUpperCase();

    if (!ALLOWED_NETWORKS.includes(network)) {
      return json(res, 400, {
        error: "Select TRC20, BEP20 or ERC20."
      });
    }

    const validTxid = network === "BINANCE_PAY"
      ? /^[a-zA-Z0-9_-]{8,128}$/.test(txid)
      : /^(?:0x)?[a-fA-F0-9]{32,128}$/.test(txid);

    if (!validTxid) {
      return json(res, 400, {
        error: network === "BINANCE_PAY"
          ? "Enter the Binance Pay transaction reference (8–128 letters/numbers)."
          : "Enter a valid blockchain transaction hash (32–128 hexadecimal characters)."
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
