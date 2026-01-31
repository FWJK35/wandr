import { useState, useEffect } from 'react';
import { socialApi } from '../../services/api';
import type { FeedItem } from '../../types';
import Card from '../../components/shared/Card';
import LoadingSpinner from '../../components/shared/LoadingSpinner';

type FeedType = 'all' | 'friends' | 'following';

export default function Feed() {
  const [feedType, setFeedType] = useState<FeedType>('all');
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeed();
  }, [feedType]);

  async function fetchFeed() {
    setLoading(true);
    try {
      const data = await socialApi.getFeed(feedType);
      setItems(data);
    } catch (err) {
      console.error('Failed to fetch feed:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLike(itemId: string) {
    try {
      const { liked } = await socialApi.likeFeedItem(itemId);
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                userLiked: liked,
                likeCount: liked ? item.likeCount + 1 : item.likeCount - 1,
              }
            : item
        )
      );
    } catch (err) {
      console.error('Failed to like:', err);
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
              <span className="ml-1 text-primary-400">(First visit!)</span>
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
        return 'did something';
    }
  };

  const getIcon = () => {
    switch (item.type) {
      case 'checkin':
        return '📍';
      case 'quest_complete':
        return '🎯';
      case 'badge_earned':
        return '🏆';
      case 'zone_captured':
        return '🗺️';
      default:
        return '✨';
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
            <span className="mr-2">{getIcon()}</span>
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
              <span>{item.userLiked ? '❤️' : '🤍'}</span>
              <span>{item.likeCount}</span>
            </button>
            <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-primary-400">
              <span>💬</span>
              <span>{item.commentCount}</span>
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
