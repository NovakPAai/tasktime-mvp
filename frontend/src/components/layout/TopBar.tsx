/**
 * TopBar — верхняя панель Flow Universe
 * TTUI-121: выделено из AppLayout.tsx монолита
 */
import { Layout, Badge, Button, Typography, Tooltip } from 'antd';
import {
  ExclamationCircleFilled,
  LogoutOutlined,
  MenuOutlined,
  SunFilled,
  MoonFilled,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useMyCheckpointViolationsCount } from '../../hooks/useMyCheckpointViolationsCount';
import type { User } from '../../types';

const { Header } = Layout;

interface TopBarProps {
  isLight: boolean;
  animatingTheme: boolean;
  user: User | null;
  onMenuOpen: () => void;
  onThemeToggle: () => void;
  onLogout: () => void;
}

export default function TopBar({
  isLight,
  animatingTheme,
  user,
  onMenuOpen,
  onThemeToggle,
  onLogout,
}: TopBarProps) {
  const navigate = useNavigate();
  // TTMP-160 FR-12 / SEC-7: count of MY assigned issues currently violating a checkpoint.
  // Polls every 60 s; click → Dashboard with the "at risk" filter pre-applied.
  const myViolationsCount = useMyCheckpointViolationsCount();

  return (
    <Header className="tt-topbar">
      {/* Гамбургер — виден только на мобиле */}
      <Button
        className="tt-mobile-hamburger"
        type="text"
        icon={<MenuOutlined />}
        onClick={onMenuOpen}
        aria-label="Открыть меню"
      />

      <div className="tt-topbar-right">
        {myViolationsCount > 0 && (
          <Tooltip title={`Мои задачи с нарушенными КТ: ${myViolationsCount}`}>
            <Badge count={myViolationsCount} overflowCount={99} offset={[-2, 2]}>
              <Button
                type="text"
                icon={<ExclamationCircleFilled style={{ color: '#E5534B' }} />}
                onClick={() => navigate('/dashboard?filter=my-checkpoint-violations')}
                aria-label={`У вас ${myViolationsCount} задач с нарушенными контрольными точками`}
              />
            </Badge>
          </Tooltip>
        )}

        <Tooltip title={isLight ? 'Тёмная тема' : 'Светлая тема'}>
          <Button
            type="text"
            icon={isLight ? <SunFilled /> : <MoonFilled />}
            onClick={onThemeToggle}
            className={`tt-theme-toggle${animatingTheme ? ' animating' : ''}`}
            aria-label={isLight ? 'Переключить на тёмную тему' : 'Переключить на светлую тему'}
          />
        </Tooltip>

        <Typography.Text className="tt-topbar-user">
          <span className="tt-topbar-user-name">{user?.name}</span>
          <span className="tt-topbar-role">{(user?.systemRoles ?? []).filter(r => r !== 'USER').join(', ') || 'USER'}</span>
        </Typography.Text>

        <Button
          size="small"
          icon={<LogoutOutlined />}
          className="tt-topbar-logout"
          onClick={onLogout}
        >
          <span className="tt-topbar-logout-label">Logout</span>
        </Button>
      </div>
    </Header>
  );
}
