/**
 * SettingsPage — Ф3.3 UI Kit 2.0 (TTUI-103)
 * Токены подтянулись автоматически через ConfigProvider.
 * Добавлены: font preview, профиль-секция, улучшена типографика.
 */
import { Switch, Typography, Divider, Space } from 'antd';
import { BulbOutlined, BulbFilled } from '@ant-design/icons';
import { useThemeStore } from '../store/theme.store';
import { useAuthStore } from '../store/auth.store';

const { Title, Text } = Typography;

export default function SettingsPage() {
  const { mode, toggle } = useThemeStore();
  const { user } = useAuthStore();
  const isLight = mode === 'light';

  return (
    <div style={{ maxWidth: 600, padding: '32px var(--space-8)' }}>
      <Title
        level={3}
        style={{
          fontFamily: 'var(--font-display)',
          marginBottom: 'var(--space-8)',
          color: 'var(--t1)',
        }}
      >
        Настройки
      </Title>

      {/* Профиль */}
      {user && (
        <div
          style={{
            background: 'var(--bg-el)',
            border: '1px solid var(--b)',
            borderRadius: 'var(--r)',
            padding: '20px var(--space-8)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <Title level={5} style={{ marginBottom: 'var(--space-6)', fontFamily: 'var(--font-display)', color: 'var(--t1)' }}>
            Профиль
          </Title>
          <Divider style={{ margin: '0 0 var(--space-6)', borderColor: 'var(--b)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text style={{ color: 'var(--t3)', fontSize: 12 }}>Имя</Text>
              <Text style={{ color: 'var(--t1)', fontSize: 13 }}>{user.name}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text style={{ color: 'var(--t3)', fontSize: 12 }}>Email</Text>
              <Text style={{ color: 'var(--t1)', fontSize: 13 }}>{user.email}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text style={{ color: 'var(--t3)', fontSize: 12 }}>Роль</Text>
              <Text style={{ color: 'var(--acc)', fontSize: 13, fontWeight: 500 }}>{user.role}</Text>
            </div>
          </div>
        </div>
      )}

      {/* Интерфейс */}
      <div
        style={{
          background: 'var(--bg-el)',
          border: '1px solid var(--b)',
          borderRadius: 'var(--r)',
          padding: '20px var(--space-8)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <Title level={5} style={{ marginBottom: 'var(--space-6)', fontFamily: 'var(--font-display)', color: 'var(--t1)' }}>
          Интерфейс
        </Title>
        <Divider style={{ margin: '0 0 var(--space-6)', borderColor: 'var(--b)' }} />

        <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
          <Space>
            {isLight ? (
              <BulbFilled style={{ fontSize: 18, color: 'var(--acc)' }} />
            ) : (
              <BulbOutlined style={{ fontSize: 18, color: 'var(--t2)' }} />
            )}
            <div>
              <Text strong style={{ color: 'var(--t1)' }}>Светлая тема</Text>
              <br />
              <Text style={{ fontSize: 12, color: 'var(--t3)' }}>
                {isLight ? 'Включена' : 'Выключена'} — {isLight ? 'лавандовый фон' : 'тёмный фон #03050F'}
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
      </div>

      {/* Типографика — превью */}
      <div
        style={{
          background: 'var(--bg-el)',
          border: '1px solid var(--b)',
          borderRadius: 'var(--r)',
          padding: '20px var(--space-8)',
        }}
      >
        <Title level={5} style={{ marginBottom: 'var(--space-6)', fontFamily: 'var(--font-display)', color: 'var(--t1)' }}>
          Шрифты системы
        </Title>
        <Divider style={{ margin: '0 0 var(--space-6)', borderColor: 'var(--b)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div>
            <Text style={{ color: 'var(--t3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Space Grotesk — заголовки и числа
            </Text>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--t1)', marginTop: 'var(--space-2)' }}>
              Flow Universe 2026
            </div>
          </div>
          <div>
            <Text style={{ color: 'var(--t3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Inter — основной текст
            </Text>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--t2)', marginTop: 'var(--space-2)', lineHeight: 1.5 }}>
              Управление проектами нового поколения — импортозамещение Jira для российского финансового сектора.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
