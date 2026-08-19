import fs from "node:fs";
import path from "node:path";

const packagePath = path.resolve(process.cwd(), "package.json");
if (!fs.existsSync(packagePath)) {
  console.error("[GOLDEN-INSTALL] package.json tidak ditemukan.");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
pkg.scripts = pkg.scripts || {};
pkg.scripts["test:golden"] =
  "playwright test tests/golden-path.spec.js --headed --workers=1";

fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

console.log("[GOLDEN-INSTALL] PASS");
console.log("test:golden =", pkg.scripts["test:golden"]);
