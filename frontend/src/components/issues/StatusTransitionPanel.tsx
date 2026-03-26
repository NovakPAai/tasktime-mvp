import { useState } from 'react';
import { Button, Space, Tag, Spin, message } from 'antd';
import { useIssueTransitions } from '../../hooks/useIssueTransitions';
import { workflowEngineApi, type TransitionOption } from '../../api/workflow-engine';
import TransitionModal from './TransitionModal';

interface Props {
  issueId: string;
  onTransitioned: () => void;
}

export default function StatusTransitionPanel({ issueId, onTransitioned }: Props) {
  const { currentStatus, transitions, isLoading, refetch } = useIssueTransitions(issueId);
  const [pendingTransition, setPendingTransition] = useState<TransitionOption | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);

  const handleTransitionClick = async (t: TransitionOption) => {
    if (t.requiresScreen) {
      setPendingTransition(t);
      return;
    }
    setExecuting(t.id);
    try {
      await workflowEngineApi.executeTransition(issueId, { transitionId: t.id });
      message.success('Статус изменён');
      await refetch();
      onTransitioned();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; details?: { message?: string } } } };
      const code = e?.response?.data?.error;
      if (code === 'NO_VALID_TRANSITION') message.error('Переход недоступен из текущего статуса');
      else if (code === 'CONDITION_NOT_MET') message.error('У вас нет прав для этого перехода');
      else if (code === 'VALIDATOR_FAILED') message.error(e.response?.data?.details?.message || 'Условия перехода не выполнены');
      else message.error('Не удалось выполнить переход');
    } finally {
      setExecuting(null);
    }
  };

  const handleModalSuccess = async () => {
    setPendingTransition(null);
    await refetch();
    onTransitioned();
  };

  if (isLoading) return <Spin size="small" />;

  return (
    <div>
      {currentStatus && (
        <Tag
          color={currentStatus.color}
          style={{ marginBottom: 8, fontSize: 12 }}
        >
          {currentStatus.name}
        </Tag>
      )}
      {transitions.length > 0 && (
        <Space wrap size={4}>
          {transitions.map(t => (
            <Button
              key={t.id}
              size="small"
              loading={executing === t.id}
              onClick={() => handleTransitionClick(t)}
            >
              {t.name}
            </Button>
          ))}
        </Space>
      )}
      {pendingTransition && (
        <TransitionModal
          open
          issueId={issueId}
          transitionId={pendingTransition.id}
          transitionName={pendingTransition.name}
          screenFields={pendingTransition.screenFields}
          onSuccess={handleModalSuccess}
          onCancel={() => setPendingTransition(null)}
        />
      )}
    </div>
  );
}
