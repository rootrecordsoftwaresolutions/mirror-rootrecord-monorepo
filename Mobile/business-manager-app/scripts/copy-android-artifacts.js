/**
 * Copies Gradle outputs to the app repo root with versioned names (.gitignore expects these).
 *
 *   node scripts/copy-android-artifacts.js apk|aab|all
 *
 * Dest: Mobile/business-manager-app/rootrecord-business-manager-mobile-<version>-release.apk
 *       Mobile/business-manager-app/rootrecord-business-manager-mobile-<version>-release.aab
 */
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const { version } = require(path.join(appRoot, "package.json"));

const releaseApkDir = path.join(appRoot, "android/app/build/outputs/apk/release");
const aabSrc = path.join(appRoot, "android/app/build/outputs/bundle/release/app-release.aab");

const apkDest = path.join(appRoot, `rootrecord-business-manager-mobile-${version}-release.apk`);
const aabDest = path.join(appRoot, `rootrecord-business-manager-mobile-${version}-release.aab`);

function resolveReleaseApkSrc() {
  const candidates = [
    path.join(releaseApkDir, "app-release.apk"),
    path.join(releaseApkDir, "app-release-unsigned.apk"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function copyIfExists(src, dest, label) {
  if (!fs.existsSync(src)) {
    console.error(`copy-android-artifacts: missing ${label}:\n  ${src}`);
    return false;
  }
  fs.copyFileSync(src, dest);
  console.log(`copy-android-artifacts: ${label} ->\n  ${dest}`);
  return true;
}

const mode = (process.argv[2] || "all").toLowerCase();

if (mode === "apk") {
  const apkSrc = resolveReleaseApkSrc();
  if (!copyIfExists(apkSrc, apkDest, "APK (release)")) process.exit(1);
} else if (mode === "aab") {
  if (!copyIfExists(aabSrc, aabDest, "AAB")) process.exit(1);
} else if (mode === "all") {
  const apkSrc = resolveReleaseApkSrc();
  const a = copyIfExists(apkSrc, apkDest, "APK (release)");
  const b = copyIfExists(aabSrc, aabDest, "AAB");
  if (!a || !b) process.exit(1);
} else {
  console.error("Usage: node scripts/copy-android-artifacts.js [apk|aab|all]");
  process.exit(1);
}
