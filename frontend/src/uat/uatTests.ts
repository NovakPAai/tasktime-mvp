export type UatRole = 'ADMIN' | 'MANAGER' | 'USER' | 'VIEWER';

export interface UatStep {
  id: string;
  title: string;
  description: string;
  expectedResult?: string | null;
}

export interface UatTest {
  id: string;
  title: string;
  description: string;
  role: UatRole;
  startPath: string;
  steps: UatStep[];
}

export const UAT_TESTS: UatTest[] = [
  {
    id: 'admin-dashboard-overview',
    title: 'Обзор дашборда администратора',
    description: 'Проверка главного дашборда и базовых метрик системы глазами администратора.',
    role: 'ADMIN',
    startPath: '/',
    steps: [
      {
        id: 'step-1',
        title: 'Открыть дашборд',
        description: 'Убедись, что ты находишься на странице Dashboard после логина под ролью ADMIN.',
        expectedResult: 'Видны карточки Projects и Total Issues, а также блоки Issues by Status / Issues by Assignee (если есть данные).',
      },
      {
        id: 'step-2',
        title: 'Проверить метрики пользователей и задач',
        description:
          'Проверь, что количество пользователей, проектов, задач и логов времени в дашборде выглядит ожидаемо для демо-данных.',
        expectedResult: 'Значения метрик не равны нулю и соответствуют ожидаемому количеству из seed-данных.',
      },
    ],
  },
  {
    id: 'manager-project-backlog',
    title: 'Работа с бэклогом проекта',
    description: 'Проверка страницы проекта и списка задач глазами менеджера.',
    role: 'MANAGER',
    startPath: '/projects',
    steps: [
      {
        id: 'step-1',
        title: 'Выбрать демо‑проект',
        description:
          'На странице Projects выбери один из демо‑проектов (например, DEMO или BACK) и перейди в его карточку.',
        expectedResult: 'Открыта страница Project Detail с ключом и названием выбранного проекта.',
      },
      {
        id: 'step-2',
        title: 'Посмотреть дашборд задач проекта',
        description:
          'Проверь блоки Issues by Status / Type / Priority и общее количество задач. Обрати внимание на наличие активного спринта.',
        expectedResult: 'Диаграммы и счётчики отображаются без ошибок, значения выглядят реалистично.',
      },
      {
        id: 'step-3',
        title: 'Отфильтровать задачи',
        description:
          'Используй фильтры по статусу, типу и приоритету, чтобы сузить список задач. Попробуй применить и сбросить фильтры.',
        expectedResult: 'Список задач обновляется в соответствии с выбранными фильтрами, кнопки Apply/Reset работают корректно.',
      },
    ],
  },
  {
    id: 'user-my-time',
    title: 'Учёт времени разработчика',
    description: 'Проверка страницы My Time глазами обычного пользователя.',
    role: 'USER',
    startPath: '/time',
    steps: [
      {
        id: 'step-1',
        title: 'Открыть страницу учёта времени',
        description: 'Перейди на вкладку My Time и убедись, что видишь свои логи времени и таймер.',
        expectedResult: 'История логов времени отображается без ошибок, элементы управления таймером доступны.',
      },
      {
        id: 'step-2',
        title: 'Запустить и остановить таймер',
        description:
          'Запусти таймер для одной из задач, подожди несколько секунд и останови его. Проверь, что лог времени появился в списке.',
        expectedResult: 'Создан новый лог времени с корректной продолжительностью и привязкой к задаче.',
      },
    ],
  },
  {
    id: 'viewer-read-only',
    title: 'Проверка read‑only доступа',
    description: 'Проверка, что роль VIEWER видит данные, но не может вносить изменения.',
    role: 'VIEWER',
    startPath: '/',
    steps: [
      {
        id: 'step-1',
        title: 'Проверить дашборд',
        description:
          'Зайди под ролью VIEWER и открой Dashboard. Убедись, что все метрики видны, но нет кнопок создания/редактирования.',
        expectedResult: 'На главной странице нет кнопок создания задач/проектов, только просмотр.',
      },
      {
        id: 'step-2',
        title: 'Открыть проект и задачи',
        description: 'Перейди в любой проект и попробуй изменить статус или создать задачу.',
        expectedResult: 'Кнопки создания и редактирования недоступны, статус задач нельзя поменять (нет выпадающего списка).',
      },
    ],
  },
];

