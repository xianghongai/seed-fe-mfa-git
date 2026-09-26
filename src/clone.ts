/**
 * Getting sources: cloning a repository, or checking out a single tag into an empty directory.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createGit, type GitOptions } from './git.js';

export interface CloneOptions extends Omit<GitOptions, 'cwd'> {
  url: string;
  directory: string;
  /** Branch to check out; defaults to the remote's default branch. */
  branch?: string | undefined;
  /** Clones submodules too; defaults to `true`. */
  submodules?: boolean | undefined;
}

/** Clones `url` into `directory`, creating its parent directories. */
export const clone = async ({ url, directory, branch, submodules = true, ...options }: CloneOptions): Promise<void> => {
  const parent = path.dirname(directory);
  await mkdir(parent, { recursive: true });
  await createGit({ ...options, cwd: parent }).run([
    'clone',
    ...(branch ? ['--branch', branch] : []),
    ...(submodules ? ['--recurse-submodules'] : []),
    '--',
    url,
    directory,
  ]);
};

export interface CheckoutTagOptions extends Omit<GitOptions, 'cwd'> {
  url: string;
  tag: string;
  directory: string;
}

/**
 * Checks out exactly one tag of `url` into `directory` with a shallow fetch, as a detached HEAD, with submodules.
 * The repository is fetched by URL, so no remote name is added or assumed.
 */
export const checkoutTag = async ({ url, tag, directory, ...options }: CheckoutTagOptions): Promise<void> => {
  await mkdir(directory, { recursive: true });
  const git = createGit({ ...options, cwd: directory });
  const ref = `refs/tags/${tag}`;
  await git.run(['init', '--quiet']);
  await git.run(['fetch', '--depth=1', '--', url, `${ref}:${ref}`]);
  await git.run(['checkout', '--detach', ref]);
  await git.run(['submodule', 'update', '--init', '--recursive']);
};
