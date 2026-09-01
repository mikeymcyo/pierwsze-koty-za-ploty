import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs must be loaded by Node from node_modules, not from a bundled copy.
  // Under Node it has no Worker and loads its fallback with a dynamic
  // `import("./pdf.worker.mjs")` relative to its own file; inside a Turbopack
  // server chunk that path points at nothing. lib/documents/pdf-text.ts has the
  // whole story, including the canvas half of it.
  serverExternalPackages: ["pdfjs-dist"],
  // ...and that fallback worker has to be on the function's disk. The tracer
  // cannot follow a dynamic import of a computed path, so without this the
  // file is simply absent from the deployment and every PDF reads as
  // "unreadable" - locally node_modules is whole, so only Vercel would show it.
  // Every route, because the extraction runs from a server action and which
  // pages call it is not something a path list here should have to track.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
