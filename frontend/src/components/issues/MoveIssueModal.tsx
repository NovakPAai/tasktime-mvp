import { useState, useEffect } from 'react';
import { Modal, Select, Steps, Switch, message, Spin } from 'antd';
import { listProjects } from '../../api/projects';
import { getProjectIssueTypes } from '../../api/issue-type-configs';
import * as issuesApi from '../../api/issues';
import { useThemeStore } from '../../store/theme.store';
import type { Issue, IssueTypeConfig, Project } from '../../types';

const DARK_C = {
  bg: '#0F1320',
  border: '#21262D',
  t1: '#E2E8F8',
  t2: '#C9D1D9',
  t3: '#8B949E',
  t4: '#484F58',
  acc: '#6366F1',
  warnBg: '#1C1A0E',
  warnBorder: '#3D3410',
  warnText: '#D97706',
  infoBg: '#0D1A2E',
  infoBorder: '#1D3557',
  infoText: '#60A5FA',
};
const LIGHT_C = {
  bg: '#FFFFFF',
  border: '#D0D7DE',
  t1: '#1F2328',
  t2: '#1F2328',
  t3: '#656D76',
  t4: '#8C959F',
  acc: '#6366F1',
  warnBg: '#FFFBEB',
  warnBorder: '#FDE68A',
  warnText: '#D97706',
  infoBg: '#EFF6FF',
  infoBorder: '#BFDBFE',
  infoText: '#2563EB',
};

interface ConflictItem {
  key: string;
  label: string;
  detail?: string;
  isChoice?: boolean;
}

interface Props {
  open: boolean;
  issue: Issue;
  onSuccess: (movedIssue: Issue) => void;
  onCancel: () => void;
}

/**
 * Modal wizard that lets the user change an issue's type within the same project or move the issue to a different project (optionally including its child issues).
 *
 * Renders a three-step flow to choose destination project and type, review conflicts (sprint/parent/release/children), and confirm the operation; performs the appropriate backend call and invokes lifecycle callbacks.
 *
 * @param open - Controls whether the modal is visible
 * @param issue - The issue being modified or moved
 * @param onSuccess - Called with the updated issue after a successful change or move
 * @param onCancel - Called when the modal is cancelled or no operation is performed
 * @returns The modal's rendered element
 */
export default function MoveIssueModal({ open, issue, onSuccess, onCancel }: Props) {
  const { mode } = useThemeStore();
  const isDark = mode !== 'light';
  const C = isDark ? DARK_C : LIGHT_C;

  const [step, setStep] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [targetProjectId, setTargetProjectId] = useState<string>(issue.projectId);
  const [targetTypes, setTargetTypes] = useState<IssueTypeConfig[]>([]);
  const [targetTypeId, setTargetTypeId] = useState<string | undefined>(issue.issueTypeConfigId ?? undefined);
  const [moveChildren, setMoveChildren] = useState(false);
  const [loading, setLoading] = useState(false);
  const [typesLoading, setTypesLoading] = useState(false);

  const isSameProject = targetProjectId === issue.projectId;
  const hasChildren = (issue.children?.length ?? 0) > 0;
  const hasSprint = !!issue.sprintId;
  const hasParent = !!issue.parentId;
  const hasRelease = !!(issue as { releaseId?: string }).releaseId;

  useEffect(() => {
    if (open) {
      setStep(0);
      setTargetProjectId(issue.projectId);
      setTargetTypeId(issue.issueTypeConfigId ?? undefined);
      setMoveChildren(false);
      listProjects().then(setProjects).catch(() => {});
    }
  }, [open, issue.projectId, issue.issueTypeConfigId]);

  useEffect(() => {
    if (!targetProjectId) return;
    setTypesLoading(true);
    getProjectIssueTypes(targetProjectId)
      .then((types) => {
        setTargetTypes(types);
        // Keep current type if available in target, else reset
        const available = types.map((t) => t.id);
        if (targetTypeId && !available.includes(targetTypeId)) {
          // Try to find same systemKey
          const currentKey = issue.issueTypeConfig?.systemKey;
          const match = currentKey ? types.find((t) => t.systemKey === currentKey) : null;
          setTargetTypeId(match?.id ?? types[0]?.id);
        }
      })
      .catch(() => {})
      .finally(() => setTypesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetProjectId]);

  const conflicts = buildConflicts();

  function buildConflicts(): ConflictItem[] {
    if (isSameProject) {
      // Type change within same project — hierarchy conflicts resolved by backend with force
      return [
        {
          key: 'type-change',
          label: 'Тип тикета будет изменён',
          detail: 'Если есть конфликты иерархии — связи с родителем/дочерними тикетами будут разорваны автоматически.',
        },
      ];
    }

    const items: ConflictItem[] = [];
    if (hasSprint) items.push({ key: 'sprint', label: 'Спринт будет сброшен', detail: 'Спринт принадлежит исходному проекту.' });
    if (hasParent) items.push({ key: 'parent', label: 'Связь с родительским тикетом будет разорвана', detail: 'Тикеты из разных проектов не могут быть связаны как родитель-потомок.' });
    if (hasRelease) items.push({ key: 'release', label: 'Привязка к релизу будет удалена', detail: 'Релизы принадлежат проекту.' });
    if (hasChildren) {
      items.push({
        key: 'children',
        label: `Дочерние тикеты (${issue.children!.length} шт.)`,
        detail: moveChildren ? 'Будут перенесены вместе.' : 'Связи будут разорваны, тикеты останутся в исходном проекте.',
        isChoice: true,
      });
    }
    return items;
  }

  const isTypeChanged = targetTypeId !== (issue.issueTypeConfigId ?? undefined);
  const canProceed = !!targetProjectId && !!targetTypeId;

  const handleExecute = async () => {
    if (!targetProjectId || !targetTypeId) return;
    setLoading(true);
    try {
      let result: Issue;
      if (isSameProject && isTypeChanged) {
        result = await issuesApi.changeIssueType(issue.id, {
          targetIssueTypeConfigId: targetTypeId,
          force: true,
        });
      } else if (!isSameProject) {
        result = await issuesApi.moveIssue(issue.id, {
          targetProjectId,
          targetIssueTypeConfigId: targetTypeId !== issue.issueTypeConfigId ? targetTypeId : undefined,
          moveChildren,
        });
      } else {
        // Same project, same type — nothing to do
        message.info('Ничего не изменилось');
        onCancel();
        return;
      }
      message.success(isSameProject ? 'Тип тикета изменён' : 'Тикет перенесён');
      onSuccess(result);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      const code = e?.response?.data?.error;
      if (code === 'HIERARCHY_CONFLICT') {
        message.error('Конфликт иерархии. Попробуйте ещё раз.');
      } else {
        message.error('Ошибка при выполнении операции');
      }
    } finally {
      setLoading(false);
    }
  };

  const labelStyle = {
    color: C.t3,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    fontFamily: '"Inter", system-ui, sans-serif',
    marginBottom: 6,
  };

  const conflictRowStyle = (isChoice?: boolean) => ({
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 6,
    border: `1px solid ${isChoice ? C.infoBorder : C.warnBorder}`,
    backgroundColor: isChoice ? C.infoBg : C.warnBg,
    marginBottom: 8,
  });

  const stepContent = [
    // ── Step 1: Select project + type ──────────────────────────────────────
    <div key="step1" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={labelStyle}>Проект</div>
        <Select
          style={{ width: '100%' }}
          value={targetProjectId}
          onChange={(v) => setTargetProjectId(v)}
          options={projects.map((p) => ({
            value: p.id,
            label: `${p.key} — ${p.name}${p.id === issue.projectId ? ' (текущий)' : ''}`,
          }))}
          showSearch
          filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
        />
      </div>
      <div>
        <div style={labelStyle}>Тип тикета</div>
        {typesLoading ? (
          <Spin size="small" />
        ) : (
          <Select
            style={{ width: '100%' }}
            value={targetTypeId}
            onChange={(v) => setTargetTypeId(v)}
            options={targetTypes.map((t) => ({ value: t.id, label: t.name }))}
            placeholder="Выберите тип"
          />
        )}
      </div>
    </div>,

    // ── Step 2: Conflict review ─────────────────────────────────────────────
    <div key="step2" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {conflicts.length === 0 ? (
        <div style={{ color: C.t2, fontSize: 13, fontFamily: '"Inter", system-ui, sans-serif' }}>
          Конфликтов не обнаружено. Можно продолжить.
        </div>
      ) : (
        conflicts.map((c) => (
          <div key={c.key} style={conflictRowStyle(c.isChoice)}>
            <div style={{ flex: 1 }}>
              <div style={{ color: c.isChoice ? C.infoText : C.warnText, fontSize: 13, fontWeight: 600, fontFamily: '"Inter", system-ui, sans-serif' }}>
                {c.label}
              </div>
              {c.detail && (
                <div style={{ color: C.t3, fontSize: 11, fontFamily: '"Inter", system-ui, sans-serif', marginTop: 2 }}>
                  {c.detail}
                </div>
              )}
            </div>
            {c.isChoice && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ color: C.t3, fontSize: 11, fontFamily: '"Inter", system-ui, sans-serif' }}>
                  Перенести
                </span>
                <Switch size="small" checked={moveChildren} onChange={setMoveChildren} />
              </div>
            )}
          </div>
        ))
      )}
    </div>,

    // ── Step 3: Confirmation ────────────────────────────────────────────────
    <div key="step3" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: C.t2, fontSize: 13, fontFamily: '"Inter", system-ui, sans-serif', lineHeight: 1.6 }}>
        {isSameProject ? (
          <>
            Тип тикета <strong style={{ color: C.t1 }}>{issue.issueTypeConfig?.name}</strong> будет изменён на{' '}
            <strong style={{ color: C.acc }}>{targetTypes.find((t) => t.id === targetTypeId)?.name}</strong>.
          </>
        ) : (
          <>
            Тикет <strong style={{ color: C.t1 }}>{(issue as { project?: { key: string } }).project?.key}-{issue.number}</strong> будет перенесён в проект{' '}
            <strong style={{ color: C.acc }}>{projects.find((p) => p.id === targetProjectId)?.name}</strong>
            {isTypeChanged && (
              <> с изменением типа на <strong style={{ color: C.acc }}>{targetTypes.find((t) => t.id === targetTypeId)?.name}</strong></>
            )}
            {hasChildren && moveChildren && (
              <>, включая {issue.children!.length} дочерних тикетов</>
            )}
            .
          </>
        )}
      </div>
      <div style={{ color: C.t4, fontSize: 11, fontFamily: '"Inter", system-ui, sans-serif' }}>
        Это действие будет записано в историю изменений.
      </div>
    </div>,
  ];

  const stepItems = [
    { title: 'Куда' },
    { title: 'Конфликты' },
    { title: 'Подтверждение' },
  ];

  const handleNext = () => {
    if (step < 2) setStep(step + 1);
    else handleExecute();
  };

  const okText = step === 2
    ? (isSameProject ? 'Изменить тип' : 'Перенести')
    : 'Далее';

  return (
    <Modal
      open={open}
      title={
        <span style={{ color: C.t1, fontFamily: '"Space Grotesk", system-ui, sans-serif', fontSize: 16 }}>
          {isSameProject ? 'Изменить тип тикета' : 'Перенести тикет'}
        </span>
      }
      onCancel={onCancel}
      onOk={handleNext}
      okText={okText}
      cancelText={step > 0 ? 'Назад' : 'Отмена'}
      cancelButtonProps={step > 0 ? { onClick: () => setStep(step - 1) } : {}}
      confirmLoading={loading}
      okButtonProps={{ disabled: !canProceed }}
      width={480}
      destroyOnClose
    >
      <div style={{ paddingTop: 8, paddingBottom: 4 }}>
        <Steps
          current={step}
          items={stepItems}
          size="small"
          style={{ marginBottom: 24 }}
        />
        {stepContent[step]}
      </div>
    </Modal>
  );
}
