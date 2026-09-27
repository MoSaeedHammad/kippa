/**
 * Build identity injected by vite.config.ts at build time. Every deploy can
 * be traced back to its branch, commit, base commit and build timestamp —
 * shown in the profile menu, the sign-in screen and the browser console.
 */
export const appVersion: string = __APP_VERSION__;
export const gitBranch: string = __GIT_BRANCH__;
export const gitCommit: string = __GIT_COMMIT__;
export const gitBaseCommit: string = __GIT_BASE__;
export const buildTime: string = __BUILD_TIME__;

/** One-line label, e.g. `v0.1.0 · feat/bank-misr-ingestion @ f3e136d`. */
export const versionLabel = `v${appVersion} · ${gitBranch} @ ${gitCommit}`;

/** Full details for tooltips and the console. */
export const versionDetails = [
  versionLabel,
  `base(main) @ ${gitBaseCommit}`,
  `built ${buildTime}`,
].join('\n');
