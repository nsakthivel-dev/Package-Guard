export interface ProjectNameValidationResult {
  valid: boolean;
  error?: string;
  isIdentical?: boolean;
  isDuplicate?: boolean;
  name?: string;
}

export interface ExistingProjectSummary {
  id: string;
  name: string;
}

/**
 * Validates a project name according to PackageGuard naming rules:
 * - Trims leading and trailing whitespace.
 * - Rejects empty or whitespace-only names.
 * - Rejects invalid characters (path separators, filesystem-forbidden characters, control characters).
 * - Rejects names ending with a dot or consisting only of dots.
 * - Rejects duplicate project names within the existing projects scope (case-insensitive).
 * - Identifies when the entered name is identical to the current name.
 */
export function validateProjectName(
  rawName: unknown,
  currentName?: string | null,
  existingProjects?: Array<ExistingProjectSummary | string> | null,
  currentProjectId?: string | null
): ProjectNameValidationResult {
  if (typeof rawName !== 'string') {
    return { valid: false, error: 'Project name must be a string.' };
  }

  const trimmed = rawName.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Project name cannot be empty or contain only whitespace.' };
  }

  if (trimmed.length > 214) {
    return { valid: false, error: 'Project name cannot exceed 214 characters.' };
  }

  // Reject path separators (/ and \), forbidden filename characters (< > : " | ? *), and control characters
  if (/[<>:"/\\|?*\x00-\x1f]/.test(trimmed)) {
    return {
      valid: false,
      error: 'Project name contains invalid characters. Avoid / \\ : * ? " < > | and control characters.'
    };
  }

  // Reject names consisting only of dots or ending in a dot
  if (/^\.+$/.test(trimmed) || trimmed.endsWith('.')) {
    return {
      valid: false,
      error: 'Project name cannot consist only of dots or end with a dot.'
    };
  }

  // Check if identical to existing project name
  if (currentName !== undefined && currentName !== null) {
    if (trimmed === currentName.trim()) {
      return {
        valid: false,
        isIdentical: true,
        name: trimmed,
        error: 'The new project name is identical to the current name.'
      };
    }
  }

  // Check for duplicate names (case-insensitive)
  if (Array.isArray(existingProjects) && existingProjects.length > 0) {
    const isDuplicate = existingProjects.some((item) => {
      if (typeof item === 'string') {
        return item.trim().toLowerCase() === trimmed.toLowerCase();
      }
      if (item && typeof item === 'object') {
        if (currentProjectId && item.id === currentProjectId) {
          return false;
        }
        return (item.name || '').trim().toLowerCase() === trimmed.toLowerCase();
      }
      return false;
    });

    if (isDuplicate) {
      return {
        valid: false,
        isDuplicate: true,
        error: `A project named "${trimmed}" already exists. Please choose a unique name.`
      };
    }
  }

  return { valid: true, name: trimmed };
}
