import { pool } from './index.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

// Sample data for Providence, RI area (Brown University)
const PROVIDENCE_CENTER = { lat: 41.8268, lng: -71.4025 };

const sampleBusinesses = [
  // Cafes
  { name: 'Blue State Coffee', category: 'Cafe', address: '300 Thayer St, Providence, RI', lat: 41.8270, lng: -71.4007 },
  { name: 'The Coffee Exchange', category: 'Cafe', address: '207 Wickenden St, Providence, RI', lat: 41.8198, lng: -71.3986 },
  { name: 'Bolt Coffee', category: 'Cafe', address: '63 Washington St, Providence, RI', lat: 41.8248, lng: -71.4127 },
  { name: 'Small Point Cafe', category: 'Cafe', address: '230 Westminster St, Providence, RI', lat: 41.8240, lng: -71.4098 },

  // Restaurants
  { name: 'East Side Pockets', category: 'Restaurant', address: '278 Thayer St, Providence, RI', lat: 41.8266, lng: -71.4010 },
  { name: 'Kabob and Curry', category: 'Restaurant', address: '261 Thayer St, Providence, RI', lat: 41.8262, lng: -71.4014 },
  { name: 'Chipotle', category: 'Restaurant', address: '234 Thayer St, Providence, RI', lat: 41.8258, lng: -71.4018 },
  { name: 'Antonio\'s Pizza', category: 'Restaurant', address: '138 Brook St, Providence, RI', lat: 41.8254, lng: -71.3989 },
  { name: 'Den Den', category: 'Restaurant', address: '180 Angell St, Providence, RI', lat: 41.8280, lng: -71.4015 },
  { name: 'Kartabar', category: 'Restaurant', address: '284 Thayer St, Providence, RI', lat: 41.8268, lng: -71.4008 },

  // Bars
  { name: 'The GCB (Graduate Center Bar)', category: 'Bar', address: '93 Thayer St, Providence, RI', lat: 41.8242, lng: -71.4002 },
  { name: 'The Ivy', category: 'Bar', address: '232 Westminster St, Providence, RI', lat: 41.8241, lng: -71.4096 },
  { name: 'The Avery', category: 'Bar', address: '18 Luongo Memorial Sq, Providence, RI', lat: 41.8236, lng: -71.4109 },

  // Bookstores & Shops
  { name: 'Brown Bookstore', category: 'Shop', address: '244 Thayer St, Providence, RI', lat: 41.8260, lng: -71.4016 },
  { name: 'Cellar Stories', category: 'Shop', address: '111 Mathewson St, Providence, RI', lat: 41.8233, lng: -71.4104 },
  { name: 'Queen of Hearts', category: 'Shop', address: '220 Westminster St, Providence, RI', lat: 41.8238, lng: -71.4092 },

  // Museums & Attractions
  { name: 'RISD Museum', category: 'Museum', address: '20 N Main St, Providence, RI', lat: 41.8264, lng: -71.4086 },
  { name: 'Providence Athenaeum', category: 'Museum', address: '251 Benefit St, Providence, RI', lat: 41.8252, lng: -71.4064 },

  // Gyms & Wellness
  { name: 'Nelson Fitness Center', category: 'Gym', address: '225 Hope St, Providence, RI', lat: 41.8290, lng: -71.3988 },
  { name: 'CrossFit Providence', category: 'Gym', address: '135 Dryden Ln, Providence, RI', lat: 41.8305, lng: -71.4012 },

  // Entertainment
  { name: 'Providence Place Mall', category: 'Entertainment', address: '1 Providence Pl, Providence, RI', lat: 41.8295, lng: -71.4150 },
  { name: 'The Strand Theatre', category: 'Entertainment', address: '79 Washington St, Providence, RI', lat: 41.8245, lng: -71.4118 },
  { name: 'Cable Car Cinema', category: 'Entertainment', address: '204 S Main St, Providence, RI', lat: 41.8215, lng: -71.4075 },

  // Parks
  { name: 'Prospect Terrace Park', category: 'Park', address: '60 Congdon St, Providence, RI', lat: 41.8280, lng: -71.4052 },
  { name: 'Waterplace Park', category: 'Park', address: '1 Finance Way, Providence, RI', lat: 41.8280, lng: -71.4132 },
  { name: 'India Point Park', category: 'Park', address: '100 India St, Providence, RI', lat: 41.8185, lng: -71.3920 }
];

const sampleZones = [
  {
    name: 'College Hill',
    description: 'The historic College Hill neighborhood, home to Brown University and RISD',
    // Simple polygon around College Hill
    boundary: [
      [-71.4100, 41.8320],
      [-71.3950, 41.8320],
      [-71.3950, 41.8180],
      [-71.4100, 41.8180],
      [-71.4100, 41.8320]
    ]
  },
  {
    name: 'Downtown Providence',
    description: 'The heart of Providence with shopping, dining, and entertainment',
    boundary: [
      [-71.4180, 41.8280],
      [-71.4050, 41.8280],
      [-71.4050, 41.8200],
      [-71.4180, 41.8200],
      [-71.4180, 41.8280]
    ]
  },
  {
    name: 'Thayer Street',
    description: 'The vibrant commercial district near Brown University',
    boundary: [
      [-71.4040, 41.8290],
      [-71.3990, 41.8290],
      [-71.3990, 41.8240],
      [-71.4040, 41.8240],
      [-71.4040, 41.8290]
    ]
  },
  {
    name: 'Fox Point',
    description: 'Historic waterfront neighborhood with diverse dining options',
    boundary: [
      [-71.4020, 41.8220],
      [-71.3900, 41.8220],
      [-71.3900, 41.8150],
      [-71.4020, 41.8150],
      [-71.4020, 41.8220]
    ]
  }
];

const sampleBadges = [
  { name: 'First Steps', description: 'Complete your first check-in', type: 'milestone', icon: '👟' },
  { name: 'Explorer', description: 'Visit 10 unique locations', type: 'milestone', icon: '🧭' },
  { name: 'Adventurer', description: 'Visit 25 unique locations', type: 'milestone', icon: '🎒' },
  { name: 'Wanderer', description: 'Visit 50 unique locations', type: 'milestone', icon: '🗺️' },
  { name: 'Caffeine Addict', description: 'Visit 5 different cafes', type: 'category', icon: '☕' },
  { name: 'Foodie', description: 'Visit 10 different restaurants', type: 'category', icon: '🍽️' },
  { name: 'Culture Vulture', description: 'Visit 3 museums', type: 'category', icon: '🎨' },
  { name: 'Night Owl', description: 'Check in after 10 PM', type: 'special', icon: '🦉' },
  { name: 'Early Bird', description: 'Check in before 7 AM', type: 'special', icon: '🐦' },
  { name: 'Zone Captain', description: 'Capture your first zone', type: 'achievement', icon: '🏆' },
  { name: 'Streak Master', description: 'Maintain a 7-day streak', type: 'streak', icon: '🔥' },
  { name: 'Social Butterfly', description: 'Add 5 friends', type: 'social', icon: '🦋' }
];

const sampleQuests = [
  {
    title: 'Caffeine Trail',
    description: 'Visit 3 different cafes on Thayer Street',
    type: 'exploration',
    requirements: { visitCount: 3, categoryFilter: 'Cafe' },
    points: 50
  },
  {
    title: 'Culture Explorer',
    description: 'Visit the RISD Museum and Providence Athenaeum',
    type: 'specific',
    requirements: { specificLocations: ['RISD Museum', 'Providence Athenaeum'] },
    points: 75
  },
  {
    title: 'Downtown Discovery',
    description: 'Check in at 5 locations in Downtown Providence',
    type: 'zone',
    requirements: { visitCount: 5, zoneFilter: 'Downtown Providence' },
    points: 60
  },
  {
    title: 'Weekend Warrior',
    description: 'Visit 10 unique locations in a single week',
    type: 'time_challenge',
    requirements: { visitCount: 10, timeLimit: '7 days' },
    points: 100
  },
  {
    title: 'Neighborhood Navigator',
    description: 'Capture your first neighborhood zone',
    type: 'capture',
    requirements: { zoneCaptureCount: 1 },
    points: 75
  }
];

async function seed() {
  console.log('🌱 Seeding database...');

  const client = await pool.connect();

  try {
    // Create demo users
    console.log('Creating demo users...');
    const demoPassword = await bcrypt.hash('password123', 10);

    const users = [
      { username: 'explorer1', email: 'explorer1@demo.com', displayName: 'Alex Explorer', points: 450, level: 3 },
      { username: 'wanderer2', email: 'wanderer2@demo.com', displayName: 'Sam Wanderer', points: 320, level: 2 },
      { username: 'adventurer3', email: 'adventurer3@demo.com', displayName: 'Jordan Adventure', points: 780, level: 4 },
      { username: 'demo', email: 'demo@wandr.app', displayName: 'Demo User', points: 100, level: 1 }
    ];

    const userIds: string[] = [];
    for (const user of users) {
      const id = uuidv4();
      userIds.push(id);
      await client.query(
        `INSERT INTO users (id, email, username, password_hash, display_name, points, level, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (email) DO NOTHING`,
        [id, user.email, user.username, demoPassword, user.displayName, user.points, user.level]
      );
    }
    console.log(`✅ Created ${users.length} demo users`);

    // Create businesses
    console.log('Creating businesses...');
    const businessIds: string[] = [];
    for (const biz of sampleBusinesses) {
      const id = uuidv4();
      businessIds.push(id);
      await client.query(
        `INSERT INTO businesses (id, name, category, address, location, is_verified, created_at)
         VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), true, NOW())
         ON CONFLICT DO NOTHING`,
        [id, biz.name, biz.category, biz.address, biz.lng, biz.lat]
      );
    }
    console.log(`✅ Created ${sampleBusinesses.length} businesses`);

    // Create zones
    console.log('Creating zones...');
    const zoneIds: string[] = [];
    for (const zone of sampleZones) {
      const id = uuidv4();
      zoneIds.push(id);
      const polygonWKT = `POLYGON((${zone.boundary.map(p => `${p[0]} ${p[1]}`).join(', ')}))`;
      await client.query(
        `INSERT INTO zones (id, name, description, boundary, created_at)
         VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromText($4), 4326), NOW())
         ON CONFLICT DO NOTHING`,
        [id, zone.name, zone.description, polygonWKT]
      );
    }
    console.log(`✅ Created ${sampleZones.length} zones`);

    // Create badges
    console.log('Creating badges...');
    const badgeIds: string[] = [];
    for (const badge of sampleBadges) {
      const id = uuidv4();
      badgeIds.push(id);
      await client.query(
        `INSERT INTO badges (id, name, description, badge_type, icon_url, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT DO NOTHING`,
        [id, badge.name, badge.description, badge.type, badge.icon]
      );
    }
    console.log(`✅ Created ${sampleBadges.length} badges`);

    // Create quests
    console.log('Creating quests...');
    for (const quest of sampleQuests) {
      const id = uuidv4();
      await client.query(
        `INSERT INTO quests (id, title, description, quest_type, requirements, points_reward, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
         ON CONFLICT DO NOTHING`,
        [id, quest.title, quest.description, quest.type, JSON.stringify(quest.requirements), quest.points]
      );
    }
    console.log(`✅ Created ${sampleQuests.length} quests`);

    // Create sample check-ins for demo users
    console.log('Creating sample check-ins...');
    let checkinCount = 0;
    for (let i = 0; i < Math.min(userIds.length, 3); i++) {
      const userId = userIds[i];
      // Random subset of businesses
      const numCheckins = Math.floor(Math.random() * 10) + 5;
      const shuffled = [...businessIds].sort(() => Math.random() - 0.5);

      for (let j = 0; j < numCheckins; j++) {
        const businessId = shuffled[j % shuffled.length];
        const biz = sampleBusinesses[j % sampleBusinesses.length];
        const daysAgo = Math.floor(Math.random() * 30);
        const points = Math.random() > 0.5 ? 10 : 5;

        await client.query(
          `INSERT INTO check_ins (id, user_id, business_id, location, points_earned, created_at)
           VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, NOW() - INTERVAL '${daysAgo} days')
           ON CONFLICT DO NOTHING`,
          [uuidv4(), userId, businessId, biz.lng, biz.lat, points]
        );
        checkinCount++;
      }
    }
    console.log(`✅ Created ${checkinCount} sample check-ins`);

    // Create sample promotions
    console.log('Creating sample promotions...');
    const promotionBusinesses = businessIds.slice(0, 5);
    for (const bizId of promotionBusinesses) {
      await client.query(
        `INSERT INTO promotions (id, business_id, title, description, bonus_points, start_time, end_time, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '7 days', NOW())
         ON CONFLICT DO NOTHING`,
        [uuidv4(), bizId, 'Happy Hour Bonus', 'Earn extra points during happy hour!', 10]
      );
    }
    console.log(`✅ Created ${promotionBusinesses.length} promotions`);

    // Create sample rewards
    console.log('Creating sample rewards...');
    const rewardBusinesses = businessIds.slice(0, 5);
    for (const bizId of rewardBusinesses) {
      await client.query(
        `INSERT INTO rewards (id, business_id, title, description, points_cost, reward_type, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
         ON CONFLICT DO NOTHING`,
        [uuidv4(), bizId, 'Free Coffee', 'Redeem for a free small coffee', 100, 'discount']
      );
    }
    console.log(`✅ Created ${rewardBusinesses.length} rewards`);

    // Award some badges to demo users
    console.log('Awarding sample badges...');
    if (userIds.length > 0 && badgeIds.length > 0) {
      // First user gets first badge
      await client.query(
        `INSERT INTO user_badges (user_id, badge_id, earned_at) VALUES ($1, $2, NOW())
         ON CONFLICT DO NOTHING`,
        [userIds[0], badgeIds[0]]
      );
    }

    console.log('\n✅ Database seeding complete!');
    console.log('\n📝 Demo accounts:');
    console.log('   Email: demo@wandr.app');
    console.log('   Password: password123');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
