export { createGit, type Git, type GitOptions } from './git.js';
export {
  commitInfo,
  currentBranch,
  isRepositoryRoot,
  mergedTags,
  remoteUrl,
  resolveCommit,
  resolveRemote,
  sameTree,
  tagExists,
  worktreeChanges,
  type CommitInfo,
} from './repository.js';
export {
  branchStatus,
  pullBranch,
  pushBranch,
  type BranchOptions,
  type BranchPullOutcome,
  type BranchPullResult,
  type BranchPushOutcome,
  type BranchPushResult,
  type BranchState,
  type BranchStatus,
} from './sync.js';
export { createTag, type CreateTagOptions, type CreateTagResult } from './tag.js';
export { checkoutTag, clone, type CheckoutTagOptions, type CloneOptions } from './clone.js';
export {
  compareReleaseVersions,
  formatReleaseVersion,
  parseReleaseVersion,
  releaseCandidates,
  releaseLine,
  type Maturity,
  type PatchType,
  type ReleaseCandidates,
  type ReleaseCandidatesResult,
  type ReleaseStage,
  type ReleaseVersion,
  type ReleaseVersionIssue,
} from './release-version.js';
