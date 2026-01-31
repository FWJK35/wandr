import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usersApi, checkinsApi } from '../../services/api';
import type { Badge, UserStats, LeaderboardEntry } from '../../types';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import LoadingSpinner from '../../components/shared/LoadingSpinner';

export default function Profile() {
  const { userId } = useParams();
  const { user: currentUser, logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const isOwnProfile = !userId || userId === currentUser?.id;
  const targetUserId = userId || currentUser?.id;

  useEffect(() => {
    async function fetchData() {
      if (!targetUserId) return;

      setLoading(true);
      try {
        const [profileData, badgeData, leaderboardData] = await Promise.all([
          usersApi.getUser(targetUserId),
          usersApi.getBadges(targetUserId),
          usersApi.getLeaderboard('all-time'),
        ]);

        setProfile(profileData);
        setBadges(badgeData);
        setStats(profileData.stats);
        setLeaderboard(leaderboardData);

        // Get detailed stats if own profile
        if (isOwnProfile) {
          const checkinStats = await checkinsApi.getStats();
          setStats({ ...profileData.stats, ...checkinStats });
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [targetUserId, isOwnProfile]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-4 text-center">
        <p className="text-gray-400">User not found</p>
      </div>
    );
  }

  const userRank = leaderboard.findIndex((e) => e.id === targetUserId) + 1;

  return (
    <div className="p-4 space-y-6">
      {/* Profile header */}
      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-primary-500/20 flex items-center justify-center mx-auto mb-3">
          <span className="text-3xl font-bold text-primary-400">
            {profile.displayName?.charAt(0) || profile.username.charAt(0)}
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold">{profile.displayName}</h1>
        <p className="text-gray-400">@{profile.username}</p>

        {/* Level badge */}
        <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-dark-100 rounded-full">
          <span className="text-lg">⭐</span>
          <span className="font-semibold">Level {profile.level}</span>
          <span className="text-primary-400">{profile.points} pts</span>
        </div>

        {userRank > 0 && userRank <= 100 && (
          <p className="text-sm text-gray-400 mt-2">
            Ranked #{userRank} globally
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="📍" label="Check-ins" value={stats?.totalCheckins || stats?.checkins || 0} />
        <StatCard icon="🗺️" label="Places" value={stats?.uniquePlaces || 0} />
        <StatCard icon="🏆" label="Zones" value={stats?.zonesCaptured || 0} />
        <StatCard icon="🎖️" label="Badges" value={stats?.badgesEarned || badges.length} />
      </div>

      {/* Streak */}
      {isOwnProfile && profile.streakDays > 0 && (
        <Card>
          <div className="flex items-center gap-4">
            <div className="text-4xl">🔥</div>
            <div>
              <p className="font-semibold text-lg">{profile.streakDays} Day Streak</p>
              <p className="text-sm text-gray-400">Keep exploring to maintain it!</p>
            </div>
          </div>
        </Card>
      )}

      {/* Badges */}
      <div>
        <h2 className="font-semibold text-lg mb-3">Badges</h2>
        {badges.length === 0 ? (
          <Card>
            <p className="text-gray-400 text-center py-4">No badges earned yet</p>
          </Card>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
            {badges.map((badge) => (
              <div
                key={badge.id}
                className="aspect-square bg-dark-100 rounded-xl flex flex-col items-center justify-center p-2 border border-white/5"
                title={badge.description}
              >
                <span className="text-2xl mb-1">{badge.iconUrl}</span>
                <span className="text-xs text-gray-400 text-center truncate w-full">
                  {badge.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Leaderboard preview */}
      <div>
        <h2 className="font-semibold text-lg mb-3">Top Explorers</h2>
        <Card>
          <div className="space-y-3">
            {leaderboard.slice(0, 5).map((entry) => (
              <div
                key={entry.id}
                className={`flex items-center gap-3 ${
                  entry.id === targetUserId ? 'text-primary-400' : ''
                }`}
              >
                <span className="w-6 text-center font-semibold">
                  {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
                </span>
                <div className="w-8 h-8 rounded-full bg-dark-200 flex items-center justify-center">
                  <span className="text-sm">{entry.displayName?.charAt(0)}</span>
                </div>
                <div className="flex-1">
                  <p className="font-medium">{entry.displayName}</p>
                </div>
                <div className="text-sm">
                  <span className="text-primary-400">{entry.points}</span>
                  <span className="text-gray-500"> pts</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Logout button */}
      {isOwnProfile && (
        <Button onClick={logout} variant="secondary" className="w-full">
          Sign Out
        </Button>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <Card className="text-center">
      <span className="text-2xl mb-1 block">{icon}</span>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </Card>
  );
}
