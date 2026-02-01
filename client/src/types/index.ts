export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  points: number;
  level: number;
  streakDays: number;
  createdAt: string;
}

export interface Business {
  id: string;
  name: string;
  description?: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  imageUrl?: string;
  isBoosted: boolean;
  distance?: number;
  visited?: boolean;
  phone?: string;
  website?: string;
  hours?: Record<string, string>;
}

export interface CheckIn {
  id: string;
  businessId: string;
  businessName: string;
  businessCategory: string;
  latitude: number;
  longitude: number;
  pointsEarned: number;
  createdAt: string;
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export interface Zone {
  id: string;
  name: string;
  description?: string;
  neighborhoodName?: string | null;
  boundary: GeoJSONPolygon;
  captured: boolean;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  questType: string;
  requirements: QuestRequirements;
  pointsReward: number;
  badgeReward?: Badge;
  progress?: QuestProgress;
  startedAt?: string;
  completedAt?: string;
}

export interface QuestRequirements {
  visitCount?: number;
  uniqueCategories?: number;
  specificBusinesses?: string[];
  zoneCaptures?: number;
}

export interface QuestProgress {
  visitCount?: number;
  categoriesVisited?: string[];
  businessesVisited?: string[];
  zonesCaptured?: number;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  earnedAt?: string;
}

export interface FeedItem {
  id: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  type: 'checkin' | 'quest_complete' | 'badge_earned' | 'zone_captured';
  content: Record<string, any>;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  userLiked: boolean;
}

export interface Comment {
  id: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  content: string;
  createdAt: string;
}

export interface Reward {
  id: string;
  title: string;
  description: string;
  pointsCost: number;
  rewardType: string;
  value?: Record<string, any>;
  business: {
    id: string;
    name: string;
    address?: string;
  };
  imageUrl?: string;
  quantityRemaining?: number;
  expiresAt?: string;
  terms?: string;
}

export interface Redemption {
  id: string;
  redemptionCode: string;
  status: 'pending' | 'used' | 'expired';
  createdAt: string;
  usedAt?: string;
  reward: {
    id: string;
    title: string;
  };
  businessName: string;
}

export interface Promotion {
  id: string;
  title: string;
  description?: string;
  bonusPoints: number;
  discountPercent?: number;
  startTime: string;
  endTime: string;
}

export interface Challenge {
  id: string;
  title: string;
  description?: string;
  challengeType: string;
  pointsReward: number;
  verificationMethod: string;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  points: number;
  level?: number;
  zonesCaptured?: number;
  neighborhoodsCaptured?: number;
}

export interface UserStats {
  checkins: number;
  zonesCaptured: number;
  neighborhoodsCaptured: number;
  badgesEarned: number;
  totalCheckins?: number;
  uniquePlaces?: number;
  totalPoints?: number;
  thisWeek?: number;
}

export interface PointsBreakdown {
  base: number;
  friendBonus: number;
  promotionBonus: number;
  streakBonus: number;
  zoneCaptureBonus?: number;
  neighborhoodBonus?: number;
  total: number;
}
