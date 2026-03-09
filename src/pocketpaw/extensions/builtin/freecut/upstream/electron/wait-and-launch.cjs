/**
 * Wait for a URL to respond, then launch Electron.
 * Usage: node electron/wait-and-launch.cjs
 */
const { execSync } = require("child_process");
const http = require("http");

const URL = "http://localhost:5173";
const TIMEOUT = 30000;
const INTERVAL = 500;

function check() {
  return new Promise((resolve) => {
    const req = http.get(URL, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const start = Date.now();
  process.stdout.write("[app] Waiting for Vite...");

  while (Date.now() - start < TIMEOUT) {
    if (await check()) {
      console.log(" ready!");
      execSync("electron .", { stdio: "inherit", cwd: process.cwd() });
      return;
    }
    await new Promise((r) => setTimeout(r, INTERVAL));
    process.stdout.write(".");
  }

  console.error("\n[app] Timed out waiting for Vite");
  process.exit(1);
}

main();
