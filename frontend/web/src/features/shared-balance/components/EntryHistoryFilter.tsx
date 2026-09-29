import { MenuItem, Stack, TextField } from '@mui/material';
import type { EntryPeriodFilter } from '@/libs/entryHistoryFilter';

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

type Props = {
  years: number[];
  value: EntryPeriodFilter;
  onChange: (filter: EntryPeriodFilter) => void;
};

export function EntryHistoryFilter({ years, value, onChange }: Props) {
  return (
    <Stack direction="row" spacing={1.5}>
      <TextField
        select
        size="small"
        label="Year"
        value={value.year === 'all' ? 'all' : value.year}
        onChange={(event) => {
          const year = event.target.value === 'all' ? 'all' : Number(event.target.value);
          onChange({ year, month: 'all' });
        }}
        sx={{ minWidth: 130 }}
      >
        <MenuItem value="all">All years</MenuItem>
        {years.map((year) => (
          <MenuItem key={year} value={year}>{year}</MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label="Month"
        value={value.month === 'all' ? 'all' : value.month}
        onChange={(event) => {
          const month = event.target.value === 'all' ? 'all' : Number(event.target.value);
          onChange({ ...value, month });
        }}
        sx={{ minWidth: 150 }}
      >
        <MenuItem value="all">All months</MenuItem>
        {MONTH_OPTIONS.map((month) => (
          <MenuItem key={month.value} value={month.value}>{month.label}</MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}
