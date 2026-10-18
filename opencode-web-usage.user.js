// ==UserScript==
// @name         OpenCode Web 原生侧栏使用量
// @namespace    https://github.com/Tea1me/local_opencode_web_usage
// @version      0.10.0
// @description  支持按需查看模型消息和工具调用的原始会话记录；保持默认脱敏、不保存原始内容
// @author       Tea1me & ChatGPT
// @match        http://127.0.0.1:4096/*
// @match        http://localhost:4096/*
// @updateURL    https://raw.githubusercontent.com/Tea1me/local_opencode_web_usage/Tea1me/tea1me.github.io/opencode-web-usage.user.js
// @downloadURL  https://raw.githubusercontent.com/Tea1me/local_opencode_web_usage/Tea1me/tea1me.github.io/opencode-web-usage.user.js
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==
(function nativeUsageScript() {
  'use strict';

  if (window.top !== window.self || document.getElementById('oc-usage-native')) return;

  const CONFIG = {
    refreshMs: 10000,
    routeCheckMs: 1200,
    openKey: 'oc-web-usage:native-tab-open:v2',
    widthKey: 'oc-web-usage:dock-width:v1',
    thinkingKey: 'oc-web-usage:reasoning-default-collapsed:v1',
  };
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const format = (value) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(number(value));
  const dollar = (value) => '$' + number(value).toFixed(number(value) < 0.01 ? 5 : 3);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const readStore = (key, fallback) => {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  };
  const writeStore = (key, value) => {
    try { localStorage.setItem(key, String(value)); } catch { /* Ignore blocked storage. */ }
  };
  const currentSession = () => {
    const match = location.pathname.match(/\/session\/([^/?#]+)/);
    if (!match || match[1] === 'new') return null;
    try { return decodeURIComponent(match[1]); } catch { return match[1]; }
  };
  const state = {
    open: readStore(CONFIG.openKey, 'false') === 'true',
    width: clamp(number(readStore(CONFIG.widthKey, '330')) || 330, 275, 480),
    session: null,
    pending: false,
    generation: 0,
    thinkingCollapsed: readStore(CONFIG.thinkingKey, 'true') === 'true',
  };

  // The Shadow DOM host is owned by <body>, outside Solid's reconciled subtree.
  // Never insert the host into OpenCode's framework-managed flex children.
  const host = document.createElement('aside');
  host.id = 'oc-usage-native';
  host.setAttribute('aria-label', 'OpenCode 当前会话使用量');
  host.style.setProperty('--oc-usage-width', state.width + 'px');
  host.dataset.open = String(state.open);
  host.dataset.theme = 'light';
  host.hidden = true;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `

    <style>
      :host {
        --oc-bg: #ffffff;
        --oc-layer: #f3f5f9;
        --oc-fg: #202938;
        --oc-muted: #596579;
        --oc-border: #d5dbe5;
        --oc-accent: #387ad4;
        display: block;
        position: fixed;
        inset: 0;
        z-index: 80;
        color: var(--oc-fg);
        font-family: inherit;
        font-size: 13px;
        pointer-events: none;
      }
      :host([data-theme="dark"]) {
        --oc-bg: #151d2b;
        --oc-layer: #232e3f;
        --oc-fg: #f1f5f9;
        --oc-muted: #a0adbf;
        --oc-border: #3c4a5c;
        --oc-accent: #80adff;
      }
      :host([hidden]) { display: none !important; }
      *, *::before, *::after { box-sizing: border-box; }
      button { color: inherit; font: inherit; cursor: pointer; }
      button:focus-visible { outline: 2px solid var(--oc-accent); outline-offset: 2px; }
      .native-tab {
        position: fixed;
        top: var(--oc-tab-top, 48px);
        left: var(--oc-tab-left, -300px);
        width: 88px;
        height: 33px;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 5px;
        padding: 0 5px;
        border: 0;
        border-bottom: 2px solid transparent;
        border-radius: 5px 5px 0 0;
        color: var(--oc-muted);
        background: transparent;
        pointer-events: auto;
        white-space: nowrap;
        font-size: 12px;
      }
      .native-tab:hover { background: var(--oc-layer); color: var(--oc-fg); }
      :host([data-open="true"]) .native-tab {
        background: var(--oc-layer);
        border-bottom-color: var(--oc-accent);
        color: var(--oc-fg);
        font-weight: 600;
      }
      .dock {
        display: none;
        position: fixed;
        top: var(--oc-panel-top, 100px);
        left: var(--oc-panel-left, -1000px);
        width: var(--oc-panel-width, 0px);
        height: var(--oc-panel-height, 0px);
        overflow: hidden;
        border: 1px solid var(--oc-border);
        border-top: 0;
        border-radius: 0 0 9px 9px;
        background: var(--oc-bg);
        pointer-events: auto;
        box-shadow: 0 5px 16px #0002;
      }
      :host([data-open="true"]) .dock { display: flex; }
      .body { display: flex; flex-direction: column; width: 100%; min-width: 0; min-height: 0; overflow: hidden; }
      .bar {
        min-height: 45px; flex-shrink: 0; display: flex; align-items: center;
        gap: 7px; padding: 0 15px; border-bottom: 1px solid var(--oc-border);
      }
      .bar strong { font-size: 13px; white-space: nowrap; flex: 1; }
      .icon {
        width: 28px; height: 28px; padding: 4px; display: grid; place-items: center;
        border: 0; border-radius: 7px; background: transparent;
      }
      .icon:hover { background: var(--oc-layer); }
      .icon svg {
        width: 17px; height: 17px; stroke: currentColor; fill: none;
        stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
      }
      .view-tabs { display: flex; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--oc-border); }
      .view-tab { border: 1px solid transparent; background: transparent; border-radius: 6px; padding: 6px 13px; color: var(--oc-muted); }
      .view-tab[aria-selected="true"] { background: var(--oc-layer); border-color: var(--oc-border); color: var(--oc-fg); font-weight: 650; }
      .diag-controls { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; align-items: center; }
      .diag-btn { border-radius: 7px; border: 1px solid var(--oc-border); background: var(--oc-layer); padding: 6px 10px; }
      .diag-btn[aria-pressed="true"] { background: var(--oc-accent); color: white; border-color: var(--oc-accent); }
      .diag-btn:disabled { opacity: .5; cursor: not-allowed; }
      .diag-filter { border: 1px solid var(--oc-border); background: var(--oc-bg); color: var(--oc-fg); border-radius: 6px; padding: 5px 8px; }
      .diag-note { font-size: 11px; line-height: 1.6; color: var(--oc-muted); }
      .diag-records { display: flex; flex-direction: column; gap: 8px; padding-top: 9px; }
      .diag-record { border: 1px solid var(--oc-border); background: var(--oc-layer); border-radius: 8px; padding: 9px 11px; }
      .diag-head { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
      .diag-tag { font-weight: 700; font-size: 12px; }
      .diag-record[data-kind="error"] .diag-tag { color: #cd493d; }
      .diag-record[data-kind="tool"] .diag-tag { color: var(--oc-accent); }
      .diag-time { margin-left: auto; color: var(--oc-muted); font-variant-numeric: tabular-nums; font-size: 11px; }
      .diag-detail { margin-top: 5px; color: var(--oc-muted); overflow-wrap: anywhere; font-size: 12px; line-height: 1.5; }
      .diag-raw-action { margin-top: 9px; padding: 5px 9px; border-radius: 6px; border: 1px solid var(--oc-border); background: var(--oc-bg); color: var(--oc-fg); font-size: 12px; }
      .diag-raw-action:hover { background: var(--oc-layer); }
      .diag-raw-warning { margin-top: 8px; font-size: 11px; color: var(--oc-muted); line-height: 1.5; }
      .diag-raw { max-height: 360px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; border-radius: 6px; background: var(--oc-bg); border: 1px solid var(--oc-border); padding: 9px; font: 12px/1.55 ui-monospace,Consolas,monospace; margin: 7px 0 0; }
      .content {
        min-height: 0; flex: 1; overflow-y: auto;
        padding: 14px 16px 20px; scrollbar-width: thin;
      }
      .status { color: var(--oc-muted); font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
      .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; margin: 12px 0 18px; }
      .tile {
        min-width: 0; padding: 13px 11px; border-radius: 9px;
        background: var(--oc-layer); border: 1px solid var(--oc-border);
      }
      .tile small { display: block; color: var(--oc-muted); margin-bottom: 6px; }
      .tile strong {
        display: block; font-variant-numeric: tabular-nums; font-size: 17px;
        color: var(--oc-fg); letter-spacing: -.4px; overflow-wrap: anywhere;
      }
      .perf-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 9px;
      }
      .perf-tile {
        min-width: 0; border: 1px solid var(--oc-border);
        background: var(--oc-layer); border-radius: 9px;
        padding: 11px 9px;
      }
      .perf-tile small { display: block; font-size: 11px; color: var(--oc-muted); margin-bottom: 8px; }
      .perf-tile strong {
        display: block; overflow-wrap: anywhere;
        color: var(--oc-fg); font-size: 16px;
        font-variant-numeric: tabular-nums;
      }
      .perf-status { color: var(--oc-muted); font-size: 11px; line-height: 1.5; margin-top: 8px; }
      .oc-thinking-toggle {
        border-radius: 7px;
        padding: 5px 10px;
        border: 1px solid var(--oc-border);
        background: var(--oc-layer);
        font-size: 12px;
        font-weight: 600;
        flex-shrink: 0;
      }
      .oc-thinking-toggle:hover { filter: brightness(.96); }
      .oc-thinking-toggle[aria-pressed="true"] { border-color: var(--oc-accent); color: var(--oc-accent); }
      .oc-thinking-hint { color: var(--oc-muted); font-size: 11px; margin-top: 7px; line-height: 1.55; }
      .subhead {
        font-size: 11px; letter-spacing: .2px; color: var(--oc-muted);
        margin: 17px 0 10px; font-weight: 600;
      }
      .rows {
        display: grid; grid-template-columns: minmax(0, 1fr) auto;
        gap: 13px 10px; align-items: start;
      }
      .label { color: var(--oc-muted); }
      .value {
        color: var(--oc-fg); font-variant-numeric: tabular-nums;
        font-weight: 600; max-width: min(200px, 45vw);
        text-align: end; overflow-wrap: anywhere;
      }
      .track {
        height: 6px; background: var(--oc-layer); border-radius: 99px;
        overflow: hidden; display: flex; margin-top: 15px;
      }
      .seg { min-width: 0; transition: width 180ms ease; height: 100%; }
      .input { background: #54a4ff; } .output { background: #65c9ae; }
      .reasoning { background: #ceabff; } .cache { background: #f0ba63; }
      .write { background: #ef8ba5; }
      .legend {
        display: flex; flex-wrap: wrap; gap: 6px 10px;
        color: var(--oc-muted); font-size: 10px; margin-top: 9px;
      }
      .dot { display: inline-block; height: 7px; width: 7px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
      .foot {
        margin-top: 18px; padding-top: 10px; border-top: 1px solid var(--oc-border);
        color: var(--oc-muted); font-size: 11px; line-height: 1.5;
      }
      .closed { display: none; }
      @media (prefers-reduced-motion: reduce) {
        .seg { transition: none; }
      }
    </style>
    <button type="button" class="native-tab" aria-label="切换使用量面板" aria-pressed="false" title="查看会话使用量">▥ 使用量</button>
    <div class="dock">
      <button type="button" class="closed" aria-label="展开使用量侧栏" title="展开使用量">
        <span class="glyph">▥</span><span class="vertical">使用量</span>
      </button>
      <div class="body">
        <div class="bar">
          <strong>▥ 使用量</strong>
          <button type="button" class="icon refresh" title="刷新统计" aria-label="刷新统计">
            <svg viewBox="0 0 24 24"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18.7 7L20 12M4 12l1.3 5A7 7 0 0 0 18.5 15"/></svg>
          </button>
          <button type="button" class="icon collapse" title="折叠侧栏" aria-label="折叠侧栏">
            <svg viewBox="0 0 24 24"><path d="M14 6l-6 6 6 6"/></svg>
          </button>
        </div>
        <div class="view-tabs" role="tablist" aria-label="面板内容">
          <button type="button" role="tab" class="view-tab" data-view="usage" aria-selected="true">使用量</button>
          <button type="button" role="tab" class="view-tab" data-view="diagnostics" aria-selected="false">网络诊断</button>
        </div>
        <div class="content stats-content">
          <div class="status" aria-live="polite">等待读取会话…</div>
          <div class="summary">
            <div class="tile"><small>累计 Token</small><strong data-value="total">—</strong></div>
            <div class="tile"><small>记录费用 · USD</small><strong data-value="cost">—</strong></div>
          </div>
          <div class="subhead">TOKEN 构成</div>
          <div class="rows">
            <span class="label">输入</span><span class="value" data-value="input">—</span>
            <span class="label">输出</span><span class="value" data-value="output">—</span>
            <span class="label">推理</span><span class="value" data-value="reasoning">—</span>
            <span class="label">缓存读取</span><span class="value" data-value="read">—</span>
            <span class="label" title="服务商上报的缓存创建 Token；隐式缓存可不单独上报写入量">缓存创建（上报）</span><span class="value" data-value="write" title="0 仅说明未上报缓存创建量，不表示缓存复用无效">—</span>
          </div>
          <div class="track" title="各类 Token 比例">
            <span class="seg input" data-seg="input"></span>
            <span class="seg output" data-seg="output"></span>
            <span class="seg reasoning" data-seg="reasoning"></span>
            <span class="seg cache" data-seg="read"></span>
            <span class="seg write" data-seg="write"></span>
          </div>
          <div class="legend">
            <span><i class="dot input"></i>输入</span>
            <span><i class="dot output"></i>输出</span>
            <span><i class="dot reasoning"></i>推理</span>
            <span><i class="dot cache"></i>缓存读</span>
            <span><i class="dot write"></i>缓存写</span>
          </div>
          <div class="subhead">性能监测 · 1.x/2.x 兼容</div>
          <div class="perf-grid">
            <div class="perf-tile"><small title="输出 Token / 流式输出耗时；V1 会包含部分结算开销，属于近似值">最近 TPS（近似）</small><strong data-perf="tps">—</strong></div>
            <div class="perf-tile"><small>60 秒 TPM</small><strong data-perf="tpm">—</strong></div>
            <div class="perf-tile"><small>最近 TTFT</small><strong data-perf="ttft">—</strong></div>
          </div>
          <div class="perf-status" data-perf-status aria-live="polite">正在检查可用的数据接口…</div>
          <div class="subhead">思考内容</div>
          <div class="rows">
            <span class="label">默认折叠 reasoning</span>
            <button type="button" class="oc-thinking-toggle" aria-label="切换思考内容默认折叠" aria-pressed="false">—</button>
          </div>
          <div class="oc-thinking-hint">仅对模型的 reasoning 类型生效。点击聊天中的「▸ 思考内容」可单独展开，再点标题收起。原生「显示推理摘要」需保持开启。</div>
          <div class="subhead">会话详情</div>
          <div class="rows">
            <span class="label" title="缓存读取 Token /（缓存读取 + 未缓存输入）；不是请求级命中率">输入缓存复用占比</span><span class="value" data-value="hitRate">—</span>
            <span class="label">当前/最近模型</span><span class="value" data-value="model">—</span>
          </div>
          <div class="foot">当前会话累计统计 · 每 10 秒刷新<br>
            费用以 OpenCode API 记录为准；累计 Token 不等于上下文窗口占用。缓存读写是模型服务商上报的累计 Token，不是本地磁盘缓存容量；隐式缓存可能读取很高但创建一直为 0。
            与 TUI 的 opencode-tokenwatch 性能数据独立。</div>
        </div>
        <div class="content diag-content" hidden>
          <div class="subhead">模型事件 / 工具执行</div>
          <div class="diag-note">只观察当前浏览器接收到的 OpenCode 事件。默认只记录脱敏元数据；点击模型或工具记录的详情按钮，才从本地 API 读取对应消息、响应 Part、参数或结果。原始内容可能包含提示词或凭据，请勿随意转发。</div>
          <div class="diag-controls">
            <button class="diag-btn diag-capture" type="button" aria-pressed="false">开始捕获</button>
            <select class="diag-filter" aria-label="事件过滤">
              <option value="all">全部事件</option>
              <option value="model">模型事件</option>
              <option value="tool">工具执行</option>
              <option value="error">异常/失败</option>
            </select>
            <button class="diag-btn diag-clear" type="button">清空</button>
            <button class="diag-btn diag-copy" type="button">复制脱敏日志</button>
          </div>
          <div class="diag-note diag-status" aria-live="polite">未开始捕获 · 等待手动开启</div>
          <div class="diag-records" role="log" aria-label="诊断事件列表"></div>
          <div class="foot">脱敏日志导出不包含原始模型/工具详情。按需查看只读取当前会话的本地历史记录，不会重放命令或向靶机发请求。模型消息历史不等于真实供应商 HTTP 请求报文；工具记录也不一定包含真实的 HTTP/SSH 流量。</div>
        </div>
      </div>
    </div>
  `;

  const node = (selector) => shadow.querySelector(selector);
  const status = node('.status');
  const values = Object.fromEntries([...shadow.querySelectorAll('[data-value]')]
    .map((element) => [element.dataset.value, element]));
  const segments = Object.fromEntries([...shadow.querySelectorAll('[data-seg]')]
    .map((element) => [element.dataset.seg, element]));
  const refreshBtn = node('.refresh');
  const perfValues = Object.fromEntries([...shadow.querySelectorAll('[data-perf]')]
    .map((element) => [element.dataset.perf, element]));
  const perfStatus = node('[data-perf-status]');



  // A page-local opt-in recorder. No raw SSE event or tool payload is saved.
  // Only fixed labels, numeric values, and a strict-allowlisted tool name survive.
  const diagnostic = {
    enabled: false,
    sessionID: null,
    started: 0,
    rows: [],
    seen: new Set(),
    maxRows: 200,
    maxSeen: 800,
    rawLock: false,
  };
  const diagPanel = node('.diag-content');
  const usagePanel = node('.stats-content');
  const diagStatus = node('.diag-status');
  const diagRecords = node('.diag-records');
  const diagCaptureButton = node('.diag-capture');
  const diagFilter = node('.diag-filter');
  const diagCopyButton = node('.diag-copy');
  let activeView = 'usage';

  function setView(next) {
    if (next !== 'diagnostics') diagnostic.rawLock = false;
    activeView = next === 'diagnostics' ? 'diagnostics' : 'usage';
    diagPanel.hidden = activeView !== 'diagnostics';
    usagePanel.hidden = activeView !== 'usage';
    for (const tab of shadow.querySelectorAll('.view-tab')) {
      const selected = tab.dataset.view === activeView;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    // Perf and its SSE state are initialized later in script startup.
    // Rendering diagnostics before that point would hit perf's TDZ.
    if (activeView === 'diagnostics') renderDiagnostic(true);
    else diagRecords.replaceChildren();
  }
  for (const tab of shadow.querySelectorAll('.view-tab')) {
    tab.addEventListener('click', () => setView(tab.dataset.view));
  }

  function toolName(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,48}$/.test(value)
      ? value : '工具';
  }
  function statusCode(error) {
    const raw = error?.statusCode ?? error?.status ??
      error?.data?.statusCode ?? error?.data?.status;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 100 && n <= 599 ? n : null;
  }
  function errorCategory(error) {
    const status = statusCode(error);
    if (status === 401 || status === 403) return '鉴权/权限失败 HTTP ' + status;
    if (status === 429) return '模型限流 HTTP 429';
    if (status >= 500) return '服务端错误 HTTP ' + status;
    if (status >= 400) return '客户端错误 HTTP ' + status;
    // Inspect text transiently, never persist/print it: may contain secrets.
    const name = typeof error?.name === 'string' ? error.name.slice(0, 80) : '';
    const msg = typeof error === 'string' ? error :
      typeof error?.message === 'string' ? error.message : '';
    const value = (name + ' ' + msg).slice(0, 2048);
    if (/timeout|timed.?out|etimedout|aborterror/i.test(value)) return '超时/中断';
    if (/econnreset|econnrefused|enotfound|network|fetch failed|dns|socket/i.test(value)) return '网络/连接错误';
    if (/tls|certificate|ssl/i.test(value)) return 'TLS/证书错误';
    if (/permission|denied|unauthorized|forbidden/i.test(value)) return '权限错误';
    return '执行异常（细节已脱敏）';
  }
  function recordDiagnostic(row) {
    if (!diagnostic.enabled || diagnostic.sessionID !== state.session ||
        currentSession() !== state.session) return;
    if (!row || row.at < diagnostic.started) return;
    if (row.key && diagnostic.seen.has(row.key)) return;
    if (row.key) {
      diagnostic.seen.add(row.key);
      if (diagnostic.seen.size > diagnostic.maxSeen) {
        diagnostic.seen.delete(diagnostic.seen.values().next().value);
      }
    }
    diagnostic.rows.push({
      at: row.at,
      category: row.category === 'tool' ? 'tool' : 'model',
      kind: row.kind === 'error' ? 'error' : (row.category === 'tool' ? 'tool' : 'model'),
      title: row.title,
      detail: row.detail,
      reference: row.reference && typeof row.reference.messageID === 'string' &&
        row.reference.messageID.length > 0 && row.reference.messageID.length <= 256 &&
        (row.reference.kind === 'model' ||
          (row.reference.kind === 'tool' && typeof row.reference.callID === 'string'))
        ? {kind:row.reference.kind, messageID:row.reference.messageID,
           callID:row.reference.kind === 'tool' ? row.reference.callID : null,
           partID:row.reference.kind === 'tool' && typeof row.reference.partID === 'string'
             ? row.reference.partID : null}
        : null,
    });
    if (diagnostic.rows.length > diagnostic.maxRows) diagnostic.rows.shift();
    if (activeView === 'diagnostics') renderDiagnostic();
  }
  function readEventForDiagnostics(raw) {
    if (!diagnostic.enabled) return;
    const e = raw?.payload?.type ? raw.payload : raw;
    const d = e?.data ?? e?.properties ?? {};
    const sessionID = d.sessionID ?? d.info?.sessionID ?? d.part?.sessionID;
    if (!e?.type || sessionID !== diagnostic.sessionID ||
        sessionID !== currentSession()) return;
    const at = Date.now();
    const eventType = e.type;
    const message = d.info;
    if (eventType === 'message.updated' && message?.role === 'assistant') {
      if (message?.error) {
        recordDiagnostic({at,category:'model',kind:'error',title:'模型响应失败',
          detail:errorCategory(message.error),key:'model-error:'+message.id,
          reference:{kind:'model',messageID:message.id}});
      } else if (message?.time?.completed) {
        const ms = Number(message.time.completed) - Number(message.time.created);
        recordDiagnostic({at,category:'model',title:'模型响应结束',
          detail:ms > 0 ? Math.round(ms)+' ms · 含工具/等待时间' : '完成',
          key:'model-end:'+message.id,
          reference:{kind:'model',messageID:message.id}});
      } else {
        recordDiagnostic({at,category:'model',title:'模型消息创建',
          detail:'等待后续输出',key:'model-start:'+message.id,
          reference:{kind:'model',messageID:message.id}});
      }
      return;
    }
    if (eventType === 'message.part.updated' && d.part?.type === 'tool') {
      recordToolPart(d.part,at,'SSE');
      return;
    }
    if (eventType === 'session.error') {
      recordDiagnostic({at,category:'model',kind:'error',title:'会话异常',
        detail:errorCategory(d.error),key:'session-error:'+at});
      return;
    }
    if (eventType === 'session.step.started' || eventType === 'session.next.step.started') {
      recordDiagnostic({at,category:'model',title:'模型请求开始',detail:'模型步骤已启动',
        key:'model-step-start:'+(d.assistantMessageID||at),
        reference:{kind:'model',messageID:d.assistantMessageID}});
      return;
    }
    if (eventType === 'session.step.ended' || eventType === 'session.next.step.ended') {
      const tokens = d.tokens || {};
      recordDiagnostic({at,category:'model',title:'模型请求结束',
        detail:'输出 '+Math.max(0,Number(tokens.output)||0)+' tokens',
        key:'model-step-end:'+(d.assistantMessageID||at),
        reference:{kind:'model',messageID:d.assistantMessageID}});
      return;
    }
    if (eventType === 'session.step.failed' || eventType === 'session.next.step.failed') {
      recordDiagnostic({at,category:'model',kind:'error',title:'模型请求失败',
        detail:errorCategory(d.error),key:'model-step-failed:'+(d.assistantMessageID||at),
        reference:{kind:'model',messageID:d.assistantMessageID}});
      return;
    }
    if (eventType === 'session.next.retried' || eventType === 'session.retry') {
      recordDiagnostic({at,category:'model',title:'模型请求重试',
        detail:'重试 #' + (Number.isInteger(Number(d.attempt)) ? Math.min(999,Math.max(0,Number(d.attempt))) : '?') +
          ' · ' + errorCategory(d.error),
        key:'model-retry:'+at});
      return;
    }
    if (eventType === 'session.next.tool.called' ||
        eventType === 'session.next.tool.success' ||
        eventType === 'session.next.tool.failed') {
      const phase = eventType.split('.').at(-1);
      const name = toolName(d.tool ?? d.name);
      recordDiagnostic({at,category:'tool',kind:phase==='failed'?'error':'tool',
        title: name+' · '+({called:'启动',success:'完成',failed:'失败'}[phase]),
        detail:phase==='failed'?errorCategory(d.error):'服务器工具事件',
        key:'next-tool:'+String(d.callID||at)+':'+phase});
      return;
    }
    if (eventType === 'session.next.shell.started' || eventType === 'session.next.shell.ended') {
      const phase = eventType.endsWith('started')?'启动':'完成';
      recordDiagnostic({at,category:'tool',title:'shell · '+phase,
        detail:'仅监控 shell 生命周期，不记录命令/输出',
        key:'next-shell:'+String(d.callID||at)+':'+phase});
    }
  }
  function recordToolPart(part, now = Date.now(), source = 'SSE') {
    if (!diagnostic.enabled || part?.type !== 'tool') return;
    const status = part.state?.status;
    if (!['running','completed','error'].includes(status)) return;
    const key = part.callID || part.id;
    if (typeof key !== 'string' || !key) return;
    const start = Number(part.state?.time?.start);
    const end = Number(part.state?.time?.end);
    if (source === '消息轮询' && (!Number.isFinite(end) || end < diagnostic.started)) return;
    const tool = toolName(part.tool);
    const phase = status==='running'?'执行中':status==='error'?'执行失败':'已完成';
    const duration = Number.isFinite(start) && Number.isFinite(end) && end >= start
      ? ' · '+Math.round(end-start)+' ms' : '';
    recordDiagnostic({at:now,category:'tool',kind:status==='error'?'error':'tool',
      title:tool+' · '+phase,
      detail:source+duration+
        (status==='error'?' · '+errorCategory(part.state?.error):''),
      key:'tool:'+key+':'+status,
      reference: {kind:'tool',callID:key,
        messageID:typeof part.messageID==='string'?part.messageID:'',
        partID:typeof part.id==='string'?part.id:null}});
  }

  // On-demand read, not capture. No raw tool input/output is added to
  // diagnostic.rows or the sanitized JSON export.
  function findStoredTool(payload, reference) {
    const raw = payload?.data ?? payload;
    const messages = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
    for (const item of messages) {
      const info = item?.info ?? item;
      const parts = item?.parts ?? item?.content ?? info?.parts ?? info?.content ?? [];
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        if (part?.type !== 'tool') continue;
        if (reference.messageID && part.messageID && part.messageID !== reference.messageID) continue;
        if (part.callID === reference.callID ||
            (reference.partID && part.id === reference.partID)) {
          // Explicit allowlist: only fields that belong to this tool part.
          return {
            tool: part.tool ?? null,
            callID:part.callID ?? null,
            status: part.state?.status ?? null,
            start:part.state?.time?.start ?? null,
            end:part.state?.time?.end ?? null,
            input:part.state?.input ?? null,
            output:part.state?.output ?? null,
            error:part.state?.error ?? null,
            title:part.state?.title ?? null,
            metadata:part.state?.metadata ?? null,
            // The host may compact/truncate tool output before the next LLM call.
            compacted:part.state?.time?.compacted ?? null,
          };
        }
      }
    }
    return null;
  }
  async function loadStoredTool(reference, sessionID) {
    if (!reference?.callID || !sessionID) throw Error('没有可以定位工具调用的标识');
    const sid = encodeURIComponent(sessionID);
    const mid = reference.messageID && encodeURIComponent(reference.messageID);
    const paths = [
      ...(mid ? [
        '/session/'+sid+'/message/'+mid,
        '/api/session/'+sid+'/message/'+mid,
      ] : []),
      '/session/'+sid+'/message?limit=100',
      '/api/session/'+sid+'/message?limit=100',
    ];
    let found = false;
    for (const path of paths) {
      let payload;
      try { payload = await jsonGET(path); } catch { continue; }
      found = true;
      const detail = findStoredTool(payload,reference);
      if (detail) return detail;
    }
    throw Error(found ? '本次工具调用不在最近消息记录中，或该接口未返回 ToolPart' : '当前 OpenCode 未提供兼容的消息查询接口');
  }


  // This is the OpenCode *stored message*, not the provider's literal HTTP
  // request/response bytes. Fetch only after a deliberate user click.
  function findStoredMessage(payload, messageID) {
    const raw = payload?.data ?? payload;
    const messages = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
    for (const item of messages) {
      const info = item?.info ?? item;
      if (!info || (info.id !== messageID && item?.messageID !== messageID)) continue;
      let parts = item?.parts ?? info?.parts ?? item?.content ?? info?.content ?? [];
      if (!Array.isArray(parts)) parts = [];
      return { info, parts };
    }
    return null;
  }

  async function fetchStoredMessage(sessionID, messageID) {
    if (!sessionID || !messageID) throw Error('缺少会话或消息标识');
    const sid = encodeURIComponent(sessionID);
    const mid = encodeURIComponent(messageID);
    const paths = [
      '/session/'+sid+'/message/'+mid,
      '/api/session/'+sid+'/message/'+mid,
      '/session/'+sid+'/message?limit=100',
      '/api/session/'+sid+'/message?limit=100',
    ];
    let hadResponse = false;
    for (const path of paths) {
      let payload;
      try { payload = await jsonGET(path); } catch { continue; }
      hadResponse = true;
      const match = findStoredMessage(payload,messageID);
      if (!match) continue;
      if (match.info?.sessionID && match.info.sessionID !== sessionID) continue;
      return match;
    }
    throw Error(hadResponse
      ? '该消息未出现在可读取的历史记录中（可能已分页或被压缩）'
      : '当前 OpenCode 未返回兼容的消息接口');
  }

  async function loadStoredModel(reference, sessionID) {
    if (reference?.kind !== 'model' || !reference.messageID) {
      throw Error('没有可以定位模型消息的标识');
    }
    const message = await fetchStoredMessage(sessionID,reference.messageID);
    if (message.info.role !== 'assistant' && message.info.type !== 'assistant') {
      throw Error('目标记录不是助手消息，已拒绝显示');
    }
    const parentID = typeof message.info.parentID === 'string' ? message.info.parentID : null;
    let parent = null;
    let parentStatus = parentID ? '未找到关联父消息' : '消息未提供 parentID';
    if (parentID) {
      try {
        const candidate = await fetchStoredMessage(sessionID,parentID);
        if (candidate.info.role === 'user' || candidate.info.type === 'user') {
          parent = candidate;
          parentStatus = '已读取关联用户消息';
        } else {
          parentStatus = '关联消息不是用户消息';
        }
      } catch {
        parentStatus = '无法读取关联用户消息';
      }
    }
    return {
      type: 'OpenCode 本地存储的会话消息（不是供应商 HTTP 报文）',
      caution: '不能据此还原完整 system prompt、上下文裁剪、供应商请求头或原始 wire payload',
      messageID: reference.messageID,
      assistant: message.info,
      responseParts: message.parts,
      relatedUserMessage: parent,
      relatedUserMessageStatus: parentStatus,
    };
  }

  function attachRawToolButton(card,row) {
    if (!row.reference?.messageID ||
        (row.reference.kind !== 'model' && row.reference.kind !== 'tool')) return;
    if (row.reference.kind === 'tool' && !row.reference.callID) return;
    const button=document.createElement('button');
    button.type='button';
    button.className='diag-raw-action';
    button.textContent=row.reference.kind === 'model' ? '查看模型消息详情' : '按需查看原始详情';
    const panel=document.createElement('div');
    panel.hidden=true;
    const warning=document.createElement('div');
    warning.className='diag-raw-warning';
    warning.textContent=row.reference.kind==='model'
      ? '以下是 OpenCode 本地存储的助手消息、响应 Part 与可能关联的用户消息，不是供应商完整 HTTP 请求/响应。可能包含提示词、推理、密钥和 CTF 数据；请自行审查，不会进入脱敏日志。'
      : '本地原始数据可能含 URL、Cookie、Token、密码和靶机响应。请检查敏感内容后再复制给 AI；此内容不进入「复制脱敏日志」。';
    const pre=document.createElement('pre');
    pre.className='diag-raw';
    panel.append(warning,pre);
    button.addEventListener('click',async()=>{
      if (!panel.hidden) {
        panel.hidden=true;pre.textContent='';
        diagnostic.rawLock=false;
        button.textContent=row.reference.kind==='model'?'查看模型消息详情':'按需查看原始详情';
        renderDiagnostic(true);
        return;
      }
      diagnostic.rawLock=true;
      const sessionID=state.session;
      const generation=state.generation;
      button.disabled=true;
      button.textContent=row.reference.kind==='model'?'正在读取本地模型消息…':'正在读取本地 ToolPart…';
      try {
        const detail=row.reference.kind==='model'
          ? await loadStoredModel(row.reference,sessionID)
          : await loadStoredTool(row.reference,sessionID);
        if (sessionID!==state.session || generation!==state.generation || !card.isConnected) return;
        const json=JSON.stringify(detail,null,2);
        pre.textContent=json.length>150000 ? json.slice(0,150000)+
          '\n\n[内容超过 150,000 字符，已截断界面显示；该内容可能仍包含敏感信息]' : json;
        panel.hidden=false;
        button.textContent='收起并清除原始详情';
      } catch(e) {
        if (sessionID!==state.session || generation!==state.generation || !card.isConnected) return;
        pre.textContent='读取失败：'+(e?.message||'未知错误');
        panel.hidden=false;
        button.textContent='收起并清除原始详情';
      } finally {button.disabled=false;}
    });
    card.append(button,panel);
  }

  function renderDiagnostic(force=false) {
    if (diagnostic.rawLock && !force) return;
    diagCaptureButton.textContent = diagnostic.enabled ? '停止捕获' : '开始捕获';
    diagCaptureButton.setAttribute('aria-pressed',String(diagnostic.enabled));
    diagStatus.textContent =
      (diagnostic.enabled ? '捕获中' : '已停止') +
      ' · '+(diagnostic.rows.length)+' 条记录（上限 200）'+
      ' · SSE: '+(perf?.sseStatus||'待连接')+
      ' · 当前会话 · 不保存请求正文';
    const selected = diagFilter.value;
    const rows = diagnostic.rows.filter(row =>
      selected==='all' || row.category===selected ||
      (selected==='error' && row.kind==='error'));
    // Rendering with textContent, never HTML; event payloads cannot inject markup.
    const fragment = document.createDocumentFragment();
    if (!rows.length) {
      const empty=document.createElement('p');
      empty.className='diag-note';
      empty.textContent=diagnostic.enabled?'尚未捕获符合条件的事件，请发起一次模型/工具请求。':'点击「开始捕获」后，新事件将显示在这里。';
      fragment.appendChild(empty);
    }
    for (const row of [...rows].reverse()) {
      const card=document.createElement('article');
      card.className='diag-record';
      card.dataset.kind=row.kind;
      const head=document.createElement('div');
      head.className='diag-head';
      const title=document.createElement('span');title.className='diag-tag';title.textContent=row.title;
      const timestamp=document.createElement('span');timestamp.className='diag-time';
      timestamp.textContent=new Date(row.at).toLocaleTimeString('zh-CN');
      const detail=document.createElement('div');detail.className='diag-detail';detail.textContent=row.detail;
      head.append(title,timestamp);card.append(head,detail);
      attachRawToolButton(card,row);
      fragment.appendChild(card);
    }
    diagRecords.replaceChildren(fragment);
  }
  function stopDiagnostics() {
    diagnostic.enabled=false;
    diagnostic.sessionID=null;
    diagnostic.rawLock=false;
    renderDiagnostic(true);
  }
  diagCaptureButton.addEventListener('click',()=>{
    if(diagnostic.enabled){stopDiagnostics();return;}
    diagnostic.enabled=true;
    diagnostic.sessionID=state.session;
    diagnostic.started=Date.now();
    diagnostic.rows=[];
    diagnostic.seen.clear();
    renderDiagnostic();
  });
  node('.diag-clear').addEventListener('click',()=>{
    diagnostic.rows=[];
    diagnostic.seen.clear();
    diagnostic.rawLock=false;
    renderDiagnostic(true);
  });
  diagFilter.addEventListener('change',()=>{diagnostic.rawLock=false;renderDiagnostic(true);});
  diagCopyButton.addEventListener('click',async()=>{
    const rows=diagnostic.rows.map(row=>({
      time:new Date(row.at).toISOString(),
      category:row.category,
      kind:row.kind,
      title:row.title,
      detail:row.detail
    }));
    try {
      await navigator.clipboard.writeText(JSON.stringify({
        schema:'opencode-diagnostics-v1',note:'脱敏元数据；不含命令、请求正文、响应正文与认证头',events:rows
      },null,2));
      diagCopyButton.textContent='已复制';
    } catch {
      diagCopyButton.textContent='复制失败（浏览器权限）';
    }
    setTimeout(()=>{diagCopyButton.textContent='复制脱敏日志';},2200);
  });
  setView('usage');

  const nativeTab = node('.native-tab');
  let observedPanel = null;

  function setOpen(open) {
    state.open = Boolean(open);
    host.dataset.open = String(state.open);
    nativeTab.setAttribute('aria-pressed', String(state.open));
    writeStore(CONFIG.openKey, state.open);
    syncPlacement();
    if (state.open && state.session) { void refresh(true); void pollMessages(); }
  }

  nativeTab.addEventListener('click', () => setOpen(!state.open));
  node('.collapse').addEventListener('click', () => setOpen(false));
  node('.refresh').addEventListener('click', () => void refresh(true));


  // v1.19.2 has an unambiguous [data-component="reasoning-part"] marker.
  // CSS-only collapse inside that marker keeps text/tool rows and Solid's
  // reconciled tree untouched. The separate local setting is not the native
  // "Show reasoning summaries" switch, which controls whether the part exists.
  const REASON_SELECTOR = '[data-component="reasoning-part"]';
  const perPartThinking = new Map();
  const thinkingToggle = node('.oc-thinking-toggle');
  const thinkingStyle = document.createElement('style');
  thinkingStyle.id = 'oc-web-usage-thinking-style';
  thinkingStyle.textContent = `
    ${REASON_SELECTOR}::before {
      content: "▾ 思考内容 · 点击折叠";
      display: block;
      width: fit-content;
      max-width: 100%;
      padding: 5px 10px;
      margin: 0 0 8px 0;
      border-radius: 6px;
      background: var(--v2-background-bg-layer-01, var(--background-stronger, #edf1f6));
      color: var(--v2-text-text-muted, var(--text-weak, #5c6879));
      font-size: 12px;
      line-height: 22px;
      font-weight: 550;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
    }
    html[data-oc-reasoning-default="collapsed"] ${REASON_SELECTOR}:not([data-oc-reasoning-open="true"]) > *,
    html[data-oc-reasoning-default="expanded"] ${REASON_SELECTOR}[data-oc-reasoning-open="false"] > * {
      display: none !important;
    }
    html[data-oc-reasoning-default="collapsed"] ${REASON_SELECTOR}:not([data-oc-reasoning-open="true"])::before,
    html[data-oc-reasoning-default="expanded"] ${REASON_SELECTOR}[data-oc-reasoning-open="false"]::before {
      content: "▸ 思考内容已折叠 · 点击展开";
      margin-bottom: 0;
    }
    @media (prefers-reduced-motion: reduce) {
      ${REASON_SELECTOR}::before { transition: none; }
    }
  `;
  document.head.appendChild(thinkingStyle);

  function thinkingKey(part) {
    const id = part.getAttribute('data-timeline-part-id');
    return id && currentSession() ? currentSession() + ':' + id : null;
  }
  function restoreThinkingPart(part) {
    if (!(part instanceof HTMLElement)) return;
    const key = thinkingKey(part);
    if (!key || !perPartThinking.has(key)) return;
    part.dataset.ocReasoningOpen = String(perPartThinking.get(key));
  }
  function scanNewThinking(node) {
    if (!(node instanceof Element)) return;
    const rootIsReasoning = node.matches(REASON_SELECTOR);
    // Streamed markdown frequently adds descendant nodes. Those are never
    // new reasoning parts; skip subtree scans on every token delta.
    if (!rootIsReasoning && node.closest(REASON_SELECTOR)) return;
    if (rootIsReasoning) restoreThinkingPart(node);
    for (const part of node.querySelectorAll(REASON_SELECTOR)) restoreThinkingPart(part);
  }
  const thinkingObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) scanNewThinking(node);
      }
    }
  });

  function updateThinkingToggle() {
    document.documentElement.dataset.ocReasoningDefault =
      state.thinkingCollapsed ? 'collapsed' : 'expanded';
    thinkingToggle.textContent = state.thinkingCollapsed ? '已开启' : '已关闭';
    thinkingToggle.setAttribute('aria-pressed', String(state.thinkingCollapsed));
    thinkingToggle.title = state.thinkingCollapsed
      ? '新出现的思考内容默认折叠，单段可展开'
      : '新出现的思考内容默认展开，单段可折叠';
  }
  thinkingToggle.addEventListener('click', () => {
    state.thinkingCollapsed = !state.thinkingCollapsed;
    writeStore(CONFIG.thinkingKey, state.thinkingCollapsed);
    perPartThinking.clear();
    document.querySelectorAll(REASON_SELECTOR + '[data-oc-reasoning-open]')
      .forEach((part) => part.removeAttribute('data-oc-reasoning-open'));
    updateThinkingToggle();
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const part = target.closest(REASON_SELECTOR);
    if (!(part instanceof HTMLElement) || !currentSession()) return;
    const override = part.getAttribute('data-oc-reasoning-open');
    const expanded = override === null ? !state.thinkingCollapsed : override === 'true';
    if (expanded) {
      // Expanded blocks should respond only to clicks on our pseudo-header:
      // normal markdown selection, hyperlinks and code actions remain native.
      const bounds = part.getBoundingClientRect();
      if (event.clientY < bounds.top || event.clientY > bounds.top + 34) return;
      if (target.closest('a, button, input, textarea, select, summary')) return;
    }
    const next = !expanded;
    part.dataset.ocReasoningOpen = String(next);
    const key = thinkingKey(part);
    if (key) {
      perPartThinking.set(key, next);
      if (perPartThinking.size > 500) {
        perPartThinking.delete(perPartThinking.keys().next().value);
      }
    }
  }, true);
  updateThinkingToggle();
  thinkingObserver.observe(document.body, { childList: true, subtree: true });

  // Native side panels belong to the Solid extension host. Portals are anchored
  // by geometry only: we do not insert nodes into its tab list or content tree.
  // This avoids the blank-screen regression of v0.2.0.
  document.body.appendChild(host);

  function onNativeTabInput(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[role="tab"]') ||
        target.closest('[data-slot="session-side-panel-actions"]') ||
        target.closest('[data-slot="tabs-trigger-close-button"]')) {
      if (state.open) setOpen(false);
    }
  }

  function syncPlacement() {
    const panel = document.getElementById('review-panel');
    const bar = panel?.querySelector('.session-review-v2-tabs-bar');
    const tablist = bar?.querySelector('[role="tablist"]');
    const rect = panel?.getBoundingClientRect();
    const barRect = bar?.getBoundingClientRect();

    // Do not show a duplicate external dock; only attach to the actual context side panel.
    const visible = Boolean(
      state.session && panel && tablist && barRect && rect &&
      rect.width > 190 && rect.height > 140 &&
      panel.getAttribute('aria-hidden') !== 'true' &&
      !panel.hasAttribute('inert')
    );
    host.hidden = !visible;

    if (panel !== observedPanel) {
      observedPanel?.removeEventListener('pointerdown', onNativeTabInput, true);
      observedPanel = panel;
      observedPanel?.addEventListener('pointerdown', onNativeTabInput, true);
    }
    if (!visible) return;

    const nativeControls = [...tablist.querySelectorAll('button, [role="tab"]')];
    const rightmost = nativeControls.reduce((right, element) => {
      const box = element.getBoundingClientRect();
      return box.width && box.height ? Math.max(right, box.right) : right;
    }, tablist.getBoundingClientRect().left);

    // Align after Context and the native "+" button. If space is tight, stay
    // in the right end of the same header rather than moving OpenCode's nodes.
    const width = 88;
    const x = Math.max(
      barRect.left + 10,
      Math.min(rightmost + 8, barRect.right - width - 8)
    );
    const tabY = Math.max(barRect.top, barRect.top + (barRect.height - 33) / 2);
    const contentTop = Math.max(barRect.bottom, rect.top + 36);
    const contentHeight = Math.max(0, rect.bottom - contentTop - 1);

    host.style.setProperty('--oc-tab-left', x.toFixed(1) + 'px');
    host.style.setProperty('--oc-tab-top', tabY.toFixed(1) + 'px');
    host.style.setProperty('--oc-panel-left', (rect.left + 1).toFixed(1) + 'px');
    host.style.setProperty('--oc-panel-top', contentTop.toFixed(1) + 'px');
    host.style.setProperty('--oc-panel-width', Math.max(0, rect.width - 2).toFixed(1) + 'px');
    host.style.setProperty('--oc-panel-height', contentHeight.toFixed(1) + 'px');
  }

  function detectTheme() {
    const candidates = [document.documentElement, document.body, document.getElementById('root')];
    for (const element of candidates) {
      const value = (element?.getAttribute('data-color-scheme') ||
        element?.getAttribute('data-theme') || '').toLowerCase();
      if (value === 'dark' || value === 'light') return value;
    }
    for (const element of [
      document.querySelector('[data-slot="session-chat-panel"]'),
      document.querySelector('main.contain-content'),
      document.getElementById('root'), document.body,
    ]) {
      if (!element) continue;
      const color = getComputedStyle(element).backgroundColor;
      const match = color.match(/rgba?\(([^)]+)\)/);
      if (!match) continue;
      const rgba = match[1].split(/[\s,\/]+/).map(Number);
      if (rgba.length >= 4 && rgba[3] < 0.1) continue;
      const [red, green, blue] = rgba;
      if (![red, green, blue].every(Number.isFinite)) continue;
      return (red * .2126 + green * .7152 + blue * .0722) < 135 ? 'dark' : 'light';
    }
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  async function jsonGET(path) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' (' + path + ')');
    if (!(response.headers.get('content-type') || '').includes('json')) {
      throw new Error('接口未返回 JSON');
    }
    return response.json();
  }
  function normalize(info) {
    const t = info.tokens || {};
    const input = number(t.input);
    const output = number(t.output);
    const reasoning = number(t.reasoning);
    const read = number(t.cache?.read);
    const write = number(t.cache?.write);
    return {
      input, output, reasoning, read, write,
      total: input + output + reasoning + read + write,
      cost: number(info.cost),
      model: typeof info.model === 'string' ? info.model : (info.model?.id || info.modelID || ''),
      provider: info.model?.providerID || info.providerID || '',
    };
  }
  async function loadStats(id) {
    const encoded = encodeURIComponent(id);
    // First prefer the V2 aggregate that worked on the user's OpenCode Web.
    for (const path of ['/api/session/' + encoded, '/session/' + encoded]) {
      try {
        const body = await jsonGET(path);
        const info = body?.data ?? body;
        if (info?.tokens && typeof info.tokens === 'object') {
          return { ...normalize(info), source: path.startsWith('/api/') ? 'V2 会话汇总' : 'V1 会话汇总', messages: null };
        }
      } catch { /* Older servers may not provide this endpoint. */ }
    }
    // Older versions provide per-message usage instead of a session aggregate.
    let payload;
    try {
      payload = await jsonGET('/session/' + encoded + '/message?limit=10000');
    } catch {
      payload = await jsonGET('/api/session/' + encoded + '/message?limit=10000');
    }
    const rows = Array.isArray(payload) ? payload : (payload?.data ?? []);
    if (!Array.isArray(rows)) throw new Error('消息 API 格式不符合预期');
    const sum = {
      input: 0, output: 0, reasoning: 0, read: 0, write: 0,
      total: 0, cost: 0, model: '', provider: '', messages: 0, source: '消息累计',
    };
    for (const item of rows) {
      const info = item?.info ?? item;
      if (info?.role !== 'assistant') continue;
      const row = normalize(info);
      for (const key of ['input', 'output', 'reasoning', 'read', 'write', 'total', 'cost']) {
        sum[key] += row[key];
      }
      sum.messages++;
      if (row.model) { sum.model = row.model; sum.provider = row.provider; }
    }
    return sum;
  }
  function resetView() {
    clearPerf();
    Object.values(values).forEach((item) => { item.textContent = '—'; });
    Object.values(segments).forEach((item) => { item.style.width = '0%'; });
  }

  function showStats(stats) {
    const cacheDenominator = stats.input + stats.read;
    const rendered = {
      ...stats,
      total: format(stats.total),
      input: format(stats.input),
      output: format(stats.output),
      reasoning: format(stats.reasoning),
      read: format(stats.read),
      write: format(stats.write),
      cost: dollar(stats.cost),
      hitRate: cacheDenominator ? (stats.read / cacheDenominator * 100).toFixed(1) + '%' : '—',
      model: [stats.provider, stats.model].filter(Boolean).join('/') || '—',
    };
    for (const [key, element] of Object.entries(values)) element.textContent = String(rendered[key] ?? '—');
    const total = stats.total;
    for (const [key, element] of Object.entries(segments)) {
      element.style.width = total > 0 ? (number(stats[key]) / total * 100).toFixed(3) + '%' : '0%';
    }
    status.textContent = stats.source + ' · ' + new Date().toLocaleTimeString('zh-CN') + ' · ' + state.session;
  }

  async function refresh(force = false) {
    if (!state.session || state.pending || (!force && (document.hidden || !state.open))) return;
    state.pending = true;
    const id = state.session;
    const generation = state.generation;
    refreshBtn.disabled = true;
    status.textContent = '读取本地会话数据中…';
    try {
      const stats = await loadStats(id);
      if (state.generation !== generation || currentSession() !== id) return;
      showStats(stats);
    } catch (error) {
      if (state.generation !== generation || currentSession() !== id) return;
      status.textContent = '读取失败：' + (error?.message || String(error));
      resetView();
    } finally {
      const switched = state.generation !== generation;
      state.pending = false;
      refreshBtn.disabled = false;
      if (switched && state.session && state.open) void refresh(true);
    }
  }



  // 1.x emits message.* events on /global/event and /event.
  // 2.x emits session.step.* on /api/event. Bounded polling of V1 messages
  // provides a fallback when the SSE endpoint/delta stream is unavailable.
  const perf = {
    session: null, attempts: new Map(), completed: new Map(), latest: null,
    pollReady: false, polling: false, pollStatus: '尚未查询',
    sseConnected: false, sseStatus: '检查接口中', drops: 0,
  };
  const eventPaths = ['/global/event', '/event', '/api/event'];
  let eventSource = null;
  let candidateIndex = 0;
  let retryTimer = null;
  const epoch = (value) => {
    const n = typeof value === 'number' ? value :
      typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  function countTokens(t) {
    if (!t) return 0;
    return number(t.input) + number(t.output) + number(t.reasoning) +
      number(t.cache?.read) + number(t.cache?.write);
  }
  function clearPerf() {
    perf.session = state.session;
    perf.attempts.clear();
    perf.completed.clear();
    perf.latest = null;
    perf.pollReady = false;
    perf.pollStatus = '待同步消息';
    renderPerformance();
  }
  function storeMetric(key, m) {
    if (!key || !m || !Number.isFinite(m.time)) return;
    if (m.total > 0) perf.completed.set(key, m);
    if ((m.tps !== null && m.tps !== undefined ||
         m.ttft !== null && m.ttft !== undefined) &&
        (!perf.latest || m.time >= perf.latest.time))
      perf.latest = m;
  }
  function renderPerformance() {
    const now = Date.now();
    for (const [id, value] of perf.completed) {
      if (value.time < now - 60000) perf.completed.delete(id);
    }
    for (const [id, value] of perf.attempts) {
      if (value.start && now - value.start > 180000) perf.attempts.delete(id);
    }
    perfValues.tps.textContent = perf.latest?.tps == null
      ? '—' : perf.latest.tps.toFixed(1) + ' tok/s';
    perfValues.ttft.textContent = perf.latest?.ttft == null
      ? '—' : Math.round(perf.latest.ttft) + ' ms';
    perfValues.tpm.textContent = perf.pollReady || perf.completed.size
      ? format([...perf.completed.values()].reduce((x, row) => x + row.total, 0))
      : '—';
    perfStatus.textContent =
      '事件：' + perf.sseStatus + '；消息：' + perf.pollStatus +
      (perf.latest ? '；来源：' + perf.latest.source : '') +
      '。TPM 为近 60 秒已完成请求累计用量，非服务商配额。' +
      'TPS/TTFT 缺少首输出时间时显示 —。';
  }

  function markFirst(id, ts) {
    if (!id || !ts) return;
    const p = perf.attempts.get(id) || { start: null, first: null };
    if (p.first === null || p.first === undefined || ts < p.first) p.first = ts;
    perf.attempts.set(id, p);
  }
  function collectMessage(info, parts = []) {
    if (info?.role !== 'assistant' || !info.id) return;
    const start = epoch(info.time?.created);
    const end = epoch(info.time?.completed);
    const pending = perf.attempts.get(info.id) || { start: null, first: null };
    if (start) pending.start = start;
    if (start && !end) perf.attempts.set(info.id, pending);
    if (!start || !end || end < start) return;
    const candidates = (Array.isArray(parts) ? parts : [])
      .filter(p => (p?.type === 'text' || p?.type === 'reasoning') &&
        typeof p.text === 'string' && p.text.trim())
      .map(p => epoch(p.time?.start))
      .filter(t => t !== null && t >= start && t <= end);
    const fromParts = candidates.length > 0;
    const first = fromParts ? Math.min(...candidates) :
      (pending.first && pending.first >= start && pending.first <= end
        ? pending.first : null);
    const secs = first == null ? 0 : (end - first) / 1000;
    const output = number(info.tokens?.output);
    storeMetric(info.id, {
      time: end, total: countTokens(info.tokens),
      tps: secs > 0 && output > 0 ? output / secs : null,
      ttft: first == null ? null : first - start,
      source: fromParts ? 'V1 part 首输出时间（近似）' :
        first !== null ? 'V1 SSE 首输出（近似）' : 'V1 消息记录',
    });
    perf.attempts.delete(info.id);
  }

  function receivePerfEvent(raw) {
    const e = raw?.payload?.type ? raw.payload : raw;
    if (!e || typeof e.type !== 'string') return;
    const d = e.data ?? e.properties ?? {};
    const id = d.sessionID ?? d.info?.sessionID ?? d.part?.sessionID;
    if (!id || !state.session || id !== state.session || id !== currentSession()) return;
    const msgID = d.assistantMessageID ?? d.info?.id ?? d.part?.messageID ?? d.messageID;
    const time = epoch(e.created) ?? Date.now();
    if (e.type === 'message.updated') {
      collectMessage(d.info);
    } else if (e.type === 'message.part.updated') {
      const p = d.part;
      if ((p?.type === 'text' || p?.type === 'reasoning') &&
          typeof p.text === 'string' && p.text.trim() && epoch(p.time?.start))
        markFirst(p.messageID, epoch(p.time.start));
    } else if (e.type === 'message.part.delta') {
      if (typeof d.delta === 'string' && d.delta.trim() &&
        (d.field === 'text' || d.field === undefined))
        markFirst(d.messageID, time);
    } else if (e.type === 'session.step.started') {
      perf.attempts.set(msgID, { start: epoch(d.started) ?? time, first: null, streamed: null });
    } else if (e.type === 'session.text.delta' || e.type === 'session.reasoning.delta') {
      if (typeof d.delta === 'string' && d.delta.trim()) markFirst(msgID, time);
    } else if (e.type === 'session.step.streamed') {
      const p = perf.attempts.get(msgID);
      if (p) p.streamed = time;
    } else if (e.type === 'session.step.ended') {
      const p = perf.attempts.get(msgID);
      perf.attempts.delete(msgID);
      if (p?.start && d.tokens) {
        const secs = p.streamed ? (p.streamed - p.start) / 1000 : 0;
        const tps = secs > 0 && number(d.tokens.output) > 0
          ? number(d.tokens.output) / secs : null;
        const ttft = p.first != null && p.first >= p.start ? p.first - p.start : null;
        storeMetric(msgID, {
          time, total: countTokens(d.tokens), tps, ttft,
          source: 'V2 实时事件（流式总耗时）',
        });
      }
    } else if (e.type === 'session.step.failed') {
      perf.attempts.delete(msgID);
    }
    renderPerformance();
  }

  function connectPerformance() {
    if (eventSource) return;
    if (!('EventSource' in window)) {
      perf.sseStatus = '浏览器不支持 EventSource，使用消息轮询';
      renderPerformance();
      return;
    }
    if (candidateIndex >= eventPaths.length) {
      perf.sseStatus = '接口均不可用，稍后重试';
      renderPerformance();
      retryTimer = setTimeout(() => {
        candidateIndex = 0;
        retryTimer = null;
        connectPerformance();
      }, 60000);
      return;
    }
    const url = eventPaths[candidateIndex];
    perf.sseStatus = '探测 ' + url;
    renderPerformance();
    let source;
    try {
      source = new EventSource(url, { withCredentials: true });
    } catch (error) {
      perf.sseStatus = '无法连接 ' + url + '，尝试回退';
      candidateIndex++;
      renderPerformance();
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connectPerformance();
      }, 1000);
      return;
    }
    eventSource = source;
    let opened = false;
    let moved = false;
    let timeout = setTimeout(() => { if (!opened) next(); }, 6000);
    function next() {
      if (moved) return;
      moved = true;
      clearTimeout(timeout);
      source.close();
      if (eventSource === source) eventSource = null;
      perf.sseConnected = false;
      perf.attempts.clear();
      if (!opened || ++perf.drops >= 3) {
        candidateIndex++;
        perf.drops = 0;
      }
      perf.sseStatus = '断开 ' + url + '，使用消息轮询';
      renderPerformance();
      if (diagnostic.enabled && activeView === 'diagnostics') renderDiagnostic();
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connectPerformance();
      }, opened ? 3000 : 350);
    }
    source.addEventListener('open', () => {
      if (moved) return;
      if (diagnostic.enabled && activeView === 'diagnostics') renderDiagnostic();
      clearTimeout(timeout);
      opened = true;
      perf.sseConnected = true;
      perf.sseStatus = '已连接 ' + url;
      renderPerformance();
      if (diagnostic.enabled && activeView === 'diagnostics') renderDiagnostic();
    });
    source.addEventListener('error', next);
    const receiver = (e) => {
      try {
        const value = JSON.parse(e.data);
        readEventForDiagnostics(value);
        receivePerfEvent(value);
      } catch { /* ignore malformed event */ }
    };
    source.addEventListener('message', receiver);
    for (const name of [
      'message.updated', 'message.part.updated', 'message.part.delta',
      'session.step.started', 'session.step.streamed', 'session.step.ended',
      'session.step.failed', 'session.text.delta', 'session.reasoning.delta',
      'session.error', 'session.retry', 'session.next.step.started',
      'session.next.step.ended', 'session.next.step.failed',
      'session.next.retried','session.next.tool.called',
      'session.next.tool.success','session.next.tool.failed',
      'session.next.shell.started','session.next.shell.ended',
    ]) source.addEventListener(name, receiver);
  }

  async function pollMessages() {
    const id = state.session;
    if (!id || !state.open || perf.polling || document.hidden) return;
    perf.polling = true;
    const gen = state.generation;
    let error = '无兼容列表';
    try {
      for (const path of [
        '/session/' + encodeURIComponent(id) + '/message?limit=80',
        '/api/session/' + encodeURIComponent(id) + '/message?limit=80',
      ]) {
        try {
          const payload = await jsonGET(path);
          const rows = Array.isArray(payload) ? payload : payload?.data;
          if (!Array.isArray(rows)) throw Error('未返回消息列表');
          if (gen !== state.generation || id !== currentSession()) return;
          perf.pollReady = true;
          perf.pollStatus = '已同步最近 ' + rows.length + ' 条';
          for (const item of rows) {
            collectMessage(item?.info ?? item, item?.parts ?? item?.content ?? []);
            if (diagnostic.enabled) {
              for (const part of item?.parts || []) recordToolPart(part,Date.now(),'消息轮询');
            }
          }
          return;
        } catch (e) { error = e?.message || String(e); }
      }
      if (gen === state.generation && id === currentSession())
        perf.pollStatus = '消息接口不可用（' + error + '）';
    } finally {
      perf.polling = false;
      renderPerformance();
    }
  }

  function syncRoute() {
    const id = currentSession();
    host.dataset.theme = detectTheme();
    if (id !== state.session) {
      if (diagnostic.enabled) stopDiagnostics();
      diagnostic.rows=[];
      diagnostic.seen.clear();
      diagnostic.rawLock=false;
      if (activeView === 'diagnostics') renderDiagnostic(true);
      state.session = id;
      state.generation++;
      resetView();
      void pollMessages();
      status.textContent = id ? '即将读取 ' + id : '请打开会话';
      if (id && state.open) void refresh(true);
    }
    syncPlacement();
  }

  syncRoute();
  connectPerformance();
  setInterval(syncRoute, CONFIG.routeCheckMs);
  setInterval(renderPerformance, 1000);
  setInterval(() => void pollMessages(), CONFIG.refreshMs);
  setInterval(() => void refresh(), CONFIG.refreshMs);
  window.addEventListener('resize', syncPlacement);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { syncRoute(); void refresh(); }
  });
})();
