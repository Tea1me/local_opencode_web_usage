// ==UserScript==
// @name         OpenCode Web 原生侧栏使用量
// @namespace    https://github.com/Tea1me/local_opencode_web_usage
// @version      0.6.1
// @description  修复 OpenCode 1.19.x 性能采集，补充 SSE 与消息轮询回退
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
        <div class="content">
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
          <div class="subhead">会话详情</div>
          <div class="rows">
            <span class="label" title="缓存读取 Token /（缓存读取 + 未缓存输入）；不是请求级命中率">输入缓存复用占比</span><span class="value" data-value="hitRate">—</span>
            <span class="label">当前/最近模型</span><span class="value" data-value="model">—</span>
            <span class="label">助手消息数</span><span class="value" data-value="messages">—</span>
          </div>
          <div class="foot">当前会话累计统计 · 每 10 秒刷新<br>
            费用以 OpenCode API 记录为准；累计 Token 不等于上下文窗口占用。缓存读写是模型服务商上报的累计 Token，不是本地磁盘缓存容量；隐式缓存可能读取很高但创建一直为 0。
            与 TUI 的 opencode-tokenwatch 性能数据独立。</div>
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
      messages: stats.messages == null ? '—（会话汇总）' : format(stats.messages),
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
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connectPerformance();
      }, opened ? 3000 : 350);
    }
    source.addEventListener('open', () => {
      if (moved) return;
      clearTimeout(timeout);
      opened = true;
      perf.sseConnected = true;
      perf.sseStatus = '已连接 ' + url;
      renderPerformance();
    });
    source.addEventListener('error', next);
    const receiver = (e) => {
      try { receivePerfEvent(JSON.parse(e.data)); } catch { /* ignore malformed event */ }
    };
    source.addEventListener('message', receiver);
    for (const name of [
      'message.updated', 'message.part.updated', 'message.part.delta',
      'session.step.started', 'session.step.streamed', 'session.step.ended',
      'session.step.failed', 'session.text.delta', 'session.reasoning.delta',
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
          for (const item of rows) collectMessage(item?.info ?? item, item?.parts ?? item?.content ?? []);
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
