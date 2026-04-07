import { useState, useEffect } from 'react';
import { InputNumber, Button, Form, message } from 'antd';
import { adminApi } from '../../api/admin';

export default function AdminSystemPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionLifetimeMinutes, setSessionLifetimeMinutes] = useState<number>(60);
  const [form] = Form.useForm();

  useEffect(() => {
    let isMounted = true;

    adminApi.getSystemSettings()
      .then(settings => {
        if (!isMounted) return;
        setSessionLifetimeMinutes(settings.sessionLifetimeMinutes);
        form.setFieldsValue({ sessionLifetimeMinutes: settings.sessionLifetimeMinutes });
      })
      .catch(() => {
        if (!isMounted) return;
        message.error('Не удалось загрузить системные настройки');
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => { isMounted = false; };
  }, [form]);

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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <span>Загрузка...</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, padding: '32px 24px' }}>
      <h4 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Система</h4>
      <p style={{ margin: '0 0 32px', color: 'rgba(0,0,0,0.45)' }}>
        Параметры безопасности и поведения системы. Доступно только для роли Супер Администратор.
      </p>

      <p style={{ margin: '0 0 16px', fontWeight: 500, color: 'rgba(0,0,0,0.65)', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: 8 }}>
        Сессия пользователя
      </p>

      <Form form={form} layout="vertical" onFinish={handleSave}>
        <Form.Item
          label="Время жизни сессии (минуты бездействия)"
          name="sessionLifetimeMinutes"
          extra={`Пользователь выйдет автоматически, если не проявлял активности дольше указанного времени. Текущее значение: ${sessionLifetimeMinutes} мин.`}
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
    </div>
  );
}
