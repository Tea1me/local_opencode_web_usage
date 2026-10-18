# 网络诊断：事件面板、工具运行与 HTTP/SSH 流量边界

## v0.11.0：关联视图（按一次用户轮次串起完整链路）

在「网络诊断」开始捕获后，切换 **时间线 / 关联视图**：

- 优先利用 `assistant.id`、`assistant.parentID`、`part.messageID`、`part.callID` 精确建立记录关联；同一个 `parentID` 的多次模型请求与工具调用归成同一个对话轮次；
- 展示模型开始/结束、工具执行中/完成、失败与重试（仅上游事件实际存在时），组内按真实捕获时间排序；
- 显示每组时间范围、记录跨度、观察到的不同助手消息数、不同工具调用数及错误数。**跨度不等于网络 RTT**；
- 缺乏稳定关联 ID 的 SSE 事件进入「未关联到消息的事件」，不臆测它属于哪次调用；
- 保留每条事件的原始本地消息详情按钮，但原始数据仅在按需点击时读取；
- 默认导出 JSON 始终只有脱敏事件元数据，不携带 `parentID`、`callID`、原始模型消息和工具输入输出。最多保留 200 条，跨会话隔离。

这一视图只是**关联前端收到的已有事件**，不会静默回溯整个会话；如果需要历史消息，可使用 [消息分页 API](https://github.com/anomalyco/opencode/blob/v1.19.2/packages/protocol/src/groups/message.ts) 读取会话已存储的数据。

> 真实的请求/响应有三类：浏览器→OpenCode 的本地 API（浏览器 DevTools 可以看到）；OpenCode 后端→LLM Provider 的网络 HTTP（需要后端显式 instrumentation 或受控代理）；工具运行进程→CTF 目标的 HTTP/SSH（需要在工具、Playwright 网络 API 或独立采集层捕获）。不能用 ToolPart 反推出所有网络层 HTTP 请求。

## v0.10.0：模型消息创建/响应结束按需展开

已将与工具原始详情相同的操作扩展到 **「模型消息创建」「模型响应结束」**，以及带 `assistantMessageID` 的部分模型步骤事件。

**操作方式：** 在「使用量 → 网络诊断」开始捕获，点击模型事件下的「查看模型消息详情」。油猴脚本只在点击后，按 `messageID` 从本地消息 API 加载；不向模型供应商或 CTF 靶机额外发请求。

展开内容：

- `assistant`：OpenCode 保存的助手消息信息，包括提供商/模型 ID、耗时、完成标志、Token、费用、错误等（如果原始记录提供）；
- `responseParts`：此助手消息已保存的文本、reasoning 和工具调用 Part。对应的是 **OpenCode 存储的消息/响应**，不是流式 HTTP 原始报文；
- `relatedUserMessage`：若 `parentID` 存在且关联的用户消息可读取，展示其本地保存的 `info` 和 `parts`；否则明确提示找不到。

**“完整请求/响应”边界：** 这个视图不声称还原发给供应商的最终 system prompt、完整历史上下文、工具 schema、适配器转换后的参数、API key、HTTP Headers、流式分块和网络级原始 response body。OpenCode 消息表有助于**复原会话语义**，但不是模型供应商 API 的完整 HTTP 抓包。如果要看真正的 outbound HTTP payload，必须另外在服务端 provider 适配层或代理上按需采集（要尤其小心密钥）。

**敏感信息保护：** 默认诊断事件始终为脱敏元数据；模型/工具原始消息只在用户点击后读取，不自动加入「复制脱敏日志」，也不保存在 localStorage/GitHub。关闭详情会清空显示的原始文本，切换会话会清空捕获记录。原始信息可能含 CTF flag、凭据、工具 output 和隐私内容，不要未经审查直接公开。

## v0.9.0：按需查看原始工具操作详情

已在「使用量 → 网络诊断」增加**逐条「按需查看原始详情」**功能：

1. 开始捕获，在时间线上找到某条工具 `运行中/完成/失败` 记录；
2. 点击「按需查看原始详情」，脚本才通过当前 OpenCode 的本地消息 API 查询匹配的 `messageID / callID` 对应 ToolPart；
3. 展开原始 `state.input`、`state.output`、`state.error`、工具名、起止时间和元数据；可选中文本复制；
4. 点击「收起并清除原始详情」，原始数据从界面移除。**默认脱敏 JSON 导出仍不包含原始工具信息。**

这一流程完全**不重放工具命令或 HTTP 请求**；仅读取本地已保存的消息。若消息被截断或压缩清理，原始输出可能已经不存在。为避免频繁网络请求及误泄露，原始内容不持久化、不自动读取，并且只在明确手动展开后显示，最大渲染 150,000 字符。

**隐私提醒：** 你处理 CTF 时，工具参数可能包含 SSH 密码、Cookie、API Token、flag 及靶机地址。原始详情只应在你本机、可信环境下查看；不要未经审查就复制到第三方 AI、公开 Issue 或聊天中。此功能不应视为凭据清理工具。

### 关于“发给 AI 的请求一定存在完整记录吗？”

OpenCode 1.19.2 的 `MessageV2` 通过 `MessageTable` 和 `PartTable` 保存工具消息的 `input/output`。因此**工具级输入输出**通常能在会话历史找回。

但真正发往大模型供应商的 HTTP payload 可能经过消息合并、上下文裁剪、工具输出截断、鉴权注入等处理，因此不能断言历史记录就是“实际网络层字节”的无损副本。Playwright 内部访问靶机网页的各个子资源、重定向、XHR/fetch 请求也不保证包含在 `browser_navigate` 的 ToolPart 中。

### Playwright MCP 可以先不用独立抓包器

如果你使用的是 [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp)，官方已经提供：

- `browser_network_requests`：列出当前页面加载后产生的网络请求、URL 和状态；
- `browser_network_request`：读取指定请求的更详细 HTTP Header / Body（版本和工具配置支持时）。

让 OpenCode **在 `browser_navigate` 后主动调用这两个工具**，网络报告本身会作为另一次 MCP 工具结果出现在 OpenCode 会话中。配合 v0.9.0 的按需原始 ToolPart 查看，就能看到浏览器请求的细节，而不必先自行安装系统级抓包。

注意：这些工具仅监控 **Playwright MCP 所管理的浏览器**，不覆盖后端 Python、curl、SSH 或其他独立进程；完整 Headers/Body 可能高度敏感，谨慎分享。

---

## 已实现：v0.8.1 事件诊断

Tampermonkey 脚本在 OpenCode 的原生「使用量」同栏内增加 **网络诊断** 子页。

- **手动开始/停止**：仅捕获本次浏览器会话中、当前选中的 OpenCode 会话的后续事件；网页刷新不保留记录。
- **模型事件**：助手消息创建/完成、步骤开始/完成/失败、重试、会话错误（仅在 SSE 事件包含这些信息时显示）。
- **工具执行**：`message.part.updated` 的工具 `running/completed/error`、工具类型、`time.start/end` 耗时；支持 `session.next.tool.*` 和 `session.next.shell.*`。部分工具结果还可通过现有的最近消息轮询补采。
- **过滤与导出**：全部 / 模型 / 工具 / 异常；清空；复制 JSON 脱敏日志。最近 200 条上限。
- **隔离与权限**：切换会话时停止捕获并清空当前日志；不修改 OpenCode 请求流程，不提交或同步任何日志。
- **默认脱敏**：仅保留严格白名单的工具名称、预定义事件名称、时间、耗时、枚举状态和错误类别。**不记录完整 error.message、请求/响应 Body、脚本命令、URL、HTTP Header、Cookie、SSH 命令或输出**。捕获失败/限流时可显示上游显式返回的 HTTP 状态码，例如 429；不是对后端 HTTP 网络的直接拦截。

### 使用步骤

1. 更新油猴脚本到 `@version 0.8.1`，强制刷新 `http://127.0.0.1:4096/`。
2. 进入会话，打开原生右侧栏中的「使用量」→「网络诊断」。
3. 点击「开始捕获」，再向模型发起新提问，或让它执行一个工具。
4. 从时间线看模型的创建、完成、失败、重试和工具耗时。选择「异常/失败」过滤错误。
5. 如需进一步诊断，可点击「复制脱敏日志」，分享前仍建议自行检查敏感上下文。捕获结束或切换会话时日志不持久化。

> 1.x 的 `/global/event` 已由用户在 1.19.2 上验证可连接，**本版模型与工具事件面板本身尚待在真实浏览器回归验证**；某些事件因 OpenCode/模型/工具不同而缺失，不能由脚本推测补齐。
>
> 工具总耗时包含工具自身处理时间；不是 HTTP/SSH 的 RTT、握手时间或者网络时间。状态码只有上游明确暴露时才可见。

## 第二阶段可行性：工具内部访问 CTF 靶机的网络请求

**为什么单靠浏览器无法完整捕获？**

`opencode web` 浏览器只连接本地 OpenCode 服务。Shell、Python、curl、SSH 等工具在 OpenCode **后端子进程**中运行。油猴拦截 `window.fetch` / `XMLHttpRequest` / WebSocket 只能观察浏览器端到本地服务的流量，**不能自动观察** Python `requests`、`curl`、`ssh`、PowerShell 等后端进程的网络请求。

### 可选采集方案

| 方式 | 能看到什么 | 限制/风险 |
| --- | --- | --- |
| **工具层封装（首选）**：给常用 CTF 工具增加显式 wrapper | `curl` 的目标域名/端口、HTTP 状态、DNS/连接/首包/总耗时；`ssh` 的连接目标、退出码、耗时 | 仅封装过的命令可观测；需在命令执行路径做显式替换或环境配置；不自动覆盖 Python 库 |
| HTTP(S) 代理（如 mitmproxy） | 代理流量的请求/响应、状态和时间 | 必须明确让相关程序走代理，HTTPS 解密还涉及 CA 信任；敏感凭据与靶机数据可能进入代理日志 |
| 系统级网络事件（Windows ETW / Npcap；Linux eBPF） | TCP/UDP 连接与进程映射、连接异常、字节量 | 更复杂且可能需要管理员权限；不会天然知道 HTTPS URL 和 HTTP 状态；还需把进程归属到某次工具调用 |
| OpenCode server plugin: `tool.execute.before/after` | 工具标识、调用耗时、成功/失败等语义事件 | **不是**网络抓包；若只看工具级元数据无法知道 shell 内部多少次 HTTP/SSH 连接 |

### 建议的第三阶段架构

1. 保持 v0.8.1 的**只读事件面板**不变。
2. 独立设计 opt-in、仅监听你授权的 CTF 目标的 **本地网络元数据采集器**；明确目标主机 allowlist、每个工具调用的 correlation id、用户手动启停。
3. 优先给 Windows 的 `curl.exe` / `ssh.exe`、Python 请求脚本提供显式 wrapper，将**方法、主机、端口、状态码、耗时、错误类别**发送给本地采集端；**不记录** URL 查询串、Authorization、Cookie、请求/响应正文、SSH 交互内容。
4. 采集器只监听 loopback，默认内存环形缓冲、短时间过期；若要在油猴端读取，通过最小只读接口和本地授权机制访问，不能默认绑定公网上的监听地址。
5. 考虑你使用 Windows 路径（`D:\\...`），可以先做 PowerShell / Windows 可运行原型，而不是依赖 Linux-only eBPF。实际可运行方案需根据你使用的终端、工具命令和是否愿意配置代理决定。

**不要将“工具已完成”推断为“HTTP 成功”，也不要把 OpenCode 的服务端错误码冒充靶机 HTTP 状态码。** 面板需明确区分两类数据来源。

## 相关资料

- OpenCode 1.19.2 [Plugin Hooks](https://github.com/anomalyco/opencode/blob/v1.19.2/packages/plugin/src/index.ts)
- OpenCode 1.19.2 [Tool State schema](https://github.com/anomalyco/opencode/blob/v1.19.2/packages/sdk/js/src/v2/gen/types.gen.ts)
- 仓库主页：[local_opencode_web_usage](../README.md)
