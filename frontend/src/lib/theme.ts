import * as tokens from '../design-tokens';

/**
 * Утилита для использования токенов дизайна в инлайновых стилях React.
 * Позволяет избегать хардкода и поддерживать систему SSOT.
 */
export const getThemeTokens = (isLight: boolean) => {
  const t = isLight ? tokens.light : tokens.dark;
  return {
    ...t,
    ...tokens.layout,
    ...tokens.typography,
    ...tokens.status,
    ...tokens.issueType,
    ...tokens.semantic,
  };
};
