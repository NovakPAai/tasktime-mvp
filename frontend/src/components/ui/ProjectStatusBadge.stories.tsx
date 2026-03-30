/**
 * TTUI-165: Storybook stories для ProjectStatusBadge
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectStatusBadge } from './ProjectStatusBadge';

const meta: Meta<typeof ProjectStatusBadge> = {
  title: 'UI Kit / ProjectStatusBadge',
  component: ProjectStatusBadge,
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: 'select',
      options: ['active', 'onhold', 'archived', 'empty'],
      description: 'Статус проекта',
    },
    size: {
      control: 'radio',
      options: ['sm', 'md'],
      description: 'Размер бейджа',
    },
  },
};

export default meta;
type Story = StoryObj<typeof ProjectStatusBadge>;

export const Active: Story = {
  args: { status: 'active', size: 'md' },
};

export const OnHold: Story = {
  args: { status: 'onhold', size: 'md' },
};

export const Archived: Story = {
  args: { status: 'archived', size: 'md' },
};

export const Empty: Story = {
  args: { status: 'empty', size: 'md' },
};

export const Small: Story = {
  args: { status: 'active', size: 'sm' },
  name: 'Small (sm)',
};

/** Все варианты сразу */
export const AllStatuses: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <ProjectStatusBadge status="active" />
      <ProjectStatusBadge status="onhold" />
      <ProjectStatusBadge status="archived" />
      <ProjectStatusBadge status="empty" />
    </div>
  ),
  name: 'All Statuses',
};

/** Оба размера */
export const BothSizes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <ProjectStatusBadge status="active" size="md" />
        <ProjectStatusBadge status="onhold" size="md" />
        <ProjectStatusBadge status="archived" size="md" />
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <ProjectStatusBadge status="active" size="sm" />
        <ProjectStatusBadge status="onhold" size="sm" />
        <ProjectStatusBadge status="archived" size="sm" />
      </div>
    </div>
  ),
  name: 'Both Sizes (md + sm)',
};
