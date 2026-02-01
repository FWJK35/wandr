import { v4 as uuidv4 } from 'uuid';
import { pool } from './index.js';
import { loadEnv } from '../env.js';

loadEnv();

/**
 * Imports neighborhood boundaries from a GeoJSON FeatureCollection.
 * Expects MAPBOX_NEIGHBORHOODS_URL env var pointing to a GeoJSON URL
 * (e.g., a Mapbox Tileset export or a static GeoJSON file).
 *
 * Feature properties should include a name field (name | NAME | neighborhood).
 * Geometry must be Polygon or MultiPolygon.
 */
async function main() {
  const sourceUrl = process.env.MAPBOX_NEIGHBORHOODS_URL;
  if (!sourceUrl) {
    throw new Error('MAPBOX_NEIGHBORHOODS_URL is not set in the environment.');
  }

  console.log(`🌐 Fetching neighborhoods from ${sourceUrl}`);
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch GeoJSON: ${res.status} ${res.statusText}`);
  }
  const geojson = await res.json();

  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('GeoJSON must be a FeatureCollection');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Clear existing neighborhoods and zones so import is authoritative
    await client.query('DELETE FROM zones');
    await client.query('DELETE FROM neighborhoods');

    let count = 0;
    for (const feature of geojson.features) {
      const name =
        feature.properties?.name ||
        feature.properties?.NAME ||
        feature.properties?.neighborhood ||
        feature.properties?.NEIGHBORHOOD;
      if (!name) {
        console.warn('Skipping feature without name property');
        continue;
      }

      if (
        feature.geometry?.type !== 'Polygon' &&
        feature.geometry?.type !== 'MultiPolygon'
      ) {
        console.warn(`Skipping ${name}: unsupported geometry ${feature.geometry?.type}`);
        continue;
      }

      const id = uuidv4();
      await client.query(
        `INSERT INTO neighborhoods (id, name, description, boundary_coords, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          id,
          name,
          feature.properties?.description || null,
          JSON.stringify(feature.geometry.coordinates),
        ]
      );
      count += 1;
    }

    await client.query('COMMIT');
    console.log(`✅ Imported ${count} neighborhoods from GeoJSON`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
