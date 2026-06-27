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

async function main() {
  const server = spawn(
    process.execPath,
    ["scripts/playwright-static-server.cjs", "public", String(port)],
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

  let exitCode = 1;

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
