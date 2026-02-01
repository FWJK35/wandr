import { useState, useEffect } from 'react';
import { businessesApi, checkinsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { calculateDistance, formatDistance } from '../../hooks/useLocation';
import type { Business, GeneratedQuest, PointsBreakdown } from '../../types';
import Button from '../shared/Button';
import LoadingSpinner from '../shared/LoadingSpinner';

interface BusinessPanelProps {
  business: Business;
  userLocation: { latitude: number; longitude: number } | null;
  activeQuest?: GeneratedQuest | null;
  onCheckInComplete?: () => void;
  onClose: () => void;
}

const CHECKIN_RADIUS = 50; // meters

export default function BusinessPanel({ business, userLocation, activeQuest, onCheckInComplete, onClose }: BusinessPanelProps) {
  const { updateUser, user } = useAuth();
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [checkinResult, setCheckinResult] = useState<{
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
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const questSource = checkinResult?.questRedemption
    ? {
        questId: checkinResult.questRedemption.questId,
        businessId: checkinResult.questRedemption.businessId,
        title: checkinResult.questRedemption.title,
        shortPrompt: checkinResult.questRedemption.shortPrompt,
        suggestedPercentOff: checkinResult.questRedemption.suggestedPercentOff,
        endsAt: checkinResult.questRedemption.endsAt,
      }
    : activeQuest
      ? {
          questId: activeQuest.quest_id,
          businessId: activeQuest.business_id,
          title: activeQuest.title,
          shortPrompt: activeQuest.short_prompt,
          suggestedPercentOff: activeQuest.suggested_percent_off,
          endsAt: activeQuest.ends_at,
        }
      : null;
  const questIsLandmark = checkinResult?.questRedemption?.isLandmark
    ?? activeQuest?.is_landmark
    ?? false;
  const questQrUrl = questSource
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
        `quest:${questSource.questId}|business:${questSource.businessId}|title:${questSource.title}`
      )}`
    : null;
  const questQrLargeUrl = questSource
    ? `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(
        `quest:${questSource.questId}|business:${questSource.businessId}|title:${questSource.title}`
      )}`
    : null;

  const distance = userLocation
    ? calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        business.latitude,
        business.longitude
      )
    : null;

  const canCheckIn = distance !== null && distance <= CHECKIN_RADIUS;

  const fetchDetails = async () => {
    try {
      const data = await businessesApi.getById(business.id);
      setDetails(data);
    } catch (err) {
      console.error('Failed to fetch business details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setError(null);
    setCheckinResult(null);
    setShowQrModal(false);
    fetchDetails();
  }, [business.id]);

  const handleCheckIn = async () => {
    if (!userLocation) return;

    setCheckingIn(true);
    setError(null);

    try {
      const result = await checkinsApi.create({
        businessId: business.id,
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      });

      setCheckinResult(result);
      if (user) {
        updateUser({ points: user.points + result.points.total });
      }
      if (result.questRedemption?.questId) {
        try {
          const raw = localStorage.getItem('claimed_generated_quests');
          const parsed = raw ? JSON.parse(raw) : [];
          const next = new Set<string>(Array.isArray(parsed) ? parsed : []);
          next.add(result.questRedemption.questId);
          localStorage.setItem('claimed_generated_quests', JSON.stringify(Array.from(next)));
          const completedRaw = localStorage.getItem('completed_generated_quests');
          const completedParsed = completedRaw ? JSON.parse(completedRaw) : [];
          const completedNext = new Set<string>(Array.isArray(completedParsed) ? completedParsed : []);
          completedNext.add(result.questRedemption.questId);
          localStorage.setItem('completed_generated_quests', JSON.stringify(Array.from(completedNext)));
          window.dispatchEvent(new CustomEvent('wandr:quest-claim'));
          window.dispatchEvent(new CustomEvent('wandr:quests-refresh'));
        } catch (storageErr) {
          console.warn('Failed to persist claimed quest id', storageErr);
        }
      }
      await fetchDetails();
      window.dispatchEvent(new CustomEvent('wandr:feed-refresh'));
      onCheckInComplete?.();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Check-in failed');
    } finally {
      setCheckingIn(false);
    }
  };

  const handleUndoCheckIn = async () => {
    setUndoing(true);
    setError(null);
    try {
      const result = await checkinsApi.undo({ businessId: business.id });
      if (user) {
        updateUser({ points: Math.max(user.points - result.pointsRemoved, 0) });
      }
      setCheckinResult(null);
      await fetchDetails();
      onCheckInComplete?.();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Undo check-in failed');
    } finally {
      setUndoing(false);
    }
  };

  return (
    <div className="absolute bottom-20 left-0 right-0 z-10">
      <div className="mx-4 glass rounded-2xl overflow-hidden animate-slide-up">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
        >
          <span className="text-gray-300">×</span>
        </button>

        {/* Content */}
        <div className="p-4">
          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center">
              <span className="text-2xl">
                {business.category === 'Cafe' && '☕'}
                {business.category === 'Restaurant' && '🍽️'}
                {business.category === 'Bar' && '🍺'}
                {business.category === 'Shop' && '🛍️'}
                {business.category === 'Museum' && '🏛️'}
                {business.category === 'Gym' && '💪'}
                {business.category === 'Entertainment' && '🎮'}
                {business.category === 'Park' && '🌳'}
                {!['Cafe', 'Restaurant', 'Bar', 'Shop', 'Museum', 'Gym', 'Entertainment', 'Park'].includes(business.category) && '🏢'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white truncate">{business.name}</h3>
                {business.isBoosted && (
                  <span className="text-yellow-400 text-sm">⚡</span>
                )}
              </div>
              <p className="text-sm text-gray-400">{business.category}</p>
              {distance !== null && (
                <p className="text-sm text-gray-500">{formatDistance(distance)} away</p>
              )}
            </div>
          </div>

          {/* Check-in result */}
          {checkinResult && (
            <div className="mb-4 p-3 bg-primary-500/20 rounded-xl border border-primary-500/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🎉</span>
                <span className="font-semibold text-primary-400">Check-in Successful!</span>
              </div>
              {checkinResult.zoneCapture && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-green-400">🏆</span>
                    <span className="text-green-300">Zone Captured: {checkinResult.zoneCapture.zoneName}</span>
                  </div>
                </div>
              )}
              {checkinResult.neighborhoodCapture && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-emerald-400">🏅</span>
                    <span className="text-emerald-300">Neighborhood Complete: {checkinResult.neighborhoodCapture.neighborhoodName}!</span>
                  </div>
                </div>
              )}
              {checkinResult.questCompletions && checkinResult.questCompletions.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
                  {checkinResult.questCompletions.map((quest) => (
                    <div key={quest.questId} className="flex items-center gap-2 text-sm">
                      <span className="text-purple-300">🎯</span>
                      <span className="text-purple-200">
                        Quest Complete{quest.questTitle ? `: ${quest.questTitle}` : ''} (+{quest.pointsEarned})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {questSource && questQrUrl && !questIsLandmark && (
            <div className="mb-4 p-3 bg-purple-500/10 rounded-xl border border-purple-500/30">
              <div className="text-sm font-semibold text-purple-200 mb-1">Quest QR</div>
              <div className="text-xs text-gray-400 mb-3">{questSource.shortPrompt}</div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowQrModal(true)}
                  className="rounded-lg bg-white p-1 hover:scale-105 transition-transform"
                >
                  <img src={questQrUrl} alt="Quest QR" className="w-20 h-20 rounded-md" />
                </button>
                <div className="text-xs text-amber-200">
                  Redeem coupon: {questSource.suggestedPercentOff ?? 0}%
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 rounded-xl border border-red-500/30">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Details */}
          {loading ? (
            <div className="flex justify-center py-4">
              <LoadingSpinner />
            </div>
          ) : details && (
            <>
              {/* Visited indicator only */}
              {details.visited && (
                <div className="mb-4 text-sm text-primary-400">
                  ✓ Visited
                </div>
              )}

              {/* Active promotions */}
              {details.promotions?.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-gray-500 uppercase mb-2">Active Promotions</p>
                  {details.promotions.map((promo: any) => (
                    <div key={promo.id} className="bg-yellow-500/10 rounded-lg px-3 py-2 border border-yellow-500/20">
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-400">⚡</span>
                        <span className="text-sm font-medium">{promo.title}</span>
                        <span className="ml-auto text-xs text-yellow-400">+{promo.bonusPoints} pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Check-in actions */}
          {!checkinResult ? (
            <div className="space-y-2">
              <Button
                onClick={handleCheckIn}
                loading={checkingIn}
                disabled={!canCheckIn}
                className="w-full"
                size="lg"
              >
                {!canCheckIn
                  ? `Get within ${CHECKIN_RADIUS}m to check in`
                  : 'Check In'
                }
              </Button>
              {details?.visited && (
                <Button
                  onClick={handleUndoCheckIn}
                  loading={undoing}
                  variant="ghost"
                  className="w-full"
                >
                  Undo Last Check-in
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                onClick={handleUndoCheckIn}
                loading={undoing}
                variant="ghost"
                className="w-full"
              >
                Undo Check-in
              </Button>
              <Button onClick={onClose} variant="secondary" className="w-full" size="lg">
                Close
              </Button>
            </div>
          )}
        </div>
      </div>

      {showQrModal && questQrLargeUrl && questSource && !questIsLandmark && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="glass rounded-2xl p-4 w-80 relative">
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-white"
              onClick={() => setShowQrModal(false)}
            >
              ✕
            </button>
            <h3 className="text-lg font-semibold mb-2">{questSource.title}</h3>
            <p className="text-xs text-gray-400 mb-3">{questSource.shortPrompt}</p>
            <div className="flex justify-center mb-3">
              <img src={questQrLargeUrl} alt="Quest QR Large" className="w-56 h-56 rounded-lg bg-white p-2" />
            </div>
            <div className="text-xs text-amber-200 mb-2">
              Redeem coupon: {questSource.suggestedPercentOff ?? 0}%
            </div>
            <Button className="w-full" onClick={() => setShowQrModal(false)}>Close</Button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
