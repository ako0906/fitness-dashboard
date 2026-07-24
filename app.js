/* ============================================
   SH / CUT PHASE — Dashboard renderer
   ============================================ */

// ───────── Config ─────────
const CONFIG = {
  // fallback only — 실제 값은 v_hero / v_daily 에서 로드됨
  target: {
    date: '2026-08-31',
    bf:   14.0,
    startBf: 17.6,
    startDate: '2026-05-29',
  },
  macros: {
    workout: { kcal: 1820, carb: 182, protein: 156, fat: 52 },
    rest:    { kcal: 1620, carb: 132, protein: 156, fat: 52 },
  },
};

const $ = (id) => document.getElementById(id);

// ───────── Data loading ─────────
// ───────── Supabase ─────────
const SUPABASE_URL = 'https://vkiffowvbzxzsqrfoqov.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8Ld-0kVW2L9SmcjyqP7Teg_LYJutXYP';

const sb = async (path) => {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!r.ok) {
      console.error('Supabase fetch failed:', path, r.status, await r.text());
      return [];
    }
    return await r.json();
  } catch (e) {
    console.error('Supabase fetch error:', path, e);
    return [];
  }
};

async function loadAll() {
  // Views do all the calculation; client only fetches + renders.
  const [
    dailyRaw, workoutsRaw, inbodyRaw, gridRaw,
    hero, bodyDelta, workoutStats, sober, weekCompare, insights, lossPlan,
  ] = await Promise.all([
    sb('v_daily?order=date.desc&limit=2000'),
    sb('workouts?order=date.desc&limit=2000'),
    sb('body_measurements?method=eq.inbody&order=date.desc&limit=200'),
    sb('v_workout_grid?order=date.desc&limit=2000'),
    sb('v_hero'),
    sb('v_body_delta'),
    sb('v_workout_stats'),
    sb('v_sober'),
    sb('v_week_compare'),
    sb('v_insights'),
    sb('v_loss_plan'),
  ]);

  const daily = dailyRaw.map(d => ({
    date:         d.date,
    weight:       d.weight_kg,
    skeletal:     d.skeletal_kg,
    bf:           d.bf_pct,
    fatMass:      d.fat_mass_kg,
    drinking:     d.drinking === true,
    sleep:        d.sleep_hours,
    notes:        d.notes,
    totalKcal:    d.total_kcal,
    totalCarb:    d.total_carb,
    totalProtein: d.total_protein,
    totalFat:     d.total_fat,
    mealCount:    d.meal_count,
    isWorkoutDay: d.is_workout_day === true,
    targetKcal:   d.target_kcal,
    targetCarb:   d.target_carb,
    targetProtein: d.target_protein,
    targetFat:    d.target_fat,
  }));

  const workouts = workoutsRaw.map(w => ({
    date:      w.date,
    type:      w.type,
    duration:  w.duration_min,
    intensity: w.intensity,
    appleKcal: w.apple_kcal,
    note:      w.note,
    startTime: w.start_time,
  }));

  const inbody = inbodyRaw.map(i => ({
    date:     i.date,
    bf:       i.bf_pct,
  }));

  // Workout grid: date → { count, types[], intensities[], primaryType }
  const grid = {};
  for (const g of gridRaw) {
    grid[g.date] = {
      count:       g.workout_count,
      types:       g.types || [],
      intensities: g.intensities || [],
      primaryType: g.primary_type,
      isWorkout:   g.is_workout === true,
    };
  }

  return {
    daily, workouts, inbody, grid,
    hero:         hero[0]         || null,
    bodyDelta:    bodyDelta       || [],
    workoutStats: workoutStats[0] || null,
    sober:        sober[0]        || null,
    weekCompare:  weekCompare     || [],
    insights:     insights[0]     || null,
    lossPlan:     lossPlan[0]     || null,
  };
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
function renderHero(hero, lossPlan) {
  if (hero) {
    animateNumber($('dDay'), Math.max(0, hero.d_day), { decimals: 0 });

    // 목표 설정을 서버 값으로 동기화 (하드코딩 제거)
    if (hero.target_bf   != null) CONFIG.target.bf      = Number(hero.target_bf);
    if (hero.start_bf    != null) CONFIG.target.startBf = Number(hero.start_bf);
    if (hero.target_date != null) CONFIG.target.date    = hero.target_date;

    if (hero.target_date != null) $('targetDateLabel').textContent = fmtFullDate(hero.target_date);
    if (hero.target_bf   != null) $('targetBfLabel').textContent   = `목표 ${fmtPct(hero.target_bf)}`;
    if (hero.start_bf    != null) $('startBfLabel').textContent    = `시작 ${fmtPct(hero.start_bf)}`;
  }

  if (hero && hero.current_bf != null) {
    const bfPct   = Number(hero.bf_pct_done);
    const timePct = Number(hero.time_pct_done);

    animateNumber($('currentBf'), Number(hero.current_bf), { decimals: 1, suffix: '%' });
    $('progressFill').style.width = `${bfPct}%`;
    animateNumber($('progressPct'), bfPct, { decimals: 0, suffix: '% 완료' });

    // 일정 진행률 마커: 위치 = timePct, 상태색 = 체지방 진행 대비 앞/뒤
    const marker = $('progressMarker');
    if (marker) {
      marker.style.left = `${Math.min(100, Math.max(0, timePct))}%`;
      // 체지방 진행이 일정보다 뒤처지면 behind(rose), 앞서면 ahead(ice), 비슷하면 중립
      marker.classList.remove('behind', 'ahead');
      const diff = bfPct - timePct;
      if (diff < -3)      marker.classList.add('behind');
      else if (diff > 3)  marker.classList.add('ahead');
    }

    // Pace line → 도달 예상일 (v_loss_plan 기반)
    const paceEl = $('paceLine');
    if (lossPlan && lossPlan.projected_date) {
      const projected = fmtMonthDay(lossPlan.projected_date);
      const late = hero.target_date && lossPlan.projected_date > hero.target_date;

      if (lossPlan.is_over_safe) {
        // 감량 속도가 안전 상한 초과 → 근손실 위험 경고
        paceEl.innerHTML = `<span class="warn">감량 속도 과다</span> · 예상 도달 ${projected}`;
      } else if (late) {
        // 목표일보다 늦음
        paceEl.innerHTML = `목표일 초과 · 예상 도달 <span class="warn">${projected}</span>`;
      } else {
        // 목표일 내 도달
        paceEl.innerHTML = `<span class="good">목표일 내 도달 예상</span> · ${projected}`;
      }
    } else {
      paceEl.textContent = '';
    }
  } else {
    $('currentBf').textContent = '—';
    $('progressPct').textContent = '—';
    $('paceLine').textContent = '';
  }

  // last updated (HH:MM only)
  const now = new Date();
  const time = now.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
  $('lastUpdated').textContent = `업데이트 ${time}`;
}

// "2026-07-21" → "7월 21일"
function fmtMonthDay(ymd) {
  const m = String(ymd).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${parseInt(m[2])}월 ${parseInt(m[3])}일` : ymd;
}

// "2026-08-31" → "2026년 8월 31일"
function fmtFullDate(ymd) {
  const m = String(ymd).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}년 ${parseInt(m[2])}월 ${parseInt(m[3])}일` : ymd;
}

// 14.0 → "14%", 14.8 → "14.8%"
function fmtPct(v) {
  const n = Number(v);
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

// ───────── 2. Workout heatmap ─────────
function renderHeatmap(grid, workouts, stats) {
  const wrap = $('heatmap');
  const monthsEl = $('heatmapMonths');
  wrap.innerHTML = '';
  monthsEl.innerHTML = '';

  // Oldest recorded date determines grid start
  const gridDates = Object.keys(grid);
  let oldestYmd = CONFIG.target.startDate;
  for (const ymd of gridDates) {
    if (ymd < oldestYmd) oldestYmd = ymd;
  }
  const recordStart = new Date(oldestYmd);
  recordStart.setHours(0, 0, 0, 0);

  // Full starting month: align to Sunday of (1st of that month)
  const monthStart = new Date(recordStart.getFullYear(), recordStart.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const today = nowKST();
  today.setHours(0, 0, 0, 0);

  const daysSpan = Math.floor((today - gridStart) / 86400000);
  const totalWeeks = Math.floor(daysSpan / 7) + 1;

  // group workouts by date for modal detail (may be multiple per day)
  const workoutsByDate = {};
  for (const w of workouts) {
    if (!w.date) continue;
    const ymd = w.date.slice(0, 10);
    (workoutsByDate[ymd] ||= []).push(w);
  }

  const typeClassMap = { '하키': 'hockey', '웨이트': 'weight', '유산소': 'cardio', '휴식': 'rest' };

  for (let w = 0; w < totalWeeks; w++) {
    for (let d = 0; d < 7; d++) {
      const cellDate = addDays(gridStart, w * 7 + d);
      const ymd = toYMD(cellDate);
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.dataset.date = ymd;

      const isBeforeMonth = cellDate < monthStart;
      const isToday  = cellDate.getTime() === today.getTime();
      const isFuture = cellDate > today;

      if (isBeforeMonth || isFuture) {
        cell.classList.add('future');
      } else {
        const g = grid[ymd];
        if (g && g.isWorkout) {
          cell.classList.add(typeClassMap[g.primaryType] || 'rest');
          const dayWorkouts = workoutsByDate[ymd] || [];
          cell.addEventListener('click', () => showWorkoutModal(dayWorkouts, ymd));
        } else {
          cell.classList.add('empty');
        }
      }

      if (isToday) cell.classList.add('today');
      wrap.appendChild(cell);
    }
  }

  // Month labels
  for (let w = 0; w < totalWeeks; w++) {
    for (let d = 0; d < 7; d++) {
      const cellDate = addDays(gridStart, w * 7 + d);
      if (cellDate.getDate() === 1 && cellDate >= monthStart && cellDate <= today) {
        const span = document.createElement('span');
        span.className = 'month-label';
        span.style.gridColumn = `${w + 1}`;
        span.textContent = `${cellDate.getMonth() + 1}월`;
        monthsEl.appendChild(span);
        break;
      }
    }
  }

  // Stats from view: 30-day count + this-week count
  if (stats) {
    const wk = stats.this_week_count;
    $('gridSubtitle').textContent = wk > 0
      ? `최근 30일 ${stats.last30_count}회 · 이번 주 ${wk}회`
      : `최근 30일 ${stats.last30_count}회`;
  }

  // auto-scroll to today (rightmost)
  const scrollWrap = document.querySelector('.heatmap-wrap');
  if (scrollWrap) {
    requestAnimationFrame(() => { scrollWrap.scrollLeft = scrollWrap.scrollWidth; });
  }
}

function showWorkoutModal(dayWorkouts, date) {
  $('modalDate').textContent = date;
  if (!dayWorkouts || !dayWorkouts.length) {
    $('modalBody').innerHTML = '<div class="modal-row"><span>기록 없음</span></div>';
    $('modal').hidden = false;
    return;
  }
  // One block per workout (supports multiple sessions in a day)
  $('modalBody').innerHTML = dayWorkouts.map((rec, idx) => {
    const rows = [
      ['종류', rec.type || '—'],
      ['시간', rec.duration ? `${rec.duration}분` : '—'],
      ['강도', rec.intensity || '—'],
      ['애플워치', rec.appleKcal ? `${rec.appleKcal} kcal` : '—'],
      ['메모', rec.note || '—'],
    ];
    const header = dayWorkouts.length > 1
      ? `<div class="modal-session">세션 ${idx + 1}${rec.startTime ? ' · ' + rec.startTime.slice(0,5) : ''}</div>`
      : '';
    return header + rows.map(([k, v]) =>
      `<div class="modal-row"><span>${k}</span><span>${v}</span></div>`
    ).join('');
  }).join('');
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

function renderMetricCard(cardId, daily, delta, key, unit, opts = {}) {
  const card = $(cardId);
  if (!card) return;
  const numEl    = card.querySelector('.metric-num');
  const deltaEl  = card.querySelector('.metric-delta');
  const sparkEl  = card.querySelector('.sparkline-wrap');

  // delta row: { key, latest_val, prev_val, delta_7d } from v_body_delta
  const dRow = delta.find(d => d.key === key);

  if (!dRow || dRow.latest_val == null) {
    numEl.textContent = '—';
    deltaEl.textContent = '—';
    return;
  }

  const latestVal = Number(dRow.latest_val);
  numEl.innerHTML = `${latestVal.toFixed(1)}<span class="metric-unit">${unit}</span>`;

  if (dRow.delta_7d == null) {
    deltaEl.textContent = '—';
    deltaEl.className = 'metric-delta';
  } else {
    const dv = Number(dRow.delta_7d);
    const sign = dv > 0 ? '+' : '';
    const goodDir = opts.lowerIsBetter ? (dv < -0.05) : (dv > 0.05);
    const badDir  = opts.lowerIsBetter ? (dv >  0.05) : (dv < -0.05);
    deltaEl.className = 'metric-delta' + (goodDir ? ' good' : badDir ? ' warn' : '');
    deltaEl.textContent = Math.abs(dv) < 0.05 ? `±0 / 주` : `${sign}${dv.toFixed(1)} / 주`;
  }

  // sparkline: last 30 days from daily (fetch already in hand, no extra call)
  const dailyKey = key; // daily uses same short keys: weight/skeletal/bf
  const today = nowKST(); today.setHours(0,0,0,0);
  const cutoff = addDays(today, -30);
  const recent = [...daily]
    .filter(d => d[dailyKey] != null && new Date(d.date) >= cutoff)
    .sort((a, b) => a.date < b.date ? -1 : 1);
  sparkEl.innerHTML = makeSparkline(recent.map(d => d[dailyKey]), opts.sparkColor || '#7E8AA6');
}

// 지표별 차트 설정
const METRIC_CONFIG = {
  bf: {
    key: 'bf', title: '체지방률 추이', unit: '%', color: '#6FE0C2',
    fillBg: 'rgba(111, 224, 194, 0.07)', decimals: 2,
    target: () => CONFIG.target.bf, targetLabel: () => `목표 ${fmtPct(CONFIG.target.bf)}`,
  },
  weight: {
    key: 'weight', title: '체중 추이', unit: 'kg', color: '#A8D8F0',
    fillBg: 'rgba(168, 216, 240, 0.07)', decimals: 2,
    target: () => null, targetLabel: () => '최근 60일',
  },
  skeletal: {
    key: 'skeletal', title: '골격근량 추이', unit: 'kg', color: '#B8B5F0',
    fillBg: 'rgba(184, 181, 240, 0.07)', decimals: 2,
    target: () => null, targetLabel: () => '최근 60일',
  },
};
let currentMetric = 'bf';

function renderBodyChart(daily, inbody, metricKey) {
  const cfg = METRIC_CONFIG[metricKey] || METRIC_CONFIG.bf;
  const ctx = $('bfChart').getContext('2d');
  if (bfChart) bfChart.destroy();

  // 헤더 갱신
  $('chartTitle').textContent = cfg.title;
  $('chartMeta').textContent = cfg.targetLabel();

  const today = nowKST();
  const start = addDays(today, -60);
  const all = daily
    .filter(d => new Date(d.date) >= start)
    .sort((a, b) => a.date < b.date ? -1 : 1);

  // skip leading days without data for this metric
  const firstIdx = all.findIndex(d => d[cfg.key] != null);
  const filtered = firstIdx >= 0 ? all.slice(firstIdx) : all;

  const labels = filtered.map(d => d.date.slice(5));
  const data = filtered.map(d => d[cfg.key]);

  // last valid point → position dot
  let lastValidIdx = -1;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i] != null) { lastValidIdx = i; break; }
  }
  const pointRadii = data.map((_, i) => i === lastValidIdx ? 4 : 0);

  // inbody markers (bf/weight/skeletal 모두 InBody에 있음)
  const inbodyDots = filtered.map(d => {
    const ib = inbody.find(i => i.date && i.date.slice(0, 10) === d.date.slice(0, 10));
    return ib ? d[cfg.key] : null;
  });

  Chart.defaults.font.family = "'Pretendard Variable', sans-serif";
  Chart.defaults.color = '#7E8AA6';

  const datasets = [
    {
      label: cfg.title.replace(' 추이', ''),
      data,
      borderColor: cfg.color,
      backgroundColor: cfg.fillBg,
      borderWidth: 1.8,
      tension: 0.25,
      pointRadius: pointRadii,
      pointBackgroundColor: cfg.color,
      pointBorderColor: '#0A0E16',
      pointBorderWidth: 2,
      fill: true,
      spanGaps: false,
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
  ];

  // 목표선 (체지방률만)
  const targetVal = cfg.target();
  if (targetVal != null) {
    datasets.push({
      label: cfg.targetLabel(),
      data: filtered.map(() => targetVal),
      borderColor: 'rgba(111, 224, 194, 0.45)',
      borderDash: [3, 3],
      borderWidth: 1,
      pointRadius: 0,
    });
  }

  bfChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
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
            label: (c) => {
              if (c.dataset.label === 'InBody' && c.parsed.y == null) return null;
              if (c.parsed.y == null) return null;
              return `${c.dataset.label}: ${c.parsed.y.toFixed(cfg.decimals)}${cfg.unit}`;
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
          ticks: { font: { size: 9 }, color: '#7E8AA6', callback: v => v.toFixed(1) + cfg.unit },
          suggestedMin: targetVal != null ? targetVal - 0.5 : undefined,
        },
      },
    },
  });
}

function renderComposition(daily, inbody, bodyDelta) {
  renderMetricCard('card-weight',   daily, bodyDelta, 'weight',   'kg', { lowerIsBetter: true,  sparkColor: '#7E8AA6' });
  renderMetricCard('card-skeletal', daily, bodyDelta, 'skeletal', 'kg', { lowerIsBetter: false, sparkColor: '#7E8AA6' });
  renderMetricCard('card-bf',       daily, bodyDelta, 'bf',       '%',  { lowerIsBetter: true,  sparkColor: '#7E8AA6' });

  // 카드 클릭 → 해당 지표 그래프로 전환
  const cardMap = { 'card-weight': 'weight', 'card-skeletal': 'skeletal', 'card-bf': 'bf' };
  const selectCard = (metric) => {
    currentMetric = metric;
    Object.entries(cardMap).forEach(([id, m]) => {
      $(id).classList.toggle('selected', m === metric);
    });
    renderBodyChart(daily, inbody, metric);
  };

  Object.entries(cardMap).forEach(([id, metric]) => {
    const card = $(id);
    // 이벤트 중복 방지: 기존 핸들러 제거 후 재등록
    card.onclick = () => selectCard(metric);
  });

  // 초기 선택 유지 (기본 bf)
  selectCard(currentMetric);
}

// ───────── 4. Today macros ─────────
function renderTodayMacros(daily, todayMeals) {
  const today = toYMD(nowKST());
  const todayRow = daily.find(d => d.date && d.date.slice(0, 10) === today);

  const isWorkout = todayRow?.isWorkoutDay === true;

  const typeEl = $('todayType');
  typeEl.textContent = isWorkout ? '운동일' : '휴식일';
  typeEl.className = 'card-sub' + (isWorkout ? ' status-workout' : '');

  // Totals + targets come straight from the v_daily row (server-computed)
  const total = {
    kcal:    todayRow?.totalKcal    || 0,
    carb:    todayRow?.totalCarb    || 0,
    protein: todayRow?.totalProtein || 0,
    fat:     todayRow?.totalFat     || 0,
  };
  const target = {
    kcal:    todayRow?.targetKcal    ?? CONFIG.macros.rest.kcal,
    carb:    todayRow?.targetCarb    ?? CONFIG.macros.rest.carb,
    protein: todayRow?.targetProtein ?? CONFIG.macros.rest.protein,
    fat:     todayRow?.targetFat     ?? CONFIG.macros.rest.fat,
  };

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

  // Meal strip — which meals came in today
  const slots = ['아침', '점심', '저녁', '간식'];
  const seen = new Set();
  for (const m of (todayMeals || [])) {
    const mt = m.meal_type;
    if (slots.includes(mt)) seen.add(mt);
    else seen.add('간식'); // 운동전/운동후 → 간식
  }
  $('mealStrip').innerHTML = slots.map(s => {
    const active = seen.has(s) ? ' active' : '';
    return `<div class="meal-dot${active}"><span>${s}</span></div>`;
  }).join('');
}

// ───────── 5. Week charts ─────────
let kcalChart, proteinChart;
function renderWeekCharts(daily) {
  const today = nowKST();
  today.setHours(0, 0, 0, 0);

  // index daily rows by date
  const byDate = {};
  for (const d of daily) {
    if (d.date) byDate[d.date.slice(0, 10)] = d;
  }

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const ymd = toYMD(d);
    const row = byDate[ymd];
    days.push({
      ymd,
      label: ['일','월','화','수','목','금','토'][d.getDay()],
      kcal: row?.totalKcal || 0,
      protein: row?.totalProtein || 0,
      isWorkout: row?.isWorkoutDay === true,
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
function renderSober(sober, daily) {
  const today = nowKST();
  today.setHours(0, 0, 0, 0);

  const daysEl = $('soberDays');
  const metaEl = $('soberMeta');

  const thisMonthCount = sober?.this_month_count ?? 0;
  const soberDays = sober?.sober_days;
  const lastDate  = sober?.last_date;

  if (soberDays == null || !lastDate) {
    daysEl.textContent = '∞';
    daysEl.dataset.value = '0';
    metaEl.innerHTML = `이번 달 ${thisMonthCount}회 · 기록 없음`;
  } else {
    animateNumber(daysEl, soberDays, { decimals: 0 });

    let status;
    if (soberDays >= 60)      status = `<span class="milestone">2개월 달성</span>`;
    else if (soberDays >= 30) status = `<span class="milestone">30일 달성</span>`;
    else if (soberDays >= 14) status = `<span class="milestone">2주 클린</span>`;
    else if (soberDays >= 7)  status = `<span class="milestone">1주 클린</span>`;
    else if (soberDays >= 4)  status = `1주까지 ${7 - soberDays}일`;
    else {
      const mm = lastDate.match(/(\d{4})-(\d{2})-(\d{2})/);
      const md = mm ? `${parseInt(mm[2])}/${parseInt(mm[3])}` : lastDate.slice(5);
      status = `마지막 ${md}`;
    }

    metaEl.innerHTML = `이번 달 ${thisMonthCount}회 · ${status}`;
  }

  renderSoberDots(daily, today);
}

function renderSoberDots(daily, today) {
  const container = $('soberDots');
  if (!container) return;

  // Map: date → drinking flag
  const drinkMap = new Map();
  for (const d of daily) {
    if (d.date) drinkMap.set(d.date.slice(0, 10), d.drinking === true);
  }

  let html = '';
  for (let i = 29; i >= 0; i--) {
    const day = addDays(today, -i);
    const ymd = toYMD(day);
    const drank = drinkMap.get(ymd);
    const isToday = i === 0;
    // 'empty' = no record that day; 'clean'/'drank' = recorded
    const cls = drank === true ? 'drank' : drank === false ? 'clean' : 'empty';
    const todayCls = isToday ? ' today' : '';
    html += `<span class="streak-dot ${cls}${todayCls}"></span>`;
  }
  container.innerHTML = html;
}

// ───────── 7. Week / Week (Mon-Sun) ─────────
function renderWeekWeek(weekCompare) {
  const thisRow = weekCompare.find(w => w.period === 'this') || {};
  const lastRow = weekCompare.find(w => w.period === 'last') || {};

  const num = (v) => v == null ? null : Number(v);
  const thisWeek = {
    workoutCount: num(thisRow.workout_count) ?? 0,
    proteinAvg:   num(thisRow.protein_avg) ?? 0,
    bfAvg:        num(thisRow.bf_avg),
    drinkDays:    num(thisRow.drink_days) ?? 0,
  };
  const lastWeek = {
    workoutCount: num(lastRow.workout_count) ?? 0,
    proteinAvg:   num(lastRow.protein_avg) ?? 0,
    bfAvg:        num(lastRow.bf_avg),
    drinkDays:    num(lastRow.drink_days) ?? 0,
  };

  const fmt = (v, suffix='', decimals=0) => v == null ? '—' : `${v.toFixed(decimals)}${suffix}`;
  const deltaInfo = (a, b, suffix='', decimals=1, lowerIsBetter=false) => {
    if (a == null || b == null) return { text: '—', cls: '' };
    const d = a - b;
    if (Math.abs(d) < 0.05) return { text: '±0', cls: '' };
    const cls = lowerIsBetter ? (d < 0 ? 'ww-delta-up' : 'ww-delta-down')
                              : (d > 0 ? 'ww-delta-up' : 'ww-delta-down');
    const sign = d > 0 ? '+' : '';
    return { text: `${sign}${d.toFixed(decimals)}${suffix}`, cls };
  };

  const rows = [
    {
      label: '운동 횟수',
      now:  `${thisWeek.workoutCount}회`,
      prev: `${lastWeek.workoutCount}회`,
      delta: deltaInfo(thisWeek.workoutCount, lastWeek.workoutCount, '회', 0),
    },
    {
      label: '단백질 평균',
      now:  `${Math.round(thisWeek.proteinAvg)}g`,
      prev: `${Math.round(lastWeek.proteinAvg)}g`,
      delta: deltaInfo(thisWeek.proteinAvg, lastWeek.proteinAvg, 'g', 0),
    },
    {
      label: '체지방률 평균',
      now:  fmt(thisWeek.bfAvg, '%', 1),
      prev: fmt(lastWeek.bfAvg, '%', 1),
      delta: deltaInfo(thisWeek.bfAvg, lastWeek.bfAvg, '%p', 1, true),
    },
    {
      label: '음주 일수',
      now:  `${thisWeek.drinkDays}일`,
      prev: `${lastWeek.drinkDays}일`,
      delta: deltaInfo(thisWeek.drinkDays, lastWeek.drinkDays, '일', 0, true),
    },
  ];

  $('wwGrid').innerHTML = `
    <div class="ww-row ww-header">
      <span></span>
      <span>이번 주</span>
      <span>지난주</span>
      <span>변화</span>
    </div>
    ${rows.map(r => `
      <div class="ww-row">
        <span>${r.label}</span>
        <span>${r.now}</span>
        <span class="ww-prev">${r.prev}</span>
        <span class="${r.delta.cls}">${r.delta.text}</span>
      </div>
    `).join('')}
  `;
}

// ───────── 8. Insights / Forecast ─────────
function renderInsights(insights) {
  const kcalAvg    = insights?.kcal_avg_7d != null ? Number(insights.kcal_avg_7d) : null;
  const proteinAvg = insights?.protein_avg_7d != null ? Number(insights.protein_avg_7d) : null;
  const weekRate   = insights?.bf_rate_per_week != null ? Number(insights.bf_rate_per_week) : null;
  const forecast   = insights?.forecast_bf != null ? Number(insights.forecast_bf) : null;
  const targetBf   = insights?.target_bf != null ? Number(insights.target_bf) : CONFIG.target.bf;

  // pace text
  let paceText = '—';
  if (weekRate != null) {
    paceText = `${weekRate >= 0 ? '+' : ''}${weekRate.toFixed(2)}%p / 주`;
  }

  // Hero: 7/17 forecast (big)
  const bigEl  = $('forecastBig');
  const metaEl = $('forecastMeta');
  if (forecast != null) {
    let forecastCls = '';
    if (forecast <= targetBf) forecastCls = 'good';
    else if (forecast - targetBf <= 0.5) forecastCls = '';
    else forecastCls = 'warn';

    animateNumber(bigEl, forecast, { decimals: 1, suffix: '%' });
    bigEl.className = 'insight-hero-value ' + forecastCls;

    const diff = forecast - targetBf;
    if (diff <= 0) {
      metaEl.innerHTML = `<span class="good">목표 달성 페이스</span>`;
    } else if (diff <= 0.5) {
      metaEl.textContent = `목표 대비 +${diff.toFixed(1)}%p 격차`;
    } else {
      metaEl.innerHTML = `<span class="warn">목표 대비 +${diff.toFixed(1)}%p 격차</span>`;
    }
  } else {
    bigEl.textContent = '—';
    bigEl.className = 'insight-hero-value';
    metaEl.textContent = '데이터 부족';
  }

  const items = [
    { label: '7일 평균 칼로리', value: kcalAvg != null ? `${Math.round(kcalAvg)} kcal` : '—', cls: '' },
    { label: '7일 평균 단백질', value: proteinAvg != null ? `${Math.round(proteinAvg)} g` : '—', cls: (proteinAvg ?? 0) >= 150 ? 'good' : '' },
    { label: '체지방률 추세',   value: paceText, cls: paceText.startsWith('-') ? 'good' : (paceText === '—' ? '' : 'warn') },
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
  const today = toYMD(nowKST());
  const [data, todayMeals] = await Promise.all([
    loadAll(),
    sb(`meals?date=eq.${today}&select=meal_type`),  // meal-strip dots only
  ]);

  renderHero(data.hero, data.lossPlan);
  renderHeatmap(data.grid, data.workouts, data.workoutStats);
  renderComposition(data.daily, data.inbody, data.bodyDelta);
  renderTodayMacros(data.daily, todayMeals);
  renderWeekCharts(data.daily);
  renderSober(data.sober, data.daily);
  renderWeekWeek(data.weekCompare);
  renderInsights(data.insights);
}

function resetAnimations() {
  // Count-up animations: reset to 0
  document.querySelectorAll('[data-value]').forEach(el => {
    el.dataset.value = '0';
  });

  // Progress bar
  const fill = $('progressFill');
  if (fill) {
    fill.style.transition = 'none';
    fill.style.width = '0%';
    void fill.offsetHeight;
    fill.style.transition = '';
  }

  // Schedule marker
  const marker = $('progressMarker');
  if (marker) {
    marker.style.transition = 'none';
    marker.style.left = '0%';
    void marker.offsetHeight;
    marker.style.transition = '';
  }

  // Ring strokes — back to fully empty
  document.querySelectorAll('.ring-fg').forEach(el => {
    const dasharray = el.getAttribute('stroke-dasharray');
    if (dasharray) {
      el.style.transition = 'none';
      el.setAttribute('stroke-dashoffset', dasharray);
      void el.getBoundingClientRect();
      el.style.transition = '';
    }
  });

  // Card stagger re-run
  document.querySelectorAll('.hero, .card').forEach(el => {
    el.style.animation = 'none';
    void el.offsetHeight;
    el.style.animation = '';
  });
}

$('refreshBtn').addEventListener('click', () => {
  resetAnimations();
  render();
});

render();