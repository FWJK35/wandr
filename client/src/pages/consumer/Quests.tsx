import { useState, useEffect } from 'react';
import { questsApi } from '../../services/api';
import type { Quest } from '../../types';
import Card, { CardHeader } from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import LoadingSpinner from '../../components/shared/LoadingSpinner';

type Tab = 'available' | 'active' | 'completed';

export default function Quests() {
  const [tab, setTab] = useState<Tab>('available');
  const [available, setAvailable] = useState<Quest[]>([]);
  const [active, setActive] = useState<Quest[]>([]);
  const [completed, setCompleted] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingQuest, setStartingQuest] = useState<string | null>(null);

  useEffect(() => {
    fetchQuests();
  }, []);

  async function fetchQuests() {
    setLoading(true);
    try {
      const [availableData, activeData, completedData] = await Promise.all([
        questsApi.getAvailable(),
        questsApi.getActive(),
        questsApi.getCompleted(),
      ]);
      setAvailable(availableData);
      setActive(activeData);
      setCompleted(completedData);
    } catch (err) {
      console.error('Failed to fetch quests:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleStartQuest(questId: string) {
    setStartingQuest(questId);
    try {
      await questsApi.start(questId);
      await fetchQuests();
      setTab('active');
    } catch (err) {
      console.error('Failed to start quest:', err);
    } finally {
      setStartingQuest(null);
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'available', label: 'Available', count: available.length },
    { key: 'active', label: 'Active', count: active.length },
    { key: 'completed', label: 'Completed', count: completed.length },
  ];

  return (
    <div className="p-4 space-y-6">
      <h1 className="font-display text-2xl font-bold">Quests</h1>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/5 pb-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-dark-100 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
            <span className="ml-2 text-xs opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="space-y-4">
          {tab === 'available' && (
            <>
              {available.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No quests available right now</p>
              ) : (
                available.map((quest) => (
                  <QuestCard
                    key={quest.id}
                    quest={quest}
                    onStart={() => handleStartQuest(quest.id)}
                    loading={startingQuest === quest.id}
                  />
                ))
              )}
            </>
          )}

          {tab === 'active' && (
            <>
              {active.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No active quests. Start one!</p>
              ) : (
                active.map((quest) => (
                  <QuestCard key={quest.id} quest={quest} showProgress />
                ))
              )}
            </>
          )}

          {tab === 'completed' && (
            <>
              {completed.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No completed quests yet</p>
              ) : (
                completed.map((quest) => (
                  <QuestCard key={quest.id} quest={quest} completed />
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface QuestCardProps {
  quest: Quest;
  onStart?: () => void;
  loading?: boolean;
  showProgress?: boolean;
  completed?: boolean;
}

function QuestCard({ quest, onStart, loading, showProgress, completed }: QuestCardProps) {
  const progress = quest.progress;
  let progressPercent = 0;
  let progressText = '';

  if (showProgress && progress) {
    if (quest.requirements.visitCount && progress.visitCount !== undefined) {
      progressPercent = (progress.visitCount / quest.requirements.visitCount) * 100;
      progressText = `${progress.visitCount}/${quest.requirements.visitCount} visits`;
    } else if (quest.requirements.uniqueCategories && progress.categoriesVisited) {
      progressPercent = (progress.categoriesVisited.length / quest.requirements.uniqueCategories) * 100;
      progressText = `${progress.categoriesVisited.length}/${quest.requirements.uniqueCategories} categories`;
    } else if (quest.requirements.zoneCaptures && progress.zonesCaptured !== undefined) {
      progressPercent = (progress.zonesCaptured / quest.requirements.zoneCaptures) * 100;
      progressText = `${progress.zonesCaptured}/${quest.requirements.zoneCaptures} zones`;
    }
  }

  return (
    <Card>
      <CardHeader
        title={quest.title}
        subtitle={quest.questType}
        icon="🎯"
        action={
          <div className="flex items-center gap-2">
            <span className="text-primary-400 font-semibold">+{quest.pointsReward}</span>
            <span className="text-gray-500 text-sm">pts</span>
          </div>
        }
      />

      <p className="text-sm text-gray-400 mb-4">{quest.description}</p>

      {showProgress && (
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-400">Progress</span>
            <span className="text-white">{progressText}</span>
          </div>
          <div className="h-2 bg-dark-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(progressPercent, 100)}%` }}
            />
          </div>
        </div>
      )}

      {completed && (
        <div className="flex items-center gap-2 text-primary-400 text-sm">
          <span>✓</span>
          <span>Completed</span>
          {quest.completedAt && (
            <span className="text-gray-500">
              {new Date(quest.completedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {quest.badgeReward && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
          <span className="text-lg">{quest.badgeReward.iconUrl}</span>
          <span className="text-sm text-gray-400">
            Unlocks: <span className="text-white">{quest.badgeReward.name}</span>
          </span>
        </div>
      )}

      {onStart && (
        <Button onClick={onStart} loading={loading} className="w-full mt-4">
          Start Quest
        </Button>
      )}
    </Card>
  );
}
