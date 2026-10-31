/* 肠道菌群生态模拟器 · 界面层（面板、仪表盘、科普弹窗） */
(function (root) {
  'use strict';
  const GUT = (root.GUT = root.GUT || {});
  const S = GUT.SPECIES;
  const IX = GUT.SPECIES_INDEX;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const $ = (id) => document.getElementById(id);
  const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

  const ROLE_TEXT = {
    core: '核心居民',
    beneficial: '有益功能菌',
    opportunistic: '条件致病菌',
    pathogen: '病原菌',
  };
  const ROLE_COLOR = {
    core: '#F5B944',
    beneficial: '#34D399',
    opportunistic: '#FF6B4A',
    pathogen: '#D946EF',
  };

  function sup(n) {
    return String(n).split('').map((c) => SUP[c] || c).join('');
  }
  function cfu(units) {
    const v = units * 1e9;
    if (v < 1e6) return v.toFixed(0);
    const e = Math.floor(Math.log10(v));
    const m = v / Math.pow(10, e);
    return `${m.toFixed(1)}×10${sup(e)}`;
  }
  function pct1(v) { return (v * 100).toFixed(1) + '%'; }

  function toneColor(v, invert) {
    const t = clamp(invert ? 1 - v : v, 0, 1);
    if (t < 0.34) return '#FF6B4A';
    if (t < 0.6) return '#F5B944';
    return '#34D399';
  }

  GUT.createUI = function (opts) {
    const sim = opts.sim;
    const R = opts.renderer;
    const U = { selected: null, flags: {}, history: [], lastHistDay: -1 };

    /* ============ 顶栏指标 chips ============ */
    const CHIPS = [
      { key: 'diversity', label: '多样性 Shannon', get: () => sim.diversity, fmt: (v) => (v * 100).toFixed(0) + '%', note: () => (sim.diversity > 0.75 ? '丰富' : sim.diversity > 0.55 ? '下降' : '严重降低') },
      { key: 'butyrate', label: '丁酸水平', get: () => clamp(sim.butyrate, 0, 1), fmt: (v) => (v * 100).toFixed(0) + '%', note: () => (sim.butyrate > 0.6 ? '充足' : sim.butyrate > 0.3 ? '偏低' : '匮乏') },
      { key: 'barrier', label: '肠屏障', get: () => sim.barrier, fmt: (v) => (v * 100).toFixed(0) + '%', note: () => (sim.barrier > 0.65 ? '完整' : sim.barrier > 0.35 ? '变薄' : '受损') },
      { key: 'inflammation', label: '炎症水平', get: () => sim.inflammation, fmt: (v) => (v * 100).toFixed(0) + '%', note: () => (sim.inflammation < 0.25 ? '静息' : sim.inflammation < 0.55 ? '激活' : '炎症风暴'), invert: true },
    ];
    const chipEls = [];
    function buildChips() {
      const box = $('chips');
      box.innerHTML = '';
      CHIPS.forEach((c) => {
        const el = document.createElement('div');
        el.className = 'chip';
        el.innerHTML = `<span>${c.label}</span><b>—</b><small>—</small>`;
        box.appendChild(el);
        chipEls.push(el);
      });
    }

    /* ============ 环境滑块 ============ */
    const sliderEls = [];
    function buildEnv() {
      const box = $('env');
      box.innerHTML = '';
      GUT.ENV.forEach((e) => {
        const row = document.createElement('div');
        row.className = 'envRow';
        const tone = e.key === 'abx' ? 'danger' : e.key === 'stress' || e.key === 'protein' ? 'warn' : '';
        row.innerHTML =
          `<div class="envHead"><label>${e.label}</label><b>${e.value}</b><i class="envShift"></i></div>` +
          `<input type="range" min="0" max="100" step="1" value="${e.value}" class="${tone}" />` +
          `<p class="envHint">${e.hint}</p>`;
        const input = row.querySelector('input');
        const val = row.querySelector('b');
        const shift = row.querySelector('.envShift');
        const setP = () => input.style.setProperty('--p', ((input.value - 0) / 100) * 100 + '%');
        setP();
        input.addEventListener('input', () => {
          sim.env[e.key] = +input.value;
          setP();
          U.syncEnv();
          if (opts.onEnvChange) opts.onEnvChange(e.key, +input.value);
        });
        box.appendChild(row);
        sliderEls.push({ key: e.key, input, val, shift });
      });
    }
    /* 数值显示的是"基础值 + 状态档案偏移"后的实际生效值 */
    U.syncEnv = function () {
      sliderEls.forEach((s) => {
        const off = (sim.profEnv && sim.profEnv[s.key]) || 0;
        const eff = clamp(sim.env[s.key] + off, 0, 100);
        s.input.value = sim.env[s.key];
        s.val.textContent = Math.round(eff);
        s.input.style.setProperty('--p', sim.env[s.key] + '%');
        if (s.shift) {
          const offI = Math.round(off);
          s.shift.textContent = offI ? (offI > 0 ? '档案 +' + offI : '档案 ' + offI) : '';
          s.shift.classList.toggle('on', !!off);
          s.shift.title = off ? `基础 ${sim.env[s.key]} · 状态档案 ${off > 0 ? '+' : ''}${off}` : '';
        }
      });
    };

    /* ============ 事件按钮 ============ */
    function buildEvents() {
      const box = $('events');
      box.innerHTML = '';
      GUT.EVENTS.forEach((e) => {
        const info = GUT.EVENT_INFO[e.id];
        const b = document.createElement('button');
        b.className = 'evBtn ' + e.tone;
        b.innerHTML = `<span>${e.label}</span><i class="evInfo" title="查看解释">?</i>`;
        b.title = e.note;
        b.querySelector('.evInfo').addEventListener('click', (ev) => {
          ev.stopPropagation();
          openEvent(e.id);
        });
        b.addEventListener('click', () => {
          sim.fire(e.id);
          U.toast(e.note);
          if (e.id === 'reset') { U.syncEnv(); U.selected = null; R.highlight = null; }
          if (e.id === 'abx') for (let i = 0; i < 4; i++) R.rings.push({ r: 10 + i * 40, life: 1 });
          if (e.id === 'fmt') U.flags.fmtDone = true;
        });
        box.appendChild(b);
      });
    }

    /* ============ 画布工具 ============ */
    const TOOLS = [
      { id: 'probe', label: '观察' },
      { id: 'probiotic', label: '投放益生菌' },
      { id: 'fiber', label: '投放纤维' },
    ];
    function buildTools() {
      const box = $('tools');
      box.innerHTML = '';
      TOOLS.forEach((t) => {
        const b = document.createElement('button');
        b.className = 'toolBtn' + (t.id === 'probe' ? ' on' : '');
        b.textContent = t.label;
        b.addEventListener('click', () => {
          R.tool = t.id;
          [...box.children].forEach((c) => c.classList.remove('on'));
          b.classList.add('on');
          $('canvasHint').textContent =
            t.id === 'probe' ? '点击任意菌体 → 查看它的科普卡片' : '在肠腔内点击 → ' + t.label;
        });
        box.appendChild(b);
      });
    }

    /* ============ 我的状态档案（疾病 / 心理 / 作息 / 周期 / 用药） ============ */
    const PF = GUT.PROFILE_ITEMS;
    const PFI = GUT.PROFILE_INDEX;
    const pfChipEls = {};
    const MOL_DIR = {
      up: { s: '↑', c: '#FF6B4A', t: '升高' },
      down: { s: '↓', c: '#7B93B8', t: '降低' },
      flat: { s: '→', c: '#F5B944', t: '波动' },
    };
    const uniq = (arr) => {
      const seen = {}, out = [];
      arr.forEach((x) => { if (!seen[x]) { seen[x] = 1; out.push(x); } });
      return out;
    };
    const signed = (v, unit) => (v > 0 ? '+' : '') + v.toFixed(0) + (unit || '');

    function molRows(mols) {
      return mols.map((m, i) => {
        const d = MOL_DIR[m.dir] || MOL_DIR.flat;
        return `<div class="molRow">
          <div class="molHead"><i class="molDot" style="background:${MOL_PALETTE[i % MOL_PALETTE.length]}"></i><b>${m.name}</b><em style="color:${d.c}">${d.s} ${d.t}</em></div>
          <div class="molOrgan"><span class="molTo">作用于</span>${m.organ}</div>
          <p>${m.desc}</p>
        </div>`;
      }).join('');
    }

    /* 小分子卡片的正面摘要：先给方向，再看细节 */
    function molBrief(mols) {
      if (!mols || !mols.length) return '点击查看这条状态涉及的关键分子';
      const names = mols.slice(0, 3).map((m) => {
        const d = MOL_DIR[m.dir] || MOL_DIR.flat;
        return `${m.name} ${d.s}`;
      }).join('、');
      return `${names} 等 ${mols.length} 个分子——展开看它们分别作用在哪里`;
    }

    /* ---------- 小分子动态示意图（与主画布同风格：菌群 → 屏障 → 靶器官） ---------- */
    const MOL_PALETTE = ['#2DD4BF', '#F5B944', '#A78BFA', '#7DD3FC', '#F472B6', '#C3E34A', '#FF8A5C', '#8CE99A', '#FFD166', '#9775FA'];
    let molAnims = [];

    function molDiagram(cv, mols) {
      const ctx = cv.getContext('2d');
      const TAU = Math.PI * 2;
      const MONO = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
      const SANS = '600 13px -apple-system, PingFang SC, sans-serif';
      const DIRF = '10.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      const ORGAN = '12px -apple-system, PingFang SC, sans-serif';
      const rowH = 48;
      const topPad = 34, botPad = 14;
      let W = 560, H = topPad + mols.length * rowH + botPad;
      let t = 0, last = 0, raf = 0, running = false, focus = null, flora = null;

      const rows = mols.map((m, i) => {
        const d = MOL_DIR[m.dir] || MOL_DIR.flat;
        return {
          m,
          y: topPad + i * rowH + rowH / 2,
          color: MOL_PALETTE[i % MOL_PALETTE.length],
          speed: m.dir === 'up' ? 34 : m.dir === 'down' ? 13 : 24,
          n: m.dir === 'up' ? 5 : m.dir === 'down' ? 2 : 3,
          alpha: m.dir === 'up' ? 0.95 : m.dir === 'down' ? 0.5 : 0.75,
          sym: d.s, dirT: d.t,
          organLines: [''], organW: 0, pathX0: 112, pathX1: 400,
          ps: [], pulses: [],
        };
      });

      function fitText(txt, maxW) {
        let x = String(txt == null ? '' : txt);
        if (ctx.measureText(x).width <= maxW) return x;
        while (x.length > 1 && ctx.measureText(x + '…').width > maxW) x = x.slice(0, -1);
        return x + '…';
      }

      /* 按可用宽度折行，最多 maxLines 行；仍放不下则末尾省略 */
      function wrapText(txt, maxW, maxLines) {
        const src = String(txt == null ? '' : txt);
        if (!src) return [''];
        if (ctx.measureText(src).width <= maxW) return [src];
        /* 优先在分隔符处断开，读起来更自然 */
        const parts = src.split(/[·、,，/ ]/);
        const lines = [];
        let cur = '';
        parts.forEach((p) => {
          const seg = p.trim();
          if (!seg) return;
          const next = cur ? cur + '·' + seg : seg;
          if (ctx.measureText(next).width <= maxW) cur = next;
          else {
            if (cur) lines.push(cur);
            cur = seg;
          }
        });
        if (cur) lines.push(cur);
        if (lines.length <= maxLines) return lines;
        const keep = lines.slice(0, maxLines);
        keep[maxLines - 1] = fitText(keep[maxLines - 1] + '·' + lines.slice(maxLines).join('·'), maxW);
        return keep;
      }

      function resize() {
        const w = Math.max(320, cv.clientWidth || 560);
        const dpr = window.devicePixelRatio || 1;
        W = w;
        H = topPad + mols.length * rowH + botPad;
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
        cv.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        rows.forEach((r) => {
          ctx.font = ORGAN;
          /* 右侧靶器官区尽量宽；名字太长就折成两行，不再被截断 */
          const maxW = Math.min(240, Math.max(132, W * 0.42));
          r.organLines = wrapText(r.m.organ, maxW, 2);
          r.organW = Math.max.apply(null, r.organLines.map((x) => ctx.measureText(x).width));
          r.pathX0 = 112;
          r.pathX1 = Math.max(220, W - r.organW - 48);
          while (r.ps.length < r.n) r.ps.push({ u: Math.random(), ph: Math.random() * TAU });
          r.ps.length = r.n;
        });
        if (!flora) {
          const cols = (GUT.SPECIES || []).map((x) => x.color);
          flora = [];
          for (let k = 0; k < 16; k++) flora.push({
            x: 6 + Math.random() * 82,
            y: topPad + Math.random() * (H - topPad - 10),
            s: 1.1 + Math.random() * 1.9,
            c: cols[k % Math.max(1, cols.length)] || '#2DD4BF',
            ph: Math.random() * TAU,
          });
        }
      }

      function drawBarrier() {
        const top = topPad - 8, bot = H - 2;
        /* 组织（与主画布固有层同色系） */
        const g = ctx.createLinearGradient(150, 0, 208, 0);
        g.addColorStop(0, 'rgba(122,64,85,0.9)');
        g.addColorStop(1, 'rgba(42,22,32,0.95)');
        ctx.fillStyle = g;
        ctx.fillRect(150, top, 58, bot - top);
        /* 黏液发光带 */
        const mg = ctx.createLinearGradient(130, 0, 152, 0);
        mg.addColorStop(0, 'rgba(127,231,212,0.03)');
        mg.addColorStop(1, 'rgba(127,231,212,0.3)');
        ctx.fillStyle = mg;
        ctx.fillRect(130, top, 22, bot - top);
        ctx.strokeStyle = 'rgba(160,255,238,0.32)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(152, top);
        ctx.lineTo(152, bot);
        ctx.stroke();
        /* 上皮细胞一列（胶囊 + 核，轻微蠕动） */
        for (let y = top + 6; y < bot - 12; y += 15) {
          const wob = Math.sin(t * 0.8 + y * 0.35) * 0.8;
          ctx.fillStyle = 'rgba(226,150,165,0.62)';
          ctx.beginPath();
          ctx.ellipse(161 + wob, y + 6, 4.8, 6.2, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(110,59,75,0.95)';
          ctx.beginPath();
          ctx.arc(161 + wob, y + 6, 1.9, 0, TAU);
          ctx.fill();
        }
      }

      function draw() {
        ctx.clearRect(0, 0, W, H);
        const bg = ctx.createRadialGradient(W * 0.5, H * 0.4, 10, W * 0.5, H * 0.4, Math.max(W, H) * 0.85);
        bg.addColorStop(0, '#0C171C');
        bg.addColorStop(1, '#050A0C');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        /* 分区标签（对应示意图的三个空间） */
        ctx.fillStyle = 'rgba(126,154,160,0.9)';
        ctx.font = MONO;
        ctx.textAlign = 'left';
        ctx.fillText('菌群 · 肠腔', 10, 18);
        ctx.textAlign = 'center';
        ctx.fillText('黏液层+上皮', 168, 18);
        ctx.textAlign = 'right';
        ctx.fillText('血液 → 靶器官', W - 12, 18);

        /* 肠腔菌群漂浮点 */
        ctx.save();
        ctx.globalAlpha = 0.3;
        flora.forEach((f) => {
          ctx.fillStyle = f.c;
          ctx.beginPath();
          ctx.arc(f.x + Math.sin(t * 0.6 + f.ph) * 3, f.y + Math.cos(t * 0.5 + f.ph) * 2.5, f.s, 0, TAU);
          ctx.fill();
        });
        ctx.restore();

        drawBarrier();

        rows.forEach((r, i) => {
          const dim = focus != null && focus !== i;
          const a = dim ? 0.16 : 1;

          /* 虚线路径（流动感） */
          ctx.save();
          ctx.globalAlpha = a * (r.m.dir === 'down' ? 0.45 : 0.7);
          ctx.strokeStyle = r.color;
          ctx.lineWidth = 1.2;
          ctx.setLineDash([4, 5]);
          ctx.lineDashOffset = -(t * r.speed * 0.9);
          ctx.beginPath();
          ctx.moveTo(r.pathX0, r.y);
          ctx.lineTo(r.pathX1, r.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(r.pathX1 + 2, r.y - 3.5);
          ctx.lineTo(r.pathX1 + 7, r.y);
          ctx.lineTo(r.pathX1 + 2, r.y + 3.5);
          ctx.stroke();
          ctx.restore();

          /* 分子名 + 方向 */
          ctx.save();
          ctx.globalAlpha = a;
          ctx.fillStyle = r.color;
          ctx.font = SANS;
          ctx.textAlign = 'left';
          ctx.fillText(fitText(r.m.name, 100), 10, r.y - 8);
          ctx.fillStyle = 'rgba(126,154,160,0.95)';
          ctx.font = DIRF;
          ctx.fillText(r.sym + ' ' + r.dirT, 10, r.y + 11);
          ctx.restore();

          /* 发光粒子 */
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          r.ps.forEach((p) => {
            const px = r.pathX0 + (r.pathX1 - r.pathX0) * p.u;
            const py = r.y + Math.sin(t * 2 + p.ph) * 3;
            ctx.globalAlpha = a * r.alpha;
            ctx.shadowColor = r.color;
            ctx.shadowBlur = 10;
            ctx.fillStyle = r.color;
            ctx.beginPath();
            ctx.arc(px, py, 2.8, 0, TAU);
            ctx.fill();
          });
          /* 抵达靶器官的脉冲环 */
          r.pulses.forEach((p) => {
            ctx.globalAlpha = a * p.life * 0.55;
            ctx.strokeStyle = r.color;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(r.pathX1 + 14, r.y, 5 + (1 - p.life) * 18, 0, TAU);
            ctx.stroke();
          });
          ctx.restore();

          /* 靶器官：器官点 + 文字（加暗底，避免被组织纹理和粒子压住） */
          ctx.save();
          ctx.globalAlpha = a;
          ctx.fillStyle = r.color;
          const dx = r.pathX1 + 14;
          ctx.beginPath();
          ctx.arc(dx, r.y, 4, 0, TAU);
          ctx.fill();
          ctx.font = ORGAN;
          const ln = r.organLines.length || 1;
          const lh = 15;
          const boxH = ln * lh + 10;
          const tx = W - 12 - r.organW;
          ctx.globalAlpha = a * 0.82;
          ctx.fillStyle = 'rgba(5,10,13,0.94)';
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(tx - 7, r.y - boxH / 2, r.organW + 14, boxH, 7);
            ctx.fill();
          } else {
            ctx.fillRect(tx - 7, r.y - boxH / 2, r.organW + 14, boxH);
          }
          ctx.globalAlpha = a;
          ctx.fillStyle = 'rgba(226,237,240,0.98)';
          ctx.textAlign = 'right';
          r.organLines.forEach((line, k) => {
            ctx.fillText(line, W - 12, r.y + (ln === 1 ? 4 : -lh / 2 + 5 + k * lh));
          });
          ctx.restore();
        });
      }

      function frame(now) {
        if (!running) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        t += dt;
        if (cv.offsetParent === null) { running = false; return; } /* 弹窗被关闭/隐藏 */
        if (Math.abs((cv.clientWidth || 0) - W) > 2) resize();
        rows.forEach((r) => {
          const span = Math.max(40, r.pathX1 - r.pathX0);
          r.ps.forEach((p) => {
            p.u += (r.speed * dt) / span;
            if (p.u >= 1) { p.u -= 1; r.pulses.push({ life: 1 }); }
          });
          r.pulses = r.pulses.filter((p) => p.life > 0);
          r.pulses.forEach((p) => { p.life -= dt * 1.3; });
        });
        draw();
        raf = requestAnimationFrame(frame);
      }

      function start() {
        if (running) return;
        running = true;
        last = performance.now();
        resize();
        raf = requestAnimationFrame(frame);
      }
      function stop() {
        running = false;
        cancelAnimationFrame(raf);
      }

      cv.addEventListener('click', (e) => {
        const rect = cv.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const idx = rows.findIndex((r) => Math.abs(y - r.y) < rowH / 2);
        focus = focus === idx || idx < 0 ? null : idx;
      });

      return { start, stop };
    }


    /* ---------- 机制链路动态图解 ---------- */
    /* 节点由结构化数据（档案的偏移变量 + 关键分子）生成，而不是从长句里截取 */
    const molNode = (mols) => '分子：' + mols.slice(0, 2).map((m) =>
      m.name.split(/[ （(]/)[0] + (MOL_DIR[m.dir] || MOL_DIR.flat).s).join(' · ');

    function bioNodes(bio) {
      return BIO_LABEL.filter(([k]) => bio && bio[k])
        .slice(0, 3)
        .map(([k, l]) => l + (bio[k] > 0 ? ' ↑' : ' ↓'));
    }

    const shortOrgan = (organ) => String(organ || '').split(/[·、,，/]/)[0].trim();

    const hasFeedback = (text) => /正反馈|反馈环|恶性循环|循环|进一步/.test(String(text || ''));

    function chainDiagram(cv, steps, tail, feedback) {
      const ctx = cv.getContext('2d');
      const TAU = Math.PI * 2;
      const NODE_F = '12px -apple-system, PingFang SC, sans-serif';
      const nodeH = 34, rowGap = 30, gapX = 30;
      let W = 560, H = 120;
      let nodes = [], segs = [], ps = [], t = 0, last = 0, raf = 0, running = false;

      function rr(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
      }

      function layout() {
        ctx.font = NODE_F;
        const labels = steps.slice();
        if (tail) labels.push(tail);
        const boxes = labels.map((txt, i) => {
          let s = String(txt);
          const cap = 168;
          if (ctx.measureText(s).width > cap) {
            while (s.length > 1 && ctx.measureText(s + '…').width > cap) s = s.slice(0, -1);
            s += '…';
          }
          return { txt: s, w: Math.min(cap, Math.ceil(ctx.measureText(s).width) + 22), last: !tail && i === labels.length - 1, tailNode: !!tail && i === labels.length - 1 };
        });

        const maxRow = W - 24;
        let x = 14, y = feedback ? 26 : 14, rowStart = true, dir = 1;
        const placed = [];
        let rowsY = [];
        boxes.forEach((b, i) => {
          if (!rowStart && x + b.w > maxRow) {
            x = 14 + (dir > 0 ? 22 : 0);
            y += nodeH + rowGap;
            rowStart = true;
            dir = -dir;
          }
          b.x = x;
          b.y = y;
          placed.push(b);
          rowsY.push(y);
          x += b.w + gapX;
          rowStart = false;
        });
        nodes = placed;

        /* 连线：同一行用直线箭头，换行处用折返曲线 */
        segs = [];
        for (let i = 0; i < nodes.length - 1; i++) {
          const a = nodes[i], b = nodes[i + 1];
          if (Math.abs(a.y - b.y) < 2) {
            segs.push({ x1: a.x + a.w, y1: a.y + nodeH / 2, x2: b.x, y2: b.y + nodeH / 2 });
          } else {
            segs.push({
              x1: a.x + a.w, y1: a.y + nodeH / 2,
              cx1: a.x + a.w + 26, cy1: a.y + nodeH / 2,
              cx2: b.x - 26, cy2: b.y + nodeH / 2,
              x2: b.x, y2: b.y + nodeH / 2,
            });
          }
        }
        const maxY = Math.max.apply(null, rowsY) + nodeH;
        H = maxY + (feedback ? 34 : 16);
        ps = [];
        segs.forEach((sg, i) => ps.push({ i: i, u: i / Math.max(1, segs.length) }));
      }

      function resize() {
        const w = Math.max(320, cv.clientWidth || 560);
        const dpr = window.devicePixelRatio || 1;
        W = w;
        cv.width = Math.round(W * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        layout();
        cv.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cv.style.height = H + 'px';
      }

      function pt(sg, u) {
        if (sg.cx1 == null) {
          return { x: sg.x1 + (sg.x2 - sg.x1) * u, y: sg.y1 + (sg.y2 - sg.y1) * u };
        }
        const mu = 1 - u;
        const x = mu * mu * mu * sg.x1 + 3 * mu * mu * u * sg.cx1 + 3 * mu * u * u * sg.cx2 + u * u * u * sg.x2;
        const y = mu * mu * mu * sg.y1 + 3 * mu * mu * u * sg.cy1 + 3 * mu * u * u * sg.cy2 + u * u * u * sg.y2;
        return { x: x, y: y };
      }

      function arrow(x1, y1, x2, y2, alpha) {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = 'rgba(125,200,200,0.55)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const s = 5;
        ctx.fillStyle = 'rgba(125,200,200,0.75)';
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - Math.cos(ang - 0.5) * s, y2 - Math.sin(ang - 0.5) * s);
        ctx.lineTo(x2 - Math.cos(ang + 0.5) * s, y2 - Math.sin(ang + 0.5) * s);
        ctx.closePath();
        ctx.fill();
      }

      function draw() {
        ctx.clearRect(0, 0, W, H);
        const bg = ctx.createRadialGradient(W * 0.5, H * 0.4, 8, W * 0.5, H * 0.4, Math.max(W, H) * 0.9);
        bg.addColorStop(0, '#0C171C');
        bg.addColorStop(1, '#050A0C');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        /* 回环虚线（正反馈） */
        if (feedback && nodes.length > 1) {
          const a = nodes[nodes.length - 1], b = nodes[0];
          ctx.save();
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = 'rgba(255,107,74,0.7)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(a.x + a.w / 2, a.y + nodeH);
          ctx.bezierCurveTo(a.x + a.w / 2, H - 4, b.x + b.w / 2, H - 4, b.x + b.w / 2, b.y + nodeH);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(255,107,74,0.9)';
          ctx.font = '10px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillText('正反馈回环', (a.x + b.x) / 2, H - 6);
          ctx.restore();
        }

        /* 连线 + 流动光点 */
        segs.forEach((sg) => arrow(sg.x1, sg.y1, sg.x2, sg.y2, 1));

        /* 节点 */
        nodes.forEach((n, i) => {
          const strong = n.tailNode || (n.last && i === nodes.length - 1);
          const col = strong ? '#2DD4BF' : '#7DD3FC';
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = strong ? 'rgba(45,212,191,0.16)' : 'rgba(125,211,252,0.1)';
          rr(n.x, n.y, n.w, nodeH, 9);
          ctx.fill();
          ctx.strokeStyle = strong ? 'rgba(45,212,191,0.75)' : 'rgba(125,211,252,0.5)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.restore();
          ctx.fillStyle = strong ? '#DFFBF4' : '#DCE9EC';
          ctx.font = NODE_F;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.txt, n.x + n.w / 2, n.y + nodeH / 2 + 0.5);
          ctx.textBaseline = 'alphabetic';
        });
      }

      function frame(now) {
        if (!running) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        t += dt;
        if (cv.offsetParent === null) { running = false; return; }
        if (Math.abs((cv.clientWidth || 0) - W) > 2) resize();
        draw();
        /* 光点画在最上层 */
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ps.forEach((p) => {
          p.u += dt * 0.5;
          if (p.u >= 1) {
            p.u -= 1;
            p.i = (p.i + 1) % Math.max(1, segs.length);
          }
          const sg = segs[p.i];
          if (!sg) return;
          const q = pt(sg, p.u);
          ctx.shadowColor = '#2DD4BF';
          ctx.shadowBlur = 10;
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = '#8FF5E4';
          ctx.beginPath();
          ctx.arc(q.x, q.y, 2.8, 0, TAU);
          ctx.fill();
        });
        ctx.restore();
        raf = requestAnimationFrame(frame);
      }

      function start() {
        if (running) return;
        running = true;
        last = performance.now();
        resize();
        draw();
        raf = requestAnimationFrame(frame);
      }
      function stop() {
        running = false;
        cancelAnimationFrame(raf);
      }
      return { start, stop };
    }

    /* 把弹窗里的链路图解挂起来 */
    function mountChainDiagrams(root, stepsIn, tail, feedback) {
      const steps = (stepsIn || []).filter(Boolean);
      if (!steps.length) return;
      root.querySelectorAll('canvas[data-chaincanvas]').forEach((cv) => {
        const inst = chainDiagram(cv, steps, tail, !!feedback);
        molAnims.push(inst);
        const card = cv.closest('[data-fold]');
        if (!card || card.classList.contains('open')) inst.start();
        if (card) card.addEventListener('click', () => {
          setTimeout(() => {
            if (card.classList.contains('open')) inst.start();
            else inst.stop();
          }, 0);
        });
      });
    }

    /* ---------- 精神类状态 × 肠道菌群 对比动图 ---------- */
    /* 一行一个观察维度，一列一个状态；条长表示相对健康对照的变化方向与幅度 */
    const PSY_ROWS = [
      { t: '产丁酸菌', keys: ['faecalibacterium', 'roseburia'], bad: 'down' },
      { t: '双歧 / 乳酸菌', keys: ['bifidobacterium', 'lactobacillus'], bad: 'down' },
      { t: '拟杆菌 / 普雷沃菌', keys: ['bacteroides', 'prevotella'], bad: 'down' },
      { t: '肠杆菌科（条件致病）', keys: ['enterobacteriaceae'], bad: 'up' },
      { t: '硫酸盐还原菌 / H₂S', keys: ['desulfovibrio'], bad: 'up' },
      { t: '艰难拟梭菌', keys: ['cdiff'], bad: 'up' },
      { t: '丁酸产出', bio: 'butyrate', bad: 'down' },
      { t: '炎症基线', bio: 'inflammation', bad: 'up' },
      { t: '屏障完整度', bio: 'barrier', bad: 'down' },
    ];

    function psyValue(item, row) {
      if (row.bio) return (item.bio || {})[row.bio] || 0;
      const sp = item.species || {};
      let sum = 0, n = 0;
      row.keys.forEach((k) => { sum += sp[k] || 0; n += 1; });
      return n ? sum / n : 0;
    }

    function psyCompare(cv, cols, onPick, onFocus) {
      const ctx = cv.getContext('2d');
      const TAU = Math.PI * 2;
      const GOOD = '#34D399', BAD = '#FF6B4A';
      const labelW = 92;
      const rowH = 19, chipH = 28;
      const DOTS = 34;              /* 每列菌群点总数，直接决定渲染量 */
      const FRAME_MS = 1000 / 30;   /* 30fps 足够，比 60fps 省一半开销 */
      let DPR = Math.min(2, window.devicePixelRatio || 1);
      const base = S.map((sp) => Math.max(0.02, sp.seed || 0.1));
      const bsum = base.reduce((a, b) => a + b, 0);

      /* 每列：健康对照 + 各状态，预计算菌群份额 */
      const data = cols.map((c) => {
        const shares = S.map((sp, i) => {
          const off = (c.item.species || {})[sp.id] || 0;
          return Math.max(0.008, (base[i] / bsum) * (1 + off * 2.4));
        });
        const tot = shares.reduce((a, b) => a + b, 0);
        return {
          col: c,
          shares: shares.map((x) => x / tot),
          dots: [],
          mols: (c.item.molecules || []).slice(0, 3),
          vals: PSY_ROWS.map((r) => psyValue(c.item, r)),
        };
      });

      /* 预渲染发光点精灵，取代每帧几百次 shadowBlur */
      const sprites = S.map((sp) => {
        const sc = document.createElement('canvas');
        const sz = 18;
        sc.width = sz;
        sc.height = sz;
        const c2 = sc.getContext('2d');
        const g = c2.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
        g.addColorStop(0, sp.color);
        g.addColorStop(0.3, sp.color);
        g.addColorStop(1, sp.color + '00');
        c2.fillStyle = g;
        c2.beginPath();
        c2.arc(sz / 2, sz / 2, sz / 2, 0, TAU);
        c2.fill();
        return sc;
      });

      let W = 660, H = 320, cw = 110, perRow = 6, rowsN = 1;
      let t = 0, last = 0, lastDraw = 0, raf = 0, running = false;
      let focusIdx = -1, hovered = -1, cycleT = 0, reveal = 0;
      let ro = null, roW = 0;
      /* 静态层（背景 / 环 / 条形 / 标签）只在布局或聚焦变化时重画一次 */
      const off = document.createElement('canvas');
      const octx = off.getContext('2d');

      function rng(seed) {
        const x = Math.sin(seed * 12.9898) * 43758.5453;
        return x - Math.floor(x);
      }

      function buildDots() {
        data.forEach((d, ci) => {
          const R = d.ringR;
          const list = [];
          S.forEach((sp, si) => {
            const cnt = Math.max(0, Math.round(d.shares[si] * DOTS));
            for (let k = 0; k < cnt; k++) {
              const sd = ci * 977 + si * 131 + k * 17;
              list.push({
                sp: si,
                ang: rng(sd) * TAU,
                rad: (0.16 + rng(sd + 1) * 0.74) * R,
                ph: rng(sd + 2) * TAU,
                drift: 0.04 + rng(sd + 4) * 0.06,
                size: (sp.size || 1) * 2.1,
              });
            }
          });
          d.dots = list;
        });
      }

      function layout() {
        const avail = W - labelW - 8;
        perRow = Math.max(3, Math.min(data.length, Math.floor(avail / 104)));
        rowsN = Math.ceil(data.length / perRow);
        cw = Math.floor(avail / perRow);
        const ringTop = 30;
        const ringR = Math.min(Math.floor(cw * 0.3), 46);
        data.forEach((d) => { d.ringR = ringR; });
        buildDots();
        const blockH = ringTop + ringR * 2 + 16 + PSY_ROWS.length * rowH + chipH + 12;
        H = rowsN * blockH;
      }

      function cellXY(i) {
        const r = Math.floor(i / perRow);
        const c = i % perRow;
        const blockH = H / rowsN;
        return { x: labelW + 8 + c * cw, y: r * blockH, blockH: blockH };
      }

      /* 迷你肠截面：与主画布同款的组织 + 黏液 + 上皮（静态部分） */
      function ringArt(c, cx, cy, R, alpha, isFocus) {
        c.save();
        c.globalAlpha = alpha;
        const bg = c.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.6);
        bg.addColorStop(0, '#0C171C');
        bg.addColorStop(1, '#050A0C');
        c.fillStyle = bg;
        c.fillRect(cx - R * 1.7, cy - R * 1.7, R * 3.4, R * 3.4);

        const tg = c.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.28);
        tg.addColorStop(0, '#7E4055');
        tg.addColorStop(0.4, '#5A2C3C');
        tg.addColorStop(1, '#2A1620');
        c.beginPath();
        c.arc(cx, cy, R * 1.28, 0, TAU);
        c.arc(cx, cy, R * 0.98, 0, TAU, true);
        c.fillStyle = tg;
        c.fill('evenodd');

        const lg = c.createRadialGradient(cx, cy, 0, cx, cy, R);
        lg.addColorStop(0, 'hsla(52,42%,11%,1)');
        lg.addColorStop(1, 'hsla(46,34%,7%,1)');
        c.beginPath();
        c.arc(cx, cy, R * 0.99, 0, TAU);
        c.fillStyle = lg;
        c.fill();

        const mg = c.createRadialGradient(cx, cy, R * 0.8, cx, cy, R);
        mg.addColorStop(0, 'rgba(127,231,212,0.05)');
        mg.addColorStop(1, 'rgba(127,231,212,0.32)');
        c.beginPath();
        c.arc(cx, cy, R * 0.99, 0, TAU);
        c.arc(cx, cy, R * 0.9, 0, TAU, true);
        c.fillStyle = mg;
        c.fill('evenodd');
        c.beginPath();
        c.arc(cx, cy, R * 0.9, 0, TAU);
        c.strokeStyle = 'rgba(160,255,238,0.3)';
        c.lineWidth = 1;
        c.stroke();

        c.beginPath();
        c.arc(cx, cy, R * 0.99, 0, TAU);
        c.strokeStyle = isFocus ? 'rgba(255,150,130,0.7)' : 'rgba(226,150,165,0.5)';
        c.lineWidth = 1.3;
        c.stroke();
        c.restore();
      }

      /* 整张静态画面；grow 用于入场时条形从 0 长出来的那 0.8 秒 */
      function renderScene(c, grow) {
        c.save();
        c.setTransform(DPR, 0, 0, DPR, 0, 0);
        c.clearRect(0, 0, W, H);
        const bg = c.createRadialGradient(W * 0.5, H * 0.35, 20, W * 0.5, H * 0.4, Math.max(W, H) * 0.9);
        bg.addColorStop(0, '#0C171C');
        bg.addColorStop(1, '#050A0C');
        c.fillStyle = bg;
        c.fillRect(0, 0, W, H);

        const maxAbs = PSY_ROWS.map((r, ri) =>
          Math.max(0.02, Math.max.apply(null, data.map((d) => Math.abs(d.vals[ri])))));

        data.forEach((d, i) => {
          const pos = cellXY(i);
          const isFocus = i === focusIdx;
          const alpha = focusIdx < 0 || isFocus ? 1 : 0.32;
          const cx = pos.x + cw / 2;
          const topY = pos.y;
          const cy = topY + 30 + d.ringR;

          if (isFocus) {
            c.save();
            c.globalAlpha = 0.9;
            c.fillStyle = 'rgba(45,212,191,0.07)';
            c.fillRect(pos.x + 1, topY + 2, cw - 2, pos.blockH - 6);
            c.strokeStyle = 'rgba(45,212,191,0.5)';
            c.lineWidth = 1;
            c.strokeRect(pos.x + 1.5, topY + 2.5, cw - 3, pos.blockH - 7);
            c.restore();
          }

          ringArt(c, cx, cy, d.ringR, alpha, isFocus);

          /* 列标题 */
          c.save();
          c.globalAlpha = alpha;
          c.textAlign = 'center';
          c.font = '600 11.5px -apple-system, PingFang SC, sans-serif';
          c.fillStyle = isFocus ? '#DFFBF4' : '#C6D9DC';
          c.fillText(d.col.short, cx, topY + 15);
          if (isFocus && d.col.note) {
            let nt = d.col.note;
            c.font = '9.5px ui-monospace, monospace';
            while (nt.length > 2 && c.measureText(nt).width > cw - 12) nt = nt.slice(0, -1);
            c.fillStyle = 'rgba(126,154,160,0.95)';
            c.fillText(nt, cx, topY + 27);
          }
          c.restore();

          /* 维度条形 */
          PSY_ROWS.forEach((r, ri) => {
            const v = d.vals[ri];
            const y = cy + d.ringR + 26 + ri * rowH;
            const cellCx = cx;
            const half = Math.max(16, cw * 0.36);
            const wpx = (Math.abs(v) / maxAbs[ri]) * half;
            const bad = (v > 0) === (r.bad === 'up');
            const col = v === 0 ? 'rgba(126,154,160,0.5)' : bad ? BAD : GOOD;
            const g = Math.min(1, Math.max(0, grow * 1.4 - ri * 0.05 - i * 0.03));
            c.save();
            c.globalAlpha = alpha;
            if (ri === 0) {
              c.fillStyle = 'rgba(126,154,160,0.5)';
              c.fillRect(pos.x + 6, topY + 30 + d.ringR * 2 + 12, cw - 12, 1);
            }
            c.fillStyle = 'rgba(255,255,255,0.06)';
            c.fillRect(cellCx - half, y - 4, half * 2, 8);
            c.strokeStyle = 'rgba(255,255,255,0.12)';
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(cellCx, y - 6);
            c.lineTo(cellCx, y + 6);
            c.stroke();
            c.fillStyle = col;
            if (v >= 0) c.fillRect(cellCx, y - 4, wpx * g, 8);
            else c.fillRect(cellCx - wpx * g, y - 4, wpx * g, 8);
            c.restore();
          });

          /* 关键分子小标签 */
          const chipY = cy + d.ringR + 26 + PSY_ROWS.length * rowH + 6;
          c.save();
          c.globalAlpha = alpha;
          c.textAlign = 'center';
          d.mols.forEach((m, k) => {
            const dir = MOL_DIR[m.dir] || MOL_DIR.flat;
            const name = String(m.name).split(/[ （(]/)[0];
            let label = name + ' ' + dir.s;
            c.font = '10px -apple-system, PingFang SC, sans-serif';
            while (label.length > 2 && c.measureText(label).width > cw - 10) {
              label = label.slice(0, -2) + '…';
            }
            const tw = c.measureText(label).width;
            const bx = cx - tw / 2 - 6;
            const by = chipY + Math.floor(k / 2) * 14;
            const bw = tw + 12;
            c.globalAlpha = alpha * 0.9;
            c.fillStyle = 'rgba(5,10,13,0.85)';
            if (c.roundRect) { c.beginPath(); c.roundRect(bx, by - 1, bw, 13, 6); c.fill(); }
            else c.fillRect(bx, by - 1, bw, 13);
            c.globalAlpha = alpha;
            c.fillStyle = dir.c;
            c.textAlign = 'left';
            c.fillText(label, bx + 6, by + 9);
            c.textAlign = 'center';
          });
          c.restore();
        });

        /* 左侧维度名 */
        c.save();
        c.textAlign = 'left';
        data.forEach((d, i) => {
          if (i % perRow !== 0) return;
          const pos = cellXY(i);
          const cy = pos.y + 30 + d.ringR;
          c.globalAlpha = focusIdx < 0 || Math.floor(focusIdx / perRow) === Math.floor(i / perRow) ? 1 : 0.4;
          c.font = '10.5px -apple-system, PingFang SC, sans-serif';
          c.fillStyle = 'rgba(126,154,160,0.95)';
          PSY_ROWS.forEach((r, ri) => {
            c.fillText(r.t, 6, cy + d.ringR + 26 + ri * rowH + 3.5);
          });
          c.font = '9.5px ui-monospace, monospace';
          c.fillStyle = 'rgba(126,154,160,0.7)';
          c.fillText('代表分子', 6, cy + d.ringR + 26 + PSY_ROWS.length * rowH + 12);
        });
        c.restore();
        c.restore();
      }

      /* 只有菌群点是逐帧变化的：精灵图 + 非聚焦列抽点绘制 */
      function drawDots() {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        data.forEach((d, i) => {
          const pos = cellXY(i);
          const cx = pos.x + cw / 2;
          const cy = pos.y + 30 + d.ringR;
          const isFocus = i === focusIdx;
          const step = isFocus ? 1 : 2;
          ctx.globalAlpha = isFocus ? 0.92 : 0.42;
          for (let k = 0; k < d.dots.length; k += step) {
            const p = d.dots[k];
            const ang = p.ang + Math.sin(t * p.drift + p.ph) * 0.06 + t * 0.05;
            const rad = p.rad + Math.cos(t * p.drift * 1.3 + p.ph) * 2.5;
            const x = cx + Math.cos(ang) * rad;
            const y = cy + Math.sin(ang) * rad * 0.98;
            const sz = p.size * 3.6;
            ctx.drawImage(sprites[p.sp], x - sz / 2, y - sz / 2, sz, sz);
          }
        });
        ctx.restore();
      }

      function buildStatic() {
        off.width = Math.round(W * DPR);
        off.height = Math.round(H * DPR);
        renderScene(octx, 1);
      }

      function resize() {
        W = Math.max(360, Math.floor(cv.clientWidth || 660));
        layout();
        /* 画面很大（多行多列）时降低像素密度，避免高分屏上像素量翻倍 */
        const need = Math.min(2, window.devicePixelRatio || 1);
        DPR = W * H > 520000 ? Math.min(1.25, need) : need;
        cv.width = Math.round(W * DPR);
        cv.height = Math.round(H * DPR);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        cv.style.height = H + 'px';
        buildStatic();
      }

      function frame(now) {
        if (!running) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        t += dt;
        if (!document.body.contains(cv)) { running = false; return; }
        if (hovered < 0) {
          cycleT += dt;
          if (cycleT > 4.6) {
            cycleT = 0;
            focusIdx = (focusIdx + 1) % data.length;
            buildStatic();
            if (onFocus) onFocus(data[focusIdx].col.heading);
          }
        }
        if (now - lastDraw >= FRAME_MS) {
          lastDraw = now;
          if (reveal < 1) {
            reveal = Math.min(1, t * 1.2);
            renderScene(ctx, reveal);
            if (reveal >= 1) buildStatic();
          } else {
            ctx.drawImage(off, 0, 0, W, H);
          }
          drawDots();
        }
        raf = requestAnimationFrame(frame);
      }

      function hit(clientX, clientY) {
        const rect = cv.getBoundingClientRect();
        const x = clientX - rect.left, y = clientY - rect.top;
        return data.findIndex((d, i) => {
          const pos = cellXY(i);
          return x >= pos.x && x < pos.x + cw && y >= pos.y && y < pos.y + pos.blockH;
        });
      }

      cv.addEventListener('click', (e) => {
        const h = hit(e.clientX, e.clientY);
        if (h >= 0 && data[h].col.id && onPick) onPick(data[h].col.id);
      });
      cv.addEventListener('mousemove', (e) => {
        const h = hit(e.clientX, e.clientY);
        cv.style.cursor = h >= 0 && data[h].col.id ? 'pointer' : 'default';
        if (h !== hovered) {
          hovered = h;
          cycleT = 0;
          if (h >= 0) {
            focusIdx = h;
            buildStatic();
            if (onFocus) onFocus(data[h].col.heading);
          }
        }
      });
      cv.addEventListener('mouseleave', () => { hovered = -1; cycleT = 0; });

      function start() {
        if (running) return;
        running = true;
        last = performance.now();
        lastDraw = 0;
        t = 0;
        reveal = 0;
        focusIdx = 0;
        cycleT = 0;
        resize();
        roW = cv.clientWidth || 0;
        if (window.ResizeObserver) {
          ro = new ResizeObserver(() => {
            const w = cv.clientWidth || 0;
            if (Math.abs(w - roW) < 2) return;   /* 只关心宽度变化，避免改高度触发循环 */
            roW = w;
            resize();
          });
          ro.observe(cv);
        }
        if (onFocus && data[0]) onFocus(data[0].col.heading);
        raf = requestAnimationFrame(frame);
      }
      function stop() {
        running = false;
        cancelAnimationFrame(raf);
        if (ro) { ro.disconnect(); ro = null; }
      }
      return { start, stop };
    }

    /* 把弹窗里的分子画布挂起来：卡片展开时运行，收起/关闭时暂停 */
    function mountMolDiagrams(root, mols) {
      if (!mols || !mols.length) return;
      root.querySelectorAll('canvas[data-molcanvas]').forEach((cv) => {
        const inst = molDiagram(cv, mols);
        molAnims.push(inst);
        const card = cv.closest('[data-fold]');
        if (!card || card.classList.contains('open')) inst.start();
        if (card) card.addEventListener('click', () => {
          setTimeout(() => {
            if (card.classList.contains('open')) inst.start();
            else inst.stop();
          }, 0);
        });
      });
    }

    /* ---------- 可翻转的小卡片（关键小分子 / 机制 / 研究背景） ---------- */
    /* 一句话摘要：取正文首句，作为卡片正面的"结论" */
    function brief(html, n) {
      const s = String(html == null ? '' : html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const m = s.match(/^[^。！？；]{6,}?[。！？；]/);
      let t = m ? m[0] : s;
      const max = n || 34;
      return t.length > max ? t.slice(0, max) + '…' : t;
    }

    /* 润色：把整段长文拆成"一句结论 + 若干短句要点"，保留原文里的 <b> 强调 */
    function polish(html) {
      const keep = [];
      let t = String(html == null ? '' : html).replace(/<b>([\s\S]*?)<\/b>/g, (m, p1) => {
        keep.push(p1);
        return '\u0001' + (keep.length - 1) + '\u0001';
      });
      t = t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (!t) return '';
      const sents = t.match(/[^。！？；]+[。！？；]?/g) || [t];
      const lines = [];
      sents.forEach((x) => {
        const s = x.trim();
        if (!s) return;
        /* 过短的碎片并回上一句，避免出现只有两三个字的"要点" */
        if (lines.length && s.length < 14) lines[lines.length - 1] += s;
        else lines.push(s);
      });
      /* 过长的句子在逗号处再断一次，避免一行挤太多字 */
      const refined = [];
      lines.forEach((s) => {
        if (s.length > 46 && s.indexOf('，') > 0) {
          const mid = s.indexOf('，', Math.floor(s.length / 3));
          if (mid > 0 && mid < s.length - 8) {
            refined.push(s.slice(0, mid + 1));
            refined.push(s.slice(mid + 1));
            return;
          }
        }
        refined.push(s);
      });
      const put = (s) => s.replace(/\u0001(\d+)\u0001/g, (m, i) => '<b>' + keep[+i] + '</b>');
      return refined.map((s, i) => (i === 0
        ? `<p class="plLead">${put(s)}</p>`
        : `<div class="plLine"><i></i><span>${put(s)}</span></div>`)).join('');
    }

    /* 一张可展开提示卡片：o = { tag, t, sub?, body, open? } */
    function foldCard(o) {
      return `<div class="foldCard${o.open ? ' open' : ''}" data-fold>
        <button class="foldHead" type="button" aria-expanded="${o.open ? 'true' : 'false'}">
          <span class="foldTag">${o.tag}</span>
          <b>${o.t}</b>
          ${o.sub ? `<span class="foldSub">${o.sub}</span>` : ''}
          <i class="foldArrow">\u203a</i>
        </button>
        <div class="foldPanel"><div class="foldBody">${o.body}</div></div>
      </div>`;
    }

    const foldDeck = (cards) => `<div class="foldDeck">${cards.filter(Boolean).map(foldCard).join('')}</div>`;

    function foldBar(n) {
      return `<div class="foldBar">
        <button class="miniBtn" id="foldAll" type="button">全部展开</button>
        <span class="tiny">${n} 个模块 · 默认只显示一句提示，点标题展开完整解释</span>
      </div>`;
    }

    function initFold(root) {
      const cards = Array.prototype.slice.call(root.querySelectorAll('[data-fold]'));
      const setOpen = (c, open) => {
        const panel = c.querySelector('.foldPanel');
        const head = c.querySelector('.foldHead');
        c.classList.toggle('open', open);
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
          panel.style.height = panel.scrollHeight + 'px';
          clearTimeout(c._foldT);
          c._foldT = setTimeout(() => {
            if (c.classList.contains('open')) panel.style.height = 'auto';
          }, 300);
        } else {
          panel.style.height = panel.scrollHeight + 'px';
          requestAnimationFrame(() => { panel.style.height = '0px'; });
        }
      };
      cards.forEach((c) => {
        const panel = c.querySelector('.foldPanel');
        panel.style.height = c.classList.contains('open') ? 'auto' : '0px';
        c.querySelector('.foldHead').addEventListener('click', () => setOpen(c, !c.classList.contains('open')));
      });
      const all = root.querySelector('#foldAll');
      if (all) all.addEventListener('click', () => {
        const open = !all.classList.contains('on');
        all.classList.toggle('on', open);
        all.textContent = open ? '全部收起' : '全部展开';
        cards.forEach((c) => setOpen(c, open));
      });
    }

    /* 某条状态涉及哪些肠-器官轴 */
    function axisLinks(id) {
      const rel = GUT.AXES.filter((a) => (a.rel || []).indexOf(id) >= 0);
      if (!rel.length) return '';
      return `<h4 class="repH">相关的肠-器官轴</h4><div class="pfLine">` +
        rel.map((a) =>
          `<button class="pfTag link" data-axgo="${a.id}" style="color:${a.color};border-color:${a.color}55;background:${a.color}12">${a.title} · ${a.organ}</button>`
        ).join('') + '</div>';
    }

    /* 档案里所有条目的合并影响（直接读模型里已叠加并做过软饱和的结果） */
    function profileAgg() {
      const envD = {}, bio = {}, sp = {};
      GUT.ENV.forEach((e) => { if (sim.profEnv[e.key]) envD[e.key] = sim.profEnv[e.key]; });
      BIO_LABEL.forEach(([k]) => { if (sim.profBio[k]) bio[k] = sim.profBio[k]; });
      S.forEach((s, i) => { if (sim.profSp[i]) sp[s.id] = sim.profSp[i]; });
      return { envD, bio, sp };
    }

    const BIO_LABEL = [
      ['inflammation', '炎症'], ['butyrate', '丁酸'], ['barrier', '屏障'],
      ['mucus', '黏液层'], ['gas', '产气'], ['h2s', 'H₂S'],
    ];

    function profileSummaryHTML() {
      const a = profileAgg();
      const envAll = GUT.ENV.filter((e) => a.envD[e.key]).map((e) => {
        const v = a.envD[e.key];
        const good = e.key === 'fiber' || e.key === 'fermented' ? v > 0 : v < 0;
        return `<span class="pfTag ${good ? 'down' : 'up'}">${e.label} ${signed(v)}</span>`;
      });
      const envTags = envAll.slice(0, 3).join('');
      const bioAll = BIO_LABEL.filter(([k]) => a.bio[k]).map(([k, l]) => {
        const v = a.bio[k] * 100;
        const good = k === 'inflammation' || k === 'gas' || k === 'h2s' ? v < 0 : v > 0;
        return `<span class="pfTag ${good ? 'down' : 'up'}">${l} ${signed(v)}</span>`;
      });
      const bioTags = bioAll.slice(0, 3).join('');
      const spTags = Object.keys(a.sp)
        .filter((k) => Math.abs(a.sp[k]) > 0.08)
        .sort((x, y) => Math.abs(a.sp[y]) - Math.abs(a.sp[x]))
        .slice(0, 3)
        .map((k) => {
          const v = a.sp[k] * 100;
          const idx = IX[k];
          const sp = idx != null ? S[idx] : null;
          const good = sp && (sp.role === 'core' || sp.role === 'beneficial') ? v > 0 : v < 0;
          return `<span class="pfTag ${good ? 'down' : 'up'}">${sp ? sp.name : k} ${signed(v, '%')}</span>`;
        }).join('');
      const moreN = envAll.length + bioAll.length - 6;
      const moreTag = moreN > 0 ? `<span class="pfTag">还有 ${moreN} 项</span>` : '';
      return (envTags ? `<div class="pfLine">${envTags}</div>` : '') +
        (bioTags ? `<div class="pfLine">${bioTags}</div>` : '') +
        (spTags ? `<div class="pfLine">${spTags}${moreTag}</div>` : '') +
        '<p class="tiny">上面是档案对「环境旋钮 / 生态指标 / 物种竞争力」的净偏移。点「查看影响报告」读完整解释与调整建议。</p>';
    }

    function syncProfileChips() {
      Object.keys(pfChipEls).forEach((id) =>
        pfChipEls[id].classList.toggle('on', sim.profile.indexOf(id) >= 0)
      );
      const n = sim.profile.length;
      const t = $('pfCount');
      if (t) t.textContent = n ? n + ' 项生效' : '未填写';
      const sum = $('pfSummary');
      if (sum) {
        sum.innerHTML = n
          ? profileSummaryHTML()
          : '<p class="tiny">还没有填写。勾选或输入你的状态，生态会立刻把这些因素算进去。</p>';
      }
    }

    function toggleProfile(id) {
      const p = PFI[id];
      if (!p) return;
      const has = sim.profile.indexOf(id) >= 0;
      const next = has ? sim.profile.filter((x) => x !== id) : sim.profile.concat([id]);
      sim.setProfile(next);
      syncProfileChips();
      U.syncEnv();
      U.toast(has ? '已移除：' + p.label : '已加入档案：' + p.label + ' · 生态将重新调整');
    }

    function openProfileCard(id) {
      const p = PFI[id];
      if (!p) return;
      const g = GUT.PROFILE_GROUPS.find((x) => x.id === p.group) || { color: '#2DD4BF', label: '' };
      const on = sim.profile.indexOf(id) >= 0;
      const b = p.bio || {};
      const bioCell = (k, label, goodUp) => {
        const v = (b[k] || 0) * 100;
        const c = Math.abs(v) < 0.5 ? '#93aeb4' : (goodUp ? v > 0 : v < 0) ? '#34D399' : '#FF6B4A';
        return `<div><span>${label}</span><b style="color:${c}">${v > 0 ? '+' : ''}${v.toFixed(0)}%</b></div>`;
      };
      openModal(`
        <span class="mTag" style="color:${g.color};border-color:${g.color}66;background:${g.color}12">${p.tag || g.label}</span>
        <h3 class="mTitle">${p.label}</h3>
        <p class="mSub">${on ? '已在你的档案中生效' : '尚未加入档案'} · 这是群体层面的统计规律，不是对你的诊断</p>
        <p class="mLead">${p.lead}</p>
        <div class="mGrid">
          ${bioCell('inflammation', '炎症基线偏移', false)}
          ${bioCell('butyrate', '丁酸产出偏移', true)}
          ${bioCell('barrier', '肠屏障偏移', true)}
          ${bioCell('mucus', '黏液层偏移', true)}
        </div>
        ${foldBar(7)}
        ${foldDeck([
          { tag: '菌群', t: '肠道菌群会发生什么变化', sub: brief(p.micro), body: polish(p.micro), open: true },
          { tag: '分子', t: '关键小分子 · 它们去影响哪个器官', sub: molBrief(p.molecules), body: `<canvas class="molDiagram" data-molcanvas></canvas><div class="molWrap">${molRows(p.molecules)}</div>` },
          { tag: '机制', t: '机制 · 它改写了什么', sub: brief(p.mech), body: `<canvas class="chainDiagram" data-chaincanvas></canvas>${polish(p.mech)}` },
          { tag: '背景', t: '研究背景 / 冷知识', sub: brief(p.fact), body: polish(p.fact) },
          { tag: '饮食', t: '饮食调整建议', sub: `${p.diet.length} 条可执行建议`, body: `<ul class="repCause">${p.diet.map((t) => `<li data-i="✓">${t}</li>`).join('')}</ul>` },
          { tag: '作息', t: '作息 / 生活方式建议', sub: `${p.routine.length} 条可执行建议`, body: `<ul class="repCause">${p.routine.map((t) => `<li data-i="✓">${t}</li>`).join('')}</ul>` },
          { tag: '观察', t: '在模拟器里观察什么', sub: brief(p.watch), body: polish(p.watch) },
        ])}
        ${axisLinks(id)}
        <button class="dBtn" id="pfToggle">${on ? '从我的档案中移除' : '加入我的档案'}</button>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
      mountMolDiagrams($('modalBody'), p.molecules);
      mountChainDiagrams(
        $('modalBody'),
        [p.label].concat(bioNodes(p.bio), ['菌群改写', molNode(p.molecules)]),
        shortOrgan(p.molecules.length ? p.molecules[0].organ : '') ? '影响' + shortOrgan(p.molecules[0].organ) : '',
        hasFeedback(p.mech)
      );
      $('pfToggle').addEventListener('click', () => { toggleProfile(id); closeModal(); });
      const pfBody = $('modalBody');
      pfBody.querySelectorAll('[data-axgo]').forEach((b) =>
        b.addEventListener('click', () => openAxis(GUT.AXIS_INDEX[b.dataset.axgo]))
      );
    }
    U.openProfileCard = openProfileCard;

    function openProfileReport(unknown) {
      if (!sim.profile.length) { U.toast('档案还是空的：先勾选或输入你的状态'); return; }
      const a = profileAgg();
      const items = sim.profile.map((id) => PFI[id]).filter(Boolean);
      const sgn = (v) => (v > 0.005 ? '↑ 上升' : v < -0.005 ? '↓ 下降' : '→ 基本不变');

      const envTags = GUT.ENV.filter((e) => a.envD[e.key]).map((e) => {
        const v = a.envD[e.key];
        const good = e.key === 'fiber' || e.key === 'fermented' ? v > 0 : v < 0;
        return `<span class="pfTag ${good ? 'down' : 'up'}">${e.label} ${signed(v)}</span>`;
      }).join('');
      const bioTags = BIO_LABEL.filter(([k]) => a.bio[k]).map(([k, l]) => {
        const v = a.bio[k] * 100;
        const good = k === 'inflammation' || k === 'gas' || k === 'h2s' ? v < 0 : v > 0;
        return `<span class="pfTag ${good ? 'down' : 'up'}">${l}${v > 0 ? ' ↑' : ' ↓'} ${Math.abs(v).toFixed(0)}</span>`;
      }).join('');
      const spTags = Object.keys(a.sp)
        .filter((k) => Math.abs(a.sp[k]) > 0.05)
        .sort((x, y) => Math.abs(a.sp[y]) - Math.abs(a.sp[x]))
        .slice(0, 6)
        .map((k) => {
          const v = a.sp[k] * 100;
          const idx = IX[k];
          const sp = idx != null ? S[idx] : null;
          const good = sp && (sp.role === 'core' || sp.role === 'beneficial') ? v > 0 : v < 0;
          return `<span class="pfTag ${good ? 'down' : 'up'}">${sp ? sp.name : k} ${signed(v, '%')}</span>`;
        }).join('');

      const molMap = {};
      items.forEach((p) => p.molecules.forEach((m) => {
        const o = molMap[m.name] || (molMap[m.name] = { name: m.name, score: 0, organs: [], desc: '', dir: 'flat' });
        o.score += m.dir === 'up' ? 1 : m.dir === 'down' ? -1 : 0;
        m.organ.split('·').map((x) => x.trim()).filter(Boolean).forEach((og) => {
          if (o.organs.indexOf(og) < 0) o.organs.push(og);
        });
        if (!o.desc) o.desc = m.desc;
      }));
      const mols = Object.keys(molMap).map((k) => molMap[k])
        .sort((x, y) => Math.abs(y.score) - Math.abs(x.score))
        .map((m) => ({
          name: m.name,
          dir: m.score > 0 ? 'up' : m.score < 0 ? 'down' : 'flat',
          organ: m.organs.join(' · '),
          desc: m.desc + (Math.abs(m.score) > 1 ? ' <em>（多个状态共同指向同一个分子）</em>' : ''),
        }));

      const diet = uniq(items.reduce((acc, p) => acc.concat(p.diet), [])).slice(0, 8);
      const routine = uniq(items.reduce((acc, p) => acc.concat(p.routine), [])).slice(0, 6);

      const chips = items.map((p) => {
        const g = GUT.PROFILE_GROUPS.find((x) => x.id === p.group) || { color: '#2DD4BF' };
        return `<button class="libCard" data-pf="${p.id}"><i style="background:${g.color}"></i><b>${p.label}</b><span>${p.tag} · 查看资料卡</span></button>`;
      }).join('');

      openModal(`
        <span class="mTag" style="color:#A78BFA;border-color:#A78BFA66;background:#A78BFA12">档案 · 影响报告</span>
        <h3 class="mTitle">我的状态档案 · 综合影响报告</h3>
        <p class="mSub">共 ${items.length} 项状态生效 · 下面是它们叠加后对生态的净影响</p>
        <p class="mLead">当前档案把生态推向：炎症 ${sgn(a.bio.inflammation)}、丁酸 ${sgn(a.bio.butyrate)}、肠屏障 ${sgn(a.bio.barrier)}、产气 ${sgn(a.bio.gas)}。${(a.bio.butyrate < -0.02 ? '核心问题通常是<b>产丁酸菌受压</b>：丁酸一下降，屏障与炎症会同时恶化。' : '')}</p>
        ${unknown && unknown.length ? `<p class="tiny">没认出来：<b>${unknown.join('、')}</b>——换个说法试试（如"压力大""熬夜""经期"）。</p>` : ''}
        <h4 class="repH">① 状态清单</h4>
        <div class="libGrid">${chips}</div>
        <h4 class="repH">② 环境旋钮的偏移</h4>
        <div class="pfLine">${envTags || '<span class="pfTag">无</span>'}</div>
        <h4 class="repH">③ 生态指标的净变化</h4>
        <div class="pfLine">${bioTags || '<span class="pfTag">无</span>'}</div>
        <h4 class="repH">④ 物种竞争力的偏移</h4>
        <div class="pfLine">${spTags || '<span class="pfTag">无</span>'}</div>
        <h4 class="repH">⑤ 关键小分子 → 靶器官</h4>
        <div class="molWrap">${molRows(mols)}</div>
        <h4 class="repH">⑥ 饮食调整建议</h4>
        <ul class="repCause">${diet.map((t) => `<li data-i="✓">${t}</li>`).join('')}</ul>
        <h4 class="repH">⑦ 作息 / 生活方式建议</h4>
        <ul class="repCause">${routine.map((t) => `<li data-i="✓">${t}</li>`).join('')}</ul>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
      $('modalBody').querySelectorAll('[data-pf]').forEach((b) =>
        b.addEventListener('click', () => openProfileCard(b.dataset.pf))
      );
    }
    U.openProfileReport = openProfileReport;

    /* 自由输入：把一句话拆成词条，匹配档案项 */
    function parseProfileText(text) {
      const tokens = text.split(/[,，、\s+＋和跟配与；;。.！!？?]+/).map((s) => s.trim()).filter(Boolean);
      const hit = [], unknown = [];
      tokens.forEach((t) => {
        /* 关键词越长越具体，优先命中：例如"想恋爱"胜过"恋爱" */
        let best = null, bestLen = 0;
        PF.forEach((p) => {
          if (!p.keywords) return;
          p.keywords.forEach((k) => {
            if (t.indexOf(k) >= 0 && k.length > bestLen) { best = p; bestLen = k.length; }
          });
        });
        const byKw = best;
        const byLabel = PF.find((p) => p.label === t || (t.length >= 2 && p.label.indexOf(t) >= 0));
        const found = byKw || byLabel;
        if (found) { if (hit.indexOf(found) < 0) hit.push(found); }
        else unknown.push(t);
      });
      return { hit, unknown };
    }

    function submitProfileText() {
      const el = $('pfInput');
      const text = el.value.trim();
      if (!text) { U.toast('写下你的状态，例如：糖尿病 压力大 熬夜 经期'); return; }
      const r = parseProfileText(text);
      if (!r.hit.length) { U.toast('没识别出状态，试试：糖尿病 / 抑郁 / 压力大 / 熬夜 / 经期 / 便秘'); return; }
      const next = sim.profile.slice();
      let added = 0;
      r.hit.forEach((p) => { if (next.indexOf(p.id) < 0) { next.push(p.id); added++; } });
      sim.setProfile(next);
      syncProfileChips();
      U.syncEnv();
      el.value = '';
      if (!added) { U.toast('这些状态已经在档案里了'); return; }
      U.toast('已加入档案：' + r.hit.map((p) => p.label).join('、'));
      openProfileReport(r.unknown);
    }

    function buildProfile() {
      const box = $('profileBody');
      if (!box) return;
      box.innerHTML = '';
      GUT.PROFILE_GROUPS.forEach((g) => {
        const items = PF.filter((p) => p.group === g.id);
        if (!items.length) return;
        const sec = document.createElement('div');
        sec.className = 'pfGroup';
        sec.innerHTML = `<div class="pfGroupHead" style="color:${g.color}"><i style="background:${g.color}"></i>${g.label}</div>`;
        const wrap = document.createElement('div');
        wrap.className = 'pfChips';
        items.forEach((p) => {
          const b = document.createElement('button');
          b.className = 'pfChip' + (p.tone === 'good' ? ' good' : '');
          b.innerHTML = `<span>${p.label}</span><i class="pfInfo" title="查看资料卡">?</i>`;
          b.title = p.lead;
          b.addEventListener('click', () => toggleProfile(p.id));
          b.querySelector('.pfInfo').addEventListener('click', (e) => {
            e.stopPropagation();
            openProfileCard(p.id);
          });
          wrap.appendChild(b);
          pfChipEls[p.id] = b;
        });
        sec.appendChild(wrap);
        box.appendChild(sec);
      });
      syncProfileChips();
      U.syncEnv();

      const inp = $('pfInput');
      if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitProfileText(); });
      const add = $('pfAdd');
      if (add) add.addEventListener('click', submitProfileText);
      const rep = $('pfReport');
      if (rep) rep.addEventListener('click', () => openProfileReport());
      const fold = $('pfFold');
      if (fold) fold.addEventListener('click', () => {
        const body = $('profileBody');
        const willHide = !body.hidden;
        body.hidden = willHide;
        fold.textContent = willHide ? '展开' : '收起';
      });
      const clr = $('pfClear');
      if (clr) clr.addEventListener('click', () => {
        if (!sim.profile.length) { U.toast('档案已经是空的'); return; }
        sim.setProfile([]);
        syncProfileChips();
        U.syncEnv();
        U.toast('已清空状态档案');
      });
    }

    /* ============ 生态指标条 ============ */
    const METRICS = [
      { key: 'diversity', label: '物种多样性', get: () => sim.diversity },
      { key: 'butyrate', label: '丁酸 (butyrate)', get: () => clamp(sim.butyrate, 0, 1) },
      { key: 'scfa', label: '短链脂肪酸总量', get: () => clamp(sim.scfa, 0, 1) },
      { key: 'mucus', label: '黏液层厚度', get: () => sim.mucus },
      { key: 'barrier', label: '肠屏障完整度', get: () => sim.barrier },
      { key: 'resistance', label: '定植抵抗', get: () => clamp(sim.resistance / 1.4, 0, 1) },
      { key: 'h2s', label: '硫化氢 H₂S', get: () => clamp(sim.h2s, 0, 1), invert: true },
      { key: 'gas', label: '产气 / 腹胀', get: () => clamp(sim.gas, 0, 1), invert: true },
      { key: 'inflammation', label: '炎症水平', get: () => sim.inflammation, invert: true },
    ];
    const metricEls = [];
    function buildMetrics() {
      const box = $('metrics');
      box.innerHTML = '';
      METRICS.forEach((m) => {
        const el = document.createElement('div');
        el.className = 'metric';
        el.innerHTML =
          `<div class="mHead"><span class="mLink" data-m="${m.key}" title="点击查看这个指标的解释">${m.label}</span><b>—</b></div>` +
          `<div class="mBar"><i class="mFill"></i></div>`;
        box.appendChild(el);
        metricEls.push(el);
      });
      box.querySelectorAll('.mLink').forEach((s) =>
        s.addEventListener('click', () => openMetric(s.dataset.m))
      );
    }

    /* HUD 上的 pH / 传输时间 / 总菌量 / 肠型 也可点开解释 */
    const HUD_METRICS = [
      ['hudPH', 'ph'], ['hudTransit', 'transit'], ['hudTotal', 'total'], ['hudEntero', 'enterotype'],
    ];
    /* 点击时间轴上的事件标记 → 回顾该事件至今的累计变化 */
    function buildTimelineLinks() {
      $('tlTrack').addEventListener('click', (e) => {
        const m = e.target.closest('.tlMark');
        if (!m) return;
        const ev = sim.events[+m.dataset.i];
        if (!ev || !ev.snap) return;
        openChangeReport({ id: ev.id, label: ev.label, tone: ev.tone, day: ev.day, before: ev.snap, after: sim.snapshot() });
      });
    }

    function buildHudLinks() {
      HUD_METRICS.forEach(([id, key]) => {
        const el = $(id);
        el.classList.add('mLink');
        el.title = '点击查看解释';
        el.addEventListener('click', () => openMetric(key));
      });
    }

    /* ============ 堆叠条 + 图例 ============ */
    const stackBars = [];
    function buildStack() {
      const box = $('stack');
      box.innerHTML = '';
      S.forEach((sp) => {
        const i = document.createElement('i');
        i.style.background = sp.color;
        i.style.width = '0%';
        i.title = sp.name;
        box.appendChild(i);
        stackBars.push(i);
      });
      const lg = $('stackLegend');
      lg.innerHTML = '';
      S.forEach((sp, idx) => {
        const em = document.createElement('em');
        em.innerHTML = `<i style="background:${sp.color}"></i>${sp.name}`;
        em.addEventListener('click', () => select(idx, true));
        lg.appendChild(em);
      });
    }

    /* ============ 物种列表 ============ */
    const spRows = [];
    function buildSpecies() {
      const box = $('species');
      box.innerHTML = '';
      S.forEach((sp, idx) => {
        const row = document.createElement('div');
        row.className = 'spRow';
        row.innerHTML =
          `<i style="background:${sp.color}"></i>` +
          `<div class="spName"><b>${sp.name}</b><div class="spBar"><i style="background:${sp.color}"></i></div></div>` +
          `<div class="spPct">—</div>`;
        row.addEventListener('click', () => select(idx, true));
        row.addEventListener('mouseenter', () => (R.hover = idx));
        row.addEventListener('mouseleave', () => (R.hover = null));
        box.appendChild(row);
        spRows.push(row);
      });
    }

    /* ============ 选中 ============ */
    function select(idx, openCard) {
      if (idx != null && idx < 0) {
        U.selected = null;
        R.highlight = null;
        spRows.forEach((r) => r.classList.remove('on'));
        $('detail').innerHTML = '<p class="tiny">在画布或上方列表中点选一种菌，这里会显示它的实时数据。</p>';
        return;
      }
      if (U.selected === idx && openCard) { openSpecies(idx); return; }
      U.selected = idx;
      R.highlight = idx == null ? null : idx;
      spRows.forEach((r, i) => r.classList.toggle('on', i === idx));
      if (openCard) openSpecies(idx);
    }
    U.select = select;

    /* ============ 历史（趋势） ============ */
    function pushHistory() {
      if (sim.day - U.lastHistDay < 0.5) return;
      U.lastHistDay = sim.day;
      U.history.push({ day: sim.day, n: sim.n.slice() });
      if (U.history.length > 90) U.history.shift();
    }

    /* ============ 弹窗 ============ */
    const modalRoot = $('modalRoot');

    /* ---------- 文案里提到的菌种 → 可点击跳转到菌种图鉴 ---------- */
    const SP_ALIAS = {
      bacteroides: ['脆弱拟杆菌', '拟杆菌'],
      prevotella: ['普雷沃菌', '普氏菌'],
      faecalibacterium: ['普拉梭菌', '普氏栖粪杆菌', '柔嫩梭菌'],
      roseburia: ['罗氏菌'],
      bifidobacterium: ['双歧杆菌'],
      lactobacillus: ['乳酸杆菌', '乳杆菌'],
      akkermansia: ['嗜黏蛋白阿克曼菌', '阿克曼菌'],
      enterobacteriaceae: ['肠杆菌科', '大肠杆菌', '肠杆菌'],
      cdiff: ['艰难拟梭菌', '艰难梭菌'],
      desulfovibrio: ['硫酸盐还原菌', '脱硫弧菌'],
    };
    const SP_TERMS = (function () {
      const out = [];
      Object.keys(SP_ALIAS).forEach((id) => {
        SP_ALIAS[id].forEach((w) => out.push({ id: id, w: w }));
      });
      out.sort((a, b) => b.w.length - a.w.length);
      return out;
    })();

    /* 只替换纯文本节点，不动标签与已有按钮；每个菌种在同一段里只链一次 */
    function linkifySpecies(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => {
          const el = n.parentElement;
          if (!el) return NodeFilter.FILTER_REJECT;
          if (el.closest('button, a, canvas, .spLink, .libCard, script')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((node) => {
        const text = node.nodeValue;
        if (!SP_TERMS.some((t) => text.indexOf(t.w) >= 0)) return;
        const seen = {};
        const frag = document.createDocumentFragment();
        let buf = '';
        let changed = false;
        const flush = () => {
          if (buf) { frag.appendChild(document.createTextNode(buf)); buf = ''; }
        };
        let i = 0;
        while (i < text.length) {
          let hitW = null, hitId = null;
          for (let k = 0; k < SP_TERMS.length; k++) {
            const t = SP_TERMS[k];
            if (seen[t.id]) continue;
            if (text.substr(i, t.w.length) !== t.w) continue;
            /* "拟杆菌门"是门名不是菌种本身，跳过 */
            if (text.charAt(i + t.w.length) === '门') continue;
            hitW = t.w;
            hitId = t.id;
            break;
          }
          if (hitW) {
            seen[hitId] = true;
            const idx = GUT.SPECIES_INDEX[hitId];
            flush();
            const el = document.createElement('span');
            el.className = 'spLink';
            el.setAttribute('data-gosp', hitId);
            el.setAttribute('role', 'button');
            el.setAttribute('tabindex', '0');
            const sp = idx != null ? S[idx] : null;
            el.title = `「${sp ? sp.name : hitW}」${sp ? '—— ' + String(sp.sci.headline || '').replace(/<[^>]+>/g, '') : ''}\n点击打开它的完整图鉴`;
            el.textContent = hitW;
            frag.appendChild(el);
            changed = true;
            i += hitW.length;
          } else {
            buf += text.charAt(i);
            i += 1;
          }
        }
        flush();
        if (changed) node.parentNode.replaceChild(frag, node);
      });
    }

    $('modalBody').addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('.spLink[data-gosp]');
      if (el) openSpecies(GUT.SPECIES_INDEX[el.getAttribute('data-gosp')]);
    });
    $('modalBody').addEventListener('keydown', (e) => {
      const el = e.target.closest && e.target.closest('.spLink[data-gosp]');
      if (el && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        openSpecies(GUT.SPECIES_INDEX[el.getAttribute('data-gosp')]);
      }
    });

    function openModal(html) {
      molAnims.forEach((a) => a.stop());
      molAnims = [];
      $('modalBody').innerHTML = html;
      modalRoot.hidden = false;
      linkifySpecies($('modalBody'));
      initFold($('modalBody'));
    }
    function closeModal() {
      modalRoot.hidden = true;
      molAnims.forEach((a) => a.stop());
      molAnims = [];
    }
    $('modalClose').addEventListener('click', closeModal);
    $('modalMask').addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

    function openSpecies(idx) {
      const sp = S[idx];
      const sh = sim.n[idx] / Math.max(sim.total, 1e-9);
      const old = U.history.length > 4 ? U.history[Math.max(0, U.history.length - 5)] : null;
      const oldSh = old ? old.n[idx] / Math.max(old.n.reduce((a, b) => a + b, 0), 1e-9) : sh;
      const delta = sh - oldSh;
      const trend = delta > 0.004 ? `↑ 上升 ${(delta * 100).toFixed(1)}pp` : delta < -0.004 ? `↓ 下降 ${(-delta * 100).toFixed(1)}pp` : '→ 基本稳定';
      openModal(`
        <span class="mTag" style="color:${sp.color};border-color:${sp.color}66;background:${sp.color}12">${sp.phylum}</span>
        <h3 class="mTitle">${sp.name}</h3>
        <p class="mSub">${sp.latin} · ${ROLE_TEXT[sp.role]}</p>
        <p class="mLead">${sp.sci.headline} —— ${sp.sci.role}</p>
        <div class="mGrid">
          <div><span>当前相对丰度</span><b style="color:${sp.color}">${pct1(sh)}</b></div>
          <div><span>绝对量</span><b>${cfu(sim.n[idx])} CFU/g</b></div>
          <div><span>近 2 天趋势</span><b>${trend}</b></div>
          <div><span>最适 pH</span><b>${sp.phOpt.toFixed(1)}</b></div>
        </div>
        ${foldBar(5)}
        ${foldDeck([
          { tag: '喜欢', t: '它靠什么长起来', body: polish(sp.sci.love) },
          { tag: '害怕', t: '什么会压住它', body: polish(sp.sci.fear) },
          { tag: '宿主', t: '与宿主的关系', body: polish(sp.sci.host) },
          { tag: '冷知识', t: '关于它的趣闻', body: polish(sp.sci.fact) },
          { tag: '行动', t: '怎么养 / 怎么防', body: polish(sp.sci.tip), open: true },
        ])}
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
    }
    U.openSpecies = openSpecies;

    function openTopic(t) {
      openModal(`
        <span class="mTag" style="color:${t.color};border-color:${t.color}66;background:${t.color}12">${t.tag}</span>
        <h3 class="mTitle">${t.title}</h3>
        ${foldBar(t.body.length)}
        ${foldDeck(t.body.map((p, i) => ({
          tag: '要点 ' + (i + 1),
          t: brief(p, 24),
          sub: brief(p, 40),
          body: polish(p),
          open: i === 0,
        })))}
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
    }

    /* ---------- 肠-器官轴 ---------- */
    function openAxis(a) {
      if (!a) return;
      const rel = (a.rel || []).filter((id) => PFI[id]).map((id) => {
        const p = PFI[id];
        const g = GUT.PROFILE_GROUPS.find((x) => x.id === p.group) || { color: '#2DD4BF' };
        return `<button class="libCard" data-axrel="${id}"><i style="background:${g.color}"></i><b>${p.label}</b><span>查看这条状态的资料卡</span></button>`;
      }).join('');
      openModal(`
        <span class="mTag" style="color:${a.color};border-color:${a.color}66;background:${a.color}12">${a.tag}</span>
        <h3 class="mTitle">${a.title}</h3>
        <p class="mSub">靶器官：${a.organ} · 诱因 → 菌群特征变化 → 小分子变化 → 器官影响 → 身体表现</p>
        <p class="mLead">${a.lead}</p>
        ${foldBar(8)}
        ${foldDeck([
          { tag: '① 诱因', t: '什么情况会扰动这条轴', sub: `${a.triggers.length} 个常见诱因`, body: `<ul class="repCause">${a.triggers.map((t) => `<li data-i="因">${t}</li>`).join('')}</ul>` },
          { tag: '② 菌群', t: '菌群的基本特征会怎么变', sub: brief(a.micro), body: polish(a.micro) },
          { tag: '③ 分子', t: '小分子分泌变化 · 作用于哪些器官', sub: molBrief(a.molecules), body: `<canvas class="molDiagram" data-molcanvas></canvas><div class="molWrap">${molRows(a.molecules)}</div>` },
          { tag: '④ 靶器官', t: `它是如何影响${a.organ}的`, sub: brief(a.effect), body: `<canvas class="chainDiagram" data-chaincanvas></canvas>${polish(a.effect)}` },
          { tag: '⑤ 表现', t: '人体会表现出什么不适', sub: `${a.symptoms.length} 种常见表现`, body: `<ul class="repCause">${a.symptoms.map((s) => `<li data-i="症">${s}</li>`).join('')}</ul>` },
          { tag: '⑥ 调整', t: '可以怎么调', sub: brief(a.advice), body: polish(a.advice) },
          { tag: '背景', t: '研究背景 / 冷知识', sub: brief(a.fact), body: polish(a.fact) },
          { tag: '观察', t: '在模拟器里观察什么', sub: brief(a.watch), body: polish(a.watch) },
        ])}
        ${rel ? `<h4 class="repH">相关的状态档案条目</h4><div class="libGrid">${rel}</div>` : ''}
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
      const body = $('modalBody');
      body.querySelectorAll('[data-axrel]').forEach((b) =>
        b.addEventListener('click', () => openProfileCard(b.dataset.axrel))
      );
      mountMolDiagrams(body, a.molecules);
      mountChainDiagrams(
        body,
        ['肠道菌群变化'].concat(a.molecules.slice(0, 2).map((m) =>
          m.name.split(/[ （(]/)[0] + (MOL_DIR[m.dir] || MOL_DIR.flat).s)),
        '影响' + a.organ,
        hasFeedback(a.effect)
      );
    }
    U.openAxis = openAxis;

    /* ---------- 事件解释 ---------- */
    function openEvent(id) {
      const e = GUT.EVENTS.find((x) => x.id === id);
      const info = GUT.EVENT_INFO[id];
      if (!info) return;
      openModal(`
        <span class="mTag" style="color:${info.color};border-color:${info.color}66;background:${info.color}12">${info.tag}</span>
        <h3 class="mTitle">${e ? e.label : '用餐对生态的影响'}</h3>
        <p class="mSub">${e ? (e.dur ? `持续 ${e.dur} 天的干预` : '瞬时事件') + ' · 在左侧「临床干预事件」点击即可施加' : '把食物拆成营养维度后如何改变生态'}</p>
        ${e ? `<p class="mLead">${e.note}</p>` : ''}
        ${foldBar(4)}
        ${foldDeck([
          { tag: '机制', t: '它对生态做了什么', sub: brief(info.mech), body: polish(info.mech), open: true },
          { tag: '后果', t: '生态后果', sub: brief(info.effect), body: polish(info.effect) },
          { tag: '临床', t: '临床背景', sub: brief(info.clinic), body: polish(info.clinic) },
          { tag: '观察', t: '在模拟器里观察什么', sub: brief(info.watch), body: polish(info.watch) },
        ])}
        ${e ? `<button class="dBtn" id="evDo">立即施加这个事件</button>` : ''}
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
      if (e) $('evDo').addEventListener('click', () => {
        sim.fire(id);
        U.toast(e.note);
        closeModal();
      });
    }
    U.openEvent = openEvent;

    /* ---------- 指标解释 ---------- */
    const NOW = {
      diversity: () => (sim.diversity * 100).toFixed(0) + '%',
      butyrate: () => (clamp(sim.butyrate, 0, 1) * 100).toFixed(0) + '%',
      scfa: () => (clamp(sim.scfa, 0, 1) * 100).toFixed(0) + '%',
      mucus: () => (sim.mucus * 100).toFixed(0) + '%',
      barrier: () => (sim.barrier * 100).toFixed(0) + '%',
      resistance: () => (clamp(sim.resistance / 1.4, 0, 1) * 100).toFixed(0) + '%',
      h2s: () => (clamp(sim.h2s, 0, 1) * 100).toFixed(0) + '%',
      gas: () => (clamp(sim.gas, 0, 1) * 100).toFixed(0) + '%',
      inflammation: () => (sim.inflammation * 100).toFixed(0) + '%',
      ph: () => sim.pH.toFixed(2),
      transit: () => (72 - sim.env.motility * 0.58).toFixed(0) + ' h',
      total: () => cfu(sim.total) + ' CFU/g',
      enterotype: () => (sim.enterotype ? sim.enterotype.label : '—'),
    };
    function openMetric(key) {
      const m = GUT.METRIC_INFO[key];
      if (!m) return;
      const now = NOW[key] ? NOW[key]() : '—';
      openModal(`
        <span class="mTag" style="color:${m.color};border-color:${m.color}66;background:${m.color}12">生态指标</span>
        <h3 class="mTitle">${m.label}</h3>
        <p class="mSub">所有指标都是 0～100% 的相对刻度，用于展示趋势而非绝对值</p>
        <div class="mGrid">
          <div><span>当前值（实时）</span><b style="color:${m.color}">${now}</b></div>
          <div><span>参考区间</span><b>${m.range}</b></div>
        </div>
        ${foldBar(3)}
        ${foldDeck([
          { tag: '定义', t: '这个指标是什么', sub: brief(m.what), body: polish(m.what), open: true },
          { tag: '成因', t: '它为什么会变化', sub: brief(m.why), body: polish(m.why) },
          { tag: '行动', t: '怎么读 / 怎么改善', sub: brief(m.do), body: polish(m.do) },
        ])}
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
    }
    U.openMetric = openMetric;

    /* ---------- 施加后的「变化报告」 ---------- */
    const pp = (v) => (v >= 0 ? '+' : '') + v.toFixed(0) + 'pp';

    function metricRows(a, b) {
      const rows = [
        { k: 'diversity', label: '物种多样性', fmt: (v) => (clamp(v, 0, 1) * 100).toFixed(0) + '%' },
        { k: 'butyrate', label: '丁酸水平', fmt: (v) => (clamp(v, 0, 1) * 100).toFixed(0) + '%' },
        { k: 'barrier', label: '肠屏障完整度', fmt: (v) => (clamp(v, 0, 1) * 100).toFixed(0) + '%' },
        { k: 'inflammation', label: '炎症水平', fmt: (v) => (clamp(v, 0, 1) * 100).toFixed(0) + '%', good: 'down' },
        { k: 'resistance', label: '定植抵抗', fmt: (v) => (clamp(v / 1.4, 0, 1) * 100).toFixed(0) + '%' },
        { k: 'mucus', label: '黏液层厚度', fmt: (v) => (clamp(v, 0, 1) * 100).toFixed(0) + '%' },
        { k: 'scfa', label: 'SCFA 总量', fmt: (v) => (clamp(v, 0, 1) * 100).toFixed(0) + '%' },
        { k: 'gas', label: '产气 / 腹胀', fmt: (v) => (clamp(v, 0, 1) * 100).toFixed(0) + '%', good: 'down' },
        { k: 'h2s', label: '硫化氢 H₂S', fmt: (v) => (clamp(v, 0, 1) * 100).toFixed(0) + '%', good: 'down' },
      ];
      return rows.map((r) => {
        const d = clamp((b[r.k] - a[r.k]) * 100, -100, 100);
        const flat = Math.abs(d) < 1.5;
        const dir = flat ? '→' : d > 0 ? '↑' : '↓';
        const goodDir = r.good === 'down' ? d < 0 : d > 0;
        const tone = flat ? 'flat' : goodDir ? 'up' : 'down';
        return `<tr><td>${r.label}</td><td>${r.fmt(a[r.k])}</td><td>${r.fmt(b[r.k])}</td>
          <td class="repDelta ${tone}">${dir} ${flat ? '0' : Math.abs(d).toFixed(0)}pp</td></tr>`;
      }).join('');
    }

    function speciesRows(a, b) {
      return S.map((sp, i) => ({ i, d: (b.shares[i] - a.shares[i]) * 100 }))
        .filter((x) => Math.abs(x.d) > 0.25)
        .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
        .slice(0, 5)
        .map((x) => {
          const sp = S[x.i];
          return `<div class="repSp">
            <i style="background:${sp.color}"></i>
            <b>${sp.name}</b>
            <span>${(a.shares[x.i] * 100).toFixed(1)}% → ${(b.shares[x.i] * 100).toFixed(1)}%</span>
            <em class="repDelta ${x.d > 0 ? 'up' : 'down'}">${x.d > 0 ? '↑' : '↓'} ${Math.abs(x.d).toFixed(1)}pp</em>
          </div>`;
        })
        .join('');
    }

    /* 依据"实际变化方向"生成因果解释，而不是写死的文案 */
    function causes(a, b, id) {
      const D = (k) => (b[k] - a[k]) * 100;
      const sh = (k) => (b.shares[GUT.SPECIES_INDEX[k]] - a.shares[GUT.SPECIES_INDEX[k]]) * 100;
      const out = [];
      const dd = D('diversity'), dbut = D('butyrate'), dinf = D('inflammation'),
        dbar = D('barrier'), dres = D('resistance'), dmuc = D('mucus');

      if (dd < -3) {
        const why =
          id === 'abx' ? '抗生素按各物种的敏感度系数清除，严格厌氧菌率先消失，剩下的少数物种迅速垄断腾出的生态位'
            : id === 'highfat' ? '纤维骤减让纤维专家失去底物，群落从"多样的纤维发酵网络"退化为少数耐胆汁物种'
              : id === 'stress' ? '压力推高炎症与蠕动，敏感物种被冲刷、分布变得不均匀'
                : '扰动让群落分布变得不均匀：少数耐受者扩张，多数物种份额缩水';
        out.push(['↓', `多样性 ${pp(dd)}：${why}。`]);
      } else if (dd > 3) {
        out.push(['↑', `多样性 ${pp(dd)}：底物供给改善、清除压力解除，更多物种重新达到可维持的种群规模。`]);
      }

      if (dbut < -3) {
        out.push(['↓', `丁酸 ${pp(dbut)}：产丁酸菌（普拉梭菌、罗氏菌）减少，纤维发酵与"交叉喂养"链条中断，结肠上皮失去主要燃料。`]);
      } else if (dbut > 3) {
        out.push(['↑', `丁酸 ${pp(dbut)}：纤维底物充足，产丁酸菌恢复，乳酸/乙酸被交叉喂养转化为丁酸——它是主要的抗炎刹车。`]);
      }

      if (dbar < -3) {
        out.push(['↓', `肠屏障 ${pp(dbar)}：丁酸不足使上皮细胞能量匮乏，炎症又直接破坏紧密连接，于是屏障变"漏"。`]);
      } else if (dbar > 3) {
        out.push(['↑', `肠屏障 ${pp(dbar)}：黏液层增厚 + 丁酸回升，上皮细胞能量充足，紧密连接重新收紧。`]);
      }

      if (dinf > 3) {
        out.push(['↑', `炎症 ${pp(dinf)}：屏障受损让 LPS 等促炎物质更容易进入黏膜，炎症又进一步组织产氧、抑制厌氧菌——这是一个<b>正反馈</b>，丁酸是唯一的刹车。`]);
      } else if (dinf < -3) {
        out.push(['↓', `炎症 ${pp(dinf)}：丁酸回升抑制 NF-κB 通路、屏障修复，促炎信号随之回落。`]);
      }

      if (dres < -5) {
        out.push(['↓', `定植抵抗 ${pp(dres)}：有益菌减少留下空缺生态位，外来病原（芽孢）不再被竞争与代谢抑制压制。`]);
      } else if (dres > 5) {
        out.push(['↑', `定植抵抗 ${pp(dres)}：生态位被重新填满，占位竞争 + 细菌素 + 丁酸共同恢复了这道"生态免疫"。`]);
      }

      if (dmuc < -3) {
        out.push(['↓', `黏液层 ${pp(dmuc)}：纤维不足时部分菌转向啃食黏液糖链，加上炎症抑制杯状细胞分泌，黏液被"越吃越薄"。`]);
      } else if (dmuc > 3) {
        out.push(['↑', `黏液层 ${pp(dmuc)}：菌群重新以纤维为主食，不再消耗宿主黏液，杯状细胞分泌也随炎症下降而恢复。`]);
      }

      if (sh('cdiff') > 1) {
        out.push(['↑', `艰难拟梭菌 ${pp(sh('cdiff'))}：它并没有变强，而是<b>竞争者消失了</b>——芽孢在定植抵抗跌破阈值后萌发并释放毒素。`]);
      }
      if (sh('enterobacteriaceae') > 2) {
        out.push(['↑', `肠杆菌科 ${pp(sh('enterobacteriaceae'))}：兼性厌氧、耐氧耐胆汁，在炎症造成的组织产氧环境里反而占优。`]);
      }
      if (sh('akkermansia') > 2) {
        out.push(['↑', `阿克曼菌 ${pp(sh('akkermansia'))}：它主食黏液糖链，纤维不足时会扩张——既帮助维持屏障，也可能加速黏液消耗。`]);
      }
      if (sh('desulfovibrio') > 1.5) {
        out.push(['↑', `硫酸盐还原菌 ${pp(sh('desulfovibrio'))}：蛋白/脂肪与胆汁酸增加提供硫酸盐底物，产物 H₂S 会损伤上皮。`]);
      }
      if (sh('faecalibacterium') < -3 || sh('roseburia') < -2) {
        out.push(['↓', `产丁酸菌（普拉梭菌/罗氏菌）${pp(sh('faecalibacterium'))} / ${pp(sh('roseburia'))}：它们是最严格的厌氧菌，也最依赖纤维，因而最先倒下。`]);
      }

      if (!out.length) {
        out.push(['→', `生态基本维持原状（各项变化 &lt;3pp）。典型原因：定植抵抗仍在 ${(clamp(b.resistance / 1.4, 0, 1) * 100).toFixed(0)}%，外来菌无法立足；或扰动强度还不足以突破生态的缓冲能力。`]);
      }
      return out;
    }

    function verdict(a, b) {
      const D = (k) => (b[k] - a[k]) * 100;
      let worse = 0, better = 0;
      const chk = (d, wantUp) => {
        if (Math.abs(d) < 3) return;
        const good = wantUp ? d > 0 : d < 0;
        good ? better++ : worse++;
      };
      chk(D('diversity'), true); chk(D('butyrate'), true); chk(D('barrier'), true);
      chk(D('inflammation'), false); chk(D('resistance'), true);
      if (worse > better) return { t: '生态明显恶化', c: '#FF6B4A' };
      if (better > worse) return { t: '生态明显改善', c: '#34D399' };
      return { t: '生态基本维持原状', c: '#F5B944' };
    }

    function openChangeReport(rep) {
      const a = rep.before;
      const b = rep.after || sim.snapshot();
      const info = GUT.EVENT_INFO[rep.id] || {};
      const v = verdict(a, b);
      const span = (b.day - a.day);
      const cause = causes(a, b, rep.id)
        .map((c) => `<li data-i="${c[0]}">${c[1]}</li>`).join('');
      openModal(`
        <span class="mTag" style="color:${v.c};border-color:${v.c}66;background:${v.c}12">变化报告</span>
        <h3 class="mTitle">${rep.label}</h3>
        <p class="mSub">施加于第 ${a.day.toFixed(1)} 天 · 观察了 ${span.toFixed(1)} 天 · 下方为<b>施加瞬间 → 当前</b>的实测变化</p>
        <p class="mLead"><b style="color:${v.c}">${v.t}</b>：多样性 ${pp((b.diversity - a.diversity) * 100)}、丁酸 ${pp((b.butyrate - a.butyrate) * 100)}、炎症 ${pp((b.inflammation - a.inflammation) * 100)}。</p>
        <h4 class="repH">关键指标变化</h4>
        <table class="rep">
          <tr><th>指标</th><th>施前</th><th>现在</th><th>变化</th></tr>
          ${metricRows(a, b)}
          <tr><td>肠腔 pH</td><td>${a.ph.toFixed(2)}</td><td>${b.ph.toFixed(2)}</td>
            <td class="repDelta ${Math.abs(b.ph - a.ph) < 0.05 ? 'flat' : b.ph < a.ph ? 'up' : 'down'}">${Math.abs(b.ph - a.ph) < 0.05 ? '→' : b.ph < a.ph ? '↓' : '↑'} ${Math.abs(b.ph - a.ph).toFixed(2)}</td></tr>
          <tr><td>总菌量</td><td>${cfu(a.total)}</td><td>${cfu(b.total)}</td>
            <td class="repDelta ${b.total > a.total * 1.05 ? 'up' : b.total < a.total * 0.95 ? 'down' : 'flat'}">${(b.total / Math.max(a.total, 1e-9)).toFixed(2)}×</td></tr>
        </table>
        <h4 class="repH">菌群份额变化（最显著的 5 个）</h4>
        <div class="repSpWrap">${speciesRows(a, b) || '<p class="tiny">各物种份额变化都小于 0.25pp。</p>'}</div>
        <h4 class="repH">为什么会这样</h4>
        <ul class="repCause">${cause}</ul>
        ${info.mech ? foldBar(2) + foldDeck([
          { tag: '机制', t: '机制回顾', sub: brief(info.mech), body: polish(info.mech) },
          { tag: '观察', t: '接下来会怎样', sub: brief(info.watch || ''), body: polish(info.watch || '') },
        ]) : ''}
        <button class="dBtn" id="repMore">查看「${rep.label}」的完整解释</button>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
      const more = $('repMore');
      if (more) more.addEventListener('click', () => openEvent(rep.id));
    }
    U.openChangeReport = openChangeReport;
    U.isModalOpen = () => !modalRoot.hidden;

    /* ---------- 今天吃了什么：食物 → 营养维度 → 生态响应 ---------- */
    const FOOD_ALIAS = {
      米饭: '白米饭', 白米: '白米饭', 面条: '白面条', 鸡肉: '鸡胸肉', 青菜: '白菜',
      叶菜: '菠菜', 水果: '苹果', 蔬菜: '西兰花', 猪肉丝: '猪肉', 烧肉: '红烧肉',
      可乐饮料: '可乐', 茶: '浓茶', 拿铁: '咖啡', 冰美式: '咖啡', 麻辣香锅: '麻辣烫',
      冰咖啡: '咖啡', 酸奶昔: '酸奶', 水果捞: '蓝莓', 坚果仁: '坚果', 炒饭: '白米饭',
      益力多: '养乐多', 养乐多饮品: '养乐多', 活性乳酸菌: '乳酸菌饮料', 乳酸菌饮品: '乳酸菌饮料',
      乳酸饮料: '乳酸菌饮料', 汽水: '冰汽水', 冰可乐: '冰汽水', 加冰可乐: '冰汽水',
      沙士: '冰汽水', 苏打水: '冰汽水', 气泡水: '冰汽水', 变态辣: '爆辣火锅', 牛油火锅: '爆辣火锅',
      特辣火锅: '爆辣火锅', 麻辣锅: '爆辣火锅',
    };
    const scoreColor = (s) => (s >= 60 ? '#34D399' : s >= 45 ? '#F5B944' : '#FF6B4A');

    function parseMeal(text) {
      const tokens = text.split(/[,，、\s+＋和跟配与；;]+/).map((s) => s.trim()).filter(Boolean);
      const items = [], unknown = [];
      const CN = { 一: 1, 两: 2, 二: 2, 三: 3, 半: 0.5, 四: 4 };
      tokens.forEach((raw) => {
        let token = raw.replace(/\d+\s*(g|克|ml|毫升|kg)/gi, '');
        let qty = 1;
        // 只在"数量 + 量词"时才算份数，避免把"三文鱼"切成 3 份
        const q = token.match(/^([一两二三四半]|\d+(?:\.\d+)?)\s*(份|碗|个|杯|块|片|根|把|勺|瓶|罐|袋|只|条)/);
        if (q) {
          qty = CN[q[1]] || parseFloat(q[1]) || 1;
          token = token.slice(q[0].length);
        }
        if (!token) return;
        token = FOOD_ALIAS[token] || token;
        // 匹配优先级：完全相等 → 输入包含词条 → 词条包含输入，避免"可乐"被认成"无糖可乐"
        const byLen = (arr) => (arr.length ? arr.sort((a, b) => b.n.length - a.n.length)[0] : null);
        const hit =
          GUT.FOODS.find((f) => f.n === token) ||
          byLen(GUT.FOODS.filter((f) => token.includes(f.n))) ||
          byLen(GUT.FOODS.filter((f) => token.length >= 2 && f.n.includes(token)));
        if (hit) items.push({ food: hit, qty });
        else unknown.push(raw);
      });

      let F = 0, P = 0, Z = 0, S = 0, portions = 0;
      const tags = {};
      items.forEach(({ food, qty }) => {
        F += food.f * qty; P += food.p * qty; Z += food.z * qty; S += food.s * qty;
        portions += qty;
        (Array.isArray(food.tag) ? food.tag : food.tag ? [food.tag] : []).forEach((t) => { tags[t] = true; });
      });
      const n = Math.max(portions, 1);
      const af = F / n, ap = P / n, az = Z / n, as = S / n;
      let score = clamp(50 + (af - 1.2) * 18 + (az - 0.3) * 10 - (ap - 1) * 8 - as * 12, 3, 100);
      /* 活性菌饮品加分、爆辣减分：口味的强度本身也是生态变量 */
      if (tags.liveCulture) score += 4;
      if (tags.superSpicy) score -= 5;
      score = clamp(score, 3, 100);
      const label = items.map((i) => i.food.n).join(' ').slice(0, 24);
      return { items, unknown, f: F, p: P, z: Z, s: S, portions, af, ap, az, as, tags, score, label, text };
    }

    function mealPredict(m) {
      const out = [];
      if (m.af >= 2) out.push(['↑', '纤维充足：未来 1～2 天纤维池上升，产丁酸菌（普拉梭菌、罗氏菌）与双歧杆菌拿到底物，<b>丁酸与 SCFA 会回升</b>，黏液层也不再被当作食物。']);
      else if (m.af < 0.8) out.push(['↓', '纤维不足：菌群会转向发酵蛋白质和黏液糖链，<b>丁酸下降、黏液层被消耗</b>，pH 趋于偏碱。']);
      else out.push(['→', '纤维中等：足以维持基本发酵，但不足以明显推高丁酸。']);
      if (m.ap >= 2) out.push(['↑', '蛋白脂肪偏高：胆汁酸分泌增加，耐胆汁的<b>拟杆菌与硫酸盐还原菌</b>扩张，H₂S 上升、pH 偏碱。']);
      if (m.az >= 1.2) out.push(['↑', '发酵食品充足：带来<b>过路有益菌</b>与乳酸/乙酸，短期内乳酸菌、双歧杆菌份额上升。']);
      if (m.as >= 1.5) out.push(['↑', '糖分偏高：被快速发酵成乳酸与气体，<b>产气 / 腹胀上升</b>；长期高糖还会压低多样性。']);
      if (m.tags.superSpicy) out.push(['↑', '爆辣刺激：辣椒素通过 TRPV1 通路让<b>蠕动明显加快</b>，并带来轻度的黏膜充血与炎症波动，黏液层短暂变薄；配合高脂底料时，胆汁酸与 H₂S 常同时升高。']);
      else if (m.tags.spicy || m.tags.caffeine || m.tags.cold) out.push(['↑', '刺激性饮食：蠕动加快、传输时间缩短，菌群被冲刷，<b>总菌量可能短期下降</b>。']);
      if (m.tags.fizz) out.push(['↑', '碳酸刺激：额外的 CO₂ 进入消化道，<b>气体负荷叠加</b>，配上冷饮的蠕动加快，腹胀感往往比单纯的高糖饮料更明显。']);
      if (m.tags.liveCulture) out.push(['↑', '活性乳酸菌：带来大量<b>过路有益菌</b>与乳酸，乳酸杆菌份额短期上升；但它们很难长期定植，真正决定生态的仍是日常吃的纤维与发酵食品。']);
      if (m.tags.alcohol) out.push(['↑', '酒精：直接提高屏障通透性与炎症，短期内<b>炎症指标小幅上升</b>。']);
      if (m.tags.sweetener) out.push(['→', '人工甜味剂：无热量，但并非对菌群惰性，研究结论尚不一致。']);
      return out;
    }

    function mealTips(m) {
      const t = [];
      if (m.af < 1.2) t.push('下一餐加一份<b>燕麦 / 豆类 / 绿叶菜</b>，把纤维提到 2 以上——这是提升丁酸最有效的一步。');
      if (m.as >= 1.5) t.push('把含糖饮料换成<b>水或无糖茶</b>，可立刻降低乳酸与产气负担。');
      if (m.az < 0.8) t.push('加一份<b>酸奶 / 泡菜 / 纳豆</b>等发酵食品，直接补充过路有益菌与有机酸。');
      if (m.ap >= 2) t.push('用<b>豆类或鱼</b>替换部分红肉与油炸，减少胆汁酸与 H₂S 的来源。');
      if (!t.length) t.push('这一餐结构不错。记住：<b>食材多样</b>比某一种"超级食物"更重要，每周吃够 30 种植物性食材是常见目标。');
      return t;
    }

    function openMealReport(m) {
      const foods = m.items.map(({ food, qty }) => {
        const c = GUT.FOOD_CATS[food.cat];
        const tip = food.desc ? ` title="${String(food.desc).replace(/"/g, '&quot;')}"` : '';
        return `<span class="foodTag"${tip} style="border-color:${c.color}55;background:${c.color}14">
          <i style="background:${c.color}"></i>${food.n}${qty !== 1 ? ' ×' + qty : ''}<em>${c.label}</em></span>`;
      }).join('');
      const maxV = Math.max(1, m.af, m.ap, m.az, m.as);
      const bars = GUT.MEAL_DIMS.map((d) => {
        const v = m[d.key === 'f' ? 'af' : d.key === 'p' ? 'ap' : d.key === 'z' ? 'az' : 'as'];
        return `<div class="mdRow"><span>${d.label}</span>
          <i class="mdBar"><b style="width:${((v / 3) * 100).toFixed(0)}%;background:${d.color}"></b></i>
          <em>${v.toFixed(1)} / 3</em></div>`;
      }).join('');
      const sc = Math.round(m.score), col = scoreColor(m.score);
      const verdict = sc >= 75 ? '对菌群很友好' : sc >= 60 ? '还不错' : sc >= 45 ? '一般，有改进空间' : sc >= 30 ? '偏西式快餐结构' : '对菌群不太友好';
      openModal(`
        <span class="mTag" style="color:#C3E34A;border-color:#C3E34A66;background:#C3E34A12">膳食分析</span>
        <h3 class="mTitle">这一餐对菌群意味着什么</h3>
        <p class="mSub">识别到 ${m.items.length} 种食物 · 约 ${m.portions.toFixed(1)} 份${m.unknown.length ? ' · 有 ' + m.unknown.length + ' 项没认出' : ''}</p>
        <div class="foodList">${foods}</div>
        ${m.unknown.length ? `<p class="tiny">没认出来：<b>${m.unknown.join('、')}</b>——换个常见说法试试（如"炸鸡""奶茶""燕麦"）。</p>` : ''}
        <div class="mScore" style="--c:${col}"><b>${sc}</b><span>菌群友好度 · ${verdict}</span></div>
        <div class="mdWrap">${bars}</div>
        <h4 class="repH">接下来 1～2 天预计会发生什么</h4>
        <ul class="repCause">${mealPredict(m).map((p) => `<li data-i="${p[0]}">${p[1]}</li>`).join('')}</ul>
        <h4 class="repH">怎么改进</h4>
        <ul class="repCause">${mealTips(m).map((t) => `<li data-i="✓">${t}</li>`).join('')}</ul>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
    }
    U.openMealReport = openMealReport;

    let lastMealN = -1;
    function renderMeals() {
      if (sim.meals.length === lastMealN) return;
      lastMealN = sim.meals.length;
      const box = $('mealToday');
      if (!sim.meals.length) {
        box.innerHTML = '<p class="tiny">还没有记录。写下今天吃的东西，生态会立刻响应。</p>';
        return;
      }
      const tot = sim.meals.reduce((a, m) => ({ f: a.f + m.f, p: a.p + m.p, z: a.z + m.z, s: a.s + m.s }), { f: 0, p: 0, z: 0, s: 0 });
      const max = Math.max(1, tot.f, tot.p, tot.z, tot.s);
      const bars = GUT.MEAL_DIMS.map((d) => `<div class="mdRow"><span>${d.label}</span>
        <i class="mdBar"><b style="width:${((tot[d.key] / max) * 100).toFixed(0)}%;background:${d.color}"></b></i>
        <em>${tot[d.key].toFixed(0)}</em></div>`).join('');
      const list = sim.meals.slice(-8).reverse().map((m) =>
        `<div class="mealItem"><i style="background:${scoreColor(m.score)}"></i><b>第 ${m.day.toFixed(1)} 天</b>
          <span>${m.label}</span><em style="color:${scoreColor(m.score)}">${Math.round(m.score)}</em></div>`
      ).join('');
      box.innerHTML = `<div class="mdWrap">${bars}</div><div class="mealList">${list}</div>`;
    }

    function submitMeal() {
      const el = $('mealInput');
      const text = el.value.trim();
      if (!text) { U.toast('先写下你吃了什么，例如：燕麦 蓝莓 酸奶'); return; }
      const m = parseMeal(text);
      if (!m.items.length) { U.toast('没识别出食物，换个常见说法试试：燕麦 / 酸奶 / 炸鸡'); return; }
      sim.meal(m);
      el.value = '';
      U.toast('已记录：' + m.label);
      openMealReport(m);
    }

    function buildMeal() {
      const chips = ['燕麦', '蓝莓', '酸奶', '西兰花', '糙米', '三文鱼', '炸鸡', '奶茶', '泡菜', '可乐', '白米饭', '核桃', '养乐多', '爆辣火锅', '冰汽水'];
      const box = $('mealChips');
      box.innerHTML = chips.map((c) => `<button class="chipBtn" data-f="${c}">${c}</button>`).join('');
      box.querySelectorAll('[data-f]').forEach((b) =>
        b.addEventListener('click', () => {
          const inp = $('mealInput');
          inp.value = (inp.value ? inp.value + ' ' : '') + b.dataset.f;
          inp.focus();
        })
      );
      $('mealAdd').addEventListener('click', submitMeal);
      $('mealInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitMeal();
      });
      const clr = $('mealClear');
      if (clr) clr.addEventListener('click', () => {
        sim.meals.length = 0;
        lastMealN = -1;
        U.toast('已清空今日膳食记录');
      });

      // 顶栏「记录一餐」：滚动到输入区并聚焦
      const bm = $('btnMeal');
      if (bm) bm.addEventListener('click', () => {
        const sec = document.querySelector('.block-meal');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const inp = $('mealInput');
        inp.focus();
        inp.classList.add('flash');
        setTimeout(() => inp.classList.remove('flash'), 1200);
        U.toast('写下你吃了什么，例如：燕麦 蓝莓 酸奶');
      });

      // 顶栏「我的档案」：打开日记本
      const bd = $('btnDiary');
      if (bd) bd.addEventListener('click', () => openDiary());
      diaryLoad();
      syncDiaryBadge();
    }

    /* ============ 我的档案 · 日记本 ============ */
    const DY_KEY = 'gut_diary_v1';
    const dyDraft = { meal: 'lunch', foods: '', mood: 'calm', stress: 4, sleepH: 7, sleepQ: 'ok', symptoms: [], body: '' };

    function diarySave() {
      try { localStorage.setItem(DY_KEY, JSON.stringify(sim.diary)); } catch (err) { /* 忽略存储失败 */ }
    }
    function diaryLoad() {
      try {
        const raw = localStorage.getItem(DY_KEY);
        if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) sim.diary = arr; }
      } catch (err) { /* 忽略 */ }
    }
    function syncDiaryBadge() {
      const b = $('btnDiary');
      if (!b) return;
      const n = sim.diary.length;
      b.textContent = n ? '我的档案 · ' + n : '我的档案';
      b.classList.toggle('has', !!n);
    }
    const dyMealOf = (id) => GUT.DIARY_MEALS.filter((x) => x.id === id)[0] || { label: '记录', color: '#2DD4BF' };
    const dyMoodOf = (id) => GUT.DIARY_MOODS.filter((m) => m.id === id)[0];
    const dySleepOf = (id) => GUT.DIARY_SLEEP.filter((s) => s.id === id)[0] || { label: '一般', v: 0 };
    const stressText = (v) => (v <= 2 ? '很放松' : v <= 4 ? '适中' : v <= 6 ? '偏高' : v <= 8 ? '明显偏高' : '很高');

    function diaryListHTML() {
      if (!sim.diary.length) return '<p class="tiny">还没有记录。填好上面的内容，点「保存这一条记录」。</p>';
      return sim.diary.slice().reverse().map((d) => {
        const m = dyMealOf(d.meal);
        const mood = dyMoodOf(d.mood);
        return `<div class="dyEntry">
          <div class="dyEntryHead">
            <i style="background:${m.color}"></i><b>${m.label} · 第 ${(+d.day).toFixed(1)} 天</b>
            <button class="dyDel" data-dydel="${d.id}" title="删除这条">×</button>
          </div>
          <div class="dyEntryBody">
            ${d.foods ? `<span class="dyPill">餐：${d.foods}</span>` : ''}
            ${mood ? `<span class="dyPill">心情：${mood.label}</span>` : ''}
            <span class="dyPill">压力：${d.stress}/10</span>
            <span class="dyPill">睡眠：${d.sleepH}h · ${dySleepOf(d.sleepQ).label}</span>
            ${(d.symptoms || []).map((s) => `<span class="dyPill warn">${s}</span>`).join('')}
            ${d.body ? `<span class="dyPill">${d.body}</span>` : ''}
          </div>
        </div>`;
      }).join('');
    }

    function bindDiaryList() {
      const list = $('dyList');
      if (!list) return;
      list.innerHTML = diaryListHTML();
      syncDiaryBadge();
      list.querySelectorAll('[data-dydel]').forEach((b) =>
        b.addEventListener('click', () => {
          sim.delDiary(b.dataset.dydel);
          diarySave();
          bindDiaryList();
          U.toast('已删除这条记录');
        })
      );
    }

    /* 汇总：心情 / 压力 / 睡眠 / 症状 / 三餐 → 生态偏移 + 命中的状态 */
    function diaryAgg() {
      const ds = sim.diary;
      const n = ds.length || 1;
      const env = {};
      GUT.ENV.forEach((e) => (env[e.key] = 0));
      const bio = {};
      ['inflammation', 'butyrate', 'barrier', 'mucus', 'gas', 'h2s'].forEach((k) => (bio[k] = 0));
      let stress = 0, sleepH = 0, sleepV = 0;
      const moodCount = {}, mealCount = {}, sympCount = {};
      ds.forEach((d) => {
        const mood = dyMoodOf(d.mood);
        if (mood) {
          if (mood.env) for (const k in mood.env) env[k] += mood.env[k] / n;
          if (mood.bio) for (const k in mood.bio) bio[k] += mood.bio[k] / n;
          moodCount[d.mood] = (moodCount[d.mood] || 0) + 1;
        }
        const sv = +d.stress || 0;
        stress += sv / n;
        env.stress += ((sv - 4) * 5) / n;
        env.immune += (Math.max(0, sv - 6) * 4) / n;
        bio.butyrate -= (Math.max(0, sv - 6) * 0.012) / n;
        bio.barrier -= (Math.max(0, sv - 6) * 0.008) / n;
        const sh = +d.sleepH || 0;
        sleepH += sh / n;
        const qv = dySleepOf(d.sleepQ).v;
        sleepV += qv / n;
        const deficit = Math.max(0, 7.5 - sh);
        env.stress += (deficit * 3) / n;
        env.immune += (deficit * 2 + (qv < 0 ? 4 : 0)) / n;
        const bad = deficit * 0.012 + (qv < 0 ? 0.03 : 0);
        bio.inflammation += bad / n;
        bio.butyrate -= bad / n;
        bio.barrier -= bad * 0.6 / n;
        if (qv > 0 && sh >= 7) { bio.butyrate += 0.025 / n; env.stress -= 3 / n; }
        mealCount[d.meal] = (mealCount[d.meal] || 0) + 1;
        (d.symptoms || []).forEach((s) => (sympCount[s] = (sympCount[s] || 0) + 1));
      });

      const hits = {};
      Object.keys(sympCount).forEach((label) => {
        const s = GUT.DIARY_SYMPTOMS.filter((x) => x.label === label)[0];
        if (s) s.hit.forEach((id) => (hits[id] = (hits[id] || 0) + sympCount[label]));
      });
      const unknown = [];
      ds.forEach((d) => {
        if (!d.body) return;
        const r = parseProfileText(d.body);
        r.hit.forEach((p) => (hits[p.id] = (hits[p.id] || 0) + 1));
        r.unknown.forEach((t) => { if (unknown.indexOf(t) < 0) unknown.push(t); });
      });
      if (stress >= 7) hits.stressHigh = (hits.stressHigh || 0) + 2;
      if (sleepH && (sleepH < 6.5 || sleepV < -0.5)) hits.sleepDebt = (hits.sleepDebt || 0) + 2;

      const foods = ds.map((d) => d.foods).filter(Boolean).join(' ');
      const meal = foods ? parseMeal(foods) : null;
      return { n: ds.length, env, bio, stress, sleepH, sleepV, moodCount, mealCount, sympCount, hits, meal, foods, unknown };
    }

    const dyTag = (label, v, goodUp, unit) => {
      const a = Math.abs(v);
      const s = v > 0.004 ? '↑' : v < -0.004 ? '↓' : '→';
      const good = goodUp ? v > 0 : v < 0;
      const cls = a < 0.004 ? '' : good ? 'down' : 'up';
      return `<span class="pfTag ${cls}">${label} ${s} ${a < 0.004 ? '基本不变' : (unit === '%' ? (a * 100).toFixed(0) + '%' : a.toFixed(0))}</span>`;
    };

    function openDiary() {
      const st = dyDraft;
      const setP = (el) => el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min)) * 100 + '%');
      openModal(`
        <span class="mTag" style="color:#A78BFA;border-color:#A78BFA66;background:#A78BFA12">日记 · 我的档案</span>
        <h3 class="mTitle">我的档案 · 一日记录</h3>
        <p class="mSub">记录三餐、心情、压力、睡眠与身体状况 · 攒几条后点底部「一键分析」</p>

        <h4 class="repH">① 这一餐吃了什么</h4>
        <div class="dySeg" id="dySeg">
          ${GUT.DIARY_MEALS.map((m) => `<button class="dySegBtn${st.meal === m.id ? ' on' : ''}" data-dymeal="${m.id}">${m.label}</button>`).join('')}
        </div>
        <div class="mealInput">
          <input id="dyFood" type="text" autocomplete="off" placeholder="燕麦 蓝莓 酸奶（空格隔开）" value="${st.foods}" />
          <button class="btn btn-primary" id="dyFoodAdd">加入</button>
        </div>
        <p class="tiny" id="dyFoodNote">${st.foods ? '这一餐：' + st.foods : '还没填这一餐（可以留空，只记录心情与睡眠）'}</p>

        <h4 class="repH">② 心情 · 压力 · 睡眠</h4>
        <div class="dyLine"><span class="dyLab">心情</span>
          <div class="dyChips" id="dyMoods">
            ${GUT.DIARY_MOODS.map((m) => `<button class="dyChip${st.mood === m.id ? ' on' : ''}" data-dymood="${m.id}">${m.label}</button>`).join('')}
          </div>
        </div>
        <div class="dyLine"><span class="dyLab">压力值</span>
          <input class="dyRange" id="dyStress" type="range" min="0" max="10" step="1" value="${st.stress}" />
          <b id="dyStressV">${st.stress}</b><span class="tiny" id="dyStressT">${stressText(+st.stress)}</span>
        </div>
        <div class="dyLine"><span class="dyLab">睡眠时长</span>
          <input class="dyRange" id="dySleep" type="range" min="0" max="12" step="0.5" value="${st.sleepH}" />
          <b id="dySleepV">${st.sleepH} h</b>
        </div>
        <div class="dyLine"><span class="dyLab">睡眠质量</span>
          <div class="dyChips" id="dySleepQ">
            ${GUT.DIARY_SLEEP.map((s) => `<button class="dyChip${st.sleepQ === s.id ? ' on' : ''}" data-dysq="${s.id}">${s.label}</button>`).join('')}
          </div>
        </div>

        <h4 class="repH">③ 身体状况（可多选）</h4>
        <div class="dyChips" id="dySymps">
          ${GUT.DIARY_SYMPTOMS.map((s) => `<button class="dyChip${st.symptoms.indexOf(s.label) >= 0 ? ' on warn' : ''}" data-dysym="${s.label}">${s.label}</button>`).join('')}
        </div>
        <div class="mealInput">
          <input id="dyBody" type="text" autocomplete="off" placeholder="补充：今天有点腹胀，下午特别困，喉咙发紧" value="${st.body}" />
        </div>

        <button class="dBtn dyPrimary" id="dySave">保存这一条记录</button>

        <h4 class="repH">已记录 · ${sim.diary.length} 条</h4>
        <div class="dyList" id="dyList"></div>

        <button class="dBtn dyPrimary" id="dyAnalyze">一键分析 · 看菌群变化与器官影响</button>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);

      const seg = $('dySeg');
      seg.querySelectorAll('[data-dymeal]').forEach((b) =>
        b.addEventListener('click', () => {
          st.meal = b.dataset.dymeal;
          seg.querySelectorAll('[data-dymeal]').forEach((x) => x.classList.toggle('on', x === b));
        })
      );
      $('dyMoods').querySelectorAll('[data-dymood]').forEach((b) =>
        b.addEventListener('click', () => {
          st.mood = b.dataset.dymood;
          $('dyMoods').querySelectorAll('[data-dymood]').forEach((x) => x.classList.toggle('on', x === b));
        })
      );
      $('dySleepQ').querySelectorAll('[data-dysq]').forEach((b) =>
        b.addEventListener('click', () => {
          st.sleepQ = b.dataset.dysq;
          $('dySleepQ').querySelectorAll('[data-dysq]').forEach((x) => x.classList.toggle('on', x === b));
        })
      );
      $('dySymps').querySelectorAll('[data-dysym]').forEach((b) =>
        b.addEventListener('click', () => {
          const l = b.dataset.dysym;
          const i = st.symptoms.indexOf(l);
          if (i >= 0) st.symptoms.splice(i, 1); else st.symptoms.push(l);
          b.classList.toggle('on', i < 0);
          b.classList.toggle('warn', i < 0);
        })
      );

      const sEl = $('dyStress'), hEl = $('dySleep');
      setP(sEl); setP(hEl);
      sEl.addEventListener('input', () => {
        st.stress = +sEl.value;
        setP(sEl);
        $('dyStressV').textContent = sEl.value;
        $('dyStressT').textContent = stressText(+sEl.value);
        sEl.classList.toggle('warn', +sEl.value >= 5);
        sEl.classList.toggle('danger', +sEl.value >= 8);
      });
      sEl.classList.toggle('warn', +sEl.value >= 5);
      sEl.classList.toggle('danger', +sEl.value >= 8);
      hEl.addEventListener('input', () => {
        st.sleepH = +hEl.value;
        setP(hEl);
        $('dySleepV').textContent = hEl.value + ' h';
        hEl.classList.toggle('warn', +hEl.value < 6.5 && +hEl.value > 0);
      });
      hEl.classList.toggle('warn', +hEl.value < 6.5 && +hEl.value > 0);

      const foodInp = $('dyFood');
      const addFood = () => {
        const v = foodInp.value.trim();
        if (!v) { U.toast('写下这一餐吃了什么，例如：燕麦 蓝莓 酸奶'); return; }
        st.foods = (st.foods ? st.foods + ' ' : '') + v;
        foodInp.value = '';
        $('dyFoodNote').textContent = '这一餐：' + st.foods;
        U.toast('已加入这一餐');
      };
      $('dyFoodAdd').addEventListener('click', addFood);
      foodInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') addFood(); });
      const bodyInp = $('dyBody');
      bodyInp.addEventListener('input', () => { st.body = bodyInp.value; });

      $('dySave').addEventListener('click', () => {
        if (!st.foods && !st.symptoms.length && !st.body) {
          U.toast('至少写点什么：食物、症状或一句身体感受');
          return;
        }
        sim.addDiary({
          meal: st.meal, foods: st.foods, mood: st.mood, stress: +st.stress,
          sleepH: +st.sleepH, sleepQ: st.sleepQ, symptoms: st.symptoms.slice(), body: st.body,
        });
        diarySave();
        st.foods = ''; st.body = ''; st.symptoms = [];
        $('dyFood').value = ''; $('dyBody').value = '';
        $('dyFoodNote').textContent = '还没填这一餐（可以留空，只记录心情与睡眠）';
        $('dySymps').querySelectorAll('[data-dysym]').forEach((b) => b.classList.remove('on', 'warn'));
        bindDiaryList();
        U.toast('已保存 · 日记共 ' + sim.diary.length + ' 条');
      });

      bindDiaryList();
      $('dyAnalyze').addEventListener('click', analyzeDiary);
    }
    U.openDiary = openDiary;

    /* ---------- 一键分析 ---------- */
    function analyzeDiary() {
      if (!sim.diary.length) { U.toast('还没有任何记录：先保存一两条再分析'); return; }
      const a = diaryAgg();
      const days = sim.diary.map((d) => +d.day);
      const span = Math.max(1, Math.max.apply(null, days) - Math.min.apply(null, days) + 1);
      const hitIds = Object.keys(a.hits).sort((x, y) => a.hits[y] - a.hits[x]);
      const items = hitIds.map((id) => PFI[id]).filter(Boolean);
      const mainMood = Object.keys(a.moodCount).sort((x, y) => a.moodCount[y] - a.moodCount[x])[0];
      const mood = dyMoodOf(mainMood);
      const symps = Object.keys(a.sympCount).sort((x, y) => a.sympCount[y] - a.sympCount[x]);

      /* ② 菌群变化的预测条目 */
      const eco = [];
      if (a.meal && a.meal.items.length) {
        mealPredict(a.meal).forEach((p) => eco.push([p[0], '饮食：' + p[1]]));
      } else {
        eco.push(['→', '这几条记录里没有食物信息，饮食对生态的影响无法评估——下次记得写下三餐。']);
      }
      if (a.stress >= 7) eco.push(['↓', '压力持续偏高：蠕动与免疫张力上升、黏液分泌减少，<b>产丁酸菌受压、屏障变漏</b>，耐氧的肠杆菌科更容易抬头。']);
      else if (a.stress <= 3) eco.push(['↑', '压力处于低位：蠕动与免疫张力平稳，有利于严格厌氧的产丁酸菌维持种群。']);
      else eco.push(['→', '压力中等：生态不会因此剧烈波动，但叠加上面的饮食因素后仍有累积效应。']);
      if (a.sleepH < 6.5) eco.push(['↓', '睡眠不足（平均 ' + a.sleepH.toFixed(1) + ' h）：菌群昼夜节律被打乱，<b>多样性与产丁酸菌下降</b>，炎症基线抬高。']);
      else if (a.sleepH >= 7 && a.sleepV > 0.4) eco.push(['↑', '睡眠充足且质量好：有助于维持菌群节律与丁酸产出。']);
      else eco.push(['→', '睡眠时长一般：若能稳定在 7 h 以上并提升深睡比例，通常能看到多样性回升。']);
      if (a.sleepV < -0.4) eco.push(['↓', '睡眠质量差：碎片化睡眠会抬高屏障通透性与炎症，第二天常表现为腹胀与"肠漏感"。']);
      if (mood && (mood.id === 'low' || mood.id === 'flat')) eco.push(['↓', '情绪持续偏低：色氨酸更多走向犬尿氨酸通路，<b>产丁酸菌与双歧/乳酸菌份额下降</b>，炎症升高。']);
      if (mood && mood.id === 'anxious') eco.push(['↑', '焦虑主导：蠕动加快、产气上升，菌群被"冲刷"，敏感菌难以驻留。']);

      /* ③ 器官影响 */
      let axes = GUT.AXES.filter((ax) => (ax.rel || []).some((id) => hitIds.indexOf(id) >= 0));
      if (!axes.length && a.stress >= 6) axes = [GUT.AXIS_INDEX.brain];
      if (!axes.length) axes = [GUT.AXIS_INDEX.immune];
      const axisHTML = axes.slice(0, 4).map((ax) => {
        const mols = ax.molecules.slice(0, 4).map((m) => {
          const d = MOL_DIR[m.dir] || MOL_DIR.flat;
          return `<span class="pfTag" style="color:${d.c};border-color:${d.c}55;background:${d.c}12">${m.name} ${d.s}</span>`;
        }).join('');
        return `<div class="molRow" data-dyax="${ax.id}" style="cursor:pointer">
          <div class="molHead"><b>${ax.title}</b><em style="color:${ax.color}">靶器官：${ax.organ}</em></div>
          <div class="pfLine" style="margin:5px 0">${mols}</div>
          <p>可能出现：${ax.symptoms.slice(0, 3).join('；')}。</p>
        </div>`;
      }).join('');

      /* ④ 饮食建议 */
      const diet = a.meal ? mealTips(a.meal) : ['这几条记录里没有食物，建议从下一餐开始记录：写下<b>主食 + 一份蔬菜 + 一份蛋白</b>即可。'];
      if (a.stress >= 6) diet.push('压力偏高时最容易跳过正餐、转向高糖高脂：优先保住<b>固定三餐 + 一份蔬菜</b>，比追求完美饮食更重要。');
      if (a.sleepH < 6.5) diet.push('把膳食纤维集中在白天、睡前 3 小时不再进食，既减少夜间产气，也给菌群一个真实的"夜间空腹期"。');
      if (symps.indexOf('腹胀 / 排气多') >= 0) diet.push('腹胀明显时，纤维选<b>可溶性</b>（燕麦、车前子、奇亚籽）并循序渐进，避免一次性大量粗纤维。');
      if (symps.indexOf('便秘') >= 0) diet.push('便秘时<b>纤维 + 水必须同时补</b>（25～30 g 纤维配 1.5～2 L 水），西梅、猕猴桃与洋车前子壳的证据最强。');

      /* ⑤ 其他建议 */
      const other = [];
      if (a.stress >= 6) other.push('每天留 10 分钟慢呼吸或放松训练：对肠道的作用经由迷走神经起效，与饮食同等重要。');
      if (a.sleepH < 6.5) other.push('固定起床时间比固定入睡时间更重要；先稳住晨间光照锚点，再逐步提前入睡。');
      if (a.sleepV < -0.4) other.push('睡眠质量差时，先排查：晚间咖啡因 / 酒精、睡前屏幕光、深夜加餐与疼痛不适。');
      other.push('每周 150 分钟中等强度运动 + 2 次力量训练：它是少数能<b>独立于饮食</b>提升菌群多样性的杠杆。');
      other.push('每坐 45 分钟起身活动 3～5 分钟，能明显改善肠蠕动与餐后血糖。');
      if (!other.length) other.push('目前没有特别需要干预的信号：保持"食材多样 + 规律作息"就是最好的维护。');

      const hitChips = items.map((p) => {
        const g = GUT.PROFILE_GROUPS.filter((x) => x.id === p.group)[0] || { color: '#2DD4BF' };
        return `<button class="libCard" data-dypf="${p.id}"><i style="background:${g.color}"></i><b>${p.label}</b><span>${p.tag} · 查看资料卡</span></button>`;
      }).join('');

      openModal(`
        <span class="mTag" style="color:#F472B6;border-color:#F472B666;background:#F472B612">日记 · 一键分析</span>
        <h3 class="mTitle">我的档案 · 分析报告</h3>
        <p class="mSub">基于 ${a.n} 条记录 · 覆盖约 ${span.toFixed(0)} 天 · 下面是它们叠加后对生态与器官的预测</p>
        <p class="mLead">这几天的总体画像：<b>压力 ${a.stress.toFixed(1)}/10（${stressText(a.stress)}）· 睡眠 ${a.sleepH.toFixed(1)} h · 心情以「${mood ? mood.label : '—'}」为主</b>。生态最可能的方向是：${a.bio.butyrate < -0.02 ? '<b>丁酸下降、屏障变漏、炎症上升</b>' : a.bio.butyrate > 0.02 ? '<b>丁酸回升、炎症回落</b>' : '<b>基本维持，但仍有可优化空间</b>'}。</p>

        <h4 class="repH">① 日记概览</h4>
        <div class="mGrid">
          <div><span>记录条数</span><b>${a.n}</b></div>
          <div><span>平均压力</span><b style="color:${a.stress >= 7 ? '#FF6B4A' : a.stress >= 5 ? '#F5B944' : '#34D399'}">${a.stress.toFixed(1)} / 10</b></div>
          <div><span>平均睡眠</span><b style="color:${a.sleepH < 6.5 ? '#FF6B4A' : a.sleepH < 7 ? '#F5B944' : '#34D399'}">${a.sleepH.toFixed(1)} h</b></div>
          <div><span>三餐覆盖</span><b>${Object.keys(a.mealCount).length} / 4</b></div>
        </div>
        <div class="pfLine">
          ${symps.slice(0, 6).map((s) => `<span class="pfTag up">${s} ×${a.sympCount[s]}</span>`).join('') || '<span class="pfTag">没有勾选身体症状</span>'}
        </div>

        <h4 class="repH">② 肠道菌群会发生什么变化</h4>
        <div class="pfLine">
          ${dyTag('丁酸', a.bio.butyrate, true, '%')}
          ${dyTag('炎症', a.bio.inflammation, false, '%')}
          ${dyTag('肠屏障', a.bio.barrier, true, '%')}
          ${dyTag('产气', a.bio.gas, false, '%')}
        </div>
        <div class="pfLine">
          ${dyTag('压力（环境）', a.env.stress, false, '')}
          ${dyTag('肠蠕动', a.env.motility, false, '')}
          ${dyTag('免疫张力', a.env.immune, false, '')}
          ${dyTag('膳食纤维', a.env.fiber, true, '')}
        </div>
        <ul class="repCause">${eco.map((p) => `<li data-i="${p[0]}">${p[1]}</li>`).join('')}</ul>
        ${items.length ? `<h4 class="repH">与之相关的状态（可点开看资料卡）</h4><div class="libGrid">${hitChips}</div>` : ''}
        ${items.length ? `<div class="mSect fear"><h4>菌群结构上的共同特征</h4><p>${items.slice(0, 3).map((p) => strip(p.micro).slice(0, 110) + '…').join(' ')}</p></div>` : ''}
        ${a.unknown.length ? `<p class="tiny">身体描述里没认出来的词：<b>${a.unknown.join('、')}</b>——换个常见说法（如"压力大""便秘""经期"）会更准。</p>` : ''}

        <h4 class="repH">③ 对其他器官的影响</h4>
        <div class="molWrap">${axisHTML}</div>

        <h4 class="repH">④ 饮食调整建议</h4>
        <ul class="repCause">${uniq(diet).map((t) => `<li data-i="✓">${t}</li>`).join('')}</ul>

        <h4 class="repH">⑤ 作息与其他有用建议</h4>
        <ul class="repCause">${other.map((t) => `<li data-i="✓">${t}</li>`).join('')}</ul>

        <div class="mSect fact"><h4>需要就医的信号（红旗）</h4><p>如果出现下列情况，请尽快就医，而不是只做饮食调整：${GUT.DIARY_FLAGS.join('；')}。</p></div>

        <button class="dBtn dyPrimary" id="dyApply">把这份分析应用到模拟器</button>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);

      const body = $('modalBody');
      body.querySelectorAll('[data-dypf]').forEach((b) =>
        b.addEventListener('click', () => openProfileCard(b.dataset.dypf))
      );
      body.querySelectorAll('[data-dyax]').forEach((b) =>
        b.addEventListener('click', () => openAxis(GUT.AXIS_INDEX[b.dataset.dyax]))
      );
      $('dyApply').addEventListener('click', () => {
        const ids = sim.profile.slice();
        hitIds.forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); });
        sim.setProfile(ids);
        syncProfileChips();
        U.syncEnv();
        if (a.meal && a.meal.items.length) {
          sim.meal(a.meal);
          lastMealN = -1;
          renderMeals();
        }
        closeModal();
        U.toast('已应用：' + (items.length ? items.map((p) => p.label).join('、') : '生态基线') + ' 已写入状态档案');
        setTimeout(() => openProfileReport(), 400);
      });
    }
    U.analyzeDiary = analyzeDiary;

    /* ---------- 图鉴（分栏科普库） ---------- */
    const TONE_COLOR = { danger: '#FF6B4A', warn: '#F5B944', good: '#34D399', plain: '#7E9AA0' };
    const strip = (s) => s.replace(/<[^>]+>/g, '');

    /* ---------- 精神类状态的数据准备好：健康对照 + 各条档案 ---------- */
    const PSY_ORDER = ['depression', 'autism', 'schizophrenia', 'adhd', 'anxiety', 'stressHigh'];
    const PSY_SHORT = {
      depression: '抑郁症', autism: '孤独症谱系', schizophrenia: '精神分裂症',
      adhd: '多动症 / ADHD', anxiety: '焦虑障碍', stressHigh: '长期压力',
    };

    function psyItems() {
      const g = GUT.PROFILE_GROUPS.find((x) => x.id === 'mental') || { color: '#2DD4BF' };
      const list = PF.filter((p) => p.group === 'mental');
      list.sort((a, b) => PSY_ORDER.indexOf(a.id) - PSY_ORDER.indexOf(b.id));
      const cols = [{
        id: '', short: '健康对照', note: '基线菌群', color: '#7E9A9E', heading: '健康对照：以物种 seed 为基线份额，条形代表 0 参考线。',
        item: { species: {}, molecules: [], bio: {} },
      }];
      list.forEach((p, i) => {
        cols.push({
          id: p.id,
          short: PSY_SHORT[p.id] || String(p.label).split(/[ /（(]/)[0],
          note: strip(p.micro).slice(0, 20) + '…',
          color: MOL_PALETTE[i % MOL_PALETTE.length],
          heading: strip(p.lead).slice(0, 60),
          item: p,
        });
      });
      return cols;
    }

    const psyPanel = `
      <p class="mSub">同一套环境变量下，不同精神类状态的菌群走向差别很大：下面的图把它们和健康对照放在一起对比，每 4 秒自动轮换高亮，点击任意一列打开它的完整资料卡。</p>
      <canvas class="psyCmp" id="psyCmp"></canvas>
      <div class="psyNote"><b id="psyHead">正在对比…</b><span>条形向右＝升高 / 增多，向左＝下降 / 减少；绿色＝通常有利的方向，红色＝通常不利的方向</span></div>
    `;

    function mountPsy(root) {
      const cv = root.querySelector('#psyCmp');
      const head = root.querySelector('#psyHead');
      if (!cv) return;
      const inst = psyCompare(cv, psyItems(), (id) => openProfileCard(id), (text) => {
        if (head) head.textContent = text;
      });
      molAnims.push(inst);
      inst.start();
    }

    function openLibrary(tab) {
      const cur = tab || 'ev';
      const tabs = [
        { id: 'ev', label: '临床干预' },
        { id: 'mt', label: '生态指标' },
        { id: 'sp', label: '菌群物种' },
        { id: 'pf', label: '状态档案' },
        { id: 'ax', label: '肠-器官轴' },
        { id: 'topic', label: '生态原理' },
        { id: 'psy', label: '肠脑 · 精神' },
      ];
      let cards = '';
      if (cur === 'ev') {
        cards = GUT.EVENTS.map((e) => {
          const i = GUT.EVENT_INFO[e.id];
          return `<button class="libCard" data-ev="${e.id}"><i style="background:${TONE_COLOR[e.tone]}"></i><b>${e.label}</b><span>${i.tag} · ${strip(i.mech).slice(0, 32)}…</span></button>`;
        }).join('');
      } else if (cur === 'mt') {
        cards = Object.keys(GUT.METRIC_INFO).map((k) => {
          const m = GUT.METRIC_INFO[k];
          return `<button class="libCard" data-mt="${k}"><i style="background:${m.color}"></i><b>${m.label}</b><span>${strip(m.what).slice(0, 32)}…</span></button>`;
        }).join('');
      } else if (cur === 'sp') {
        cards = S.map((sp) => `<button class="libCard" data-sp="${sp.id}"><i style="background:${sp.color}"></i><b>${sp.name}</b><span>${sp.latin} · ${ROLE_TEXT[sp.role]}</span></button>`).join('');
      } else if (cur === 'pf') {
        cards = PF.map((p) => {
          const g = GUT.PROFILE_GROUPS.find((x) => x.id === p.group) || { color: '#2DD4BF' };
          return `<button class="libCard" data-pf="${p.id}"><i style="background:${g.color}"></i><b>${p.label}</b><span>${p.tag} · ${strip(p.micro).slice(0, 30)}…</span></button>`;
        }).join('');
      } else if (cur === 'psy') {
        cards = psyItems().slice(1).map((c) =>
          `<button class="libCard" data-pf="${c.id}"><i style="background:${c.color}"></i><b>${c.short}</b><span>${c.note}</span></button>`).join('');
      } else if (cur === 'ax') {
        cards = GUT.AXES.map((a) => `<button class="libCard" data-ax="${a.id}"><i style="background:${a.color}"></i><b>${a.title}</b><span>${a.organ} · ${strip(a.symptoms[0]).slice(0, 26)}…</span></button>`).join('');
      } else {
        cards = GUT.TOPICS.map((t) => `<button class="libCard" data-topic="${t.id}"><i style="background:${t.color}"></i><b>${t.title}</b><span>${t.tag} · ${strip(t.body[0]).slice(0, 32)}…</span></button>`).join('');
      }
      openModal(`
        <h3 class="mTitle">图鉴 · 每个旋钮都在改什么</h3>
        <p class="mSub">共 ${GUT.EVENTS.length} 个干预事件、${Object.keys(GUT.METRIC_INFO).length} 个生态指标、${S.length} 个物种、${PF.length} 项状态档案、${GUT.AXES.length} 条肠-器官轴、${GUT.TOPICS.length} 篇原理，点击任意卡片查看完整解释</p>
        <div class="libTabs">
          ${tabs.map((t) => `<button class="tabBtn${t.id === cur ? ' on' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
        ${cur === 'psy' ? psyPanel : ''}
        <div class="libGrid">${cards}</div>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
      const body = $('modalBody');
      if (cur === 'psy') mountPsy(body);
      body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => openLibrary(b.dataset.tab)));
      body.querySelectorAll('[data-ev]').forEach((b) => b.addEventListener('click', () => openEvent(b.dataset.ev)));
      body.querySelectorAll('[data-mt]').forEach((b) => b.addEventListener('click', () => openMetric(b.dataset.mt)));
      body.querySelectorAll('[data-topic]').forEach((b) => b.addEventListener('click', () => openTopic(GUT.TOPICS.find((t) => t.id === b.dataset.topic))));
      body.querySelectorAll('[data-ax]').forEach((b) => b.addEventListener('click', () => openAxis(GUT.AXIS_INDEX[b.dataset.ax])));
      body.querySelectorAll('[data-sp]').forEach((b) => b.addEventListener('click', () => openSpecies(GUT.SPECIES_INDEX[b.dataset.sp])));
      body.querySelectorAll('[data-pf]').forEach((b) => b.addEventListener('click', () => openProfileCard(b.dataset.pf)));
    }
    U.openLibrary = openLibrary;

    function openHelp() {
      openModal(`
        <h3 class="mTitle">怎么玩这个模拟器</h3>
        <p class="mSub">一个可拨动的肠道生态沙盒</p>
        <div class="mSect"><h4>1 · 改变环境</h4><p>左侧滑块控制膳食纤维、蛋白脂肪、发酵食品、肠蠕动、免疫张力、心理压力与抗生素暴露。生态会在几天内重新洗牌。</p></div>
        <div class="mSect"><h4>2 · 记录你今天吃了什么</h4><p>在左栏「今天吃了什么」里写下食物（用空格 / 逗号隔开，支持<b>"两碗燕麦"</b>这样的数量），点「记录」后会得到<b>膳食分析报告</b>：识别结果、菌群友好度评分、四个营养维度，以及接下来 1～2 天的预测与改进建议。生态会立刻响应，并在 2 天后给出前后对比的变化报告。</p></div>
        <div class="mSect"><h4>3 · 填写我的状态档案</h4><p>在左栏「我的状态档案」里<b>自由输入</b>你的情况（比如"我有糖尿病，最近压力大、熬夜，正在经期"），或直接点选词条：代谢、精神心理、作息、关系生活事件、生理周期、肠道症状与用药共 ${GUT.PROFILE_ITEMS.length} 项（也支持口语输入，如"最近谈恋爱了""刚分手"）。每项都会改写生态，并附一张资料卡：<b>菌群会怎么变 → 会产生哪些小分子 → 这些小分子影响哪些器官 → 饮食与作息怎么调</b>。点「查看影响报告」可以看到所有状态叠加后的净影响。</p></div>
        <div class="mSect"><h4>4 · 写我的档案（日记本）</h4><p>顶栏<b>「我的档案」</b>是一个日记本：按<b>早 / 午 / 晚 / 加餐</b>记录吃了什么，再选心情、拖压力值（0～10）、填睡眠时长与质量、勾选身体症状并补充一句感受。攒几条后点<b>「一键分析」</b>，会给出：日记概览 → 肠道菌群的变化预测（丁酸 / 炎症 / 屏障 / 产气与关键菌种）→ 对其他器官的影响（关联的肠-器官轴、关键小分子与可能出现的不适）→ 饮食调整建议 → 作息建议与需要就医的红旗信号。点<b>「应用到模拟器」</b>可以把结论直接写进状态档案并让生态响应。</p></div>
        <div class="mSect"><h4>5 · 触发事件</h4><p>"抗生素疗程"是最经典的扰动：看菌群总量崩塌、丁酸消失、肠杆菌与艰难拟梭菌趁虚而入；再用"益生元干预"或"粪菌移植"重建。<b>每次施加后，模拟器会自动弹出「变化报告」</b>：对比施加前后的指标与菌群份额，并逐条解释变化原因；底栏时间轴上的事件标记也可以随时点开回看。</p></div>
        <div class="mSect"><h4>6 · 观察与互动</h4><p>点击画布里的任意菌体，或右侧列表中的物种，就能看到它的科普卡片与实时数据。切换"投放益生菌 / 投放纤维"工具后，可以在肠腔里点一下做局部投放。</p></div>
        <div class="mSect"><h4>7 · 读懂指标</h4><p>重点看四个：多样性（生态是否丰富）、丁酸（抗炎能量分子）、肠屏障（是否变"漏"）、炎症（是否失控）。它们互相耦合，牵一发而动全身。</p></div>
        <div class="mSect"><h4>8 · 看肠与器官之间的联系</h4><p>科普库里的<b>「肠-器官轴」</b>分栏收录了 ${GUT.AXES.length} 条轴（脑 / 肝 / 肺 / 皮肤 / 心 / 胰 / 肾 / 骨 / 肌肉 / 性腺 / 甲状腺 / 免疫）。每条都按同一条线索展开：<b>什么情况会扰动它 → 菌群的基本特征怎么变 → 哪些小分子分泌变化、作用于哪个器官 → 如何影响靶器官 → 人体会表现出什么不适</b>，最后给出调整方向与相关的状态档案条目。</p></div>
        <div class="mSect"><h4>9 · 随时查解释</h4><p>① 每个事件按钮<b>右上角的 ?</b>：看它的机制、生态后果与临床背景；② 右侧<b>指标名称</b>与画布 HUD 上的 pH／传输时间／总菌量／肠型都可点开，看到参考区间与变化原因；③ 顶栏<b>科普库</b>里有分栏图鉴（干预 / 指标 / 物种 / 状态档案 / 肠-器官轴 / 原理）。</p></div>
        <div class="mSect"><h4>10 · 试试这些实验</h4><p>① 纤维拉到 0 两周，看黏液层发生什么；② 抗生素之后立刻暴露致病菌；③ 把蠕动拉满，看菌群总量如何被冲刷；④ 勾上"2 型糖尿病"再对比"规律运动"，看同一条肠-胰轴往两个方向摆；⑤ 在日记里连记三天"熬夜 + 高压力 + 炸鸡奶茶"，看一键分析给出的方向。</p></div>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
    }
    U.openHelp = openHelp;

    U.openWelcome = function () {
      openModal(`
        <span class="mTag" style="color:#2DD4BF;border-color:#2DD4BF66;background:#2DD4BF12">WELCOME</span>
        <h3 class="mTitle">欢迎来到你的肠道</h3>
        <p class="mSub">这是一个可以亲手拨动的肠道微生态沙盒</p>
        <p class="mLead">画面中央是<b>结肠横截面</b>：外圈暖色是肠壁与绒毛，青绿色的半透明带是<b>黏液层</b>，中间流动的彩色小点就是<b>菌群</b>——不同颜色和形状代表不同物种。</p>
        <div class="mSect"><h4>三件可以马上做的事</h4><p>① 点一下画布里的任意菌体，看它是谁、喜欢吃什么；<br>② 把左侧「膳食纤维」拉到 0，观察黏液层与屏障的变化；<br>③ 点击「抗生素疗程」，看一个生态系统如何崩塌又重建。</p></div>
        <div class="libGrid">
          <button class="libCard" id="wcHelp"><i style="background:#2DD4BF"></i><b>玩法说明</b><span>滑块、事件、指标分别代表什么</span></button>
          <button class="libCard" id="wcLib"><i style="background:#A78BFA"></i><b>科普库</b><span>短链脂肪酸、肠屏障、粪菌移植…</span></button>
          <button class="libCard" id="wcPf"><i style="background:#F472B6"></i><b>填写我的状态档案</b><span>糖尿病、压力、睡眠、经期…都会改变菌群</span></button>
          <button class="libCard" id="wcAx"><i style="background:#7DD3FC"></i><b>肠-器官轴</b><span>脑、肝、肺、皮肤…肠道如何远程影响它们</span></button>
          <button class="libCard" id="wcDy"><i style="background:#FF6B4A"></i><b>写我的档案（日记本）</b><span>记三餐 / 心情 / 压力 / 睡眠，一键分析</span></button>
        </div>
        <p class="mFoot">${GUT.BASELINE_NOTE}</p>
      `);
      $('wcHelp').addEventListener('click', openHelp);
      $('wcLib').addEventListener('click', openLibrary);
      $('wcAx').addEventListener('click', () => openLibrary('ax'));
      $('wcDy').addEventListener('click', () => openDiary());
      $('wcPf').addEventListener('click', () => {
        closeModal();
        const sec = document.querySelector('.block-profile');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const inp = $('pfInput');
        if (inp) { inp.focus(); inp.classList.add('flash'); setTimeout(() => inp.classList.remove('flash'), 1200); }
        U.toast('写下你的状态，例如：糖尿病 压力大 熬夜 经期');
      });
    };

    /* 情境科普弹窗（一次性） */
    const TRIGGERS = [
      { id: 'abxStart', when: () => sim.abxLevel > 0.3, topic: 'abx', text: '抗生素已经开始清场。注意看：敏感菌在数小时内大量消失，多样性骤降。' },
      { id: 'inflamHigh', when: () => sim.inflammation > 0.6, topic: 'barrier', text: '炎症进入高位。屏障变薄、丁酸下降，会让促炎菌更容易扩张——这是一个正反馈。' },
      { id: 'cdiffBloom', when: () => sim.n[IX.cdiff] / Math.max(sim.total, 1e-9) > 0.05, topic: 'fmt', text: '艰难拟梭菌爆发了。它并不是"变强了"，而是竞争对手和定植抵抗消失了。' },
      { id: 'barrierLow', when: () => sim.barrier < 0.28, topic: 'barrier', text: '肠屏障严重受损。黏液层变薄 + 丁酸匮乏，通常意味着菌群已经转向"啃食"宿主黏液。' },
      { id: 'diversityLow', when: () => sim.diversity < 0.45, topic: 'fiber', text: '多样性崩塌。此时生态系统很脆弱，恢复需要持续的膳食纤维与时间。' },
      { id: 'butyrateHigh', when: () => sim.butyrate > 0.85, topic: 'scfa', text: '丁酸进入高位。丁酸是结肠上皮细胞的首选燃料，也是抗炎信号分子——这正是高纤维饮食的价值。' },
    ];
    function checkTriggers() {
      if (!modalRoot.hidden) return;
      for (const t of TRIGGERS) {
        if (U.flags[t.id]) continue;
        if (t.when()) {
          U.flags[t.id] = true;
          const topic = GUT.TOPICS.find((x) => x.id === t.topic);
          openTopic({ ...topic, title: '发生了什么 · ' + topic.title, body: [`<b>${t.text}</b>`, ...topic.body] });
          break;
        }
      }
    }

    /* ============ Toast ============ */
    let toastTimer = null;
    U.toast = function (msg) {
      const el = $('toast');
      el.textContent = msg;
      el.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (el.hidden = true), 2600);
    };

    /* ============ 每帧刷新 ============ */
    let last = 0;
    U.update = function (force) {
      const now = performance.now();
      if (!force && now - last < 120) return;
      last = now;
      pushHistory();

      // chips
      CHIPS.forEach((c, i) => {
        const v = clamp(c.get(), 0, 1);
        const el = chipEls[i];
        el.querySelector('b').textContent = c.fmt(v);
        el.querySelector('b').style.color = toneColor(v, c.invert);
        el.querySelector('small').textContent = c.note();
      });

      // HUD
      $('hudDay').textContent = '第 ' + sim.day.toFixed(1) + ' 天';
      $('hudPH').textContent = sim.pH.toFixed(2);
      $('hudTransit').textContent = (72 - sim.env.motility * 0.58).toFixed(0) + ' h';
      $('hudTotal').textContent = cfu(sim.total) + ' CFU/g';
      $('hudEntero').textContent = '肠型：' + (sim.enterotype ? sim.enterotype.label : '—');
      $('abxBadge').classList.toggle('on', sim.abxLevel > 0.03);

      // 指标
      const total = Math.max(sim.total, 1e-9);
      METRICS.forEach((m, i) => {
        const v = clamp(m.get(), 0, 1);
        const el = metricEls[i];
        el.querySelector('b').textContent = (v * 100).toFixed(0) + '%';
        el.querySelector('b').style.color = toneColor(v, m.invert);
        const f = el.querySelector('.mFill');
        f.style.width = (v * 100).toFixed(1) + '%';
        f.style.background = toneColor(v, m.invert);
      });

      // 健康度
      const health = clamp(
        0.28 * sim.diversity + 0.26 * sim.barrier + 0.20 * clamp(sim.butyrate, 0, 1) +
        0.18 * (1 - sim.inflammation) + 0.08 * (1 - clamp(sim.gas, 0, 1)), 0, 1
      );
      const ring = $('ring');
      ring.style.setProperty('--pct', (health * 100).toFixed(1));
      ring.style.setProperty('--ringc', toneColor(health));
      $('ringVal').textContent = (health * 100).toFixed(0);
      $('ringVal').style.color = toneColor(health);
      $('ringLab').textContent =
        health > 0.75 ? '稳态 · 健康' : health > 0.55 ? '轻度失调' : health > 0.35 ? '明显失调' : '严重失调';
      $('healthNote').textContent =
        health > 0.75 ? '多样性、屏障与丁酸都在健康区间，生态较稳定。'
          : health > 0.55 ? '生态出现波动，通常通过调整膳食纤维可以回升。'
            : health > 0.35 ? '生态失衡明显：多样性下降、屏障变薄、炎症升高。'
              : '生态濒临崩溃：考虑益生元干预或粪菌移植。';
      $('miniMetrics').innerHTML =
        `<div class="miniItem">总量 ${cfu(sim.total)}</div>` +
        `<div class="miniItem">pH ${sim.pH.toFixed(2)}</div>` +
        `<div class="miniItem">SCFA ${(clamp(sim.scfa, 0, 1) * 100).toFixed(0)}%</div>`;

      // 堆叠条
      let maxSh = 0.001;
      const sh = sim.n.map((v) => v / total);
      S.forEach((sp, i) => (stackBars[i].style.width = (sh[i] * 100).toFixed(2) + '%'));

      // 物种列表
      S.forEach((sp, i) => {
        const row = spRows[i];
        row.querySelector('.spPct').textContent = sh[i] < 0.0005 ? '<0.1%' : (sh[i] * 100).toFixed(1) + '%';
        row.querySelector('.spBar i').style.width = clamp((sh[i] / 0.4) * 100, 0, 100) + '%';
        row.title = `${sp.latin} · ${ROLE_TEXT[sp.role]}`;
        if (sh[i] > maxSh) maxSh = sh[i];
      });

      // 详情
      if (U.selected != null && U.selected >= 0) {
        const i = U.selected, sp = S[i];
        const old = U.history.length > 4 ? U.history[Math.max(0, U.history.length - 5)] : null;
        const oldSh = old ? old.n[i] / Math.max(old.n.reduce((a, b) => a + b, 0), 1e-9) : sh[i];
        const d = sh[i] - oldSh;
        $('detail').innerHTML = `
          <div class="dHead">
            <i style="background:${sp.color}"></i>
            <b>${sp.name}</b>
            <span class="role" style="color:${ROLE_COLOR[sp.role]};border-color:${ROLE_COLOR[sp.role]}55">${ROLE_TEXT[sp.role]}</span>
          </div>
          <div class="dGrid">
            <div><span>相对丰度</span><b style="color:${sp.color}">${(sh[i] * 100).toFixed(1)}%</b></div>
            <div><span>绝对量</span><b>${cfu(sim.n[i])}</b></div>
            <div><span>2 天趋势</span><b style="color:${d > 0.002 ? '#34D399' : d < -0.002 ? '#FF6B4A' : '#93aeb4'}">${d > 0.002 ? '↑' : d < -0.002 ? '↓' : '→'} ${Math.abs(d * 100).toFixed(2)}pp</b></div>
            <div><span>最适 pH</span><b>${sp.phOpt.toFixed(1)}</b></div>
          </div>
          <p class="dNote">${sp.sci.headline}</p>
          <button class="dBtn" id="dBtnMore">查看完整科普卡片</button>
        `;
        $('dBtnMore').addEventListener('click', () => openSpecies(i));
      }

      // 时间轴
      renderMeals();
      renderTimeline();
      checkTriggers();
    };

    function renderTimeline() {
      const span = 50;
      const start = Math.max(0, sim.day - 45);
      const track = $('tlTrack');
      const want = [];
      sim.events.forEach((e, i) => {
        if (e.day >= start - 1) want.push({ e, i });
      });
      want.splice(0, Math.max(0, want.length - 14));
      track.innerHTML = want
        .map(({ e, i }) => {
          const x = clamp(((e.day - start) / span) * 100, 0, 99);
          return `<div class="tlMark ${e.tone}" data-i="${i}" title="点击查看这个事件至今的变化" style="left:${x}%">D${e.day.toFixed(0)} ${e.label}</div>`;
        })
        .join('');
      const ticks = [];
      for (let i = 0; i <= 4; i++) ticks.push((start + (span * i) / 4).toFixed(0) + 'd');
      $('tlScale').innerHTML = ticks.map((t) => `<span>${t}</span>`).join('');
      $('tlLog').innerHTML = sim.log
        .slice(0, 10)
        .map((l) => `<div class="${l.tone}"><b>D${l.day.toFixed(1)}</b> ${l.text}</div>`)
        .join('');
    }

    buildChips();
    buildEnv();
    buildEvents();
    buildTools();
    buildMetrics();
    buildHudLinks();
    buildTimelineLinks();
    buildMeal();
    buildProfile();
    buildStack();
    buildSpecies();

    return U;
  };
})(typeof window !== 'undefined' ? window : globalThis);
