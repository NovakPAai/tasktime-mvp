/**
 * BulkStatusWizardModal — workflow-aware bulk status change wizard.
 *
 * Step 1: Fetches available transitions for all selected issues,
 *         aggregates unique target statuses, shows how many issues
 *         can transition to each.
 * Step 2: Confirms the list of issues that will/won't change,
 *         then executes transitions in parallel.
 */
import { useEffect, useState } from 'react';
import { Modal, Spin, Button, Space, message } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { workflowEngineApi, type BatchTransitionsItem, type WorkflowStatus } from '../../api/workflow-engine';
import { useThemeStore } from '../../store/theme.store';

// ─── Tokens ──────────────────────────────────────────────────────────────────

const DARK_C = {
  bg:         '#0F1320',
  bgSection:  '#080B14',
  border:     '#1E2640',
  t1:         '#E2E8F8',
  t2:         '#C9D1D9',
  t3:         '#8B949E',
  t4:         '#3D4D6B',
  acc:        '#4F6EF7',
  green:      '#4ADE80',
  red:        '#F87171',
  statusCard: '#131929',
  statusCardHover: '#1A2540',
  statusCardSelected: '#1E2F5A',
  statusCardSelectedBorder: '#4F6EF7',
};
const LIGHT_C = {
  bg:         '#FFFFFF',
  bgSection:  '#F9FAFB',
  border:     '#E5E7EB',
  t1:         '#111827',
  t2:         '#374151',
  t3:         '#6B7280',
  t4:         '#9CA3AF',
  acc:        '#4F6EF7',
  green:      '#16A34A',
  red:        '#DC2626',
  statusCard: '#F9FAFB',
  statusCardHover: '#F3F4F6',
  statusCardSelected: '#EEF2FF',
  statusCardSelectedBorder: '#4F6EF7',
};

const F = { sans: '"Inter", system-ui, sans-serif' };

// ─── Aggregated target status ─────────────────────────────────────────────────

interface TargetStatus {
  status: WorkflowStatus;
  /** issues that CAN transition to this status and the transition id to use */
  eligible: { item: BatchTransitionsItem; transitionId: string }[];
  /** issues that CANNOT transition to this status from their current state */
  ineligible: BatchTransitionsItem[];
}

function aggregateTargets(data: BatchTransitionsItem[]): TargetStatus[] {
  const map = new Map<string, TargetStatus>();

  for (const item of data) {
    // Collect all reachable toStatuses for this issue
    const seen = new Set<string>();
    for (const t of item.transitions) {
      if (seen.has(t.toStatus.id)) continue;
      seen.add(t.toStatus.id);
      if (!map.has(t.toStatus.id)) {
        map.set(t.toStatus.id, { status: t.toStatus, eligible: [], ineligible: [] });
      }
      map.get(t.toStatus.id)!.eligible.push({ item, transitionId: t.id });
    }
  }

  // Fill in ineligible for each target status
  for (const [, target] of map) {
    const eligibleIds = new Set(target.eligible.map(e => e.item.issueId));
    for (const item of data) {
      if (!eligibleIds.has(item.issueId)) {
        target.ineligible.push(item);
      }
    }
  }

  return [...map.values()].sort((a, b) => a.status.name.localeCompare(b.status.name));
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  issueIds: string[];
  onSuccess: () => void;
  onCancel: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BulkStatusWizardModal({ open, issueIds, onSuccess, onCancel }: Props) {
  const { mode } = useThemeStore();
  const C = mode === 'light' ? LIGHT_C : DARK_C;

  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [targets, setTargets] = useState<TargetStatus[]>([]);
  const [selected, setSelected] = useState<TargetStatus | null>(null);

  // Reset when opened
  useEffect(() => {
    if (!open) return;
    setStep('pick');
    setSelected(null);
    setTargets([]);
    setLoading(true);
    workflowEngineApi.getBatchTransitions(issueIds)
      .then(items => {
        setTargets(aggregateTargets(items));
      })
      .catch(() => message.error('Не удалось загрузить доступные переходы'))
      .finally(() => setLoading(false));
  }, [open, issueIds]);

  const handlePickStatus = (target: TargetStatus) => {
    setSelected(target);
    setStep('confirm');
  };

  const handleApply = async () => {
    if (!selected) return;
    setApplying(true);
    let successCount = 0;
    let failCount = 0;
    await Promise.allSettled(
      selected.eligible.map(async ({ item, transitionId }) => {
        try {
          await workflowEngineApi.executeTransition(item.issueId, { transitionId });
          successCount++;
        } catch {
          failCount++;
        }
      })
    );
    setApplying(false);
    if (failCount === 0) {
      message.success(`Статус изменён для ${successCount} задач`);
    } else {
      message.warning(`Изменено: ${successCount}, ошибок: ${failCount}`);
    }
    onSuccess();
  };

  // ─── Render helpers ─────────────────────────────────────────

  const renderStatusDot = (color: string) => (
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
  );

  const renderStep1 = () => {
    if (loading) return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spin />
      </div>
    );

    if (targets.length === 0) return (
      <div style={{ textAlign: 'center', padding: 32, color: C.t3, fontFamily: F.sans, fontSize: 13 }}>
        Нет доступных переходов для выбранных задач
      </div>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontFamily: F.sans, fontSize: 13, color: C.t3, margin: '0 0 12px' }}>
          Выбрано задач: <strong style={{ color: C.t1 }}>{issueIds.length}</strong>.
          Выберите целевой статус:
        </p>
        {targets.map(target => (
          <button
            key={target.status.id}
            onClick={() => handlePickStatus(target)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: C.statusCard,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: '10px 14px',
              cursor: target.eligible.length === 0 ? 'not-allowed' : 'pointer',
              opacity: target.eligible.length === 0 ? 0.4 : 1,
              textAlign: 'left',
              width: '100%',
              transition: 'background 0.15s',
            }}
            disabled={target.eligible.length === 0}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {renderStatusDot(target.status.color)}
              <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: C.t1 }}>
                {target.status.name}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: F.sans, fontSize: 11, color: C.green }}>
                {target.eligible.length} перейдут
              </span>
              {target.ineligible.length > 0 && (
                <span style={{ fontFamily: F.sans, fontSize: 11, color: C.t4 }}>
                  {target.ineligible.length} пропустят
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  };

  const renderStep2 = () => {
    if (!selected) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontFamily: F.sans, fontSize: 13, color: C.t3 }}>Целевой статус:</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {renderStatusDot(selected.status.color)}
            <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: C.t1 }}>
              {selected.status.name}
            </span>
          </span>
        </div>

        {/* Eligible */}
        {selected.eligible.length > 0 && (
          <div>
            <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: C.green, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircleOutlined />
              Изменятся ({selected.eligible.length}):
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
              {selected.eligible.map(({ item }) => (
                <div key={item.issueId} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: C.bgSection, borderRadius: 6, padding: '5px 10px',
                }}>
                  <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: C.acc, flexShrink: 0 }}>
                    {item.issueKey}
                  </span>
                  {item.currentStatus && (
                    <>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {renderStatusDot(item.currentStatus.color)}
                        <span style={{ fontFamily: F.sans, fontSize: 11, color: C.t3 }}>{item.currentStatus.name}</span>
                      </span>
                      <span style={{ fontFamily: F.sans, fontSize: 11, color: C.t4 }}>→</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {renderStatusDot(selected.status.color)}
                        <span style={{ fontFamily: F.sans, fontSize: 11, color: C.t1 }}>{selected.status.name}</span>
                      </span>
                    </>
                  )}
                  <span style={{ fontFamily: F.sans, fontSize: 11, color: C.t2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {item.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ineligible */}
        {selected.ineligible.length > 0 && (
          <div>
            <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: C.t4, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CloseCircleOutlined />
              Будут пропущены ({selected.ineligible.length}):
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
              {selected.ineligible.map(item => (
                <div key={item.issueId} style={{
                  display: 'flex', alignItems: 'center', gap: 8, opacity: 0.5,
                  background: C.bgSection, borderRadius: 6, padding: '5px 10px',
                }}>
                  <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: C.acc, flexShrink: 0 }}>
                    {item.issueKey}
                  </span>
                  {item.currentStatus && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {renderStatusDot(item.currentStatus.color)}
                      <span style={{ fontFamily: F.sans, fontSize: 11, color: C.t3 }}>{item.currentStatus.name}</span>
                    </span>
                  )}
                  <span style={{ fontFamily: F.sans, fontSize: 11, color: C.t2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {item.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Footer ──────────────────────────────────────────────────

  const footer = step === 'pick' ? (
    <Button onClick={onCancel} style={{ fontFamily: F.sans }}>Отмена</Button>
  ) : (
    <Space>
      <Button onClick={() => setStep('pick')} style={{ fontFamily: F.sans }}>Назад</Button>
      <Button onClick={onCancel} style={{ fontFamily: F.sans }}>Отмена</Button>
      <Button
        type="primary"
        loading={applying}
        disabled={!selected || selected.eligible.length === 0}
        onClick={handleApply}
        style={{ fontFamily: F.sans }}
      >
        Применить к {selected?.eligible.length ?? 0} задачам
      </Button>
    </Space>
  );

  return (
    <Modal
      open={open}
      title={
        <span style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 600, color: C.t1 }}>
          {step === 'pick' ? 'Изменить статус задач' : 'Подтверждение изменения статуса'}
        </span>
      }
      onCancel={onCancel}
      footer={footer}
      width={560}
      styles={{ body: { background: C.bg, padding: '20px 24px' }, header: { background: C.bg }, footer: { background: C.bg } }}
    >
      {step === 'pick' ? renderStep1() : renderStep2()}
    </Modal>
  );
}
