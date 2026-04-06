import { useState } from 'react';
import { useThemeStore } from '../store/theme.store';

const LOGO_GRAD =
  'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)';

const DARK_C = {
  bg: '#080B14',
  bgCard: '#0F1320',
  bgSprintBlock: '#161B22',
  border: '#21262D',
  t1: '#E2E8F8',
  t2: '#C9D1D9',
  t3: '#8B949E',
  progBg: '#21262D',
  tabActiveBg: 'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207 / 20%) 0%, oklab(54.1% 0.096 -0.227 / 12%) 100%)',
  tabActiveText: '#4F6EF7',
  tabText: '#8B949E',
  red: '#EF4444',
};

const LIGHT_C = {
  bg: '#F6F8FA',
  bgCard: '#FFFFFF',
  bgSprintBlock: '#F6F8FA',
  border: '#D0D7DE',
  t1: '#1F2328',
  t2: '#424A53',
  t3: '#656D76',
  progBg: '#D0D7DE',
  tabActiveBg: '#4F6EF71A',
  tabActiveText: '#4F6EF7',
  tabText: '#656D76',
  red: '#CF222E',
};

type FlowIssue = { text: string; dotColor: string; textColor: string };

type FlowTeam = {
  id: string;
  abbr: string;
  abbrGrad: string;
  name: string;
  membersCount: number;
  typeTag: string;
  typeTagBg: string;
  typeTagText: string;
  accentBorder: string;
  hasBottleneck: boolean;
  throughput: string;
  throughputColor: string;
  wip: string;
  wipColor: string;
  wipLimit: number;
  cycleTime: string;
  cycleTimeColor: string;
  sprintName: string;
  sprintDates: string;
  sprintProgress: number;
  sprintProgGrad: string;
  sprintPlanned: string;
  flowIssues: FlowIssue[];
};

function getFlowTeams(isLight: boolean): FlowTeam[] {
  const txtActive = isLight ? '#1F2328' : '#C9D1D9';
  const txtMuted = isLight ? '#656D76' : '#8B949E';
  const green = isLight ? '#1A7F37' : '#4ADE80';
  const amber = isLight ? '#D97706' : '#F59E0B';
  const neutral = isLight ? '#1F2328' : '#E2E8F8';
  const muted = isLight ? '#8C959F' : '#8B949E';
  const red = isLight ? '#CF222E' : '#EF4444';
  const purple = isLight ? '#7C3AED' : '#A78BFA';

  return [
    {
      id: 'deliver',
      abbr: 'ПП',
      abbrGrad:
        'linear-gradient(in oklab 135deg, oklab(63.7% 0.188 0.089) 0%, oklab(57.7% 0.191 0.099) 100%)',
      name: 'Платёжный поток',
      membersCount: 6,
      typeTag: 'DELIVER',
      typeTagBg: isLight ? '#CF222E12' : '#EF444414',
      typeTagText: red,
      accentBorder: red,
      hasBottleneck: true,
      throughput: '4.2',
      throughputColor: neutral,
      wip: '12',
      wipColor: amber,
      wipLimit: 8,
      cycleTime: '18д',
      cycleTimeColor: neutral,
      sprintName: 'Спринт 5 · Q2',
      sprintDates: '31 мар — 14 апр',
      sprintProgress: 65,
      sprintProgGrad:
        'linear-gradient(in oklab 90deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)',
      sprintPlanned: '13/20 задач запланировано',
      flowIssues: [
        { text: 'Блокировка проверки SWIFT — 4 дня', dotColor: red, textColor: txtActive },
        { text: 'Ревью архитектуры задержано', dotColor: amber, textColor: txtActive },
        { text: 'WIP превышен на 50%', dotColor: amber, textColor: txtActive },
      ],
    },
    {
      id: 'develop',
      abbr: 'КП',
      abbrGrad: LOGO_GRAD,
      name: 'Клиентский поток',
      membersCount: 7,
      typeTag: 'DEVELOP',
      typeTagBg: isLight ? '#1A7F3714' : '#4F6EF71A',
      typeTagText: isLight ? '#1A7F37' : '#4F6EF7',
      accentBorder: green,
      hasBottleneck: false,
      throughput: '7.8',
      throughputColor: green,
      wip: '6',
      wipColor: green,
      wipLimit: 8,
      cycleTime: '9д',
      cycleTimeColor: neutral,
      sprintName: 'Спринт 3 · Q2',
      sprintDates: '1 апр — 15 апр',
      sprintProgress: 88,
      sprintProgGrad:
        'linear-gradient(in oklab 90deg, oklab(80% -0.160 0.086) 0%, oklab(72.3% -0.166 0.097) 100%)',
      sprintPlanned: '22/25 задач запланировано',
      flowIssues: [
        { text: 'Поток в норме, WIP в пределах', dotColor: green, textColor: txtActive },
        { text: 'Запланировано тех. долг на Q2', dotColor: muted, textColor: txtMuted },
      ],
    },
    {
      id: 'design',
      abbr: 'УА',
      abbrGrad:
        'linear-gradient(in oklab 135deg, oklab(62.7% 0.130 -0.193) 0%, oklab(54.1% 0.096 -0.227) 100%)',
      name: 'UX / Аналитика',
      membersCount: 5,
      typeTag: 'DESIGN',
      typeTagBg: isLight ? '#7C3AED14' : '#A88BFA1A',
      typeTagText: purple,
      accentBorder: purple,
      hasBottleneck: false,
      throughput: '5.1',
      throughputColor: neutral,
      wip: '5',
      wipColor: neutral,
      wipLimit: 6,
      cycleTime: '12д',
      cycleTimeColor: neutral,
      sprintName: 'Design Q2 Wave 1',
      sprintDates: '7 апр — 21 апр',
      sprintProgress: 44,
      sprintProgGrad:
        'linear-gradient(in oklab 90deg, oklab(70.9% 0.064 -0.146) 0%, oklab(54.1% 0.096 -0.227) 100%)',
      sprintPlanned: '11/25 задач запланировано',
      flowIssues: [
        { text: 'Ожидание фидбека от бизнеса', dotColor: amber, textColor: txtActive },
        { text: 'Планируется UI Kit ревью', dotColor: muted, textColor: txtMuted },
      ],
    },
  ];
}

type TabKey = 'all' | 'DELIVER' | 'DEVELOP' | 'DESIGN' | 'bottleneck';

export default function FlowTeamsPage() {
  const { mode } = useThemeStore();
  const isLight = mode === 'light';
  const C = isLight ? LIGHT_C : DARK_C;
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  const FLOW_TEAMS = getFlowTeams(isLight);

  const visibleTeams = FLOW_TEAMS.filter((t) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'bottleneck') return t.hasBottleneck;
    return t.typeTag === activeTab;
  });

  const tabs: { key: TabKey; label: string; dot?: boolean }[] = [
    { key: 'all', label: 'Все' },
    { key: 'DELIVER', label: 'DELIVER' },
    { key: 'DEVELOP', label: 'DEVELOP' },
    { key: 'DESIGN', label: 'DESIGN' },
    { key: 'bottleneck', label: 'Узкие места', dot: true },
  ];

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: C.bg,
        minHeight: '100vh',
        width: '100%',
        paddingBottom: 24,
        paddingInline: 28,
        paddingTop: 28,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
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
              marginBottom: 4,
            }}
          >
            Потоковые команды
          </div>
          <div
            style={{
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13,
              lineHeight: '16px',
              color: C.t3,
            }}
          >
            Поток создания ценности · 3 команды · 18 участников
          </div>
        </div>
        <div
          style={{
            backgroundImage: LOGO_GRAD,
            borderRadius: 8,
            paddingBlock: 9,
            paddingInline: 18,
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
            + Поток-команда
          </span>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                borderRadius: 6,
                paddingBlock: 6,
                paddingInline: 14,
                background: isActive ? C.tabActiveBg : 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {tab.dot && (
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: C.red,
                    flexShrink: 0,
                  }}
                />
              )}
              <span
                style={{
                  fontFamily: '"Inter", system-ui, sans-serif',
                  fontSize: 12,
                  fontWeight: isActive ? 500 : 400,
                  lineHeight: '16px',
                  color: tab.dot ? C.red : isActive ? C.tabActiveText : C.tabText,
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', gap: 16, flex: 1 }}>
        {visibleTeams.map((team) => (
          <div
            key={team.id}
            style={{
              flex: 1,
              background: C.bgCard,
              borderTop: `1px solid ${C.border}`,
              borderRight: `1px solid ${C.border}`,
              borderBottom: `1px solid ${C.border}`,
              borderLeft: `3px solid ${team.accentBorder}`,
              borderRadius: 12,
              paddingBlock: 20,
              paddingInline: 20,
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
            }}
          >
            {/* Bottleneck badge */}
            {team.hasBottleneck && (
              <div
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: isLight ? '#CF222E14' : '#EF44441F',
                  borderRadius: 20,
                  paddingBlock: 3,
                  paddingInline: 8,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1L9 9H1L5 1Z" fill={C.red} />
                </svg>
                <span
                  style={{
                    fontFamily: '"Inter", system-ui, sans-serif',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.3px',
                    lineHeight: '12px',
                    color: C.red,
                  }}
                >
                  УЗКОЕ МЕСТО
                </span>
              </div>
            )}

            {/* Team header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundImage: team.abbrGrad,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontFamily: '"Space Grotesk", system-ui, sans-serif',
                    fontSize: 13,
                    fontWeight: 700,
                    lineHeight: '16px',
                    color: '#FFFFFF',
                  }}
                >
                  {team.abbr}
                </span>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: '"Space Grotesk", system-ui, sans-serif',
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
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
                  {team.membersCount} участников
                </div>
              </div>
            </div>

            {/* Type tag */}
            <div
              style={{
                display: 'inline-flex',
                background: team.typeTagBg,
                borderRadius: 4,
                paddingBlock: 3,
                paddingInline: 8,
                marginBottom: 16,
                width: 'fit-content',
              }}
            >
              <span
                style={{
                  fontFamily: '"Inter", system-ui, sans-serif',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.5px',
                  lineHeight: '12px',
                  color: team.typeTagText,
                }}
              >
                {team.typeTag}
              </span>
            </div>

            {/* Metrics row */}
            <div style={{ display: 'flex', marginBottom: 16, border: isLight ? `1px solid ${C.border}` : undefined, borderRadius: isLight ? 8 : undefined, overflow: isLight ? 'hidden' : undefined }}>
              {[
                {
                  value: team.throughput,
                  color: team.throughputColor,
                  label1: 'ПРОПУСКНАЯ',
                  label2: 'СПОСОБНОСТЬ',
                  border: true,
                },
                {
                  value: team.wip,
                  color: team.wipColor,
                  label1: 'WIP',
                  label2: `(лимит ${team.wipLimit})`,
                  border: true,
                },
                {
                  value: team.cycleTime,
                  color: team.cycleTimeColor,
                  label1: 'СРЕДНЕЕ',
                  label2: 'ВРЕМЯ ЦИКЛА',
                  border: false,
                },
              ].map(({ value, color, label1, label2, border }) => (
                <div
                  key={label1}
                  style={{
                    flex: 1,
                    paddingBlock: 10,
                    borderRight: border ? `1px solid ${C.border}` : 'none',
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
                      letterSpacing: '0.5px',
                      lineHeight: '12px',
                      marginTop: 2,
                      textAlign: 'center',
                      color: C.t3,
                    }}
                  >
                    {label1}
                  </div>
                  <div
                    style={{
                      fontFamily: '"Inter", system-ui, sans-serif',
                      fontSize: 10,
                      letterSpacing: '0.5px',
                      lineHeight: '12px',
                      textAlign: 'center',
                      color: C.t3,
                    }}
                  >
                    {label2}
                  </div>
                </div>
              ))}
            </div>

            {/* Sprint block */}
            <div
              style={{
                background: C.bgSprintBlock,
                borderRadius: 8,
                paddingBlock: 12,
                paddingInline: 12,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  fontFamily: '"Inter", system-ui, sans-serif',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.5px',
                  lineHeight: '12px',
                  textTransform: 'uppercase',
                  color: C.t3,
                  marginBottom: 8,
                }}
              >
                Следующий спринт
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontFamily: '"Inter", system-ui, sans-serif',
                    fontSize: 12,
                    lineHeight: '16px',
                    color: C.t1,
                  }}
                >
                  {team.sprintName}
                </span>
                <span
                  style={{
                    fontFamily: '"Inter", system-ui, sans-serif',
                    fontSize: 11,
                    lineHeight: '14px',
                    color: C.t3,
                  }}
                >
                  {team.sprintDates}
                </span>
              </div>
              <div
                style={{
                  background: C.progBg,
                  borderRadius: 2,
                  height: 3,
                  marginTop: 6,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    backgroundImage: team.sprintProgGrad,
                    borderRadius: 2,
                    height: '100%',
                    width: `${team.sprintProgress}%`,
                  }}
                />
              </div>
              <div
                style={{
                  fontFamily: '"Inter", system-ui, sans-serif',
                  fontSize: 11,
                  lineHeight: '14px',
                  marginTop: 4,
                  color: C.t3,
                }}
              >
                {team.sprintPlanned}
              </div>
            </div>

            {/* Flow Issues */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: '"Inter", system-ui, sans-serif',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.5px',
                  lineHeight: '12px',
                  textTransform: 'uppercase',
                  color: C.t3,
                  marginBottom: 6,
                }}
              >
                Flow Issues
              </div>
              {team.flowIssues.map((issue, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: i < team.flowIssues.length - 1 ? 4 : 0,
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: issue.dotColor,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: '"Inter", system-ui, sans-serif',
                      fontSize: 12,
                      lineHeight: '16px',
                      color: issue.textColor,
                    }}
                  >
                    {issue.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
