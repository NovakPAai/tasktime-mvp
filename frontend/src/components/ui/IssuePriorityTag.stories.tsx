/**
 * TTUI-165: Storybook stories для IssuePriorityTag
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IssuePriorityTag } from './IssuePriorityTag';

const meta: Meta<typeof IssuePriorityTag> = {
  title: 'UI Kit / IssuePriorityTag',
  component: IssuePriorityTag,
  tags: ['autodocs'],
  argTypes: {
    priority: {
      control: 'select',
      options: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
      description: 'Приоритет задачи',
    },
    size: {
      control: 'radio',
      options: ['sm', 'md'],
      description: 'Размер тега',
    },
    showLabel: {
      control: 'boolean',
      description: 'Показывать текст метки',
    },
  },
};

export default meta;
type Story = StoryObj<typeof IssuePriorityTag>;

export const Critical: Story = {
  args: { priority: 'CRITICAL', size: 'md', showLabel: true },
};

export const High: Story = {
  args: { priority: 'HIGH', size: 'md', showLabel: true },
};

export const Medium: Story = {
  args: { priority: 'MEDIUM', size: 'md', showLabel: true },
};

export const Low: Story = {
  args: { priority: 'LOW', size: 'md', showLabel: true },
};

export const WithoutLabel: Story = {
  args: { priority: 'CRITICAL', size: 'md', showLabel: false },
  name: 'Without Label',
};

/** Все приоритеты в ряд */
export const AllPriorities: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <IssuePriorityTag priority="CRITICAL" />
      <IssuePriorityTag priority="HIGH" />
      <IssuePriorityTag priority="MEDIUM" />
      <IssuePriorityTag priority="LOW" />
    </div>
  ),
  name: 'All Priorities',
};

/** Оба размера */
export const BothSizes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((p) => (
          <IssuePriorityTag key={p} priority={p} size="md" />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((p) => (
          <IssuePriorityTag key={p} priority={p} size="sm" />
        ))}
      </div>
    </div>
  ),
  name: 'Both Sizes (md + sm)',
};
