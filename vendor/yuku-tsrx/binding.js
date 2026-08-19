import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const report = process.platform === "linux" && process.report?.getReport?.();
const header = typeof report === "string" ? JSON.parse(report).header : report?.header;
const libc = process.platform === "linux" ? (header?.glibcVersionRuntime ? "-gnu" : "-musl") : "";
const suffix = `${process.platform}-${process.arch}${libc}`;
const local = fileURLToPath(new URL(`./@yuku-tsrx/binding-${suffix}/yuku-tsrx.node`, import.meta.url));
let binding;
try { binding = require(local); }
catch (localError) {
  try { binding = require(`@yuku-tsrx/binding-${suffix}/yuku-tsrx.node`); }
  catch (packageError) {
    throw new Error(`Failed to load @yuku-tsrx native binding for ${suffix}`, {
      cause: new AggregateError([localError, packageError]),
    });
  }
}
export default binding;
