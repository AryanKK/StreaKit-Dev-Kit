import { useCallback, useEffect, useMemo, useState } from 'react';
import { StreaKit, StreakInstance, type StreakStatus } from '@streakit/core';
import { LocalStorageAdapter } from '@streakit/core/adapters';

const STREAK_ID = 'sdk-demo-daily-checkin';
const MILESTONES = [3, 7, 14];

function formatDate(value: Date | null): string {
  if (!value) return 'No activity yet';
  return value.toLocaleString();
}

export default function App() {
  const engine = useMemo(
    () =>
      new StreaKit({
        storage: new LocalStorageAdapter({ prefix: 'streakit-dev-kit:' }),
        defaultTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        atRiskThresholdHours: 8
      }),
    []
  );

  const [status, setStatus] = useState<StreakStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ensureStreak = useCallback(async (): Promise<StreakInstance> => {
    const existing = await engine.getStreak(STREAK_ID);
    if (existing) return existing;

    return engine.createStreak({
      id: STREAK_ID,
      userId: 'public-demo-user',
      frequency: 'daily',
      milestones: MILESTONES,
      targetCount: 14,
      tags: ['demo', 'sdk']
    });
  }, [engine]);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const streak = await ensureStreak();
      setStatus(await streak.status());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load streak status.');
    } finally {
      setLoading(false);
    }
  }, [ensureStreak]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const runAction = useCallback(
    async (action: (streak: StreakInstance) => Promise<void>) => {
      setWorking(true);
      setError(null);

      try {
        const streak = await ensureStreak();
        await action(streak);
        setStatus(await streak.status());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed.');
      } finally {
        setWorking(false);
      }
    },
    [ensureStreak]
  );

  const count = status?.count ?? 0;
  const progress = Math.max(0, Math.min(100, Math.round((status?.progressToNext ?? 0) * 100)));
  const lastMilestone = MILESTONES[MILESTONES.length - 1];

  return (
    <main className="shell">
      <section className="hero">
        <p className="kicker">StreaKit Dev Playground</p>
        <h1>SDK integration you can run in under a minute</h1>
        <p>
          This demo uses <code>@streakit/core</code> with a browser storage adapter.
          Use it as your starter implementation for developer onboarding.
        </p>
      </section>

      <section className="panel status-panel">
        <div className="status-grid">
          <div>
            <p className="label">Current streak</p>
            <p className="value">{count} days</p>
          </div>
          <div>
            <p className="label">Longest streak</p>
            <p className="value">{status?.longestCount ?? 0} days</p>
          </div>
          <div>
            <p className="label">Score</p>
            <p className="value">{status?.score ?? 0}</p>
          </div>
          <div>
            <p className="label">Next milestone</p>
            <p className="value">{status?.nextMilestone ?? lastMilestone}</p>
          </div>
        </div>

        <div className="progress-wrap">
          <div className="progress-meta">
            <span>Progress to next milestone</span>
            <strong>{progress}%</strong>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </section>

      <section className="panel controls">
        <button disabled={loading || working} onClick={() => void runAction((s) => s.record({ source: 'demo-ui' }).then(() => undefined))}>
          Record Activity
        </button>
        <button disabled={loading || working || status?.isFrozen} onClick={() => void runAction((s) => s.freeze({ maxDays: 2 }))}>
          Freeze (2 days)
        </button>
        <button disabled={loading || working || !status?.isFrozen} onClick={() => void runAction((s) => s.unfreeze())}>
          Unfreeze
        </button>
        <button className="secondary" disabled={loading || working} onClick={() => void runAction((s) => s.reset())}>
          Reset
        </button>
      </section>

      <section className="panel details">
        <p><strong>State:</strong> {status?.isFrozen ? 'Frozen' : status?.isBroken ? 'Broken' : status?.isActive ? 'Active' : 'Unknown'}</p>
        <p><strong>Last activity:</strong> {formatDate(status?.lastActivity ?? null)}</p>
        <p><strong>At risk:</strong> {status?.isAtRisk ? 'Yes' : 'No'}</p>
        <p><strong>Multiplier:</strong> {status?.multiplier ?? 1}x</p>
        <p><strong>Target progress:</strong> {Math.round((status?.targetProgress ?? 0) * 100)}%</p>
      </section>

      <section className="panel milestone-track">
        <h2>Milestone track</h2>
        <div className="milestones">
          {MILESTONES.map((milestone) => {
            const reached = count >= milestone;
            return (
              <div className={`milestone ${reached ? 'reached' : ''}`} key={milestone}>
                <span>{milestone}</span>
                <small>{reached ? 'Reached' : 'Pending'}</small>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel code-panel">
        <h2>Core setup snippet</h2>
        <pre>
          <code>{`import { StreaKit } from '@streakit/core';
import { LocalStorageAdapter } from '@streakit/core/adapters';

const engine = new StreaKit({
  storage: new LocalStorageAdapter({ prefix: 'my-app:' })
});

const streak = await engine.createStreak({
  id: 'daily-checkin',
  frequency: 'daily',
  milestones: [3, 7, 14]
});`}</code>
        </pre>
      </section>

      {loading ? <p className="note">Loading streak state...</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
