import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useParams } from 'react-router-dom';
import api from '../../services/api';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import LoadingSpinner from '../../components/shared/LoadingSpinner';

interface Business {
  id: string;
  name: string;
  category: string;
  isVerified: boolean;
  isBoosted: boolean;
}

export default function BusinessDashboard() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBusinesses();
  }, []);

  async function fetchBusinesses() {
    try {
      const res = await api.get('/business-dashboard/my-businesses');
      setBusinesses(res.data);
    } catch (err) {
      console.error('Failed to fetch businesses:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-300 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (businesses.length === 0) {
    return (
      <div className="min-h-screen bg-dark-300 p-4">
        <div className="max-w-md mx-auto text-center py-12">
          <div className="text-6xl mb-4">🏪</div>
          <h1 className="font-display text-2xl font-bold mb-2">No Businesses Yet</h1>
          <p className="text-gray-400 mb-6">
            Register your business to start attracting customers through Wandr.
          </p>
          <Button>Register Business</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-300">
      <Routes>
        <Route index element={<BusinessList businesses={businesses} />} />
        <Route path=":businessId/*" element={<BusinessDetail />} />
      </Routes>
    </div>
  );
}

function BusinessList({ businesses }: { businesses: Business[] }) {
  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="font-display text-2xl font-bold mb-6">Business Dashboard</h1>

      <div className="space-y-4">
        {businesses.map((biz) => (
          <NavLink key={biz.id} to={`/business/${biz.id}`}>
            <Card hoverable className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center">
                <span className="text-2xl">🏪</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{biz.name}</h3>
                  {biz.isVerified && <span className="text-blue-400">✓</span>}
                  {biz.isBoosted && <span className="text-yellow-400">⚡</span>}
                </div>
                <p className="text-sm text-gray-400">{biz.category}</p>
              </div>
              <span className="text-gray-500">→</span>
            </Card>
          </NavLink>
        ))}
      </div>
    </div>
  );
}

function BusinessDetail() {
  const { businessId } = useParams();
  const [tab, setTab] = useState<'analytics' | 'promotions' | 'challenges' | 'rewards'>('analytics');
  const [analytics, setAnalytics] = useState<any>(null);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [businessId, tab]);

  async function fetchData() {
    if (!businessId) return;

    setLoading(true);
    try {
      if (tab === 'analytics') {
        const res = await api.get(`/business-dashboard/${businessId}/analytics`);
        setAnalytics(res.data);
      } else if (tab === 'promotions') {
        const res = await api.get(`/business-dashboard/${businessId}/promotions`);
        setPromotions(res.data);
      } else if (tab === 'challenges') {
        const res = await api.get(`/business-dashboard/${businessId}/challenges`);
        setChallenges(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }

  const tabs = [
    { key: 'analytics', label: 'Analytics', icon: '📊' },
    { key: 'promotions', label: 'Promotions', icon: '⚡' },
    { key: 'challenges', label: 'Challenges', icon: '🎯' },
    { key: 'rewards', label: 'Rewards', icon: '🎁' },
  ] as const;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <NavLink to="/business" className="text-gray-400 hover:text-white text-sm mb-4 inline-block">
        ← Back to businesses
      </NavLink>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'bg-primary-500 text-white'
                : 'bg-dark-100 text-gray-400 hover:text-white'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          {tab === 'analytics' && analytics && (
            <div className="space-y-6">
              {/* Summary stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card className="text-center">
                  <p className="text-3xl font-bold text-primary-400">{analytics.totalCheckins}</p>
                  <p className="text-sm text-gray-400">Check-ins</p>
                </Card>
                <Card className="text-center">
                  <p className="text-3xl font-bold text-blue-400">{analytics.uniqueVisitors}</p>
                  <p className="text-sm text-gray-400">Unique Visitors</p>
                </Card>
                <Card className="text-center">
                  <p className="text-3xl font-bold text-purple-400">{analytics.repeatVisitors}</p>
                  <p className="text-sm text-gray-400">Repeat Visitors</p>
                </Card>
                <Card className="text-center">
                  <p className="text-3xl font-bold text-yellow-400">
                    {analytics.uniqueVisitors > 0
                      ? ((analytics.repeatVisitors / analytics.uniqueVisitors) * 100).toFixed(0)
                      : 0}%
                  </p>
                  <p className="text-sm text-gray-400">Return Rate</p>
                </Card>
              </div>

              {/* Daily chart placeholder */}
              <Card>
                <h3 className="font-semibold mb-4">Daily Check-ins ({analytics.period})</h3>
                {analytics.dailyCheckins.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No data for this period</p>
                ) : (
                  <div className="flex items-end gap-1 h-32">
                    {analytics.dailyCheckins.map((day: any, i: number) => {
                      const maxCount = Math.max(...analytics.dailyCheckins.map((d: any) => d.count));
                      const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                      return (
                        <div
                          key={i}
                          className="flex-1 bg-primary-500/60 rounded-t"
                          style={{ height: `${height}%` }}
                          title={`${new Date(day.date).toLocaleDateString()}: ${day.count}`}
                        />
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Peak hours */}
              <Card>
                <h3 className="font-semibold mb-4">Peak Hours</h3>
                <div className="flex items-end gap-1 h-24">
                  {Array.from({ length: 24 }, (_, hour) => {
                    const hourData = analytics.hourlyDistribution.find((h: any) => h.hour === hour);
                    const count = hourData?.count || 0;
                    const maxCount = Math.max(...analytics.hourlyDistribution.map((h: any) => h.count), 1);
                    const height = (count / maxCount) * 100;
                    return (
                      <div
                        key={hour}
                        className={`flex-1 rounded-t ${count > 0 ? 'bg-blue-500/60' : 'bg-dark-200'}`}
                        style={{ height: `${Math.max(height, 5)}%` }}
                        title={`${hour}:00 - ${count} check-ins`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>12am</span>
                  <span>6am</span>
                  <span>12pm</span>
                  <span>6pm</span>
                  <span>12am</span>
                </div>
              </Card>
            </div>
          )}

          {tab === 'promotions' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="font-semibold text-lg">Active Promotions</h2>
                <Button size="sm">+ Create</Button>
              </div>

              {promotions.length === 0 ? (
                <Card>
                  <p className="text-gray-400 text-center py-8">
                    No promotions yet. Create one to attract more visitors!
                  </p>
                </Card>
              ) : (
                promotions.map((promo) => (
                  <Card key={promo.id}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{promo.title}</h3>
                          {promo.isActive && (
                            <span className="badge badge-success">Active</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-400">{promo.description}</p>
                        <p className="text-sm text-primary-400 mt-1">
                          +{promo.bonusPoints} bonus points
                        </p>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}

          {tab === 'challenges' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="font-semibold text-lg">Challenges</h2>
                <Button size="sm">+ Create</Button>
              </div>

              {challenges.length === 0 ? (
                <Card>
                  <p className="text-gray-400 text-center py-8">
                    No challenges yet. Create engaging challenges for your visitors!
                  </p>
                </Card>
              ) : (
                challenges.map((challenge) => (
                  <Card key={challenge.id}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{challenge.title}</h3>
                          {challenge.isActive && (
                            <span className="badge badge-success">Active</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-400">{challenge.description}</p>
                        <p className="text-sm mt-1">
                          <span className="text-primary-400">{challenge.pointsReward} pts</span>
                          <span className="text-gray-500 ml-2">{challenge.completions} completions</span>
                        </p>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}

          {tab === 'rewards' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="font-semibold text-lg">Rewards</h2>
                <Button size="sm">+ Create</Button>
              </div>

              <Card>
                <p className="text-gray-400 text-center py-8">
                  Create rewards that customers can redeem with their points!
                </p>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
