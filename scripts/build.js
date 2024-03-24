const { build } = require("tsup");
const { cp } = require("node:fs/promises");
const { resolveTsPaths } = require("resolve-tspaths");

const { SOURCE_DIR, TARGET_DIR } = require("./_");

/**
 * Transpile TypeScript files to JavaScript and copy static files.
 * @fires {@link build `tsup.build`} to transpile TypeScript files to JavaScript.
 */
async function run(watch = false) {
  await build({
    config: true,
    watch,
  });

  await cp(SOURCE_DIR, TARGET_DIR, {
    preserveTimestamps: true,
    recursive: true,
  }).catch(() => undefined);

  await resolveTsPaths();
}

module.exports = run;
if (require.main === module) void run();
