# 侧栏 / Title Bar 重构 + Workspace Focus 模式 + 归档删除

- 日期：2026-07-25
- 状态：已实现（含实现偏差，见 §11）
- 作者：Dr. Lin + Mr. Spock
- 相关：`ARCHITECTURE.md`（§前端、§跨端口状态持久化）、`docs/superpowers/specs/2026-07-11-recent-sessions-design.md`

## 1. 背景与目标

Picot 顶部空间利用不充分：聊天 header 的 workspace 路径发现性弱，侧栏 header
把 logo、搜索框、工具按钮挤在一行，且「归档」功能是 localStorage 临时态，
缺少单条删除路径。本次重构在不动进程模型与通讯路径的前提下，重新组织顶部
布局、新增 workspace focus 工作台、补齐归档→删除流程。

**五项需求**

1. 把聊天 header 的当前项目路径移到窗口 title bar 位置。
2. 把侧栏的 toolbar（搜索框 + 工具按钮）移到侧栏 title bar 位置。
3. 在侧栏 logo 右侧显示「Picot Workspace」字样。
4. 双击/显式入口进入当前 active workspace 的 focus 模式，侧栏切换为任务工作台。
5. 归档后的 session 支持单条真实删除（先归档、再删除）。

## 2. 非目标（YAGNI）

- 不做无边框自绘 Windows/Linux 窗口（保留原生装饰）。
- 不补归档区的「取消归档」（un-archive）入口；维持现状。
- Focus 模式不做置顶、批量管理、归档/删除。
- 不改变 session 切换、端口路由、broker 协议。
- 不改 Super Agent / Side Chat / Quick Chat 的现有行为。

## 3. 布局规格

### 3.1 普通模式（macOS）

侧栏顶部由当前的单行 `sidebar-header` 拆成**两行**：

```
┌────────────────────────┬───────────────────────────────────────────┐
│ ●●● [🔍 搜索...] [📁][💬][🔄] │ /Users/.../workspace  [$0.14][31%][git] │ ← title bar (drag)
├────────────────────────┼───────────────────────────────────────────┤
│ [logo] Picot Workspace │                                           │ ← sidebar 内容区
├────────────────────────┤                                           │
│  RECENT                │                                           │
│  PROJECTS              │              聊天消息区                     │
│   ▸ workspace A        │                                           │
│   ▸ workspace B ⬤active│                                           │
│      [focus →]         │                                           │
│  ARCHIVED              │                                           │
│   - session  [🗑删除]  │                                           │
└────────────────────────┴───────────────────────────────────────────┘
```

- **行1（title bar / drag 区）**：
  - 左半（sidebar 侧）：为交通灯留出左 padding（≈ 78px，沿用现有 overlay 适配），
    随后放搜索框 + 3 个工具按钮（打开目录、Quick Chat、刷新会话）。
  - 右半（聊天 header 侧）：workspace 完整绝对路径（见 §4.1）。
  - 整行保留 `-webkit-app-region: drag`；交互控件（input、button）标
    `-webkit-app-region: no-drag`，与现有 `.header-left/.header-right` 一致。
- **行2（sidebar 内容区顶部）**：logo + 「Picot Workspace」字样。不可拖拽窗口。

### 3.2 Focus 模式

```
┌────────────────────────┬───────────────────────────────────────────┐
│ ●●●                    │ /Users/.../workspace  [$0.14][31%][git]    │ ← title bar (drag, 空白)
├────────────────────────┼───────────────────────────────────────────┤
│ [logo] Picot Workspace │                                           │ ← sidebar 内容区（同普通模式）
├────────────────────────┤                                           │
│ [← 返回]               │                                           │
│ workspace B            │                                           │
│ [+ New Task]           │              聊天消息区                     │
│ ─────────────          │                                           │
│ ○ session 1 (active)   │                                           │
│ ○ session 2            │                                           │
│   …显示更多            │                                           │
└────────────────────────┴───────────────────────────────────────────┘
```

- 行1：sidebar 侧仅保留 drag 区与交通灯 padding，**不显示**搜索框和任何工具按钮。
- 行2：logo + 「Picot Workspace」（与普通模式一致，focus 不改这里）。
- 内容区：返回按钮 → workspace 名称 → New Task → session 列表（5 条 + 显示更多）。
- 中央聊天区、右侧文件栏**完全不动**。

### 3.3 平台差异

| 平台 | title bar 处理 |
| --- | --- |
| macOS | 沿用 `TitleBarStyle::Overlay`。§3.1 行1 即 overlay title bar。 |
| Windows / Linux | 保留原生装饰（`decorations(true)`）。行1 仍是 WebView 内顶部 drag 工具栏；workspace 路径用**原生窗口标题** `Picot — <完整路径>` 呈现，由系统截断；聊天 header 不再重复路径。前端直接调用现有 `window.__TAURI__.window.getCurrentWindow().setTitle(...)`（无需自定义 Tauri command），但 `src-tauri/capabilities/default.json` 必须显式加入 `core:window:allow-set-title`；`core:default` 的 window 默认权限不含该 mutator。 |

## 4. 详细设计

### 4.1 #1 路径移至 title bar

- **数据来源不变**：`getCurrentWorkspacePath()`（`app.js:656`）返回当前 foreground
  port 对应的 workspace 路径。
- **DOM（所有平台同构）**：在聊天 header（`.header`）中央放置新的
  `#titlebar-workspace-path` 元素，承载完整绝对路径。仅 `documentElement.macos-overlay`
  （现有 `index.html` 启动脚本已设置）渲染它；非 macOS 默认用 CSS 隐藏该元素，改用原生窗口标题。
  不引入不存在的 Windows/Linux platform class。
- **中间省略**：路径超宽时保留首尾、中间以「…」省略。实现选择**最简可靠方案**：
  路径变更或窗口 resize 时计算可用宽度，逐步把中段替换为「…」；`title` 属性始终
  写入完整路径供悬停查看。不引入第三方截断库。
- **移除原控件**：删除 `app.js:586-592` 创建并插入 `.header-right` 的
  `#workspace-indicator` pill 及其 `updateWorkspaceIndicator()` 更新逻辑（迁移到新元素）。
- **Windows/Linux**：额外调用 `getCurrentWindow().setTitle("Picot — " + path)`；
  header 路径 DOM 用 CSS 隐藏（不渲染重复信息）。此调用依赖 §3.3 的
  `core:window:allow-set-title` capability。
- **后端不变**：路径仍来自前台 port/instance 解析，不新增 REST 端点。

### 4.2 #2 toolbar 移至 title bar

- 把 `index.html` `.sidebar-header` 内的 `#session-search-input`、
  `#session-search-clear`、`.sidebar-actions`（打开目录 / Quick Chat / 刷新按钮）
  从「logo 同行」解耦，放入 §3.1 行1 的 title bar 区。
- 搜索逻辑不变：仍由 `sidebar/search-control.js::setupSidebarSearchControl`
  → `SessionSidebar.setSearchQuery` 驱动。
- Focus 模式下这些控件整体隐藏（见 §4.4）。

### 4.3 #3 「Picot Workspace」字样

- 在 §3.1 行2 logo（`.mode-toggle`）右侧新增一个 `<span class="sidebar-brand">Picot Workspace</span>`。
- 文案走 i18n：新增 key `sidebar.brand`（en/zh）。默认值「Picot Workspace」/「Picot 工作区」。
- 普通 / Focus 模式均显示，不随模式切换变化。

### 4.4 #4 Focus 模式

**组件：新建 `public/sidebar/workspace-focus-sidebar.js`，导出 `WorkspaceFocusSidebar`。**

采用独立组件方案（方案 B）而非给 `SessionSidebar` 加 `focusWorkspaceId` 分支：
focus 是一种不同的页面形态（任务工作台 vs session 管理列表），独立组件边界更清晰。
两者通过共享接口协作，**不复制** session 加载/选中/分页的关键逻辑。

**进入条件（仅 active workspace）**

- active workspace = 其 `sessions` 中包含 `sidebar.activeSessionFile` 的 project。
- focus 入口（按钮 + 双击）**只在该 workspace 行渲染**；其余 workspace 行仅展开/收起。
- 这保证 focus 始终对应当前聊天上下文，避免跨 workspace 端口切换。

**入口**

- workspace 行右侧新增 focus 按钮（chevron/箭头图标），tooltip
  「Enter focus mode」（i18n `workspace.focus`）。
- 双击 workspace 行作为快捷方式（仅 active workspace 生效；非 active 双击仍执行展开/收起）。
- 单击 workspace 整行**保持**现有展开/收起语义。为避免浏览器先派发两次 `click` 再派发
  `dblclick` 造成 focus 前意外改变折叠态，workspace disclosure 对可 focus 的 active 行
  以短暂 deferred single-click 实现：收到 `dblclick` 时取消待执行的展开/收起并进入 focus；
  非 active 行维持立即单击行为。

**WorkspaceFocusSidebar 职责**

| 元素 | 行为 |
| --- | --- |
| 返回按钮 `[←]` | 退出 focus，恢复普通侧栏；保留原展开/收起状态 |
| workspace 名称 | 只读展示 active workspace 的 `folderName` / 完整路径（title） |
| `+ New Task` | 调用现有 `onNewChat(project)`（= New Session，同 workspace 派生可并行 session） |
| session 列表 | 当前 workspace 的**非归档** sessions，先 5 条，超出显示「显示更多」（复用 `buildProjectSessionsToggleRow` 同模式） |
| session 条目 | 通过共享 builder（§7 `build-session-item.js`）构建，传 `showPinButton: false, showArchiveButton: false`（focus 不含置顶/归档操作）；保留 active 高亮、unread/streaming 状态标记；点击走 `onSessionSelect` 切换/打开 |

**Focus 内不提供**：搜索框、打开目录/Quick Chat/刷新按钮、归档区、删除、置顶、
上下文菜单批量归档。

**跨 port 导航与恢复（URL 状态机）**

- focus 状态不写 cookie/localStorage。新增 URL query parameter `focusWorkspaceId`，值由
  `URLSearchParams` 写入（自动 percent-encode）。
- 新增 `navigateFocusAware(targetCwd, url)` / `withFocusParam(targetCwd, url)`：仅当导航目标 cwd
  与当前 focus workspace 相同，才追加当前 `focusWorkspaceId`；跨 workspace 或 targetCwd
  缺失时不追加，因而直观地退出 focus。显式返回也用 `history.replaceState` 删除该参数。
- 这是导航 callback 的契约变更：`workspace/actions.js` 内每个已知 `targetCwd` 的
  `navigate(...)` 调用必须传 `{ targetCwd }`，`app.js::navigateToWorkspacePort` 传其同名参数；
  Super Agent 等没有 workspace 上下文的导航不带该 metadata，故安全地清除 focus。不能只在
  现有 `navigateInWindow(url)` 内从 URL 推断 cwd，因为 target URL 只包含 port。
- boot 时将 query parameter 当作**不可信字符串**读取，先进入 `pending`，不用于路径访问、
  不直接插入 DOM；待 sessions 与 active workspace 均已解析后才以已解析 project 的字段
  （一律 `textContent`）渲染。
- 状态机：`pending`（`activeSessionFile === null` 或项目尚未加载）→ `matched`（active
  workspace ID 相等，进入 focus）／`mismatched`（两者均已知且不等，删除参数并保持普通侧栏）。
  `null` 的短暂新 session 过渡不能触发退出。

**渲染切换与普通侧栏恢复**

- 由 `app.js` 在普通 `SessionSidebar` 容器与 `WorkspaceFocusSidebar` 容器之间切换显示。
  使用同一 `#session-list` 容器替换内容，避免双容器造成布局状态分裂。
- 进入前保存并在返回时恢复：`expandedWorkspaces`、sidebar scrollTop、搜索输入值/
  `searchQuery`；关闭 context menu 与 quick-info overlay（不将 overlay 带入 focus）。
  切换期间取消或忽略已过期的 sidebar load；focus 内 refresh 只更新 focus 组件。
- active workspace 已确定且与 matched focus ID 不同时，移除 URL 参数并退出。

### 4.5 #5 归档 → 删除

**现状（保持不变的部分）**

- 归档态存于 localStorage `pi-studio-archived`（数组 of filePath），不影响 Pi `.jsonl`。
- 归档区 session 用 `buildSessionItem(..., { showArchiveButton: false })` 渲染，无解档 UI。

**改动**

1. **移除「全部删除归档」按钮**：删除 `sidebar/index.js` 归档区 header 中的
   `deleteAllBtn` 构建（约 `:1217-1224`）、`deleteAllArchived()`、
   `confirmArchivedDeletion()`，以及 `style.css` `.archived-delete-all-btn` 规则。
   理由：该按钮仅 hover 显示、无键盘可达性、发现性差。
2. **归档区去置顶，但不改 pin 数据**：`buildSessionItem` 增加选项控制是否渲染 pin 按钮；
   归档区传 `showPinButton: false`。归档不会自动 unpin：session pin 仍保留，未来若增加
   un-archive 会恢复原置顶状态；只有真实删除才移除该 session pin。
3. **归档区加单条删除**：归档区 session 渲染一个删除按钮（trash 图标），
   点击弹二次确认（复用既有 `sidebar.deleteArchivedConfirmOne` / `showFallbackConfirmDialog`）。
   前端可先以 fresh `fetchInstances()` 禁用/提示已知 live session，但这只是 UX 优化，不能作为
   删除安全边界；确认后仍调 `POST /api/sessions/delete-batch`。
   - **服务端强制校验**：`extensions/embedded-server.ts` 的 delete-batch 对每个 filePath 用
     `getRunningInstances()` 检查 `sessionFile`，命中则不 unlink，响应新增 `running: string[]`；
     前端据此显示 i18n 的 running 提示。
   - 只有服务端确认成功删除时，才从 `this.archived`、recent cookie（通过
     `writeRecentSessions` 保持 MRU 顺序）及 pinStore 的 session pins（`unpinSession(filePath)`）
     移除该 filePath，再重渲染。
   - 范围不对称是预期的：归档列表是 per-port localStorage，而 recent/session-pin cookie
     跨端口共享。文件级删除应全局生效，故清理跨端口 cookie 是正确的；归档列表只随当前端口的视图
     移除，不试图跨端口同步（与现状一致），并非遗漏。
4. **归档保护（归档时）**：任何仍由 live instance 持有、当前 active 或正在 streaming 的
   session 禁止归档。
   - `buildSessionItem` 中，当 `session.filePath === activeSessionFile`、
     `streamingFiles.has(filePath)` 或 `liveInstances` 含同一 `sessionFile` 时，archive 按钮
     `disabled` 并显示对应原因（优先级：active → streaming → live instance）。
   - 上下文菜单的「归档本 workspace sessions」批量项同样过滤这些 session。

**遗留（本次不做）**

- 不补 un-archive UI。归档后取消归档仍无入口，维持现状。如后续需要，可在归档区
  给 session 加「恢复」按钮调用现有 `toggleArchived(filePath)`。

## 5. 数据与状态

| 状态 | 位置 | 变化 |
| --- | --- | --- |
| 归档列表 | localStorage `pi-studio-archived` | 不变；删除成功后从中移除 |
| active workspace | 派生：`project` 包含 `activeSessionFile` | 新增派生计算，供 focus 入口与自动退出 |
| focus 模式开/关 | 当前窗口导航 URL 的 `focusWorkspaceId` query parameter | 新增；只随同 workspace 的跨 port 导航传递，不写 cookie/localStorage |
| workspace 路径 | `getCurrentWorkspacePath()` | 不变；渲染目标迁移 |
| 展开状态 | `SessionSidebar.expandedWorkspaces` | focus 进入/退出时保留 |

focus 状态不跨应用启动保存：初始 URL 没有 `focusWorkspaceId` 时从普通侧栏开始；同窗口的
同 workspace 跨 port 导航才携带该参数恢复 focus。

## 6. i18n

新增 key（en/zh；`public/i18n-keys-completeness.test.js` 自动检查 locale parity 与 JS/HTML 字面量引用，无需手工 fixture）：

| key | en | zh |
| --- | --- | --- |
| `sidebar.brand` | Picot Workspace | Picot 工作区 |
| `workspace.focus` | Enter focus mode | 进入专注模式 |
| `workspace.back` | Back | 返回 |
| `workspace.newTask` | New Task | 新任务 |
| `workspace.showMore` | Show more | 显示更多 |
| `sidebar.deleteSession` | Delete | 删除 |
| `sidebar.deleteSessionRunning` | Cannot delete a running session | 无法删除正在运行的会话 |
| `sidebar.archiveDisabledActive` | Cannot archive the active session | 无法归档当前会话 |
| `sidebar.archiveDisabledStreaming` | Cannot archive a streaming session | 无法归档正在流式输出的会话 |
| `sidebar.archiveDisabledRunning` | Cannot archive a running session | 无法归档正在运行的会话 |

## 7. 模块改动清单

**前端（`public/`）**

- 新增 `public/sidebar/build-session-item.js`：从 `SessionSidebar.buildSessionItem`
  提取的共享 DOM builder，接受 `{ showPinButton, showArchiveButton }` 与
  active/unread/streaming/archive 状态及选择/归档回调，返回 session item 元素。
  `SessionSidebar` 与 `WorkspaceFocusSidebar` 共用，避免复制渲染逻辑。
- 新增 `public/sidebar/focus-state.js`：纯函数模块，持有 `focusWorkspaceId` query
  parameter 的读、写、清除、`pending → matched/mismatched` 解析及 `withFocusParam`。
  `app.js` 只提供当前 workspace/导航 adapter，避免把 URL 状态机业务逻辑继续堆入 app.js。
- 新增 `public/sidebar/workspace-focus-sidebar.js`（`WorkspaceFocusSidebar`）。
- 所有新增 `.js` 文件开头均使用两行 `// ABOUTME:` 注释。
- `public/sidebar/index.js`：
  - workspace 行加 focus 按钮（仅 active workspace）；dblclick 入口。
  - `buildSessionItem` 改为调用共享 builder；归档区传 `showPinButton: false`；
    archive 禁用态（active/streaming）。
  - 归档区：去 `deleteAllBtn`/`deleteAllArchived`/`confirmArchivedDeletion`；
    去置顶；加单条删除 + 确认。
- `public/sidebar-workspace-group.js`：workspace 行 builder 增加显式 `onFocus` 槽位；
  `SessionSidebar` 仅为 active workspace 传入该 callback。builder 负责 focus button 的
  `aria-label`/tooltip、`stopPropagation`，并实现 §4.4 的 deferred 单击/double-click 协作。
- `public/index.html`：`.sidebar-header` 拆两行；搜索/工具按钮迁入行1；行2 加
  logo + brand；聊天 header 加 `#titlebar-workspace-path`。
- `public/app.js`：
  - `updateWorkspaceIndicator` → 更新新路径元素 + Windows/Linux `setTitle`。
  - focus URL 状态机、`navigateFocusAware(targetCwd, url)` 导航封装、boot
    pending/matched/mismatched 恢复，以及 active workspace 变更自动退出。
  - 将 live instance predicate 注入 `SessionSidebar` 以禁用归档；删除成功后清理
    recent/session pin，并将服务端 `running` 响应显示为提示。
  - 移除 `#workspace-indicator` 创建/插入。
- `src-tauri/capabilities/default.json`：加入 `core:window:allow-set-title`。
- `public/style.css`：两行布局；focus 容器样式；路径中间省略；删除
  `.archived-delete-all-btn`；归档区删除按钮样式。

**后端（`extensions/`）**

- `extensions/embedded-server.ts`：扩展 `/api/sessions/delete-batch`。维持既有 loopback-only、
  `.jsonl` 与 SESSIONS_DIR containment 校验；在 unlink 前以 `getRunningInstances()` 拒绝仍被
  live instance 持有的 filePath，并在响应中返回 `running: string[]`。这才是删除安全边界；
  前端 live-instance 检查仅改善 UX。
- 新增/扩展 embedded-server 测试，覆盖运行中的 session 不会 unlink、非运行 session 可删除，
  以及 `running` 响应。

**i18n**：`public/locales/{en,zh}.json` + `i18n-keys-completeness.test.js`。

## 8. 测试计划

- **新增** `public/sidebar/workspace-focus-sidebar.test.js`：
  - 仅 active workspace 渲染 focus 内容；
  - New Task 调 `onNewChat`；
  - session 点击调 `onSessionSelect`；
  - 「显示更多」阈值（6 条时显示 5 + toggle）；
  - 返回按钮触发退出回调；
  - active workspace 变更触发自动退出。
- **新增** `public/sidebar/focus-state.test.js`：
  - `withFocusParam(targetCwd, url)`：同 workspace 跨 port 导航保留
    `focusWorkspaceId`，跨 workspace 或未知 cwd 导航不保留；
  - boot 状态机：pending 时 activeSessionFile 为 null 不退出，matched 恢复，mismatched 清参数退出；
  - 手工篡改的 parameter 不作为路径使用，且只会得到普通 sidebar 或已解析项目。
- **扩展** `public/sidebar-workspace-group.test.js`：
  - focus 按钮仅 active workspace 出现；
  - deferred single-click 在 double-click 时不改变折叠态。
- **扩展** `extensions/embedded-server-*.test.ts`：
  - delete-batch 对 live instance 返回 `running` 且不 unlink；非 live session 可删除。
- **扩展** `public/session-sidebar-recent.test.js` / `session-sidebar-pinned.test.js`：
  - 归档区不渲染置顶按钮；
  - 归档区渲染删除按钮 + 二次确认；
  - active/streaming/live-instance session 的 archive 按钮 disabled；
  - delete-batch 的 `running` 响应使 live-instance session 删除被拒绝；成功删除会清理 recent 与 session pin;
  - 「全部删除归档」UI 与方法已移除。
- **路径中间省略**：新增 `public/titlebar-workspace-path.test.js`，纯函数测试截断
  逻辑（输入完整路径 + 可用宽度 → 预期首尾保留 + 中间省略）。
- 验证：前端改后 `bun run check` 通过；修改 capability 后跑 `bun run test`（含 capability
  校验）；扩展变更后也跑 `bun run build:extensions`；i18n 完整性测试自动覆盖新增 key。

## 9. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| focus 自动退出误判（active session 解析竞态） | URL 状态机在 activeSessionFile 为 null 时维持 pending；仅项目与 active workspace 都已知后判为 matched/mismatched |
| focus 参数被手工篡改 | 只把它视为字符串 ID；只和已加载 project ID 比较，绝不当路径使用；渲染只取已解析 project 字段并用 textContent |
| 路径中间省略在 resize 时抖动 | 仅在路径变更与 resize 结束（debounce）时重算，不持续监听 |
| Windows setTitle 被 capability 拒绝 | `default.json` 显式加入 `core:window:allow-set-title`，并以 Windows/Linux smoke test 验证 |
| 删除后台运行的 session 后复活 | 服务端 delete-batch 在 unlink 前以 `getRunningInstances()` 拒绝；前端 fresh `fetchInstances()` 只作即时 UX，archive 阶段也禁止 live instance |
| 删除留下浏览器侧死引用 | 成功后主动清理 MRU recent 与 session pin；workspace pin 不受影响 |
| 拆两行后 sidebar-header 可拖拽区缩小 | 行1 整行保持 `drag`；行2 标 `no-drag`，与现有 `.header-left/right` 分区一致 |

## 10. 验收标准

- macOS 顶部 title bar（行1）显示搜索框 + 3 工具按钮；聊天侧显示完整路径，超宽中间省略，悬停见全路径。
- Windows/Linux 原生窗口标题为 `Picot — <完整路径>`；header 不重复路径；`core:window:allow-set-title` 已授予且 Windows/Linux smoke test 成功。
- 行2 logo 右侧显示「Picot Workspace」。
- 仅 active workspace 出现 focus 入口；双击或点击入口进入 focus。
- Focus 页：返回、workspace 名、New Task、≤5 session + 显示更多；可点切换；无归档/删除/搜索/工具按钮。
- 同 workspace 的跨 port session 切换保持 focus；跨 workspace 导航退出；boot 的 null activeSession 过渡不误退出。
- 带有效 `focusWorkspaceId` 参数启动时，解析完成前先以普通侧栏占位，active workspace 解析后再进入 focus（解析前的占位属预期行为，不计为缺陷）。
- 归档区无置顶、无「全部删除」；每条有删除按钮 + 二次确认；仅非 live instance session 可真实删除 `.jsonl`，成功后 recent 与 session pin 被清理。
- active/streaming/live-instance session 的归档按钮禁用并提示原因。
- `bun run check` 与 `bun run test` 通过。

## 11. 实现结果与设计偏差

本节保留上述历史设计决策，并记录当前工作树已验证的实际行为；不以文档改写掩盖
与原设计的差异。

- **#1–#3 未采用**：workspace 路径仍是聊天 header `.header-right` 中动态插入的
  `#workspace-indicator` pill；`updateWorkspaceIndicator()` 仍更新该控件。`index.html`
  仍使用单行 `.sidebar-header`（logo、搜索和工具按钮同一行），没有 `Picot Workspace`
  brand row。不存在 `titlebar-workspace-path.js`、原生 `setTitle` 调用或
  `core:window:allow-set-title` capability。
- **Focus 入口改为唯一显式按钮**：`workspace-focus-btn` 仅显示在当前 foreground Pi
  实例 `cwd` 对应的 workspace；即使启动后处于未写入 `.jsonl` 的 New Task、没有
  `activeSessionFile`，该按钮仍可进入 Focus。已删除双击及 deferred single-click
  入口；workspace header 的单击、Enter 和 Space 始终只负责展开/收起。
- **Focus 内容实际行为**：侧栏以 `WorkspaceFocusSidebar` 替换普通 session 列表；显示返回、
  inline workspace quick-info card（路径与 Git repository 之间复用 `.wqi-git-region`
  分隔线）、New Task，以及所有非归档 session。session row 不提供 pin/archive，但提供
  单条删除；搜索、打开目录和 Quick Chat 被隐藏，刷新按钮保留。Focus 状态仍由不可信的
  URL `focusWorkspaceId` 传递，同 cwd 跨 port 导航才保留；该值不用于文件系统访问。
- **删除范围扩大**：归档列表和 Focus 列表都可发起单条真实删除，而非仅「先归档、再删除」。
  两条前端路径均调用 `/api/sessions/delete-batch`；服务端在 `.jsonl` / sessions directory
  containment 校验后，以 running instance 的 `sessionFile` 拒绝删除。成功删除会清理
  recent cookie 与 session pin；归档列表还会移除本端 `pi-studio-archived` 条目。
- **归档保护保持**：active、streaming 或 live-instance session 的归档按钮禁用；workspace
  批量归档同样跳过这些 session。

已由 `workspace-focus-sidebar.test.js`、`focus-state.test.js`、
`session-sidebar-focus.test.js`、`sidebar-workspace-group.test.js`、
`archive-protection.test.js`、`embedded-server-session-delete.test.ts` 覆盖，完整
`bun run test` 与 `bun run check` 为当前实现的验证入口。
