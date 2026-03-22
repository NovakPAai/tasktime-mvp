/**
 * TTUI-165: Storybook stories для IssueTypeTag (= IssueTypeBadge из lib/issue-kit)
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IssueTypeTag } from './IssueTypeTag';
import type { IssueType } from '../../types';

const meta: Meta<typeof IssueTypeTag> = {
  title: 'UI Kit / IssueTypeTag',
  component: IssueTypeTag,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG'] satisfies IssueType[],
      description: 'Тип задачи',
    },
    showLabel: {
      control: 'boolean',
      description: 'Показывать текстовый лейбл рядом с иконкой',
    },
  },
};

export default meta;
type Story = StoryObj<typeof IssueTypeTag>;

export const Epic: Story = {
  args: { type: 'EPIC', showLabel: true },
};

export const Story_: Story = {
  args: { type: 'STORY', showLabel: true },
  name: 'Story',
};

export const Task: Story = {
  args: { type: 'TASK', showLabel: true },
};

export const Subtask: Story = {
  args: { type: 'SUBTASK', showLabel: true },
};

export const Bug: Story = {
  args: { type: 'BUG', showLabel: true },
};

export const IconOnly: Story = {
  args: { type: 'TASK', showLabel: false },
  name: 'Icon Only',
};

/** Все типы — иконки + лейблы */
export const AllTypes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      {(['EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG'] as IssueType[]).map((t) => (
        <IssueTypeTag key={t} type={t} showLabel />
      ))}
    </div>
  ),
  name: 'All Types',
};

/** Только иконки */
export const AllIcons: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {(['EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG'] as IssueType[]).map((t) => (
        <IssueTypeTag key={t} type={t} showLabel={false} />
      ))}
    </div>
  ),
  name: 'Icons Only',
};
