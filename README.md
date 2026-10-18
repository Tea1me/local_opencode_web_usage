# OpenCode Web Usage · 原生侧栏统计

给本地 `opencode web` 界面加一个**靠右停靠、可折叠的会话统计侧栏**（v0.3.0）。兼容已验证过的 OpenCode V2 会话汇总 API，并尽量回退兼容旧版消息 API。

**目标网址：** `http://127.0.0.1:4096/` 或 `http://localhost:4096/`

> 这是一个浏览器油猴脚本，不是修改 OpenCode 的上游源码，也不是 TUI 插件 `opencode-tokenwatch` 的移植；不用重新编译 OpenCode 或安装后端。

## 安装

1. 安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开 [**安装脚本（Raw .user.js）**](https://raw.githubusercontent.com/Tea1me/local_opencode_web_usage/Tea1me/tea1me.github.io/opencode-web-usage.user.js)，在油猴中点击**安装**。若浏览器没有自动识别，可复制内容到 Tampermonkey 的「添加新脚本」并保存。
3. **停用之前的旧版「OpenCode Web 本地会话统计」油猴脚本**，否则会同时显示两个统计面板。如果已安装本仓库的 v0.2.0，请在油猴编辑器中手动更新/重新安装 v0.3.0（仅刷新网页不会把旧脚本替换为新版本）。
4. 继续原来的启动方式：
   ```sh
   opencode web
   ```
5. 打开 `http://127.0.0.1:4096/`，进入已有会话，右侧出现「使用量」侧栏。

## 功能

- **安全独立挂载**：统计面板挂到 `document.body`，不再直接插入 Solid 管理的 `main` 兄弟节点（修复 v0.2.0 可能导致的主界面空白、侧栏位置异常）。桌面端通过附加样式给原生主内容区**预留右侧宽度**；窄屏时允许面板覆盖内容。
- 一键展开/折叠；拖动侧栏左边缘调整宽度（275–480px）。
- 统计当前会话累计 Token、输入/输出/推理、缓存读取/写入与读取占比、记录费用（USD）、当前/最近模型。
- **浅色/深色自适应配色**：侧栏使用独立的高对比度颜色，不依赖跨 Shadow DOM 的主题 Token（修复 v0.2.0 白底浅字）。
- Token 分类比例条；10 秒自动刷新；SPA 切换会话时跟随更新；页面不在会话时隐藏。
- 宽度和折叠状态只存在浏览器本地 `localStorage`；脚本不上传会话数据。
- 窄屏时采用抽屉样式，不长期占据主内容宽度。

## 已知边界

- **Token 为会话累计用量，不是当前上下文窗口占用量。**
- **费用取自 OpenCode API**；模型/通道返回 0 就显示 `$0.00000`，不会自行按价格表估算。
- V2 会话汇总通常不包含可直接读取的助手消息数量，因此显示「—（会话汇总）」。
- 与 `opencode-tokenwatch` 的 TUI 侧栏/本地性能日志是两套取数方式。TTFT、TPS、P95 等插件专属指标**尚未接入**，不应误认为已经移植。
- 桌面端预留宽度使用 OpenCode 当前的 `main.contain-content` 布局选择器；如果上游改版，脚本会退化为停靠在右侧的面板，但不会再把 DOM 节点插入 OpenCode 内部的框架节点。

## 故障排查

**更新后仍然在左侧且白底白字：** 在 Tampermonkey 中确认脚本头部为 `@version 0.3.0`，然后 **Ctrl+Shift+R 强制刷新**。如果尚是 0.2.0，请用 Raw 链接重新安装新版。旧脚本不可与新版同时运行。

**右侧不出现：** 确认 Tampermonkey 已启用，且浏览器地址为 `127.0.0.1:4096` 或 `localhost:4096`。请进入某个已有会话，首页会隐藏侧栏。刷新网页并检查浏览器 Console。

**出现两个面板：** 停用旧版浮窗脚本。

**显示「读取失败」：** 在浏览器开发者工具 Network 检查 `/api/session/{id}` 或 `/session/{id}` 的 HTTP 返回值。API 不兼容或权限限制会导致失败。

**想改端口：** 修改油猴脚本开头的 `@match` 行，把 4096 改成你实际使用的端口并保存。

## 源文件

[`opencode-web-usage.user.js`](./opencode-web-usage.user.js)

## 相关项目

- [OpenCode](https://github.com/anomalyco/opencode)
- [opencode-tokenwatch](https://github.com/TTWK/opencode-tokenwatch)
