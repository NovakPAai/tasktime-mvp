import { useState } from 'react';
import { Form, Input, Button, Typography, Alert, Card } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuthStore } from '../store/auth.store';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { loadUser } = useAuthStore();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (values: { currentPassword: string; newPassword: string; confirm: string }) => {
    if (values.newPassword !== values.confirm) {
      setError('Пароли не совпадают');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      await loadUser();
      navigate('/');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err?.response?.data?.error || 'Ошибка смены пароля');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Card style={{ width: 400 }}>
        <Typography.Title level={4}>Смена пароля</Typography.Title>
        <Alert
          type="warning"
          showIcon
          message="Вам назначен временный пароль. Для продолжения работы установите постоянный пароль."
          style={{ marginBottom: 24 }}
        />
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}
        <Form form={form} layout="vertical" onFinish={(v) => void handleSubmit(v as { currentPassword: string; newPassword: string; confirm: string })}>
          <Form.Item name="currentPassword" label="Текущий пароль" rules={[{ required: true }]}>
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item name="newPassword" label="Новый пароль" rules={[{ required: true, min: 8 }]}>
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item name="confirm" label="Подтверждение" rules={[{ required: true }]}>
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Сменить пароль
          </Button>
        </Form>
      </Card>
    </div>
  );
}
