// TTMP-160 PR-6 / FR-13: multi-select risk filter for the releases list.
// Consumer stores the selected levels and filters the release list by
// `selected.length === 0 || selected.includes(release.risk.level)`.

import { Select } from 'antd';
import type { ReleaseRiskLevel } from '../../api/release-checkpoints';

const OPTIONS: Array<{ value: ReleaseRiskLevel; label: string }> = [
  { value: 'LOW', label: 'LOW — низкий' },
  { value: 'MEDIUM', label: 'MEDIUM — средний' },
  { value: 'HIGH', label: 'HIGH — высокий' },
  { value: 'CRITICAL', label: 'CRITICAL — критический' },
];

type Props = {
  value: ReleaseRiskLevel[];
  onChange: (next: ReleaseRiskLevel[]) => void;
  width?: number | string;
};

export default function CheckpointRiskFilter({ value, onChange, width = 220 }: Props) {
  return (
    <Select
      mode="multiple"
      allowClear
      placeholder="Фильтр по риску"
      style={{ width }}
      value={value}
      onChange={(next) => onChange(next as ReleaseRiskLevel[])}
      options={OPTIONS}
      aria-label="Фильтр релизов по уровню риска"
      maxTagCount="responsive"
    />
  );
}
