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

        {userRank > 0 && userRank <= 100 && (
          <p className="text-sm text-gray-400 mt-2">
            Ranked #{userRank} globally
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="pin" label="Check-ins" value={stats?.totalCheckins || stats?.checkins || 0} />
        <StatCard icon="map" label="Places" value={stats?.uniquePlaces || 0} />
        <StatCard icon="trophy" label="Zones" value={stats?.zonesCaptured || 0} />
        <StatCard icon="medal" label="Badges" value={stats?.badgesEarned || badges.length} />
      </div>

      {/* Streak */}
      {isOwnProfile && profile.streakDays > 0 && (
        <Card>
          <div className="flex items-center gap-4">
            <Icon name="streak" large />
            <div>
              <p className="font-semibold text-lg">{profile.streakDays} Day Streak</p>
              <p className="text-sm text-gray-400">Keep exploring to maintain it!</p>
            </div>
          </div>
        </Card>
      )}

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
                  {entry.rank <= 3 ? <MedalIcon rank={entry.rank} /> : entry.rank}
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
      <span className="mb-1 block flex justify-center">
        <Icon name={icon} />
      </span>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </Card>
  );
}

function MedalIcon({ rank }: { rank: number }) {
  const colors = ['#f5c542', '#c0c4cc', '#c08a5d'];
  const fill = colors[rank - 1] || '#9ca3af';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="4" fill={fill} />
      <path d="M8 3h8l-2 4h-4L8 3Z" />
      <path d="M10 13v7l2-1 2 1v-7" />
    </svg>
  );
}

function Icon({ name, large = false }: { name: string; large?: boolean }) {
  const size = large ? 32 : 20;
  const stroke = 'currentColor';
  switch (name) {
    case 'pin':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M12 21s7-5 7-11a7 7 0 1 0-14 0c0 6 7 11 7 11Z" />
        </svg>
      );
    case 'map':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2Z" />
          <path d="M9 3v16" />
          <path d="M15 5v16" />
        </svg>
      );
    case 'trophy':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 4h8v4a4 4 0 0 1-4 4 4 4 0 0 1-4-4V4Z" />
          <path d="M6 4h12" />
          <path d="M7 20h10" />
          <path d="M12 12v3" />
          <path d="M9 21v-4h6v4" />
          <path d="M4 6h2v2a2 2 0 0 1-2-2Z" />
          <path d="M20 6h-2v2a2 2 0 0 0 2-2Z" />
        </svg>
      );
    case 'medal':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="9" r="4" />
          <path d="M8 3h8l-2 4h-4L8 3Z" />
          <path d="M10 13v7l2-1 2 1v-7" />
        </svg>
      );
    case 'level':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 17h16" />
          <path d="M6 17V7h5v10" />
          <path d="M13 17V4h5v13" />
          <path d="M6 10h5" />
          <path d="M13 7h5" />
        </svg>
      );
    case 'streak':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 3c0 5 4 6 4 9 0 2-2 4-2 6a3 3 0 1 0 6 0c0-1-1-2.5-1-4 0-2 3-4 3-8a5 5 0 0 0-5-5c-2 0-5 1.5-5 5Z" />
        </svg>
      );
    default:
      return null;
  }
}
