import type { Meta, StoryObj } from '@storybook/react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import LoadingSpinner from './LoadingSpinner';

const meta: Meta<typeof LoadingSpinner> = {
  title: 'Common/LoadingSpinner',
  component: LoadingSpinner,
  decorators: [
    (Story) => (
      <ConfigProvider theme={{ algorithm: antdTheme.darkAlgorithm }}>
        <Story />
      </ConfigProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof LoadingSpinner>;

export const Default: Story = {};
