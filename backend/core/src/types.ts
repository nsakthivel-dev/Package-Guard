import { z } from 'zod';

const PackageManagerSchema = z.union([
  z.literal('npm'),
  z.literal('pnpm'),
  z.literal('yarn'),
  z.literal('bun'),
]);

export type PackageManager = z.infer<typeof PackageManagerSchema>;

const ProjectIdSchema = z.string().refine((v) => v.startsWith('proj-'), {
  message: 'Project id must start with "proj-"',
});

export const ProjectSchema = z.object({
  id: ProjectIdSchema,
  name: z.string().min(1),
  path: z.string().min(1),
  packageManager: PackageManagerSchema,
  packageJson: z.any(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type Project = z.infer<typeof ProjectSchema>;

const SnapshotPackageSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  type: z.union([
    z.literal('dependency'),
    z.literal('devDependency'),
    z.literal('optional'),
  ]),
});

export type SnapshotPackage = z.infer<typeof SnapshotPackageSchema>;

const SnapshotIdSchema = z.string().regex(/^[0-9a-f]{8}$/, {
  message: 'Snapshot id must be 8-char hex',
});

export const PgSnapshotSchema = z.object({
  id: SnapshotIdSchema,
  projectId: ProjectIdSchema,
  message: z.string(),
  packages: z.array(SnapshotPackageSchema),
  packageCount: z.number().int().nonnegative(),
  parentId: z.string().nullable(),
  createdAt: z.number().int(),
  treeHash: z.string().optional(),
});

export type PgSnapshot = z.infer<typeof PgSnapshotSchema>;

export const DiffEntrySchema = z.object({
  name: z.string().min(1),
  fromVersion: z.string().nullable(),
  toVersion: z.string().nullable(),
  changeType: z.union([
    z.literal('added'),
    z.literal('removed'),
    z.literal('changed'),
    z.literal('upgraded'),
    z.literal('downgraded'),
  ]),
});

export type DiffEntry = z.infer<typeof DiffEntrySchema>;

export const LockfileDataSchema = z.object({
  packageManager: z.string().min(1),
  packages: z.array(SnapshotPackageSchema),
});

export type LockfileData = z.infer<typeof LockfileDataSchema>;

export const DbMetaSchema = z.object({
  version: z.number().int().default(1),
});

export type DbMeta = z.infer<typeof DbMetaSchema>;

export const DatabaseSchema = z.object({
  projects: z.array(ProjectSchema),
  snapshots: z.array(PgSnapshotSchema),
  meta: DbMetaSchema,
});

export type DatabaseShape = z.infer<typeof DatabaseSchema>;
