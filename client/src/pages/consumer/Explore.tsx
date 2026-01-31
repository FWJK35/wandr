import { useState, useEffect } from 'react';
import { businessesApi } from '../../services/api';
import { useLocation, formatDistance } from '../../hooks/useLocation';
import type { Business } from '../../types';
import Card from '../../components/shared/Card';
import LoadingSpinner from '../../components/shared/LoadingSpinner';

const categoryIcons: Record<string, string> = {
  'Cafe': '☕',
  'Restaurant': '🍽️',
  'Bar': '🍺',
  'Shop': '🛍️',
  'Museum': '🏛️',
  'Gym': '💪',
  'Entertainment': '🎮',
  'Park': '🌳',
};

export default function Explore() {
  const { location } = useLocation();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!location) return;

      setLoading(true);
      try {
        const [businessData, categoryData] = await Promise.all([
          businessesApi.getNearby(
            location.latitude,
            location.longitude,
            5000,
            selectedCategory || undefined
          ),
          businessesApi.getCategories(),
        ]);
        setBusinesses(businessData);
        setCategories(categoryData);
      } catch (err) {
        console.error('Failed to fetch explore data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [location, selectedCategory]);

  return (
    <div className="p-4 space-y-6">
      <h1 className="font-display text-2xl font-bold">Explore</h1>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedCategory === null
              ? 'bg-primary-500 text-white'
              : 'bg-dark-100 text-gray-400 hover:text-white'
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => setSelectedCategory(cat.name)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
              selectedCategory === cat.name
                ? 'bg-primary-500 text-white'
                : 'bg-dark-100 text-gray-400 hover:text-white'
            }`}
          >
            <span>{categoryIcons[cat.name] || '📍'}</span>
            <span>{cat.name}</span>
            <span className="text-xs opacity-60">({cat.count})</span>
          </button>
        ))}
      </div>

      {/* Business list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : businesses.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-400">No places found nearby</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {businesses.map((business) => (
            <Card key={business.id} hoverable className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-dark-200 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">{categoryIcons[business.category] || '📍'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{business.name}</h3>
                  {business.isBoosted && <span className="text-yellow-400">⚡</span>}
                  {business.visited && <span className="text-primary-400">✓</span>}
                </div>
                <p className="text-sm text-gray-400">{business.category}</p>
              </div>
              {business.distance !== undefined && (
                <div className="text-sm text-gray-500">
                  {formatDistance(business.distance)}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
