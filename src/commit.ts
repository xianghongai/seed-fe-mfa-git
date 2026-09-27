/**
 * Committing selected files only, leaving every other staged or unstaged change as it was.
 */
import { createGit, type GitOptions } from './git.js';

export interface CommitOptions extends GitOptions {
  message: string;
  /** Paths relative to `cwd`; only their changes are committed. */
  paths: string[];
}

/** Commits `paths` (modified, new or deleted) with `message` and returns the new commit SHA. The message is kept as written. */
export const commit = async (options: CommitOptions): Promise<string> => {
  const git = createGit(options);
  // Stage the paths first so new and deleted files are committed too; `--only` then commits exactly these
  // paths, ignoring whatever else is staged, and `whitespace` keeps `#` lines of the message.
  await git.run(['add', '--all', '--', ...options.paths]);
  await git.run(['commit', '--only', '--cleanup=whitespace', '-m', options.message, '--', ...options.paths]);
  return git.run(['rev-parse', 'HEAD']);
};
