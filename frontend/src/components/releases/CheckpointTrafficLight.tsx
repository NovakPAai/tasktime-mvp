// TTMP-160 PR-6 / FR-18: traffic light = color + icon + text + aria.
// Color alone is insufficient (a11y), so the component always renders an icon and a text
// label, and sets `role="status"` for assistive tech.

import {
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
} from '@ant-design/icons';
import { Tag } from 'antd';
import type { CheckpointState } from '../../api/release-checkpoint-types';

type Props = {
  state: CheckpointState;
  isWarning?: boolean;
  size?: 'sm' | 'md';
};

const LABEL: Record<CheckpointState | 'WARNING', string> = {
  OK: 'OK',
  PENDING: 'Ожидание',
  VIOLATED: 'Нарушено',
  WARNING: 'Внимание',
};

export default function CheckpointTrafficLight({ state, isWarning, size = 'md' }: Props) {
  const effective = isWarning && state === 'PENDING' ? 'WARNING' : state;

  const { color, bg, Icon, label } = (() => {
    switch (effective) {
      case 'OK':
        return {
          color: '#1F6F43',
          bg: 'rgba(82, 196, 26, 0.15)',
          Icon: CheckCircleFilled,
          label: LABEL.OK,
        };
      case 'WARNING':
        return {
          color: '#8B5A00',
          bg: 'rgba(245, 158, 11, 0.18)',
          Icon: ExclamationCircleFilled,
          label: LABEL.WARNING,
        };
      case 'VIOLATED':
        return {
          color: '#9F1239',
          bg: 'rgba(229, 83, 75, 0.15)',
          Icon: CloseCircleFilled,
          label: LABEL.VIOLATED,
        };
      case 'PENDING':
      default:
        return {
          color: '#555',
          bg: 'rgba(128, 128, 128, 0.15)',
          Icon: ClockCircleFilled,
          label: LABEL.PENDING,
        };
    }
  })();

  return (
    <Tag
      icon={<Icon aria-hidden />}
      role="status"
      aria-label={`Статус контрольной точки: ${label}`}
      style={{
        color,
        background: bg,
        border: 'none',
        fontSize: size === 'sm' ? 11 : 12,
        padding: size === 'sm' ? '0 6px' : '2px 8px',
        margin: 0,
      }}
    >
      {label}
    </Tag>
  );
}
