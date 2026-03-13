import { Typography } from 'antd';

type FlowIssue = {
  id: string;
  title: string;
  status: string;
};

type FlowTeamCard = {
  id: string;
  name: string;
  stage: string;
  throughput: string;
  wip: string;
  nextSprint: string;
  bottleneck: string;
  flowIssues: FlowIssue[];
};

const FLOW_TEAMS: FlowTeamCard[] = [
  {
    id: 'incidents',
    name: 'Поток инцидентов',
    stage: 'L1 triage -> hotfix -> postmortem',
    throughput: '18 задач / неделя',
    wip: 'WIP 6',
    nextSprint: 'SPR-44 recovery bucket',
    bottleneck: 'Ночной triage и ручная маршрутизация',
    flowIssues: [
      { id: 'FLOW-112', title: 'Свести инциденты по эквайрингу в один intake', status: 'IN_PROGRESS' },
      { id: 'FLOW-118', title: 'Отделить false-positive алерты от реальных деградаций', status: 'OPEN' },
      { id: 'FLOW-121', title: 'Подготовить шаблон postmortem для критичных кейсов', status: 'REVIEW' },
    ],
  },
  {
    id: 'onboarding',
    name: 'Поток клиентского онбординга',
    stage: 'request -> review -> activation',
    throughput: '27 задач / неделя',
    wip: 'WIP 9',
    nextSprint: 'SPR-45 onboarding uplift',
    bottleneck: 'Согласование пакета документов с back-office',
    flowIssues: [
      { id: 'FLOW-203', title: 'Разложить точки ручной валидации в onboarding path', status: 'OPEN' },
      { id: 'FLOW-207', title: 'Собрать поток отказов по сегментам клиентов', status: 'IN_PROGRESS' },
      { id: 'FLOW-214', title: 'Наметить sprint candidate для ускорения активации', status: 'DONE' },
    ],
  },
  {
    id: 'report-ops',
    name: 'Поток отчетных изменений',
    stage: 'regulation -> analysis -> release',
    throughput: '11 задач / неделя',
    wip: 'WIP 4',
    nextSprint: 'SPR-46 compliance sync',
    bottleneck: 'Позднее уточнение требований от смежных систем',
    flowIssues: [
      { id: 'FLOW-301', title: 'Собрать пул изменений под новый отчётный цикл', status: 'OPEN' },
      { id: 'FLOW-305', title: 'Связать изменения формы с impacted datasets', status: 'IN_PROGRESS' },
      { id: 'FLOW-308', title: 'Отделить срочные регуляторные задачи от фоновых', status: 'REVIEW' },
    ],
  },
];

const totalFlowIssues = FLOW_TEAMS.reduce(
  (sum, team) => sum + team.flowIssues.length,
  0,
);

export default function FlowTeamsPage() {
  return (
    <div className="tt-page">
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">Потоковые команды</h1>
          <p className="tt-page-subtitle">
            Синтетическая операционная модель потоков: здесь команды живут вокруг
            непрерывного набора задач, а затем собирают релевантный срез работы в
            спринты.
          </p>
        </div>
      </div>

      <div className="tt-stats-grid">
        <div className="tt-stats-card">
          <span className="tt-stats-label">Потоки</span>
          <span className="tt-stats-value">{FLOW_TEAMS.length}</span>
          <span className="tt-stats-trend">Операционные value streams</span>
        </div>
        <div className="tt-stats-card">
          <span className="tt-stats-label">Задачи потока</span>
          <span className="tt-stats-value">{totalFlowIssues}</span>
          <span className="tt-stats-trend">
            Набор synthetic issues для будущей оркестрации
          </span>
        </div>
        <div className="tt-stats-card">
          <span className="tt-stats-label">Средний throughput</span>
          <span className="tt-stats-value">19</span>
          <span className="tt-stats-trend">Задач в неделю по витрине</span>
        </div>
        <div className="tt-stats-card">
          <span className="tt-stats-label">Sprint buckets</span>
          <span className="tt-stats-value">{FLOW_TEAMS.length}</span>
          <span className="tt-stats-trend">Каждый поток готов к сборке в спринт</span>
        </div>
      </div>

      <div className="tt-team-grid">
        {FLOW_TEAMS.map(team => (
          <section key={team.id} className="tt-panel tt-team-card">
            <div className="tt-team-card-header">
              <div className="tt-team-card-title-wrap">
                <span className="tt-team-card-eyebrow">Flow team</span>
                <Typography.Title level={4} className="tt-team-card-title">
                  {team.name}
                </Typography.Title>
                <Typography.Text className="tt-team-card-subtitle">
                  {team.stage}
                </Typography.Text>
              </div>
              <span className="tt-team-pill">{team.nextSprint}</span>
            </div>

            <div className="tt-team-metrics">
              <div className="tt-team-metric">
                <span className="tt-team-meta-label">Throughput</span>
                <span className="tt-team-metric-value">{team.throughput}</span>
              </div>
              <div className="tt-team-metric">
                <span className="tt-team-meta-label">WIP</span>
                <span className="tt-team-metric-value">{team.wip}</span>
              </div>
              <div className="tt-team-metric">
                <span className="tt-team-meta-label">Bottleneck</span>
                <span className="tt-team-metric-value">{team.bottleneck}</span>
              </div>
            </div>

            <div className="tt-team-section">
              <div className="tt-team-section-title">Задачи потока</div>
              <div className="tt-flow-issue-list">
                {team.flowIssues.map(issue => (
                  <div key={issue.id} className="tt-flow-issue-row">
                    <div className="tt-flow-issue-main">
                      <span className="tt-flow-issue-id">{issue.id}</span>
                      <span className="tt-flow-issue-title">{issue.title}</span>
                    </div>
                    <span className="tt-team-chip">{issue.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="tt-team-footer">
              <span className="tt-team-footer-label">Следующая сборка в спринт</span>
              <Typography.Text className="tt-team-footer-note">
                {team.nextSprint}
              </Typography.Text>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
