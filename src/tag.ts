/**
 * Creating a tag, optionally annotated, overwriting and pushed; a failed push leaves the local tags as they were.
 */
import { createGit, type GitOptions } from './git.js';

export interface CreateTagOptions extends GitOptions {
  name: string;
  /** Commit (or any ref) to tag. */
  commit: string;
  /** Creates an annotated tag when not blank; the message is kept as written, including lines starting with `#`. */
  message?: string | undefined;
  /** Overwrites an existing tag of the same name, locally and on the remote. */
  force?: boolean | undefined;
  /** Pushes the tag to this remote after creating it. */
  push?: { remote: string } | undefined;
}

export interface CreateTagResult {
  name: string;
  commit: string;
  /** Whether an existing tag was overwritten. */
  overwritten: boolean;
  pushed: boolean;
}

export const createTag = async (options: CreateTagOptions): Promise<CreateTagResult> => {
  const git = createGit(options);
  const ref = `refs/tags/${options.name}`;
  // The object the tag pointed at before, restored when the push fails.
  const previous = (await git.probe(['rev-parse', '--verify', '--quiet', ref])) || undefined;
  if (previous && !options.force) {
    throw new Error(`Tag ${options.name} already exists; pass force to overwrite it`);
  }
  const message = options.message?.trim();
  // The default `strip` cleanup would drop lines starting with `#`, such as issue references.
  const annotation = message ? ['-a', '-m', message, '--cleanup=whitespace'] : [];
  await git.run(['tag', ...(previous ? ['-f'] : []), ...annotation, '--', options.name, options.commit]);
  if (options.push) {
    try {
      await git.run(['push', '--', options.push.remote, `${previous ? '+' : ''}${ref}`]);
    } catch (error) {
      await git.run(previous ? ['update-ref', ref, previous] : ['tag', '-d', '--', options.name]);
      throw error;
    }
  }
  return {
    name: options.name,
    commit: await git.run(['rev-parse', `${ref}^{commit}`]),
    overwritten: previous !== undefined,
    pushed: options.push !== undefined,
  };
};
