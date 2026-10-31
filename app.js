/* 肠道菌群生态模拟器 · 应用入口 */
(function () {
  'use strict';
  const GUT = window.GUT;
  const S = GUT.SPECIES;

  const canvas = document.getElementById('scene');
  const sim = GUT.createSim();
  const R = GUT.createRenderer(canvas, sim);
  const ui = GUT.createUI({ sim, renderer: R });

  /* ---------------- 运行控制 ---------------- */
  const SPEEDS = [0.5, 1, 2, 4];
  let speed = 1;
  const speedBox = document.getElementById('speed');
  SPEEDS.forEach((s) => {
    const b = document.createElement('button');
    b.textContent = s + '×';
    b.className = s === 1 ? 'on' : '';
    b.addEventListener('click', () => {
      speed = s;
      [...speedBox.children].forEach((c) => c.classList.remove('on'));
      b.classList.add('on');
    });
    speedBox.appendChild(b);
  });

  const btnPlay = document.getElementById('btnPlay');
  function setPlay(v) {
    sim.running = v;
    btnPlay.textContent = v ? '暂停' : '继续';
    btnPlay.classList.toggle('btn-primary', v);
  }
  btnPlay.addEventListener('click', () => setPlay(!sim.running));
  document.getElementById('btnLib').addEventListener('click', () => ui.openLibrary());
  document.getElementById('btnHelp').addEventListener('click', () => ui.openHelp());

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); setPlay(!sim.running); }
  });

  /* ---------------- 画布交互 ---------------- */
  const wrap = canvas.parentElement;
  const tip = document.getElementById('tip');

  function localPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener('mousemove', (e) => {
    const p = localPos(e);
    R.pointer.x = p.x;
    R.pointer.y = p.y;
    R.pointer.inside = true;
    if (R.tool !== 'probe') { R.hover = null; tip.classList.remove('on'); return; }
    const idx = R.pick(p.x, p.y);
    R.hover = idx;
    if (idx != null) {
      const sp = S[idx];
      const sh = sim.n[idx] / Math.max(sim.total, 1e-9);
      tip.innerHTML = `<b style="color:${sp.color}">${sp.name}</b> · ${(sh * 100).toFixed(1)}%<br><span style="color:#6f8d94">${sp.latin}</span>`;
      tip.style.left = p.x + 'px';
      tip.style.top = p.y - 6 + 'px';
      tip.classList.add('on');
      canvas.style.cursor = 'pointer';
    } else {
      tip.classList.remove('on');
      canvas.style.cursor = 'default';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    R.pointer.inside = false;
    R.hover = null;
    tip.classList.remove('on');
  });

  canvas.addEventListener('click', (e) => {
    const p = localPos(e);
    if (R.tool === 'probe') {
      const idx = R.pick(p.x, p.y);
      if (idx != null) {
        ui.select(idx);
        ui.openSpecies(idx);
      } else {
        R.highlight = null;
        ui.select(-1);
      }
    } else {
      sim.release(R.tool);
      R.burst(p.x, p.y, R.tool);
    }
  });

  /* ---------------- 自适应 ---------------- */
  if (window.ResizeObserver) {
    new ResizeObserver(() => R.resize()).observe(wrap);
  }
  window.addEventListener('resize', () => R.resize());

  /* ---------------- 主循环 ---------------- */
  const DAY_PER_SEC = 0.55; // 1× 速度下，现实 1 秒 ≈ 模拟 0.55 天
  let last = performance.now();
  let drawAcc = 0;
  function frame(now) {
    const dtVis = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (sim.running) sim.step(dtVis * DAY_PER_SEC * speed);
    const rep = sim.takeReport();
    if (rep) {
      // 界面空闲时再弹，避免打断用户正在看的卡片
      if (!ui.isModalOpen()) ui.openChangeReport(rep);
      else sim.pending = rep;
    }
    /* 弹窗打开（读科普 / 看对比图）时主画布降到 ~30fps，避免和科普动画抢性能 */
    drawAcc += dtVis;
    const interval = ui.isModalOpen() ? 1 / 30 : 0;
    if (drawAcc >= interval) {
      R.update(drawAcc);
      R.draw();
      ui.update();
      drawAcc = 0;
    }
    requestAnimationFrame(frame);
  }
  R.resize();
  requestAnimationFrame(frame);

  ui.update(true);
  setPlay(true);

  /* ---------------- 首次引导 ---------------- */
  if (!sessionStorage.getItem('gut_welcomed')) {
    sessionStorage.setItem('gut_welcomed', '1');
    setTimeout(() => ui.openWelcome(), 400);
  }

  window.__gut = { sim, R, ui };
})();
