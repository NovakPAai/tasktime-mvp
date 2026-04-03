/**
 * TTUI-165: Storybook stories для ProjectCard
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectCard } from './ProjectCard';
import type { ProjectCardData } from './ProjectCard';

const ACTIVE_PROJECT: ProjectCardData = {
  id: 'proj-1',
  name: 'Flow Universe Backend',
  key: 'FUB',
  description: 'Node.js + Express + Prisma API для платформы управления задачами',
  status: 'active',
  openIssues: 12,
  currentSprint: 'Sprint 4 — AI Module',
  completionPct: 68,
  members: [
    { id: '1', name: 'Алексей Новиков' },
    { id: '2', name: 'Мария Соколова' },
    { id: '3', name: 'Дмитрий Лебедев' },
  ],
  updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
};

const ONHOLD_PROJECT: ProjectCardData = {
  id: 'proj-2',
  name: 'Mobile Application',
  key: 'MOB',
  description: 'React Native приложение для iOS и Android',
  status: 'onhold',
  openIssues: 5,
  currentSprint: null,
  completionPct: 30,
  members: [
    { id: '1', name: 'Ольга Петрова' },
    { id: '2', name: 'Иван Козлов' },
  ],
  updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
};

const ARCHIVED_PROJECT: ProjectCardData = {
  id: 'proj-3',
  name: 'Legacy Portal',
  key: 'LGC',
  description: 'Устаревший портал на ванильном JS, выведен из эксплуатации',
  status: 'archived',
  openIssues: 0,
  currentSprint: null,
  completionPct: 100,
  members: [{ id: '1', name: 'Наталья Сидорова' }],
  updatedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
};

const meta: Meta<typeof ProjectCard> = {
  title: 'UI Kit / ProjectCard',
  component: ProjectCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    onClick: { action: 'clicked' },
  },
};

export default meta;
type Story = StoryObj<typeof ProjectCard>;

export const Active: Story = {
  args: { project: ACTIVE_PROJECT },
};

export const OnHold: Story = {
  args: { project: ONHOLD_PROJECT },
  name: 'On Hold',
};

export const Archived: Story = {
  args: { project: ARCHIVED_PROJECT },
};

export const WithClickHandler: Story = {
  args: {
    project: ACTIVE_PROJECT,
    onClick: () => alert('Переход в проект'),
  },
  name: 'With Click Handler',
};

/** Все три состояния рядом */
export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <ProjectCard project={ACTIVE_PROJECT} />
      <ProjectCard project={ONHOLD_PROJECT} />
      <ProjectCard project={ARCHIVED_PROJECT} />
    </div>
  ),
  name: 'All States (Active / OnHold / Archived)',
};

/** Без опциональных полей */
export const Minimal: Story = {
  args: {
    project: {
      id: 'proj-min',
      name: 'Minimal Project',
      key: 'MIN',
      status: 'active',
    },
  },
  name: 'Minimal (no optional fields)',
};
