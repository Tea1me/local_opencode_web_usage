# 网络诊断：事件面板、工具运行与 HTTP/SSH 流量边界

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
