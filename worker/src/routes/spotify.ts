import { json, readJson, type Router } from "../http.js";
import { configured, readPlaylist, toCsv } from "../spotify.js";
import * as check from "../validate.js";

/**
 * Reading a Spotify playlist. Metadata only, deliberately.
 *
 * There is no audio anywhere behind these routes. See spotify.ts for why.
 */
export function spotifyRoutes(router: Router): void {
  router.get("/api/spotify", ({ res }) => json(res, 200, { configured: configured() }));

  router.post("/api/spotify/playlist", async ({ req, res }) => {
    const body = await readJson<{ playlist?: unknown }>(req, 4096);
    const result = await readPlaylist(check.playlistId(body.playlist));
    if ("error" in result) return json(res, 502, { error: result.error });
    return json(res, 200, result);
  });

  /** The same track list as a spreadsheet, which is what a migration or a backup actually needs. */
  router.get("/api/spotify/playlist/:id/csv", async ({ res, params }) => {
    const result = await readPlaylist(check.playlistId(params.id));
    if ("error" in result) return json(res, 502, { error: result.error });

    const body = Buffer.from(toCsv(result), "utf8");
    const name = `${result.name.replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "playlist"}.csv`;
    res.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-length": String(body.length),
      "content-disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "no-store",
    });
    res.end(body);
  });
}
