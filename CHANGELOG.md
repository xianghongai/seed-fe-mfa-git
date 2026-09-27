# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.1.1

### Patch Changes

- [`4ce8626`](https://github.com/xianghongai/seed-fe-mfa-git/commit/4ce86266011e26e97725318147d0f82cd9ec4b73) Thanks [@xianghongai](https://github.com/xianghongai)! - List and commit changed files, and push a branch together with its tag.

  - `changedFiles({ cwd })` lists modified, new, deleted and renamed files, leaving out ignored ones.
  - `commit({ cwd, message, paths })` commits only the given paths, new and deleted ones included, leaves every other staged or unstaged change as it was, keeps the message as written and returns the new commit SHA.
  - `createTag({ push: { remote, branch } })` pushes the branch and the tag in one atomic push, never forcing the branch: either both reach the remote or neither does, and the local tag is rolled back on failure.

## 0.1.0

- Repository questions: root, current branch, remote (upstream, then the only remote; never assumes origin), commits and tags.
- Branch status with behind and ahead counts; fast-forward-only pull that never switches branches; push that never forces.
- Tags: lightweight or annotated, overwrite on request, pushed with rollback when the push fails.
- Clone a branch, or check out a single tag into an empty directory.
- Release versions following the MFA naming conventions: patch levels, maturity and customer editions, grouped into product lines; the next iteration and the next maturity stage (alpha → beta → rc → release). `+` is rejected, as Docker image tags do not allow it.
