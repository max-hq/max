import { spawnSync } from "bun";
import { join } from "path";

const packages = ["core", "connector"];
const root = import.meta.dir + "/..";

console.log("➝ Linking internal packages for local connector development...");

for (const pkg of packages) {
  const path = join(root, "packages", pkg);

  const { success } = spawnSync(["bun", "link"], {
    cwd: path,
    stdout: 'ignore',
    stderr: 'inherit'
  });

  if (success) {
    console.log(`  ✓ Successfully linked packages/${pkg}`);
  } else {
    console.error(`  x Failed to link packages/${pkg}`);
    process.exit(1);
  }
}
