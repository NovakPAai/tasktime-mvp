const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query } = require('../db');

// ——— Users ———
const USERS = [
  // Demo users
  { email: 'alice@demo.com',       name: 'Alice Admin',      role: 'admin',   password: 'demo123' },
  { email: 'bob@demo.com',         name: 'Bob User',         role: 'user',    password: 'demo123' },
  { email: 'eve@demo.com',         name: 'Eve Manager',      role: 'manager', password: 'demo123' },
  // CIO
  { email: 'andrey@company.com',   name: 'Андрей Иванов',    role: 'cio',     password: 'password123' },
  // Developers
  { email: 'dev1@company.com',     name: 'Михаил Соколов',   role: 'user',    password: 'dev123' },
  { email: 'dev2@company.com',     name: 'Наталья Попова',   role: 'user',    password: 'dev123' },
  { email: 'dev3@company.com',     name: 'Дмитрий Козлов',   role: 'user',    password: 'dev123' },
  { email: 'dev4@company.com',     name: 'Ольга Новикова',   role: 'user',    password: 'dev123' },
  // Team users
  { email: 'pavel@tasktime.demo',  name: 'Pavel',            role: 'admin',   password: 'tasktime24' },
  { email: 'georgiy@tasktime.demo',name: 'Georgiy',          role: 'viewer',  password: 'tasktime24' },
  { email: 'olesya@tasktime.demo', name: 'Olesya',           role: 'user',    password: 'tasktime24' },
  { email: 'andrey@tasktime.demo', name: 'Andrey',           role: 'cio',     password: 'tasktime24' },
  { email: 'anton@tasktime.demo',  name: 'Anton',            role: 'user',    password: 'tasktime24' },
];

async function seedUsers() {
  const hashes = {};
  const passwords = [...new Set(USERS.map(u => u.password))];
  for (const p of passwords) hashes[p] = await bcrypt.hash(p, 10);

  const ids = {};
  for (const u of USERS) {
    const r = await query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, name = $3, role = $4
       RETURNING id`,
      [u.email, hashes[u.password], u.name, u.role]
    );
    ids[u.email] = r.rows[0].id;
    console.log('  user:', u.email, '→', ids[u.email]);
  }
  return ids;
}

// ——— Business Functions ———
async function seedBusinessFunctions() {
  const funcs = [
    { name: 'ИТ-инфраструктура', description: 'Сопровождение и развитие ИТ-инфраструктуры' },
    { name: 'Информационная безопасность', description: 'Защита информации и соответствие требованиям' },
    { name: 'Разработка', description: 'Разработка и сопровождение ПО' },
  ];
  const ids = {};
  for (const f of funcs) {
    const r = await query(
      `INSERT INTO business_functions (name, description)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [f.name, f.description]
    );
    if (r.rows.length) {
      ids[f.name] = r.rows[0].id;
    } else {
      const ex = await query('SELECT id FROM business_functions WHERE name = $1', [f.name]);
      ids[f.name] = ex.rows[0].id;
    }
    console.log('  biz_func:', f.name, '→', ids[f.name]);
  }
  return ids;
}

// ——— Projects ———
async function seedProjects(userIds) {
  const projects = [
    {
      name: 'Цифровой банк 2.0',
      description: 'Новая платформа ДБО для физических лиц',
      business_goal: 'Увеличить долю цифровых транзакций с 34% до 60% к Q4 2025',
      budget: 42000000, planned_revenue: 180000000,
      owner_id: userIds['eve@demo.com'], status: 'active',
    },
    {
      name: 'AML Модуль',
      description: 'Система мониторинга и противодействия отмыванию денег (115-ФЗ)',
      business_goal: 'Соответствие требованиям ЦБ РФ. Снижение ложных срабатываний на 40%',
      budget: 18000000, planned_revenue: 0,
      owner_id: userIds['eve@demo.com'], status: 'active',
    },
    {
      name: 'RegTech Platform',
      description: 'Автоматизация регуляторной отчётности в ЦБ и Росфинмониторинг',
      business_goal: 'Сократить трудозатраты на подготовку отчётности на 70%',
      budget: 29000000, planned_revenue: 0,
      owner_id: userIds['alice@demo.com'], status: 'active',
    },
  ];
  const ids = [];
  for (const p of projects) {
    const r = await query(
      `INSERT INTO projects (name, description, business_goal, budget, planned_revenue, owner_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [p.name, p.description, p.business_goal, p.budget, p.planned_revenue, p.owner_id, p.status]
    );
    if (r.rows.length) {
      ids.push(r.rows[0].id);
      console.log('  project:', p.name, '→', r.rows[0].id);
    } else {
      const ex = await query('SELECT id FROM projects WHERE name = $1', [p.name]);
      ids.push(ex.rows[0].id);
      console.log('  project (existing):', p.name, '→', ex.rows[0].id);
    }
  }
  return ids; // [proj1Id, proj2Id, proj3Id]
}

// ——— Product Teams ———
async function seedProductTeams(userIds) {
  const teams = [
    { name: 'Core Banking Team', description: 'Разработка и развитие ядра банковской платформы', lead: 'eve@demo.com' },
    { name: 'Digital Experience Team', description: 'Мобильные и веб-продукты, UX-исследования и дизайн', lead: 'alice@demo.com' },
  ];
  const ids = [];
  for (const t of teams) {
    const r = await query(
      `INSERT INTO product_teams (name, description, lead_id, status)
       VALUES ($1,$2,$3,'active')
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [t.name, t.description, userIds[t.lead]]
    );
    let teamId;
    if (r.rows.length) { teamId = r.rows[0].id; }
    else {
      const ex = await query('SELECT id FROM product_teams WHERE name = $1', [t.name]);
      teamId = ex.rows[0].id;
    }
    ids.push(teamId);
    console.log('  team:', t.name, '→', teamId);

    // Members
    const members = [
      userIds['dev1@company.com'],
      userIds['dev2@company.com'],
      userIds['dev3@company.com'],
      userIds['dev4@company.com'],
      userIds[t.lead],
    ].filter(Boolean);
    for (const uid of members) {
      await query(
        `INSERT INTO product_team_members (team_id, user_id, role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING`,
        [teamId, uid]
      );
    }
  }
  return ids; // [team1Id, team2Id]
}

// ——— Helper: insert task_item ———
async function insertItem({ parent_id, level, title, description, acceptance_criteria,
  context_type, context_id, priority = 'medium', status = 'open',
  story_points, assignee_id, creator_id }) {
  const r = await query(
    `INSERT INTO task_items
       (parent_id, level, title, description, acceptance_criteria,
        context_type, context_id, priority, status, story_points, assignee_id, creator_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [parent_id||null, level, title, description||null, acceptance_criteria||null,
     context_type||null, context_id||null, priority, status, story_points||null,
     assignee_id||null, creator_id]
  );
  return r.rows[0].id;
}

// ——— Task items: Project 1 — Цифровой банк 2.0 ———
async function seedProject1Tasks(projId, userIds) {
  const admin = userIds['alice@demo.com'];
  const d1 = userIds['dev1@company.com'];
  const d2 = userIds['dev2@company.com'];
  const d3 = userIds['dev3@company.com'];
  const d4 = userIds['dev4@company.com'];

  // Epic 1.1
  const e11 = await insertItem({ level: 'epic', title: 'Личный кабинет клиента',
    description: 'Полный рефакторинг и редизайн личного кабинета клиента',
    context_type: 'project', context_id: projId, priority: 'high', status: 'in_progress', creator_id: admin });

  const s111 = await insertItem({ parent_id: e11, level: 'story', title: 'Авторизация через Госуслуги',
    acceptance_criteria: 'Клиент входит через ЕСИА. Время авторизации < 3 сек. Fallback на SMS.',
    context_type: 'project', context_id: projId, status: 'done', story_points: 8, creator_id: admin });
  await insertItem({ parent_id: s111, level: 'subtask', title: 'Интеграция с ЕСИА API', context_type: 'project', context_id: projId, assignee_id: d1, status: 'done', creator_id: admin });
  await insertItem({ parent_id: s111, level: 'subtask', title: 'UI форма входа через Госуслуги', context_type: 'project', context_id: projId, assignee_id: d2, status: 'done', creator_id: admin });
  await insertItem({ parent_id: s111, level: 'subtask', title: 'Тесты авторизационного флоу', context_type: 'project', context_id: projId, assignee_id: d3, status: 'done', creator_id: admin });

  const s112 = await insertItem({ parent_id: e11, level: 'story', title: 'Дашборд счетов и карт',
    acceptance_criteria: 'Все счета и карты на одном экране. Баланс обновляется в реальном времени.',
    context_type: 'project', context_id: projId, status: 'in_progress', story_points: 13, creator_id: admin });
  await insertItem({ parent_id: s112, level: 'subtask', title: 'API агрегации счетов', context_type: 'project', context_id: projId, assignee_id: d1, status: 'in_progress', creator_id: admin });
  await insertItem({ parent_id: s112, level: 'subtask', title: 'UI карточки счёта', context_type: 'project', context_id: projId, assignee_id: d2, status: 'open', creator_id: admin });
  await insertItem({ parent_id: s112, level: 'subtask', title: 'Сортировка и фильтрация', context_type: 'project', context_id: projId, assignee_id: d4, status: 'open', creator_id: admin });

  // Epic 1.2
  const e12 = await insertItem({ level: 'epic', title: 'Платёжный модуль',
    description: 'Переводы, платежи, шаблоны операций',
    context_type: 'project', context_id: projId, priority: 'critical', status: 'open', creator_id: admin });

  const s121 = await insertItem({ parent_id: e12, level: 'story', title: 'Переводы между своими счетами',
    acceptance_criteria: 'Перевод выполняется за < 5 сек. Комиссия 0%. Лимит 1М руб/день.',
    context_type: 'project', context_id: projId, status: 'open', story_points: 5, creator_id: admin });
  await insertItem({ parent_id: s121, level: 'subtask', title: 'Валидация лимитов и остатков', context_type: 'project', context_id: projId, assignee_id: d1, status: 'open', creator_id: admin });
  await insertItem({ parent_id: s121, level: 'subtask', title: 'UI формы перевода', context_type: 'project', context_id: projId, assignee_id: d2, status: 'open', creator_id: admin });

  console.log('  project1 tasks seeded');
}

// ——— Task items: Project 2 — AML Модуль ———
async function seedProject2Tasks(projId, userIds) {
  const admin = userIds['alice@demo.com'];
  const d3 = userIds['dev3@company.com'];
  const d4 = userIds['dev4@company.com'];

  const e21 = await insertItem({ level: 'epic', title: 'Скоринг транзакций',
    description: 'Автоматическая оценка риска каждой транзакции в реальном времени',
    context_type: 'project', context_id: projId, priority: 'critical', status: 'in_progress', creator_id: admin });

  const s211 = await insertItem({ parent_id: e21, level: 'story', title: 'Базовые правила скоринга',
    acceptance_criteria: 'Покрыты все 12 типовых схем из методологии ЦБ. Latency < 100ms.',
    context_type: 'project', context_id: projId, status: 'done', story_points: 21, creator_id: admin });
  await insertItem({ parent_id: s211, level: 'subtask', title: 'Правило: суммы > 600к руб', context_type: 'project', context_id: projId, status: 'done', creator_id: admin });
  await insertItem({ parent_id: s211, level: 'subtask', title: 'Правило: нетипичная география', context_type: 'project', context_id: projId, status: 'done', creator_id: admin });
  await insertItem({ parent_id: s211, level: 'subtask', title: 'Правило: частые малые переводы (смурфинг)', context_type: 'project', context_id: projId, status: 'done', creator_id: admin });

  const s212 = await insertItem({ parent_id: e21, level: 'story', title: 'ML-модель скоринга',
    acceptance_criteria: 'Точность модели > 94%. Ложные срабатывания < 2%.',
    context_type: 'project', context_id: projId, status: 'in_progress', story_points: 34, creator_id: admin });
  await insertItem({ parent_id: s212, level: 'subtask', title: 'Подготовка обучающей выборки 500к транзакций', context_type: 'project', context_id: projId, assignee_id: d3, status: 'done', creator_id: admin });
  await insertItem({ parent_id: s212, level: 'subtask', title: 'Обучение модели XGBoost', context_type: 'project', context_id: projId, assignee_id: d3, status: 'in_progress', creator_id: admin });
  await insertItem({ parent_id: s212, level: 'subtask', title: 'A/B тест модели vs правила', context_type: 'project', context_id: projId, assignee_id: d4, status: 'open', creator_id: admin });

  console.log('  project2 tasks seeded');
}

// ——— Task items: Project 3 — RegTech Platform ———
async function seedProject3Tasks(projId, userIds) {
  const admin = userIds['alice@demo.com'];
  const d2 = userIds['dev2@company.com'];
  const d4 = userIds['dev4@company.com'];

  const e31 = await insertItem({ level: 'epic', title: 'Отчётность МСФО',
    description: 'Автоформирование отчётности по МСФО 9 и МСФО 7',
    context_type: 'project', context_id: projId, priority: 'high', status: 'open', creator_id: admin });

  const s311 = await insertItem({ parent_id: e31, level: 'story', title: 'Шаблоны МСФО 9',
    acceptance_criteria: 'Шаблон соответствует последней редакции от 01.01.2024. Автозаполнение > 80%.',
    context_type: 'project', context_id: projId, status: 'open', story_points: 13, creator_id: admin });
  await insertItem({ parent_id: s311, level: 'subtask', title: 'Анализ требований регулятора', context_type: 'project', context_id: projId, assignee_id: d4, status: 'in_progress', creator_id: admin });
  await insertItem({ parent_id: s311, level: 'subtask', title: 'Дизайн шаблона в Excel-формате', context_type: 'project', context_id: projId, assignee_id: d2, status: 'open', creator_id: admin });

  console.log('  project3 tasks seeded');
}

// ——— Task items: Quick tasks (business functions) ———
async function seedQuickTasks(userIds) {
  const admin = userIds['alice@demo.com'];
  const d1 = userIds['dev1@company.com'];

  // IT Infrastructure
  const eIT = await insertItem({ level: 'epic', title: 'Плановые работы Q3 2025',
    description: 'Регламентные работы по инфраструктуре',
    context_type: 'quick', context_id: null, priority: 'medium', status: 'in_progress', creator_id: admin });

  const sSSL = await insertItem({ parent_id: eIT, level: 'story', title: 'Обновление SSL-сертификатов',
    acceptance_criteria: 'Все сертификаты обновлены, срок действия > 1 года.',
    context_type: 'quick', context_id: null, status: 'in_progress', creator_id: admin });
  await insertItem({ parent_id: sSSL, level: 'subtask', title: 'Обновить cert для api.bank.ru', context_type: 'quick', context_id: null, status: 'done', creator_id: admin });
  await insertItem({ parent_id: sSSL, level: 'subtask', title: 'Обновить cert для mobile.bank.ru', context_type: 'quick', context_id: null, status: 'open', creator_id: admin });

  const sPG = await insertItem({ parent_id: eIT, level: 'story', title: 'Миграция на PostgreSQL 16',
    acceptance_criteria: 'Миграция без даунтайма. Все тесты зелёные.',
    context_type: 'quick', context_id: null, status: 'open', creator_id: admin });
  await insertItem({ parent_id: sPG, level: 'subtask', title: 'Тестирование совместимости на staging', context_type: 'quick', context_id: null, assignee_id: d1, status: 'in_progress', creator_id: admin });

  // Information Security
  const eIB = await insertItem({ level: 'epic', title: 'Аудит ЦБ Q3 2025',
    description: 'Подготовка к плановой проверке ЦБ РФ',
    context_type: 'quick', context_id: null, priority: 'high', status: 'in_progress', creator_id: admin });

  const sAccess = await insertItem({ parent_id: eIB, level: 'story', title: 'Согласование доступов для аудиторов',
    acceptance_criteria: 'Доступы выданы по принципу минимальных привилегий. Согласовано с CTO.',
    context_type: 'quick', context_id: null, status: 'in_progress', creator_id: admin });
  await insertItem({ parent_id: sAccess, level: 'subtask', title: 'Список необходимых доступов от команды ИБ', context_type: 'quick', context_id: null, status: 'done', creator_id: admin });
  await insertItem({ parent_id: sAccess, level: 'subtask', title: 'Согласование с CTO и юридическим', context_type: 'quick', context_id: null, status: 'in_progress', creator_id: admin });

  console.log('  quick tasks seeded');
}

// ——— Task items: Product Teams ———
async function seedTeamTasks(teamIds, userIds) {
  const admin = userIds['alice@demo.com'];
  const d1 = userIds['dev1@company.com'];
  const d3 = userIds['dev3@company.com'];
  const d4 = userIds['dev4@company.com'];
  const d2 = userIds['dev2@company.com'];

  const [coreTeamId, digitalTeamId] = teamIds;

  // Core Banking Team
  const eCB = await insertItem({ level: 'epic', title: 'Новый движок расчётов',
    description: 'Переход на event-driven архитектуру для процессинга',
    context_type: 'product_team', context_id: coreTeamId, priority: 'high', status: 'in_progress', creator_id: admin });

  const sCB1 = await insertItem({ parent_id: eCB, level: 'story', title: 'Исследование архитектурных подходов',
    acceptance_criteria: 'Сравнительный анализ 3 подходов. Рекомендация с обоснованием.',
    context_type: 'product_team', context_id: coreTeamId, status: 'done', story_points: 8, creator_id: admin });
  await insertItem({ parent_id: sCB1, level: 'subtask', title: 'Сравнение event-sourcing vs CQRS vs saga', context_type: 'product_team', context_id: coreTeamId, status: 'done', creator_id: admin });
  await insertItem({ parent_id: sCB1, level: 'subtask', title: 'PoC на синтетических данных', context_type: 'product_team', context_id: coreTeamId, status: 'done', creator_id: admin });

  const sCB2 = await insertItem({ parent_id: eCB, level: 'story', title: 'PoC нового движка расчётов',
    acceptance_criteria: 'PoC обрабатывает 10к транзакций/сек. Latency p99 < 50ms.',
    context_type: 'product_team', context_id: coreTeamId, status: 'in_progress', story_points: 21, creator_id: admin });
  await insertItem({ parent_id: sCB2, level: 'subtask', title: 'Настройка окружения Kafka + Flink', context_type: 'product_team', context_id: coreTeamId, assignee_id: d1, status: 'done', creator_id: admin });
  await insertItem({ parent_id: sCB2, level: 'subtask', title: 'Реализация MVP расчётного движка', context_type: 'product_team', context_id: coreTeamId, assignee_id: d3, status: 'in_progress', creator_id: admin });
  await insertItem({ parent_id: sCB2, level: 'subtask', title: 'Нагрузочное тестирование', context_type: 'product_team', context_id: coreTeamId, assignee_id: d4, status: 'open', creator_id: admin });

  // Digital Experience Team
  const eDX = await insertItem({ level: 'epic', title: 'UX-исследование нового онбординга',
    description: 'Исследование и проектирование нового пользовательского онбординга',
    context_type: 'product_team', context_id: digitalTeamId, priority: 'medium', status: 'in_progress', creator_id: admin });

  const sDX1 = await insertItem({ parent_id: eDX, level: 'story', title: 'Глубинные интервью с клиентами',
    acceptance_criteria: 'Проведено 20 интервью. Выявлено 5+ ключевых инсайтов.',
    context_type: 'product_team', context_id: digitalTeamId, status: 'done', story_points: 5, creator_id: admin });
  await insertItem({ parent_id: sDX1, level: 'subtask', title: 'Рекрутинг 20 респондентов', context_type: 'product_team', context_id: digitalTeamId, status: 'done', creator_id: admin });
  await insertItem({ parent_id: sDX1, level: 'subtask', title: 'Проведение интервью', context_type: 'product_team', context_id: digitalTeamId, status: 'done', creator_id: admin });
  await insertItem({ parent_id: sDX1, level: 'subtask', title: 'Синтез инсайтов в affinity diagram', context_type: 'product_team', context_id: digitalTeamId, status: 'done', creator_id: admin });

  const sDX2 = await insertItem({ parent_id: eDX, level: 'story', title: 'Прототипирование нового онбординга',
    acceptance_criteria: 'Прототип протестирован на 5 пользователях. SUS score > 80.',
    context_type: 'product_team', context_id: digitalTeamId, status: 'in_progress', story_points: 8, creator_id: admin });
  await insertItem({ parent_id: sDX2, level: 'subtask', title: 'Вайрфреймы 12 экранов онбординга', context_type: 'product_team', context_id: digitalTeamId, assignee_id: d2, status: 'done', creator_id: admin });
  await insertItem({ parent_id: sDX2, level: 'subtask', title: 'Интерактивный прототип в Figma', context_type: 'product_team', context_id: digitalTeamId, assignee_id: d2, status: 'in_progress', creator_id: admin });
  await insertItem({ parent_id: sDX2, level: 'subtask', title: 'Юзабилити-тест прототипа', context_type: 'product_team', context_id: digitalTeamId, assignee_id: d4, status: 'open', creator_id: admin });

  console.log('  team tasks seeded');
}

// ——— Main ———
async function seed() {
  console.log('=== Seeding users ===');
  const userIds = await seedUsers();

  console.log('=== Seeding business functions ===');
  await seedBusinessFunctions();

  console.log('=== Seeding projects ===');
  const projectIds = await seedProjects(userIds);

  console.log('=== Seeding product teams ===');
  const teamIds = await seedProductTeams(userIds);

  console.log('=== Seeding task items: project 1 ===');
  await seedProject1Tasks(projectIds[0], userIds);

  console.log('=== Seeding task items: project 2 ===');
  await seedProject2Tasks(projectIds[1], userIds);

  console.log('=== Seeding task items: project 3 ===');
  await seedProject3Tasks(projectIds[2], userIds);

  console.log('=== Seeding quick tasks ===');
  await seedQuickTasks(userIds);

  console.log('=== Seeding team tasks ===');
  await seedTeamTasks(teamIds, userIds);

  console.log('\n✅ Seed complete.');
  console.log('  andrey@company.com / password123 → CIO');
  console.log('  alice@demo.com / demo123 → admin');
  console.log('  eve@demo.com / demo123 → manager');
  console.log('  bob@demo.com / demo123 → user');
  console.log('  dev1-4@company.com / dev123 → developers');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
