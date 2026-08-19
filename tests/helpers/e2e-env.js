const fs = require("node:fs");
const path = require("node:path");

let loaded = false;

function loadE2EEnv() {
  if (loaded) return;
  loaded = true;

  const file = path.join(process.cwd(), ".env.e2e.local");
  if (!fs.existsSync(file)) return;

  const content = fs.readFileSync(file, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const index = line.indexOf("=");
    if (index <= 0) continue;

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(...keys) {
  loadE2EEnv();
  const missing = keys.filter((key) => !process.env[key]);
  return {
    ok: missing.length === 0,
    missing,
  };
}

loadE2EEnv();

module.exports = { loadE2EEnv, requiredEnv };
