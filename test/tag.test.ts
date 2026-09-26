import { describe, expect, it } from 'vitest';
import { createTag, type GitOptions } from '../src/index.js';
import { commit, fixture, git, identity } from './fixture.js';

// Annotated tags need an identity; the fixture does not rely on the machine's global configuration.
const options = (cwd: string): GitOptions => ({ cwd, env: identity });

describe('tags', () => {
  it('creates a lightweight tag, or an annotated one with the message kept as written', async () => {
    const { work, remote } = await fixture();
    const head = await git(work, ['rev-parse', 'HEAD']);

    await createTag({ ...options(work), name: '1.0.0-alpha.1', commit: head });
    expect(await git(work, ['cat-file', '-t', 'refs/tags/1.0.0-alpha.1'])).toBe('commit');

    const message = 'Orders export\n\n#123 fixed paging';
    const result = await createTag({
      ...options(work),
      name: '1.0.0-alpha.2',
      commit: head,
      message: `  ${message}\n`,
      push: { remote: 'company' },
    });
    expect(result).toEqual({ name: '1.0.0-alpha.2', commit: head, overwritten: false, pushed: true });
    expect(await git(remote, ['cat-file', '-t', 'refs/tags/1.0.0-alpha.2'])).toBe('tag');
    expect(await git(remote, ['tag', '--list', '--format=%(contents)', '1.0.0-alpha.2'])).toBe(message);
  });

  it('overwrites an existing tag only when forced, on the remote too', async () => {
    const { work, remote } = await fixture();
    const first = await git(work, ['rev-parse', 'HEAD']);
    await createTag({ ...options(work), name: '1.0.0', commit: first, push: { remote: 'company' } });
    const fixed = await commit(work, 'fix.txt', 'fix');

    await expect(createTag({ ...options(work), name: '1.0.0', commit: fixed })).rejects.toThrow('already exists');
    const result = await createTag({
      ...options(work),
      name: '1.0.0',
      commit: fixed,
      force: true,
      push: { remote: 'company' },
    });
    expect(result.overwritten).toBe(true);
    expect(await git(work, ['rev-parse', 'refs/tags/1.0.0^{commit}'])).toBe(fixed);
    expect(await git(remote, ['rev-parse', 'refs/tags/1.0.0^{commit}'])).toBe(fixed);
  });

  it('leaves local tags as they were when the push fails', async () => {
    const { work } = await fixture();
    const first = await git(work, ['rev-parse', 'HEAD']);
    await createTag({ ...options(work), name: '1.0.0', commit: first });
    const original = await git(work, ['rev-parse', 'refs/tags/1.0.0']);
    const fixed = await commit(work, 'fix.txt', 'fix');
    const unreachable = { remote: 'missing-remote' };

    await expect(createTag({ ...options(work), name: '1.0.1', commit: fixed, push: unreachable })).rejects.toThrow();
    expect(await git(work, ['tag', '--list', '1.0.1'])).toBe('');

    await expect(
      createTag({ ...options(work), name: '1.0.0', commit: fixed, force: true, push: unreachable })
    ).rejects.toThrow();
    expect(await git(work, ['rev-parse', 'refs/tags/1.0.0'])).toBe(original);
  });
});
