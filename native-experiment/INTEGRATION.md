# 原生 OpenCode GUI 扩展实验（源码构建）

此目录为真正的 OpenCode **GUI Panel** 扩展源码，不是 Tampermonkey 插件。已对照上游 `dev` 分支的 `context/renderer.tsx`、`gui-extensions/src/renderer.ts`、`runtime/extension/root.tsx` 设计。

> **当前限制：** OpenCode 的 `ExtensionRoot` 对 Web 只从 `@opencode/gui-extensions/renderer` 的 `builtins` 里取 GUI 扩展。第三方 `.ocdx` 尚不能在已安装的 `opencode web` 中加载 renderer bundle。因此不能只将本目录添加到 `opencode.json`，必须从源码构建修改后的 OpenCode GUI。

## 接入源码的步骤

1. 获取相符版本的 [OpenCode 官方源代码](https://github.com/anomalyco/opencode)，按其仓库开发文档安装 Bun 等依赖。
2. 将本目录的 `index.ts` 和 `renderer.tsx` 复制到上游源码目录 `packages/gui-extensions/src/local-usage/`。
3. 修改上游 `packages/gui-extensions/src/renderer.ts`：

   在其他扩展 import 旁增加：

   ```ts
   import localUsage from "./local-usage"
   import localUsageRenderer from "./local-usage/renderer"
   ```

   在 `Extension.compose(` 的扩展列表内增加：

   ```ts
   { ...localUsage, renderer: eager(localUsageRenderer) },
   ```

4. 按上游 README 的构建/开发流程启动修改后的 GUI 服务，验证「使用量」出现在原生 SideRegion 标签栏。**这里不会修改你当前已安装的 OpenCode。**
5. 在实验 GUI 中禁用 Tampermonkey 的统计脚本，避免两套标签同时显示。

## 状态与边界

- 原生扩展使用 `ctx.add(Panel)` 注册 `region: "side"`，由 OpenCode 自己管理标签，包含焦点、选中、布局和可访问性属性。
- 它只读取浏览器端宿主缓存中的助手消息，因此总量与 `/api/session/{id}` 的会话汇总可能不同；这是有意标明的口径差异。
- 历史 TPS 使用 `output / (time.streamed - time.created)`，**包含首字等待，属于粗略吞吐量**，不等于油猴 v0.5.0 实时事件采集的 TPS。
- 历史 TPM 为按消息完成时间统计最近 60 秒已记录 Token，不是供应商的 TPM 配额。
- TTFT 暂显示 `—`；原生版本要精确实现还需与上游扩展事件订阅能力集成。
- 此实验没有在实际 OpenCode 源码构建环境里做编译/运行测试，可能需要随上游 API 调整类型。日常使用请继续选择仓库根目录稳定的油猴版。
