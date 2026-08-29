/** Installs e2e/support/tsx-loader.mjs. Passed to node with --import. */
import { register } from "node:module";

register("./tsx-loader.mjs", import.meta.url);
