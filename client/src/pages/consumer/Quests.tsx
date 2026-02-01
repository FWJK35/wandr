import { useState, useEffect, useMemo } from 'react';
import { questsApi } from '../../services/api';
import type { Quest, GeneratedQuest } from '../../types';
import Card, { CardHeader } from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { useLocation } from '../../hooks/useLocation';

type Tab = 'available' | 'active' | 'completed';

export default function Quests() {
  const [tab, setTab] = useState<Tab>('available');
  const [available, setAvailable] = useState<Quest[]>([]);
  const [generated, setGenerated] = useState<GeneratedQuest[]>([]);
  const [claimedGenerated, setClaimedGenerated] = useState<GeneratedQuest[]>([]);
  const [active, setActive] = useState<Quest[]>([]);
  const [completed, setCompleted] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingQuest, setStartingQuest] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const { location } = useLocation();
  const [nowTs, setNowTs] = useState<number>(Date.now());
  const [qrQuest, setQrQuest] = useState<GeneratedQuest | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const CLAIMED_KEY = 'claimed_generated_quests';

  const loadClaimedIds = () => {
    try {
      const raw = localStorage.getItem(CLAIMED_KEY);
      if (!raw) return new Set<string>();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Set<string>();
      return new Set<string>(arr);
    } catch {
      return new Set<string>();
    }
  };

  const persistClaimedIds = (ids: Set<string>) => {
    localStorage.setItem(CLAIMED_KEY, JSON.stringify(Array.from(ids)));
  };

  useEffect(() => {
    fetchQuests();
  }, []);

  async function fetchQuests() {
    setLoading(true);
    try {
      const [availableData, activeData, completedData, generatedData] = await Promise.all([
        questsApi.getAvailable(),
        questsApi.getActive(),
        questsApi.getCompleted(),
        questsApi.getGeneratedActive(),
      ]);
      setAvailable(availableData);
      setActive(activeData);
      setCompleted(completedData);
      const claimedIds = loadClaimedIds();
      const stillActive = generatedData.filter(g => g.quest_id && claimedIds.has(g.quest_id));
      const remainingAvailable = generatedData.filter(g => !g.quest_id || !claimedIds.has(g.quest_id));
      const uniqActiveMap = new Map<string, GeneratedQuest>();
      stillActive.forEach(g => {
        if (g.quest_id && !uniqActiveMap.has(g.quest_id)) uniqActiveMap.set(g.quest_id, g);
      });
      const uniqActive = Array.from(uniqActiveMap.values());
      setGenerated(remainingAvailable);
      setClaimedGenerated(uniqActive);
      // prune ids that are no longer returned (expired)
      const newIds = new Set<string>(uniqActive.map(g => g.quest_id));
      persistClaimedIds(newIds);
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

  async function handleGenerateQuests() {
    if (!location) {
      setGenerateMessage('Location not available yet.');
      return;
    }
    setGenerating(true);
    setGenerateMessage(null);
    try {
      const resp = await questsApi.generate({
        userLat: location.latitude,
        userLng: location.longitude,
        windowMinutes: 120,
      });
      setGenerateMessage(`Generated ${resp.quests?.length ?? 0} quests`);
      // Refresh available list after generation
      await fetchQuests();
    } catch (err) {
      console.error('Failed to generate quests:', err);
      setGenerateMessage('Failed to generate quests');
    } finally {
      setGenerating(false);
    }
  }

  function handleClaimGenerated(gq: GeneratedQuest) {
    if (claimingId) return;
    // Avoid duplicates by quest_id or business_id
    if (claimedIdsSet.has(gq.quest_id) || claimedUnique.some(c => c.business_id === gq.business_id)) {
      setTab('active');
      return;
    }
    setClaimingId(gq.quest_id);
    // Prevent duplicates
    setGenerated((prev) => prev.filter((q) => q.quest_id !== gq.quest_id));
    setClaimedGenerated((prev) => {
      const next = [...prev, gq];
      const ids = new Set(next.map((q) => q.quest_id));
      persistClaimedIds(ids);
      return next;
    });
    setTab('active');
    setTimeout(() => setClaimingId(null), 300);
  }

  const claimedUnique = useMemo(() => {
    const m = new Map<string, GeneratedQuest>(); // key by business_id to avoid duplicates of same spot
    claimedGenerated.forEach((q) => {
      if (!q.business_id) return;
      if (!m.has(q.business_id)) m.set(q.business_id, q);
    });
    return Array.from(m.values());
  }, [claimedGenerated]);
  const claimedIdsSet = useMemo(() => new Set(claimedUnique.map(q => q.quest_id)), [claimedUnique]);
  const activeFiltered = useMemo(
    () =>
      active.filter((a: any) => {
        const qid = (a as any).questId ?? a.id;
        return !claimedIdsSet.has(qid);
      }),
    [active, claimedIdsSet]
  );

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'available', label: 'Available', count: available.length + generated.length },
    { key: 'active', label: 'Active', count: activeFiltered.length + claimedUnique.length },
    { key: 'completed', label: 'Completed', count: completed.length },
  ];

  return (
    <div className="p-4 space-y-6">
      <h1 className="font-display text-2xl font-bold">Quests</h1>

      <div className="flex items-center gap-2">
        <Button onClick={handleGenerateQuests} loading={generating}>
          Generate 3 Quests (Gemini)
        </Button>
        {generateMessage && <span className="text-xs text-gray-400">{generateMessage}</span>}
      </div>

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
              {generated.length > 0 && (
                <div className="space-y-3">
                  {generated.map((gq) => (
                    <Card key={gq.quest_id}>
                      <CardHeader
                        title={gq.title}
                        subtitle={undefined}
                        action={
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-primary-400 font-semibold">+{gq.points}</span>
                            <span className="text-gray-500">pts</span>
                          </div>
                        }
                      />
                      <p className="text-sm text-gray-300 mb-2">{gq.short_prompt}</p>
                      <div className="text-xs text-gray-400 mb-3">
                        {renderCountdown(gq.ends_at, nowTs)}
                      </div>
                      {/* Steps intentionally hidden in UI */}
                      {gq.suggested_percent_off !== null && gq.suggested_percent_off !== undefined && (
                        <div className="mt-2 text-xs text-amber-200">
                          Redeem coupon: {gq.suggested_percent_off}%
                        </div>
                      )}
                      <Button className="w-full mt-4" onClick={() => handleClaimGenerated(gq)}>Claim</Button>
                    </Card>
                  ))}
                </div>
              )}

              {available.length === 0 && generated.length === 0 ? (
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
              {claimedUnique.length > 0 && (
                <div className="space-y-3 mb-4">
                  {claimedUnique.map((gq) => (
                    <Card key={gq.quest_id}>
                      <CardHeader
                        title={gq.title}
                        subtitle={undefined}
                        action={
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-primary-400 font-semibold">+{gq.points}</span>
                            <span className="text-gray-500">pts</span>
                          </div>
                        }
                      />
                      <p className="text-sm text-gray-300 mb-2">{gq.short_prompt}</p>
                      <div className="text-xs text-gray-400 mb-2">
                        {renderCountdown(gq.ends_at, nowTs)}
                      </div>
                      <div className="flex justify-between items-center mt-3">
                        <div className="text-xs text-amber-200">
                          Redeem coupon: {gq.suggested_percent_off ?? 0}%
                        </div>
                        <Button size="sm" onClick={() => setQrQuest(gq)} disabled={claimingId !== null}>
                          Show QR
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {activeFiltered.length === 0 && claimedUnique.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No active quests. Start one!</p>
              ) : (
                <>
                  {activeFiltered.map((quest) => (
                    <QuestCard key={quest.id} quest={quest} showProgress />
                  ))}
                </>
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
      {qrQuest && (
        <QRModal quest={qrQuest} onClose={() => setQrQuest(null)} />
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

function renderCountdown(endsAt: string, nowTs: number) {
  const diffMs = new Date(endsAt).getTime() - nowTs;
  if (diffMs <= 0) return <span className="text-red-400">Expired</span>;
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return <span>Expires in {hours}h {remMinutes}m</span>;
  }
  return <span>Expires in {minutes}m {seconds.toString().padStart(2, '0')}s</span>;
}

function QRModal({ quest, onClose }: { quest: GeneratedQuest; onClose: () => void }) {
  const qrData = encodeURIComponent(`quest:${quest.quest_id}|business:${quest.business_id}|title:${quest.title}`);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${qrData}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="glass rounded-2xl p-4 w-80 relative">
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-white"
          onClick={onClose}
        >
          ✕
        </button>
        <h3 className="text-lg font-semibold mb-2">{quest.title}</h3>
        <p className="text-xs text-gray-400 mb-3">{quest.short_prompt}</p>
        <div className="flex justify-center mb-3">
          <img src={qrUrl} alt="Quest QR" className="w-48 h-48 rounded-lg bg-white p-2" />
        </div>
        <div className="text-xs text-gray-300 mb-2">
          Redeem coupon: {quest.suggested_percent_off ?? 0}%
        </div>
        <Button className="w-full" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}
