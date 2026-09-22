import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { readPhotoPathsCache, CACHE_ENABLED } from "@/lib/db";
import { resolveFileUrl } from "@/lib/neos";

// Proxies an employee's Neos profile photo behind our own session check.
// Neos serves these files with no auth of their own (see resolveFileUrl's
// docstring) — anyone holding the raw URL could view it without ever
// logging into the SIRH. Employe.photoUrl now only ever carries this
// route's URL ("/api/photos/<id>"), never the real Neos path, so the
// path itself never reaches the browser (see writePhotoPathsCache).
export async function GET(
  req: Request,
  ctx: RouteContext<"/api/photos/[id]">
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!CACHE_ENABLED) return NextResponse.json({ error: "Photo indisponible" }, { status: 404 });

  const { id } = await ctx.params;
  const paths = await readPhotoPathsCache(session.tenantId);
  const path = paths?.[id];
  if (!path) return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });

  const neosUrl = resolveFileUrl(path);
  if (!neosUrl) return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });

  const res = await fetch(neosUrl);
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });
  }

  return new NextResponse(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
