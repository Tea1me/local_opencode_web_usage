/**
 * REAL OpenCode GUI extension, not a userscript.
 * Requires building OpenCode's GUI from source.
 * Targets the upstream GUI SDK on the dev branch checked 2026-10-18.
 */
import { createMemo } from "solid-js"
import { Panel, type PanelTab, type Setup, type MountedSession } from "../sdk"
import type definition from "./index"

const sum = (n: unknown): number => typeof n === "number" && Number.isFinite(n) ? n : 0
const fmt = (n: number) => n.toLocaleString("zh-CN", { maximumFractionDigits: 0 })

function UsageView(props: { session: MountedSession }) {
  // Public host data: same source that OpenCode's built-in Context panel uses.
  const messages = createMemo(() => props.session.server.data.session.message.list(props.session.id))
  const summary = createMemo(() => {
    const assistant = messages().filter((message) => message.type === "assistant" && message.tokens)
    const totals = { input: 0, output: 0, reasoning: 0, read: 0, write: 0, cost: 0 }
    let recent = 0
    const now = Date.now()
    let speedNumerator = 0
    let speedDenominator = 0
    let lastTPS: number | undefined

    for (const message of assistant) {
      if (message.type !== "assistant" || !message.tokens) continue
      const t = message.tokens
      const input = sum(t.input), output = sum(t.output), reasoning = sum(t.reasoning)
      const read = sum(t.cache?.read), write = sum(t.cache?.write)
      totals.input += input
      totals.output += output
      totals.reasoning += reasoning
      totals.read += read
      totals.write += write
      totals.cost += sum(message.cost)

      // Rolling recorded TPM, not a provider rate-limit quota.
      const recorded = message.time.completed ?? message.time.streamed
      if (recorded !== undefined && recorded <= now && recorded > now - 60000) {
        recent += input + output + reasoning + read + write
      }
      // time.streamed is end-of-response, not tool settlement.
      if (message.time.streamed === undefined) continue
      const ms = message.time.streamed - message.time.created
      if (ms <= 0 || output <= 0) continue
      speedNumerator += output
      speedDenominator += ms / 1000
      lastTPS = output / (ms / 1000)
    }
    const tokenTotal = totals.input + totals.output + totals.reasoning + totals.read + totals.write
    return { ...totals, tokenTotal, recent, lastTPS,
      averageTPS: speedDenominator > 0 ? speedNumerator / speedDenominator : undefined }
  })

  return (
    <div class="h-full min-h-0 overflow-y-auto bg-v2-background-bg-base p-5 text-v2-text-text-strong">
      <div class="text-14-medium pb-3">▥ 使用量 · 原生扩展试验</div>
      <div class="mb-4 text-12-regular text-text-weak">
        助手消息历史累计（不是原生会话汇总 API 的完全同口径数据）
      </div>
      <div class="grid grid-cols-2 gap-3 rounded-lg bg-v2-background-bg-layer-01 p-3">
        <div><div class="text-12-regular text-text-weak">Token</div><strong>{fmt(summary().tokenTotal)}</strong></div>
        <div><div class="text-12-regular text-text-weak">费用（API记录）</div><strong>${summary().cost.toFixed(5)}</strong></div>
      </div>
      <div class="grid grid-cols-2 gap-4 py-5">
        <div>输入 <strong>{fmt(summary().input)}</strong></div>
        <div>输出 <strong>{fmt(summary().output)}</strong></div>
        <div>推理 <strong>{fmt(summary().reasoning)}</strong></div>
        <div>缓存读取 <strong>{fmt(summary().read)}</strong></div>
        <div>缓存写入 <strong>{fmt(summary().write)}</strong></div>
        <div>60s TPM <strong>{fmt(summary().recent)}</strong></div>
        <div>最近 TPS <strong>{summary().lastTPS?.toFixed(1) ?? "—"}</strong></div>
        <div>平均 TPS <strong>{summary().averageTPS?.toFixed(1) ?? "—"}</strong></div>
        <div>TTFT <strong>—</strong></div>
      </div>
      <p class="text-12-regular text-text-weak">
        历史 TPS 使用流式响应总耗时，含首字等待，仅作为近似吞吐量。
        精确 TTFT 需监听 live delta 事件（油猴 v0.5.0 已提供）。
      </p>
    </div>
  )
}

const setup: Setup<typeof definition> = (ctx) => {
  const tab: PanelTab = {
    id: "main",
    title: "使用量",
    pinned: true, // Real native tab managed by the host's tab strip.
    draggable: false,
    closable: false,
    fallback: false,
  }
  ctx.add(Panel, {
    id: "main",
    region: "side",
    list: () => [tab],
    render: (props) => <UsageView session={props.session} />,
  })
}

export default setup
