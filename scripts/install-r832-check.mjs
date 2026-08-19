import fs from "node:fs";
import path from "node:path";

const packagePath = path.resolve(process.cwd(), "package.json");

if (!fs.existsSync(packagePath)) {
  console.error("[R8.3.2-INSTALL] package.json tidak ditemukan. Jalankan dari root project.");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
pkg.scripts = pkg.scripts || {};

pkg.scripts["audit:r832-finalizer"] = "node scripts/check-r832-finalizer.mjs";

const currentVerify = String(
  pkg.scripts.verify || "npm run audit:db && npm run audit:release && next build"
);

if (!currentVerify.includes("audit:r832-finalizer")) {
  if (currentVerify.includes("npm run audit:db")) {
    pkg.scripts.verify = currentVerify.replace(
      "npm run audit:db",
      "npm run audit:db && npm run audit:r832-finalizer"
    );
  } else {
    pkg.scripts.verify = `npm run audit:r832-finalizer && ${currentVerify}`;
  }
}

fs.writeFileSync(
  packagePath,
  `${JSON.stringify(pkg, null, 2)}\n`,
  "utf8"
);

console.log("[R8.3.2-INSTALL] PASS");
console.log('Added: npm run audit:r832-finalizer');
console.log(`verify: ${pkg.scripts.verify}`);
