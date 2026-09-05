import { checkPassword, clearCookie, identify, issueSession, passwordConfigured, sessionCookie } from "../auth.js";
import { bad, json, readJson, type Router } from "../http.js";
import { log } from "../log.js";

/** True when the panel is being served over TLS, which is what decides the cookie's Secure flag. */
function overTls(forwarded: string | string[] | undefined): boolean {
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (header ?? "").split(",")[0]?.trim() === "https";
}

export function authRoutes(router: Router): void {
  router.post(
    "/api/auth/login",
    async ({ req, res }) => {
      const body = await readJson<{ password?: string }>(req, 4096);
      const password = typeof body.password === "string" ? body.password : "";
      if (!password) throw bad("A password is required");

      if (!passwordConfigured()) {
        log.error("a login was attempted but no password is configured");
        return json(res, 503, { error: "No password is configured on the worker." });
      }
      if (!checkPassword(password)) {
        // Deliberately unspecific, and deliberately logged: a brute-force attempt should be
        // visible in `docker logs` even though the response says nothing useful.
        log.warn(`rejected a login from ${req.socket.remoteAddress}`);
        return json(res, 401, { error: "That password is not right." });
      }

      const session = issueSession("operator");
      res.setHeader("set-cookie", sessionCookie(session.value, session.maxAge, overTls(req.headers["x-forwarded-proto"])));
      return json(res, 200, { ok: true });
    },
    true,
  );

  router.post(
    "/api/auth/logout",
    ({ res }) => {
      res.setHeader("set-cookie", clearCookie());
      return json(res, 200, { ok: true });
    },
    true,
  );

  // Protected, so the panel can tell a valid session from an expired one by the status alone.
  router.get("/api/me", ({ req, res }) => json(res, 200, { authenticated: true, user: identify(req.headers) }));
}
