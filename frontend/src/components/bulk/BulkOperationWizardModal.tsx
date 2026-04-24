/**
 * TTBULK-1 PR-9a/9b — WizardModal, 4-step flow массовых операций.
 *
 * Flow:
 *   Step 1 (pick type) → Step 2 (configure payload) → Step 3 (preview) → Step 4 (confirm+submit).
 *
 * Invariants:
 *   • Reset state на mount (useEffect(open)): step=0, type=undefined, payload=null,
 *     preview=null, confirmPhrase=''. Без reset — повторное открытие показывало бы stale.
 *   • Preview вызывается при enter step 3 (transition from 2→3). При возврате
 *     на step 2 — preview сбрасывается; при повторном входе — пересчитывается
 *     (payload мог измениться).
 *   • Submit (create) на step 4 — через `bulkOperationsApi.create(previewToken,
 *     idempotencyKey)`. idempotencyKey — новый UUID per submit.
 *   • DELETE requires confirmPhrase === 'DELETE' — gate на кнопке submit.
 *
 * См. docs/tz/TTBULK-1.md §3.2, §8.1, §13.6 PR-9.
 */

import { useState, useEffect, useCallback } from 'react';
import { Modal, Steps, Button, Space, Alert, message } from 'antd';
import type {
  BulkOperationPayload,
  BulkOperationType,
  BulkPreviewResponse,
  BulkScope,
} from '../../types/bulk.types';
import { OPERATION_LABELS } from '../../types/bulk.types';
import { bulkOperationsApi } from '../../api/bulkOperations';
import Step1PickOperation from './Step1PickOperation';
import Step2Configure from './Step2Configure';
import Step3Preview from './Step3Preview';
import Step4Confirm from './Step4Confirm';

export interface BulkOperationWizardModalProps {
  open: boolean;
  scope: BulkScope;
  total: number;
  allowedOperations?: readonly BulkOperationType[];
  onClose: () => void;
  /** Invoked after successful submit with operation id. Consumer (PR-10)
   * collapses wizard → Progress Drawer. */
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
  onSubmitted,
}: BulkOperationWizardModalProps) {
  const [step, setStep] = useState(0);
  const [selectedType, setSelectedType] = useState<BulkOperationType | undefined>();
  const [payload, setPayload] = useState<Partial<BulkOperationPayload> | null>(null);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BulkPreviewResponse | null>(null);

  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset state когда wizard открывают заново. Без этого stale state «просачивался» бы.
  useEffect(() => {
    if (open) {
      setStep(0);
      setSelectedType(undefined);
      setPayload(null);
      setPreview(null);
      setPreviewError(null);
      setConfirmPhrase('');
    }
  }, [open]);

  const runPreview = useCallback(async () => {
    if (!payload || !isCompletePayload(payload)) {
      setPreviewError('Неполный payload — вернитесь на шаг 2.');
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    try {
      const res = await bulkOperationsApi.preview({ scope, payload });
      setPreview(res);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setPreviewError(err?.response?.data?.error ?? 'Не удалось получить preview');
    } finally {
      setPreviewLoading(false);
    }
  }, [scope, payload]);

  // Автопрегрев preview при переходе 2 → 3 (когда preview ещё не был получен).
  useEffect(() => {
    if (open && step === 2 && preview === null && !previewLoading && !previewError) {
      void runPreview();
    }
  }, [open, step, preview, previewLoading, previewError, runPreview]);

  const handleSubmit = useCallback(async () => {
    if (!preview || !preview.previewToken) {
      void message.error('Preview не готов');
      return;
    }
    if (preview.eligible.length === 0) {
      void message.warning('Нет eligible задач — submit заблокирован.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await bulkOperationsApi.create({
        previewToken: preview.previewToken,
        idempotencyKey: crypto.randomUUID(),
      });
      void message.success(`Операция создана (${res.status})`);
      onSubmitted?.(res.id);
      onClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      void message.error(err?.response?.data?.error ?? 'Не удалось создать операцию');
    } finally {
      setSubmitting(false);
    }
  }, [preview, onClose, onSubmitted]);

  const scopeLabel = buildScopeLabel(scope, total);
  const canNext = computeCanNext(step, selectedType, payload, preview, confirmPhrase);

  return (
    <Modal
      title={`Массовые операции — ${scopeLabel}`}
      open={open}
      width={760}
      onCancel={onClose}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button
            disabled={step === 0 || submitting}
            onClick={() => {
              // При возврате на шаг 2 — сбрасываем preview чтобы заново
              // запросить при следующем входе в шаг 3 (payload мог измениться).
              if (step === 2) setPreview(null);
              setStep((s) => Math.max(0, s - 1));
            }}
          >
            Назад
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              type="primary"
              disabled={!canNext}
              onClick={() => {
                // При переходе 2 → 3 сбрасываем preview (payload мог измениться).
                if (step === 1) setPreview(null);
                setStep((s) => Math.min(STEPS.length - 1, s + 1));
              }}
            >
              Далее
            </Button>
          ) : (
            <Button
              type="primary"
              danger={selectedType ? OPERATION_LABELS[selectedType].destructive : false}
              loading={submitting}
              disabled={!canNext}
              onClick={() => void handleSubmit()}
            >
              Запустить
            </Button>
          )}
        </Space>
      }
    >
      <Steps current={step} items={STEPS} size="small" style={{ marginBottom: 24 }} />

      {step === 0 && (
        <Step1PickOperation
          value={selectedType}
          onSelect={(t) => {
            setSelectedType(t);
            // Сбрасываем payload при смене типа — старый не валиден для нового.
            setPayload(null);
            setPreview(null);
          }}
          allowedOperations={allowedOperations}
        />
      )}

      {step === 1 && selectedType && (
        <Step2Configure
          operationType={selectedType}
          value={payload}
          onChange={setPayload}
        />
      )}

      {step === 2 && (
        <Step3Preview loading={previewLoading} error={previewError} preview={preview} />
      )}

      {step === 3 && selectedType && (
        <Step4Confirm
          operationType={selectedType}
          payload={payload as BulkOperationPayload | null}
          scope={scope}
          preview={preview}
          confirmPhrase={confirmPhrase}
          onConfirmPhraseChange={setConfirmPhrase}
        />
      )}

      {step > 0 && !selectedType && (
        <Alert type="warning" message="Вернитесь на шаг 1 — операция не выбрана" />
      )}
    </Modal>
  );
}

// ────── helpers ──────────────────────────────────────────────────────────────

/**
 * Runtime-narrowing для partial payload'а. Возвращает `true` когда достаточно
 * полей чтобы отправить preview.
 */
function isCompletePayload(
  p: Partial<BulkOperationPayload>,
): p is BulkOperationPayload {
  if (!p || !p.type) return false;
  switch (p.type) {
    case 'TRANSITION': {
      const tid = (p as { transitionId?: unknown }).transitionId;
      return typeof tid === 'string' && tid.length > 0;
    }
    case 'ASSIGN':
      return 'assigneeId' in p; // null — валидно (unassign)
    case 'EDIT_FIELD': {
      const f = (p as { field?: unknown }).field;
      const v = (p as { value?: unknown }).value;
      return typeof f === 'string' && v !== undefined;
    }
    case 'EDIT_CUSTOM_FIELD': {
      const cf = (p as { customFieldId?: unknown }).customFieldId;
      return typeof cf === 'string' && cf.length > 0 && 'value' in p;
    }
    case 'MOVE_TO_SPRINT':
      return 'sprintId' in p;
    case 'ADD_COMMENT': {
      const body = (p as { body?: unknown }).body;
      return typeof body === 'string' && body.length > 0;
    }
    case 'DELETE':
      return true; // confirmPhrase валидируется отдельно на step 4
  }
}

function computeCanNext(
  step: number,
  type: BulkOperationType | undefined,
  payload: Partial<BulkOperationPayload> | null,
  preview: BulkPreviewResponse | null,
  confirmPhrase: string,
): boolean {
  switch (step) {
    case 0:
      return type !== undefined;
    case 1:
      return payload !== null && isCompletePayload(payload);
    case 2:
      // Идти на step 4 только если preview успешен и есть хотя бы 1 eligible.
      return preview !== null && preview.eligible.length > 0;
    case 3: {
      if (!preview || preview.eligible.length === 0) return false;
      if (type === 'DELETE' && confirmPhrase !== 'DELETE') return false;
      return true;
    }
    default:
      return false;
  }
}

function buildScopeLabel(scope: BulkScope, total: number): string {
  const noun = pluralizeTasks(total);
  if (scope.kind === 'ids') return `Выбрано: ${total} ${noun}`;
  return `JQL-выборка (${total} ${noun})`;
}

function pluralizeTasks(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'задач';
  const mod10 = n % 10;
  if (mod10 === 1) return 'задача';
  if (mod10 >= 2 && mod10 <= 4) return 'задачи';
  return 'задач';
}
