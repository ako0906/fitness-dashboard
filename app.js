/* ============================================
   SH / CUT PHASE — Dashboard renderer
   ============================================ */

// ───────── Config ─────────
const CONFIG = {
  // fallback only — 실제 값은 v_hero / v_daily 에서 로드됨
  target: {
    date: '2026-10-19',
    metric: 'weight_kg',
    unit: 'kg',
    goalValue: 70.0,
    startValue: 65.2,
    startDate: '2026-05-29',   // 잔디 시작 기준 (기록 시작일)
    guardMetric: 'bf_pct',
    guardMax: 16.0,
    phase: 'lean_bulk',
  },
  macros: {
    workout: { kcal: 2579, carb: 383, protein: 144, fat: 52 },
    rest:    { kcal: 2379, carb: 333, protein: 144, fat: 52 },
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
    hero, bodyDelta, workoutStats, sober, weekCompare, insights, goalPlan,
    liftCards, liftTrend, coachNotes, phasesRaw,
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
    sb('v_goal_plan'),
    sb('v_lift_category_card'),
    sb('v_lift_trend?order=date.asc&limit=3000'),
    sb('v_coach_note'),
    sb('phases?select=phase,label,start_date,end_date&order=start_date.asc'),
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
    goalPlan:     goalPlan[0]     || null,
    liftCards:    liftCards       || [],
    liftTrend:    liftTrend       || [],
    coachNotes:   coachNotes      || [],
    phases:       phasesRaw       || [],
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
function renderHero(hero, goalPlan) {
  if (hero) {
    animateNumber($('dDay'), Math.max(0, hero.d_day), { decimals: 0 });

    // 목표/페이즈 설정을 서버 값으로 동기화
    const unit = hero.unit || 'kg';
    if (hero.goal_value  != null) CONFIG.target.goalValue  = Number(hero.goal_value);
    if (hero.start_value != null) CONFIG.target.startValue = Number(hero.start_value);
    if (hero.target_date != null) CONFIG.target.date       = hero.target_date;
    CONFIG.target.metric     = hero.goal_metric || 'weight_kg';
    CONFIG.target.unit       = unit;
    CONFIG.target.guardMax   = hero.guard_max != null ? Number(hero.guard_max) : null;
    CONFIG.target.guardMetric = hero.guard_metric || null;
    CONFIG.target.phase      = hero.phase || 'cut';

    $('metricEyebrow').textContent = `${hero.metric_label || ''} 진행`;
    if (hero.target_date != null) $('targetDateLabel').textContent = fmtFullDate(hero.target_date);
    if (hero.goal_value  != null) $('targetBfLabel').textContent   = `목표 ${fmtVal(hero.goal_value, unit)}`;
    if (hero.start_value != null) $('startBfLabel').textContent    = `시작 ${fmtVal(hero.start_value, unit)}`;

    // 푸터 페이즈 라벨
    const footer = $('footerPhase');
    if (footer && hero.phase_label) {
      const phaseEn = hero.phase === 'lean_bulk' ? 'Lean Bulk' : hero.phase === 'cut' ? 'Cut' : hero.phase;
      footer.textContent = `© 2026 ako · ${phaseEn} Phase`;
    }

    // Guard 배지 (감시 지표: 예. 벌크 중 체지방률 상한)
    const badge = $('guardBadge');
    if (badge) {
      if (hero.guard_metric && hero.guard_value != null) {
        const gLabel = hero.guard_metric === 'bf_pct' ? '체지방률' :
                       hero.guard_metric === 'weight_kg' ? '체중' : '골격근량';
        const gUnit  = hero.guard_metric === 'bf_pct' ? '%' : 'kg';
        const gVal   = Number(hero.guard_value);
        badge.hidden = false;
        badge.classList.remove('ok', 'warning', 'breached');
        if (hero.guard_breached) {
          badge.classList.add('breached');
          badge.textContent = `${gLabel} ${gVal.toFixed(1)}${gUnit} · 상한 초과`;
        } else if (hero.guard_warning) {
          badge.classList.add('warning');
          badge.textContent = `${gLabel} ${gVal.toFixed(1)}${gUnit} · 상한 근접`;
        } else {
          badge.classList.add('ok');
          badge.textContent = `${gLabel} ${gVal.toFixed(1)}${gUnit}`;
        }
      } else {
        badge.hidden = true;
      }
    }
  }

  if (hero && hero.cur_value != null) {
    const donePct = Number(hero.pct_done);
    const timePct = Number(hero.time_pct_done);
    const unit = hero.unit || 'kg';

    animateNumber($('currentBf'), Number(hero.cur_value), { decimals: 1, suffix: unit });
    $('progressFill').style.width = `${donePct}%`;
    animateNumber($('progressPct'), donePct, { decimals: 0, suffix: '% 완료' });

    // 일정 마커: 위치 = timePct, 상태색 = 목표 진행 대비 앞/뒤
    const marker = $('progressMarker');
    if (marker) {
      marker.style.left = `${Math.min(100, Math.max(0, timePct))}%`;
      marker.classList.remove('behind', 'ahead');
      const diff = donePct - timePct;
      if (diff < -3)      marker.classList.add('behind');
      else if (diff > 3)  marker.classList.add('ahead');
    }

    // Pace line → 도달 예상일 (v_goal_plan 기반, 페이즈별 문구)
    const paceEl = $('paceLine');
    if (goalPlan && goalPlan.projected_date) {
      const projected = fmtMonthDay(goalPlan.projected_date);
      const late = hero.target_date && goalPlan.projected_date > hero.target_date;
      const speedWord = hero.phase === 'lean_bulk' ? '증량' : '감량';

      if (goalPlan.is_over_safe) {
        paceEl.innerHTML = `<span class="warn">${speedWord} 속도 과다</span> · 예상 도달 ${projected}`;
      } else if (late) {
        paceEl.innerHTML = `목표일 초과 · 예상 도달 <span class="warn">${projected}</span>`;
      } else {
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
// 값 + 단위 (70 → "70kg", 16.0 → "16%")
function fmtVal(v, unit) {
  const n = Number(v);
  return `${Number.isInteger(n) ? n : n.toFixed(1)}${unit || ''}`;
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
// ───────── 페이즈 음영 플러그인 ─────────
let PHASES_CACHE = [];
const phaseBandsPlugin = {
  id: 'phaseBands',
  beforeDatasetsDraw(chart) {
    const bands = chart.options.plugins?.phaseBands?.bands || [];
    if (!bands.length) return;
    const { ctx, chartArea: { top, bottom, left, right }, scales: { x } } = chart;
    const colors = {
      cut:       'rgba(111, 224, 194, 0.045)',
      lean_bulk: 'rgba(168, 216, 240, 0.055)',
      maintain:  'rgba(126, 138, 166, 0.04)',
    };
    const half = x.getPixelForValue(1) - x.getPixelForValue(0) || 0;
    ctx.save();
    bands.forEach(b => {
      const x0 = Math.max(left,  x.getPixelForValue(b.from) - half / 2);
      const x1 = Math.min(right, x.getPixelForValue(b.to)   + half / 2);
      ctx.fillStyle = colors[b.phase] || colors.maintain;
      ctx.fillRect(x0, top, x1 - x0, bottom - top);
      // 페이즈 경계선 (차트 범위 중간에서 시작하는 경우)
      if (b.boundary) {
        const bx = x.getPixelForValue(b.from) - half / 2;
        ctx.strokeStyle = 'rgba(168, 216, 240, 0.4)';
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx, top);
        ctx.lineTo(bx, bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(168, 216, 240, 0.75)';
        ctx.font = "9px 'Pretendard Variable', sans-serif";
        ctx.fillText(b.label, bx + 4, top + 10);
      }
    });
    ctx.restore();
  },
};

function computePhaseBands(filtered, phases) {
  if (!phases?.length || !filtered.length) return [];
  const first = filtered[0].date.slice(0, 10);
  const bands = [];
  phases.forEach(p => {
    const s = p.start_date, e = p.end_date || '9999-12-31';
    let from = -1, to = -1;
    filtered.forEach((d, i) => {
      const dd = d.date.slice(0, 10);
      if (dd >= s && dd <= e) { if (from < 0) from = i; to = i; }
    });
    if (from >= 0) bands.push({
      from, to, phase: p.phase, label: p.label,
      boundary: s > first,
    });
  });
  return bands;
}

const METRIC_CONFIG = {
  // 기준선: 이 지표가 목표(goal_metric)면 목표선, 감시(guard_metric)면 상한선
  bf: {
    key: 'bf', title: '체지방률 추이', unit: '%', color: '#6FE0C2',
    fillBg: 'rgba(111, 224, 194, 0.07)', decimals: 2,
    target: () => metricLine('bf_pct').value,
    targetLabel: () => metricLine('bf_pct').label,
    lineColor: () => metricLine('bf_pct').color,
  },
  weight: {
    key: 'weight', title: '체중 추이', unit: 'kg', color: '#A8D8F0',
    fillBg: 'rgba(168, 216, 240, 0.07)', decimals: 2,
    target: () => metricLine('weight_kg').value,
    targetLabel: () => metricLine('weight_kg').label,
    lineColor: () => metricLine('weight_kg').color,
  },
  skeletal: {
    key: 'skeletal', title: '골격근량 추이', unit: 'kg', color: '#B8B5F0',
    fillBg: 'rgba(184, 181, 240, 0.07)', decimals: 2,
    target: () => metricLine('skeletal_kg').value,
    targetLabel: () => metricLine('skeletal_kg').label,
    lineColor: () => metricLine('skeletal_kg').color,
  },
};

// 지표별 기준선 결정: 목표 지표 → 목표선(mint) / 감시 지표 → 상한선(rose)
function metricLine(metric) {
  const t = CONFIG.target;
  const unit = metric === 'bf_pct' ? '%' : 'kg';
  if (t.metric === metric && t.goalValue != null) {
    return { value: t.goalValue, label: `목표 ${fmtVal(t.goalValue, unit)}`, color: 'rgba(111, 224, 194, 0.45)' };
  }
  if (t.guardMetric === metric && t.guardMax != null) {
    return { value: t.guardMax, label: `상한 ${fmtVal(t.guardMax, unit)}`, color: 'rgba(232, 155, 176, 0.5)' };
  }
  return { value: null, label: '최근 60일', color: null };
}
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
      spanGaps: true,
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

  // 기준선 (목표 지표=목표선 / 감시 지표=상한선)
  const targetVal = cfg.target();
  if (targetVal != null) {
    datasets.push({
      label: cfg.targetLabel(),
      data: filtered.map(() => targetVal),
      borderColor: (cfg.lineColor && cfg.lineColor()) || 'rgba(111, 224, 194, 0.45)',
      borderDash: [3, 3],
      borderWidth: 1,
      pointRadius: 0,
    });
  }

  bfChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    plugins: [phaseBandsPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        phaseBands: { bands: computePhaseBands(filtered, PHASES_CACHE) },
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
          suggestedMax: targetVal != null ? targetVal + 0.5 : undefined,
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
  const weekRate   = insights?.rate_per_week != null ? Number(insights.rate_per_week) : null;
  const forecast   = insights?.forecast_value != null ? Number(insights.forecast_value) : null;
  const goalValue  = insights?.goal_value != null ? Number(insights.goal_value) : CONFIG.target.goalValue;

  const metric = CONFIG.target.metric || 'weight_kg';
  const unit   = CONFIG.target.unit || 'kg';
  const rateUnit = metric === 'bf_pct' ? '%p' : 'kg';
  const metricLabel = metric === 'bf_pct' ? '체지방률' : metric === 'skeletal_kg' ? '골격근량' : '체중';
  // 방향: up이면 늘어나는 게 good (벌크), down이면 줄어드는 게 good (컷)
  const dirUp = CONFIG.target.phase === 'lean_bulk' || metric === 'skeletal_kg';

  // pace text
  let paceText = '—';
  if (weekRate != null) {
    paceText = `${weekRate >= 0 ? '+' : ''}${weekRate.toFixed(2)}${rateUnit} / 주`;
  }

  // Hero: 목표일 기준 예측 (big)
  const labelEl = $('forecastLabel');
  if (labelEl && CONFIG.target.date) {
    labelEl.textContent = `${fmtMonthDay(CONFIG.target.date)} 예측 ${metricLabel}`;
  }
  const bigEl  = $('forecastBig');
  const metaEl = $('forecastMeta');
  if (forecast != null) {
    // 방향 고려한 목표 대비 격차: 양수면 목표에 못 미침
    const gap = dirUp ? (goalValue - forecast) : (forecast - goalValue);
    const tol = metric === 'bf_pct' ? 0.5 : 1.0;
    const forecastCls = gap <= 0 ? 'good' : (gap <= tol ? '' : 'warn');

    animateNumber(bigEl, forecast, { decimals: 1, suffix: unit });
    bigEl.className = 'insight-hero-value ' + forecastCls;

    if (gap <= 0) {
      metaEl.innerHTML = `<span class="good">목표 달성 페이스</span>`;
    } else if (gap <= tol) {
      metaEl.textContent = `목표까지 ${gap.toFixed(1)}${rateUnit} 격차`;
    } else {
      metaEl.innerHTML = `<span class="warn">목표까지 ${gap.toFixed(1)}${rateUnit} 격차</span>`;
    }
  } else {
    bigEl.textContent = '—';
    bigEl.className = 'insight-hero-value';
    metaEl.textContent = '데이터 부족';
  }

  // 추세 색: 목표 방향으로 움직이면 good
  const rateGood = weekRate != null && (dirUp ? weekRate > 0 : weekRate < 0);
  const items = [
    { label: '7일 평균 칼로리', value: kcalAvg != null ? `${Math.round(kcalAvg)} kcal` : '—', cls: '' },
    { label: '7일 평균 단백질', value: proteinAvg != null ? `${Math.round(proteinAvg)} g` : '—', cls: (proteinAvg ?? 0) >= (CONFIG.macros.rest.protein || 144) ? 'good' : '' },
    { label: `${metricLabel} 추세`, value: paceText, cls: paceText === '—' ? '' : (rateGood ? 'good' : 'warn') },
  ];

  $('insights').innerHTML = items.map(i => `
    <div class="insight">
      <span class="insight-label">${i.label}</span>
      <span class="insight-value ${i.cls}">${i.value}</span>
    </div>
  `).join('');
}

// ───────── 코치 노트 ─────────
function renderCoachNote(notes) {
  const el = $('coachNote');
  if (!el) return;
  const today = toYMD(nowKST());

  // 오늘 이미 닫았으면 표시 안 함
  if (localStorage.getItem('coachDismissed') === today) { el.hidden = true; return; }
  if (!notes || !notes.length) { el.hidden = true; return; }

  // 최우선 kind가 톤을 결정 (review > warn > info > good)
  const top = notes[0];
  el.classList.remove('warn', 'info', 'good', 'review');
  el.classList.add(top.kind || 'good');

  const d = nowKST();
  $('coachDate').textContent =
    `${d.getMonth() + 1}/${d.getDate()} ${['일','월','화','수','목','금','토'][d.getDay()]}`;

  // 최대 2줄
  $('coachMsg').innerHTML = notes.slice(0, 2).map(n => n.msg).join('<br>');
  el.hidden = false;

  const closeBtn = $('coachClose');
  closeBtn.onclick = () => {
    localStorage.setItem('coachDismissed', today);
    el.style.maxHeight = el.scrollHeight + 'px';
    requestAnimationFrame(() => {
      el.classList.add('dismissing');
      el.style.maxHeight = '0px';
    });
    setTimeout(() => { el.hidden = true; el.classList.remove('dismissing'); el.style.maxHeight = ''; }, 420);
  };
}

// ───────── 칩 네비 (스크롤 스파이 + 점프) ─────────
let navInited = false;
function initChipNav() {
  if (navInited) return;
  navInited = true;
  const nav = $('chipNav');
  if (!nav) return;
  const chips = [...nav.querySelectorAll('.chip')];

  // 점프
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const t = chip.dataset.target;
      if (t === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
      else $(t)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // 스크롤 스파이: 그룹 헤더 위치 기준으로 활성 칩 결정
  const marks = ['g-body', 'g-training', 'g-review']
    .map(id => ({ id, el: $(id) })).filter(m => m.el);
  const setActive = (id) => chips.forEach(c => c.classList.toggle('active', c.dataset.target === id));

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY + 90; // 스티키 네비 높이 보정
      let cur = 'top';
      for (const m of marks) if (m.el.offsetTop <= y) cur = m.id;
      setActive(cur);
      ticking = false;
    });
  }, { passive: true });

  // 스티키 상태 감지 (배경 블러 강화용)
  const sentinel = $('navSentinel');
  if (sentinel && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) =>
      nav.classList.toggle('stuck', !e.isIntersecting)
    ).observe(sentinel);
  }
}

// ───────── 스크롤 리빌 ─────────
let revealInited = false;
function initReveal() {
  if (revealInited) return;
  revealInited = true;
  if (!('IntersectionObserver' in window)) return;
  const targets = document.querySelectorAll('.card, .group-head, .coach-note');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -4% 0px' });
  targets.forEach(t => { t.classList.add('reveal'); io.observe(t); });
}

// ───────── 리프팅 (1RM) ─────────
let liftChart = null;
const LIFT_COLORS = ['#A8D8F0', '#6FE0C2', '#B8B5F0', '#E8C9A0', '#E89BB0', '#9FE8A8'];

function renderLifts(cards, trend) {
  const grid = $('liftGrid');
  const empty = $('liftEmpty');
  const sub = $('liftSub');
  if (!grid) return;

  if (!cards.length) {
    grid.innerHTML = '';
    $('liftChartHead').hidden = true;
    $('liftChartWrap').hidden = true;
    empty.hidden = false;
    sub.textContent = '기록 없음';
    return;
  }
  empty.hidden = true;

  const totalSessions = cards.reduce((s, c) => s + Number(c.sessions || 0), 0);
  sub.textContent = `${totalSessions}세션 기록`;

  // 카테고리 카드
  grid.innerHTML = cards.map(c => {
    const gain = c.avg_gain_pct != null ? Number(c.avg_gain_pct) : null;
    const gainTxt = gain == null ? '—' :
      `${gain >= 0 ? '+' : ''}${gain.toFixed(1)}%`;
    const gainCls = gain == null ? '' : gain > 0 ? 'good' : gain < 0 ? 'warn' : '';
    const lag = c.is_lagging ? '<span class="lift-lag">지연</span>' : '';
    const days = c.days_since != null ? `${c.days_since}일 전` : '—';
    return `
      <div class="lift-card" data-cat="${c.category}">
        <div class="lift-card-head">
          <span class="lift-cat">${c.category}</span>${lag}
        </div>
        <span class="lift-gain ${gainCls}">${gainTxt}</span>
        <span class="lift-meta">${c.exercise_count}종목 · ${days}</span>
      </div>`;
  }).join('');

  // 클릭 → 해당 카테고리 종목별 1RM 추이
  const selectCat = (cat) => {
    grid.querySelectorAll('.lift-card').forEach(el =>
      el.classList.toggle('selected', el.dataset.cat === cat));
    renderLiftChart(trend, cat);
  };
  grid.querySelectorAll('.lift-card').forEach(el => {
    el.onclick = () => selectCat(el.dataset.cat);
  });

  // 기본 선택: 첫 카테고리
  selectCat(cards[0].category);
}

function renderLiftChart(trend, category) {
  const rows = trend.filter(t => t.category === category && t.best_1rm != null);
  const head = $('liftChartHead');
  const wrap = $('liftChartWrap');
  if (!rows.length) { head.hidden = true; wrap.hidden = true; return; }
  head.hidden = false;
  wrap.hidden = false;
  $('liftChartTitle').textContent = `${category} 1RM 추이`;

  // 종목별 시리즈 구성 (X축: 해당 카테고리의 훈련일 목록)
  const dates = [...new Set(rows.map(r => r.date))].sort();
  const exercises = [...new Set(rows.map(r => r.exercise))];
  const byExDate = {};
  rows.forEach(r => { byExDate[`${r.exercise}|${r.date}`] = Number(r.best_1rm); });

  const datasets = exercises.map((ex, i) => ({
    label: ex,
    data: dates.map(d => byExDate[`${ex}|${d}`] ?? null),
    borderColor: LIFT_COLORS[i % LIFT_COLORS.length],
    backgroundColor: 'transparent',
    borderWidth: 1.8,
    tension: 0.25,
    pointRadius: 3,
    pointBackgroundColor: LIFT_COLORS[i % LIFT_COLORS.length],
    pointBorderColor: '#0A0E16',
    pointBorderWidth: 1.5,
    spanGaps: true,
  }));

  const ctx = $('liftChart').getContext('2d');
  if (liftChart) liftChart.destroy();
  liftChart = new Chart(ctx, {
    type: 'line',
    data: { labels: dates.map(d => d.slice(5)), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true, position: 'bottom',
          labels: { font: { size: 10 }, color: '#7E8AA6', boxWidth: 8, boxHeight: 8, usePointStyle: true },
        },
        tooltip: {
          backgroundColor: '#1B2230', borderColor: '#252D3F', borderWidth: 1,
          titleFont: { size: 10 }, bodyFont: { size: 11 }, padding: 10,
          callbacks: {
            label: (c) => c.parsed.y == null ? null : `${c.dataset.label}: ${c.parsed.y.toFixed(1)}kg`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#4A536B', maxTicksLimit: 8 } },
        y: { grid: { color: '#252D3F', lineWidth: 0.5 },
             ticks: { font: { size: 9 }, color: '#7E8AA6', callback: v => v + 'kg' } },
      },
    },
  });
}

// ───────── Init ─────────
async function render() {
  const today = toYMD(nowKST());
  const [data, todayMeals] = await Promise.all([
    loadAll(),
    sb(`meals?date=eq.${today}&select=meal_type`),  // meal-strip dots only
  ]);

  PHASES_CACHE = data.phases;
  renderCoachNote(data.coachNotes);
  renderHero(data.hero, data.goalPlan);
  renderHeatmap(data.grid, data.workouts, data.workoutStats);
  renderComposition(data.daily, data.inbody, data.bodyDelta);
  renderTodayMacros(data.daily, todayMeals);
  renderWeekCharts(data.daily);
  renderSober(data.sober, data.daily);
  renderWeekWeek(data.weekCompare);
  renderInsights(data.insights);
  renderLifts(data.liftCards, data.liftTrend);
  initChipNav();
  initReveal();
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