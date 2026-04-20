# OAuthTriage

[English README](./README.md)

OAuthTriage 是一个 `local-first` 的 Google Workspace OAuth 授权排查 CLI。

它会扫描活跃用户、列出第三方 OAuth 授权、尽量补充最近 token 活动、按风险优先级排序，然后导出一份 CSV，方便你先审查、再撤销。

## 为什么要 local-first

安全工具最怕一上来就做成：

> “把高权限管理员 token 粘到我的网站里。”

这会直接伤害信任。

OAuthTriage 刻意走更稳的路线：

- 本地运行
- token 留在操作者机器上
- 先导出 CSV
- 撤销是明确的单独命令

## 用到的 Google scopes

```text
https://www.googleapis.com/auth/admin.directory.user.readonly
https://www.googleapis.com/auth/admin.directory.user.security
https://www.googleapis.com/auth/admin.reports.audit.readonly
```

其中 Reports scope 是可选的；没有它也能扫，但 `last_activity_at` 往往会为空。

## 安装

直接用 `npx`：

```bash
npx oauthtriage sample --out oauthtriage-sample.csv
```

或者全局安装：

```bash
npm install -g oauthtriage
oauthtriage sample --out oauthtriage-sample.csv
```

## 扫描 Workspace

```bash
GOOGLE_ACCESS_TOKEN="ya29..." npx oauthtriage scan --out oauthtriage.csv
```

常用选项：

```bash
GOOGLE_ACCESS_TOKEN="ya29..." npx oauthtriage scan --max-users 25 --out oauthtriage-test.csv
GOOGLE_ACCESS_TOKEN="ya29..." npx oauthtriage scan --no-audit --out oauthtriage.csv
```

审查后撤销一条授权：

```bash
npx oauthtriage revoke \
  --token "ya29..." \
  --user founder@example.com \
  --client 1234567890-abc.apps.googleusercontent.com \
  --yes
```

## 本地 Web UI

仓库里也带了一个 Next.js 本地页面，作为 CLI 的辅助 UI。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。

不要把这个扫描页面直接部署成公网服务，除非你已经准备好做完整的 OAuth 校验、加密存储、审计日志和客户信任建设。

## 输出内容

CSV 的核心目的只有一个：

> 帮你决定先撤哪几个。

最重要的列：

- `risk_level`, `risk_score`
- `action`
- `app_name`, `client_id`, `user_email`
- `sensitive_scopes`
- `last_activity_at`
- `revoke_command`

## 架构图

```text
管理员 token
    -> 本地 CLI / 本地 UI
    -> Google Directory API（用户 + tokens）
    -> Reports API token activity
    -> 风险评分
    -> CSV
```

核心模块：

- `src/lib/scan-options.ts`：外部输入规范化和校验
- `src/lib/google-http.ts`：Google API 请求封装和有边界的重试
- `src/lib/google.ts`：Workspace 扫描编排和审计补充
- `src/lib/risk.ts`：风险评分
- `src/lib/csv.ts`：CSV 序列化
- `cli/oauthtriage.ts`：CLI 入口

## 本地开发

```bash
npm install
npm test
npm run build
```

打包预演：

```bash
npm pack --json --dry-run
```

## Release 流程

这个仓库已经按 tag 发布准备好了：

- 推一个 `v0.1.0` 这样的 tag
- GitHub Actions 跑测试和构建
- 自动创建 GitHub Release，并附上 npm tarball
- npm 发布链已经预留好，等你把 npm 账号和 trusted publishing 配上就能启用

## 安全模型

这个项目刻意做到的事情：

- 必填配置缺失时尽早失败
- 对临时性 Google API 错误做有限重试
- Reports API 不可用时降级继续扫描
- 撤销是显式命令，不做隐式副作用

这个项目刻意不做的事情：

- 不托管你的 token
- 不自动撤销
- 不隐藏它要的 scopes
- 不把内部商业策略或私有运营资料放进公开仓库

## 关于公开仓库

能公开的才放进来，不能公开的就不要放。

公开仓库里不该出现：

- 真实 token
- 客户数据
- 会暴露你本地环境的绝对路径
- 内部定价、外联脚本、未公开商业笔记

这些东西应该留在私有环境，而不是进公开仓库。
