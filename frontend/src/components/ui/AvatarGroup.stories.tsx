/**
 * TTUI-165: Storybook stories для AvatarGroup
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AvatarGroup } from './AvatarGroup';
import type { AvatarUser } from './AvatarGroup';

const SAMPLE_USERS: AvatarUser[] = [
  { id: '1', name: 'Алексей Новиков', email: 'anovikov@example.com' },
  { id: '2', name: 'Мария Соколова', email: 'msokolova@example.com' },
  { id: '3', name: 'Дмитрий Лебедев', email: 'dlebedev@example.com' },
  { id: '4', name: 'Ольга Петрова', email: 'opetrov@example.com' },
  { id: '5', name: 'Иван Козлов', email: 'ikozlov@example.com' },
  { id: '6', name: 'Наталья Сидорова', email: 'nsidorova@example.com' },
];

const meta: Meta<typeof AvatarGroup> = {
  title: 'UI Kit / AvatarGroup',
  component: AvatarGroup,
  tags: ['autodocs'],
  argTypes: {
    max: {
      control: { type: 'range', min: 1, max: 6, step: 1 },
      description: 'Максимум видимых аватаров',
    },
    size: {
      control: { type: 'range', min: 16, max: 40, step: 2 },
      description: 'Размер аватара в px',
    },
  },
};

export default meta;
type Story = StoryObj<typeof AvatarGroup>;

export const Single: Story = {
  args: {
    users: SAMPLE_USERS.slice(0, 1),
    size: 24,
    max: 4,
  },
  name: 'Single User',
};

export const Two: Story = {
  args: {
    users: SAMPLE_USERS.slice(0, 2),
    size: 24,
    max: 4,
  },
  name: 'Two Users',
};

export const FourVisible: Story = {
  args: {
    users: SAMPLE_USERS.slice(0, 4),
    size: 24,
    max: 4,
  },
  name: '4 Visible',
};

export const WithOverflow: Story = {
  args: {
    users: SAMPLE_USERS,
    size: 24,
    max: 4,
  },
  name: 'With +N Overflow',
};

export const Large: Story = {
  args: {
    users: SAMPLE_USERS,
    size: 32,
    max: 4,
  },
  name: 'Large (32px)',
};

export const Small: Story = {
  args: {
    users: SAMPLE_USERS,
    size: 18,
    max: 5,
  },
  name: 'Small (18px)',
};

/** Пустой список */
export const Empty: Story = {
  args: { users: [], size: 24, max: 4 },
};
