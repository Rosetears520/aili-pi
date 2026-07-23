export type GlobalSkillSyncReport = {
  scanned: number;
  updated: string[];
  skippedMissing: string[];
  skippedUnsafe: string[];
};

export function isPiManagedNpmPackageRoot(packageRoot: string, home?: string): boolean;

export function syncExistingGlobalSkills(options?: {
  packageRoot?: string;
  home?: string;
}): Promise<GlobalSkillSyncReport>;
