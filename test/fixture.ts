import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach } from 'vitest';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

export const branch = 'release/1.0.0';

/** Identity for fixture commits and annotated tags, independent of the machine's global Git configuration. */
export const identity = {
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
};

export const git = async (cwd: string, args: string[]): Promise<string> =>
  (
    await execFileAsync('git', ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], {
      cwd,
      env: { ...process.env, ...identity },
    })
  ).stdout.trim();

export const commit = async (cwd: string, file: string, content: string): Promise<string> => {
  await writeFile(path.join(cwd, file), content);
  await git(cwd, ['add', '.']);
  await git(cwd, ['commit', '--quiet', '-m', `update ${file}`]);
  return git(cwd, ['rev-parse', 'HEAD']);
};

/**
 * A working repository on `branch`, tracking a bare remote that is deliberately not named origin,
 * and a teammate clone for pushing new commits to that remote.
 */
export async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'seed-fe-mfa-git-'));
  roots.push(root);
  const remote = path.join(root, 'remote.git');
  await mkdir(remote);
  await git(remote, ['init', '--bare', '--quiet']);
  const work = path.join(root, 'work');
  await mkdir(work);
  await git(work, ['init', '--quiet']);
  await git(work, ['checkout', '--quiet', '-b', branch]);
  await commit(work, 'page.txt', 'v1');
  await git(work, ['remote', 'add', 'company', remote]);
  await git(work, ['push', '--quiet', '-u', 'company', branch]);

  const teammate = path.join(root, 'teammate');
  await git(root, ['clone', '--quiet', '--branch', branch, remote, teammate]);
  const pushFromTeammate = async (file: string, content: string) => {
    await git(teammate, ['pull', '--quiet', '--ff-only']);
    const sha = await commit(teammate, file, content);
    await git(teammate, ['push', '--quiet', 'origin', branch]);
    return sha;
  };
  return { root, remote, work, pushFromTeammate };
}
