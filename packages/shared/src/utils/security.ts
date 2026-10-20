/**
 * security.ts — Input validation and sanitization for security boundaries
 */

export const ALLOWED_PACKAGE_MANAGERS = new Set<string>([
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'pip',
  'poetry',
  'cargo',
]);

/**
 * Escapes characters with special meaning in HTML to prevent XSS / HTML injection.
 */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates that a package manager string belongs to the allowlist.
 */
export function assertSafePackageManager(pm: string): void {
  if (!pm || typeof pm !== 'string' || !ALLOWED_PACKAGE_MANAGERS.has(pm.trim().toLowerCase())) {
    throw new Error(
      `[SECURITY] Invalid package manager "${pm}". Allowed package managers: ${Array.from(ALLOWED_PACKAGE_MANAGERS).join(', ')}`
    );
  }
}

/**
 * Checks for shell metacharacters and control sequences that could trigger command injection.
 */
export function assertNoShellMetachars(value: string, label = 'input'): void {
  if (!value || typeof value !== 'string') return;
  // Disallow shell chaining operators, redirects, backticks, quotes, env expansion, null bytes, and newlines
  if (/[\x00-\x1f;&|`$<>^%'"\r\n]/.test(value)) {
    throw new Error(
      `[SECURITY] Unsafe characters detected in ${label}: "${value}". Shell metacharacters are strictly forbidden.`
    );
  }
}

/**
 * Validates a package name against ecosystem naming rules.
 */
export function assertSafePackageName(name: string, ecosystem: 'npm' | 'pip' = 'npm'): void {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('[SECURITY] Package name cannot be empty.');
  }

  const trimmed = name.trim();
  if (trimmed.length > 214) {
    throw new Error('[SECURITY] Package name exceeds maximum allowed length of 214 characters.');
  }

  assertNoShellMetachars(trimmed, 'package name');

  if (ecosystem === 'pip') {
    // Python/pip package naming: letters, numbers, dot, underscore, dash, optional extras [extra1,extra2]
    if (!/^[a-zA-Z0-9_\-\.]+(\[[a-zA-Z0-9_\-\.,]+\])?$/.test(trimmed)) {
      throw new Error(`[SECURITY] Invalid Python package name format: "${trimmed}".`);
    }
  } else {
    // npm/yarn/pnpm package naming: optional @scope/ followed by name
    if (!/^(@[a-zA-Z0-9_\-\.]+\/)?[a-zA-Z0-9_\-\.]+$/.test(trimmed)) {
      throw new Error(`[SECURITY] Invalid npm package name format: "${trimmed}".`);
    }
  }
}

/**
 * Validates a package version string.
 */
export function assertSafePackageVersion(version?: string | null): void {
  if (!version || typeof version !== 'string' || version.trim().length === 0) {
    return;
  }

  const trimmed = version.trim();
  if (trimmed.length > 64) {
    throw new Error('[SECURITY] Package version string exceeds maximum allowed length of 64 characters.');
  }

  // Reject shell metacharacters: chaining (&, |, ;), backticks, quotes, redirects (<, >), env ($), and control chars
  if (/[\x00-\x1f;&|`$<>%"'\r\n]/.test(trimmed)) {
    throw new Error(`[SECURITY] Unsafe characters detected in package version: "${trimmed}".`);
  }

  // Semver / version constraints: alphanumeric, dots, dashes, tildes, carets, equal, at, plus, space
  if (!/^[a-zA-Z0-9_\-\.\^\~=@+ ]+$/.test(trimmed)) {
    throw new Error(`[SECURITY] Invalid package version specification: "${trimmed}".`);
  }
}
