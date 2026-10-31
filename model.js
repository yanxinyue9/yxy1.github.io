/* 肠道菌群生态模拟器 · 生态动力学模型
 * 结构：底物池(Monod) → 生态位容量 cap → 逻辑斯谛增长 + 抗生素/免疫/蠕动清除 → 炎症与屏障反馈
 * 说明：教学演示用的简化系统，展示生态学趋势，不用于任何医疗判断。
 */
(function (root) {
  'use strict';
  const GUT = (root.GUT = root.GUT || {});
  const S = GUT.SPECIES;
  const IX = GUT.SPECIES_INDEX;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  GUT.createSim = function () {
    const sim = {
      day: 0,
      running: true,
      speed: 1,
      env: {},
      mods: [],
      n: S.map((s) => s.seed * 100),
      sub: { fiber: 0.55, protein: 0.35, mucin: 0.60, lactate: 0.18 },
      pH: 6.5,
      inflammation: 0.12,
      mucus: 0.72,
      barrier: 0.80,
      butyrate: 0.60,
      scfa: 0.60,
      h2s: 0.20,
      gas: 0.35,
      diversity: 0.85,
      total: 100,
      resistance: 1.0,
      abxLevel: 0,
      spores: 0.5,
      log: [],
      events: [],
      meals: [],
      pending: null,
    };
    GUT.ENV.forEach((e) => (sim.env[e.key] = e.value));

    /* -------- 个人状态档案（疾病 / 心理 / 作息 / 周期 / 用药） -------- */
    sim.profile = [];
    sim.profEnv = {};
    sim.profBio = { inflammation: 0, butyrate: 0, barrier: 0, mucus: 0, gas: 0, h2s: 0 };
    sim.profSp = new Array(S.length).fill(0);
    const BIO_KEYS = ['inflammation', 'butyrate', 'barrier', 'mucus', 'gas', 'h2s'];
    /* 多项状态叠加时用软饱和，避免"勾选几条就生态崩溃" */
    const BIO_CAP = { inflammation: 0.04, butyrate: 0.06, barrier: 0.06, mucus: 0.045, gas: 0.07, h2s: 0.045 };
    const ENV_CAP = 12;
    const SP_CAP = 0.12;
    const SP_W = 0.55;
    const soft = (v, cap) => (Math.abs(v) < 1e-9 ? 0 : cap * Math.tanh(v / cap));

    /* 把档案里所有条目的影响叠加成三组系数：环境偏移 / 内部变量偏移 / 物种竞争力 */
    function recomputeProfile() {
      const envD = {};
      GUT.ENV.forEach((e) => (envD[e.key] = 0));
      const bio = {};
      BIO_KEYS.forEach((k) => (bio[k] = 0));
      const sp = new Array(S.length).fill(0);
      sim.profile.forEach((id) => {
        const p = GUT.PROFILE_INDEX[id];
        if (!p) return;
        if (p.env) for (const k in p.env) if (envD[k] != null) envD[k] += p.env[k];
        if (p.bio) for (const k in p.bio) if (bio[k] != null) bio[k] += p.bio[k];
        if (p.species) for (const k in p.species) {
          const i = IX[k];
          if (i != null) sp[i] += p.species[k];
        }
      });
      BIO_KEYS.forEach((k) => (bio[k] = soft(bio[k], BIO_CAP[k])));
      for (const k in envD) envD[k] = soft(envD[k], ENV_CAP);
      for (let i = 0; i < sp.length; i++) sp[i] = soft(sp[i], SP_CAP);
      sim.profEnv = envD;
      sim.profBio = bio;
      sim.profSp = sp;
    }
    recomputeProfile();
    sim.recomputeProfile = recomputeProfile;

    /* -------- 我的档案 · 日记本 -------- */
    sim.diary = [];
    sim.addDiary = function (entry) {
      const e = entry || {};
      e.id = e.id || 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      e.day = sim.day;
      sim.diary.push(e);
      const m = GUT.DIARY_MEALS.filter((x) => x.id === e.meal)[0];
      sim.pushLog('日记：' + (m ? m.label : '记录') + (e.foods ? ' · ' + e.foods : ''), 'plain');
      return e.id;
    };
    sim.delDiary = function (id) {
      sim.diary = sim.diary.filter((d) => d.id !== id);
    };

    /* 设置档案：记录日志 + 在时间轴上留标记 + 预约一份变化报告 */
    sim.setProfile = function (ids, quiet) {
      const before = sim.snapshot();
      sim.profile = (ids || []).slice();
      recomputeProfile();
      const names = sim.profile.map((id) => (GUT.PROFILE_INDEX[id] ? GUT.PROFILE_INDEX[id].label : id));
      sim.pushLog(names.length ? '状态档案更新：' + names.join('、') : '状态档案已清空', 'plain');
      if (quiet) return;
      const label = '档案 · ' + (names.join('、') || '清空');
      const lastEv = sim.events[sim.events.length - 1];
      if (lastEv && lastEv.id === 'profile' && sim.day - lastEv.day < 0.25) {
        // 连续勾选时合并成一条时间轴标记，避免刷屏
        lastEv.day = sim.day;
        lastEv.label = label;
      } else {
        sim.events.push({ day: sim.day, id: 'profile', tone: 'plain', label, snap: before });
      }
      sim.pending = { id: 'profile', label: '状态档案更新', tone: 'plain', day: before.day, before, delay: 2.5 };
    };

    /* -------- 参数读取（叠加档案偏移 + 事件带来的临时修正） -------- */
    function eff(key) {
      let v = sim.env[key] + (sim.profEnv[key] || 0);
      for (const m of sim.mods) {
        if (m.key !== key) continue;
        v = m.mode === 'set' ? Math.max(v, m.value) : v + m.value;
      }
      return clamp(v, 0, 100);
    }
    sim.eff = eff;

    function shannon() {
      let tot = 0;
      for (const v of sim.n) tot += v;
      if (tot <= 1e-9) return 0;
      let h = 0;
      for (const v of sim.n) {
        const p = v / tot;
        if (p > 1e-9) h -= p * Math.log(p);
      }
      return h / Math.log(S.length);
    }

    function shares() {
      const tot = Math.max(sim.total, 1e-9);
      return sim.n.map((v) => v / tot);
    }

    function enterotype() {
      const tot = Math.max(sim.total, 1e-6);
      const b = sim.n[IX.bacteroides] / tot;
      const p = sim.n[IX.prevotella] / tot;
      const f = (sim.n[IX.faecalibacterium] + sim.n[IX.roseburia]) / tot;
      if (b >= p && b >= f) return { key: 'B', label: '拟杆菌型 · Bacteroides' };
      if (p >= b && p >= f) return { key: 'P', label: '普雷沃菌型 · Prevotella' };
      return { key: 'R', label: '丁酸菌型 · Faecalibacterium / Roseburia' };
    }

    /* -------- 单步推进（dt 单位：天） -------- */
    sim.step = function (dt) {
      dt = clamp(dt, 0, 0.06);
      if (dt <= 0) return;

      const fiber = eff('fiber') / 100;
      const protein = eff('protein') / 100;
      const fermented = eff('fermented') / 100;
      const motility = eff('motility') / 100;
      const immuneTone = eff('immune') / 100;
      const stress = eff('stress') / 100;
      const abxLvl = eff('abx') / 100;

      const transit = 0.6 + motility * 1.7;
      const K = 0.22;

      let tot = 0;
      for (const v of sim.n) tot += v;
      const totSafe = Math.max(tot, 1e-6);

      // 定植抵抗：有益菌占比 + 丁酸 + 无抗生素
      const beneficial =
        (sim.n[IX.faecalibacterium] + sim.n[IX.roseburia] +
          sim.n[IX.bifidobacterium] + sim.n[IX.lactobacillus] + sim.n[IX.akkermansia]) / totSafe;
      const resistance = clamp(beneficial * 0.95 + sim.butyrate * 0.5 + (1 - abxLvl) * 0.3, 0, 1.5);

      // 艰难拟梭菌芽孢库：定植抵抗下降时萌发
      if (sim.spores > 0.001 && resistance < 0.78) {
        const germ = sim.spores * (0.78 - resistance) * 0.55 * dt;
        sim.n[IX.cdiff] += germ;
        sim.spores = Math.max(0, sim.spores - germ);
        sim.germinating = true;
      } else {
        sim.germinating = false;
      }
      sim.spores = Math.max(0, sim.spores - sim.spores * 0.12 * dt);

      let consF = 0, consP = 0, consM = 0, consL = 0;
      let butProd = 0, scfaProd = 0, lacProd = 0, h2sProd = 0, mucinStim = 0, killed = 0;

      for (let i = 0; i < S.length; i++) {
        const sp = S[i];
        const n = sim.n[i];
        const w = sp.substrates;
        const wsum = w.fiber + w.protein + w.mucin + w.lactate || 1;

        const mF = sim.sub.fiber / (K + sim.sub.fiber);
        const mP = sim.sub.protein / (K + sim.sub.protein);
        const mM = sim.sub.mucin / (K + sim.sub.mucin);
        const mL = sim.sub.lactate / (K + sim.sub.lactate);
        const rs = clamp((w.fiber * mF + w.protein * mP + w.mucin * mM + w.lactate * mL) / wsum, 0, 1);

        // 环境适合度
        const phFac = Math.exp(-Math.pow(sim.pH - sp.phOpt, 2) / (2 * sp.phTol * sp.phTol));
        const ox = clamp(sim.inflammation * sp.oxygen, 0, 1);
        let fit = rs * phFac * (1 - 0.7 * ox);
        if (sp.inflamBoost) fit *= 1 + sp.inflamBoost * sim.inflammation;
        if (sp.butInhibit) fit *= 1 - sp.butInhibit * clamp(sim.butyrate, 0, 1);
        if (sp.resistSensitive) fit /= 1 + 2 * resistance;
        // 状态档案：对单个物种竞争力的增益 / 抑制
        const pSp = sim.profSp[i];
        if (pSp) fit *= Math.max(0.1, 1 + pSp * SP_W);

        // 生态位容量
        let cap = sp.seed * 100 * (0.6 + 0.8 * rs);
        if (sp.capCompete) cap /= 1 + sp.capCompete * resistance;
        if (sp.capInflam) cap *= 1 + sp.capInflam * sim.inflammation;
        if (sp.bloom) {
          const gap = clamp(1 - resistance, 0, 1);
          cap *= (1 + sp.bloom * gap * gap) / (1 + 12 * resistance);
        }
        cap = clamp(cap, 0.01, 60);

        const imm = (immuneTone * 0.25 + sim.inflammation * 0.85) * sp.immune;
        const abx = abxLvl * sp.abx * 1.4;
        const wash = motility * sp.washout * 0.35;
        const g = sp.growth * fit;
        const d = sp.death + imm + abx + wash;

        let dn = n * g * (1 - n / cap) - n * d;
        if (sp.fermentBoost) dn += sp.fermentBoost * fermented * 0.5 * dt;
        dn += sp.immigration * (0.35 + fermented) * dt;

        const nv = clamp(n + dn, 0, 60);
        if (abx > 0.05 && nv < n) killed += (n - nv) * (abx / Math.max(d, 1e-6));
        sim.n[i] = nv;

        const act = nv * (0.25 + 0.75 * rs);
        butProd += act * sp.butyrate;
        scfaProd += act * sp.scfa;
        lacProd += act * sp.lactateProd;
        h2sProd += act * sp.h2s;
        consF += act * w.fiber * 0.05;
        consP += act * w.protein * 0.05;
        consM += act * w.mucin * 0.035;
        consL += act * w.lactate * 0.05;
        if (sp.mucinStim) mucinStim += (nv / totSafe) * 1.0;
      }

      // ---------- 底物池 ----------
      sim.sub.fiber = clamp(sim.sub.fiber + (fiber * 1.85 + fermented * 0.30 - sim.sub.fiber * 0.26 * transit - consF) * dt, 0, 3);
      sim.sub.protein = clamp(sim.sub.protein + (protein * 1.15 - sim.sub.protein * 0.34 * transit - consP) * dt, 0, 3);
      sim.sub.mucin = clamp(sim.sub.mucin + (0.60 + mucinStim * 0.45 - sim.sub.mucin * 0.26 - consM) * dt, 0, 1.6);
      sim.sub.lactate = clamp(sim.sub.lactate + (lacProd * 0.55 - consL * 0.55 - sim.sub.lactate * 0.45 * transit) * dt, 0, 2);

      // ---------- 代谢产物（人均归一） ----------
      let tot2 = 0;
      for (const v of sim.n) tot2 += v;
      const pop = Math.max(tot2, 1e-6);
      const scfaT = clamp(scfaProd / pop / 0.60, 0, 1.25);
      const butT = clamp((butProd / pop / 0.135) * (1 + sim.profBio.butyrate), 0, 1.25);
      const h2sT = clamp((h2sProd / pop / 0.016) * (1 + sim.profBio.h2s), 0, 1.4);
      sim.scfa += (scfaT - sim.scfa) * clamp(dt * 1.6, 0, 1);
      sim.butyrate += (butT - sim.butyrate) * clamp(dt * 1.6, 0, 1);
      sim.h2s += (h2sT - sim.h2s) * clamp(dt * 1.6, 0, 1);

      // ---------- pH ----------
      const targetPH = clamp(
        6.85 - 1.0 * sim.scfa + 0.5 * (sim.sub.protein - 0.35) + 0.15 * sim.sub.lactate + 0.10 * sim.h2s,
        5.1, 7.9
      );
      sim.pH += (targetPH - sim.pH) * clamp(dt * 1.2, 0, 1);

      // ---------- 黏液层 ----------
      const sh = shares();
      const foraging = (sh[IX.bacteroides] * 0.6 + sh[IX.akkermansia]) * (1 - clamp(sim.sub.fiber, 0, 1));
      const mucusT = clamp(
        0.28 + clamp(sim.sub.fiber, 0, 1.2) * 0.30 + sim.sub.mucin * 0.26 + mucinStim * 0.22 +
        sim.butyrate * 0.22 - foraging * 0.90 - sim.inflammation * 0.40 + sim.profBio.mucus,
        0.05, 1
      );
      sim.mucus += (mucusT - sim.mucus) * clamp(dt * 1.1, 0, 1);

      // ---------- 屏障 ----------
      const barrierT = clamp(sim.mucus * 0.40 + sim.butyrate * 0.34 + (1 - sim.inflammation) * 0.26 + sim.profBio.barrier, 0, 1);
      sim.barrier += (barrierT - sim.barrier) * clamp(dt * 1.2, 0, 1);

      // ---------- 炎症 ----------
      const pathoShare = sh[IX.enterobacteriaceae] * 1.2 + sh[IX.cdiff] * 1.5 + sh[IX.desulfovibrio] * 0.5;
      const drive = clamp(
        pathoShare * 2.0 + sim.h2s * 0.30 + (1 - sim.butyrate) * 0.35 +
        (1 - sim.barrier) * 0.40 + stress * 0.42 + immuneTone * 0.35 + abxLvl * 0.22 +
        sim.profBio.inflammation - 0.30,
        0, 1.5
      );
      sim.inflammation += (drive * 0.80 - sim.inflammation * 0.95) * clamp(dt * 1.5, 0, 1);
      sim.inflammation = clamp(sim.inflammation, 0, 1);

      // ---------- 产气 ----------
      const gasT = clamp(scfaT * 0.40 + sim.h2s * 0.30 + (1 - motility) * 0.24 + sim.sub.lactate * 0.12 + sim.profBio.gas, 0, 1);
      sim.gas += (gasT - sim.gas) * clamp(dt * 1.4, 0, 1);

      // ---------- 汇总 ----------
      sim.day += dt;
      let tot3 = 0;
      for (const v of sim.n) tot3 += v;
      sim.total = tot3;
      sim.diversity = shannon();
      sim.enterotype = enterotype();
      sim.resistance = resistance;
      sim.abxLevel = abxLvl;
      sim.killedThisStep = killed;

      for (let i = sim.mods.length - 1; i >= 0; i--) {
        sim.mods[i].days -= dt;
        if (sim.mods[i].days <= 0) {
          const m = sim.mods.splice(i, 1)[0];
          if (m.onEnd) sim.pushLog(m.onEnd, 'good');
        }
      }
    };

    /* -------- 日志 -------- */
    sim.pushLog = function (text, tone) {
      sim.log.unshift({ day: sim.day, text, tone: tone || 'plain' });
      if (sim.log.length > 60) sim.log.pop();
      sim.dirtyLog = true;
    };

    /* -------- 状态快照（用于"施加前后的变化对比"） -------- */
    sim.snapshot = function () {
      const total = Math.max(sim.total, 1e-9);
      return {
        day: sim.day,
        total: sim.total,
        diversity: sim.diversity,
        butyrate: sim.butyrate,
        scfa: sim.scfa,
        mucus: sim.mucus,
        barrier: sim.barrier,
        inflammation: sim.inflammation,
        resistance: sim.resistance,
        h2s: sim.h2s,
        gas: sim.gas,
        ph: sim.pH,
        shares: sim.n.map((v) => v / total),
      };
    };

    /* -------- 事件 -------- */
    sim.fire = function (id) {
      const cfg = GUT.EVENTS.find((e) => e.id === id);
      if (!cfg) return;
      const before = sim.snapshot();
      sim.events.push({ day: sim.day, id, label: cfg.label, tone: cfg.tone, snap: before });

      switch (id) {
        case 'abx':
          sim.mods.push({ key: 'abx', mode: 'set', value: 82, days: 7, onEnd: '抗生素疗程结束，进入菌群重建期' });
          sim.pushLog('开始广谱抗生素疗程（7 天）', 'danger');
          break;
        case 'highfat':
          sim.mods.push({ key: 'protein', mode: 'add', value: 48, days: 14, onEnd: '高脂饮食期结束' });
          sim.mods.push({ key: 'fiber', mode: 'add', value: -28, days: 14 });
          sim.pushLog('高脂高蛋白饮食冲击（14 天）', 'warn');
          break;
        case 'prebiotic':
          sim.mods.push({ key: 'fiber', mode: 'add', value: 38, days: 21, onEnd: '益生元干预结束' });
          sim.pushLog('启动益生元 / 高纤维干预（21 天）', 'good');
          break;
        case 'probiotic':
          sim.n[IX.bifidobacterium] += 4.5;
          sim.n[IX.lactobacillus] += 3.2;
          sim.n[IX.akkermansia] += 1.6;
          sim.mods.push({ key: 'fermented', mode: 'add', value: 30, days: 14, onEnd: '益生菌补充期结束' });
          sim.pushLog('补充双歧杆菌 / 乳酸杆菌 / 阿克曼菌', 'good');
          break;
        case 'fmt':
          for (let i = 0; i < S.length; i++) sim.n[i] = sim.n[i] * 0.12 + S[i].seed * 100 * 0.85;
          sim.n[IX.cdiff] = Math.min(sim.n[IX.cdiff], 0.15);
          sim.n[IX.enterobacteriaceae] *= 0.35;
          sim.inflammation *= 0.55;
          sim.pushLog('粪菌移植：菌群结构整体重建', 'good');
          break;
        case 'cdiff':
          sim.spores += 2.2;
          sim.n[IX.cdiff] += 0.6;
          sim.inflammation = clamp(sim.inflammation + 0.18, 0, 1);
          sim.pushLog('暴露于艰难拟梭菌芽孢', 'danger');
          break;
        case 'stress':
          sim.mods.push({ key: 'stress', mode: 'add', value: 48, days: 10, onEnd: '压力期结束' });
          sim.mods.push({ key: 'motility', mode: 'add', value: 22, days: 10 });
          sim.pushLog('进入急性压力期（10 天）', 'warn');
          break;
        case 'reset':
          sim.reset();
          sim.pushLog('生态系统已重置', 'plain');
          break;
      }

      // 记录"待出报告"：让生态演化一段时间后再对比前后差异
      const dur = cfg.dur || 0;
      sim.pending = id === 'reset' ? null : {
        id,
        label: cfg.label,
        tone: cfg.tone,
        day: before.day,
        before,
        delay: dur > 0 ? clamp(dur * 0.45, 2.5, 7) : 3,
      };
    };

    /* -------- 记录一餐：把食物拆成四个营养维度并注入生态 -------- */
    sim.meal = function (m) {
      const before = sim.snapshot();
      const tone = m.score >= 60 ? 'good' : m.score >= 45 ? 'plain' : 'warn';

      // 1) 底物池脉冲：纤维 / 蛋白 / 乳酸（糖与发酵食品）
      sim.sub.fiber = clamp(sim.sub.fiber + m.f * 0.075, 0, 3);
      sim.sub.protein = clamp(sim.sub.protein + m.p * 0.060, 0, 3);
      sim.sub.lactate = clamp(sim.sub.lactate + m.s * 0.050 + m.z * 0.018, 0, 3);
      // 2) 一过性的产气与蠕动反应
      sim.gas = clamp(sim.gas + m.s * 0.020 + m.f * 0.012, 0, 1);
      // 3) 接下来一天的饮食偏移：持续供底物，让生态真正"吃"到这一餐
      sim.mods.push({ key: 'fiber', mode: 'add', value: m.f * 5.5, days: 1 });
      sim.mods.push({ key: 'protein', mode: 'add', value: m.p * 5.0, days: 1 });
      sim.mods.push({ key: 'fermented', mode: 'add', value: m.z * 6.0, days: 1 });

      const tg = m.tags || {};
      if (tg.spicy || tg.caffeine || tg.cold || tg.fizz || tg.superSpicy) {
        /* 刺激性饮食共同的短期反应：蠕动加快、传输时间缩短 */
        const hot = !!tg.superSpicy;
        sim.mods.push({ key: 'motility', mode: 'add', value: hot ? 24 : 16, days: hot ? 0.7 : 0.5, onEnd: '刺激性饮食的影响消退' });
      }
      if (tg.fizz) {
        /* 碳酸饮料：额外的气体负荷 */
        sim.gas = clamp(sim.gas + 0.035, 0, 1);
      }
      if (tg.superSpicy) {
        /* 高剂量辣椒素：除蠕动外，还会带来轻度的黏膜刺激与炎症波动 */
        sim.inflammation = clamp(sim.inflammation + 0.06, 0, 1);
        sim.mucus = clamp(sim.mucus - 0.05, 0.05, 1);
        sim.barrier = clamp(sim.barrier - 0.04, 0.05, 1);
      }
      if (tg.liveCulture) {
        /* 活性乳酸菌饮品：主要是"过路"补充，难以长期定植 */
        sim.n[IX.lactobacillus] += 0.9;
        sim.n[IX.bifidobacterium] += 0.5;
        sim.pushLog('饮品中的活性菌抵达肠道（多为过路菌，需持续摄入才有效）', 'plain');
      }
      if (m.tags && m.tags.alcohol) {
        sim.inflammation = clamp(sim.inflammation + 0.07, 0, 1);
        sim.barrier = clamp(sim.barrier - 0.06, 0.05, 1);
      }
      if (m.tags && m.tags.sweetener) {
        sim.pushLog('摄入人工甜味剂：无热量，但并非对菌群惰性', 'warn');
      }

      sim.meals.push({ day: sim.day, label: m.label, f: m.f, p: m.p, z: m.z, s: m.s, score: m.score });
      if (sim.meals.length > 40) sim.meals.shift();
      const title = '用餐 · ' + m.label;
      sim.pushLog('用餐：' + m.label + '（菌群友好度 ' + Math.round(m.score) + '）', tone);
      sim.events.push({ day: sim.day, id: 'meal', label: title, tone, snap: before });
      sim.pending = { id: 'meal', label: title, tone, day: before.day, before, delay: 2 };
      return m;
    };

    /* 取走待出报告（到时间且界面空闲时才会真正弹出） */
    sim.takeReport = function () {
      if (!sim.pending) return null;
      if (sim.day - sim.pending.day < sim.pending.delay) return null;
      const rep = sim.pending;
      sim.pending = null;
      rep.after = sim.snapshot();
      return rep;
    };

    /* -------- 画布手动投放 -------- */
    sim.release = function (kind) {
      if (kind === 'probiotic') {
        sim.n[IX.bifidobacterium] += 1.8;
        sim.n[IX.lactobacillus] += 1.3;
        sim.n[IX.akkermansia] += 0.7;
        sim.pushLog('在肠腔局部投放了益生菌', 'good');
      } else if (kind === 'fiber') {
        sim.sub.fiber = clamp(sim.sub.fiber + 0.35, 0, 3);
        sim.pushLog('在肠腔局部补充了膳食纤维', 'good');
      }
    };

    sim.reset = function () {
      sim.day = 0;
      sim.n = S.map((s) => s.seed * 100);
      sim.sub = { fiber: 0.55, protein: 0.35, mucin: 0.60, lactate: 0.18 };
      sim.pH = 6.5;
      sim.inflammation = 0.12;
      sim.mucus = 0.72;
      sim.barrier = 0.80;
      sim.butyrate = 0.60;
      sim.scfa = 0.60;
      sim.h2s = 0.20;
      sim.gas = 0.35;
      sim.spores = 0.5;
      sim.mods.length = 0;
      sim.events.length = 0;
      sim.log.length = 0;
      sim.meals.length = 0;
      sim.pending = null;
      sim.total = 100;
      sim.diversity = shannon();
      sim.enterotype = enterotype();
    };

    sim.shares = shares;
    sim.enterotype = enterotype;
    sim.enterotype();
    return sim;
  };

  GUT.clamp = clamp;
})(typeof window !== 'undefined' ? window : globalThis);
