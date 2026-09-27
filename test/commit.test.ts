import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { changedFiles, commit, createTag, type GitOptions } from '../src/index.js';
import { branch, commit as commitFile, fixture, git, identity } from './fixture.js';

// Commits and annotated tags need an identity; the fixture does not rely on the machine's global configuration.
const options = (cwd: string): GitOptions => ({ cwd, env: identity });

describe('commits', () => {
  it('commits only the given paths and keeps the message as written', async () => {
    const { work } = await fixture();
    await writeFile(path.join(work, 'meta.json'), '{"release":"1.0.0"}');
    await git(work, ['add', 'meta.json']);
    await commitFile(work, 'base.txt', 'base');
    await writeFile(path.join(work, 'meta.json'), '{"release":"1.0.1"}');
    await writeFile(path.join(work, 'page.txt'), 'work in progress');
    await git(work, ['add', 'page.txt']);
    const message = 'chore(release): 1.0.1\n\n- app-a 1.0.0 → 1.0.1\n#123 kept';

    const sha = await commit({ ...options(work), message, paths: ['meta.json'] });

    expect(await git(work, ['rev-parse', 'HEAD'])).toBe(sha);
    expect(await git(work, ['show', '--name-only', '--format=', sha])).toBe('meta.json');
    expect(await git(work, ['log', '-1', '--format=%B', sha])).toBe(message);
    // The other change is still staged and in the worktree.
    expect(await git(work, ['diff', '--cached', '--name-only'])).toBe('page.txt');
    expect(await readFile(path.join(work, 'page.txt'), 'utf8')).toBe('work in progress');
  });
});

describe('changed files', () => {
  it('lists modified, new, deleted and renamed files, but not ignored ones', async () => {
    const { work } = await fixture();
    await writeFile(path.join(work, '.gitignore'), 'dev.local.jsonc\n');
    await writeFile(path.join(work, 'old name.json'), '{}');
    await writeFile(path.join(work, 'gone.json'), '{}');
    await git(work, ['add', '.']);
    await commitFile(work, 'base.txt', 'base');

    await writeFile(path.join(work, 'page.txt'), 'changed');
    await mkdir(path.join(work, 'locales'));
    await writeFile(path.join(work, 'locales/zh-CN.json'), '{}');
    await rm(path.join(work, 'gone.json'));
    await git(work, ['mv', 'old name.json', 'new name.json']);
    await writeFile(path.join(work, 'dev.local.jsonc'), '{}');

    expect((await changedFiles({ cwd: work })).sort()).toEqual(
      ['gone.json', 'locales/zh-CN.json', 'new name.json', 'page.txt'].sort()
    );
  });

  it('commits new and deleted files too', async () => {
    const { work } = await fixture();
    await writeFile(path.join(work, 'gone.json'), '{}');
    await git(work, ['add', '.']);
    await commitFile(work, 'base.txt', 'base');
    await rm(path.join(work, 'gone.json'));
    await writeFile(path.join(work, 'menu.config.json'), '[]');

    const sha = await commit({
      ...options(work),
      message: 'chore(release): 1.0.1',
      paths: ['gone.json', 'menu.config.json'],
    });

    expect((await git(work, ['show', '--name-status', '--format=', sha])).split('\n').sort()).toEqual([
      'A\tmenu.config.json',
      'D\tgone.json',
    ]);
    expect(await changedFiles({ cwd: work })).toEqual([]);
  });
});

describe('pushing a branch with its tag', () => {
  it('pushes the branch and the tag together', async () => {
    const { work, remote } = await fixture();
    const head = await commitFile(work, 'release.txt', 'release');

    await createTag({ ...options(work), name: '2.0.0', commit: head, push: { remote: 'company', branch } });

    expect(await git(remote, ['rev-parse', `refs/heads/${branch}`])).toBe(head);
    expect(await git(remote, ['rev-parse', 'refs/tags/2.0.0^{commit}'])).toBe(head);
  });

  it('pushes neither when the remote branch moved on, and removes the local tag', async () => {
    const { work, remote, pushFromTeammate } = await fixture();
    const remoteHead = await pushFromTeammate('page.txt', 'teammate');
    const head = await commitFile(work, 'release.txt', 'release');

    await expect(
      createTag({ ...options(work), name: '2.0.0', commit: head, push: { remote: 'company', branch } })
    ).rejects.toThrow();

    expect(await git(remote, ['rev-parse', `refs/heads/${branch}`])).toBe(remoteHead);
    expect(await git(remote, ['tag', '--list', '2.0.0'])).toBe('');
    expect(await git(work, ['tag', '--list', '2.0.0'])).toBe('');
    // The local commit is kept for the developer to reconcile.
    expect(await git(work, ['rev-parse', 'HEAD'])).toBe(head);
  });
});
