/**
 * PipelineDashboardPage
 * Design source: Paper artboards 6L4-0 (Dark) + 6TZ-0 (Light)
 * Pure inline styles — no CSS classes
 */
import { useState, useEffect, useCallback } from 'react';
import { useThemeStore } from '../store/theme.store';
import { pipelineApi, StagingBatch } from '../api/pipeline';

// ── Design tokens ────────────────────────────────────────────────────────────
const DARK_C = {
  bg:         '#080B14',
  card:       '#0F1320',
  border:     '#21262D',
  text:       '#E2E8F8',
  muted:      '#8B949E',
  acc:        '#4F6EF7',
  accBg:      '#4F6EF71F',
  success:    '#4ADE80',
  error:      '#EF4444',
  warn:       '#F59E0B',
  rowHover:   '#161B22',
};
const LIGHT_C = {
  bg:         '#F6F8FA',
  card:       '#FFFFFF',
  border:     '#D0D7DE',
  text:       '#1F2328',
  muted:      '#656D76',
  acc:        '#4F6EF7',
  accBg:      '#4F6EF71A',
  success:    '#1A7F37',
  error:      '#CF222E',
  warn:       '#9A6700',
  rowHover:   '#F3F4F6',
};

// ── Batch state config ────────────────────────────────────────────────────────
type BatchState = StagingBatch['state'];

interface StateCfg {
  label: string;
  dot: string;
  bg: string;
}

function getStateCfg(state: BatchState, C: typeof DARK_C): StateCfg {
  const map: Record<BatchState, StateCfg> = {
    COLLECTING: { label: 'Сбор',      dot: C.muted,    bg: C.card },
    MERGING:    { label: 'Мёрдж',     dot: C.warn,     bg: C.card },
    DEPLOYING:  { label: 'Деплой',    dot: C.warn,     bg: C.card },
    TESTING:    { label: 'Тестирует', dot: C.acc,      bg: C.card },
    PASSED:     { label: 'ОК',        dot: C.success,  bg: C.card },
    FAILED:     { label: 'Упал',      dot: C.error,    bg: C.card },
    RELEASED:   { label: 'Релиз',     dot: C.success,  bg: C.card },
  };
  return map[state];
}

function getCiColor(status: string, C: typeof DARK_C) {
  if (status === 'SUCCESS') return C.success;
  if (status === 'FAILURE') return C.error;
  if (status === 'RUNNING') return C.acc;
  return C.muted;
}

function getCiLabel(status: string) {
  const map: Record<string, string> = {
    SUCCESS: '✓ CI', FAILURE: '✗ CI', RUNNING: '⟳ CI', PENDING: '— CI', SKIPPED: '· CI',
  };
  return map[status] || status;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} д назад`;
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, subColor, icon, C }: {
  label: string; value: string; sub: string; subColor: string; icon: React.ReactNode; C: typeof DARK_C;
}) {
  return (
    <div style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px', display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, color: C.muted, lineHeight: '14px' }}>{label}</span>
        {icon}
      </div>
      <div style={{ fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 28, fontWeight: 700, color: C.text, lineHeight: '34px' }}>{value}</div>
      <div style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, color: subColor, lineHeight: '14px' }}>{sub}</div>
    </div>
  );
}

// ── Pipeline step ─────────────────────────────────────────────────────────────
function PipelineStep({ label, count, items, active, C }: {
  label: string; count: number; items: string[]; active: boolean; C: typeof DARK_C;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: active ? C.accBg : C.rowHover, borderRadius: '8px 8px 0 0', border: `1px solid ${active ? C.acc : C.border}`, borderBottom: 'none', padding: '6px 10px' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: active ? C.acc : C.muted, flexShrink: 0 }} />
        <span style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: active ? C.acc : C.muted }}>{label}</span>
        <span style={{ fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 12, fontWeight: 700, color: C.text, marginLeft: 2 }}>{count}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingInline: 4 }}>
        {items.map((t, i) => (
          <div key={i} style={{ backgroundColor: C.card, borderLeft: `2px solid ${active ? C.acc : C.border}`, borderRadius: 4, padding: '4px 8px' }}>
            <span style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, color: C.text, lineHeight: '16px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ backgroundColor: C.card, border: `1px dashed ${C.border}`, borderRadius: 4, padding: '8px', textAlign: 'center' }}>
            <span style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, color: C.muted }}>пусто</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Arrow({ C }: { C: typeof DARK_C }) {
  return (
    <div style={{ width: 20, display: 'flex', alignItems: 'flex-start', paddingTop: 10, justifyContent: 'center', flexShrink: 0 }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PipelineDashboardPage() {
  const { mode } = useThemeStore();
  const C = mode === 'light' ? LIGHT_C : DARK_C;

  const [batches, setBatches] = useState<StagingBatch[]>([]);
  const [openPrs, setOpenPrs] = useState<import('../api/pipeline').PrSnapshot[]>([]);
  const [health, setHealth] = useState<{ version: string } | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, h] = await Promise.all([
        pipelineApi.getBatches(),
        pipelineApi.health(),
      ]);
      setBatches(b);
      setHealth(h);
      // getOpenPrs is best-effort: failure does not block the dashboard
      pipelineApi.getOpenPrs().then(setOpenPrs).catch(() => {});
      setError(null);
    } catch {
      setError('Pipeline Service недоступен');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await pipelineApi.syncGitHub();
      setLastSync(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка синхронизации');
    } finally {
      setSyncing(false);
      await load();
    }
  };

  const [stagingDeploying, setStagingDeploying] = useState<string | null>(null);
  const [prodDeploying, setProdDeploying] = useState<string | null>(null);

  const handleTransition = async (batchId: string, state: BatchState) => {
    try {
      await pipelineApi.transitionState(batchId, state);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка перехода');
    }
  };

  const handleDeployStaging = async (batchId: string) => {
    setStagingDeploying(batchId);
    setError(null);
    try {
      await pipelineApi.deployStagingBatch(batchId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка запуска деплоя на стейдж');
    } finally {
      setStagingDeploying(null);
    }
  };

  const handleDeployProd = async (batchId: string) => {
    setProdDeploying(batchId);
    setError(null);
    try {
      await pipelineApi.deployProductionBatch(batchId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка запуска деплоя в прод');
    } finally {
      setProdDeploying(null);
    }
  };

  // Poll every 10s while any staging deploy is active OR a production deploy is RUNNING
  useEffect(() => {
    const allDeploys = batches.flatMap(b => b.deploys);
    const hasActive =
      batches.some(b => b.state === 'DEPLOYING') ||
      allDeploys.some(d => d.env === 'production' && d.status === 'RUNNING');
    if (!hasActive) return;
    const id = setInterval(() => load(), 10_000);
    return () => clearInterval(id);
  }, [batches, load]);

  // Derived stats
  const collectingBatch = batches.find(b => b.state === 'COLLECTING');
  // Priority: TESTING/PASSED > DEPLOYING/MERGING — avoid MERGING shadowing an active staging deploy
  const stagingBatch =
    batches.find(b => ['TESTING', 'PASSED'].includes(b.state)) ??
    batches.find(b => ['DEPLOYING', 'MERGING'].includes(b.state));
  const lastRelease = batches.find(b => b.state === 'RELEASED');
  const allBatchPrs = batches.flatMap(b => b.pullRequests);
  const failedCi = allBatchPrs.filter(p => p.ciStatus === 'FAILURE').length;
  const passCi = allBatchPrs.filter(p => p.ciStatus === 'SUCCESS').length;
  const totalPrs = allBatchPrs.length;

  // Pipeline flow — 5 stages
  const flowReview   = openPrs.map(p => `#${p.prNumber} ${p.prTitle}`).slice(0, 3);
  const flowCi       = allBatchPrs.filter(p => p.ciStatus === 'RUNNING').map(p => p.prTitle).slice(0, 3);
  const flowBatch    = collectingBatch ? collectingBatch.pullRequests.map(p => p.prTitle).slice(0, 3) : [];
  const flowStaging  = stagingBatch ? stagingBatch.pullRequests.map(p => p.prTitle).slice(0, 3) : [];
  const flowProd     = lastRelease ? lastRelease.pullRequests.map(p => p.prTitle).slice(0, 2) : [];

  const displayBatches = batches.slice(0, 8);
  const selected = selectedBatch ? batches.find(b => b.id === selectedBatch) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: C.bg, fontFamily: '"Inter", system-ui, sans-serif' }}>
      <div style={{ flex: '1 1 0', overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, color: C.muted }}>DevOps · CI/CD</span>
            <span style={{ fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: C.text, lineHeight: '32px' }}>Deploy Pipeline</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {lastSync && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 14px' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v6l4 2" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" /><circle cx="7" cy="7" r="6" stroke={C.muted} strokeWidth="1.5" /></svg>
                <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>{timeAgo(lastSync.toISOString())}</span>
              </div>
            )}
            {health && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 14px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: C.success }} />
                <span style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>{health.version.slice(0, 7)}</span>
              </div>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              aria-busy={syncing}
              aria-disabled={syncing}
              style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundImage: 'linear-gradient(135deg, #4B63E3 0%, #3B52D4 100%)', borderRadius: 8, padding: '6px 14px', border: 'none', cursor: syncing ? 'wait' : 'pointer', opacity: syncing ? 0.7 : 1 }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M13 7A6 6 0 101 7" stroke="#FFF" strokeWidth="1.5" strokeLinecap="round" /><path d="M13 3v4h-4" stroke="#FFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#FFF' }}>{syncing ? 'Синхронизация...' : 'Синхронизировать'}</span>
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ backgroundColor: mode === 'light' ? '#FFF0F0' : '#2D1B1B', border: `1px solid ${C.error}`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke={C.error} strokeWidth="1.5" /><path d="M7 4v3M7 9.5h.01" stroke={C.error} strokeWidth="1.5" strokeLinecap="round" /></svg>
            <span style={{ fontSize: 12, color: C.error }}>{error}</span>
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 16 }}>
          <StatCard
            label="В ревью" value={String(openPrs.length)}
            sub={openPrs.length > 0 ? `${openPrs.filter(p => p.ciStatus === 'SUCCESS').length} CI ✓` : 'нет открытых PR'}
            subColor={C.acc} C={C}
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="6" cy="6" r="3" stroke={C.acc} strokeWidth="1.5" /><circle cx="12" cy="12" r="3" stroke={C.acc} strokeWidth="1.5" /><path d="M9 6h2a3 3 0 010 6H9" stroke={C.acc} strokeWidth="1.5" strokeLinecap="round" /></svg>}
          />
          <StatCard
            label="CI пайплайн"
            value={totalPrs > 0 ? `${passCi} / ${totalPrs}` : '—'}
            sub={failedCi > 0 ? `${failedCi} упали` : 'все зелёные'}
            subColor={failedCi > 0 ? C.error : C.success} C={C}
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2v4M9 12v4M2 9h4M12 9h4" stroke={failedCi > 0 ? C.error : C.success} strokeWidth="1.5" strokeLinecap="round" /><circle cx="9" cy="9" r="3" stroke={failedCi > 0 ? C.error : C.success} strokeWidth="1.5" /></svg>}
          />
          <StatCard
            label="Staging"
            value={stagingBatch ? stagingBatch.deploys[0]?.sha?.slice(0, 7) ?? 'DEPLOYING' : '—'}
            sub={stagingBatch ? `${getStateCfg(stagingBatch.state, C).label} · ${timeAgo(stagingBatch.updatedAt)}` : 'нет активного батча'}
            subColor={stagingBatch ? C.acc : C.muted} C={C}
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6" stroke={stagingBatch ? C.success : C.muted} strokeWidth="1.5" /><path d="M7 9l2 2 3-3" stroke={stagingBatch ? C.success : C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          />
          <StatCard
            label="Последний деплой"
            value={lastRelease ? timeAgo(lastRelease.updatedAt) : '—'}
            sub={lastRelease ? `Production · ${lastRelease.pullRequests.length} PRs` : 'нет релизов'}
            subColor={lastRelease ? C.success : C.muted} C={C}
            icon={<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2l3 5h5l-4 4 2 5-6-3-6 3 2-5-4-4h5l3-5z" stroke={C.success} strokeWidth="1.5" fill="none" /></svg>}
          />
        </div>

        {/* Pipeline flow — full lifecycle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: C.text }}>Pipeline Flow</span>
          <div style={{ display: 'flex', gap: 0 }}>
            <PipelineStep label="РЕВЬЮ" count={openPrs.length} items={flowReview} active={openPrs.length > 0} C={C} />
            <Arrow C={C} />
            <PipelineStep label="CI" count={flowCi.length} items={flowCi} active={flowCi.length > 0} C={C} />
            <Arrow C={C} />
            <PipelineStep label="БАТЧ" count={collectingBatch?.pullRequests.length ?? 0} items={flowBatch} active={!!collectingBatch} C={C} />
            <Arrow C={C} />
            <PipelineStep label="STAGING" count={flowStaging.length} items={flowStaging} active={!!stagingBatch} C={C} />
            <Arrow C={C} />
            <PipelineStep label="ПРОД" count={flowProd.length} items={flowProd} active={!!lastRelease} C={C} />
          </div>
        </div>

        {/* Bottom: batch list + detail */}
        <div style={{ display: 'flex', gap: 16, flex: '1 1 0', minHeight: 0 }}>

          {/* Batch list */}
          <div style={{ flex: '1 1 0', backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 13, fontWeight: 600, color: C.text }}>Батчи</span>
              <span style={{ fontSize: 11, color: C.muted }}>{batches.length} всего</span>
            </div>
            <div style={{ overflowY: 'auto', flex: '1 1 0' }}>
              {displayBatches.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>Нет батчей. Нажмите «Синхронизировать».</div>
              )}
              {displayBatches.map(batch => {
                const cfg = getStateCfg(batch.state, C);
                const isSelected = selectedBatch === batch.id;
                return (
                  <div
                    key={batch.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedBatch(isSelected ? null : batch.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedBatch(isSelected ? null : batch.id); } }}
                    style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', backgroundColor: isSelected ? C.accBg : 'transparent', display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: cfg.dot, flexShrink: 0 }} />
                    <div style={{ flex: '1 1 0', minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: C.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{batch.title}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{batch.pullRequests.length} PRs · {timeAgo(batch.updatedAt)}</div>
                    </div>
                    <div style={{ fontSize: 11, color: cfg.dot, fontWeight: 600, flexShrink: 0 }}>{cfg.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Batch detail / deploy timeline */}
          <div style={{ width: 320, backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {selected ? (
              <>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>{selected.title}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{selected.repo} · {selected.pullRequests.length} PRs</div>
                </div>

                {/* PRs list */}
                <div style={{ flex: '1 1 0', overflowY: 'auto', padding: '8px 0' }}>
                  {selected.pullRequests.map(pr => (
                    <div key={pr.id} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: '1 1 0', minWidth: 0 }}>
                        <a href={pr.prUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.acc, textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          #{pr.prNumber} {pr.prTitle}
                        </a>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{pr.author} · {pr.headSha.slice(0, 7)}</div>
                      </div>
                      <span style={{ fontSize: 11, color: getCiColor(pr.ciStatus, C), flexShrink: 0, fontWeight: 600 }}>{getCiLabel(pr.ciStatus)}</span>
                    </div>
                  ))}
                  {selected.pullRequests.length === 0 && (
                    <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: C.muted }}>Нет PRs в батче</div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {['COLLECTING', 'MERGING'].includes(selected.state) && (
                    <ActionBtn label={stagingDeploying === selected.id ? 'Запуск...' : '→ Deploy Staging'} color={C.acc} onClick={() => handleDeployStaging(selected.id)} disabled={stagingDeploying !== null} />
                  )}
                  {selected.state === 'DEPLOYING' && (
                    <span style={{ fontSize: 12, color: C.warn, fontStyle: 'italic' }}>⟳ Деплой в процессе...</span>
                  )}
                  {selected.state === 'TESTING' && (
                    <>
                      <ActionBtn label="✓ Passed" color={C.success} onClick={() => handleTransition(selected.id, 'PASSED')} />
                      <ActionBtn label="✗ Failed" color={C.error} onClick={() => handleTransition(selected.id, 'FAILED')} />
                    </>
                  )}
                  {selected.state === 'PASSED' && (
                    <ActionBtn label={prodDeploying === selected.id ? 'Запуск...' : '🚀 Deploy to Production'} color={C.acc} onClick={() => handleDeployProd(selected.id)} disabled={prodDeploying !== null} />
                  )}
                  {selected.state === 'FAILED' && (
                    <ActionBtn label="↩ Restart" color={C.muted} onClick={() => handleTransition(selected.id, 'COLLECTING')} />
                  )}
                </div>
              </>
            ) : (
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 13, fontWeight: 600, color: C.text }}>Deploy Timeline</span>
                <span style={{ fontSize: 11, color: C.muted }}>Выберите батч для управления</span>
              </div>
            )}
            {!selected && (
              <div style={{ flex: '1 1 0', overflowY: 'auto', padding: '8px 0' }}>
                {batches.flatMap(b => b.deploys).sort((a, z) => new Date(z.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10).map(ev => (
                  <div key={ev.id} style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', marginTop: 4, flexShrink: 0, backgroundColor: ev.status === 'SUCCESS' ? C.success : ev.status === 'FAILURE' ? C.error : C.acc }} />
                    <div style={{ flex: '1 1 0', minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{ev.env === 'production' ? '🚀 Production' : '🔧 Staging'}</div>
                      <div style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace', marginTop: 1 }}>{ev.sha.slice(0, 7)}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: ev.status === 'SUCCESS' ? C.success : ev.status === 'FAILURE' ? C.error : C.acc, fontWeight: 600 }}>{ev.status}</span>
                      <span style={{ fontSize: 10, color: C.muted }}>{timeAgo(ev.createdAt)}</span>
                    </div>
                  </div>
                ))}
                {batches.flatMap(b => b.deploys).length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>История деплоев пуста</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small helper ──────────────────────────────────────────────────────────────
function ActionBtn({ label, color, onClick, disabled }: { label: string; color: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ fontSize: 12, fontWeight: 600, color: '#FFF', backgroundColor: color, border: 'none', borderRadius: 6, padding: '5px 12px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: '"Inter", system-ui, sans-serif' }}
    >
      {label}
    </button>
  );
}
