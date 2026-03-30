/**
 * TopBar — верхняя панель Flow Universe
 * TTUI-121: выделено из AppLayout.tsx монолита
 */
import { Layout, Button, Typography, Tooltip } from 'antd';
import {
  LogoutOutlined,
  MenuOutlined,
  SunFilled,
  MoonFilled,
} from '@ant-design/icons';
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
          <span className="tt-topbar-role">{user?.role}</span>
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
