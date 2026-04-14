import { useState } from 'react';
import { useThemeStore } from '../store/theme.store';
import { useAuthStore } from '../store/auth.store';

const LOGO_GRAD =
  'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)';

const DARK_C = {
  bg: '#080B14',
  bgCard: '#0F1320',
  bgInput: '#161B22',
  bgSubNav: '#0F1320',
  border: '#21262D',
  inputBorder: '#30363D',
  t1: '#E2E8F8',
  t2: '#C9D1D9',
  t3: '#8B949E',
  t4: '#484F58',
  acc: '#4F6EF7',
  toggleOff: '#21262D',
  toggleKnobOff: '#484F58',
  notifBorder: '#21262D',
};

const LIGHT_C = {
  bg: '#F5F3FF',
  bgCard: '#FFFFFF',
  bgInput: '#F6F8FA',
  bgSubNav: '#FFFFFF',
  border: '#D0D7DE',
  inputBorder: '#D0D7DE',
  t1: '#1F2328',
  t2: '#1F2328',
  t3: '#656D76',
  t4: '#8C959F',
  acc: '#4F6EF7',
  toggleOff: '#E8EAED',
  toggleKnobOff: '#FFFFFF',
  notifBorder: '#EFF2F5',
};

type NavSection = 'profile' | 'security' | 'notifications' | 'appearance' | 'language' | 'integrations';

const NAV_ITEMS: { key: NavSection; label: string; section: 'personal' | 'system'; icon: React.ReactNode }[] = [
  {
    key: 'profile', label: 'Профиль', section: 'personal',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="5" r="3" stroke="currentColor" strokeWidth="1.3" />
        <path d="M1 13c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'security', label: 'Безопасность', section: 'personal',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="2" y="5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5 5V4a2 2 0 014 0v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'notifications', label: 'Уведомления', section: 'personal',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1l1.5 4h4l-3.2 2.4 1.2 4L7 9 3.5 11.4l1.2-4L1.5 5h4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'appearance', label: 'Внешний вид', section: 'personal',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.3" />
        <path d="M7 1v1M7 12v1M1 7h1M12 7h1M2.7 2.7l.7.7M10.6 10.6l.7.7M2.7 11.3l.7-.7M10.6 3.4l.7-.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'language', label: 'Язык и регион', section: 'system',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M4.5 7h5M7 4.5l2.5 2.5-2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'integrations', label: 'Интеграции', section: 'system',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5 7h4M7 5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
];

type ToggleState = { email: boolean; telegram: boolean };
const NOTIF_ROWS = [
  { key: 'assigned', label: 'Назначена задача', sub: 'Уведомлять, когда задача назначена на меня' },
  { key: 'comment', label: 'Комментарий к задаче', sub: 'Уведомлять при новых комментариях в моих задачах' },
  { key: 'sprint', label: 'Изменение статуса спринта', sub: 'Старт, завершение и изменения спринтов' },
  { key: 'deadline', label: 'Дедлайны и просрочки', sub: 'За 24 часа до дедлайна и при просрочке' },
];

function Toggle({ on, onToggle, C }: { on: boolean; onToggle: () => void; C: typeof DARK_C }) {
  return (
    <div
      onClick={onToggle}
      style={{
        alignItems: 'center',
        backgroundImage: on ? LOGO_GRAD : 'none',
        background: on ? undefined : C.toggleOff,
        borderRadius: 10,
        display: 'flex',
        flexShrink: 0,
        height: 20,
        paddingBlock: 2,
        paddingInline: 2,
        width: 36,
        cursor: 'pointer',
        transition: 'background 0.2s',
      }}
    >
      <div
        style={{
          backgroundColor: on ? '#FFFFFF' : C.toggleKnobOff,
          borderRadius: '50%',
          flexShrink: 0,
          height: 16,
          width: 16,
          marginLeft: on ? 'auto' : undefined,
          transition: 'margin 0.2s',
        }}
      />
    </div>
  );
}

export default function SettingsPage() {
  const { mode, setMode } = useThemeStore();
  const { user } = useAuthStore();
  const C = mode === 'light' ? LIGHT_C : DARK_C;

  const [activeNav, setActiveNav] = useState<NavSection>('profile');
  const [notifs, setNotifs] = useState<Record<string, ToggleState>>({
    assigned: { email: true, telegram: true },
    comment: { email: false, telegram: true },
    sprint: { email: true, telegram: false },
    deadline: { email: true, telegram: true },
  });

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  const toggleNotif = (key: string, channel: 'email' | 'telegram') => {
    setNotifs((prev) => ({
      ...prev,
      [key]: { ...prev[key], [channel]: !prev[key][channel] },
    }));
  };

  const personalItems = NAV_ITEMS.filter((n) => n.section === 'personal');
  const systemItems = NAV_ITEMS.filter((n) => n.section === 'system');

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: C.bg,
        minHeight: '100vh',
        width: '100%',
      }}
    >
      {/* Top header */}
      <div
        style={{
          alignItems: 'center',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex',
          flexShrink: 0,
          justifyContent: 'space-between',
          paddingBottom: 20,
          paddingInline: 32,
          paddingTop: 24,
          background: mode === 'light' ? C.bgCard : 'transparent',
        }}
      >
        <div>
          <div
            style={{
              color: C.t1,
              fontFamily: '"Space Grotesk", system-ui, sans-serif',
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: '28px',
            }}
          >
            Настройки
          </div>
          <div
            style={{
              color: C.t3,
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13,
              lineHeight: '16px',
              marginTop: 4,
            }}
          >
            Управление профилем, темой и уведомлениями
          </div>
        </div>
      </div>

      {/* Body: sub-nav + content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'auto' }}>
        {/* Sub-nav */}
        <div
          style={{
            background: C.bgSubNav,
            borderRight: `1px solid ${C.border}`,
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            gap: 4,
            minWidth: 200,
            paddingBlock: 20,
            paddingInline: 12,
            width: 200,
          }}
        >
          {/* Personal section */}
          <div
            style={{
              color: C.t4,
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.5px',
              lineHeight: '12px',
              paddingBottom: 8,
              paddingInline: 8,
              textTransform: 'uppercase',
            }}
          >
            Личное
          </div>
          {personalItems.map((item) => {
            const isActive = activeNav === item.key;
            return (
              <div
                key={item.key}
                onClick={() => setActiveNav(item.key)}
                style={{
                  alignItems: 'center',
                  backgroundImage: isActive ? `linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207 / 12%) 0%, oklab(54.1% 0.096 -0.227 / 12%) 100%)` : 'none',
                  border: isActive ? `1px solid #4F6EF733` : '1px solid transparent',
                  borderRadius: 6,
                  boxSizing: 'border-box',
                  color: isActive ? C.acc : C.t3,
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 8,
                  paddingBlock: 8,
                  paddingInline: 10,
                }}
              >
                <span style={{ color: isActive ? C.acc : C.t3, flexShrink: 0 }}>{item.icon}</span>
                <span
                  style={{
                    color: isActive ? C.acc : C.t3,
                    fontFamily: '"Inter", system-ui, sans-serif',
                    fontSize: 12,
                    fontWeight: isActive ? 500 : 400,
                    lineHeight: '16px',
                  }}
                >
                  {item.label}
                </span>
              </div>
            );
          })}

          {/* System section */}
          <div
            style={{
              color: C.t4,
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.5px',
              lineHeight: '12px',
              paddingBottom: 8,
              paddingInline: 8,
              paddingTop: 12,
              textTransform: 'uppercase',
            }}
          >
            Система
          </div>
          {systemItems.map((item) => {
            const isActive = activeNav === item.key;
            return (
              <div
                key={item.key}
                onClick={() => setActiveNav(item.key)}
                style={{
                  alignItems: 'center',
                  backgroundImage: isActive ? `linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207 / 12%) 0%, oklab(54.1% 0.096 -0.227 / 12%) 100%)` : 'none',
                  border: isActive ? `1px solid #4F6EF733` : '1px solid transparent',
                  borderRadius: 6,
                  boxSizing: 'border-box',
                  color: isActive ? C.acc : C.t3,
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 8,
                  paddingBlock: 8,
                  paddingInline: 10,
                }}
              >
                <span style={{ color: isActive ? C.acc : C.t3, flexShrink: 0 }}>{item.icon}</span>
                <span
                  style={{
                    color: isActive ? C.acc : C.t3,
                    fontFamily: '"Inter", system-ui, sans-serif',
                    fontSize: 12,
                    fontWeight: isActive ? 500 : 400,
                    lineHeight: '16px',
                  }}
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Content area */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            flexDirection: 'column',
            gap: 24,
            overflow: 'auto',
            paddingBlock: 28,
            paddingInline: 32,
          }}
        >
          {/* Profile card */}
          <div
            style={{
              background: C.bgCard,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              paddingBlock: 24,
              paddingInline: 24,
            }}
          >
            <div
              style={{
                color: C.t1,
                fontFamily: '"Space Grotesk", system-ui, sans-serif',
                fontSize: 15,
                fontWeight: 700,
                lineHeight: '18px',
                marginBottom: 20,
              }}
            >
              Профиль
            </div>

            {/* Avatar row */}
            <div style={{ alignItems: 'center', display: 'flex', gap: 20, marginBottom: 24 }}>
              <div style={{ flexShrink: 0, height: 72, position: 'relative', width: 72 }}>
                <div
                  style={{
                    alignItems: 'center',
                    backgroundImage: LOGO_GRAD,
                    borderRadius: '50%',
                    display: 'flex',
                    height: 72,
                    justifyContent: 'center',
                    width: 72,
                  }}
                >
                  <span
                    style={{
                      color: '#FFFFFF',
                      fontFamily: '"Space Grotesk", system-ui, sans-serif',
                      fontSize: 24,
                      fontWeight: 700,
                      lineHeight: '30px',
                    }}
                  >
                    {initials}
                  </span>
                </div>
                <div
                  style={{
                    alignItems: 'center',
                    background: C.bgInput,
                    border: `2px solid ${C.border}`,
                    borderRadius: '50%',
                    bottom: 0,
                    display: 'flex',
                    height: 22,
                    justifyContent: 'center',
                    position: 'absolute',
                    right: 0,
                    width: 22,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M6.5 1.5l2 2-5 5H1.5V7l5-5.5z" stroke={C.t3} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ color: C.t1, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 14, fontWeight: 500, lineHeight: '18px' }}>
                  {user?.name ?? '—'}
                </div>
                <div style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, lineHeight: '16px' }}>
                  {user?.email ?? '—'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div
                    style={{
                      background: C.bgInput,
                      border: `1px solid ${C.inputBorder}`,
                      borderRadius: 6,
                      cursor: 'pointer',
                      paddingBlock: 5,
                      paddingInline: 12,
                    }}
                  >
                    <span style={{ color: C.t2, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, lineHeight: '14px' }}>
                      Загрузить фото
                    </span>
                  </div>
                  <div style={{ cursor: 'pointer', paddingBlock: 5, paddingInline: 12 }}>
                    <span style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, lineHeight: '14px' }}>
                      Удалить
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Form row 1 */}
            <div style={{ display: 'flex', gap: 16 }}>
              {[
                { label: 'Имя', value: user?.name?.split(' ')[0] ?? '' },
                { label: 'Фамилия', value: user?.name?.split(' ')[1] ?? '' },
                { label: 'Должность', value: (user?.systemRoles ?? []).join(', ') || '' },
              ].map((f) => (
                <div key={f.label} style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 6 }}>
                  <div style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, lineHeight: '14px' }}>
                    {f.label}
                  </div>
                  <div
                    style={{
                      background: C.bgInput,
                      border: `1px solid ${C.inputBorder}`,
                      borderRadius: 8,
                      color: C.t1,
                      fontFamily: '"Inter", system-ui, sans-serif',
                      fontSize: 13,
                      lineHeight: '16px',
                      paddingBlock: 8,
                      paddingInline: 12,
                    }}
                  >
                    {f.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Form row 2 */}
            <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
              {/* Email */}
              <div style={{ display: 'flex', flex: 2, flexDirection: 'column', gap: 6 }}>
                <div style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, lineHeight: '14px' }}>
                  Email
                </div>
                <div
                  style={{
                    alignItems: 'center',
                    background: C.bgInput,
                    border: `1px solid ${C.inputBorder}`,
                    borderRadius: 8,
                    display: 'flex',
                    gap: 8,
                    paddingBlock: 8,
                    paddingInline: 12,
                  }}
                >
                  <span style={{ color: C.t1, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13, lineHeight: '16px' }}>
                    {user?.email ?? '—'}
                  </span>
                  <div
                    style={{
                      background: mode === 'light' ? '#1A7F371A' : '#4ADE801A',
                      borderRadius: 10,
                      marginLeft: 'auto',
                      paddingBlock: 2,
                      paddingInline: 8,
                    }}
                  >
                    <span
                      style={{
                        color: mode === 'light' ? '#1A7F37' : '#4ADE80',
                        fontFamily: '"Inter", system-ui, sans-serif',
                        fontSize: 10,
                        lineHeight: '12px',
                      }}
                    >
                      Подтверждён
                    </span>
                  </div>
                </div>
              </div>
              {/* Role */}
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 6 }}>
                <div style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, lineHeight: '14px' }}>
                  Роль
                </div>
                <div
                  style={{
                    alignItems: 'center',
                    background: C.bgInput,
                    border: `1px solid ${C.inputBorder}`,
                    borderRadius: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingBlock: 8,
                    paddingInline: 12,
                  }}
                >
                  <span style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13, lineHeight: '16px' }}>
                    {(user?.systemRoles ?? []).join(', ') || '—'}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M9 4.5L6 7.5L3 4.5" stroke={C.t4} strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Save button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <div
                style={{
                  backgroundImage: LOGO_GRAD,
                  borderRadius: 8,
                  cursor: 'pointer',
                  paddingBlock: 8,
                  paddingInline: 20,
                }}
              >
                <span style={{ color: '#FFFFFF', fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13, fontWeight: 500, lineHeight: '16px' }}>
                  Сохранить изменения
                </span>
              </div>
            </div>
          </div>

          {/* Appearance card */}
          <div
            style={{
              background: C.bgCard,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              paddingBlock: 24,
              paddingInline: 24,
            }}
          >
            <div
              style={{
                color: C.t1,
                fontFamily: '"Space Grotesk", system-ui, sans-serif',
                fontSize: 15,
                fontWeight: 700,
                lineHeight: '18px',
                marginBottom: 16,
              }}
            >
              Внешний вид
            </div>

            {/* Theme tiles */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ color: C.t1, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, fontWeight: 500, lineHeight: '16px', marginBottom: 10 }}>
                Тема интерфейса
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {/* Dark tile */}
                {(['dark', 'light'] as const).map((themeOption) => {
                  const isActive = mode === themeOption;
                  const isDarkTile = themeOption === 'dark';
                  return (
                    <div
                      key={themeOption}
                      onClick={() => setMode(themeOption)}
                      style={{
                        background: isActive
                          ? (mode === 'light' ? '#4F6EF70A' : '#4F6EF70F')
                          : (mode === 'light' ? '#F6F8FA' : '#161B22'),
                        border: isActive ? `2px solid #4F6EF7` : `1px solid ${C.border}`,
                        borderRadius: 10,
                        cursor: 'pointer',
                        display: 'flex',
                        flex: 1,
                        flexDirection: 'column',
                        gap: 8,
                        paddingBlock: 14,
                        paddingInline: 14,
                      }}
                    >
                      {/* Theme preview */}
                      <div
                        style={{
                          alignItems: 'center',
                          background: isDarkTile ? '#080B14' : '#F6F8FA',
                          border: isDarkTile ? 'none' : `1px solid ${C.border}`,
                          borderRadius: 6,
                          display: 'flex',
                          flexShrink: 0,
                          gap: 6,
                          height: 40,
                          paddingInline: 8,
                          width: '100%',
                        }}
                      >
                        <div style={{ background: isDarkTile ? '#21262D' : '#D0D7DE', borderRadius: '50%', flexShrink: 0, height: 8, width: 8 }} />
                        <div style={{ background: isDarkTile ? '#161B22' : '#E8EAED', borderRadius: 2, flex: 1, height: 4 }} />
                        <div style={{ backgroundImage: LOGO_GRAD, borderRadius: 3, flexShrink: 0, height: 12, width: 20 }} />
                      </div>
                      <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
                        <span
                          style={{
                            color: isActive ? C.t1 : C.t3,
                            fontFamily: '"Inter", system-ui, sans-serif',
                            fontSize: 12,
                            fontWeight: 500,
                            lineHeight: '16px',
                          }}
                        >
                          {isDarkTile ? 'Тёмная' : 'Светлая'}
                        </span>
                        {isActive ? (
                          <div
                            style={{
                              alignItems: 'center',
                              background: '#4F6EF7',
                              borderRadius: '50%',
                              display: 'flex',
                              flexShrink: 0,
                              height: 14,
                              justifyContent: 'center',
                              width: 14,
                            }}
                          >
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                              <path d="M1.5 4l2 2 3-3" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        ) : (
                          <div style={{ border: `1px solid ${C.border}`, borderRadius: '50%', flexShrink: 0, height: 14, width: 14 }} />
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Auto tile */}
                <div
                  style={{
                    background: mode === 'light' ? '#F6F8FA' : '#161B22',
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    cursor: 'pointer',
                    display: 'flex',
                    flex: 1,
                    flexDirection: 'column',
                    gap: 8,
                    paddingBlock: 14,
                    paddingInline: 14,
                  }}
                >
                  <div
                    style={{
                      backgroundImage: 'linear-gradient(in oklab 90deg, oklab(15.1% -.0003 -0.020) 50%, oklab(97.8% -0.001 -0.003) 50%)',
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      flexShrink: 0,
                      height: 40,
                      width: '100%',
                    }}
                  />
                  <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, fontWeight: 500, lineHeight: '16px' }}>
                      Авто (ОС)
                    </span>
                    <div style={{ border: `1px solid ${C.border}`, borderRadius: '50%', flexShrink: 0, height: 14, width: 14 }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Language / Timezone / DateFormat */}
            <div style={{ alignItems: 'flex-end', display: 'flex', gap: 16 }}>
              {[
                { label: 'Язык интерфейса', value: '🇷🇺  Русский' },
                { label: 'Часовой пояс', value: 'UTC+3 Москва' },
                { label: 'Формат дат', value: 'DD.MM.YYYY' },
              ].map((f) => (
                <div key={f.label} style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 6 }}>
                  <div style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, lineHeight: '14px' }}>
                    {f.label}
                  </div>
                  <div
                    style={{
                      alignItems: 'center',
                      background: C.bgInput,
                      border: `1px solid ${C.inputBorder}`,
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      paddingBlock: 8,
                      paddingInline: 12,
                    }}
                  >
                    <span style={{ color: C.t1, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13, lineHeight: '16px' }}>
                      {f.value}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M9 4.5L6 7.5L3 4.5" stroke={C.t4} strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notifications card */}
          <div
            style={{
              background: C.bgCard,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              paddingBlock: 24,
              paddingInline: 24,
            }}
          >
            <div
              style={{
                color: C.t1,
                fontFamily: '"Space Grotesk", system-ui, sans-serif',
                fontSize: 15,
                fontWeight: 700,
                lineHeight: '18px',
                marginBottom: 16,
              }}
            >
              Уведомления
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {NOTIF_ROWS.map((row, idx) => (
                <div
                  key={row.key}
                  style={{
                    alignItems: 'center',
                    borderBottom: idx < NOTIF_ROWS.length - 1 ? `1px solid ${C.notifBorder}` : undefined,
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingBlock: 12,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ color: C.t2, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13, lineHeight: '16px' }}>
                      {row.label}
                    </span>
                    <span style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, lineHeight: '14px' }}>
                      {row.sub}
                    </span>
                  </div>
                  <div style={{ alignItems: 'center', display: 'flex', gap: 12 }}>
                    <span style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 10, lineHeight: '12px' }}>Email</span>
                    <Toggle on={notifs[row.key].email} onToggle={() => toggleNotif(row.key, 'email')} C={C} />
                    <span style={{ color: C.t3, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 10, lineHeight: '12px' }}>Telegram</span>
                    <Toggle on={notifs[row.key].telegram} onToggle={() => toggleNotif(row.key, 'telegram')} C={C} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
