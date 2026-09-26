# @seed-fe/mfa-git

English | [简体中文](README.zh-CN.md)

Git operations and release naming rules for [MFA](https://github.com/xianghongai/seed-fe-mfa) workspaces, used by the `mfa` CLI and the VS Code extension. Git runs on the `git` command line through [simple-git](https://github.com/steveukx/git-js). Authentication, SSH keys, credential helpers and proxies all stay with the developer's own Git setup; nothing here asks for or stores credentials, and no hosting service API is involved.

- Pulls only fetch and fast-forward, and never switch branches. When git refuses to fast-forward, the result says so instead of throwing.
- Pushes never force. A rejected push is a result, not an exception.
- Remotes are resolved from the branch upstream, then the only remote of the repository. The name is never assumed to be `origin`.
- ES modules only, for Node.js.

## Install

```sh
npm install @seed-fe/mfa-git
```

## Usage

Every function takes the directory to run in as `cwd`, plus optional `env`, `signal`, `onCommand` and `onOutput`:

- `env` is merged over `process.env`, for example to add an outbound proxy. `GIT_TERMINAL_PROMPT=0` is always set, so git never waits for a password prompt.
- `signal` cancels the running git process.
- `onCommand` receives each command line before it runs; `onOutput` receives stdout and stderr as they arrive.

```ts
import { branchStatus, pullBranch, pushBranch } from '@seed-fe/mfa-git';

const status = await branchStatus({ cwd: '/path/to/repo', branch: 'release/1.0.0' });
// { branch, remote: 'upstream', state: 'ok', behind: 2, ahead: 1 }

const pulled = await pullBranch({ cwd: '/path/to/repo', branch: 'release/1.0.0' });
// outcome: 'updated' | 'upToDate' | 'fetchedOnly' | 'skipped'

const pushed = await pushBranch({ cwd: '/path/to/repo', branch: 'release/1.0.0' });
// outcome: 'pushed' | 'upToDate' | 'rejected' | 'skipped'
```

### Branches

| Function                        | What it does                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `branchStatus({ cwd, branch })` | Fetches, then counts commits `behind` and `ahead` of the remote branch. Changes no local branch or file.                |
| `pullBranch({ cwd, branch })`   | Fetches, then fast-forwards: `merge --ff-only` when the branch is checked out, otherwise only the branch pointer moves. |
| `pushBranch({ cwd, branch })`   | Pushes the branch to the remote branch of the same name without checking it out, creating it when missing.              |

`state` explains when a branch cannot be checked: `noRepository`, `noRemote`, `remoteBranchMissing` or `failed` (with `message`).

### Tags

```ts
import { createTag } from '@seed-fe/mfa-git';

await createTag({
  cwd: '/path/to/repo',
  name: '1.2.0',
  commit: 'a1b2c3d',
  message: 'Release notes\n\n#123 fixed paging', // optional: creates an annotated tag
  force: true, // optional: overwrite an existing tag, on the remote too
  push: { remote: 'upstream' }, // optional
});
```

The message is kept as written, including lines starting with `#`. When the push fails, the local tag is removed, or restored when it was overwritten.

### Sources

| Function                                          | What it does                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `clone({ url, directory, branch?, submodules? })` | Clones into `directory`, creating its parents. Submodules are included by default.                    |
| `checkoutTag({ url, tag, directory })`            | Shallow-fetches one tag by URL and checks it out as a detached HEAD, with submodules. Adds no remote. |

### Release versions

Versions follow the MFA naming conventions: an optional `v` prefix (a Tag equals `release.version`), the base version, a patch level (`HP`, `CP` or `SP`, for projects), the maturity (`alpha`, `beta` or `rc`; none once released) and, always last, a customer edition `C<customer>` with its delivery batch `-U<n>`. For example `1.7.1-alpha.3`, `2.6.0.SP1-rc.1` and `1.7.1-rc.1.CICBC-U2`. Every version is a valid Docker image tag, so `+` is rejected.

```ts
import { releaseCandidates } from '@seed-fe/mfa-git';

releaseCandidates('1.7.1-alpha.3.CICBC-U2');
// { ok: true, candidates: { iterate: '1.7.1-alpha.4.CICBC-U2', advance: { stage: 'beta', version: '1.7.1-beta.1.CICBC-U2' } } }
```

Only the maturity moves; patch levels and customer editions are planned by the project and kept as written. A released version, a version with `+` and an invalid one give `released`, `plusNotAllowed` and `versionInvalid`. `parseReleaseVersion`, `formatReleaseVersion`, `releaseLine` and `compareReleaseVersions` read, write, group and order versions; only versions of the same line (base, patch level and customer edition) are compared.

### Repository

| Function                                                   | Returns                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `isRepositoryRoot({ cwd })`                                | Whether `cwd` is itself a repository root, not a directory inside an outer repository |
| `currentBranch({ cwd })`                                   | The checked-out branch; `undefined` on a detached HEAD                                |
| `resolveRemote({ cwd, branch? })`                          | The branch upstream remote, otherwise the only remote                                 |
| `remoteUrl({ cwd, remote?, branch? })`                     | URL of the given or resolved remote                                                   |
| `resolveCommit({ cwd, ref })` / `commitInfo({ cwd, ref })` | Commit SHA; or `{ sha, shortSha, subject }`                                           |
| `mergedTags({ cwd, ref })` / `tagExists({ cwd, name })`    | Tags reachable from a ref; whether a tag exists                                       |
| `sameTree({ cwd, a, b })`                                  | Whether two refs have the same content                                                |
| `worktreeChanges({ cwd })`                                 | Number of tracked files with uncommitted changes                                      |

`createGit(options)` gives the underlying runner (`run` and `probe`) for commands not covered here.

## Environment

simple-git rejects environment variables such as `GIT_SSH_COMMAND`, `GIT_ASKPASS`, `GIT_CONFIG_*` and even `PAGER` by default. This package runs fixed commands and uses the developer's own environment, so those checks are turned off for environment and configuration categories only.

## License

[MIT](LICENSE)
