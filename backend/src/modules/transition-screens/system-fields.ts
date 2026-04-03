export const SYSTEM_FIELD_KEYS = ['ASSIGNEE', 'DUE_DATE', 'ACCEPTANCE_CRITERIA'] as const;
export type SystemFieldKey = (typeof SYSTEM_FIELD_KEYS)[number];

export const SYSTEM_FIELD_META: Record<SystemFieldKey, { name: string; inputType: string }> = {
  ASSIGNEE:            { name: 'Исполнитель',      inputType: 'USER'     },
  DUE_DATE:            { name: 'Срок',              inputType: 'DATE'     },
  ACCEPTANCE_CRITERIA: { name: 'Критерии приёмки',  inputType: 'TEXTAREA' },
};
