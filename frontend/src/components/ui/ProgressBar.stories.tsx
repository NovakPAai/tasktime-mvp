/**
 * TTUI-165: Storybook stories для ProgressBar
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProgressBar } from './ProgressBar';

const meta: Meta<typeof ProgressBar> = {
  title: 'UI Kit / ProgressBar',
  component: ProgressBar,
  tags: ['autodocs'],
  argTypes: {
    value: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
      description: 'Прогресс 0–100',
    },
    height: {
      control: { type: 'range', min: 2, max: 12, step: 1 },
      description: 'Высота полосы в px',
    },
    showLabel: {
      control: 'boolean',
      description: 'Показывать числовую метку %',
    },
    label: {
      control: 'text',
      description: 'Кастомная подпись в tooltip',
    },
  },
};

export default meta;
type Story = StoryObj<typeof ProgressBar>;

export const Default: Story = {
  args: { value: 65, height: 3, showLabel: false },
};

export const WithLabel: Story = {
  args: { value: 72, height: 4, showLabel: true },
  name: 'With Label',
};

export const Empty: Story = {
  args: { value: 0, height: 3, showLabel: true },
};

export const Full: Story = {
  args: { value: 100, height: 3, showLabel: true },
};

export const Thick: Story = {
  args: { value: 45, height: 8, showLabel: true },
  name: 'Thick (8px)',
};

/** Несколько состояний в столбик */
export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 320 }}>
      {[0, 25, 50, 75, 100].map((v) => (
        <div key={v}>
          <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 6, fontWeight: 500 }}>{v}%</div>
          <ProgressBar value={v} height={4} showLabel />
        </div>
      ))}
    </div>
  ),
  name: 'All States',
};
