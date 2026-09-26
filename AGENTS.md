# AGENTS.md

## 职责

- `@seed-fe/mfa-git`（仓库与目录名 `seed-fe-mfa-git`）为 MFA 服务：本地 Git 操作（仓库查询、分支状态、拉取只快进、推送不强推、Tag、克隆与检出 Tag），以及 MFA 的发布命名规则（`src/release-version.ts` 的版本计算）。`mfa` CLI（`@seed-fe/mfa`）与 VS Code 扩展都通过它执行 Git。
- 命名规则以《微前端 6 - 命名规范与仓库规划》为准；后续的迭代分支名、迭代版本名校验也放在这里，按文档中的 BNF 实现。版本按文档 BNF 解析（`src/release-version.ts`，不依赖 semver）：基线、补丁（HP/CP/SP）、成熟度（alpha/beta/rc）、客户定制（`C<代号>-U<批次>`），定制段始终在最后，与 Docker 镜像 Tag 的变体习惯一致；禁止 `+`。只推进成熟度，补丁与定制段原样保留，不自动递增 U 与 SP，正式版之后不推算。版本只在同一条产品线（`releaseLine`：基线、补丁、定制）内比较，标准版与定制版、不同客户互不串线。
- 不读写 `meta.json`，也不依赖 `@seed-fe/mfa`（核心依赖本包，反向依赖会成环）；按 meta.json 解析目标与写回版本由核心和扩展负责。与只负责地址解析的 `git-meta-up` 互不依赖。
- 不调用托管平台 API，不处理认证：SSH、凭据助手、askpass、代理都沿用开发者本机的 Git 配置与环境变量。`GIT_TERMINAL_PROMPT=0` 始终设置，不交互等待输入。
- 底层用 simple-git 执行本机 `git`。simple-git 默认拒绝开发者环境中的 `GIT_SSH_COMMAND`、`PAGER` 等变量，4.x 的环境守卫还会对显式传入的受保护变量报错、对继承来的悄悄删除；本包的命令与参数都由代码固定，环境是开发者自己的，所以把传给 git 的全部变量列入 `allowEnvironment`，并只对环境变量与配置类别开启 `unsafe` 放行（`src/git.ts`），不开启协议覆盖、`upload-pack` 等参数类别。
- 按“能做就做、风险只报告”：拉取无法快进返回 `fetchedOnly`，推送被拒绝返回 `rejected`，无法检查时用 `state` 说明；只有调用方给出的操作本身失败（如克隆失败、Tag 已存在且未要求覆盖）才抛错。
- 不切换分支、不强推、不改上游配置；远程按分支上游、其次唯一远程解析，不写死 origin。

## 结构

- `src/git.ts`：`createGit` 创建 simple-git 客户端（环境、取消、输出回调），提供 `run` 与 `probe`。
- `src/repository.ts`：只读查询。
- `src/sync.ts`：`branchStatus`、`pullBranch`、`pushBranch`。
- `src/tag.ts`：`createTag`（附注、覆盖、推送与失败回滚）。
- `src/clone.ts`：`clone`、`checkoutTag`。
- `src/release-version.ts`：发布版本的解析、格式化、产品线、同线比较与候选计算（下一迭代、进入下一阶段）。测试按文档的版本对象与场景逐项覆盖，并校验每个版本都是合法的 Docker 镜像 Tag。

## 约定

- 代码注释与测试描述用英文。测试用临时目录中的真实仓库，远程故意不叫 origin；身份通过环境变量注入，不依赖本机全局配置。
- 示例与测试数据只用占位值（`example.invalid`、`/path/to/repo`），不写入真实仓库、账号或内网地址。
- 版本与变更日志用 Changesets：用户可见的改动运行 `pnpm changeset`，不手改版本号与 `CHANGELOG.md`。
- 工作流只调用约定的脚本：`format:check`、`lint`、`check-types`、`test`、`release`；没有演示页，不提供 `site:build`。
- 不执行提交、推送、发布；npm 可信发布由维护者在平台上配置。

## 验证

- `pnpm check-types`、`pnpm lint`、`pnpm format:check`、`pnpm test`、`pnpm build`；发布前 `npm pack --dry-run` 确认只包含 `dist`、README、LICENSE 与 `package.json`。
