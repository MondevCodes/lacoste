const { resolve } = require("node:path");
const { copy } = require("fs-extra");

const chokidar = require("chokidar");
const crossSpawn = require("cross-spawn");

const { LANGUAGES_DIR, SOURCE_DIR, TARGET_DIR } = require("./_");
const runBuild = require("./build");

/**
 * Runs the development script.
 * @fires {@link runBuild `runBuild`} to transpile TypeScript files to JavaScript.
 */
async function run() {
  await runBuild(true);

  chokidar.watch(LANGUAGES_DIR).on("all", async (event, path) => {
    if (event !== "change" || !path.endsWith(".json")) return;

    await copy(SOURCE_DIR, TARGET_DIR, {
      overwrite: true,
      preserveTimestamps: true,
    });
  });

  let nodeProcess = startNodeProcess();

  chokidar.watch(resolve(TARGET_DIR, "index.js")).on("all", (event) => {
    if (event !== "change") return;

    nodeProcess.kill();
    nodeProcess = startNodeProcess();
  });

  process.on("SIGINT", () => {
    nodeProcess.kill();
  });
}

/**
 * Starts a node process with the compiled code.
 * @returns {import("child_process").ChildProcess} Node process.
 */
function startNodeProcess() {
  return crossSpawn("node", ["dist/index.js"], {
    stdio: "inherit",
  });
}

module.exports = run;
if (require.main === module) void run();
