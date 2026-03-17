import { Switch, Typography, Card, Divider, Space } from 'antd';
import { BulbOutlined, BulbFilled } from '@ant-design/icons';
import { useThemeStore } from '../store/theme.store';

const { Title, Text } = Typography;

export default function SettingsPage() {
  const { mode, toggle } = useThemeStore();
  const isLight = mode === 'light';

  return (
    <div style={{ maxWidth: 600, padding: '32px 24px' }}>
      <Title level={3} style={{ marginBottom: 24 }}>
        Настройки
      </Title>

      <Card>
        <Title level={5} style={{ marginBottom: 16 }}>
          Интерфейс
        </Title>
        <Divider style={{ margin: '0 0 16px' }} />

        <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
          <Space>
            {isLight ? (
              <BulbFilled style={{ fontSize: 18, color: 'var(--acc)' }} />
            ) : (
              <BulbOutlined style={{ fontSize: 18, color: 'var(--t2)' }} />
            )}
            <div>
              <Text strong>Светлая тема</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {isLight ? 'Включена' : 'Выключена'} — светлый фон, тёмные шрифты
              </Text>
            </div>
          </Space>
          <Switch
            checked={isLight}
            onChange={toggle}
            checkedChildren="☀️"
            unCheckedChildren="🌙"
          />
        </Space>
      </Card>
    </div>
  );
}
