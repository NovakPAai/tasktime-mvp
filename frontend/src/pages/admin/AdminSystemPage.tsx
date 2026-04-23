import { useState, useEffect, useCallback } from 'react';
import { InputNumber, Button, Form, message, Result } from 'antd';
import { adminApi } from '../../api/admin';
import type { BulkOpsSettings } from '../../api/admin';

export default function AdminSystemPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sessionLifetimeMinutes, setSessionLifetimeMinutes] = useState<number>(60);
  const [jwtExpiresIn, setJwtExpiresIn] = useState<string>('1h');
  const [form] = Form.useForm();

  // TTBULK-1 PR-7 — bulk operations runtime limits.
  const [bulkOps, setBulkOps] = useState<BulkOpsSettings>({ maxConcurrentPerUser: 3, maxItems: 10000 });
  const [bulkOpsSaving, setBulkOpsSaving] = useState(false);
  const [bulkOpsForm] = Form.useForm();

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [sys, bulk] = await Promise.all([
        adminApi.getSystemSettings(),
        adminApi.getBulkOpsSettings(),
      ]);
      setSessionLifetimeMinutes(sys.sessionLifetimeMinutes);
      setJwtExpiresIn(sys.jwtExpiresIn);
      form.setFieldsValue({ sessionLifetimeMinutes: sys.sessionLifetimeMinutes });
      setBulkOps(bulk);
      bulkOpsForm.setFieldsValue(bulk);
    } catch {
      setLoadError('Не удалось загрузить системные настройки');
      message.error('Не удалось загрузить системные настройки');
    } finally {
      setLoading(false);
    }
  }, [form, bulkOpsForm]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSave = async (values: { sessionLifetimeMinutes: number }) => {
    setSaving(true);
    try {
      await adminApi.setSessionLifetime(values.sessionLifetimeMinutes);
      setSessionLifetimeMinutes(values.sessionLifetimeMinutes);
      message.success('Настройки сохранены');
    } catch {
      message.error('Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkOpsSave = async (values: BulkOpsSettings) => {
    setBulkOpsSaving(true);
    try {
      const updated = await adminApi.setBulkOpsSettings(values);
      setBulkOps(updated);
      bulkOpsForm.setFieldsValue(updated);
      message.success('Лимиты массовых операций сохранены');
    } catch {
      message.error('Не удалось сохранить лимиты массовых операций');
    } finally {
      setBulkOpsSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <span>Загрузка...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <Result
        status="warning"
        title={loadError}
        subTitle="Попробуйте перезагрузить страницу или обратитесь к администратору."
        extra={<Button type="primary" onClick={() => void loadAll()}>Повторить</Button>}
      />
    );
  }

  return (
    <div style={{ maxWidth: 520, padding: '32px 24px' }}>
      <h4 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Система</h4>
      <p style={{ margin: '0 0 32px', color: 'rgba(0,0,0,0.45)' }}>
        Параметры безопасности и поведения системы. Доступно только для роли Супер Администратор.
      </p>

      {/* ── Сессия пользователя ── */}
      <p style={{ margin: '0 0 16px', fontWeight: 500, color: 'rgba(0,0,0,0.65)', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: 8 }}>
        Сессия пользователя
      </p>

      <Form form={form} layout="vertical" onFinish={handleSave}>
        <Form.Item
          label="Время бездействия до выхода (скользящая сессия)"
          name="sessionLifetimeMinutes"
          extra={`Пользователь выйдет автоматически, если не проявлял активности дольше указанного времени. Текущее значение: ${sessionLifetimeMinutes} мин. Вступает в силу немедленно.`}
          rules={[
            { required: true, message: 'Укажите время в минутах' },
            {
              validator: (_, value) =>
                Number.isInteger(value) && value >= 5 && value <= 10080
                  ? Promise.resolve()
                  : Promise.reject('Значение должно быть от 5 до 10080 минут (7 дней)'),
            },
          ]}
        >
          <InputNumber
            min={5}
            max={10080}
            step={5}
            style={{ width: 200 }}
            addonAfter="мин"
            aria-label="Время жизни сессии в минутах"
          />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            Сохранить
          </Button>
        </Form.Item>
      </Form>

      {/* ── JWT access-token ── */}
      <p style={{ margin: '24px 0 16px', fontWeight: 500, color: 'rgba(0,0,0,0.65)', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: 8 }}>
        JWT access-token
      </p>

      <div style={{ marginBottom: 8 }}>
        <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>Срок действия токена (JWT_EXPIRES_IN)</span>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-block',
            padding: '4px 12px',
            background: 'rgba(0,0,0,0.04)',
            border: '1px solid rgba(0,0,0,0.12)',
            borderRadius: 6,
            fontFamily: 'monospace',
            fontSize: 14,
          }}>
            {jwtExpiresIn}
          </span>
          <span style={{ color: 'rgba(0,0,0,0.35)', fontSize: 12 }}>только чтение</span>
        </div>
      </div>

      <p style={{ margin: '8px 0 0', color: 'rgba(0,0,0,0.45)', fontSize: 12, lineHeight: 1.6 }}>
        Задаётся переменной окружения <code>JWT_EXPIRES_IN</code> в файле <code>backend/.env</code>.
        После изменения требуется перезапуск сервера (<code>docker compose restart backend</code>).
        Уже выданные токены будут действовать до истечения их текущего срока.
      </p>
      <p style={{ margin: '6px 0 0', color: 'rgba(0,0,0,0.45)', fontSize: 12, lineHeight: 1.6 }}>
        <strong>Отличие от скользящей сессии:</strong> JWT_EXPIRES_IN — жёсткий потолок жизни токена
        (пользователь выйдет не позже этого срока). Скользящая сессия — более ранний выход при бездействии,
        настраивается выше без перезапуска.
      </p>

      {/* ── Массовые операции (TTBULK-1 PR-7) ── */}
      <p style={{ margin: '32px 0 16px', fontWeight: 500, color: 'rgba(0,0,0,0.65)', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: 8 }}>
        Массовые операции
      </p>
      <p style={{ margin: '0 0 16px', color: 'rgba(0,0,0,0.45)', fontSize: 12, lineHeight: 1.6 }}>
        Runtime-лимиты на массовые операции (BULK_OPERATOR). Изменения вступают в силу в течение 60 секунд.
      </p>

      <Form form={bulkOpsForm} layout="vertical" onFinish={handleBulkOpsSave} initialValues={bulkOps}>
        <Form.Item
          label="Максимум одновременных операций на пользователя"
          name="maxConcurrentPerUser"
          extra={`Текущее значение: ${bulkOps.maxConcurrentPerUser}. Диапазон: 1..20.`}
          rules={[
            { required: true, message: 'Укажите значение' },
            {
              validator: (_, value) =>
                Number.isInteger(value) && value >= 1 && value <= 20
                  ? Promise.resolve()
                  : Promise.reject('Значение должно быть от 1 до 20'),
            },
          ]}
        >
          <InputNumber
            min={1}
            max={20}
            step={1}
            style={{ width: 200 }}
            aria-label="Максимум одновременных массовых операций на пользователя"
          />
        </Form.Item>

        <Form.Item
          label="Максимум элементов в одной операции"
          name="maxItems"
          extra={`Текущее значение: ${bulkOps.maxItems}. Диапазон: 100..10000 (hard-cap соответствует MAX_ITEMS_HARD_LIMIT в API).`}
          rules={[
            { required: true, message: 'Укажите значение' },
            {
              validator: (_, value) =>
                Number.isInteger(value) && value >= 100 && value <= 10_000
                  ? Promise.resolve()
                  : Promise.reject('Значение должно быть от 100 до 10000'),
            },
          ]}
        >
          <InputNumber
            min={100}
            max={10_000}
            step={100}
            style={{ width: 200 }}
            addonAfter="шт"
            aria-label="Максимум элементов в одной массовой операции"
          />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={bulkOpsSaving}>
            Сохранить
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
