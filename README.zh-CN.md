# @seed-fe/mfa-git

[English](README.md) | 简体中文

[MFA](https://github.com/xianghongai/seed-fe-mfa) 工作区的 Git 操作与发布命名规则，供 `mfa` 命令行和 VS Code 扩展使用。Git 通过 [simple-git](https://github.com/steveukx/git-js) 调用本机的 `git` 命令行。认证、SSH 密钥、凭据助手和代理全部沿用开发者自己的 Git 配置：本包不索取、不保存凭据，也不调用任何托管平台的 API。

- 拉取只获取和快进，不切换分支。Git 拒绝快进时在结果中说明，不抛错。
- 推送不强推，被远程拒绝时作为结果返回，不抛错。
- 远程按分支的上游解析，其次是仓库唯一的远程，不假定叫 `origin`。
- 只提供 ES 模块，用于 Node.js。

## 安装

```sh
npm install @seed-fe/mfa-git
```

## 使用

每个函数都用 `cwd` 指定运行目录，可选 `env`、`signal`、`onCommand`、`onOutput`：

- `env` 合并到 `process.env` 之上，例如加入出站代理。始终设置 `GIT_TERMINAL_PROMPT=0`，Git 不会停下来等待输入密码。
- `signal` 取消正在运行的 Git 进程。
- `onCommand` 在每条命令运行前收到命令行；`onOutput` 实时收到标准输出和标准错误。

```ts
import { branchStatus, pullBranch, pushBranch } from '@seed-fe/mfa-git';

const status = await branchStatus({ cwd: '/path/to/repo', branch: 'release/1.0.0' });
// { branch, remote: 'upstream', state: 'ok', behind: 2, ahead: 1 }

const pulled = await pullBranch({ cwd: '/path/to/repo', branch: 'release/1.0.0' });
// outcome: 'updated' | 'upToDate' | 'fetchedOnly' | 'skipped'

const pushed = await pushBranch({ cwd: '/path/to/repo', branch: 'release/1.0.0' });
// outcome: 'pushed' | 'upToDate' | 'rejected' | 'skipped'
```

### 分支

| 函数                            | 作用                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `branchStatus({ cwd, branch })` | 获取远程后，统计落后（`behind`）与领先（`ahead`）的提交数。不改动本地分支和文件。 |
| `pullBranch({ cwd, branch })`   | 获取远程后快进：分支已检出时 `merge --ff-only`，否则只移动分支指针。              |
| `pushBranch({ cwd, branch })`   | 不检出分支，把它推送到远程同名分支；远程没有时创建。                              |

无法检查时，`state` 说明原因：`noRepository`、`noRemote`、`remoteBranchMissing`，或 `failed`（附 `message`）。

### Tag

```ts
import { createTag } from '@seed-fe/mfa-git';

await createTag({
  cwd: '/path/to/repo',
  name: '1.2.0',
  commit: 'a1b2c3d',
  message: 'Release notes\n\n#123 fixed paging', // 可选：创建附注 Tag
  force: true, // 可选：覆盖已有的同名 Tag，远程同样覆盖
  push: { remote: 'upstream' }, // 可选
});
```

说明原样保留，包括以 `#` 开头的行。推送失败时，新建的本地 Tag 被删除；覆盖的则恢复原状。传入 `push: { remote, branch }` 时，分支与 Tag 在同一次原子推送中推送（分支不强推），发布提交与它的 Tag 要么一起到达远程，要么都不改动。

`commit({ cwd, message, paths })` 只提交指定文件（包括新增和删除的），其他已暂存或未暂存的改动保持原样，返回新提交的 SHA。`changedFiles({ cwd })` 列出有改动的文件（修改、新增、删除、重命名，不含被忽略的文件）。

### 源码

| 函数                                              | 作用                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `clone({ url, directory, branch?, submodules? })` | 克隆到 `directory`，自动创建上级目录；默认包含子模块。           |
| `checkoutTag({ url, tag, directory })`            | 按地址浅获取单个 Tag，检出为分离 HEAD 并更新子模块；不添加远程。 |

### 发布版本

版本遵循 MFA 命名规范：可选的 `v` 前缀（Tag 与 `release.version` 完全一致）、基线版本、补丁（`HP`、`CP`、`SP`，仅项目）、成熟度（`alpha`、`beta`、`rc`，正式版没有），以及始终在最后的客户定制 `C<客户代号>` 与更新批次 `-U<n>`。例如 `1.7.1-alpha.3`、`2.6.0.SP1-rc.1`、`1.7.1-rc.1.CICBC-U2`。每个版本都是合法的 Docker 镜像 Tag，因此不允许 `+`。

```ts
import { releaseCandidates } from '@seed-fe/mfa-git';

releaseCandidates('1.7.1-alpha.3.CICBC-U2');
// { ok: true, candidates: { iterate: '1.7.1-alpha.4.CICBC-U2', advance: { stage: 'beta', version: '1.7.1-beta.1.CICBC-U2' } } }
```

只推进成熟度；补丁与客户定制由项目规划，原样保留。正式版、含 `+` 的版本和不合规的版本分别返回 `released`、`plusNotAllowed`、`versionInvalid`。`parseReleaseVersion`、`formatReleaseVersion`、`releaseLine`、`compareReleaseVersions` 用于解析、格式化、划分产品线与排序；只比较同一产品线（基线、补丁、客户定制）内的版本。

### 仓库

| 函数                                                       | 返回                                             |
| ---------------------------------------------------------- | ------------------------------------------------ |
| `isRepositoryRoot({ cwd })`                                | `cwd` 本身是否为仓库根，而不是外层仓库里的子目录 |
| `currentBranch({ cwd })`                                   | 当前分支；分离 HEAD 时为 `undefined`             |
| `resolveRemote({ cwd, branch? })`                          | 分支上游的远程，否则为唯一的远程                 |
| `remoteUrl({ cwd, remote?, branch? })`                     | 指定或解析出的远程地址                           |
| `resolveCommit({ cwd, ref })` / `commitInfo({ cwd, ref })` | 提交 SHA；或 `{ sha, shortSha, subject }`        |
| `mergedTags({ cwd, ref })` / `tagExists({ cwd, name })`    | 从某个引用可达的 Tag；Tag 是否存在               |
| `sameTree({ cwd, a, b })`                                  | 两个引用的内容是否相同                           |
| `worktreeChanges({ cwd })`                                 | 有未提交改动的已跟踪文件数                       |

其它命令可以用 `createGit(options)` 取得底层的执行器（`run` 与 `probe`）。

## 环境变量

simple-git 默认拒绝 `GIT_SSH_COMMAND`、`GIT_ASKPASS`、`GIT_CONFIG_*`，甚至普通的 `PAGER` 等环境变量。本包执行的命令都是固定的，使用的是开发者自己的环境，因此只对环境变量与配置相关的类别关闭了这些检查。

## License

[MIT](LICENSE)
