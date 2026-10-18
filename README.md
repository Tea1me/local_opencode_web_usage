# OpenCode Web Usage · 会话使用量

给本地 `opencode web` 添加会话 Token、缓存和费用统计。

**最新版 v0.4.0：显示在原生「审查 / 上下文」的同一个右侧面板里。** 不再独立占用一列。

> 技术说明：这仍是 **Tampermonkey 用户脚本**，不是编译进入 OpenCode 的官方 GUI 扩展。脚本在原生标签栏旁定位一个「▥ 使用量」按钮，并在选择它时将内容覆盖显示在原生面板的内容区域。**不会直接改动 Solid 管理的 Tab DOM**，避免旧版主界面空白问题。原生标签系统的拖拽排序、快捷键、持久化等行为并不适用于此模拟标签。

## 安装 / 升级

1. 安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开 [**脚本 Raw 安装地址**](https://raw.githubusercontent.com/Tea1me/local_opencode_web_usage/Tea1me/tea1me.github.io/opencode-web-usage.user.js)，安装或替换已有脚本。也可以复制完整内容到 Tampermonkey 编辑器，保存。
3. 在油猴里确认版本是 **`@version 0.4.0`**，旧版「OpenCode Web 本地会话统计」以及 v0.2/v0.3 的重复副本都应禁用；确保同一网址只有一个脚本运行。
4. 保持原本的启动命令：
   ```bash
   opencode web
   ```
5. 打开 `http://127.0.0.1:4096/`，进入会话，**先展开原生右侧「审查 / 上下文」面板**，然后点击与原生标签同一行的 `▥ 使用量`。

**注意：** 刷新网页不会自动替换 Tampermonkey 已安装的脚本版本；请在油猴里手动更新或重新安装，安装后再用 `Ctrl+Shift+R` 强制刷新网页。

## 功能

- 「▥ 使用量」跟随原生右侧面板的位置和尺寸；不再给主界面额外添加统计列。
- 点击使用量显示统计，再点一次关闭；点击原生「上下文」「审查」等标签时切回原生内容。
- 沿用已验证的会话统计 API：累计 Token、输入/输出/推理、缓存读取/写入、缓存读取占比、模型、记录费用（USD）和 Token 分类比例条。
- 10 秒刷新，浏览器切换会话后同步，浅色/深色主题自动识别。
- 数据直接从同源本地 OpenCode API 读取，不上传第三方服务器。
- 脚本通过 `document.body` 独立挂载，只根据 `#review-panel` 的位置测量定位；不往 OpenCode 的 Solid 节点中添加子元素。

## 兼容与局限

- 只有原生 `#review-panel` **打开且可见**时，油猴使用量标签才会出现。
- 这是与原生面板**同位置、同交互风格的用户脚本标签**，不是真正注册进 OpenCode GUI 扩展系统的 `Panel`。上游 UI DOM 结构变更后可能需要改脚本。
- 窄窗口中原生标签栏空间不足时，新按钮可能与原有按钮距离较近或出现重叠，需要按具体 OpenCode 版本进一步适配。
- 当前统计为**会话累计**，不代表上下文窗口实时使用量。
- 费用以 OpenCode API 数据为准；返回 0 则显示 `$0.00000`，不会自行估价。
- OpenCode V2 汇总 API 无法保证得到助手消息数，该项可能为「—（会话汇总）」。
- 未接入 TUI 插件 `opencode-tokenwatch` 的 TTFT、TPS、P95 等性能日志。

## 故障排查

**仍看到额外的独立右侧列：** 说明运行的还是 v0.3.0 或旧脚本没有停用。检查 Tampermonkey 脚本版本。

**「使用量」标签未出现：** 确认处于已有会话，并且已打开「审查 / 上下文」原生右侧面板。脚本不在首页、侧栏关闭时显示标签。

**脚本无法读取数据：** 打开浏览器 DevTools → Network，查看 `/api/session/{id}` 或 `/session/{id}` 请求。

**使用非 4096 端口：** 修改脚本元信息的 `@match` 后保存。

## 源码与相关项目

- [油猴脚本源码](./opencode-web-usage.user.js)
- [OpenCode 上游](https://github.com/anomalyco/opencode)
- [opencode-tokenwatch](https://github.com/TTWK/opencode-tokenwatch)
