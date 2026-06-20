/* ============================================
   SH / CUT PHASE — Dashboard renderer
   ============================================ */

// ───────── Config ─────────
const CONFIG = {
  target: {
    date: '2026-07-17',
    bf:   14.8,
    startBf: 17.6,
  },
  macros: {
    workout: { kcal: 2200, carb: 260, protein: 165, fat: 55 },
    rest:    { kcal: 1600, carb: 110, protein: 165, fat: 55 },
  },
  weights: ['하키', '웨이트', '스케이트'], // counted as workout days
};

const $ = (id) => document.getElementById(id);

// ───────── Data loading ─────────
async function loadAll() {
  const v = Date.now(); // cache-bust
  const fetchJson = async (path) => {
    try {
      const r = await fetch(`${path}?v=${v}`);
      if (!r.ok) return [];
      return await r.json();
    } catch { return []; }
  };
  const [meals, workouts, daily, inbody] = await Promise.all([
    fetchJson('data/meals.json'),
    fetchJson('data/workouts.json'),
    fetchJson('data/daily.json'),
    fetchJson('data/inbody.json'),
  ]);
  return { meals, workouts, daily, inbody };
}

// ───────── Date utils (KST) ─────────
function nowKST() {
  const now = new Date();
  // shift to KST regardless of browser tz
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 9 * 3600000);
}
function toYMD(d) {
  // Use local date parts (not UTC) to avoid KST→UTC slipping back one day
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function daysBetween(a, b) {
  return Math.floor((new Date(b) - new Date(a)) / 86400000);
}

// ───────── Animation helper ─────────
function animateNumber(el, to, opts = {}) {
  const { decimals = 0, suffix = '', duration = 800 } = opts;
  const from = parseFloat(String(el.dataset.value || '0')) || 0;
  el.dataset.value = String(to);
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - t, 3);
    const v = from + (to - from) * eased;
    el.textContent = v.toFixed(decimals) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ───────── 1. Hero ─────────
function renderHero(daily) {
  const today = toYMD(nowKST());
  const dDay = daysBetween(today, CONFIG.target.date);
  animateNumber($('dDay'), Math.max(0, dDay), { decimals: 0 });

  // latest BF
  const sorted = [...daily].sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = sorted.find(d => d.bf != null);
  const bf = latest?.bf;

  if (bf != null) {
    animateNumber($('currentBf'), bf, { decimals: 1, suffix: '%' });

    // progress 17.6 → 14.8
    const total = CONFIG.target.startBf - CONFIG.target.bf;
    const done  = CONFIG.target.startBf - bf;
    const pct   = Math.max(0, Math.min(100, (done / total) * 100));
    $('progressFill').style.width = `${pct}%`;
    animateNumber($('progressPct'), pct, { decimals: 0, suffix: '% 완료' });
  } else {
    $('currentBf').textContent = '—';
    $('progressPct').textContent = '—';
  }

  // last updated (HH:MM only, in Korean)
  const now = new Date();
  const time = now.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
  $('lastUpdated').textContent = `업데이트 ${time}`;
}

// ───────── 2. Workout heatmap ─────────
function renderHeatmap(workouts) {
  const wrap = $('heatmap');
  wrap.innerHTML = '';

  const today = nowKST();
  today.setHours(0, 0, 0, 0);

  // last 53 weeks ending today
  const end = new Date(today);
  const start = addDays(end, -52 * 7 - end.getDay());

  // index workouts by date (latest entry wins)
  const map = {};
  for (const w of workouts) {
    if (!w.date) continue;
    const ymd = w.date.slice(0, 10);
    // priority: 하키 > 웨이트 > 유산소 > 휴식
    const priority = { '하키': 4, '웨이트': 3, '유산소': 2, '휴식': 1 };
    if (!map[ymd] || (priority[w.type] || 0) > (priority[map[ymd].type] || 0)) {
      map[ymd] = w;
    }
  }

  // build cells
  const totalWeeks = 53;
  const cells = [];
  for (let w = 0; w < totalWeeks; w++) {
    for (let d = 0; d < 7; d++) {
      const cellDate = addDays(start, w * 7 + d);
      cells.push(cellDate);
    }
  }

  // arrange so weeks are columns (CSS grid auto-flow column)
  for (const date of cells) {
    const ymd = toYMD(date);
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.dataset.date = ymd;

    const isToday  = date.getTime() === today.getTime();
    const isFuture = date > today;

    if (isFuture) {
      cell.classList.add('future');
    } else {
      const rec = map[ymd];
      if (rec) {
        const typeClass = ({
          '하키':   'hockey',
          '웨이트': 'weight',
          '유산소': 'cardio',
          '휴식':   'rest',
        })[rec.type] || 'rest';
        cell.classList.add(typeClass);
        if (rec.intensity) cell.dataset.intensity = rec.intensity;
        cell.addEventListener('click', () => showWorkoutModal(rec, ymd));
      } else {
        cell.classList.add('empty');
      }
    }

    if (isToday) cell.classList.add('today');
    wrap.appendChild(cell);
  }

  // count
  const last30 = Object.values(map).filter(w => {
    const d = new Date(w.date);
    return d >= addDays(today, -30) && d <= today && CONFIG.weights.includes(w.type) || w.type === '유산소';
  }).length;
  $('gridSubtitle').textContent = `최근 30일 운동 ${last30}회`;

  // auto-scroll to today (rightmost)
  const scrollWrap = document.querySelector('.heatmap-wrap');
  if (scrollWrap) {
    requestAnimationFrame(() => { scrollWrap.scrollLeft = scrollWrap.scrollWidth; });
  }
}

function showWorkoutModal(rec, date) {
  $('modalDate').textContent = date;
  const rows = [
    ['종류', rec.type || '—'],
    ['시간', rec.duration ? `${rec.duration}분` : '—'],
    ['강도', rec.intensity || '—'],
    ['컨디션', rec.condition || '—'],
    ['애플워치', rec.appleKcal ? `${rec.appleKcal} kcal` : '—'],
    ['메모', rec.note || '—'],
  ];
  $('modalBody').innerHTML = rows.map(([k, v]) =>
    `<div class="modal-row"><span>${k}</span><span>${v}</span></div>`
  ).join('');
  $('modal').hidden = false;
}

$('modalClose').addEventListener('click', () => $('modal').hidden = true);
$('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') $('modal').hidden = true;
});

// ───────── 3. Composition (cards + BF chart) ─────────
let bfChart;

function makeSparkline(values, color = '#7E8AA6') {
  const valid = values.filter(v => v != null);
  if (valid.length < 2) return '';
  const w = 100, h = 18;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = (max - min) || 1;
  const points = values.map((v, i) => {
    if (v == null) return null;
    const x = values.length > 1 ? (i / (values.length - 1)) * w : 0;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).filter(p => p);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline points="${points.join(' ')}" stroke="${color}" stroke-width="1.2" fill="none" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
  </svg>`;
}

function renderMetricCard(cardId, daily, key, unit, opts = {}) {
  const card = $(cardId);
  if (!card) return;
  const numEl    = card.querySelector('.metric-num');
  const deltaEl  = card.querySelector('.metric-delta');
  const sparkEl  = card.querySelector('.sparkline-wrap');

  const sorted = [...daily]
    .filter(d => d[key] != null)
    .sort((a, b) => a.date < b.date ? -1 : 1);

  if (!sorted.length) {
    numEl.textContent = '—';
    deltaEl.textContent = '—';
    return;
  }

  const latest = sorted[sorted.length - 1];
  const decimals = (key === 'bf') ? 1 : 1;
  numEl.innerHTML = `${latest[key].toFixed(decimals)}<span class="metric-unit">${unit}</span>`;

  // 7-day delta: compare latest to most recent record at-or-before (latest - 7d).
  // If exactly 7 days ago is missing, falls back to 8, 9, 10... days ago automatically.
  const latestDate = new Date(latest.date);
  const sevenAgo = addDays(latestDate, -7);

  let prev = null;
  for (const r of sorted) {
    if (new Date(r.date) <= sevenAgo) prev = r;
    else break;
  }

  if (!prev || prev === latest) {
    deltaEl.textContent = '—';
    deltaEl.className = 'metric-delta';
  } else {
    const delta = latest[key] - prev[key];
    const sign = delta > 0 ? '+' : '';
    const goodDir = opts.lowerIsBetter ? (delta < -0.05) : (delta > 0.05);
    const badDir  = opts.lowerIsBetter ? (delta >  0.05) : (delta < -0.05);
    deltaEl.className = 'metric-delta' + (goodDir ? ' good' : badDir ? ' warn' : '');
    deltaEl.textContent = Math.abs(delta) < 0.05 ? `±0 / 주` : `${sign}${delta.toFixed(decimals)} / 주`;
  }

  // sparkline: last 30 days (filling all daily slots)
  const today = nowKST(); today.setHours(0,0,0,0);
  const cutoff = addDays(today, -30);
  const recent = sorted.filter(d => new Date(d.date) >= cutoff);
  const values = recent.map(d => d[key]);
  sparkEl.innerHTML = makeSparkline(values, opts.sparkColor || '#7E8AA6');
}

function renderBfChart(daily, inbody) {
  const ctx = $('bfChart').getContext('2d');
  if (bfChart) bfChart.destroy();

  const today = nowKST();
  const start = addDays(today, -60);
  const all = daily
    .filter(d => new Date(d.date) >= start)
    .sort((a, b) => a.date < b.date ? -1 : 1);

  // skip leading days without bf data
  const firstIdx = all.findIndex(d => d.bf != null);
  const filtered = firstIdx >= 0 ? all.slice(firstIdx) : all;

  const labels = filtered.map(d => d.date.slice(5));

  const movAvg = (arr, key, w = 7) => arr.map((_, i) => {
    const slice = arr.slice(Math.max(0, i - w + 1), i + 1).map(x => x[key]).filter(v => v != null);
    if (!slice.length) return null;
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });

  const bfMA = movAvg(filtered, 'bf');

  // inbody markers
  const inbodyDots = filtered.map(d => {
    const ib = inbody.find(i => i.date && i.date.slice(0, 10) === d.date.slice(0, 10));
    return ib ? d.bf : null;
  });

  Chart.defaults.font.family = "'Pretendard Variable', sans-serif";
  Chart.defaults.color = '#7E8AA6';

  bfChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '체지방률 (7DMA)',
          data: bfMA,
          borderColor: '#6FE0C2',
          backgroundColor: 'rgba(111, 224, 194, 0.07)',
          borderWidth: 1.8,
          tension: 0.3,
          pointRadius: 0,
          fill: true,
        },
        {
          label: 'InBody',
          data: inbodyDots,
          borderColor: 'transparent',
          backgroundColor: '#B8B5F0',
          pointRadius: 4,
          pointHoverRadius: 6,
          showLine: false,
        },
        {
          label: '목표 14.8%',
          data: filtered.map(() => CONFIG.target.bf),
          borderColor: 'rgba(111, 224, 194, 0.45)',
          borderDash: [3, 3],
          borderWidth: 1,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1B2230',
          borderColor: '#252D3F',
          borderWidth: 1,
          titleFont: { family: "'Pretendard Variable', sans-serif", size: 10 },
          bodyFont:  { family: "'Pretendard Variable', sans-serif", size: 11 },
          padding: 10,
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label === 'InBody' && ctx.parsed.y == null) return null;
              if (ctx.parsed.y == null) return null;
              return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}%`;
            }
          }
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 9 }, color: '#4A536B', maxTicksLimit: 6 },
        },
        y: {
          grid: { color: '#252D3F', lineWidth: 0.5 },
          ticks: { font: { size: 9 }, color: '#7E8AA6', callback: v => v.toFixed(1) + '%' },
          suggestedMin: CONFIG.target.bf - 0.5,
        },
      },
    },
  });
}

function renderComposition(daily, inbody) {
  renderMetricCard('card-weight',   daily, 'weight',   'kg', { lowerIsBetter: true,  sparkColor: '#7E8AA6' });
  renderMetricCard('card-skeletal', daily, 'skeletal', 'kg', { lowerIsBetter: false, sparkColor: '#7E8AA6' });
  renderMetricCard('card-bf',       daily, 'bf',       '%',  { lowerIsBetter: true,  sparkColor: '#7E8AA6' });
  renderBfChart(daily, inbody);
}

// ───────── 4. Today macros ─────────
function renderTodayMacros(meals, workouts) {
  const today = toYMD(nowKST());
  const todayMeals = meals.filter(m => m.date && m.date.slice(0, 10) === today);
  const todayWorkout = workouts.find(w => w.date && w.date.slice(0, 10) === today);

  const isWorkout = todayWorkout && CONFIG.weights.includes(todayWorkout.type);
  const target = isWorkout ? CONFIG.macros.workout : CONFIG.macros.rest;

  const typeEl = $('todayType');
  typeEl.textContent = isWorkout ? `운동일 · ${todayWorkout.type}` : '휴식일';
  typeEl.className = 'card-sub' + (isWorkout ? ' status-workout' : '');

  const total = todayMeals.reduce((acc, m) => ({
    kcal:    acc.kcal    + (m.kcal    || 0),
    carb:    acc.carb    + (m.carb    || 0),
    protein: acc.protein + (m.protein || 0),
    fat:     acc.fat     + (m.fat     || 0),
  }), { kcal: 0, carb: 0, protein: 0, fat: 0 });

  const rings = [
    { key: 'kcal',    label: '칼로리',   value: total.kcal,    target: target.kcal,    unit: '' },
    { key: 'carb',    label: '탄수화물', value: total.carb,    target: target.carb,    unit: 'g' },
    { key: 'protein', label: '단백질',   value: total.protein, target: target.protein, unit: 'g' },
    { key: 'fat',     label: '지방',     value: total.fat,     target: target.fat,     unit: 'g' },
  ];

  $('macroGrid').innerHTML = rings.map(r => {
    const pct = Math.min(1.5, r.value / r.target);
    const r0 = 26;
    const circ = 2 * Math.PI * r0;
    const offset = circ * (1 - Math.min(1, pct));

    // status color — restrained: only signal what's meaningful
    let cls = '';
    if (r.key === 'protein' && pct >= 0.9) cls = 'good';
    if (r.key === 'kcal' && pct > 1.05) cls = 'warn';

    const unit = r.unit ? `<span class="ring-unit">${r.unit}</span>` : '';
    return `
      <div class="ring">
        <svg class="ring-svg" viewBox="0 0 60 60">
          <circle class="ring-bg" cx="30" cy="30" r="${r0}" />
          <circle class="ring-fg ${cls}" cx="30" cy="30" r="${r0}"
                  stroke-dasharray="${circ}"
                  stroke-dashoffset="${offset}" />
        </svg>
        <span class="ring-label">${r.label}</span>
        <span class="ring-value">${Math.round(r.value)}${unit}</span>
        <span class="ring-sub">/ ${r.target}${r.unit}</span>
      </div>
    `;
  }).join('');
}

// ───────── 5. Week charts ─────────
let kcalChart, proteinChart;
function renderWeekCharts(meals, workouts) {
  const today = nowKST();
  today.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const ymd = toYMD(d);
    const dayMeals = meals.filter(m => m.date && m.date.slice(0, 10) === ymd);
    const workout = workouts.find(w => w.date && w.date.slice(0, 10) === ymd);
    const isWorkout = workout && CONFIG.weights.includes(workout.type);
    days.push({
      ymd,
      label: ['일','월','화','수','목','금','토'][d.getDay()],
      kcal: dayMeals.reduce((s, m) => s + (m.kcal || 0), 0),
      protein: dayMeals.reduce((s, m) => s + (m.protein || 0), 0),
      isWorkout,
    });
  }

  // Colors: workout day = ice, rest day = subtle surface tone
  const kcalColors    = days.map(d => d.isWorkout ? '#A8D8F0' : '#3A4358');
  // Protein: hits 150g target = mint, miss = muted gray
  const proteinColors = days.map(d => d.protein >= 150 ? '#6FE0C2' : '#3A4358');

  const commonTitleFont = { family: "'Pretendard Variable', sans-serif", size: 11, weight: 500 };
  const commonTooltip = {
    backgroundColor: '#1B2230',
    borderColor: '#252D3F',
    borderWidth: 1,
    titleFont: { family: "'Pretendard Variable', sans-serif", size: 10 },
    bodyFont:  { family: "'Pretendard Variable', sans-serif", size: 11 },
    padding: 10,
  };
  const commonXAxis = {
    grid: { display: false },
    ticks: { font: { size: 10 }, color: '#7E8AA6' },
  };
  const commonGridColor = '#252D3F';

  // kcal
  if (kcalChart) kcalChart.destroy();
  kcalChart = new Chart($('kcalChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: days.map(d => d.label),
      datasets: [{
        label: '칼로리',
        data: days.map(d => d.kcal),
        backgroundColor: kcalColors,
        borderRadius: 4,
        maxBarThickness: 28,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true, text: '일일 칼로리',
          font: commonTitleFont,
          color: '#E8EDF7', align: 'start', padding: { bottom: 10 },
        },
        tooltip: commonTooltip,
      },
      scales: {
        x: commonXAxis,
        y: {
          grid: { color: commonGridColor, lineWidth: 0.5 },
          ticks: {
            font: { size: 9 }, color: '#7E8AA6',
            callback: v => v >= 1000 ? (v/1000)+'k' : v,
          },
        },
      },
    },
  });

  // protein
  if (proteinChart) proteinChart.destroy();
  proteinChart = new Chart($('proteinChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: days.map(d => d.label),
      datasets: [{
        label: '단백질',
        data: days.map(d => d.protein),
        backgroundColor: proteinColors,
        borderRadius: 4,
        maxBarThickness: 28,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true, text: '단백질 · 목표 165g',
          font: commonTitleFont,
          color: '#E8EDF7', align: 'start', padding: { bottom: 10 },
        },
        tooltip: commonTooltip,
      },
      scales: {
        x: commonXAxis,
        y: {
          grid: { color: commonGridColor, lineWidth: 0.5 },
          ticks: { font: { size: 9 }, color: '#7E8AA6' },
          suggestedMax: 200,
        },
      },
    },
  });
}

// ───────── 6. Sober streak ─────────
function renderSober(daily) {
  const today = nowKST();
  today.setHours(0, 0, 0, 0);
  const sorted = [...daily].sort((a, b) => a.date < b.date ? 1 : -1);
  const lastDrink = sorted.find(d => d.drinking === true);

  const daysEl = $('soberDays');
  const metaEl = $('soberMeta');

  if (!lastDrink) {
    daysEl.textContent = '∞';
    daysEl.dataset.value = '0';
    metaEl.innerHTML = '기록된 음주일 없음';
  } else {
    const days = daysBetween(lastDrink.date.slice(0, 10), toYMD(today));
    animateNumber(daysEl, days, { decimals: 0 });

    // Milestone label (mint accent)
    let milestone = '';
    if (days >= 60)       milestone = '<span class="milestone">2개월 달성</span>';
    else if (days >= 30)  milestone = '<span class="milestone">30일 달성</span>';
    else if (days >= 14)  milestone = '<span class="milestone">2주 클린</span>';
    else if (days >= 7)   milestone = '<span class="milestone">1주 클린</span>';

    const md = lastDrink.date.slice(0, 10);
    const [, m, d] = md.match(/(\d{4})-(\d{2})-(\d{2})/) || [];
    const pretty = m && d ? `${parseInt(m)}월 ${parseInt(d)}일` : md;
    metaEl.innerHTML = `마지막 음주 ${pretty}${milestone}`;
  }

  renderSoberDots(daily, today);
}

function renderSoberDots(daily, today) {
  const container = $('soberDots');
  if (!container) return;

  // Build a map of date → drinking flag
  const drinkMap = new Map();
  for (const d of daily) {
    if (d.date) drinkMap.set(d.date.slice(0, 10), d.drinking === true);
  }

  let html = '';
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    const ymd = toYMD(day);
    const drank = drinkMap.get(ymd);
    const isToday = i === 0;
    const cls = drank === true ? 'drank' : drank === false ? 'clean' : '';
    const todayCls = isToday ? ' today' : '';
    html += `<span class="streak-dot ${cls}${todayCls}"></span>`;
  }
  container.innerHTML = html;
}

// ───────── 7. Week / Week (Mon-Sun) ─────────
function getMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Sun→back 6, otherwise back to Mon
  d.setDate(d.getDate() + diff);
  return d;
}

function renderWeekWeek(meals, workouts, daily) {
  const today = nowKST();
  today.setHours(0, 0, 0, 0);

  const thisWeekStart = getMonday(today);
  const thisWeekEnd   = addDays(thisWeekStart, 7);   // exclusive
  const lastWeekStart = addDays(thisWeekStart, -7);
  const lastWeekEnd   = thisWeekStart;

  const inRange = (ymd, start, end) => {
    const d = new Date(ymd);
    return d >= start && d < end;
  };

  const calc = (start, end) => {
    const ws = workouts.filter(w => w.date && inRange(w.date.slice(0,10), start, end) && CONFIG.weights.includes(w.type));
    const ms = meals.filter(m => m.date && inRange(m.date.slice(0,10), start, end));
    const ds = daily.filter(d => d.date && inRange(d.date.slice(0,10), start, end));

    const proteinByDay = {};
    ms.forEach(m => {
      const ymd = m.date.slice(0,10);
      proteinByDay[ymd] = (proteinByDay[ymd] || 0) + (m.protein || 0);
    });
    const proteinAvg = Object.values(proteinByDay).length
      ? Object.values(proteinByDay).reduce((a,b)=>a+b,0) / Object.values(proteinByDay).length
      : 0;

    const bfRecords = ds.map(d => d.bf).filter(v => v != null);
    const bfAvg = bfRecords.length ? bfRecords.reduce((a,b)=>a+b,0) / bfRecords.length : null;

    return {
      workoutCount: ws.length,
      proteinAvg,
      bfAvg,
      drinkDays: ds.filter(d => d.drinking).length,
    };
  };

  const thisWeek = calc(thisWeekStart, thisWeekEnd);
  const lastWeek = calc(lastWeekStart, lastWeekEnd);

  const fmt = (v, suffix='', decimals=0) => v == null ? '—' : `${v.toFixed(decimals)}${suffix}`;
  const delta = (a, b, suffix='', decimals=1, lowerIsBetter=false) => {
    if (a == null || b == null) return '';
    const d = a - b;
    if (Math.abs(d) < 0.05) return `<span>±0</span>`;
    const cls = lowerIsBetter ? (d < 0 ? 'ww-delta-up' : 'ww-delta-down')
                              : (d > 0 ? 'ww-delta-up' : 'ww-delta-down');
    const sign = d > 0 ? '+' : '';
    return `<span class="${cls}">${sign}${d.toFixed(decimals)}${suffix}</span>`;
  };

  const rows = [
    {
      label: '운동 횟수',
      now: `${thisWeek.workoutCount}회`,
      prev: `${lastWeek.workoutCount}회`,
      delta: delta(thisWeek.workoutCount, lastWeek.workoutCount, '회', 0),
    },
    {
      label: '단백질 평균',
      now: `${Math.round(thisWeek.proteinAvg)}g`,
      prev: `${Math.round(lastWeek.proteinAvg)}g`,
      delta: delta(thisWeek.proteinAvg, lastWeek.proteinAvg, 'g', 0),
    },
    {
      label: 'BF% 평균',
      now: fmt(thisWeek.bfAvg, '%', 1),
      prev: fmt(lastWeek.bfAvg, '%', 1),
      delta: delta(thisWeek.bfAvg, lastWeek.bfAvg, '%p', 1, true),
    },
    {
      label: '음주 일수',
      now: `${thisWeek.drinkDays}일`,
      prev: `${lastWeek.drinkDays}일`,
      delta: delta(thisWeek.drinkDays, lastWeek.drinkDays, '일', 0, true),
    },
  ];

  $('wwGrid').innerHTML = `
    <div class="ww-cell">
      <span class="ww-label">이번주</span>
      ${rows.map(r => `<div class="ww-row"><span>${r.label}</span><span>${r.now}</span></div>`).join('')}
    </div>
    <div class="ww-cell">
      <span class="ww-label">지난주</span>
      ${rows.map(r => `<div class="ww-row"><span>${r.label}</span><span>${r.prev}</span></div>`).join('')}
    </div>
    <div class="ww-cell">
      <span class="ww-label">변화</span>
      ${rows.map(r => `<div class="ww-row"><span></span>${r.delta || '<span>—</span>'}</div>`).join('')}
    </div>
  `;
}

// ───────── 8. Insights / Forecast ─────────
function renderInsights(daily, meals) {
  const today = nowKST();
  today.setHours(0, 0, 0, 0);
  const sorted = [...daily].sort((a, b) => a.date < b.date ? -1 : 1);

  // recent 7d kcal average
  const last7 = sorted.slice(-7);
  const kcalSum = last7.reduce((s, d) => s + (d.totalKcal || 0), 0);
  const kcalAvg = last7.length ? kcalSum / last7.length : 0;

  // protein avg (computed from meals to be more accurate)
  const cutoff = addDays(today, -7);
  const proteinByDay = {};
  meals.forEach(m => {
    if (!m.date) return;
    const d = new Date(m.date.slice(0,10));
    if (d >= cutoff && d <= today) {
      const ymd = m.date.slice(0,10);
      proteinByDay[ymd] = (proteinByDay[ymd] || 0) + (m.protein || 0);
    }
  });
  const proteinVals = Object.values(proteinByDay);
  const proteinAvg = proteinVals.length ? proteinVals.reduce((a,b)=>a+b,0) / proteinVals.length : 0;

  // BF pace
  const bfRecords = sorted.filter(d => d.bf != null);
  let paceText = '—';
  let forecastText = '—';
  let forecastCls = '';
  if (bfRecords.length >= 2) {
    const recent = bfRecords.slice(-14);
    const first = recent[0];
    const last  = recent[recent.length - 1];
    const days = daysBetween(first.date.slice(0,10), last.date.slice(0,10)) || 1;
    const ratePerDay = (last.bf - first.bf) / days;
    const weekRate = ratePerDay * 7;
    paceText = `${weekRate >= 0 ? '+' : ''}${weekRate.toFixed(2)}%p / 주`;

    const dDay = daysBetween(toYMD(today), CONFIG.target.date);
    const predicted = last.bf + ratePerDay * dDay;
    forecastText = `${predicted.toFixed(1)}%`;
    if (predicted <= CONFIG.target.bf) forecastCls = 'good';
    else if (predicted - CONFIG.target.bf <= 0.5) forecastCls = '';
    else forecastCls = 'warn';
  }

  const items = [
    { label: '7일 평균 칼로리', value: `${Math.round(kcalAvg)} kcal`, cls: '' },
    { label: '7일 평균 단백질', value: `${Math.round(proteinAvg)} g`, cls: proteinAvg >= 150 ? 'good' : 'warn' },
    { label: '체지방률 추세',   value: paceText, cls: paceText.startsWith('-') ? 'good' : (paceText === '—' ? '' : 'warn') },
    { label: '7/17 예측',       value: forecastText, cls: forecastCls },
  ];

  $('insights').innerHTML = items.map(i => `
    <div class="insight">
      <span class="insight-label">${i.label}</span>
      <span class="insight-value ${i.cls}">${i.value}</span>
    </div>
  `).join('');
}

// ───────── Init ─────────
async function render() {
  const data = await loadAll();
  renderHero(data.daily);
  renderHeatmap(data.workouts);
  renderComposition(data.daily, data.inbody);
  renderTodayMacros(data.meals, data.workouts);
  renderWeekCharts(data.meals, data.workouts);
  renderSober(data.daily);
  renderWeekWeek(data.meals, data.workouts, data.daily);
  renderInsights(data.daily, data.meals);
}

$('refreshBtn').addEventListener('click', () => render());

render();
