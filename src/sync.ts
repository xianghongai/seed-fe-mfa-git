/**
 * Keeping a branch in step with its remote. Pulling only fetches and fast-forwards; pushing never forces.
 *
 * Checking only fetches: remote-tracking branches and tags move, the worktree and local branches do not.
 * Pulling fast-forwards the branch after fetching: `merge --ff-only` when it is checked out, otherwise it only
 * moves the branch pointer. Branches are never switched. When git refuses to fast-forward (diverged history, or
 * local changes that would be overwritten), the result is `fetchedOnly`, not an error.
 * Pushing sends the local branch to the remote branch of the same name without checking it out, creating it when
 * missing; a non-fast-forward push is rejected by the remote and reported as `rejected`.
 */
import { createGit, errorMessage, type Git, type GitOptions } from './git.js';
import { isRepositoryRoot, resolveCommitWith, resolveRemote } from './repository.js';

/** `ok` means `behind` and `ahead` are known; the other states explain why the branch could not be checked. */
export type BranchState = 'ok' | 'noRepository' | 'noRemote' | 'remoteBranchMissing' | 'failed';

export interface BranchStatus {
  branch: string;
  remote?: string;
  state: BranchState;
  /** Commits on the remote branch that the local branch lacks; all of them when there is no local branch yet. */
  behind?: number;
  /** Local commits not on the remote branch; all of them when the remote branch does not exist yet. */
  ahead?: number;
  /** Why the check failed. */
  message?: string;
}

/**
 * `updated`: fast-forwarded; `upToDate`: nothing to pull; `fetchedOnly`: git refused to fast-forward, so only the
 * fetch happened; `skipped`: there is no remote branch to pull from.
 */
export type BranchPullOutcome = 'updated' | 'upToDate' | 'fetchedOnly' | 'skipped';

export interface BranchPullResult extends BranchStatus {
  outcome: BranchPullOutcome;
  /** Commits fast-forwarded when `updated`. */
  count?: number;
}

/** `pushed`; `upToDate`: nothing to push; `rejected` by the remote, usually pull first; `skipped`: nothing to push to. */
export type BranchPushOutcome = 'pushed' | 'upToDate' | 'rejected' | 'skipped';

export interface BranchPushResult extends BranchStatus {
  outcome: BranchPushOutcome;
  /** Commits pushed when `pushed`. */
  count?: number;
}

export interface BranchOptions extends GitOptions {
  branch: string;
}

interface Inspection {
  status: BranchStatus;
  git?: Git;
  remoteRef?: string;
  hasLocal?: boolean;
}

const inspect = async (options: BranchOptions): Promise<Inspection> => {
  const { branch } = options;
  const status: BranchStatus = { branch, state: 'ok' };
  try {
    if (!(await isRepositoryRoot(options))) {
      return { status: { ...status, state: 'noRepository' } };
    }
    const remote = await resolveRemote(options);
    if (!remote) {
      return { status: { ...status, state: 'noRemote' } };
    }
    status.remote = remote;
    const git = createGit(options);
    await git.run(['fetch', '--tags', '--', remote]);
    const remoteRef = `refs/remotes/${remote}/${branch}`;
    const localRef = `refs/heads/${branch}`;
    const hasLocal = (await resolveCommitWith(git, localRef)) !== undefined;
    const count = async (range: string) => Number(await git.run(['rev-list', '--count', range]));
    if (!(await resolveCommitWith(git, remoteRef))) {
      return {
        status: { ...status, state: 'remoteBranchMissing', ...(hasLocal ? { ahead: await count(localRef) } : {}) },
        git,
        hasLocal,
      };
    }
    status.behind = await count(hasLocal ? `${localRef}..${remoteRef}` : remoteRef);
    status.ahead = hasLocal ? await count(`${remoteRef}..${localRef}`) : 0;
    return { status, git, remoteRef, hasLocal };
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }
    return { status: { ...status, state: 'failed', message: errorMessage(error) } };
  }
};

/** Fetches and counts how far the branch is behind and ahead of its remote; changes no local branch or file. */
export const branchStatus = async (options: BranchOptions): Promise<BranchStatus> => (await inspect(options)).status;

/** Fetches, then fast-forwards the branch to its remote; only fetches when a fast-forward is impossible. */
export const pullBranch = async (options: BranchOptions): Promise<BranchPullResult> => {
  const { status, git, remoteRef } = await inspect(options);
  if (status.state !== 'ok' || !git || !remoteRef) {
    return { ...status, outcome: 'skipped' };
  }
  const count = status.behind ?? 0;
  if (count === 0) {
    return { ...status, outcome: 'upToDate' };
  }
  const current = await git.probe(['symbolic-ref', '--quiet', '--short', 'HEAD']);
  try {
    if (current === status.branch) {
      // Updates the worktree; git refuses when uncommitted changes would be overwritten and keeps them.
      await git.run(['merge', '--ff-only', remoteRef]);
    } else {
      // Moves the branch pointer only, creating the branch when missing; without `+`, git refuses non-fast-forwards.
      await git.run(['fetch', '.', `${remoteRef}:refs/heads/${status.branch}`]);
    }
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }
    return { ...status, outcome: 'fetchedOnly', message: errorMessage(error) };
  }
  return { ...status, behind: 0, outcome: 'updated', count };
};

/** Pushes the local branch to the remote branch of the same name, creating it when missing. Never forces. */
export const pushBranch = async (options: BranchOptions): Promise<BranchPushResult> => {
  const { status, git, hasLocal } = await inspect(options);
  const canPush = status.state === 'ok' || status.state === 'remoteBranchMissing';
  if (!canPush || !git || !hasLocal || !status.remote) {
    return { ...status, outcome: 'skipped' };
  }
  const count = status.ahead ?? 0;
  if (status.state === 'ok' && count === 0) {
    return { ...status, outcome: 'upToDate' };
  }
  const ref = `refs/heads/${status.branch}`;
  try {
    await git.run(['push', '--', status.remote, `${ref}:${ref}`]);
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }
    return { ...status, outcome: 'rejected', message: errorMessage(error) };
  }
  return { ...status, state: 'ok', behind: status.behind ?? 0, ahead: 0, outcome: 'pushed', count };
};
