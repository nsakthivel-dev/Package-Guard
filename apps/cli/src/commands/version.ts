import { PACKAGE_GUARD_VERSION } from "@package-guard/shared/version";

export function executeVersion(): number {
  console.log(`Package Guard CLI v${PACKAGE_GUARD_VERSION}`);
  return 0;
}
