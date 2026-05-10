import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const TARGET_MAX_AGENT_EVENTS = 10_000;
const TARGET_MAX_TOTAL_EVENTS = 10_000;
const EXPECTED_VERSION = "1.57.1";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NM = resolve(__dirname, "../node_modules");
const PKG_DIR = `${NM}/@copilotkit/web-inspector`;

function readVersion() {
  const pkg = JSON.parse(readFileSync(`${PKG_DIR}/package.json`, "utf8"));
  return pkg.version;
}

function extractValue(content, name) {
  const match = content.match(new RegExp(`const ${name} = (\\d+)`));
  return match ? parseInt(match[1], 10) : null;
}

function patchFile(filePath) {
  const label = filePath.replace(`${NM}/`, "node_modules/");
  console.log(`[patch-cki] Patching ${label}`);

  const content = readFileSync(filePath, "utf8");
  const currentAgent = extractValue(content, "MAX_AGENT_EVENTS");
  const currentTotal = extractValue(content, "MAX_TOTAL_EVENTS");

  if (
    currentAgent === TARGET_MAX_AGENT_EVENTS &&
    currentTotal === TARGET_MAX_TOTAL_EVENTS
  ) {
    console.log(
      `[patch-cki]   already patched (MAX_AGENT_EVENTS=${currentAgent}, MAX_TOTAL_EVENTS=${currentTotal})`
    );
    return;
  }

  console.log(
    `[patch-cki]   MAX_AGENT_EVENTS: ${currentAgent} → ${TARGET_MAX_AGENT_EVENTS}`
  );
  console.log(
    `[patch-cki]   MAX_TOTAL_EVENTS: ${currentTotal} → ${TARGET_MAX_TOTAL_EVENTS}`
  );

  const patched = content
    .replace(
      /const MAX_AGENT_EVENTS = \d+/,
      `const MAX_AGENT_EVENTS = ${TARGET_MAX_AGENT_EVENTS}`
    )
    .replace(
      /const MAX_TOTAL_EVENTS = \d+/,
      `const MAX_TOTAL_EVENTS = ${TARGET_MAX_TOTAL_EVENTS}`
    );

  writeFileSync(filePath, patched, "utf8");
  console.log(`[patch-cki]   patched successfully`);
}

const version = readVersion();
console.log(
  `[patch-cki] Checking @copilotkit/web-inspector version... ${version}`,
  version === EXPECTED_VERSION ? "✓" : ""
);

if (version !== EXPECTED_VERSION) {
  console.log(
    `[patch-cki] WARN: @copilotkit/web-inspector is ${version}, expected ${EXPECTED_VERSION}.`
  );
  console.log(
    `[patch-cki] WARN: Patch skipped. Review patch-cki.mjs against the new version before re-enabling.`
  );
  process.exit(0);
}

patchFile(`${PKG_DIR}/dist/index.mjs`);
patchFile(`${PKG_DIR}/dist/index.cjs`);
