/**
 * Read-only questions about a repository: its root, branch, remote, commits and tags.
 */
import { realpath } from 'node:fs/promises';
import { createGit, directoryExists, type Git, type GitOptions } from './git.js';

export interface CommitInfo {
  sha: string;
  shortSha: string;
  subject: string;
}

export const lines = (value: string | undefined): string[] =>
  (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * Whether `cwd` is itself the root of a repository, not a directory inside an outer one
 * (for example a workspace that is also under Git).
 */
export const isRepositoryRoot = async (options: GitOptions): Promise<boolean> => {
  if (!directoryExists(options.cwd)) {
    return false;
  }
  const topLevel = await createGit(options).probe(['rev-parse', '--show-toplevel']);
  return Boolean(topLevel) && (await realpath(topLevel!)) === (await realpath(options.cwd));
};

/** The checked-out branch; `undefined` on a detached HEAD or outside a repository. */
export const currentBranch = async (options: GitOptions): Promise<string | undefined> =>
  (await createGit(options).probe(['symbolic-ref', '--quiet', '--short', 'HEAD'])) || undefined;

const findRemote = async (git: Git, branch: string | undefined): Promise<string | undefined> => {
  if (branch) {
    const upstream = await git.probe(['for-each-ref', '--format=%(upstream:remotename)', `refs/heads/${branch}`]);
    if (upstream) {
      return upstream;
    }
  }
  // Without an upstream, only a single remote is unambiguous; the name is never assumed to be origin.
  const remotes = lines(await git.probe(['remote']));
  return remotes.length === 1 ? remotes[0] : undefined;
};

/** The remote of `branch`: its upstream, otherwise the only remote of the repository. */
export const resolveRemote = async (options: GitOptions & { branch?: string | undefined }) =>
  findRemote(createGit(options), options.branch);

/** URL of `remote`, or of the remote that `resolveRemote` picks. */
export const remoteUrl = async (
  options: GitOptions & { remote?: string | undefined; branch?: string | undefined }
): Promise<string | undefined> => {
  const git = createGit(options);
  const remote = options.remote ?? (await findRemote(git, options.branch));
  return remote ? (await git.probe(['remote', 'get-url', '--', remote])) || undefined : undefined;
};

export const resolveCommitWith = async (git: Git, ref: string): Promise<string | undefined> =>
  (await git.probe(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])) || undefined;

/** Commit SHA of `ref`, or `undefined` when it does not exist. */
export const resolveCommit = (options: GitOptions & { ref: string }) =>
  resolveCommitWith(createGit(options), options.ref);

export const commitInfo = async (options: GitOptions & { ref: string }): Promise<CommitInfo | undefined> => {
  const git = createGit(options);
  const sha = await resolveCommitWith(git, options.ref);
  if (!sha) {
    return undefined;
  }
  const [shortSha = '', subject = ''] = (await git.run(['log', '-1', '--format=%h%x00%s', sha])).split('\0');
  return { sha, shortSha, subject };
};

/** Whether two refs point at the same content, regardless of history. */
export const sameTree = async (options: GitOptions & { a: string; b: string }): Promise<boolean> => {
  const git = createGit(options);
  const [a, b] = await Promise.all([
    git.probe(['rev-parse', `${options.a}^{tree}`]),
    git.probe(['rev-parse', `${options.b}^{tree}`]),
  ]);
  return a !== undefined && a === b;
};

/** Tags reachable from `ref`. */
export const mergedTags = async (options: GitOptions & { ref: string }): Promise<string[]> =>
  lines(await createGit(options).run(['tag', '--merged', options.ref]));

export const tagExists = async (options: GitOptions & { name: string }): Promise<boolean> =>
  Boolean(await createGit(options).probe(['rev-parse', '--verify', '--quiet', `refs/tags/${options.name}`]));

/** Number of tracked files with uncommitted changes. */
export const worktreeChanges = async (options: GitOptions): Promise<number> =>
  lines(await createGit(options).run(['status', '--porcelain', '--untracked-files=no'])).length;
