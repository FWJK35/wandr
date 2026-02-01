import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { pool } from './index.js';

dotenv.config();

type CsvRow = Record<string, string>;

const FALLBACK_COORDS: Record<string, { lat: number; lng: number }> = {
  'university hall': { lat: 41.8268, lng: -71.4025 },
  'benefit street (mile of history)': { lat: 41.8255, lng: -71.4075 },
  'the providence athenaeum': { lat: 41.8252, lng: -71.4064 },
  'prospect terrace park': { lat: 41.8280, lng: -71.4052 },
  'first baptist meetinghouse': { lat: 41.8254, lng: -71.4089 },
  'risd museum': { lat: 41.8264, lng: -71.4086 },
  '"still here" by gaia': { lat: 41.8235, lng: -71.4079 },
  'providence riverwalk': { lat: 41.8250, lng: -71.4105 },
  'stephen hopkins house': { lat: 41.8240, lng: -71.4080 },
  'john brown house museum': { lat: 41.8239, lng: -71.4060 },
  '"she never came" by bezt': { lat: 41.8233, lng: -71.4092 },
  '"misty blue" by andrew hem': { lat: 41.8219, lng: -71.4070 },
  'the walk': { lat: 41.8246, lng: -71.4010 },
  '"providence industrial" by shepard fairey': { lat: 41.8199, lng: -71.4099 },
  'old state house': { lat: 41.8248, lng: -71.4114 },
  'india point park': { lat: 41.8185, lng: -71.3920 },
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function parseNumber(val: string | undefined): number | null {
  if (!val) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

async function importLandmarks() {
  const filePath = path.join(process.cwd(), 'server', 'landmarks.csv');
  if (!fs.existsSync(filePath)) {
    throw new Error(`landmarks.csv not found at ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE landmarks RESTART IDENTITY CASCADE');

    let imported = 0;
    for (const row of records) {
      const name = row['Name'] || row['name'];
      if (!name) continue;
      const category = row['Category'] || row['category'] || null;
      const description = row['Description'] || row['description'] || null;
      const walkNote = row['Approx. Walk from Main Green'] || row['walk_note'] || null;
      const lat = parseNumber(row['Latitude'] || row['latitude']);
      const lng = parseNumber(row['Longitude'] || row['longitude']);

      let latitude = lat;
      let longitude = lng;
      if (latitude === null || longitude === null) {
        const fallback = FALLBACK_COORDS[normalizeName(name)];
        if (fallback) {
          latitude = fallback.lat;
          longitude = fallback.lng;
        }
      }

      if (latitude === null || longitude === null) {
        console.warn(`Skipping landmark (missing coords): ${name}`);
        continue;
      }

      await client.query(
        `INSERT INTO landmarks (id, name, category, description, walk_note, latitude, longitude, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
        [uuidv4(), name, category, description, walkNote, latitude, longitude]
      );
      imported++;
    }

    await client.query('COMMIT');
    console.log(`✅ Imported ${imported} landmarks`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

importLandmarks().catch((err) => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
