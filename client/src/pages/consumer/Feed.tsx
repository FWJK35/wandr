import { useState, useEffect, useCallback } from 'react';
import { socialApi } from '../../services/api';
import type { FeedItem } from '../../types';
import Card from '../../components/shared/Card';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
const genId = () => Math.random().toString(36).slice(2, 10);

type FeedType = 'all' | 'friends' | 'following';

export default function Feed() {
  const [feedType, setFeedType] = useState<FeedType>('all');
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const data = await socialApi.getFeed(feedType);
      const live = data ?? [];
      const combined = [...live, ...generateMockFeed(feedType)];
      setItems(combined);
    } catch (err) {
      console.error('Failed to fetch feed:', err);
      setItems(generateMockFeed(feedType));
    } finally {
      setLoading(false);
    }
  }, [feedType]);

  useEffect(() => {
    fetchFeed();
  }, [feedType, fetchFeed]);

  useEffect(() => {
    const handleRefresh = () => {
      fetchFeed();
    };
    window.addEventListener('wandr:feed-refresh', handleRefresh);
    return () => window.removeEventListener('wandr:feed-refresh', handleRefresh);
  }, [fetchFeed]);

  async function handleLike(itemId: string) {
    const target = items.find((i) => i.id === itemId);
    if (!target) return;
    const prevLiked = target.userLiked;
    const prevCount = target.likeCount;
    const nextLiked = !prevLiked;
    const isMock = itemId.startsWith('mock-');

    // optimistic update
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              userLiked: nextLiked,
              likeCount: Math.max(0, item.likeCount + (nextLiked ? 1 : -1)),
            }
          : item
      )
    );

    if (isMock) return; // local only

    try {
      const { liked } = await socialApi.likeFeedItem(itemId);
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                userLiked: liked,
                likeCount:
                  liked === nextLiked
                    ? item.likeCount
                    : Math.max(0, prevCount + (liked ? 1 : -1)),
              }
            : item
        )
      );
    } catch (err) {
      console.error('Failed to like:', err);
      // revert
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, userLiked: prevLiked, likeCount: prevCount }
            : item
        )
      );
    }
  }

  const feedTypes: { key: FeedType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'friends', label: 'Friends' },
    { key: 'following', label: 'Following' },
  ];

  return (
    <div className="p-4 space-y-6">
      <h1 className="font-display text-2xl font-bold">Feed</h1>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {feedTypes.map((t) => (
          <button
            key={t.key}
            onClick={() => setFeedType(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              feedType === t.key
                ? 'bg-primary-500 text-white'
                : 'bg-dark-100 text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Feed items */}
      {loading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-400">No activity yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <FeedItemCard key={item.id} item={item} onLike={() => handleLike(item.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function generateMockFeed(feedType: FeedType): FeedItem[] {
  const baseUsers = [
    { id: 'u1', username: 'amy', displayName: 'Amy P.' },
    { id: 'u2', username: 'jordan', displayName: 'Jordan L.' },
    { id: 'u3', username: 'maria', displayName: 'Maria C.' },
    { id: 'u4', username: 'devin', displayName: 'Devin K.' },
  ];

  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString();

  const items: FeedItem[] = [
    {
      id: `mock-${genId()}`,
      user: baseUsers[0],
      type: 'checkin',
      content: { businessName: 'Bolt Coffee', isFirstVisit: false },
      createdAt: hoursAgo(1.1),
      likeCount: 8,
      commentCount: 2,
      userLiked: false,
    },
    {
      id: `mock-${genId()}`,
      user: baseUsers[1],
      type: 'quest_complete',
      content: { pointsEarned: 120 },
      createdAt: hoursAgo(2.4),
      likeCount: 5,
      commentCount: 1,
      userLiked: false,
    },
    {
      id: `mock-${genId()}`,
      user: baseUsers[2],
      type: 'zone_captured',
      content: { zoneName: 'Thayer St' },
      createdAt: hoursAgo(4.5),
      likeCount: 11,
      commentCount: 3,
      userLiked: false,
    },
    {
      id: `mock-${genId()}`,
      user: baseUsers[3],
      type: 'badge_earned',
      content: { badgeName: 'Neighborhood Explorer' },
      createdAt: hoursAgo(6.2),
      likeCount: 3,
      commentCount: 0,
      userLiked: false,
    },
    {
      id: `mock-${genId()}`,
      user: baseUsers[0],
      type: 'checkin',
      content: { businessName: 'Pastiche Fine Desserts', isFirstVisit: true },
      createdAt: hoursAgo(8.7),
      likeCount: 14,
      commentCount: 4,
      userLiked: false,
    },
  ];

  if (feedType === 'friends') return items.slice(0, 3);
  if (feedType === 'following') return items.slice(0, 4);
  return items;
}

interface FeedItemCardProps {
  item: FeedItem;
  onLike: () => void;
}

function FeedItemCard({ item, onLike }: FeedItemCardProps) {
  const getActivityText = () => {
    switch (item.type) {
      case 'checkin':
        return (
          <>
            checked in at <span className="text-white font-medium">{item.content.businessName}</span>
            {item.content.isFirstVisit && (
              <span className="ml-1 text-primary-400">(first visit)</span>
            )}
          </>
        );
      case 'quest_complete':
        return (
          <>
            completed a quest and earned{' '}
            <span className="text-primary-400 font-medium">+{item.content.pointsEarned} pts</span>
          </>
        );
      case 'badge_earned':
        return (
          <>
            earned the badge <span className="text-white font-medium">{item.content.badgeName}</span>
          </>
        );
      case 'zone_captured':
        return (
          <>
            captured <span className="text-white font-medium">{item.content.zoneName}</span>!
          </>
        );
      default:
        return 'shared an update';
    }
  };

  const getIcon = () => {
    switch (item.type) {
      case 'checkin':
        return <Icon name="pin" />;
      case 'quest_complete':
        return <Icon name="target" />;
      case 'badge_earned':
        return <Icon name="trophy" />;
      case 'zone_captured':
        return <Icon name="map" />;
      default:
        return <Icon name="star" />;
    }
  };

  const timeAgo = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <Card>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
          <span className="font-medium text-primary-400">
            {item.user.displayName?.charAt(0) || item.user.username.charAt(0)}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium">{item.user.displayName || item.user.username}</span>
            <span className="text-gray-500">@{item.user.username}</span>
            <span className="text-gray-600">·</span>
            <span className="text-gray-500 text-sm">{timeAgo(item.createdAt)}</span>
          </div>

          <p className="text-gray-400">
            <span className="mr-2 inline-flex">{getIcon()}</span>
            {getActivityText()}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-4 mt-3">
            <button
              onClick={onLike}
              className={`flex items-center gap-1 text-sm ${
                item.userLiked ? 'text-red-400' : 'text-gray-500 hover:text-red-400'
              }`}
            >
              <Icon name={item.userLiked ? 'heartFilled' : 'heart'} />
              <span>{item.likeCount}</span>
            </button>
            <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-400">
              <Icon name="comment" />
              <span>{item.commentCount}</span>
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Icon({ name }: { name: string }) {
  const stroke = 'currentColor';
  switch (name) {
    case 'pin':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M12 21s7-5 7-11a7 7 0 1 0-14 0c0 6 7 11 7 11Z" />
        </svg>
      );
    case 'target':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="2.5" />
          <circle cx="12" cy="12" r="7" />
          <path d="M12 3v2" />
          <path d="M21 12h-2" />
          <path d="M12 19v2" />
          <path d="M5 12H3" />
        </svg>
      );
    case 'trophy':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 4h8v4a4 4 0 0 1-4 4 4 4 0 0 1-4-4V4Z" />
          <path d="M6 4h12" />
          <path d="M7 20h10" />
          <path d="M12 12v3" />
          <path d="M9 21v-4h6v4" />
          <path d="M4 6h2v2a2 2 0 0 1-2-2Z" />
          <path d="M20 6h-2v2a2 2 0 0 0 2-2Z" />
        </svg>
      );
    case 'map':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2Z" />
          <path d="M9 3v16" />
          <path d="M15 5v16" />
        </svg>
      );
    case 'star':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="m12 4.5 2.4 4.9 5.4.8-3.9 3.8.9 5.3-4.8-2.6-4.8 2.6.9-5.3-3.9-3.8 5.4-.8L12 4.5Z" />
        </svg>
      );
    case 'heart':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 4.5a5 5 0 0 0-7 0l-.5.5-.5-.5a5 5 0 0 0-7 7l.5.5L12 20l7.5-7.5.5-.5a5 5 0 0 0 0-7Z" />
        </svg>
      );
    case 'heartFilled':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M12 20 4.5 12.5A5 5 0 0 1 11 5l1 1 1-1a5 5 0 0 1 6.5 7.5L12 20Z" />
        </svg>
      );
    case 'comment':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
        </svg>
      );
    default:
      return null;
  }
}
