import axios from 'axios';
import type {
  User,
  Business,
  CheckIn,
  Zone,
  Quest,
  Badge,
  Landmark,
  FeedItem,
  Reward,
  Redemption,
  LeaderboardEntry,
  UserStats,
  PointsBreakdown,
  Comment
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wandr_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('wandr_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  register: async (data: { email: string; username: string; password: string }) => {
    const res = await api.post<{ user: User; token: string }>('/auth/register', data);
    return res.data;
  },

  login: async (data: { email: string; password: string }) => {
    const res = await api.post<{ user: User; token: string }>('/auth/login', data);
    return res.data;
  },

  logout: async () => {
    await api.post('/auth/logout');
  },

  getMe: async () => {
    const res = await api.get<User>('/auth/me');
    return res.data;
  },
};

// Landmarks API
export const landmarksApi = {
  getAll: async (bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => {
    const params = new URLSearchParams();
    if (bounds) {
      params.append('minLat', bounds.minLat.toString());
      params.append('maxLat', bounds.maxLat.toString());
      params.append('minLng', bounds.minLng.toString());
      params.append('maxLng', bounds.maxLng.toString());
    }
    const query = params.toString();
    const res = await api.get<Landmark[]>(`/landmarks${query ? `?${query}` : ''}`);
    return res.data;
  },
};

// Users API
export const usersApi = {
  getUser: async (id: string) => {
    const res = await api.get<User & { stats: UserStats }>(`/users/${id}`);
    return res.data;
  },

  getBadges: async (userId: string) => {
    const res = await api.get<Badge[]>(`/users/${userId}/badges`);
    return res.data;
  },

  getLeaderboard: async (type: 'all-time' | 'weekly' | 'monthly' = 'all-time') => {
    const res = await api.get<LeaderboardEntry[]>(`/users/leaderboard/all?type=${type}`);
    return res.data;
  },

  updateProfile: async (data: { displayName?: string; avatarUrl?: string }) => {
    const res = await api.put('/users/me', data);
    return res.data;
  },
};

// Businesses API
export const businessesApi = {
  getNearby: async (lat: number, lng: number, radius = 1000, category?: string) => {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      radius: radius.toString(),
    });
    if (category) params.append('category', category);
    const res = await api.get<Business[]>(`/businesses?${params}`);
    return res.data;
  },

  getById: async (id: string) => {
    const res = await api.get<Business & {
      stats: { totalCheckins: number; uniqueVisitors: number };
      promotions: any[];
      challenges: any[];
      visited: boolean;
      lastVisit?: string;
    }>(`/businesses/${id}`);
    return res.data;
  },

  getCategories: async () => {
    const res = await api.get<{ name: string; count: number }[]>('/businesses/meta/categories');
    return res.data;
  },

  updatePosition: async (id: string, latitude: number, longitude: number) => {
    const res = await api.patch<{ id: string; latitude: number; longitude: number }>(
      `/businesses/${id}/position`,
      { latitude, longitude }
    );
    return res.data;
  },

  create: async (data: { name: string; category: string; address: string; latitude: number; longitude: number; description?: string }) => {
    const res = await api.post<{ id: string }>(`/businesses`, data);
    return res.data;
  },

  update: async (id: string, data: { name?: string; category?: string; address?: string; description?: string }) => {
    const res = await api.patch<{ id: string }>(`/businesses/${id}`, data);
    return res.data;
  },

  delete: async (id: string) => {
    const res = await api.delete<{ id: string }>(`/businesses/${id}`);
    return res.data;
  },
};

// Check-ins API
export const checkinsApi = {
  create: async (data: { businessId: string; latitude: number; longitude: number; friendIds?: string[] }) => {
    const res = await api.post<{
      id: string;
      businessId: string;
      businessName: string;
      points: PointsBreakdown;
      isFirstVisit: boolean;
      zoneCapture?: {
        zoneId: string;
        zoneName: string;
        neighborhoodName?: string;
      };
      neighborhoodCapture?: {
        neighborhoodName: string;
      };
      questCompletions?: {
        questId: string;
        questTitle?: string;
        pointsEarned: number;
        badgeEarned?: string | null;
      }[];
      questRedemption?: {
        questId: string;
        businessId: string;
        title: string;
        shortPrompt: string;
        suggestedPercentOff?: number | null;
        endsAt: string;
        isLandmark?: boolean;
      } | null;
      zoneProgress?: {
        zoneId: string;
        zoneName: string;
        visited: number;
        total: number;
        captureThreshold: number;
        captured: boolean;
      };
    }>('/checkins', data);
    return res.data;
  },

  undo: async (data: { businessId: string }) => {
    const res = await api.post<{
      removedCheckinId: string;
      pointsRemoved: number;
      zoneCaptureRemoved: boolean;
      neighborhoodCaptureRemoved: boolean;
    }>('/checkins/undo', data);
    return res.data;
  },

  getHistory: async (limit = 20, offset = 0) => {
    const res = await api.get<CheckIn[]>(`/checkins/history?limit=${limit}&offset=${offset}`);
    return res.data;
  },

  getStats: async () => {
    const res = await api.get<UserStats>('/checkins/stats');
    return res.data;
  },
};

// Zones API
export const zonesApi = {
  getInViewport: async (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => {
    const params = new URLSearchParams({
      minLat: bounds.minLat.toString(),
      maxLat: bounds.maxLat.toString(),
      minLng: bounds.minLng.toString(),
      maxLng: bounds.maxLng.toString(),
    });
    const res = await api.get<Zone[]>(`/zones?${params}`);
    return res.data;
  },

  getById: async (id: string) => {
    const res = await api.get<Zone & {
      businesses: Business[];
    }>(`/zones/${id}`);
    return res.data;
  },

  getLeaderboard: async () => {
    const res = await api.get<LeaderboardEntry[]>('/zones/stats/leaderboard');
    return res.data;
  },

  updateBoundary: async (id: string, coordinates: [number, number][]) => {
    const res = await api.patch<{ id: string; neighborhoodName?: string | null }>(`/zones/${id}/boundary`, { coordinates });
    return res.data;
  },

  updateZoneMeta: async (id: string, data: { name?: string; description?: string }) => {
    const res = await api.patch<{ id: string }>(`/zones/${id}`, data);
    return res.data;
  },

  createZone: async (data: { name: string; description?: string; coordinates: [number, number][] }) => {
    const res = await api.post<{ id: string; neighborhoodName?: string | null }>(`/zones`, data);
    return res.data;
  },

  deleteZone: async (id: string) => {
    const res = await api.delete<{ id: string }>(`/zones/${id}`);
    return res.data;
  },

};

// Quests API
export const questsApi = {
  getAvailable: async () => {
    const res = await api.get<Quest[]>('/quests');
    return res.data;
  },

  getActive: async () => {
    const res = await api.get<Quest[]>('/quests/user-active');
    return res.data;
  },

  getCompleted: async () => {
    const res = await api.get<Quest[]>('/quests/completed');
    return res.data;
  },

  start: async (questId: string) => {
    const res = await api.post<{ id: string; questId: string; progress: any }>(`/quests/${questId}/start`);
    return res.data;
  },

  checkProgress: async (userQuestId: string) => {
    const res = await api.post<{
      completed: boolean;
      progress: any;
      pointsEarned?: number;
      badgeEarned?: string;
    }>(`/quests/${userQuestId}/check`);
    return res.data;
  },

  generate: async (data: { userLat: number; userLng: number; weatherTag?: string; windowMinutes?: number }) => {
    const res = await api.post(`/quests/generate`, data);
    return res.data;
  },

  generateLandmarks: async (data: { userLat: number; userLng: number; weatherTag?: string; windowMinutes?: number }) => {
    const res = await api.post(`/quests/generate-landmarks`, data);
    return res.data;
  },

  getGeneratedActive: async () => {
    const res = await api.get<{
      quest_id: string;
      business_id: string;
      type: string;
      title: string;
      short_prompt: string;
      points: number;
      suggested_percent_off?: number | null;
      safety_note?: string | null;
      starts_at: string;
      ends_at: string;
      is_landmark?: boolean;
    }[]>(`/quests/active`);
    return res.data;
  },
};

// Social API
export const socialApi = {
  getFeed: async (type: 'all' | 'friends' | 'following' = 'all', limit = 20, offset = 0) => {
    const res = await api.get<FeedItem[]>(`/social/feed?type=${type}&limit=${limit}&offset=${offset}`);
    return res.data;
  },

  likeFeedItem: async (feedItemId: string) => {
    const res = await api.post<{ liked: boolean }>(`/social/feed/${feedItemId}/like`);
    return res.data;
  },

  getComments: async (feedItemId: string) => {
    const res = await api.get<Comment[]>(`/social/feed/${feedItemId}/comments`);
    return res.data;
  },

  addComment: async (feedItemId: string, content: string) => {
    const res = await api.post<{ id: string; content: string }>(`/social/feed/${feedItemId}/comment`, { content });
    return res.data;
  },

  getFriends: async () => {
    const res = await api.get<any[]>('/social/friends');
    return res.data;
  },

  getPendingRequests: async () => {
    const res = await api.get<any[]>('/social/friends/pending');
    return res.data;
  },

  sendFriendRequest: async (userId: string) => {
    const res = await api.post('/social/friends/request', { userId });
    return res.data;
  },

  acceptFriendRequest: async (friendshipId: string) => {
    const res = await api.post(`/social/friends/${friendshipId}/accept`);
    return res.data;
  },

  removeFriend: async (friendshipId: string) => {
    const res = await api.delete(`/social/friends/${friendshipId}`);
    return res.data;
  },

  follow: async (userId: string) => {
    const res = await api.post('/social/follow', { userId });
    return res.data;
  },

  unfollow: async (userId: string) => {
    const res = await api.delete(`/social/follow/${userId}`);
    return res.data;
  },

  getFollowers: async () => {
    const res = await api.get<any[]>('/social/followers');
    return res.data;
  },

  getFollowing: async () => {
    const res = await api.get<any[]>('/social/following');
    return res.data;
  },
};

// Rewards API
export const rewardsApi = {
  getAvailable: async (lat?: number, lng?: number, radius = 5000) => {
    const params = new URLSearchParams();
    if (lat !== undefined && lng !== undefined) {
      params.append('lat', lat.toString());
      params.append('lng', lng.toString());
      params.append('radius', radius.toString());
    }
    const res = await api.get<Reward[]>(`/rewards?${params}`);
    return res.data;
  },

  getById: async (id: string) => {
    const res = await api.get<Reward>(`/rewards/${id}`);
    return res.data;
  },

  redeem: async (rewardId: string) => {
    const res = await api.post<{
      redemptionId: string;
      redemptionCode: string;
      reward: { id: string; title: string };
      pointsSpent: number;
    }>(`/rewards/${rewardId}/redeem`);
    return res.data;
  },

  getRedemptions: async (status?: 'pending' | 'used' | 'expired') => {
    const params = status ? `?status=${status}` : '';
    const res = await api.get<Redemption[]>(`/rewards/user/redemptions${params}`);
    return res.data;
  },
};

// Payments API (mock Stripe)
export const paymentsApi = {
  createCheckout: async (params: { businessId?: string; amountCents: number; description?: string; enforceOwner?: boolean }) => {
    const res = await api.post<{
      sessionId: string;
      providerSessionId: string;
      checkoutUrl: string;
      clientSecret: string;
    }>('/payments/checkout', params);
    return res.data;
  },
  completeMock: async (sessionId: string, boostBusiness?: boolean) => {
    const res = await api.post<{ status: string; receiptUrl: string }>('/payments/mock-complete', {
      sessionId,
      boostBusiness
    });
    return res.data;
  },
  history: async () => {
    const res = await api.get<any[]>('/payments/history');
    return res.data;
  }
};

export default api;
