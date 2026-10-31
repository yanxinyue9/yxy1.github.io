/* 肠道菌群生态模拟器 · Canvas 2D 渲染层
 * 场景：结肠横截面 — 肠腔 / 黏液层 / 上皮与绒毛 / 固有层组织 + 菌群粒子与特效
 */
(function (root) {
  'use strict';
  const GUT = (root.GUT = root.GUT || {});
  const S = GUT.SPECIES;
  const IX = GUT.SPECIES_INDEX;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);

  GUT.createRenderer = function (canvas, sim) {
    const ctx = canvas.getContext('2d');
    const R = {
      w: 0, h: 0, dpr: 1, cx: 0, cy: 0, baseR: 0,
      t: 0, wave: 0,
      parts: [],        // 菌群粒子
      motes: [],        // SCFA / 毒素 微粒
      puffs: [],        // 死亡/吞噬 爆点
      cells: [],        // 免疫细胞
      rings: [],        // 抗生素扩散环
      pointer: { x: -999, y: -999, inside: false },
      highlight: null,
      hover: null,
      tool: 'probe',
      MAXP: 760,
      onPick: null,
    };

    /* ---------------- 尺寸 ---------------- */
    R.resize = function () {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      R.dpr = dpr;
      R.w = rect.width;
      R.h = rect.height;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R.cx = rect.width / 2;
      R.cy = rect.height / 2;
      R.baseR = Math.min(rect.width, rect.height) * 0.40;
    };

    /* ---------------- 几何 ---------------- */
    function wallR(theta) {
      const b =
        1 +
        0.050 * Math.sin(3 * theta + R.wave) +
        0.032 * Math.sin(5 * theta - R.wave * 0.7) +
        0.020 * Math.sin(9 * theta + R.wave * 1.3) +
        0.016 * Math.sin(24 * theta + R.wave * 0.4) + // 绒毛
        0.022 * Math.sin(R.wave * 2.1); // 蠕动收缩
      return R.baseR * b;
    }
    function mucusT() {
      return 7 + clamp(sim.mucus, 0, 1) * 40;
    }
    function lumenR(theta) {
      return wallR(theta) - mucusT() - 5;
    }
    function pos(part) {
      const r = lumenR(part.theta) * part.rf;
      return { x: R.cx + Math.cos(part.theta) * r, y: R.cy + Math.sin(part.theta) * r, r };
    }

    /* ---------------- 粒子池 ---------------- */
    function makePart(si) {
      const sp = S[si];
      // 35% 为"浮游"个体，在整个肠腔中游动；其余偏好各自生态位（黏液层 / 肠腔中央）
      const free = Math.random() < 0.35;
      return {
        si,
        theta: Math.random() * TAU,
        baseRf: free ? rnd(0.08, 0.95) : clamp(sp.radialPref * rnd(0.62, 1.05), 0.05, 0.97),
        rf: free ? rnd(0.08, 0.95) : clamp(sp.radialPref * rnd(0.62, 1.05), 0.05, 0.97),
        av: rnd(-0.22, 0.22) + 0.10,
        wob: Math.random() * TAU,
        wobAmp: rnd(0.05, 0.14),
        sc: rnd(0.82, 1.2),
        ph: 0,
      };
    }

    function syncParticles(dt) {
      const total = Math.max(sim.total, 1e-6);
      const want = [];
      for (let i = 0; i < S.length; i++) {
        const sh = sim.n[i] / total;
        let k = Math.round(sh * R.MAXP);
        if (sim.n[i] > 0.02 && k < 1) k = 1;
        k = Math.min(k, 320);
        want[i] = k;
      }
      const have = new Array(S.length).fill(0);
      for (const p of R.parts) have[p.si]++;
      for (let i = 0; i < S.length; i++) {
        const d = want[i] - have[i];
        if (d > 0) {
          const add = Math.min(d, 6);
          for (let k = 0; k < add; k++) R.parts.push(makePart(i));
        } else if (d < 0) {
          let rm = Math.min(-d, 6);
          for (let k = R.parts.length - 1; k >= 0 && rm > 0; k--) {
            if (R.parts[k].si === i) {
              const q = pos(R.parts[k]);
              R.puffs.push({ x: q.x, y: q.y, life: 1, color: S[i].color, r: 5 });
              R.parts.splice(k, 1);
              rm--;
            }
          }
        }
      }
    }

    /* ---------------- 更新 ---------------- */
    R.update = function (dt) {
      R.t += dt;
      R.wave += dt * (0.35 + (sim.env.motility / 100) * 0.9);
      const flow = 0.25 + (sim.env.motility / 100) * 0.55;

      syncParticles(dt);

      const px = R.pointer.x, py = R.pointer.y;
      for (let i = R.parts.length - 1; i >= 0; i--) {
        const p = R.parts[i];
        const sp = S[p.si];
        p.theta += p.av * flow * dt;
        p.wob += dt * 1.6;
        const tgt = clamp(p.baseRf + Math.sin(R.t * 0.7 + p.wob) * p.wobAmp, 0.05, 0.97);
        p.rf += (tgt - p.rf) * clamp(dt * 1.4, 0, 1);
        p.rf = clamp(p.rf, 0.03, 0.99);

        if (R.pointer.inside) {
          const q = pos(p);
          const dx = q.x - px, dy = q.y - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < 3600) {
            const f = (1 - Math.sqrt(d2) / 60) * 2.2 * dt;
            p.theta += Math.sign(dx * -Math.sin(p.theta) + dy * Math.cos(p.theta)) * f * 0.5;
            p.rf -= f * 0.35;
          }
        }

        // 抗生素：随机击杀
        if (sim.abxLevel > 0.03 && Math.random() < sim.abxLevel * 0.35 * dt) {
          const q = pos(p);
          R.puffs.push({ x: q.x, y: q.y, life: 1, color: '#9FD8FF', r: 7 });
          R.parts.splice(i, 1);
        }
      }

      // SCFA 微粒
      if (Math.random() < clamp(sim.scfa, 0, 1) * 1.6 * dt * 60 * 0.05) {
        if (R.parts.length) {
          const p = R.parts[(Math.random() * R.parts.length) | 0];
          const q = pos(p);
          R.motes.push({ x: q.x, y: q.y, life: 1, kind: 'scfa', vx: 0, vy: 0 });
        }
      }
      // 毒素微粒（艰难拟梭菌 / 肠杆菌）
      const pathoN = sim.n[IX.cdiff] + sim.n[IX.enterobacteriaceae] * 0.4;
      const pathoShare = pathoN / Math.max(sim.total, 1e-6);
      if (pathoShare > 0.02 && Math.random() < pathoShare * 8 * dt * 60 * 0.02) {
        if (R.parts.length) {
          const p = R.parts[(Math.random() * R.parts.length) | 0];
          const q = pos(p);
          R.motes.push({ x: q.x, y: q.y, life: 1, kind: 'toxin', vx: 0, vy: 0 });
        }
      }

      for (let i = R.motes.length - 1; i >= 0; i--) {
        const m = R.motes[i];
        const dx = m.x - R.cx, dy = m.y - R.cy;
        const d = Math.hypot(dx, dy) || 1;
        const sp2 = 26;
        m.x += (dx / d) * sp2 * dt + rnd(-8, 8) * dt;
        m.y += (dy / d) * sp2 * dt + rnd(-8, 8) * dt;
        m.life -= dt * 0.75;
        if (m.life <= 0 || d > R.baseR * 1.15) R.motes.splice(i, 1);
      }
      for (let i = R.puffs.length - 1; i >= 0; i--) {
        R.puffs[i].life -= dt * 2.2;
        if (R.puffs[i].life <= 0) R.puffs.splice(i, 1);
      }
      for (let i = R.rings.length - 1; i >= 0; i--) {
        R.rings[i].r += 120 * dt;
        R.rings[i].life -= dt * 0.8;
        if (R.rings[i].life <= 0) R.rings.splice(i, 1);
      }

      // 免疫细胞
      const wantCells = Math.round(clamp((sim.inflammation - 0.22) / 0.7, 0, 1) * 8);
      while (R.cells.length < wantCells) {
        R.cells.push({ theta: Math.random() * TAU, rf: rnd(0.72, 0.95), av: rnd(-0.2, 0.2), ph: Math.random() * TAU, sz: rnd(9, 15) });
      }
      while (R.cells.length > wantCells) R.cells.pop();
      for (const c of R.cells) {
        c.theta += (c.av + 0.08) * dt;
        c.ph += dt * 2.2;
        c.rf += (0.86 - c.rf) * dt;
      }

      if (sim.abxLevel > 0.03 && Math.random() < dt * 1.6) {
        R.rings.push({ r: 10, life: 1 });
      }
    };

    /* ---------------- 绘制 ---------------- */
    function ringPath(radiusFn, steps) {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const th = (i / steps) * TAU;
        const r = radiusFn(th);
        const x = R.cx + Math.cos(th) * r;
        const y = R.cy + Math.sin(th) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }

    function capsule(x, y, len, w, ang) {
      const r = w / 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-len / 2, -r);
      ctx.lineTo(len / 2, -r);
      ctx.arc(len / 2, 0, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(-len / 2, r);
      ctx.arc(-len / 2, 0, r, Math.PI / 2, -Math.PI / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawShape(sp, x, y, ang, sc) {
      const s = sp.size * sc;
      ctx.fillStyle = sp.color;
      ctx.strokeStyle = sp.color;
      switch (sp.shape) {
        case 'rod':
          capsule(x, y, 9.5 * s, 3.6 * s, ang);
          break;
        case 'coccus':
          ctx.beginPath();
          ctx.arc(x, y, 3.0 * s, 0, TAU);
          ctx.fill();
          break;
        case 'bifid': {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(ang);
          ctx.lineWidth = 2.6 * s;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-4 * s, -3.2 * s);
          ctx.lineTo(0, 0);
          ctx.lineTo(4.4 * s, -3.0 * s);
          ctx.moveTo(0, 0);
          ctx.lineTo(0.6 * s, 4.4 * s);
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'spiral': {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(ang);
          ctx.lineWidth = 2.0 * s;
          ctx.lineCap = 'round';
          ctx.beginPath();
          for (let i = 0; i <= 12; i++) {
            const u = i / 12;
            const px = (u - 0.5) * 11 * s;
            const py = Math.sin(u * Math.PI * 3) * 2.6 * s;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'chain': {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(ang);
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.arc(i * 3.6 * s, 0, 2.5 * s, 0, TAU);
            ctx.fill();
          }
          ctx.restore();
          break;
        }
        case 'spore': {
          ctx.beginPath();
          ctx.arc(x, y, 4.0 * s, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath();
          ctx.arc(x - 1.1 * s, y - 1.1 * s, 1.5 * s, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, 6.0 * s, 0, TAU);
          ctx.stroke();
          break;
        }
        default:
          ctx.beginPath();
          ctx.arc(x, y, 3 * s, 0, TAU);
          ctx.fill();
      }
    }

    R.draw = function () {
      const w = R.w, h = R.h;
      ctx.clearRect(0, 0, w, h);

      // 背景
      const bg = ctx.createRadialGradient(R.cx, R.cy, R.baseR * 0.2, R.cx, R.cy, Math.max(w, h) * 0.75);
      bg.addColorStop(0, '#0C171C');
      bg.addColorStop(1, '#050A0C');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const inflam = clamp(sim.inflammation, 0, 1);
      const mT = mucusT();

      // 组织（固有层）
      const tissue = ctx.createRadialGradient(R.cx, R.cy, R.baseR * 0.9, R.cx, R.cy, R.baseR * 1.5);
      tissue.addColorStop(0, '#7E4055');
      tissue.addColorStop(0.35, '#5A2C3C');
      tissue.addColorStop(1, '#2A1620');
      ctx.save();
      ringPath((th) => wallR(th) + 46, 160);
      ringPath((th) => wallR(th) - 2, 160);
      ctx.fillStyle = tissue;
      ctx.fill('evenodd');
      ctx.restore();

      // 隐窝 / 血管纹理
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = '#2A1620';
      ctx.lineWidth = 2;
      for (let i = 0; i < 46; i++) {
        const th = (i / 46) * TAU;
        const r0 = wallR(th) + 4;
        const r1 = wallR(th) + 30;
        ctx.beginPath();
        ctx.moveTo(R.cx + Math.cos(th) * r0, R.cy + Math.sin(th) * r0);
        ctx.lineTo(R.cx + Math.cos(th) * r1, R.cy + Math.sin(th) * r1);
        ctx.stroke();
      }
      ctx.restore();

      // 肠腔液体（pH 着色）
      const pH = clamp(sim.pH, 5.0, 8.0);
      const hue = 46 + (pH - 5.0) * 26; // 偏酸=琥珀，偏碱=青蓝
      const lum = ctx.createRadialGradient(R.cx, R.cy, 0, R.cx, R.cy, R.baseR);
      lum.addColorStop(0, `hsla(${hue},42%,11%,1)`);
      lum.addColorStop(0.75, `hsla(${hue},38%,9%,1)`);
      lum.addColorStop(1, `hsla(${hue},34%,7%,1)`);
      ctx.save();
      ringPath((th) => wallR(th) + 1, 160);
      ctx.fillStyle = lum;
      ctx.fill();
      ctx.restore();

      // 黏液层
      ctx.save();
      ringPath((th) => wallR(th), 160);
      ringPath((th) => wallR(th) - mT, 160);
      const mg = ctx.createRadialGradient(R.cx, R.cy, R.baseR - mT - 10, R.cx, R.cy, R.baseR + 6);
      mg.addColorStop(0, 'rgba(127,231,212,0.06)');
      mg.addColorStop(1, 'rgba(127,231,212,0.34)');
      ctx.fillStyle = mg;
      ctx.fill('evenodd');
      // 黏液内缘高光
      ctx.beginPath();
      for (let i = 0; i <= 160; i++) {
        const th = (i / 160) * TAU;
        const r = wallR(th) - mT;
        const x = R.cx + Math.cos(th) * r, y = R.cy + Math.sin(th) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(160,255,238,0.28)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();

      // 上皮细胞线
      ctx.save();
      ringPath((th) => wallR(th), 200);
      ctx.strokeStyle = inflam > 0.45 ? 'rgba(255,150,130,0.75)' : 'rgba(226,150,165,0.6)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();

      // 抗生素扩散环
      if (sim.abxLevel > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const rg of R.rings) {
          ctx.beginPath();
          ctx.arc(R.cx, R.cy, rg.r, 0, TAU);
          ctx.strokeStyle = `rgba(140,205,255,${0.16 * rg.life * sim.abxLevel})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.restore();
      }

      // SCFA / 毒素 微粒
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const m of R.motes) {
        const a = m.life * 0.7;
        const c = m.kind === 'scfa' ? `rgba(120,255,205,${a})` : `rgba(217,70,239,${a * 0.9})`;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.kind === 'scfa' ? 2.1 : 2.8, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // 菌群粒子 —— 光晕层
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of R.parts) {
        const sp = S[p.si];
        if (R.highlight != null && R.highlight !== p.si) continue;
        const q = pos(p);
        const glow = sp.role === 'pathogen' ? 0.20 : sp.role === 'beneficial' ? 0.13 : 0.09;
        ctx.fillStyle = hexA(sp.color, glow);
        ctx.beginPath();
        ctx.arc(q.x, q.y, 7 * p.sc, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // 菌群粒子 —— 本体
      const dim = R.highlight != null;
      for (const p of R.parts) {
        const sp = S[p.si];
        const q = pos(p);
        const isHi = R.highlight === p.si;
        ctx.globalAlpha = dim ? (isHi ? 1 : 0.14) : 1;
        const ang = Math.atan2(q.y - R.cy, q.x - R.cx) + Math.PI / 2 + Math.sin(p.wob) * 0.5;
        drawShape(sp, q.x, q.y, ang, p.sc);
      }
      ctx.globalAlpha = 1;

      // 选中物种的连接提示环
      if (R.hover != null) {
        for (const p of R.parts) {
          if (p.si !== R.hover) continue;
          const q = pos(p);
          ctx.strokeStyle = hexA(S[p.si].color, 0.55);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(q.x, q.y, 10, 0, TAU);
          ctx.stroke();
        }
      }

      // 爆点
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const f of R.puffs) {
        ctx.strokeStyle = hexA(f.color, f.life * 0.5);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r + (1 - f.life) * 12, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();

      // 免疫细胞
      if (R.cells.length) {
        const a = clamp((sim.inflammation - 0.22) / 0.7, 0, 1);
        for (const c of R.cells) {
          const r = wallR(c.theta) - mT * 0.4;
          const x = R.cx + Math.cos(c.theta) * r * c.rf;
          const y = R.cy + Math.sin(c.theta) * r * c.rf;
          ctx.save();
          ctx.globalAlpha = a * 0.9;
          ctx.fillStyle = 'rgba(232,244,242,0.30)';
          ctx.beginPath();
          for (let i = 0; i <= 20; i++) {
            const th = (i / 20) * TAU;
            const rr = c.sz * (1 + 0.18 * Math.sin(th * 4 + c.ph));
            const px = x + Math.cos(th) * rr, py = y + Math.sin(th) * rr;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(210,235,245,0.55)';
          ctx.beginPath();
          ctx.arc(x + Math.cos(c.ph) * 2, y + Math.sin(c.ph) * 2, c.sz * 0.34, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }

      // 炎症红晕
      if (inflam > 0.12) {
        const vg = ctx.createRadialGradient(R.cx, R.cy, R.baseR * 0.55, R.cx, R.cy, R.baseR * 1.45);
        vg.addColorStop(0, 'rgba(255,70,60,0)');
        vg.addColorStop(1, `rgba(255,70,60,${0.30 * inflam})`);
        ctx.save();
        ctx.beginPath();
        ctx.arc(R.cx, R.cy, R.baseR * 1.45, 0, TAU);
        ctx.fillStyle = vg;
        ctx.fill();
        ctx.restore();
      }

      // 抗生素整体色调
      if (sim.abxLevel > 0.02) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(R.cx, R.cy, R.baseR * 1.2, 0, TAU);
        ctx.fillStyle = `rgba(110,180,240,${0.10 * sim.abxLevel})`;
        ctx.fill();
        ctx.restore();
      }
    };

    function hexA(hex, a) {
      const h = hex.replace('#', '');
      const n = parseInt(h, 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }

    /* ---------------- 命中测试 ---------------- */
    R.pick = function (x, y) {
      let best = null, bd = 20 * 20;
      for (const p of R.parts) {
        const q = pos(p);
        const dx = q.x - x, dy = q.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = p.si; }
      }
      return best;
    };

    R.burst = function (x, y, kind) {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * TAU;
        const d = rnd(4, 26);
        R.puffs.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, life: 1, color: kind === 'fiber' ? '#C3E34A' : '#A78BFA', r: 4 });
      }
    };

    R.resize();
    return R;
  };
})(typeof window !== 'undefined' ? window : globalThis);
