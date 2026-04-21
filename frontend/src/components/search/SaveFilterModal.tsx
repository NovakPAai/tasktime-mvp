/**
 * TTSRH-1 PR-13 — SaveFilterModal.
 *
 * Модалка для создания / обновления SavedFilter.
 *
 * Публичный API:
 *   • open — boolean.
 *   • onClose() — закрыть без сохранения. Родитель вызывает `load()` (CLAUDE.md).
 *   • onSaved(filter) — уже сохранённый SavedFilter; родитель делает `load()`.
 *   • initial — начальные значения (для «Save As» / «Update existing»).
 *   • currentJql — текущий JQL из editor'а (readonly preview).
 *
 * Инварианты:
 *   • Поля: name (required, ≤200), description (optional, ≤2000), visibility
 *     (PRIVATE/SHARED/PUBLIC), sharedWith (users+groups, only для SHARED),
 *     isFavorite (default false).
 *   • PUBLIC → warning-banner (R11): «Фильтр станет виден всем аутентифицированным».
 *   • onCancel / onClose / backdrop / Esc — все триггерят `onClose` (CLAUDE.md rule).
 *   • На submit — validateAll, если OK → `onSaved(filter)`.
 */
import { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Switch, Alert, message } from 'antd';

import type {
  CreateSavedFilterInput,
  FilterVisibility,
  SavedFilter,
} from '../../api/savedFilters';
import { useSavedFiltersStore } from '../../store/savedFilters.store';

const { TextArea } = Input;

export interface SaveFilterModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (filter: SavedFilter) => void;
  currentJql: string;
  /** If provided — edit existing filter; otherwise — create new. */
  initial?: SavedFilter | null;
}

interface FormValues {
  name: string;
  description?: string;
  visibility: FilterVisibility;
  isFavorite: boolean;
}

export default function SaveFilterModal({
  open,
  onClose,
  onSaved,
  currentJql,
  initial,
}: SaveFilterModalProps) {
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const create = useSavedFiltersStore((s) => s.create);
  const update = useSavedFiltersStore((s) => s.update);
  const toggleFavorite = useSavedFiltersStore((s) => s.toggleFavorite);
  const [visibility, setVisibility] = useState<FilterVisibility>(
    initial?.visibility ?? 'PRIVATE',
  );

  // Key on `initial?.id` rather than the full `initial` object identity —
  // parent `loadAll` re-allocates a structurally-equal `SavedFilter` object and
  // would nuke mid-edit form state if we depended on reference equality.
  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      visibility: initial?.visibility ?? 'PRIVATE',
      isFavorite: initial?.isFavorite ?? false,
    });
    setVisibility(initial?.visibility ?? 'PRIVATE');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      let saved: SavedFilter;
      if (initial) {
        saved = await update(initial.id, {
          name: values.name,
          description: values.description ?? null,
          jql: currentJql,
          visibility: values.visibility,
        });
      } else {
        const payload: CreateSavedFilterInput = {
          name: values.name,
          description: values.description ?? null,
          jql: currentJql,
          visibility: values.visibility,
        };
        saved = await create(payload);
      }
      // Favorite is a separate endpoint; only fire if value differs from current state.
      if ((saved.isFavorite ?? false) !== values.isFavorite) {
        await toggleFavorite(saved.id, values.isFavorite);
      }
      message.success(initial ? 'Фильтр обновлён' : 'Фильтр сохранён');
      onSaved(saved);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        // form validation — AntD already shows inline errors
        return;
      }
      const msg = err instanceof Error ? err.message : 'Ошибка сохранения';
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={initial ? 'Обновить фильтр' : 'Сохранить фильтр'}
      okText={initial ? 'Обновить' : 'Сохранить'}
      cancelText="Отмена"
      confirmLoading={submitting}
      onOk={handleOk}
      onCancel={() => { onClose(); }}
      destroyOnClose
      maskClosable={!submitting}
      keyboard
    >
      <Form form={form} layout="vertical" name="save-filter-form">
        <Form.Item
          label="Имя"
          name="name"
          rules={[
            { required: true, message: 'Введите имя фильтра' },
            { max: 200, message: 'Максимум 200 символов' },
          ]}
        >
          <Input placeholder="Например: Мои HIGH-задачи" data-testid="save-filter-name" />
        </Form.Item>
        <Form.Item
          label="Описание"
          name="description"
          rules={[{ max: 2000, message: 'Максимум 2000 символов' }]}
        >
          <TextArea rows={2} placeholder="Опционально" />
        </Form.Item>
        <Form.Item label="JQL">
          <Input.TextArea rows={2} value={currentJql} readOnly style={{ fontFamily: 'monospace', fontSize: 12 }} />
        </Form.Item>
        <Form.Item label="Видимость" name="visibility" rules={[{ required: true }]}>
          <Select
            data-testid="save-filter-visibility"
            onChange={(v) => setVisibility(v as FilterVisibility)}
            options={[
              { value: 'PRIVATE', label: 'Private — только я' },
              { value: 'SHARED', label: 'Shared — указанные пользователи / группы' },
              { value: 'PUBLIC', label: 'Public — все аутентифицированные' },
            ]}
          />
        </Form.Item>
        {visibility === 'PUBLIC' && (
          <Alert
            type="warning"
            showIcon
            message="Фильтр станет виден всем аутентифицированным пользователям"
            description="Они увидят имя, описание и JQL фильтра. Выполнение всё равно ограничено их own-access проектами."
            style={{ marginBottom: 16 }}
          />
        )}
        <Form.Item label="Избранный" name="isFavorite" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
