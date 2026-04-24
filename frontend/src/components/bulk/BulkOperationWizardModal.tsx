/**
 * TTBULK-1 PR-9a — WizardModal, 4-step flow массовых операций.
 *
 * PR-9a (этот): скелет modal + Step1 (выбор операции) + placeholder'ы
 * Step2/3/4. PR-9b добавит реальные Step2 (config), Step3 (preview с
 * virtualized-списками), Step4 (confirm + submit + conflicts resolution).
 *
 * Публичный API:
 *   • props `{ open, scope, total, allowedOperations, onClose, onSubmitted }`
 *   • onClose → родитель должен вызвать refresh (CLAUDE.md правило —
 *     SearchPage `runQuery(jql, page)`).
 *
 * Инварианты:
 *   • Reset state на mount (useEffect(open)): step=1, type=undefined.
 *     Без reset — повторное открытие показывало бы stale selection.
 *   • Destructive операции (DELETE) остаются disabled до Step4 confirm
 *     phrase (ENTER "DELETE"), который реализуется в PR-9b.
 *
 * См. docs/tz/TTBULK-1.md §3.2, §8.1, §13.6 PR-9.
 */

import { useState, useEffect } from 'react';
import { Modal, Steps, Button, Space, Alert } from 'antd';
import type { BulkOperationType, BulkScope } from '../../types/bulk.types';
import { OPERATION_LABELS } from '../../types/bulk.types';
import Step1PickOperation from './Step1PickOperation';

export interface BulkOperationWizardModalProps {
  open: boolean;
  /** Scope — `ids` (из выделенных) или `jql` (вся результат-выборка). */
  scope: BulkScope;
  /** Для заголовка + footer stats ("Выбрано: N"). */
  total: number;
  /** Ограничение типов операций, показываемых в Step1 (опц). */
  allowedOperations?: readonly BulkOperationType[];
  /** Close — родитель должен refresh'нуть данные (CLAUDE.md). */
  onClose: () => void;
  /** После успешного submit (Step4 → create) — дёрнется с operationId
   * для collapse в progress drawer (PR-10). В PR-9a не вызывается. */
  onSubmitted?: (operationId: string) => void;
}

const STEPS = [
  { title: 'Операция' },
  { title: 'Настройка' },
  { title: 'Предпросмотр' },
  { title: 'Подтверждение' },
];

export default function BulkOperationWizardModal({
  open,
  scope,
  total,
  allowedOperations,
  onClose,
  // onSubmitted — unused в PR-9a (будет в PR-9b).
}: BulkOperationWizardModalProps) {
  const [step, setStep] = useState(0);
  const [selectedType, setSelectedType] = useState<BulkOperationType | undefined>();

  // Reset state когда wizard открывают заново. Без этого повторное открытие
  // с другим scope'ом показывало бы предыдущий selection.
  useEffect(() => {
    if (open) {
      setStep(0);
      setSelectedType(undefined);
    }
  }, [open]);

  // Русская плюрализация: 1 → "задача", 2-4 → "задачи", 5+ → "задач".
  // Для 11-14 — всегда "задач" (исключение стандартного правила).
  const pluralizeTasks = (n: number): string => {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 14) return 'задач';
    const mod10 = n % 10;
    if (mod10 === 1) return 'задача';
    if (mod10 >= 2 && mod10 <= 4) return 'задачи';
    return 'задач';
  };
  const scopeLabel =
    scope.kind === 'ids'
      ? `Выбрано: ${total} ${pluralizeTasks(total)}`
      : `JQL-выборка (${total} ${pluralizeTasks(total)})`;

  const canNext = step === 0 ? selectedType !== undefined : false; // Step2+ в PR-9b

  return (
    <Modal
      title={`Массовые операции — ${scopeLabel}`}
      open={open}
      width={720}
      onCancel={onClose}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Назад
          </Button>
          <Button
            type="primary"
            disabled={!canNext || step >= STEPS.length - 1}
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
          >
            Далее
          </Button>
        </Space>
      }
    >
      <Steps current={step} items={STEPS} size="small" style={{ marginBottom: 24 }} />

      {step === 0 && (
        <Step1PickOperation
          value={selectedType}
          onSelect={setSelectedType}
          allowedOperations={allowedOperations}
        />
      )}

      {step > 0 && (
        <Alert
          message="Дальнейшие шаги — в PR-9b"
          description={
            selectedType
              ? `Выбранная операция: ${OPERATION_LABELS[selectedType].label}. Конфигурация, preview и confirm добавятся следующим PR'ом.`
              : 'Сначала выберите операцию на шаге 1.'
          }
          type="info"
          showIcon
        />
      )}
    </Modal>
  );
}
