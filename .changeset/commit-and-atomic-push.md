---
'@seed-fe/mfa-git': patch
---

List and commit changed files, and push a branch together with its tag.

- `changedFiles({ cwd })` lists modified, new, deleted and renamed files, leaving out ignored ones.
- `commit({ cwd, message, paths })` commits only the given paths, new and deleted ones included, leaves every other staged or unstaged change as it was, keeps the message as written and returns the new commit SHA.
- `createTag({ push: { remote, branch } })` pushes the branch and the tag in one atomic push, never forcing the branch: either both reach the remote or neither does, and the local tag is rolled back on failure.
