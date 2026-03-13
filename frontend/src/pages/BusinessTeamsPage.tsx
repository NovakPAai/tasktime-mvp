import { Typography } from 'antd';

type BusinessTeamCard = {
  id: string;
  name: string;
  domain: string;
  owner: string;
  capacity: string;
  kpi: string;
  activeSprints: string[];
  initiatives: string[];
  backlog: string[];
};

const BUSINESS_TEAMS: BusinessTeamCard[] = [
  {
    id: 'payments',
    name: 'Платежный контур',
    domain: 'Core billing and checkout reliability',
    owner: 'Анна Власова',
    capacity: '9 человек, 2 product streams',
    kpi: 'Успешные оплаты 99.3%',
    activeSprints: ['SPR-41', 'SPR-42'],
    initiatives: [
      'Ускорение подтверждения платежей для крупных клиентов',
      'Новый сценарий возвратов для fintech-подписок',
      'Нормализация SLA по эквайрингу в пиковые окна',
    ],
    backlog: [
      'Собрать единый платежный health dashboard',
      'Уточнить продуктовые правила частичных возвратов',
      'Подготовить гипотезы для anti-fraud pre-check',
    ],
  },
  {
    id: 'reporting',
    name: 'Регуляторная отчетность',
    domain: 'Compliance reporting and audit export',
    owner: 'Илья Корнеев',
    capacity: '7 человек, 1 аналитический контур',
    kpi: 'Выгрузки без ручной правки 94%',
    activeSprints: ['SPR-39'],
    initiatives: [
      'Новый пакет витрин для квартальной отчетности',
      'Снижение времени сборки регламентного пакета',
      'Продуктовая модель версий отчетных шаблонов',
    ],
    backlog: [
      'Свести единый реестр обязательных форм',
      'Подготовить карту зависимостей по источникам данных',
      'Описать MVP workflow согласования изменений формы',
    ],
  },
  {
    id: 'client-ops',
    name: 'Клиентские операции',
    domain: 'Onboarding, кабинет клиента, support touchpoints',
    owner: 'Мария Осипова',
    capacity: '11 человек, 3 customer journeys',
    kpi: 'Time-to-onboard 2.4 дня',
    activeSprints: ['SPR-40', 'SPR-43'],
    initiatives: [
      'Упрощение онбординга корпоративного клиента',
      'Сквозной сценарий обработки клиентского запроса',
      'Продуктовый разрез по причинам отклонения заявки',
    ],
    backlog: [
      'Собрать backlog улучшений личного кабинета',
      'Разложить CJM по ролям back-office',
      'Приоритизировать сокращение ручных проверок',
    ],
  },
];

const totalInitiatives = BUSINESS_TEAMS.reduce(
  (sum, team) => sum + team.initiatives.length,
  0,
);
const totalSyntheticBacklog = BUSINESS_TEAMS.reduce(
  (sum, team) => sum + team.backlog.length,
  0,
);
const activeSprintCount = new Set(
  BUSINESS_TEAMS.flatMap(team => team.activeSprints),
).size;

export default function BusinessTeamsPage() {
  return (
    <div className="tt-page">
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">Бизнес-функциональные команды</h1>
          <p className="tt-page-subtitle">
            Синтетическая продуктовая витрина команд, доменов и инициатив. Здесь
            можно развивать ownership-модель рядом с проектами, но без привязки к
            runtime данным на первом шаге.
          </p>
        </div>
      </div>

      <div className="tt-stats-grid">
        <div className="tt-stats-card">
          <span className="tt-stats-label">Команды</span>
          <span className="tt-stats-value">{BUSINESS_TEAMS.length}</span>
          <span className="tt-stats-trend">Продуктовые домены в витрине</span>
        </div>
        <div className="tt-stats-card">
          <span className="tt-stats-label">Активные инициативы</span>
          <span className="tt-stats-value">{totalInitiatives}</span>
          <span className="tt-stats-trend">
            Синтетический набор discovery/delivery work
          </span>
        </div>
        <div className="tt-stats-card">
          <span className="tt-stats-label">Активные спринты</span>
          <span className="tt-stats-value">{activeSprintCount}</span>
          <span className="tt-stats-trend">
            Команды уже привязаны к будущим sprint buckets
          </span>
        </div>
        <div className="tt-stats-card">
          <span className="tt-stats-label">Synthetic backlog</span>
          <span className="tt-stats-value">{totalSyntheticBacklog}</span>
          <span className="tt-stats-trend">Заготовка для следующей детализации</span>
        </div>
      </div>

      <div className="tt-team-grid">
        {BUSINESS_TEAMS.map(team => (
          <section key={team.id} className="tt-panel tt-team-card">
            <div className="tt-team-card-header">
              <div className="tt-team-card-title-wrap">
                <span className="tt-team-card-eyebrow">Business team</span>
                <Typography.Title level={4} className="tt-team-card-title">
                  {team.name}
                </Typography.Title>
                <Typography.Text className="tt-team-card-subtitle">
                  {team.domain}
                </Typography.Text>
              </div>
              <span className="tt-team-pill">{team.kpi}</span>
            </div>

            <div className="tt-team-meta-row">
              <div className="tt-team-meta-block">
                <span className="tt-team-meta-label">Owner</span>
                <span className="tt-team-meta-value">{team.owner}</span>
              </div>
              <div className="tt-team-meta-block">
                <span className="tt-team-meta-label">Capacity</span>
                <span className="tt-team-meta-value">{team.capacity}</span>
              </div>
            </div>

            <div className="tt-team-section">
              <div className="tt-team-section-title">Активные инициативы</div>
              <ul className="tt-team-list">
                {team.initiatives.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="tt-team-section">
              <div className="tt-team-section-title">Synthetic backlog</div>
              <ul className="tt-team-list tt-team-list-muted">
                {team.backlog.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="tt-team-footer">
              <span className="tt-team-footer-label">Спринты</span>
              <div className="tt-team-chip-row">
                {team.activeSprints.map(sprint => (
                  <span key={sprint} className="tt-team-chip">
                    {sprint}
                  </span>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
