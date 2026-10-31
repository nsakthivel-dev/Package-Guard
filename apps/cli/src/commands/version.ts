import { PACKAGE_GUARDIAN_VERSION } from "@package-guard/shared/version";

export function executeVersion(): number {
  console.log(`Package Guardian CLI v${PACKAGE_GUARDIAN_VERSION}`);
  return 0;
}
