import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkoutTag,
  clone,
  commitInfo,
  currentBranch,
  isRepositoryRoot,
  mergedTags,
  remoteUrl,
  resolveRemote,
  sameTree,
  tagExists,
  worktreeChanges,
} from '../src/index.js';
import { branch, commit, fixture, git } from './fixture.js';

describe('repository', () => {
  it('answers questions about the repository root, branch, commits and tags', async () => {
    const { root, work } = await fixture();
    const nested = path.join(work, 'nested');
    await mkdir(nested);
    const first = await git(work, ['rev-parse', 'HEAD']);
    await git(work, ['tag', '1.0.0']);
    const second = await commit(work, 'page.txt', 'v2');

    expect(await isRepositoryRoot({ cwd: work })).toBe(true);
    expect(await isRepositoryRoot({ cwd: nested })).toBe(false);
    expect(await isRepositoryRoot({ cwd: root })).toBe(false);
    expect(await currentBranch({ cwd: work })).toBe(branch);
    expect(await commitInfo({ cwd: work, ref: 'HEAD' })).toEqual({
      sha: second,
      shortSha: second.slice(0, 7),
      subject: 'update page.txt',
    });
    expect(await commitInfo({ cwd: work, ref: 'refs/heads/missing' })).toBeUndefined();
    expect(await mergedTags({ cwd: work, ref: second })).toEqual(['1.0.0']);
    expect(await tagExists({ cwd: work, name: '1.0.0' })).toBe(true);
    expect(await tagExists({ cwd: work, name: '2.0.0' })).toBe(false);
    expect(await sameTree({ cwd: work, a: first, b: second })).toBe(false);
    expect(await worktreeChanges({ cwd: work })).toBe(0);
  });

  it('resolves the upstream remote, then the only remote, and never assumes origin', async () => {
    const { remote, work } = await fixture();
    expect(await resolveRemote({ cwd: work, branch })).toBe('company');
    expect(await remoteUrl({ cwd: work, branch })).toBe(remote);

    await git(work, ['branch', '--quiet', '--unset-upstream']);
    expect(await resolveRemote({ cwd: work, branch })).toBe('company');

    await git(work, ['remote', 'add', 'mirror', 'mirror.git']);
    expect(await resolveRemote({ cwd: work, branch })).toBeUndefined();
    expect(await remoteUrl({ cwd: work, remote: 'mirror' })).toBe('mirror.git');
  });

  it('clones a branch, and checks out a single tag as a detached HEAD', async () => {
    const { root, remote, work } = await fixture();
    await git(work, ['tag', '1.0.0']);
    await git(work, ['push', '--quiet', 'company', 'refs/tags/1.0.0']);
    await commit(work, 'page.txt', 'v2');
    await git(work, ['push', '--quiet', 'company', branch]);

    const cloned = path.join(root, 'sources/app');
    await clone({ url: remote, directory: cloned, branch });
    expect(await currentBranch({ cwd: cloned })).toBe(branch);
    expect(await readFile(path.join(cloned, 'page.txt'), 'utf8')).toBe('v2');

    const release = path.join(root, 'release/app');
    await checkoutTag({ url: remote, tag: '1.0.0', directory: release });
    expect(await currentBranch({ cwd: release })).toBeUndefined();
    expect(await readFile(path.join(release, 'page.txt'), 'utf8')).toBe('v1');
    expect(await git(release, ['remote'])).toBe('');
  });
});
