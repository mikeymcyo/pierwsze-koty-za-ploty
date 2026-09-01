/**
 * Just enough of a loader to import the PDF documents into a plain Node test.
 *
 * The rest of the e2e suite imports `.ts` directly and lets Node strip the
 * types, which costs nothing and needs no build. The PDF layouts are `.tsx`
 * and Node will not strip JSX, so without this the only way to render a report
 * would be to stand up the whole application - and a template batch that
 * cannot render a template is not testable at all.
 *
 * So the JSX goes through the SWC that Next already ships and depends on. No
 * new dependency, no build step, and no second copy of the layout to drift
 * away from the real one: the test renders exactly the file that ships.
 *
 * Used only by the tests. Nothing in the application loads this.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const swc = require("next/dist/build/swc");
const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

// The native bindings load asynchronously and throw if used before they are
// ready, so the first transform waits for them and the rest reuse the promise.
let bindings = null;
async function transform(source, options) {
  bindings ??= swc.loadBindings();
  await bindings;
  return swc.transform(source, options);
}

/** `@/lib/pdf/theme` and `./photo-evidence` alike carry no extension. */
function resolveFile(base) {
  for (const candidate of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.js`,
    path.join(base, "index.tsx"),
    path.join(base, "index.ts"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * `server-only` is a build-time guard, and under Node there is nothing to guard.
 *
 * The package exists so the Next bundler refuses to pull a server module into a
 * client bundle; imported by a plain Node test it simply throws. Stubbing it
 * here lets a test import the module the application actually ships rather than
 * asserting on its source as text, which is the difference between checking
 * that a PDF parser parses a PDF and checking that it is spelled correctly.
 */
const BUNDLER_GUARDS = new Set(["server-only", "client-only"]);

export async function resolve(specifier, context, next) {
  if (BUNDLER_GUARDS.has(specifier)) {
    return { url: "data:text/javascript,export{}", shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const file = resolveFile(path.join(ROOT, specifier.slice(2)));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const file = resolveFile(
      path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier),
    );
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith("file:") && /\.tsx?$/.test(url)) {
    const filename = fileURLToPath(url);
    const { code } = await transform(readFileSync(filename, "utf8"), {
      filename,
      isModule: true,
      module: { type: "es6" },
      jsc: {
        parser: { syntax: "typescript", tsx: filename.endsWith(".tsx") },
        target: "es2022",
        transform: { react: { runtime: "automatic" } },
      },
    });
    return { format: "module", source: code, shortCircuit: true };
  }
  return next(url, context);
}
