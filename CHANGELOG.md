# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.1.0

- Repository questions: root, current branch, remote (upstream, then the only remote; never assumes origin), commits and tags.
- Branch status with behind and ahead counts; fast-forward-only pull that never switches branches; push that never forces.
- Tags: lightweight or annotated, overwrite on request, pushed with rollback when the push fails.
- Clone a branch, or check out a single tag into an empty directory.
- Release versions following the MFA naming conventions: patch levels, maturity and customer editions, grouped into product lines; the next iteration and the next maturity stage (alpha → beta → rc → release). `+` is rejected, as Docker image tags do not allow it.
