// TTMP-160 PR-5 — FR-15 "Apply changes to N active instances?" modal.
//
// Fired after the RM edits a CheckpointType in a way that affects running checkpoints
// (criteria / offsetDays). User picks which release instances to propagate the new snapshot
// to — default is none-selected so the user actively opts in.

import { Alert, Checkbox, Modal, Result, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import {
  type CheckpointType,
  type CheckpointTypeInstance,
  listActiveInstances,
  syncInstances,
} from '../../api/release-checkpoint-types';

interface SyncInstancesModalProps {
  open: boolean;
  checkpointType: CheckpointType;
  onClose: (applied: boolean) => void;
}

export default function SyncInstancesModal({
  open,
  checkpointType,
  onClose,
}: SyncInstancesModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [instances, setInstances] = useState<CheckpointTypeInstance[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setInstances(await listActiveInstances(checkpointType.id));
    } catch {
      setLoadError(true);
      message.error('Не удалось загрузить активные экземпляры');
    } finally {
      setLoading(false);
    }
  }, [checkpointType.id]);

  useEffect(() => {
    if (open) {
      void load();
      setSelected([]);
    }
  }, [open, load]);

  const handleApply = async () => {
    if (selected.length === 0) {
      message.info('Выберите релизы для применения');
      return;
    }
    setSaving(true);
    try {
      const result = await syncInstances(checkpointType.id, selected);
      message.success(`Обновлено экземпляров: ${result.syncedCount}`);
      onClose(true);
    } catch {
      message.error('Не удалось применить изменения');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<CheckpointTypeInstance> = [
    {
      title: 'Релиз',
      render: (_, row) => (
        <span>
          {row.projectKey ? <Tag>{row.projectKey}</Tag> : null}
          {row.releaseName}
        </span>
      ),
    },
    {
      title: 'Плановая дата',
      dataIndex: 'releasePlannedDate',
      render: (v: string | null) => v ?? '—',
      width: 140,
    },
    {
      title: 'Дедлайн (текущий)',
      dataIndex: 'deadline',
      width: 160,
    },
    {
      title: 'Состояние',
      dataIndex: 'state',
      width: 130,
      render: (state: string) => {
        const color = state === 'VIOLATED' ? 'red' : state === 'OK' ? 'green' : 'default';
        return <Tag color={color}>{state}</Tag>;
      },
    },
  ];

  return (
    <Modal
      title={`Применить изменения к активным экземплярам «${checkpointType.name}»`}
      open={open}
      onCancel={() => onClose(false)}
      onOk={handleApply}
      okText={`Применить к ${selected.length} из ${instances.length}`}
      cancelText="Не применять"
      confirmLoading={saving}
      okButtonProps={{ disabled: selected.length === 0 }}
      width={720}
      destroyOnClose
    >
      <Alert
        message="FR-15: snapshot criteriaSnapshot / offsetDaysSnapshot копируется при создании контрольной точки и не меняется при редактировании типа."
        description="Выбранные экземпляры будут перезаписаны новым снапшотом и пересчитаны. По умолчанию ничего не выбрано."
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
      />
      {loadError ? (
        <Result
          status="warning"
          title="Не удалось загрузить список экземпляров"
          subTitle="Закройте окно и попробуйте снова. Если ошибка повторяется — сообщите администратору."
        />
      ) : (
        <>
          <Checkbox
            indeterminate={selected.length > 0 && selected.length < instances.length}
            checked={instances.length > 0 && selected.length === instances.length}
            onChange={(e) =>
              setSelected(e.target.checked ? instances.map((i) => i.releaseId) : [])
            }
            style={{ marginBottom: 8 }}
            disabled={instances.length === 0}
          >
            Выбрать все ({instances.length})
          </Checkbox>
          <Table<CheckpointTypeInstance>
            // Releases have a unique (release_id, checkpoint_type_id) FK — at most one row
            // per release for this type. Using releaseId as rowKey keeps selection state in
            // the same space as the `syncInstances` API contract (array of releaseIds).
            rowKey="releaseId"
            dataSource={instances}
            columns={columns}
            loading={loading}
            pagination={false}
            size="small"
            rowSelection={{
              selectedRowKeys: selected,
              onChange: (keys) => setSelected(keys as string[]),
            }}
          />
        </>
      )}
    </Modal>
  );
}
