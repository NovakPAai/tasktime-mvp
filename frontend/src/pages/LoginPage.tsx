import { useState } from 'react';
import { Form, Input, Button, Typography, message, Tabs } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.email, values.password);
      navigate('/');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values: { email: string; password: string; name: string }) => {
    setLoading(true);
    try {
      await register(values.email, values.password, values.name);
      navigate('/');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tt-login-shell">
      <div className="tt-login-panel">
        <div className="tt-login-header">
          <div>
            <div className="tt-login-title">TaskTime</div>
            <div className="tt-login-subtitle">Sign in to your workspace</div>
          </div>
        </div>
        <Tabs
          className="tt-login-tabs"
          items={[
            {
              key: 'login',
              label: 'Login',
              children: (
                <Form
                  onFinish={handleLogin}
                  layout="vertical"
                  className="tt-login-form"
                >
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[{ required: true, type: 'email' }]}
                    className="tt-login-form-item"
                  >
                    <Input className="tt-login-input" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="Password"
                    rules={[{ required: true }]}
                    className="tt-login-form-item"
                  >
                    <Input.Password className="tt-login-input" />
                  </Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                    block
                    className="tt-login-btn-primary"
                  >
                    Login
                  </Button>
                </Form>
              ),
            },
            {
              key: 'register',
              label: 'Register',
              children: (
                <Form
                  onFinish={handleRegister}
                  layout="vertical"
                  className="tt-login-form"
                >
                  <Form.Item
                    name="name"
                    label="Name"
                    rules={[{ required: true }]}
                    className="tt-login-form-item"
                  >
                    <Input className="tt-login-input" />
                  </Form.Item>
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[{ required: true, type: 'email' }]}
                    className="tt-login-form-item"
                  >
                    <Input className="tt-login-input" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label="Password"
                    rules={[{ required: true, min: 8 }]}
                    className="tt-login-form-item"
                  >
                    <Input.Password className="tt-login-input" />
                  </Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                    block
                    className="tt-login-btn-primary"
                  >
                    Register
                  </Button>
                </Form>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
