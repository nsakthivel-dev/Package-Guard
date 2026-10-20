/**
 * PackageGuard shared utilities.
 * Export generic helpers that both CLI and Electron use.
 */

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function generateId(prefix: string, bytes: number = 8): string {
  const crypto = require('node:crypto');
  return `${prefix}${crypto.randomBytes(bytes).toString('hex')}`;
}

export function isStringRecord(v: unknown): v is Record<string, string> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export * from './project-validator.js';
export * from './security.js';
