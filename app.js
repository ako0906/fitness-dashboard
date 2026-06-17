/* ============================================
   SH / CUT PHASE — Dashboard renderer
   ============================================ */

// ───────── Config ─────────
const CONFIG = {
  target: {
    date: '2026-07-17',
    bf:   14.8,
    startBf: 16.5,
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

// ───────── 1. Hero ─────────
function renderHero(daily) {
  const today = toYMD(nowKST());
  const dDay = daysBetween(today, CONFIG.target.date);
  $('dDay').textContent = dDay >= 0 ? `${dDay}` : '0';

  // latest BF
  const sorted = [...daily].sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = sorted.find(d => d.bf != null);
  const bf = latest?.bf;

  if (bf != null) {
    $('currentBf').textContent = `${bf.toFixed(1)}%`;
    const delta = bf - CONFIG.target.bf;
    $('bfDelta').textContent = delta > 0 ? `목표까지 -${delta.toFixed(1)}%p` : `목표 달성 +${Math.abs(delta).toFixed(1)}%p`;

    // progress 16.5 → 14.8
    const total = CONFIG.target.startBf - CONFIG.target.bf;
    const done  = CONFIG.target.startBf - bf;
    const pct   = Math.max(0, Math.min(100, (done / total) * 100));
    $('progressFill').style.width = `${pct}%`;
    $('progressPct').textContent  = `${pct.toFixed(0)}%`;
  } else {
    $('currentBf').textContent = '—';
  }

  // last updated
  $('lastUpdated').textContent = `UPDATED ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
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

    if (date > today) {
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
        if (date.getTime() === today.getTime()) cell.classList.add('today');
        cell.addEventListener('click', () => showWorkoutModal(rec, ymd));
      } else {
        cell.classList.add('empty');
      }
    }
    wrap.appendChild(cell);
  }

  // count
  const last30 = Object.values(map).filter(w => {
    const d = new Date(w.date);
    return d >= addDays(today, -30) && d <= today && CONFIG.weights.includes(w.type) || w.type === '유산소';
  }).length;
  $('gridSubtitle').textContent = `최근 30일 운동 ${last30}회`;
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

// ───────── 3. Composition trend ─────────
let compChart;
function renderCompositionChart(daily, inbody) {
  const ctx = $('compositionChart').getContext('2d');
  if (compChart) compChart.destroy();

  // last 60 days
  const today = nowKST();
  const start = addDays(today, -60);
  const all = daily
    .filter(d => new Date(d.date) >= start)
    .sort((a, b) => a.date < b.date ? -1 : 1);

  // skip leading days that have no body composition data
  const firstIdx = all.findIndex(d => d.bf != null || d.weight != null);
  const filtered = firstIdx >= 0 ? all.slice(firstIdx) : all;

  const labels = filtered.map(d => d.date.slice(5));

  // 7-day moving avg
  const movAvg = (arr, key, w = 7) => {
    return arr.map((_, i) => {
      const slice = arr.slice(Math.max(0, i - w + 1), i + 1).map(x => x[key]).filter(v => v != null);
      if (!slice.length) return null;
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    });
  };

  const weightMA   = movAvg(filtered, 'weight');
  const skeletalMA = movAvg(filtered, 'skeletal');
  const bfMA       = movAvg(filtered, 'bf');

  // inbody markers
  const inbodyDots = filtered.map(d => {
    const ib = inbody.find(i => i.date && i.date.slice(0, 10) === d.date.slice(0, 10));
    return ib ? d.bf : null;
  });

  Chart.defaults.font.family = "'Geist Mono', monospace";
  Chart.defaults.color = '#8E8E93';

  compChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '체중 (7DMA)',
          data: weightMA,
          borderColor: '#F5F5F7',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          tension: 0.3,
          pointRadius: 0,
          yAxisID: 'y1',
        },
        {
          label: '골격근량 (7DMA)',
          data: skeletalMA,
          borderColor: '#0A84FF',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          tension: 0.3,
          pointRadius: 0,
          yAxisID: 'y1',
        },
        {
          label: '체지방률 (7DMA)',
          data: bfMA,
          borderColor: '#FF9F0A',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          tension: 0.3,
          pointRadius: 0,
          yAxisID: 'y2',
        },
        {
          label: 'InBody',
          data: inbodyDots,
          borderColor: 'transparent',
          backgroundColor: '#30D158',
          pointRadius: 4,
          pointHoverRadius: 6,
          showLine: false,
          yAxisID: 'y2',
        },
        {
          label: '목표 14.8%',
          data: filtered.map(() => CONFIG.target.bf),
          borderColor: '#30D158',
          borderDash: [3, 3],
          borderWidth: 1,
          pointRadius: 0,
          yAxisID: 'y2',
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
          backgroundColor: '#1A1A1E',
          borderColor: '#26262A',
          borderWidth: 1,
          titleFont: { family: "'Geist Mono', monospace", size: 10 },
          bodyFont:  { family: "'Geist Mono', monospace", size: 11 },
          padding: 10,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 9 }, maxTicksLimit: 6 },
        },
        y1: {
          position: 'left',
          grid: { color: '#1F1F22', lineWidth: 0.5 },
          ticks: { font: { size: 9 }, color: '#F5F5F7' },
        },
        y2: {
          position: 'right',
          grid: { display: false },
          ticks: { font: { size: 9 }, color: '#FF9F0A' },
        },
      },
    },
  });
}

// ───────── 4. Today macros ─────────
function renderTodayMacros(meals, workouts) {
  const today = toYMD(nowKST());
  const todayMeals = meals.filter(m => m.date && m.date.slice(0, 10) === today);
  const todayWorkout = workouts.find(w => w.date && w.date.slice(0, 10) === today);

  const isWorkout = todayWorkout && CONFIG.weights.includes(todayWorkout.type);
  const target = isWorkout ? CONFIG.macros.workout : CONFIG.macros.rest;
  $('todayType').textContent = isWorkout ? `운동일 · ${todayWorkout.type}` : '휴식일';

  const total = todayMeals.reduce((acc, m) => ({
    kcal:    acc.kcal    + (m.kcal    || 0),
    carb:    acc.carb    + (m.carb    || 0),
    protein: acc.protein + (m.protein || 0),
    fat:     acc.fat     + (m.fat     || 0),
  }), { kcal: 0, carb: 0, protein: 0, fat: 0 });

  const rings = [
    { label: 'KCAL', value: total.kcal,    target: target.kcal,    unit: '' },
    { label: 'CARB', value: total.carb,    target: target.carb,    unit: 'g' },
    { label: 'PROT', value: total.protein, target: target.protein, unit: 'g' },
    { label: 'FAT',  value: total.fat,     target: target.fat,     unit: 'g' },
  ];

  $('macroGrid').innerHTML = rings.map(r => {
    const pct = Math.min(1.5, r.value / r.target);
    const r0 = 26;
    const circ = 2 * Math.PI * r0;
    const offset = circ * (1 - Math.min(1, pct));

    // status color
    let cls = '';
    if (r.label === 'PROT') cls = pct >= 0.9 ? 'good' : 'warn';
    if (r.label === 'KCAL' && pct > 1.05) cls = 'warn';

    return `
      <div class="ring">
        <svg class="ring-svg" viewBox="0 0 60 60">
          <circle class="ring-bg" cx="30" cy="30" r="${r0}" />
          <circle class="ring-fg ${cls}" cx="30" cy="30" r="${r0}"
                  stroke-dasharray="${circ}"
                  stroke-dashoffset="${offset}" />
        </svg>
        <span class="ring-value">${Math.round(r.value)}${r.unit}</span>
        <span class="ring-sub">/ ${r.target}${r.unit}</span>
        <span class="ring-label">${r.label}</span>
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

  const kcalColors = days.map(d => d.isWorkout ? '#0A84FF' : '#48484A');
  const proteinColors = days.map(d => d.protein >= 150 ? '#30D158' : '#FF9F0A');

  // kcal
  if (kcalChart) kcalChart.destroy();
  kcalChart = new Chart($('kcalChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: days.map(d => d.label),
      datasets: [{
        label: 'KCAL',
        data: days.map(d => d.kcal),
        backgroundColor: kcalColors,
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true, text: '일일 칼로리',
          font: { family: "'Geist Mono', monospace", size: 10, weight: 500 },
          color: '#8E8E93', align: 'start', padding: { bottom: 8 },
        },
        tooltip: { backgroundColor: '#1A1A1E', borderColor: '#26262A', borderWidth: 1 },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 } } },
        y: { grid: { color: '#1F1F22', lineWidth: 0.5 }, ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000)+'k' : v } },
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
        label: 'PROT',
        data: days.map(d => d.protein),
        backgroundColor: proteinColors,
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true, text: '단백질 (g) · 목표 165g',
          font: { family: "'Geist Mono', monospace", size: 10, weight: 500 },
          color: '#8E8E93', align: 'start', padding: { bottom: 8 },
        },
        tooltip: { backgroundColor: '#1A1A1E', borderColor: '#26262A', borderWidth: 1 },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 } } },
        y: {
          grid: { color: '#1F1F22', lineWidth: 0.5 },
          ticks: { font: { size: 9 } },
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

  if (!lastDrink) {
    $('soberDays').textContent = '∞';
    $('soberMeta').textContent = '기록된 음주일 없음';
    return;
  }
  const days = daysBetween(lastDrink.date.slice(0, 10), toYMD(today));
  $('soberDays').textContent = days;
  $('soberMeta').textContent = `마지막: ${lastDrink.date.slice(5, 10)}`;
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
  renderCompositionChart(data.daily, data.inbody);
  renderTodayMacros(data.meals, data.workouts);
  renderWeekCharts(data.meals, data.workouts);
  renderSober(data.daily);
  renderWeekWeek(data.meals, data.workouts, data.daily);
  renderInsights(data.daily, data.meals);
}

$('refreshBtn').addEventListener('click', () => render());

render();
