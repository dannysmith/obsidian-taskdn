import { readFileSync, writeFileSync } from "fs";

// Get bump type from command line or use npm_package_version (for npm version hook)
const bumpType = process.argv[2]; // patch, minor, or major
let targetVersion = process.env.npm_package_version;

if (bumpType && ["patch", "minor", "major"].includes(bumpType)) {
  // Read current version and bump it
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const [major, minor, patch] = pkg.version.split(".").map(Number);

  if (bumpType === "patch") {
    targetVersion = `${major}.${minor}.${patch + 1}`;
  } else if (bumpType === "minor") {
    targetVersion = `${major}.${minor + 1}.0`;
  } else if (bumpType === "major") {
    targetVersion = `${major + 1}.0.0`;
  }

  // Update package.json
  pkg.version = targetVersion;
  writeFileSync("package.json", JSON.stringify(pkg, null, "\t") + "\n");
}

if (!targetVersion) {
  console.error("Usage: node version-bump.mjs [patch|minor|major]");
  console.error("Or run via: npm version [patch|minor|major]");
  process.exit(1);
}

// Read minAppVersion from manifest.json and bump version to target version
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// Update versions.json with target version and minAppVersion from manifest.json
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));
