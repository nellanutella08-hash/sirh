import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lib/documentPdf.ts and lib/ficheObjectifsPdf.ts read logo/cachet/
  // signature PNGs from public/ via fs.readFileSync(path.join(process.cwd(),
  // "public", ...)) — a dynamic path Next's build-time file tracing can't
  // follow, so those images were silently missing from these routes'
  // deployed serverless bundles (present and working in local `next build
  // && next start` since that runs against the full filesystem, which is
  // exactly why this went unnoticed until checked in production).
  outputFileTracingIncludes: {
    "/api/documents/requests/\\[id\\]/envoyer": [
      "./public/logos/**/*",
      "./public/cachets/**/*",
      "./public/signatures/**/*",
    ],
    "/api/evaluations/\\[id\\]": ["./public/logos/**/*"],
  },
};

export default nextConfig;
