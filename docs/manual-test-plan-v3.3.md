# Picot v3.3-new-arch 手工测试计划

> 基于 24 个 cherry-pick commit 的迁移内容，覆盖每个新增/移植功能的验收测试。

---

## 测试前准备

### 环境

```bash
cd /Users/linyong/tmp/PI/picot-public-v3.3
bun run dev
```

确认窗口打开，能看到主界面（聊天 + 侧边栏）。如果启动失败，检查：
- `src-tauri/resources/pi/` 是否存在（`bun run fetch:pi`）
- `extensions/dist/` 是否有 `.mjs` 文件（`bun run build:extensions`）

### 测试项目矩阵

| 编号 | 功能 | commit | 优先级 | 预计耗时 |
|---|---|---|---|---|
| T1 | Git 工作区面板 | `01abfc0` | P0 | 15 min |
| T2 | Rust 语法高亮 | `d4cd64f` | P1 | 5 min |
| T3 | Skills 三标签页 | `cb97fac` | P0 | 15 min |
| T4 | Skills 安全安装流程 | `84d851d` | P1 | 10 min |
| T5 | Session UI 状态持久化 | `3afb2ae` | P1 | 5 min |
| T6 | Compact 生命周期 | `6c4221b` | P1 | 5 min |
| T7 | Thinking level 动态 | `9efd665` | P2 | 5 min |
| T8 | 图标系统 + Header 状态栏 | `3f89f10` | P2 | 5 min |
| T9 | i18n / 多语言 | 全部 | P1 | 10 min |
| T10 | 会话用量聚合 | `5bb91dd` | P2 | 5 min |

---

## T1: Git 工作区面板（P0）

### 背景

这是最大的移植工作。原始 v3 通过旧 `broker_ws` 协议实现，移植后改为 v0.3.3 的 `/v2/ws` HostRouter `RoutedAction::Git`。

### 测试步骤

#### T1.1 打开 Git 面板

1. 在工作区中打开任意 Git 仓库（有 `.git` 目录的项目）
2. 点击右侧边栏的 **Files** 按钮（文件浏览器）
3. 确认看到 **Files / Git** 两个 tab 切换按钮
4. 点击 **Git** tab

**预期**：
- Git 面板显示，文件列表隐藏
- 显示当前分支名、upstream、ahead/behind 计数
- 显示 4 个分组：Staged / Changes / Untracked / Conflicted（有内容时）
- 无内容时显示 "No Git status loaded" 或空状态

#### T1.2 查看状态

1. 在仓库中做一些修改（改文件、新建文件、`git add`）
2. 点击 **Refresh** 按钮

**预期**：
- Staged 组显示已暂存的文件
- Changes 组显示未暂存的修改
- Untracked 组显示新文件
- 每个文件显示图标 + 文件名
- 底部统计栏显示 `+N −M · Staged X · Changes Y · Untracked Z`

#### T1.3 查看文件 diff

1. 点击任意一个有修改的文件

**预期**：
- 文件预览面板切换到 diff 视图
- 左右两列对比（Original / Modified）
- 新增行绿色背景，删除行红色背景
- 行号显示
- 顶部显示文件路径和比较类型（staged/changes/untracked）

#### T1.4 Stage / Unstage 操作

1. 在 Changes 组中选中一个文件
2. 点击 **Stage** 按钮
3. 确认文件移动到 Staged 组

4. 在 Staged 组中选中一个文件
5. 点击 **Unstage** 按钮
6. 确认文件回到 Changes 组

#### T1.5 AI 提交信息生成

1. 确保至少有一个 staged 文件
2. 点击 **Generate AI commit message** 按钮

**预期**：
- 显示加载状态
- 几秒后显示 AI 生成的中文提交信息
- 提交对话框打开，消息预填充

**注意**：此功能依赖 `git_pi_runner.rs` 调用嵌入式 Pi。如果 Pi 未正确配置 API key，会显示错误信息。这是预期行为。

#### T1.6 提交操作

1. 在提交对话框中输入提交信息（或用 AI 生成的）
2. 点击 **Commit**

**预期**：
- 显示 "Committing..." 状态
- 提交完成后显示成功/失败结果
- 刷新 Git 状态

#### T1.7 Git tab 与 Files tab 切换

1. 在 Git tab 和 Files tab 之间反复切换
2. 确认：
   - 切换时面板内容正确显示/隐藏
   - Git 面板打开时刷新状态
   - Files 面板恢复到之前的目录浏览位置

#### T1.8 非 Git 仓库

1. 打开一个没有 `.git` 的目录
2. 切换到 Git tab

**预期**：
- 显示空状态或错误信息，不崩溃

---

## T2: Rust 语法高亮（P1）

### 步骤

1. 打开一个 `.rs` 文件（如 `src-tauri/src/main.rs`）
2. 确认语法高亮正确显示

**预期**：
- `fn`、`pub`、`let`、`use` 等关键字高亮
- 字符串、注释着色
- 跟其他语言（JS、Python）的高亮风格一致

3. 编辑模式确认可编辑

---

## T3: Skills 三标签页架构（P0）

### 背景

这是从 `public/settings/` 移植到 `public/native/settings/` 的架构变更。三个 tab：Discovered / Install / Packages。

### 步骤

#### T3.1 打开 Skills 设置

1. 点击侧边栏 Settings 按钮
2. 点击 **Skills** 导航项

**预期**：
- Skills 面板显示三个 tab：Discovered / Install / Packages
- 默认选中 Discovered tab
- Discovered 面板显示已发现的技能列表

#### T3.2 Discovered tab

1. 确认能看到 Global / Project 两个 scope 切换
2. 每个技能显示：名称、描述、启用/禁用开关
3. 点击开关，确认状态可以切换
4. 点击 **Rescan** 按钮，确认技能列表刷新

#### T3.3 Install tab

1. 点击 **Install** tab

**预期**：
- 显示 "Choose folder" 按钮
- 说明文字："Link skills from a local folder. No files are copied or changed."

2. 点击 "Choose folder"

**预期**：
- 弹出系统文件夹选择器

3. 选择一个包含技能的目录

**预期**：
- 显示 "Scanning skills…"
- 扫描完成后显示找到的技能候选列表
- 可以选择 Global 或 Project scope

**注意**：此功能依赖后端 `skill_source_registry` 的 `scan_source` / `install_links`。当前这些是 placeholder 实现，可能返回错误。如果显示错误信息是已知的迁移限制。

#### T3.4 Packages tab

1. 点击 **Packages** tab

**预期**：
- 显示已安装的 Pi 包及其内置技能候选
- 只读，无开关/操作按钮
- 空状态显示 "No configured packages in this scope."

#### T3.5 Tab 键盘导航

1. 在三个 tab 之间用左右箭头键导航

**预期**：
- 左右箭头切换 tab
- Home 跳到第一个 tab
- End 跳到最后一个 tab
- 当前 tab 获得 focus

---

## T4: Skills 安全安装流程（P1）

### 背景

`skill_source_registry.rs` 提供了 source identity token 认证机制。

### 步骤

1. 在 Install tab 中完成扫描 + 安装流程（如果 T3.3 成功）
2. 确认安装后提示 "Saved. Start a new session or restart Pi for the change to take effect."
3. 新建 session，确认安装的技能在 Discovered tab 中出现

**注意**：后端 `scan_source_static` 和 `install_links_static` 当前是 placeholder。如果返回 "skill source scanning is not yet wired to the native host"，这是已知的迁移状态。后续需要将 v3 的 `main.rs` 中 broker control handler 的安装逻辑移植到 v0.3.3 的 `host_server.rs`。

---

## T5: Session UI 状态持久化（P1）

### 步骤

1. 打开一个 session
2. 在 composer 中输入一些文字（不发送）
3. 切换到另一个 session
4. 切换回原来的 session

**预期**：
- 输入框中的草稿恢复

5. 修改当前 session 的模型选择（如切换到另一个 model）
6. 切换到另一个 session 再切回来

**预期**：
- 模型选择恢复到之前选的

**注意**：`session-ui-state.js` 已添加但未被 `native/app.js` 显式调用。验证时观察 localStorage 中是否有 `picot:session-ui-state:*` 条目。

---

## T6: Compact 生命周期（P1）

### 步骤

1. 在一个有较长历史的 session 中
2. 打开 context usage 弹层（点击头部 context 用量条）
3. 找到 Compact 按钮

**预期**：
- 点击 Compact 后显示确认或进度状态
- compact 完成后 context 用量减少

**注意**：`compact-coordinator.js` 已添加但主要逻辑在 v3 的 `app.js` 中，未移植到 `native/app.js`。compact 的基础功能（通过 runtime command 发起）在 v0.3.3 已有，验证原生 compact 入口是否正常。

---

## T7: Thinking Level 动态（P2）

### 步骤

1. 在 composer 中点击 thinking effort 按钮
2. 确认可以切换 off / minimal / low / medium / high

3. 打开 Settings → General → Thinking effort
4. 确认设置可持久化

**注意**：v3 的按模型动态提供 thinking level 逻辑（`f4e9457`）在 `extensions/embedded-server.ts` 中，已 cherry-pick。但前端 UI 的 `35654e1` 涉及 `public/app.js`（旧入口），只移植了测试文件。

---

## T8: 图标系统 + Header 状态栏（P2）

### 步骤

#### T8.1 图标系统

1. 观察 sidebar 中的文件类型图标
2. 打开文件预览面板，查看 tab 图标
3. 确认图标统一渲染，不是 emoji 混用

#### T8.2 Header 状态栏

1. 在 session 运行时观察 header 区域
2. 确认是否显示 session usage（IN/OUT/CACHE token 计数 + 费用）

**注意**：`header-status-bar.js` 已添加但需要在 `native/app.js` 中挂载才会显示。当前 `native/app.js` 没有显式引用它。验证时查看 header 区域是否有状态栏 DOM 元素。

---

## T9: i18n / 多语言（P1）

### 步骤

#### T9.1 语言切换

1. 打开 Settings → General → Language
2. 切换到中文（中文）
3. 确认界面文案变为中文
4. 切换到 English
5. 确认恢复英文

#### T9.2 Git 面板本地化

1. 切换到中文
2. 打开 Git 面板
3. 确认：分组标题（已暂存/修改/未跟踪/冲突）、按钮文字（刷新/提交/暂存/取消暂存/丢弃）都是中文

#### T9.3 Skills 面板本地化

1. 切换到中文
2. 打开 Skills 设置
3. 确认：三个 tab 名称（已发现/安装/软件包）、描述文字都是中文

#### T9.4 检查 missing key 警告

1. 打开浏览器 DevTools Console（如果可访问）
2. 在各功能间切换
3. 确认控制台无 `[i18n] missing key:` 警告

---

## T10: 会话用量聚合（P2）

### 步骤

1. 发送一条消息给 Pi
2. 等 Pi 回复完成
3. 观察 header 或 session 信息区域

**预期**：
- 显示 token 使用量（input/output/cache）
- 显示 session 费用

**注意**：`aggregateSessionStats` 已在 `extensions/embedded-server.ts` 中实现。前端展示依赖 `header-status-bar.js` 是否被挂载。

---

## 已知迁移限制（测试时请留意）

以下功能已移植文件但未完全接入 v0.3.3 native 架构：

| 功能 | 状态 | 影响 |
|---|---|---|
| Skills 安装扫描/安装 | placeholder 后端 | Install tab 选择文件夹后可能报错 |
| Session UI 状态恢复 | 文件已添加但 `native/app.js` 未调用 | 草稿恢复可能不生效 |
| Compact 协调器 | 文件已添加但 `native/app.js` 未调用 | 手动压缩入口需验证原生路径 |
| Header 状态栏 | 文件已添加但 `native/app.js` 未挂载 | 可能不显示 |
| Thinking level 按模型动态 | extension 已更新但前端 UI 未移植 | 设置可能不跟随模型变化 |

---

## 测试结果记录

| 编号 | 通过? | 备注 |
|---|---|---|
| T1.1 | | |
| T1.2 | | |
| T1.3 | | |
| T1.4 | | |
| T1.5 | | |
| T1.6 | | |
| T1.7 | | |
| T1.8 | | |
| T2 | | |
| T3.1 | | |
| T3.2 | | |
| T3.3 | | |
| T3.4 | | |
| T3.5 | | |
| T4 | | |
| T5 | | |
| T6 | | |
| T7 | | |
| T8.1 | | |
| T8.2 | | |
| T9.1 | | |
| T9.2 | | |
| T9.3 | | |
| T9.4 | | |
| T10 | | |
