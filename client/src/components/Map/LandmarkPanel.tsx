import { useState } from 'react';
import { calculateDistance, formatDistance } from '../../hooks/useLocation';
import { checkinsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { Landmark, PointsBreakdown } from '../../types';
import Button from '../shared/Button';

interface LandmarkPanelProps {
  landmark: Landmark;
  userLocation: { latitude: number; longitude: number } | null;
  onClose: () => void;
}

const CHECKIN_RADIUS = 50; // meters

export default function LandmarkPanel({ landmark, userLocation, onClose }: LandmarkPanelProps) {
  const { updateUser, user } = useAuth();
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkinResult, setCheckinResult] = useState<{
    points: PointsBreakdown;
    isFirstVisit: boolean;
    questRedemption?: {
      questId: string;
    } | null;
  } | null>(null);
  const distance = userLocation
    ? calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        landmark.latitude,
        landmark.longitude
      )
    : null;
  const canCheckIn = distance !== null && distance <= CHECKIN_RADIUS;

  const handleCheckIn = async () => {
    if (!userLocation) return;
    setCheckingIn(true);
    setError(null);
    try {
      const result = await checkinsApi.create({
        businessId: landmark.id,
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
      window.dispatchEvent(new CustomEvent('wandr:feed-refresh'));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Check-in failed');
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <div className="absolute bottom-20 left-0 right-0 z-10">
      <div className="mx-4 glass rounded-2xl overflow-hidden animate-slide-up">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
        >
          <span className="text-gray-300">x</span>
        </button>

        <div className="p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <span className="text-2xl">📍</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white truncate">{landmark.name}</h3>
              <p className="text-sm text-gray-400">{landmark.category}</p>
              {distance !== null && (
                <p className="text-sm text-gray-500">{formatDistance(distance)} away</p>
              )}
            </div>
          </div>

          {landmark.description && (
            <p className="text-sm text-gray-300">{landmark.description}</p>
          )}

          {checkinResult && (
            <div className="mt-4 p-3 bg-primary-500/20 rounded-xl border border-primary-500/30 text-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🎉</span>
                <span className="font-semibold text-primary-400">Check-in Successful!</span>
              </div>
              <div className="text-gray-300">
                +{checkinResult.points.total} points
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-500/20 rounded-xl border border-red-500/30">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {!checkinResult && (
            <div className="mt-4">
              <Button
                onClick={handleCheckIn}
                loading={checkingIn}
                disabled={!canCheckIn}
                className="w-full"
                size="lg"
              >
                {!canCheckIn
                  ? `Get within ${CHECKIN_RADIUS}m to check in`
                  : 'Check In'}
              </Button>
            </div>
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
