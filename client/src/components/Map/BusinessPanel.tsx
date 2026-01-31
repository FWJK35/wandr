import { useState, useEffect } from 'react';
import { businessesApi, checkinsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { calculateDistance, formatDistance } from '../../hooks/useLocation';
import type { Business, PointsBreakdown } from '../../types';
import Button from '../shared/Button';
import LoadingSpinner from '../shared/LoadingSpinner';

interface BusinessPanelProps {
  business: Business;
  userLocation: { latitude: number; longitude: number } | null;
  onClose: () => void;
}

const CHECKIN_RADIUS = 50; // meters

export default function BusinessPanel({ business, userLocation, onClose }: BusinessPanelProps) {
  const { updateUser } = useAuth();
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkinResult, setCheckinResult] = useState<{
    points: PointsBreakdown;
    isFirstVisit: boolean;
    zoneProgress?: any;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const distance = userLocation
    ? calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        business.latitude,
        business.longitude
      )
    : null;

  const canCheckIn = distance !== null && distance <= CHECKIN_RADIUS;

  useEffect(() => {
    async function fetchDetails() {
      try {
        const data = await businessesApi.getById(business.id);
        setDetails(data);
      } catch (err) {
        console.error('Failed to fetch business details:', err);
      } finally {
        setLoading(false);
      }
    }
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
      updateUser({ points: (prev: number) => prev + result.points.total } as any);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Check-in failed');
    } finally {
      setCheckingIn(false);
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
                {!['Cafe', 'Restaurant', 'Bar', 'Shop', 'Museum', 'Gym', 'Entertainment', 'Park'].includes(business.category) && '📍'}
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
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-400">Base:</span>
                  <span className="ml-1 text-white">+{checkinResult.points.base}</span>
                </div>
                {checkinResult.points.promotionBonus > 0 && (
                  <div>
                    <span className="text-gray-400">Promo:</span>
                    <span className="ml-1 text-yellow-400">+{checkinResult.points.promotionBonus}</span>
                  </div>
                )}
                {checkinResult.points.streakBonus > 0 && (
                  <div>
                    <span className="text-gray-400">Streak:</span>
                    <span className="ml-1 text-orange-400">+{checkinResult.points.streakBonus}</span>
                  </div>
                )}
                <div className="col-span-2 pt-2 border-t border-white/10">
                  <span className="font-semibold text-primary-400">Total: +{checkinResult.points.total} points</span>
                </div>
              </div>
              {checkinResult.zoneProgress && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <p className="text-sm">
                    <span className="text-gray-400">{checkinResult.zoneProgress.zoneName}:</span>
                    <span className="ml-1 text-white">
                      {checkinResult.zoneProgress.visited}/{checkinResult.zoneProgress.total} visited
                    </span>
                    {checkinResult.zoneProgress.captured && (
                      <span className="ml-2 text-primary-400">🏆 Captured!</span>
                    )}
                  </p>
                </div>
              )}
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
              {/* Stats */}
              <div className="flex gap-4 mb-4 text-sm">
                <div>
                  <span className="text-gray-400">Visitors:</span>
                  <span className="ml-1 text-white">{details.stats?.uniqueVisitors || 0}</span>
                </div>
                <div>
                  <span className="text-gray-400">Check-ins:</span>
                  <span className="ml-1 text-white">{details.stats?.totalCheckins || 0}</span>
                </div>
                {details.visited && (
                  <div className="text-primary-400">
                    <span>✓ Visited</span>
                  </div>
                )}
              </div>

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

          {/* Check-in button */}
          {!checkinResult && (
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
          )}

          {checkinResult && (
            <Button onClick={onClose} variant="secondary" className="w-full" size="lg">
              Close
            </Button>
          )}
        </div>
      </div>

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
