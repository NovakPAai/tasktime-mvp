/**
 * Flow Universe OpenAPI спецификация.
 * Используется swagger-ui-express для /api/docs и openapi-to-mcp для MCP-прокси.
 */
export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Flow Universe API',
    version: '1.0.0',
    description: 'REST API для Flow Universe MVP — управление проектами и задачами',
  },
  servers: [{ url: '/api', description: 'API' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      ConditionRule: {
        oneOf: [
          {
            type: 'object',
            required: ['type', 'roles'],
            properties: {
              type: { type: 'string', enum: ['USER_HAS_GLOBAL_ROLE'] },
              roles: { type: 'array', items: { type: 'string', enum: ['ADMIN', 'MANAGER', 'USER', 'VIEWER', 'SUPER_ADMIN'] } },
            },
          },
          { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: ['USER_IS_ASSIGNEE'] } } },
          { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: ['USER_IS_REPORTER'] } } },
          {
            type: 'object',
            required: ['type', 'conditions'],
            properties: {
              type: { type: 'string', enum: ['ANY_OF'] },
              conditions: { type: 'array', items: { '$ref': '#/components/schemas/ConditionRule' } },
            },
          },
          {
            type: 'object',
            required: ['type', 'conditions'],
            properties: {
              type: { type: 'string', enum: ['ALL_OF'] },
              conditions: { type: 'array', items: { '$ref': '#/components/schemas/ConditionRule' } },
            },
          },
        ],
        discriminator: { propertyName: 'type' },
      },
      ValidatorRule: {
        oneOf: [
          {
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', enum: ['REQUIRED_FIELDS'] },
              fieldIds: { type: 'array', items: { type: 'string', format: 'uuid' }, nullable: true },
            },
          },
          { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: ['ALL_SUBTASKS_DONE'] } } },
          { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: ['COMMENT_REQUIRED'] } } },
          {
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', enum: ['TIME_LOGGED'] },
              minHours: { type: 'number', nullable: true },
            },
          },
          {
            type: 'object',
            required: ['type', 'customFieldId', 'operator'],
            properties: {
              type: { type: 'string', enum: ['FIELD_VALUE'] },
              customFieldId: { type: 'string', format: 'uuid' },
              operator: { type: 'string', enum: ['NOT_EMPTY', 'EQUALS'] },
              value: { nullable: true },
            },
          },
        ],
        discriminator: { propertyName: 'type' },
      },
      PostFunctionRule: {
        oneOf: [
          { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: ['ASSIGN_TO_REPORTER'] } } },
          { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: ['ASSIGN_TO_CURRENT_USER'] } } },
          { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: ['CLEAR_ASSIGNEE'] } } },
          {
            type: 'object',
            required: ['type', 'customFieldId', 'value'],
            properties: {
              type: { type: 'string', enum: ['SET_FIELD_VALUE'] },
              customFieldId: { type: 'string', format: 'uuid' },
              value: {},
            },
          },
          {
            type: 'object',
            required: ['type', 'url'],
            properties: {
              type: { type: 'string', enum: ['TRIGGER_WEBHOOK'] },
              url: { type: 'string', format: 'uri' },
              method: { type: 'string', enum: ['POST', 'GET'], default: 'POST' },
              includeIssue: { type: 'boolean', default: true },
            },
          },
          {
            type: 'object',
            required: ['type', 'action'],
            properties: {
              type: { type: 'string', enum: ['LOG_AUDIT'] },
              action: { type: 'string' },
            },
          },
        ],
        discriminator: { propertyName: 'type' },
      },
      WorkflowValidationReport: {
        type: 'object',
        required: ['isValid', 'errors', 'warnings'],
        properties: {
          isValid: { type: 'boolean', description: 'false если есть errors' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['NO_INITIAL_STATUS', 'NO_DONE_STATUS'], description: 'Блокирующая ошибка' },
                message: { type: 'string' },
                details: { type: 'object', nullable: true },
              },
            },
          },
          warnings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['DEAD_END_STATUS', 'UNREACHABLE_STATUS', 'UNUSED_STATUS'] },
                message: { type: 'string' },
                statusId: { type: 'string', format: 'uuid', nullable: true },
                statusName: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
      TransitionResponse: {
        type: 'object',
        required: ['id', 'name', 'toStatus', 'requiresScreen'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          toStatus: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              category: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'] },
              color: { type: 'string', nullable: true },
            },
          },
          requiresScreen: { type: 'boolean' },
          screenFields: {
            nullable: true,
            type: 'array',
            items: {
              type: 'object',
              properties: {
                customFieldId: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                fieldType: { type: 'string' },
                isRequired: { type: 'boolean' },
                orderIndex: { type: 'integer' },
              },
            },
          },
        },
      },
      Issue: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          number: { type: 'integer' },
          title: { type: 'string' },
          description: { type: 'string', nullable: true },
          acceptanceCriteria: { type: 'string', nullable: true },
          type: { type: 'string', enum: ['EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG'] },
          status: {
            type: 'string',
            enum: ['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'],
            deprecated: true,
            description: '[DEPRECATED] Устаревший строковый статус для обратной совместимости. Используйте workflowStatus. Поддерживается до 2026-09-01.',
          },
          workflowStatus: {
            nullable: true,
            description: 'Текущий статус в workflow engine. null — если workflow engine не настроен для проекта.',
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              category: { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'DONE'] },
              color: { type: 'string', nullable: true },
              systemKey: { type: 'string', nullable: true, description: 'Совпадает с legacy status для системных статусов (OPEN, IN_PROGRESS, REVIEW, DONE, CANCELLED)' },
            },
          },
          priority: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
          estimatedHours: { type: 'number', nullable: true },
          aiEligible: { type: 'boolean' },
          aiExecutionStatus: { type: 'string', enum: ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'FAILED'] },
          projectId: { type: 'string', format: 'uuid' },
          parentId: { type: 'string', format: 'uuid', nullable: true },
          sprintId: { type: 'string', format: 'uuid', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateIssueBody: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 500 },
          description: { type: 'string', nullable: true },
          acceptanceCriteria: { type: 'string', nullable: true },
          type: { type: 'string', enum: ['EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG'], default: 'TASK' },
          priority: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], default: 'MEDIUM' },
          parentId: { type: 'string', format: 'uuid' },
          assigneeId: { type: 'string', format: 'uuid' },
          sprintId: { type: 'string', format: 'uuid' },
        },
      },
      Project: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          key: { type: 'string', example: 'TTMP' },
          description: { type: 'string', nullable: true },
        },
      },
      Sprint: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          goal: { type: 'string', nullable: true },
          state: { type: 'string', enum: ['PLANNED', 'ACTIVE', 'CLOSED'] },
          startDate: { type: 'string', format: 'date-time', nullable: true },
          endDate: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Comment: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          body: { type: 'string' },
          issueId: { type: 'string', format: 'uuid' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'auth', description: 'Аутентификация' },
    { name: 'projects', description: 'Проекты' },
    { name: 'issues', description: 'Задачи' },
    { name: 'sprints', description: 'Спринты' },
    { name: 'comments', description: 'Комментарии' },
    { name: 'time', description: 'Учёт времени' },
    { name: 'ai', description: 'AI-функции' },
    { name: 'system', description: 'Системные' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['system'],
        summary: 'Health check',
        security: [],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' } } } } } },
        },
      },
    },
    '/features': {
      get: {
        tags: ['system'],
        summary: 'Получить активные feature flags',
        security: [],
        responses: {
          200: { description: 'Feature flags', content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['auth'],
        summary: 'Войти в систему',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Токены и данные пользователя' },
          401: { description: 'Неверные учётные данные', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['auth'],
        summary: 'Текущий пользователь',
        responses: {
          200: { description: 'Данные текущего пользователя' },
          401: { description: 'Не авторизован' },
        },
      },
    },
    '/projects': {
      get: {
        tags: ['projects'],
        summary: 'Список проектов',
        responses: {
          200: { description: 'Массив проектов', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Project' } } } } },
        },
      },
      post: {
        tags: ['projects'],
        summary: 'Создать проект',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'key'],
                properties: {
                  name: { type: 'string' },
                  key: { type: 'string', description: 'Уникальный ключ проекта (2-10 букв, заглавные)' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Проект создан', content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } } },
        },
      },
    },
    '/projects/{projectId}/issues': {
      get: {
        tags: ['issues'],
        summary: 'Список задач проекта',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Фильтр по статусу (через запятую)' },
          { name: 'type', in: 'query', schema: { type: 'string' } },
          { name: 'priority', in: 'query', schema: { type: 'string' } },
          { name: 'assigneeId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'sprintId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Массив задач', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Issue' } } } } },
        },
      },
      post: {
        tags: ['issues'],
        summary: 'Создать задачу',
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateIssueBody' } } },
        },
        responses: {
          201: { description: 'Задача создана', content: { 'application/json': { schema: { $ref: '#/components/schemas/Issue' } } } },
        },
      },
    },
    '/issues/{id}': {
      get: {
        tags: ['issues'],
        summary: 'Получить задачу по ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Задача', content: { 'application/json': { schema: { $ref: '#/components/schemas/Issue' } } } },
          404: { description: 'Не найдена' },
        },
      },
      patch: {
        tags: ['issues'],
        summary: 'Обновить задачу',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateIssueBody' } } },
        },
        responses: {
          200: { description: 'Обновлённая задача', content: { 'application/json': { schema: { $ref: '#/components/schemas/Issue' } } } },
        },
      },
      delete: {
        tags: ['issues'],
        summary: 'Удалить задачу',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          204: { description: 'Удалено' },
        },
      },
    },
    '/issues/key/{key}': {
      get: {
        tags: ['issues'],
        summary: 'Получить задачу по ключу (TTMP-42)',
        parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' }, example: 'TTMP-42' }],
        responses: {
          200: { description: 'Задача', content: { 'application/json': { schema: { $ref: '#/components/schemas/Issue' } } } },
          404: { description: 'Не найдена' },
        },
      },
    },
    '/issues/{id}/status': {
      patch: {
        tags: ['issues'],
        summary: 'Изменить статус задачи (backward compat)',
        description: 'Принимает строковый статус (OPEN, IN_PROGRESS, REVIEW, DONE, CANCELLED) и обновляет задачу. Если для проекта настроен workflow engine — маппинг на transition API происходит автоматически. Поддерживается для обратной совместимости до 2026-09-01; новые клиенты должны использовать POST /issues/{id}/transitions.',
        deprecated: true,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: { status: { type: 'string', enum: ['OPEN', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED'] } },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Задача с обновлённым status (строка) и workflowStatus (объект)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Issue' } } },
          },
          400: { description: 'NO_VALID_TRANSITION — нет перехода в workflow для указанного статуса' },
        },
      },
    },
    '/issues/{issueId}/comments': {
      get: {
        tags: ['comments'],
        summary: 'Список комментариев к задаче',
        parameters: [{ name: 'issueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Массив комментариев', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Comment' } } } } },
        },
      },
      post: {
        tags: ['comments'],
        summary: 'Добавить комментарий',
        parameters: [{ name: 'issueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['body'], properties: { body: { type: 'string' } } } } },
        },
        responses: {
          201: { description: 'Комментарий создан', content: { 'application/json': { schema: { $ref: '#/components/schemas/Comment' } } } },
        },
      },
    },
    '/projects/{projectId}/sprints': {
      get: {
        tags: ['sprints'],
        summary: 'Список спринтов проекта',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Массив спринтов', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Sprint' } } } } },
        },
      },
      post: {
        tags: ['sprints'],
        summary: 'Создать спринт',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  goal: { type: 'string' },
                  startDate: { type: 'string', format: 'date-time' },
                  endDate: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Спринт создан' },
        },
      },
    },
    '/time-logs': {
      get: {
        tags: ['time'],
        summary: 'Мои логи времени',
        responses: {
          200: { description: 'Массив time logs' },
        },
      },
      post: {
        tags: ['time'],
        summary: 'Залогировать время вручную',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['issueId', 'hours'],
                properties: {
                  issueId: { type: 'string', format: 'uuid' },
                  hours: { type: 'number', minimum: 0.01 },
                  note: { type: 'string' },
                  logDate: { type: 'string', format: 'date' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Time log создан' },
        },
      },
    },
    '/ai/estimate': {
      post: {
        tags: ['ai'],
        summary: 'AI-оценка трудоёмкости задачи',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  issueId: { type: 'string', format: 'uuid' },
                  issueKey: { type: 'string', example: 'TTMP-42' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Оценка трудоёмкости',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    issueId: { type: 'string' },
                    estimatedHours: { type: 'number' },
                    reasoning: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/ai/decompose': {
      post: {
        tags: ['ai'],
        summary: 'AI-декомпозиция задачи на подзадачи',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  issueId: { type: 'string', format: 'uuid' },
                  issueKey: { type: 'string', example: 'TTMP-42' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Созданные подзадачи',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    issueId: { type: 'string' },
                    createdCount: { type: 'integer' },
                    children: { type: 'array', items: { $ref: '#/components/schemas/Issue' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/ai/suggest-assignee': {
      post: {
        tags: ['ai'],
        summary: 'AI-предложение исполнителя по минимальной нагрузке',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  issueId: { type: 'string', format: 'uuid' },
                  issueKey: { type: 'string', example: 'TTMP-42' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Предложенный исполнитель и список кандидатов',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    issueId: { type: 'string' },
                    suggested: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        userId: { type: 'string' },
                        name: { type: 'string' },
                        email: { type: 'string' },
                        loggedHours: { type: 'number' },
                        openIssues: { type: 'integer' },
                        reason: { type: 'string' },
                      },
                    },
                    candidates: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          userId: { type: 'string' },
                          name: { type: 'string' },
                          loggedHours: { type: 'number' },
                          openIssues: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/issues/{id}/ai-status': {
      patch: {
        tags: ['ai'],
        summary: 'Обновить AI-статус задачи',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['aiExecutionStatus'],
                properties: {
                  aiExecutionStatus: { type: 'string', enum: ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'FAILED'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Обновлённая задача' },
        },
      },
    },
    '/issues/{id}/ai-flags': {
      patch: {
        tags: ['ai'],
        summary: 'Установить AI-флаги задачи (aiEligible, aiAssigneeType)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  aiEligible: { type: 'boolean' },
                  aiAssigneeType: { type: 'string', enum: ['HUMAN', 'AGENT', 'MIXED'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Обновлённая задача' },
        },
      },
    },
  },
};
