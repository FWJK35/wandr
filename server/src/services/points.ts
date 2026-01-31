export const POINTS = {
  NEW_LOCATION: 10,
  REPEAT_VISIT: 5,
  FRIEND_BONUS: 5,
  STREAK_MULTIPLIER: 5,
  ZONE_CAPTURE: 50,
  CHALLENGE_MIN: 15,
  CHALLENGE_MAX: 50,
  SIDEQUEST_MIN: 25,
  SIDEQUEST_MAX: 100
};

interface PointsCalculation {
  isFirstVisit: boolean;
  friendCount?: number;
  promotionBonus?: number;
  streakDays?: number;
}

interface PointsBreakdown {
  base: number;
  friendBonus: number;
  promotionBonus: number;
  streakBonus: number;
  total: number;
}

export function calculatePoints(params: PointsCalculation): PointsBreakdown {
  const {
    isFirstVisit,
    friendCount = 0,
    promotionBonus = 0,
    streakDays = 0
  } = params;

  const base = isFirstVisit ? POINTS.NEW_LOCATION : POINTS.REPEAT_VISIT;
  const friendBonus = friendCount > 0 ? POINTS.FRIEND_BONUS * Math.min(friendCount, 5) : 0;
  const streakBonus = streakDays > 0 ? POINTS.STREAK_MULTIPLIER * Math.min(streakDays, 30) : 0;

  return {
    base,
    friendBonus,
    promotionBonus,
    streakBonus,
    total: base + friendBonus + promotionBonus + streakBonus
  };
}

export function calculateLevel(totalPoints: number): number {
  // Simple level formula: sqrt(points / 100)
  return Math.floor(Math.sqrt(totalPoints / 100)) + 1;
}

export function pointsToNextLevel(currentPoints: number): number {
  const currentLevel = calculateLevel(currentPoints);
  const nextLevelPoints = Math.pow(currentLevel, 2) * 100;
  return nextLevelPoints - currentPoints;
}
