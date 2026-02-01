import { query } from '../db/index.js';

export function initializeQuestProgress(requirements: any): any {
  const progress: any = {};

  if (requirements.visitCount) {
    progress.visitCount = 0;
  }
  if (requirements.uniqueCategories) {
    progress.categoriesVisited = [];
  }
  if (requirements.specificBusinesses) {
    progress.businessesVisited = [];
  }
  if (requirements.zoneCaptures) {
    progress.zonesCaptured = 0;
  }

  return progress;
}

export async function calculateQuestProgress(userId: string, requirements: any, currentProgress: any): Promise<any> {
  const progress = { ...currentProgress };

  if (requirements.visitCount) {
    const [result] = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM check_ins WHERE user_id = $1',
      [userId]
    );
    progress.visitCount = parseInt(result?.count || '0');
  }

  if (requirements.uniqueCategories) {
    const categories = await query<{ category: string }>(
      `SELECT DISTINCT b.category
       FROM check_ins c
       JOIN businesses b ON b.id = c.business_id
       WHERE c.user_id = $1`,
      [userId]
    );
    progress.categoriesVisited = categories.map(c => c.category);
  }

  if (requirements.specificBusinesses) {
    const visited = await query<{ business_id: string }>(
      `SELECT DISTINCT business_id FROM check_ins
       WHERE user_id = $1 AND business_id = ANY($2)`,
      [userId, requirements.specificBusinesses]
    );
    progress.businessesVisited = visited.map(v => v.business_id);
  }

  if (requirements.zoneCaptures) {
    const [result] = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM zone_progress WHERE user_id = $1 AND captured = true',
      [userId]
    );
    progress.zonesCaptured = parseInt(result?.count || '0');
  }

  return progress;
}

export function checkQuestComplete(requirements: any, progress: any): boolean {
  if (requirements.visitCount && progress.visitCount < requirements.visitCount) {
    return false;
  }
  if (requirements.uniqueCategories && progress.categoriesVisited.length < requirements.uniqueCategories) {
    return false;
  }
  if (requirements.specificBusinesses && progress.businessesVisited.length < requirements.specificBusinesses.length) {
    return false;
  }
  if (requirements.zoneCaptures && progress.zonesCaptured < requirements.zoneCaptures) {
    return false;
  }
  return true;
}
