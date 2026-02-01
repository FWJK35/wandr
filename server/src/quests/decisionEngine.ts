import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { query } from '../db/index.js';

export type BusinessRecord = {
  id?: string;
  name: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  price_level?: number | null;
  safety_rating?: number | null;
  min_percent_off?: number | null;
  max_percent_off?: number | null;
  tags?: string[] | null;
  features_json?: Record<string, any> | null;
  hours_json?: Record<string, string> | null;
  busy_7x24_json?: Record<string, number[]> | null;
};

export type CandidateBusiness = {
  business_id: string;
  name: string;
  category: string;
  distance_m: number;
  busy_now: number | null;
  safety_rating: number | null;
  min_percent_off: number | null;
  max_percent_off: number | null;
  tags: string[] | null;
  features: Record<string, any> | null;
  is_open_now: boolean;
};

export type LandmarkRecord = {
  name: string;
  category: string;
  description?: string;
  latitude: number;
  longitude: number;
  hours_json?: Record<string, any> | null;
  safety_rating?: number | null;
};

export type CandidateContext = {
  userLat: number;
  userLng: number;
  windowMinutes: number;
  weatherTag?: string;
};

const toRadians = (deg: number) => (deg * Math.PI) / 180;
const EARTH_RADIUS_M = 6371000;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

function getLocalDayHour() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  const dayPart = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase() || 'mon';
  const hourPart = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  return { dayKey: dayPart.slice(0, 3) as 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', hour: hourPart };
}

function parseRanges(ranges: string): Array<{ start: number; end: number }> {
  return ranges.split(';').map((r) => {
    const [s, e] = r.split('-');
    const [sh, sm] = s.split(':').map(Number);
    const [eh, em] = e.split(':').map(Number);
    return { start: sh * 60 + sm, end: eh * 60 + em };
  });
}

function isOpenNow(hoursJson: Record<string, any> | null | undefined, dayKey: string, minutesNow: number): boolean {
  if (!hoursJson) return false;
  if (hoursJson.always === true) return true;
  const raw = hoursJson[dayKey];
  if (!raw) return false;
  if (typeof raw === 'string' && raw.toUpperCase() === 'CLOSED') return false;
  if (raw === true) return true;
  const ranges = typeof raw === 'string' ? parseRanges(raw) : [];
  return ranges.some((r) => minutesNow >= r.start && minutesNow <= r.end);
}

export function buildCandidates(businesses: BusinessRecord[], ctx: CandidateContext): (CandidateBusiness & { is_open_now: boolean })[] {
  const { dayKey, hour } = getLocalDayHour();
  const minutesNow = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false }).split(':')
    .map(Number)
    .reduce((acc, v, i) => acc + v * [60 * 60, 60, 1][i], 0);

  return businesses.map((b) => {
    const business_id = b.id || crypto.createHash('sha1').update(`${b.name}|${b.address}`).digest('hex').slice(0, 10);
    const distance_m = haversineMeters(ctx.userLat, ctx.userLng, b.latitude, b.longitude);
    const busyNowRaw = b.busy_7x24_json?.[dayKey]?.[hour];
    const busy_now = typeof busyNowRaw === 'number' ? busyNowRaw / 100 : null;
    const is_open_now = isOpenNow(b.hours_json || null, dayKey, minutesNow);

    return {
      business_id,
      name: b.name,
      category: b.category,
      distance_m,
      busy_now,
      safety_rating: b.safety_rating ?? null,
      min_percent_off: b.min_percent_off ?? null,
      max_percent_off: b.max_percent_off ?? null,
      tags: b.tags ?? null,
      features: b.features_json ?? null,
      is_open_now,
    };
  });
}

export async function fetchBusinesses(): Promise<BusinessRecord[]> {
  const rows = await query<BusinessRecord>(
    `SELECT id, name, category, address, latitude, longitude, price_level, safety_rating,
            min_percent_off, max_percent_off, tags, features_json, hours_json, busy_7x24_json
     FROM businesses`
  );
  return rows;
}

// Landmarks (CSV-backed)
import fs from 'fs';
import path from 'path';

export async function fetchLandmarks(): Promise<LandmarkRecord[]> {
  const candidates = [
    path.resolve(process.cwd(), 'landmarks.csv'),
    path.resolve(process.cwd(), 'server', 'landmarks.csv'),
    path.resolve(__dirname, '..', 'landmarks.csv'),
    path.resolve(__dirname, '..', 'src', 'landmarks.csv'),
  ];
  const csvPath = candidates.find((p) => fs.existsSync(p));
  if (!csvPath) {
    throw new Error('landmarks.csv not found');
  }
  const text = fs.readFileSync(csvPath, 'utf-8');
  const [header, ...rows] = text.trim().split(/\r?\n/);
  const cols = header.split(',');
  const get = (r: string[], key: string) => r[cols.indexOf(key)];

  return rows.map((line) => {
    const parts = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        parts.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    parts.push(current);

    const hoursRaw = get(parts, 'hours_json');
    let hours_json: Record<string, any> | null = null;
    try {
      hours_json = hoursRaw ? JSON.parse(hoursRaw) : null;
    } catch {
      hours_json = null;
    }

    return {
      name: get(parts, 'name'),
      category: get(parts, 'category'),
      description: get(parts, 'description'),
      latitude: Number(get(parts, 'latitude')),
      longitude: Number(get(parts, 'longitude')),
      hours_json,
      safety_rating: Number(get(parts, 'safety_rating')) || null,
    };
  });
}

export function buildLandmarkCandidates(landmarks: LandmarkRecord[], ctx: CandidateContext): CandidateBusiness[] {
  const { dayKey, hour } = getLocalDayHour();
  const minutesNow = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false }).split(':')
    .map(Number)
    .reduce((acc, v, i) => acc + v * [60 * 60, 60, 1][i], 0);

  return landmarks.map((l) => {
    const business_id = crypto.createHash('sha1').update(`${l.name}|${l.latitude}|${l.longitude}`).digest('hex').slice(0, 10);
    const distance_m = haversineMeters(ctx.userLat, ctx.userLng, l.latitude, l.longitude);
    const is_open_now = isOpenNow(l.hours_json || null, dayKey, minutesNow);

    return {
      business_id,
      name: l.name,
      category: l.category,
      distance_m,
      busy_now: null,
      safety_rating: l.safety_rating ?? null,
      min_percent_off: 0,
      max_percent_off: 0,
      tags: ['landmark'],
      features: { description: l.description },
      is_open_now,
    };
  });
}

// Gemini quest generation
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent';

async function fetchWeatherTag(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,weather_code`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`weather fetch ${resp.status}`);
    const data = await resp.json();
    const code = data?.current?.weather_code;
    const precip = data?.current?.precipitation ?? 0;
    if (typeof code !== 'number') return 'unknown';

    // Map WMO weather codes: simplified buckets
    if (precip > 0.2 || [51,53,55,61,63,65,80,81,82].includes(code)) return 'rain';
    if ([56,57,66,67,71,73,75,77,85,86].includes(code)) return 'snow';
    if ([95,96,99].includes(code)) return 'storm';
    if ([45,48].includes(code)) return 'fog';
    if ([1,2,3].includes(code)) return 'cloudy';
    if (code === 0) return 'clear';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

type GeminiQuest = {
  quest_id: string;
  business_id: string;
type: 'CHECK_IN' | 'PHOTO' | 'ROUTE';
  title: string;
  short_prompt: string;
  steps: { text: string }[];
  points: number;
  expires_in_minutes: number;
  suggested_percent_off: number;
  safety_note: string;
};

type GeminiResponse = {
  generated_for_window_minutes: number;
  quests: GeminiQuest[];
};

async function callGemini(payload: any): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
  const resp = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: JSON.stringify(payload, null, 2) }] }],
      systemInstruction: {
        parts: [{
          text: `You are a quest designer. Rank candidate businesses and output STRICT JSON only in this schema:
{
 "generated_for_window_minutes": number,
 "quests": [
  {
   "quest_id": string,
   "business_id": string,
   "type": "CHECK_IN"|"PHOTO"|"ROUTE",
   "title": string,
   "short_prompt": string,
   "steps": [{"text": string}],
   "points": number,
   "expires_in_minutes": number,
   "suggested_percent_off": number,
  "safety_note": string
  }
]
}
No extra text. Ensure business_id is from candidates.
Pick expires_in_minutes tailored to the situation (time of day, busyness, distance) but <= windowMinutes.
Suggest coupon within the business min/max bounds.
Each quest must differ in phrasing, structure, and player action.
Avoid repeating sentence templates like "Visit X" or "Check in at X today."
Use varied verbs (explore, discover, pop into, grab, wander, peek, try, find).
Explicitly avoid the phrases "Visit" and "Check in" in titles or prompts.
At least one quest should include a micro-challenge (photo, item, route, or observation).
Ensure each quest uses a distinct opening phrase and verb choice from the others in the batch.
If a candidate includes features.description (e.g., landmarks), weave one concrete detail from it into the quest title or prompt for flavor.
For landmarks or non-commerce points (tags may include "landmark"), design leisure/experience-oriented tasks only (photo, observation, route, trivia); avoid any language about buying or spending money.`
        }]
      },
      generationConfig: { temperature: 0.5, maxOutputTokens: 1024 }
    })
  });
  if (!resp.ok) throw new Error(`Gemini error ${resp.status}`);
  const data = await resp.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function safeParseGemini(text: string): GeminiResponse | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function generateQuestsWithGemini(
  candidates: ReturnType<typeof buildCandidates>,
  ctx: CandidateContext
): Promise<GeminiResponse> {
  const nowLocal = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date());

  const weather = ctx.weatherTag || (await fetchWeatherTag(ctx.userLat, ctx.userLng));

  const payload = {
    now_local: nowLocal,
    weather_tag: weather,
    user_location: { lat: ctx.userLat, lng: ctx.userLng },
    candidates,
  };

  let parsed: GeminiResponse | null = null;
  try {
    const raw = await callGemini(payload);
    parsed = safeParseGemini(raw);
  } catch (err) {
    console.warn('Gemini call failed, using fallback:', err);
  }

  const candidateMap = new Map(candidates.map((c) => [c.business_id, c]));

  const validateQuest = (q: GeminiQuest): GeminiQuest | null => {
    if (!candidateMap.has(q.business_id)) return null;
    const cand = candidateMap.get(q.business_id)!;
    let pct: number | null;
    if (cand.min_percent_off === null && cand.max_percent_off === null) {
      pct = null; // landmarks: no coupon
    } else {
      const minOff = cand.min_percent_off ?? 0;
      const maxOff = cand.max_percent_off ?? 100;
      const raw = typeof q.suggested_percent_off === 'number' ? q.suggested_percent_off : minOff;
      pct = Math.min(Math.max(raw, minOff), maxOff);
    }
    const expires = Math.min(q.expires_in_minutes, ctx.windowMinutes);
    return { ...q, suggested_percent_off: pct as any, expires_in_minutes: expires };
  };

  if (parsed?.quests?.length) {
    const valid = parsed.quests
      .map(q => ({
        ...q,
        quest_id: `${q.quest_id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      }))
      .map(validateQuest)
      .filter((q): q is GeminiQuest => !!q);
    if (valid.length) {
      return { generated_for_window_minutes: parsed.generated_for_window_minutes ?? ctx.windowMinutes, quests: valid };
    }
  }

  // Fallback: varied templates with distinct phrasing/actions
  const templates = [
    (c: ReturnType<typeof buildCandidates>[number]) => ({
      title: `Explore ${c.name}`,
      short_prompt: `Swing by ${c.name} and log your stop before time runs out.`,
      steps: [{ text: `Pop into ${c.name}, snap a quick photo of the storefront, and submit your visit.` }],
      type: 'PHOTO' as const,
    }),
    (c: ReturnType<typeof buildCandidates>[number]) => ({
      title: `Grab & Go at ${c.name}`,
      short_prompt: `Try a quick bite at ${c.name} and note your favorite item.`,
      steps: [{ text: `Order something small at ${c.name}, jot the item name, and check in.` }],
      type: 'CHECK_IN' as const,
    }),
    (c: ReturnType<typeof buildCandidates>[number]) => ({
      title: `Route past ${c.name}`,
      short_prompt: `Walk a 5-minute loop that passes ${c.name} and log it.`,
      steps: [{ text: `Start near ${c.name}, walk 5 minutes keeping it in sight, then record your loop.` }],
      type: 'ROUTE' as const,
    }),
    (c: ReturnType<typeof buildCandidates>[number]) => ({
      title: `Peek into ${c.name}`,
      short_prompt: `Discover one detail inside ${c.name} and share it.`,
      steps: [{ text: `Step into ${c.name}, find a unique detail (poster, flavor, art), and note it on check-in.` }],
      type: 'PHOTO' as const,
    }),
  ];

  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const fallback: GeminiQuest[] = shuffled.slice(0, 3).map((c, idx) => {
    const tpl = templates[idx % templates.length](c);
    return {
      quest_id: `fallback-${idx}-${c.business_id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      business_id: c.business_id,
      type: tpl.type,
      title: tpl.title,
      short_prompt: tpl.short_prompt,
      steps: tpl.steps,
      points: 50,
      expires_in_minutes: ctx.windowMinutes,
      suggested_percent_off: c.min_percent_off ?? 0,
      safety_note: c.safety_rating ? `Safety score ${c.safety_rating}` : 'Stay aware of your surroundings.',
    };
  });

  return {
    generated_for_window_minutes: ctx.windowMinutes,
    quests: fallback,
  };
}

export async function generateLandmarkQuestsWithGemini(
  candidates: CandidateBusiness[],
  ctx: CandidateContext
): Promise<GeminiResponse> {
  return generateQuestsWithGemini(candidates as any, ctx);
}
