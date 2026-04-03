/**
 * TTUI-165: Storybook stories для IssueTypeTag (= IssueTypeBadge из lib/issue-kit)
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IssueTypeTag } from './IssueTypeTag';
import type { IssueTypeConfig } from '../../types';

const makeConfig = (systemKey: string, name: string, iconName: string, iconColor: string): IssueTypeConfig => ({
  id: systemKey,
  name,
  iconName,
  iconColor,
  isSubtask: systemKey === 'SUBTASK',
  isEnabled: true,
  isSystem: true,
  systemKey,
  orderIndex: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const SYSTEM_CONFIGS = {
  EPIC:    makeConfig('EPIC',    'Эпик',       'ThunderboltOutlined', '#722ED1'),
  STORY:   makeConfig('STORY',   'История',    'BookOutlined',        '#1677FF'),
  TASK:    makeConfig('TASK',    'Задача',      'CheckSquareOutlined', '#52C41A'),
  SUBTASK: makeConfig('SUBTASK', 'Подзадача',  'MinusSquareOutlined', '#8C8C8C'),
  BUG:     makeConfig('BUG',     'Баг',         'BugOutlined',         '#F5222D'),
};

const meta: Meta<typeof IssueTypeTag> = {
  title: 'UI Kit / IssueTypeTag',
  component: IssueTypeTag,
  tags: ['autodocs'],
  argTypes: {
    showLabel: {
      control: 'boolean',
      description: 'Показывать текстовый лейбл рядом с иконкой',
    },
  },
};

export default meta;
type Story = StoryObj<typeof IssueTypeTag>;

export const Epic: Story = {
  args: { typeConfig: SYSTEM_CONFIGS.EPIC, showLabel: true },
};

export const Story_: Story = {
  args: { typeConfig: SYSTEM_CONFIGS.STORY, showLabel: true },
  name: 'Story',
};

export const Task: Story = {
  args: { typeConfig: SYSTEM_CONFIGS.TASK, showLabel: true },
};

export const Subtask: Story = {
  args: { typeConfig: SYSTEM_CONFIGS.SUBTASK, showLabel: true },
};

export const Bug: Story = {
  args: { typeConfig: SYSTEM_CONFIGS.BUG, showLabel: true },
};

export const IconOnly: Story = {
  args: { typeConfig: SYSTEM_CONFIGS.TASK, showLabel: false },
  name: 'Icon Only',
};

export const AllTypes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      {Object.values(SYSTEM_CONFIGS).map((cfg) => (
        <IssueTypeTag key={cfg.systemKey} typeConfig={cfg} showLabel />
      ))}
    </div>
  ),
  name: 'All Types',
};

export const AllIcons: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {Object.values(SYSTEM_CONFIGS).map((cfg) => (
        <IssueTypeTag key={cfg.systemKey} typeConfig={cfg} showLabel={false} />
      ))}
    </div>
  ),
  name: 'Icons Only',
};
