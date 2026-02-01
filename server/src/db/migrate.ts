import { pool } from './index.js';
import { loadEnv } from '../env.js';

loadEnv();

const migrations = [
  // Users table
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    points INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    streak_days INTEGER DEFAULT 0,
    last_checkin_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Businesses table with lat/lng columns
  `CREATE TABLE IF NOT EXISTS businesses (
    id UUID PRIMARY KEY,
    owner_id UUID REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    image_url TEXT,
    phone VARCHAR(50),
    website TEXT,
    hours JSONB,
    is_verified BOOLEAN DEFAULT FALSE,
    is_boosted BOOLEAN DEFAULT FALSE,
    boost_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Create index for businesses location
  `CREATE INDEX IF NOT EXISTS idx_businesses_lat ON businesses(latitude);`,
  `CREATE INDEX IF NOT EXISTS idx_businesses_lng ON businesses(longitude);`,

  // Check-ins table
  `CREATE TABLE IF NOT EXISTS check_ins (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    points_earned INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Check-in indexes
  `CREATE INDEX IF NOT EXISTS idx_checkins_user ON check_ins(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_checkins_business ON check_ins(business_id);`,
  `CREATE INDEX IF NOT EXISTS idx_checkins_created ON check_ins(created_at);`,

  // Friendships table
  `CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, friend_id)
  );`,

  // Follows table
  `CREATE TABLE IF NOT EXISTS follows (
    id UUID PRIMARY KEY,
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(follower_id, following_id)
  );`,

  // Feed items table
  `CREATE TABLE IF NOT EXISTS feed_items (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    content JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_feed_user ON feed_items(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_feed_created ON feed_items(created_at);`,

  // Likes table
  `CREATE TABLE IF NOT EXISTS likes (
    id UUID PRIMARY KEY,
    feed_item_id UUID NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(feed_item_id, user_id)
  );`,

  // Comments table
  `CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY,
    feed_item_id UUID NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Zones table with polygon coordinates
  `CREATE TABLE IF NOT EXISTS zones (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    neighborhood_name VARCHAR(255),
    boundary_coords JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,
  `ALTER TABLE zones ADD COLUMN IF NOT EXISTS neighborhood_name VARCHAR(255);`,
  `CREATE INDEX IF NOT EXISTS idx_zones_neighborhood_name ON zones(neighborhood_name);`,

  // Migrate legacy neighborhood linkage into neighborhood_name and drop legacy schema
  `DO $$
   BEGIN
     IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'zones')
        AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'neighborhoods')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'zones' AND column_name = 'neighborhood_id') THEN
       UPDATE zones z
       SET neighborhood_name = COALESCE(z.neighborhood_name, n.name)
       FROM neighborhoods n
       WHERE z.neighborhood_id = n.id
         AND (z.neighborhood_name IS NULL OR z.neighborhood_name = '');
     END IF;
   END $$;`,
  `DO $$
   DECLARE r RECORD;
   BEGIN
     IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'neighborhoods') THEN
       FOR r IN
         SELECT conrelid::regclass AS table_name, conname
         FROM pg_constraint
         WHERE confrelid = 'neighborhoods'::regclass
       LOOP
         EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.table_name, r.conname);
       END LOOP;
     END IF;
   END $$;`,
  `ALTER TABLE IF EXISTS zones DROP COLUMN IF EXISTS neighborhood_id;`,
  `DROP INDEX IF EXISTS idx_zones_neighborhood;`,
  `DROP TABLE IF EXISTS neighborhoods CASCADE;`,

  // Zone progress table (simplified - captured when any business visited)
  `CREATE TABLE IF NOT EXISTS zone_progress (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    captured BOOLEAN DEFAULT FALSE,
    captured_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY(user_id, zone_id)
  );`,

  // Neighborhood progress table (by Mapbox neighborhood name)
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'neighborhood_progress' AND column_name = 'neighborhood_id'
     ) THEN
       DROP TABLE neighborhood_progress;
     END IF;
   END $$;`,
  `CREATE TABLE IF NOT EXISTS neighborhood_progress (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    neighborhood_name VARCHAR(255) NOT NULL,
    zones_captured INTEGER DEFAULT 0,
    total_zones INTEGER DEFAULT 0,
    fully_captured BOOLEAN DEFAULT FALSE,
    captured_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY(user_id, neighborhood_name)
  );`,

  // Badges table
  `CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url TEXT,
    badge_type VARCHAR(50) NOT NULL,
    requirements JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // User badges table
  `CREATE TABLE IF NOT EXISTS user_badges (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY(user_id, badge_id)
  );`,

  // Quests table
  `CREATE TABLE IF NOT EXISTS quests (
    id UUID PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    quest_type VARCHAR(50) NOT NULL,
    requirements JSONB NOT NULL,
    points_reward INTEGER NOT NULL,
    badge_reward_id UUID REFERENCES badges(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // User quests table
  `CREATE TABLE IF NOT EXISTS user_quests (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    progress JSONB NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, quest_id)
  );`,

  // Challenges table
  `CREATE TABLE IF NOT EXISTS challenges (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    challenge_type VARCHAR(50) NOT NULL,
    points_reward INTEGER NOT NULL,
    verification_method VARCHAR(50) DEFAULT 'checkin',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Challenge completions table
  `CREATE TABLE IF NOT EXISTS challenge_completions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    proof_url TEXT,
    verification_code VARCHAR(50),
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, challenge_id)
  );`,

  // Promotions table
  `CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    bonus_points INTEGER DEFAULT 0,
    discount_percent INTEGER,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_promotions_business ON promotions(business_id);`,
  `CREATE INDEX IF NOT EXISTS idx_promotions_time ON promotions(start_time, end_time);`,

  // Enrich businesses with metadata fields (idempotent)
  `ALTER TABLE businesses
     ADD COLUMN IF NOT EXISTS price_level SMALLINT CHECK (price_level BETWEEN 1 AND 5),
     ADD COLUMN IF NOT EXISTS safety_rating SMALLINT CHECK (safety_rating BETWEEN 0 AND 100),
     ADD COLUMN IF NOT EXISTS min_percent_off SMALLINT,
     ADD COLUMN IF NOT EXISTS max_percent_off SMALLINT,
     ADD COLUMN IF NOT EXISTS tags TEXT[],
     ADD COLUMN IF NOT EXISTS features_json JSONB,
     ADD COLUMN IF NOT EXISTS hours_json JSONB,
     ADD COLUMN IF NOT EXISTS busy_7x24_json JSONB;`,

  // Generated quests table for decision engine
  `CREATE TABLE IF NOT EXISTS generated_quests (
     quest_id TEXT PRIMARY KEY,
     business_id TEXT NOT NULL,
     type VARCHAR(20) NOT NULL,
     title VARCHAR(255) NOT NULL,
     short_prompt TEXT NOT NULL,
     steps_json JSONB NOT NULL,
     points INTEGER NOT NULL,
     starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     ends_at TIMESTAMPTZ NOT NULL,
     suggested_percent_off INTEGER,
     safety_note TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );`,
  `CREATE INDEX IF NOT EXISTS idx_generated_quests_window ON generated_quests(starts_at, ends_at);`,

  // Rewards table
  `CREATE TABLE IF NOT EXISTS rewards (
    id UUID PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    points_cost INTEGER NOT NULL,
    reward_type VARCHAR(50) NOT NULL,
    value JSONB,
    image_url TEXT,
    quantity_remaining INTEGER,
    expires_at TIMESTAMP WITH TIME ZONE,
    terms TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Redemptions table
  `CREATE TABLE IF NOT EXISTS redemptions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_id UUID NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
    redemption_code VARCHAR(20) NOT NULL UNIQUE,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    used_at TIMESTAMP WITH TIME ZONE
  );`,

  `CREATE INDEX IF NOT EXISTS idx_redemptions_user ON redemptions(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_redemptions_code ON redemptions(redemption_code);`,

  // Dynamic quest flags (AI-generated)
  `ALTER TABLE quests ADD COLUMN IF NOT EXISTS generated_for_user UUID;`,
  `ALTER TABLE quests ADD COLUMN IF NOT EXISTS is_dynamic BOOLEAN DEFAULT FALSE;`,

  // Payments (mock Stripe)
  `CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(10) DEFAULT 'usd',
    description TEXT,
    provider_session_id VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(30) DEFAULT 'created',
    receipt_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
  );`,

  `CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_payments_business ON payments(business_id);`
];

async function runMigrations() {
  console.log('🚀 Running database migrations...');

  const client = await pool.connect();

  try {
    for (const migration of migrations) {
      try {
        await client.query(migration);
        console.log('✅ Migration executed successfully');
      } catch (error: any) {
        // Ignore "already exists" errors
        if (!error.message.includes('already exists')) {
          console.error('❌ Migration failed:', error.message);
          console.error('SQL:', migration.substring(0, 100) + '...');
        }
      }
    }

    console.log('✅ All migrations completed!');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(console.error);
