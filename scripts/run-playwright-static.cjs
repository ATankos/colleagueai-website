const { spawn } = require("child_process");
const http = require("http");

const port = 4173;
const host = "127.0.0.1";
const urlPath = "/agents";
const testArgs = process.argv.slice(2);

if (testArgs.length === 0) {
  console.error("Usage: node scripts/run-playwright-static.cjs <playwright-test-args>");
  process.exit(1);
}

function waitForServer(timeoutMs) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    function check() {
      const req = http.get(
        {
          hostname: host,
          port,
          path: urlPath,
          timeout: 3000
        },
        (res) => {
          res.resume();

          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
            resolve();
            return;
          }

          retry();
        }
      );

      req.on("error", retry);
      req.on("timeout", () => {
        req.destroy();
        retry();
      });
    }

    function retry() {
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Static server did not become ready at http://" + host + ":" + port + urlPath));
        return;
      }

      setTimeout(check, 500);
    }

    check();
  });
}

function run(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        ...(options && options.env ? options.env : {})
      }
    });

    child.on("exit", (code) => resolve(code || 0));
  });
}

/* The browser suites must run against what is deployed: the build output (dist/), not the committed public/ folder.
   Build steps inject the unified header, externalized assets and localized SEO, so public/ is not what a visitor
   receives; serving it made 20 navigation and language-switch tests fail for a reason no visitor would ever see.
   PLAYWRIGHT_STATIC_ROOT=public restores the old behaviour for debugging only. */
const staticRoot = process.env.PLAYWRIGHT_STATIC_ROOT || "dist";

async function main() {
  const fs = require("fs");
  if (!fs.existsSync(require("path").join(staticRoot, "index.html"))) {
    console.error("run-playwright-static: " + staticRoot + "/index.html is missing. Run `npm run build` first.");
    process.exit(1);
  }
  const server = spawn(
    process.execPath,
    ["scripts/playwright-static-server.cjs", staticRoot, String(port)],
    {
      stdio: "inherit",
      shell: false,
      env: {
        ...process.env,
        HOST: host,
        PORT: String(port)
      }
    }
  );

  let exitCode;

  try {
    await waitForServer(30000);

    exitCode = await run(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["playwright", "test", ...testArgs],
      {
        env: {
          PLAYWRIGHT_SKIP_WEBSERVER: "1"
        }
      }
    );
  } finally {
    if (!server.killed) {
      server.kill();
    }
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
