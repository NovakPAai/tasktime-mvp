import { useState, useEffect } from 'react';
import { InputNumber, Button, Form, message, Spin, Typography, Divider } from 'antd';
import { adminApi } from '../../api/admin';

const { Title, Text } = Typography;

export default function AdminSystemPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionLifetimeMinutes, setSessionLifetimeMinutes] = useState<number>(60);
  const [form] = Form.useForm();

  useEffect(() => {
    adminApi.getSystemSettings()
      .then(settings => {
        setSessionLifetimeMinutes(settings.sessionLifetimeMinutes);
        form.setFieldsValue({ sessionLifetimeMinutes: settings.sessionLifetimeMinutes });
      })
      .catch(() => message.error('Не удалось загрузить системные настройки'))
      .finally(() => setLoading(false));
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
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, padding: '32px 24px' }}>
      <Title level={4} style={{ marginBottom: 4 }}>Система</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 32 }}>
        Параметры безопасности и поведения системы. Доступно только для роли Супер Администратор.
      </Text>

      <Divider orientation="left" orientationMargin={0}>Сессия пользователя</Divider>

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
