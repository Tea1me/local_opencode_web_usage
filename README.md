# OpenCode Web Usage

给本地 `opencode web` 加一个与原生「审查 / 上下文」同栏的 **使用量** 标签。显示会话累计 Token、缓存复用、费用及 TPS/TPM/TTFT。

| 方案 | 状态 | 适合 |
| --- | --- | --- |
| [油猴 v0.7.1](./opencode-web-usage.user.js) | **推荐日常使用**；JS 语法已通过；1.19.x 实时指标已由用户截图验证，新增折叠功能待浏览器实测 | 已安装的 OpenCode 1.19.x、兼容新版本 |
| [原生 Panel 实验](./native-experiment/INTEGRATION.md) | 需要编译 OpenCode 源码；未编译实测 | 想把标签真正注册到 GUI 扩展系统 |

## 安装 / 更新

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开 [**油猴脚本 Raw 地址**](https://raw.githubusercontent.com/Tea1me/local_opencode_web_usage/Tea1me/tea1me.github.io/opencode-web-usage.user.js)，在油猴中更新或重新安装。
3. 确认用户脚本顶部为 **`@version 0.7.1`**，不要同时启用旧脚本。之后用 Ctrl + Shift + R 刷新。
4. 正常运行 `opencode web`，进入已有会话、打开右侧原生面板，再点击「▥ 使用量」。

本脚本针对 `http://127.0.0.1:4096/` 和 `http://localhost:4096/`；其他端口需自行改 `@match`。

## 思考内容逐段折叠（新增 v0.7.0）

在 **OpenCode v1.19.2** 源码中，模型 reasoning 有独立 HTML 标记 `[data-component="reasoning-part"]`；旧版界面没有逐段收起按钮。

脚本提供：

- **默认折叠**：安装后，模型 reasoning 以「▸ 思考内容已折叠 · 点击展开」占位行展示。
- **逐段操作**：点击占位行可展开原生 Markdown 推理内容；展开后点击该段顶部「▾ 思考内容 · 点击折叠」再次收起。正文中的链接、选区和代码操作不作为折叠按钮。
- **全局开关**：在「使用量」标签 → **思考内容 → 默认折叠 reasoning** 可以开启/关闭，设置仅保存在浏览器本地；点击总开关会清除当前页面的逐段临时覆盖，以确保立刻生效。
- **虚拟滚动兼容**：按会话和 part ID 保存有限的逐段覆盖状态，虚拟列表重建 DOM 时尽量恢复；观察器跳过思考块内部流式 Markdown 节点，避免每个 token 触发整棵 DOM 扫描。
- **非侵入**：只通过额外样式控制 reasoning 容器直接子节点的可见性，不移动或删除 Solid 管理的节点，也不读取、改写模型响应内容。

**注意：** 请在 OpenCode 原生「设置 → 常规 → 显示推理摘要」中保持**开启**，否则宿主本身就不会渲染 reasoning 块，脚本无法在隐藏的内容上生成折叠入口。

仅当服务商把内容作为 `reasoning` 类型交给 OpenCode 时，才能折叠。若某些模型把“思考过程”直接写入常规 `text` 答案，而不是独立 reasoning part，脚本不会猜测并自动隐藏，否则容易错误折叠正常文本。

折叠按钮由 CSS 伪元素模拟，**并非上游真正的原生 Accordion**。OpenCode 将来的 DOM 结构变更可能需要更新匹配方式。对响应本身、Token/TPS 统计没有影响。

## 助手消息数（v0.7.1 修复）

旧版面板一直显示「助手消息数 —（会话汇总）」是因为会话汇总返回了 Token/费用，但不包含助手消息条数。

现在汇总数据仍独立刷新，助手消息数在后台单独读取：

- 优先通过 **OpenCode 1.19.2** 的 `/api/session/{id}/message?limit=200&order=desc` 读取完整消息列表；每页最多 200 条，沿 `cursor.next` 逐页累计 **`type === "assistant"`**，也兼容 `info.role === "assistant"` 格式。
- 最多扫描 50 页（10,000 条消息）。若超过上限，显示「≥N（超过统计上限）」而不是不准确的总数。
- 每 60 秒更新一次，手动刷新会重新统计；结果最多缓存 8 个会话，不影响每 10 秒的 Token 和性能刷新。
- 当分页 API 不可用时尝试老的 `/session/{id}/message`，会标成「N（已读取）」表示旧接口的覆盖范围可能不完整；失败则显示「—（消息接口不可用）」。
- 切换会话时停止对旧会话继续翻页，不把旧会话消息数写到新会话。

**消息数 ≠ 用户提问轮数**：一次用户提示可能对应多条 assistant 消息（模型继续、工具调用前后等），因此通常比用户消息数大。

## 为什么之前的 TPS/TTFT 是「—」？

原脚本 v0.5.0 只订阅 2.x 的 `/api/event`、`session.step.*` 事件；**OpenCode 1.19.2 仍属于 1.x**，主要使用 `/global/event`、`/event` 和 `message.updated`、`message.part.updated`、`message.part.delta`。

v0.7.0 沿用的采集顺序：

1. 优先尝试 `/global/event`（跨项目 1.x SSE）；连接失败尝试 `/event`（单项目 SSE），再尝试 `/api/event`（2.x SSE）。
2. **并行备用方案**：面板展开时每 10 秒查询 `/session/{id}/message?limit=80` 的最近记录（失败再尝试带 `/api` 前缀），不依赖 SSE 一定稳定。
3. 从已完成消息的 `time.completed` 统计 **最近 60 秒 TPM**；即使 SSE 断线仍可能正确显示。
4. **最近 TPS（近似）**：只有找到可靠的首输出时间（V1 消息 text/reasoning part `time.start` 或实时 delta）时，才计算 `output / (completed - firstOutput)`；V2 使用 `output / (streamed - started)`。两者都是吞吐估算，时间边界、首字等待与工具结算会使口径不同，不代表供应商底层解码速度。
5. **最近 TTFT**：只有存在请求开始和有效首输出时间锚点时显示；否则保持 `—`。旧版 1.x 有过流式 delta 缺失的情况，因此**不能保证**所有模型与请求都能看到 TPS/TTFT。

**界面状态说明：**「事件断开」不影响独立的消息轮询。若出现「消息：已同步最近 N 条」，说明消息数据可用于历史速率和 TPM。若两个数据源都失败，性能指标会显示 `—`；不会把没采集到的数据当成真实的 0。

**TPM 不代表提供商限额**，这里只统计当前会话 60 秒内**已经完成且有记录**的请求的五类 Token。不会统计未完成请求的即时输入吞吐，也不跨不同会话聚合。

## 缓存读写如何理解？

- **缓存读取** `tokens.cache.read`：服务商上报的「命中并复用的输入 Token」；同一前缀被多次复用，会被多次计入会话累计量。
- **缓存创建（上报）** `tokens.cache.write`：服务商单独上报的缓存创建 Token。像部分 OpenAI 兼容或隐式缓存通道只会提供读取用量，**写入始终为 0 不代表缓存无效**。
- **输入缓存复用占比**：`cache.read / (cache.read + input)`。这是按 Token 量计算的复用比例，**不是请求命中率**，也不是缓存容量、磁盘读写次数。
- 费用以 OpenCode 实际记录为准，返回 `$0.00000` 不代表上游真正免费。

## 现有局限

- 1.x 消息接口有些 text part 不含 `time.start`，同时部分版本 SSE 不提供及时的 `message.part.delta`：这种请求的 TTFT/TPS 只能显示 `—`，不会编造精确指标。
- 面板只在原生侧栏展开且有会话时显示；这是通过浏览器脚本模拟同栏 Tab，不是真正的 GUI SDK 扩展，不支持原生拖拽排序。
- 轮询只读取最近 80 条消息（避免下载整个大型会话），当前会话较大/高频时可能漏掉少量最近 60 秒内的完成请求。
- SSE 断线可能触发自动重试；没有任何会话数据上传至 GitHub。
- 与 TUI 的 `opencode-tokenwatch` 共享指标含义，但没有直接读取它的本地 JSONL 日志。

## 真正原生 GUI Tab 实验

详见 [native-experiment/INTEGRATION.md](./native-experiment/INTEGRATION.md)。当前 OpenCode GUI 不支持仅通过外部配置加载第三方 renderer；实验必须克隆 OpenCode 源码、复制扩展、构建自定义 Web 客户端。**这不是现有用户脚本的安装依赖。**

## 相关

- [OpenCode](https://github.com/anomalyco/opencode)
- [opencode-tokenwatch](https://github.com/TTWK/opencode-tokenwatch)
