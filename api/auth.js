import crypto from "node:crypto";
import {
  redis,
  json,
  normalizeUsername,
  validUsername,
  hashPassword,
  getUser,
  saveUser,
  currentUser
} from "./store.js";

const SESSION_SECONDS = 60 * 60 * 24 * 30;

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `nt_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`
  );
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `nt_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
  );
}

function publicUser(user) {
  return {
    username: user.username,
    status: user.status,
    subscriptionExpiresAt: user.subscriptionExpiresAt || null,
    subscriptionActive:
      user.status === "active" &&
      Number(user.subscriptionExpiresAt) > Date.now()
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const user = await currentUser(req);

      if (!user) {
        return json(res, 401, { error: "Please log in." });
      }

      return json(res, 200, { user: publicUser(user) });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return json(res, 405, { error: "Method not allowed." });
    }

    const body = req.body || {};
    const action = String(body.action || "login").toLowerCase();
    const username = normalizeUsername(body.username);
    const password = String(body.password || "");

    if (action === "logout") {
      const user = await currentUser(req);
      const cookieHeader = req.headers.cookie || "";
      const cookie = cookieHeader
        .split(";")
        .map(part => part.trim())
        .find(part => part.startsWith("nt_session="));

      if (cookie) {
        const token = decodeURIComponent(cookie.slice("nt_session=".length));
        const sessionUsername = await redis.get(`session:${token}`);

        if (sessionUsername) {
          const activeToken = await redis.get(`active-session:${sessionUsername}`);

          if (activeToken === token) {
            await redis.del(`active-session:${sessionUsername}`);
          }

          await redis.del(`session:${token}`);
        }
      }

      clearSessionCookie(res);
      return json(res, 200, { ok: true, loggedOut: true });
    }

    if (!validUsername(username)) {
      return json(res, 400, {
        error: "Username must be 3–24 characters: a-z, 0-9 or underscore."
      });
    }

    if (password.length < 8 || password.length > 128) {
      return json(res, 400, {
        error: "Password must be 8–128 characters."
      });
    }

    if (action === "register") {
      const salt = crypto.randomBytes(16).toString("hex");
      const passwordHash = await hashPassword(password, salt);

      const user = {
        username,
        passwordSalt: salt,
        passwordHash,
        status: "pending",
        subscriptionExpiresAt: null,
        createdAt: new Date().toISOString()
      };

      const created = await redis.set(
        `user:${username}`,
        JSON.stringify(user),
        { nx: true }
      );

      if (created !== "OK") {
        return json(res, 409, {
          error: "This username is already registered."
        });
      }

      return json(res, 201, {
        ok: true,
        message: "Account created. Log in and submit your payment TxID."
      });
    }

    if (action !== "login") {
      return json(res, 400, { error: "Unknown action." });
    }

    const user = await getUser(username);

    if (!user) {
      return json(res, 401, { error: "Invalid username or password." });
    }

    const candidate = await hashPassword(password, user.passwordSalt);

    const a = Buffer.from(candidate, "hex");
    const b = Buffer.from(user.passwordHash || "", "hex");

    if (
      a.length !== b.length ||
      !crypto.timingSafeEqual(a, b)
    ) {
      return json(res, 401, { error: "Invalid username or password." });
    }

    const token = crypto.randomBytes(32).toString("hex");

    // A new login replaces the previous active device/session.
    await redis.set(`session:${token}`, username, {
      ex: SESSION_SECONDS
    });

    await redis.set(`active-session:${username}`, token, {
      ex: SESSION_SECONDS
    });

    setSessionCookie(res, token);

    return json(res, 200, {
      ok: true,
      user: publicUser(user)
    });
  } catch (error) {
    console.error("AUTH ERROR:", error);
    return json(res, 500, { error: "Authentication service failed." });
  }
}
