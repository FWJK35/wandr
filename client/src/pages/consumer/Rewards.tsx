import { useState, useEffect } from 'react';
import { rewardsApi } from '../../services/api';
import { useLocation } from '../../hooks/useLocation';
import { useAuth } from '../../context/AuthContext';
import type { Reward, Redemption } from '../../types';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import Modal from '../../components/shared/Modal';
import LoadingSpinner from '../../components/shared/LoadingSpinner';

type Tab = 'available' | 'my-rewards';

export default function Rewards() {
  const { location } = useLocation();
  const { user, updateUser } = useAuth();
  const [tab, setTab] = useState<Tab>('available');
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemResult, setRedeemResult] = useState<{
    redemptionCode: string;
    pointsSpent: number;
  } | null>(null);

  useEffect(() => {
    fetchData();
  }, [location, tab]);

  async function fetchData() {
    setLoading(true);
    try {
      if (tab === 'available') {
        const data = await rewardsApi.getAvailable(
          location?.latitude,
          location?.longitude
        );
        setRewards(data);
      } else {
        const data = await rewardsApi.getRedemptions();
        setRedemptions(data);
      }
    } catch (err) {
      console.error('Failed to fetch rewards:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRedeem(reward: Reward) {
    if (!user) return;

    setRedeeming(true);
    try {
      const result = await rewardsApi.redeem(reward.id);
      setRedeemResult({
        redemptionCode: result.redemptionCode,
        pointsSpent: result.pointsSpent,
      });
      if (user) {
        updateUser({ points: Math.max(user.points - result.pointsSpent, 0) });
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to redeem');
    } finally {
      setRedeeming(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'available', label: 'Available' },
    { key: 'my-rewards', label: 'My Rewards' },
  ];

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Rewards</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-primary-500 text-white'
                : 'bg-dark-100 text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : tab === 'available' ? (
        rewards.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400">No rewards available nearby</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {rewards.map((reward) => (
              <RewardCard
                key={reward.id}
                reward={reward}
                userPoints={user?.points || 0}
                onClick={() => setSelectedReward(reward)}
              />
            ))}
          </div>
        )
      ) : (
        redemptions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400">No rewards redeemed yet</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {redemptions.map((redemption) => (
              <RedemptionCard key={redemption.id} redemption={redemption} />
            ))}
          </div>
        )
      )}

      {/* Reward detail modal */}
      <Modal
        isOpen={!!selectedReward && !redeemResult}
        onClose={() => setSelectedReward(null)}
        title={selectedReward?.title}
      >
        {selectedReward && (
          <div className="space-y-4">
            <p className="text-gray-400">{selectedReward.description}</p>

            <div className="flex items-center justify-between py-3 border-y border-white/5">
              <span className="text-gray-400">Cost</span>
              <span className="text-primary-400 font-semibold">Free</span>
            </div>

            <div>
              <p className="text-sm text-gray-400">Redeem at</p>
              <p className="font-medium">{selectedReward.business.name}</p>
              {selectedReward.business.address && (
                <p className="text-sm text-gray-500">{selectedReward.business.address}</p>
              )}
            </div>

            {selectedReward.terms && (
              <div className="text-xs text-gray-500">
                <p className="font-medium mb-1">Terms & Conditions</p>
                <p>{selectedReward.terms}</p>
              </div>
            )}

            <Button
              onClick={() => handleRedeem(selectedReward)}
              loading={redeeming}
              className="w-full"
              size="lg"
            >
              Redeem Reward
            </Button>
          </div>
        )}
      </Modal>

      {/* Redemption success modal */}
      <Modal
        isOpen={!!redeemResult}
        onClose={() => {
          setRedeemResult(null);
          setSelectedReward(null);
          fetchData();
        }}
        title="Reward Redeemed!"
      >
        {redeemResult && (
          <div className="text-center space-y-4">
            <div className="text-6xl">🎉</div>
            <p className="text-gray-400">Show this code at {selectedReward?.business.name}</p>

            <div className="bg-dark-100 rounded-xl p-6 border-2 border-dashed border-primary-500/30">
              <p className="text-3xl font-mono font-bold tracking-wider">
                {redeemResult.redemptionCode}
              </p>
            </div>

            <p className="text-sm text-gray-500">
              -{redeemResult.pointsSpent} points from your balance
            </p>

            <Button
              onClick={() => {
                setRedeemResult(null);
                setSelectedReward(null);
                setTab('my-rewards');
                fetchData();
              }}
              className="w-full"
            >
              View My Rewards
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function RewardCard({
  reward,
  userPoints,
  onClick,
}: {
  reward: Reward;
  userPoints: number;
  onClick: () => void;
}) {
  const canAfford = userPoints >= reward.pointsCost;

  return (
    <Card hoverable onClick={onClick}>
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-xl bg-primary-500/20 flex items-center justify-center flex-shrink-0">
          <span className="text-3xl">🎁</span>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">{reward.title}</h3>
          <p className="text-sm text-gray-400">{reward.business.name}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`font-semibold ${canAfford ? 'text-primary-400' : 'text-gray-500'}`}>
              {reward.pointsCost} pts
            </span>
            {reward.quantityRemaining !== null && (
              <span className="text-xs text-gray-500">
                {reward.quantityRemaining} left
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function RedemptionCard({ redemption }: { redemption: Redemption }) {
  return (
    <Card>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-dark-200 flex items-center justify-center flex-shrink-0">
          <span className="text-2xl">
            {redemption.status === 'pending' ? '🎫' : redemption.status === 'used' ? '✓' : '⏰'}
          </span>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">{redemption.reward.title}</h3>
          <p className="text-sm text-gray-400">{redemption.businessName}</p>

          {redemption.status === 'pending' && (
            <div className="mt-2 bg-dark-200 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-400 mb-1">Redemption Code</p>
              <p className="font-mono font-bold">{redemption.redemptionCode}</p>
            </div>
          )}

          <div className="mt-2 flex items-center gap-2">
            <span
              className={`badge ${
                redemption.status === 'pending'
                  ? 'badge-warning'
                  : redemption.status === 'used'
                  ? 'badge-success'
                  : 'badge-info'
              }`}
            >
              {redemption.status}
            </span>
            <span className="text-xs text-gray-500">
              {new Date(redemption.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
