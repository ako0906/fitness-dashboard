#!/usr/bin/env node
/**
 * Fetch all data from Notion DBs and emit clean JSON.
 * Designed to be resilient: tries multiple property-name variants
 * since Notion's exact property names may differ slightly.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const TOKEN = process.env.NOTION_TOKEN;
const DB_IDS = {
  meals:    process.env.NOTION_DB_MEALS    || 'f2433e8d-e57d-4f85-b6cd-430c55408378',
  workouts: process.env.NOTION_DB_WORKOUTS || '811667e8-7381-459a-b6c6-3fb4099a531e',
  daily:    process.env.NOTION_DB_DAILY    || 'fcea91a2-da72-45a7-8624-625e71abf494',
  inbody:   process.env.NOTION_DB_INBODY   || '908e3502-a5c9-4a6d-84df-346b2040a8c9',
};

if (!TOKEN) {
  console.error('ERROR: NOTION_TOKEN env var missing');
  process.exit(1);
}

const NOTION_API = 'https://api.notion.com/v1';
const HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

// ───────── Property extractors ─────────
const getProp = (props, ...names) => {
  for (const name of names) {
    if (props[name] !== undefined) return props[name];
  }
  // fuzzy match: ignore parentheses content + spaces
  const keys = Object.keys(props);
  for (const name of names) {
    const normalized = name.replace(/\s+/g, '').toLowerCase();
    const match = keys.find(k => k.replace(/[()].*?[()\s]*/g, '').replace(/\s+/g, '').toLowerCase().includes(normalized.slice(0, 6)));
    if (match) return props[match];
  }
  return null;
};

const readText = (p) => {
  if (!p) return null;
  if (p.type === 'title')     return (p.title     || []).map(t => t.plain_text).join('').trim() || null;
  if (p.type === 'rich_text') return (p.rich_text || []).map(t => t.plain_text).join('').trim() || null;
  return null;
};
const readNum = (p) => p?.number ?? null;
const readDate = (p) => p?.date?.start ?? null;
const readSelect = (p) => p?.select?.name ?? null;
const readCheckbox = (p) => p?.checkbox ?? false;

// ───────── Fetch with pagination ─────────
async function queryDb(dbId) {
  const results = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Notion query failed (${res.status}): ${txt}`);
    }
    const data = await res.json();
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return results;
}

// ───────── Normalizers ─────────
function normalizeMeal(page) {
  const p = page.properties;
  return {
    id:      page.id,
    name:    readText(getProp(p, '기록명', 'Name', '이름')),
    date:    readDate(getProp(p, '날짜', 'Date')),
    meal:    readSelect(getProp(p, '식사구분', 'Meal')),
    food:    readText(getProp(p, '음식', 'Food')),
    carb:    readNum(getProp(p, '탄수화물(g)', '탄수화물', 'Carb')),
    protein: readNum(getProp(p, '단백질(g)', '단백질', 'Protein')),
    fat:     readNum(getProp(p, '지방(g)', '지방', 'Fat')),
    kcal:    readNum(getProp(p, '칼로리(kcal)', '칼로리', 'Kcal')),
    note:    readText(getProp(p, '메모', 'Note')),
  };
}

function normalizeWorkout(page) {
  const p = page.properties;
  return {
    id:        page.id,
    name:      readText(getProp(p, '기록명', 'Name')),
    date:      readDate(getProp(p, '날짜', 'Date')),
    type:      readSelect(getProp(p, '운동종류', 'Type')),
    duration:  readNum(getProp(p, '운동시간(분)', '운동시간', 'Duration')),
    intensity: readSelect(getProp(p, '강도', 'Intensity')),
    condition: readText(getProp(p, '컨디션', 'Condition')) || readSelect(getProp(p, '컨디션', 'Condition')),
    appleKcal: readNum(getProp(p, '애플워치(kcal)', '애플워치', 'AppleKcal')),
    note:      readText(getProp(p, '운동메모', '메모', 'Note')),
  };
}

function normalizeDaily(page) {
  const p = page.properties;
  return {
    id:        page.id,
    name:      readText(getProp(p, '기록명', 'Name')),
    date:      readDate(getProp(p, '날짜', 'Date')),
    weight:    readNum(getProp(p, '체중(kg)', '체중', 'Weight')),
    skeletal:  readNum(getProp(p, '골격근량(kg)', '골격근량', 'SMM')),
    bf:        readNum(getProp(p, '체지방률(%)', '체지방률', 'BF')),
    fatMass:   readNum(getProp(p, '체지방량(kg)', '체지방량', 'FatMass')),
    totalProtein: readNum(getProp(p, '총단백질(g)', '총단백질', 'TotalProtein')),
    totalCarb:    readNum(getProp(p, '총탄수(g)', '총탄수', 'TotalCarb')),
    totalFat:     readNum(getProp(p, '총지방(g)', '총지방', 'TotalFat')),
    totalKcal:    readNum(getProp(p, '총칼로리', 'TotalKcal')),
    drinking:  readCheckbox(getProp(p, '음주', 'Drinking')),
    sleep:     readNum(getProp(p, '수면시간', 'Sleep')),
    notes:     readText(getProp(p, '특이사항', 'Notes')),
  };
}

function normalizeInbody(page) {
  const p = page.properties;
  return {
    id:        page.id,
    name:      readText(getProp(p, '기록명', 'Name')),
    date:      readDate(getProp(p, '날짜', 'Date')),
    weight:    readNum(getProp(p, '체중(kg)', '체중', 'Weight')),
    skeletal:  readNum(getProp(p, '골격근량(kg)', '골격근량')),
    bf:        readNum(getProp(p, '체지방률(%)', '체지방률')),
    fatMass:   readNum(getProp(p, '체지방량(kg)', '체지방량')),
    bmr:       readNum(getProp(p, '기초대사량(kcal)', '기초대사량')),
    visceral:  readNum(getProp(p, '내장지방레벨', 'Visceral')),
    bmi:       readNum(getProp(p, 'BMI')),
    score:     readNum(getProp(p, '인바디점수', 'Score')),
    note:      readText(getProp(p, '메모', 'Note')),
  };
}

// ───────── Main ─────────
async function main() {
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });

  const tasks = [
    { key: 'meals',    id: DB_IDS.meals,    normalize: normalizeMeal },
    { key: 'workouts', id: DB_IDS.workouts, normalize: normalizeWorkout },
    { key: 'daily',    id: DB_IDS.daily,    normalize: normalizeDaily },
    { key: 'inbody',   id: DB_IDS.inbody,   normalize: normalizeInbody },
  ];

  for (const t of tasks) {
    try {
      console.log(`Fetching ${t.key}...`);
      const pages = await queryDb(t.id);
      const rows = pages.map(t.normalize).filter(r => r.date); // drop rows without date
      // sort newest first for convenience
      rows.sort((a, b) => (a.date < b.date ? 1 : -1));
      const outPath = path.join(dataDir, `${t.key}.json`);
      await fs.writeFile(outPath, JSON.stringify(rows, null, 2));
      console.log(`  → ${rows.length} rows → ${outPath}`);
    } catch (err) {
      console.error(`Failed to fetch ${t.key}: ${err.message}`);
      process.exit(1);
    }
  }

  // emit a metadata file
  await fs.writeFile(
    path.join(dataDir, 'meta.json'),
    JSON.stringify({ updatedAt: new Date().toISOString() }, null, 2),
  );

  console.log('Done.');
}

main();
