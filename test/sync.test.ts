import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { branchStatus, pullBranch, pushBranch } from '../src/index.js';
import { branch, commit, fixture, git } from './fixture.js';

describe('branch sync', () => {
  it('counts behind and ahead without touching the local branch or the worktree', async () => {
    const { work, pushFromTeammate } = await fixture();
    const local = await commit(work, 'local.txt', 'local');
    await pushFromTeammate('page.txt', 'v2');
    await pushFromTeammate('page.txt', 'v3');

    expect(await branchStatus({ cwd: work, branch })).toEqual({
      branch,
      remote: 'company',
      state: 'ok',
      behind: 2,
      ahead: 1,
    });
    expect(await git(work, ['rev-parse', 'HEAD'])).toBe(local);
    expect(await readFile(path.join(work, 'page.txt'), 'utf8')).toBe('v1');
  });

  it('fast-forwards the checked-out branch', async () => {
    const { work, pushFromTeammate } = await fixture();
    const latest = await pushFromTeammate('page.txt', 'v2');

    expect(await pullBranch({ cwd: work, branch })).toMatchObject({ outcome: 'updated', count: 1, behind: 0 });
    expect(await git(work, ['rev-parse', 'HEAD'])).toBe(latest);
    expect(await readFile(path.join(work, 'page.txt'), 'utf8')).toBe('v2');
  });

  it('only moves the branch pointer when another branch is checked out', async () => {
    const { work, pushFromTeammate } = await fixture();
    const latest = await pushFromTeammate('page.txt', 'v2');
    await git(work, ['checkout', '--quiet', '-b', 'feature/orders']);
    const feature = await commit(work, 'feature.txt', 'work');
    await writeFile(path.join(work, 'feature.txt'), 'uncommitted');

    expect((await pullBranch({ cwd: work, branch })).outcome).toBe('updated');
    expect(await git(work, ['rev-parse', `refs/heads/${branch}`])).toBe(latest);
    expect(await git(work, ['symbolic-ref', '--short', 'HEAD'])).toBe('feature/orders');
    expect(await git(work, ['rev-parse', 'HEAD'])).toBe(feature);
    expect(await readFile(path.join(work, 'feature.txt'), 'utf8')).toBe('uncommitted');
  });

  it('only fetches when the history has diverged or the worktree would be overwritten', async () => {
    const { work, pushFromTeammate } = await fixture();
    await pushFromTeammate('page.txt', 'remote');
    const local = await commit(work, 'local.txt', 'local');

    expect(await pullBranch({ cwd: work, branch })).toMatchObject({ outcome: 'fetchedOnly', behind: 1, ahead: 1 });
    expect(await git(work, ['rev-parse', 'HEAD'])).toBe(local);

    await git(work, ['reset', '--quiet', '--hard', 'HEAD~1']);
    await writeFile(path.join(work, 'page.txt'), 'uncommitted');
    expect((await pullBranch({ cwd: work, branch })).outcome).toBe('fetchedOnly');
    expect(await readFile(path.join(work, 'page.txt'), 'utf8')).toBe('uncommitted');
  });

  it('pushes without checking the branch out, and never forces a rejected push', async () => {
    const { work, remote, pushFromTeammate } = await fixture();
    const local = await commit(work, 'local.txt', 'local');
    await git(work, ['checkout', '--quiet', '-b', 'feature/orders']);

    expect(await pushBranch({ cwd: work, branch })).toMatchObject({ outcome: 'pushed', count: 1, ahead: 0 });
    expect(await git(remote, ['rev-parse', `refs/heads/${branch}`])).toBe(local);
    expect(await pushBranch({ cwd: work, branch })).toMatchObject({ outcome: 'upToDate' });

    const remoteLatest = await pushFromTeammate('page.txt', 'remote');
    await git(work, ['checkout', '--quiet', branch]);
    await commit(work, 'another.txt', 'another');
    expect(await pushBranch({ cwd: work, branch })).toMatchObject({ outcome: 'rejected', behind: 1, ahead: 1 });
    expect(await git(remote, ['rev-parse', `refs/heads/${branch}`])).toBe(remoteLatest);
  });

  it('creates the remote branch when it does not exist yet', async () => {
    const { work, remote } = await fixture();
    await git(work, ['checkout', '--quiet', '-b', 'release/2.0.0']);
    const head = await commit(work, 'next.txt', 'next');

    expect(await branchStatus({ cwd: work, branch: 'release/2.0.0' })).toMatchObject({
      state: 'remoteBranchMissing',
      ahead: 2,
    });
    expect(await pushBranch({ cwd: work, branch: 'release/2.0.0' })).toMatchObject({ outcome: 'pushed' });
    expect(await git(remote, ['rev-parse', 'refs/heads/release/2.0.0'])).toBe(head);
  });

  it('reports why a branch cannot be checked instead of throwing', async () => {
    const { root, work } = await fixture();
    await git(work, ['remote', 'remove', 'company']);

    expect(await pullBranch({ cwd: work, branch })).toMatchObject({ state: 'noRemote', outcome: 'skipped' });
    expect(await branchStatus({ cwd: path.join(root, 'missing'), branch })).toMatchObject({ state: 'noRepository' });
  });

  it('keeps the developer environment, such as a custom SSH command', async () => {
    const { work, pushFromTeammate } = await fixture();
    await pushFromTeammate('page.txt', 'v2');

    const status = await branchStatus({ cwd: work, branch, env: { GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' } });
    expect(status).toMatchObject({ state: 'ok', behind: 1 });
  });
});
