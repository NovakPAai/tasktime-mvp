import { useThemeStore } from '../store/theme.store';

const LOGO_GRAD =
  'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)';

const DARK_C = {
  bg: '#080B14',
  bgCard: '#0F1320',
  bgStat: '#161B22',
  border: '#21262D',
  t1: '#E2E8F8',
  t2: '#C9D1D9',
  t3: '#8B949E',
  t4: '#484F58',
  acc: '#4F6EF7',
  progBg: '#21262D',
};

const LIGHT_C = {
  bg: '#F0F2FA',
  bgCard: '#FFFFFF',
  bgStat: '#F0F2FA',
  border: '#D0D7DE',
  t1: '#1F2328',
  t2: '#424A53',
  t3: '#6E7781',
  t4: '#AFB8C1',
  acc: '#4F6EF7',
  progBg: '#D0D7DE',
};

type StatusKey = 'ACTIVE' | 'PAUSED';

const STATUS_CFG: Record<StatusKey, { label: string; badgeBg: string; badgeText: string }> = {
  ACTIVE: { label: 'АКТИВНА', badgeBg: '#4ADE801F', badgeText: '#4ADE80' },
  PAUSED: { label: 'НА ПАУЗЕ', badgeBg: '#8B949E1F', badgeText: '#8B949E' },
};

type IconType = 'payments' | 'risks' | 'analytics';

function TeamIcon({ type, gradient }: { type: IconType; gradient: string }) {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundImage: gradient,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {type === 'payments' && (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="2" y="4" width="14" height="10" rx="2" stroke="#FFFFFF" strokeWidth="1.5" />
          <path d="M2 8h14" stroke="#FFFFFF" strokeWidth="1.5" />
        </svg>
      )}
      {type === 'risks' && (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 3L16 15H2L9 3z" stroke="#FFFFFF" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M9 8v3M9 12.5v.5" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
      {type === 'analytics' && (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="2" y="10" width="3" height="6" rx="1" fill="#FFFFFF" />
          <rect x="7.5" y="7" width="3" height="9" rx="1" fill="#FFFFFF" />
          <rect x="13" y="4" width="3" height="12" rx="1" fill="#FFFFFF" />
        </svg>
      )}
    </div>
  );
}

const TEAMS_DATA = [
  {
    id: 'payments',
    icon: 'payments' as IconType,
    iconGradient: LOGO_GRAD,
    name: 'Платежи',
    owner: 'A. Kovaleva',
    status: 'ACTIVE' as StatusKey,
    membersCount: 12,
    kpiValue: '94%',
    kpiColor: '#4ADE80',
    sprintsCount: 3,
    sprintsColor: '#F59E0B',
    initiatives: [
      { text: 'Переход на SBP 2.0', color: '#C9D1D9' },
      { text: 'Интеграция эквайринга', color: '#C9D1D9' },
      { text: 'Рефакторинг биллинга', color: '#8B949E' },
    ],
    progressWidth: '68%',
    progressGrad:
      'linear-gradient(in oklab 90deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)',
  },
  {
    id: 'risks',
    icon: 'risks' as IconType,
    iconGradient:
      'linear-gradient(in oklab 135deg, oklab(63.7% 0.188 0.089) 0%, oklab(57.7% 0.191 0.099) 100%)',
    name: 'Риски и ИБ',
    owner: 'M. Volkov',
    status: 'ACTIVE' as StatusKey,
    membersCount: 8,
    kpiValue: '71%',
    kpiColor: '#F59E0B',
    sprintsCount: 2,
    sprintsColor: '#F59E0B',
    initiatives: [
      { text: 'Аудит ФЗ-152', color: '#C9D1D9' },
      { text: 'DLP интеграция', color: '#C9D1D9' },
      { text: 'Тест-пенетрейшн Q2', color: '#8B949E' },
    ],
    progressWidth: '71%',
    progressGrad:
      'linear-gradient(in oklab 90deg, oklab(76.9% 0.056 0.155) 0%, oklab(66.6% 0.083 0.134) 100%)',
  },
  {
    id: 'analytics',
    icon: 'analytics' as IconType,
    iconGradient:
      'linear-gradient(in oklab 135deg, oklab(69.6% -0.142 0.045) 0%, oklab(59.6% -0.122 0.037) 100%)',
    name: 'Аналитика',
    owner: 'S. Voronov',
    status: 'PAUSED' as StatusKey,
    membersCount: 5,
    kpiValue: '55%',
    kpiColor: '#8B949E',
    sprintsCount: 1,
    sprintsColor: '#8B949E',
    initiatives: [
      { text: 'BI дашборды для CIO', color: '#8B949E' },
      { text: 'Отчёт по оттоку', color: '#8B949E' },
      { text: 'ML-модель рисков', color: '#484F58' },
    ],
    progressWidth: '55%',
    progressGrad:
      'linear-gradient(in oklab 90deg, oklab(66.2% -0.006 -0.017) 0%, oklab(56.5% -0.006 -0.018) 100%)',
  },
];

export default function BusinessTeamsPage() {
  const { mode } = useThemeStore();
  const C = mode === 'light' ? LIGHT_C : DARK_C;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: C.bg,
        minHeight: '100vh',
        width: '100%',
        paddingBlock: 28,
        paddingInline: 32,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: '"Space Grotesk", system-ui, sans-serif',
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: '28px',
              color: C.t1,
            }}
          >
            Бизнес-команды
          </div>
          <div
            style={{
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13,
              lineHeight: '16px',
              color: C.t3,
              marginTop: 4,
            }}
          >
            Функциональные домены и их показатели
          </div>
        </div>
        <div
          style={{
            backgroundImage: LOGO_GRAD,
            borderRadius: 8,
            paddingBlock: 8,
            paddingInline: 16,
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13,
              fontWeight: 500,
              lineHeight: '16px',
              color: '#FFFFFF',
            }}
          >
            + Бизнес-команда
          </span>
        </div>
      </div>

      {/* Cards row */}
      <div style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden' }}>
        {TEAMS_DATA.map((team) => {
          const sCfg = STATUS_CFG[team.status];
          return (
            <div
              key={team.id}
              style={{
                flex: 1,
                background: C.bgCard,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              {/* Card header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <TeamIcon type={team.icon} gradient={team.iconGradient} />
                  <div>
                    <div
                      style={{
                        fontFamily: '"Space Grotesk", system-ui, sans-serif',
                        fontSize: 15,
                        fontWeight: 700,
                        lineHeight: '18px',
                        color: C.t1,
                      }}
                    >
                      {team.name}
                    </div>
                    <div
                      style={{
                        fontFamily: '"Inter", system-ui, sans-serif',
                        fontSize: 11,
                        lineHeight: '14px',
                        color: C.t3,
                      }}
                    >
                      Владелец: {team.owner}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    background: sCfg.badgeBg,
                    borderRadius: 20,
                    paddingBlock: 3,
                    paddingInline: 8,
                    display: 'inline-block',
                  }}
                >
                  <span
                    style={{
                      fontFamily: '"Inter", system-ui, sans-serif',
                      fontSize: 10,
                      fontWeight: 600,
                      lineHeight: '12px',
                      color: sCfg.badgeText,
                    }}
                  >
                    {sCfg.label}
                  </span>
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: 'flex', gap: 16 }}>
                {[
                  { value: String(team.membersCount), color: C.acc, label: 'Участников' },
                  { value: team.kpiValue, color: team.kpiColor, label: 'KPI выполнен' },
                  { value: String(team.sprintsCount), color: team.sprintsColor, label: team.sprintsCount === 1 ? 'Спринт' : 'Спринта' },
                ].map(({ value, color, label }) => (
                  <div
                    key={label}
                    style={{
                      flex: 1,
                      background: C.bgStat,
                      borderRadius: 8,
                      paddingBlock: 10,
                      paddingInline: 10,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: '"Space Grotesk", system-ui, sans-serif',
                        fontSize: 20,
                        fontWeight: 700,
                        lineHeight: '24px',
                        textAlign: 'center',
                        color,
                      }}
                    >
                      {value}
                    </div>
                    <div
                      style={{
                        fontFamily: '"Inter", system-ui, sans-serif',
                        fontSize: 10,
                        lineHeight: '12px',
                        marginTop: 2,
                        textAlign: 'center',
                        color: C.t3,
                      }}
                    >
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Initiatives */}
              <div>
                <div
                  style={{
                    fontFamily: '"Inter", system-ui, sans-serif',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.5px',
                    lineHeight: '12px',
                    textTransform: 'uppercase',
                    color: C.t4,
                    marginBottom: 6,
                  }}
                >
                  Инициативы
                </div>
                {team.initiatives.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      fontFamily: '"Inter", system-ui, sans-serif',
                      fontSize: 12,
                      lineHeight: '16px',
                      color: item.color,
                      marginBottom: i < team.initiatives.length - 1 ? 3 : 0,
                    }}
                  >
                    • {item.text}
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div
                style={{
                  background: C.progBg,
                  borderRadius: 2,
                  height: 3,
                  marginTop: 'auto',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    backgroundImage: team.progressGrad,
                    borderRadius: 2,
                    height: '100%',
                    width: team.progressWidth,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
