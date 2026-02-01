import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as turf from '@turf/turf';
import { execute } from '../db/index.js';

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN;
const NEIGHBORHOODS_PATH = path.resolve(process.cwd(), '..', 'client', 'public', 'neighborhoods-providence.geojson');

type RoadFeature = {
  geometry?: { coordinates?: number[][] };
  properties?: { class?: string };
};

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

async function fetchRoadsBearing(lng: number, lat: number): Promise<number | null> {
  if (!MAPBOX_TOKEN) return null;
  const url = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${lng},${lat}.json?layers=road&radius=800&limit=100&access_token=${MAPBOX_TOKEN}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { features?: RoadFeature[] };
    const feats: RoadFeature[] = data?.features || [];
    const bearings: number[] = [];
    feats.forEach((f) => {
      const coords = f.geometry?.coordinates;
      if (!coords || coords.length < 2) return;
      for (let i = 1; i < coords.length; i++) {
        const [lng1, lat1] = coords[i - 1];
        const [lng2, lat2] = coords[i];
        const b = turf.bearing([lng1, lat1], [lng2, lat2]);
        if (Number.isFinite(b)) bearings.push(b);
      }
    });
    if (bearings.length === 0) return null;
    // Use circular mean
    const sum = bearings.reduce(
      (acc, b) => {
        const rad = turf.degreesToRadians(b);
        acc.x += Math.cos(rad);
        acc.y += Math.sin(rad);
        return acc;
      },
      { x: 0, y: 0 }
    );
    const angle = Math.atan2(sum.y / bearings.length, sum.x / bearings.length);
    return turf.radiansToDegrees(angle);
  } catch (err) {
    console.error('Road bearing fetch failed:', err);
    return null;
  }
}

async function generateZones() {
  if (!fs.existsSync(NEIGHBORHOODS_PATH)) {
    throw new Error(`Neighborhood GeoJSON not found at ${NEIGHBORHOODS_PATH}`);
  }
  const neighborhoods = JSON.parse(fs.readFileSync(NEIGHBORHOODS_PATH, 'utf-8')) as { features?: any[] };
  if (!neighborhoods?.features) throw new Error('Invalid neighborhoods geojson');

  console.log(`Loaded ${neighborhoods.features.length} neighborhoods.`);
  console.log('Clearing existing zones...');
  await execute('DELETE FROM zones', []);

  for (const feature of neighborhoods.features) {
    const hoodName = feature.properties?.LNAME || feature.properties?.name || 'Neighborhood';
    const centroid = turf.centroid(feature);
    const [clng, clat] = centroid.geometry.coordinates as [number, number];
    const bearing = await fetchRoadsBearing(clng, clat);
    if (bearing !== null) {
      console.log(`Using road bearing ${bearing.toFixed(1)}° for ${hoodName}`);
    } else {
      console.log(`No road bearing found for ${hoodName}, using 0°`);
    }

    const bbox = turf.bbox(feature);
    const cellKm = 0.28; // ~280m blocks
    let grid = turf.squareGrid(bbox, cellKm, { units: 'kilometers', mask: feature });
    if (bearing !== null) {
      grid = turf.transformRotate(grid, bearing, { pivot: centroid });
    }

    let count = 0;
    for (const cell of grid.features) {
      const cellCentroid = turf.centroid(cell);
      if (!turf.booleanPointInPolygon(cellCentroid, feature)) continue;
      const clipped = (turf.intersect(cell as any, feature as any) as any) || cell;
      const coords = (clipped?.geometry?.coordinates?.[0] || []) as number[][];
      const id = uuidv4();
      count += 1;
      await execute(
        `INSERT INTO zones (id, name, neighborhood_name, boundary_coords, created_at)
         VALUES ($1,$2,$3,$4,NOW())`,
        [
          id,
          `${hoodName} - Zone ${count}`,
          hoodName,
          JSON.stringify(coords),
        ]
      );
    }
    // polite delay to respect rate limits
    await sleep(150);
  }

  console.log('Done generating zones.');
  process.exit(0);
}

generateZones().catch((err) => {
  console.error(err);
  process.exit(1);
});
