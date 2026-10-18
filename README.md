# OpenCode Web Usage

为本地 `opencode web` 增强当前会话 Token、缓存、费用与性能指标。

目前有两种实现，**不要同时启用**：

| 实现 | 用途 | 安装方式 | 状态 |
| --- | --- | --- | --- |
| [油猴 v0.5.0](./opencode-web-usage.user.js) | 平时的 OpenCode Web，显示在「上下文」同栏 | Tampermonkey | JS 语法通过；当前版本待本机实测 |
| [原生 GUI Panel 实验](./native-experiment/INTEGRATION.md) | 真正注册为 OpenCode 的 SideRegion 标签页 | 改动并构建 OpenCode 源码 | 实验源码，未编译实测 |

## 一、日常使用：Tampermonkey v0.5.0

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. [**安装/更新 .user.js（Raw）**](https://raw.githubusercontent.com/Tea1me/local_opencode_web_usage/Tea1me/tea1me.github.io/opencode-web-usage.user.js)。
3. 在油猴编辑器中检查 `@version 0.5.0`；旧脚本只能保留一个启用。刷新原生 OpenCode Web（推荐 Ctrl+Shift+R）。
4. 继续运行 `opencode web`，进入一个已有会话、展开「上下文」侧栏，在同一行切换到「▥ 使用量」。

功能包括：

- 直接读取 OpenCode 同源 API 的当前会话 Token（输入、输出、推理、缓存读写）、记录费用、模型与比例条。
- **新增最近 TPS**：从 live V2 `session.step.started`、`session.step.streamed`、`session.step.ended` 得到流式起止时间和输出 Token，计算 `output / ((streamed - started) / 1000)`。它使用整个流式窗口，**包含首字等待**，与服务商内部纯解码速率不完全相同。
- **新增最近 60 秒 TPM**：当前网页监听到的 `session.step.ended` 事件，在最近 60 秒内累计五类 Token。这里的 TPM 是**已记录用量的滑动时间窗**，不等于供应商的速率限制或剩余额度。
- **新增最近 TTFT**：`session.step.started` 到第一个非空 `session.text.delta` 或 `session.reasoning.delta` 的时间差（毫秒）。仅收到请求开始和首输出两个可靠事件才显示。
- 10 秒自动刷新普通统计；实时事件到达时更新性能统计，60 秒滚动窗口每秒重新计算。
- 浏览器浅色/深色主题兼容；统计面板不移入 OpenCode Solid 管理的子节点。

**重要：** 三个性能指标的观测从当前页面连上 `/api/event` 后开始。已经结束的请求不会追算，页面关闭或刷新后重置；丢事件、重连期间也不伪造 TPS、TTFT。如果用量暂时显示 `—`，可以在该会话重新发送一条提示词来触发完整观测。

> 旧版 v0.4.0 已在本地截图中验证可工作；v0.5.0 代码更新后，还需要在用户的 OpenCode 环境实测事件是否可用。若 `/api/event` 不兼容，本地 Token 总数等基础统计不受影响，性能区会显示无法连接/等待数据。

## 二、真正原生：GUI Panel 源码实验

查看 [native-experiment/INTEGRATION.md](./native-experiment/INTEGRATION.md)。

这个实验版本使用官方 `ctx.add(Panel, { region: "side" })`，由 OpenCode 自己管理 Tab，而不只是油猴浮层模拟。但当前 Web GUI 的 `ExtensionRoot` 只加载编译在 `@opencode/gui-extensions/renderer` 中的内置扩展，**现有安装版不能从用户配置直接加载这个 GUI 标签扩展**。需要把实验源码复制到官方项目并重新编译 Web GUI。

实验源码为了验证原生集成，从宿主内存态的消息历史计算基础统计和近似历史 TPS/TPM，TTFT 未接入；它与油猴 v0.5.0 功能覆盖尚不完全一致，也没有在源码构建环境做编译检查。

## 相关仓库

- [OpenCode](https://github.com/anomalyco/opencode)
- [opencode-tokenwatch](https://github.com/TTWK/opencode-tokenwatch)
