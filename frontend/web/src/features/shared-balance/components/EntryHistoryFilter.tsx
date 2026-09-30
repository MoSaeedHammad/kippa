import { MenuItem, Stack, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { EntryPeriodFilter } from '@/libs/entryHistoryFilter';
import type sharedBalanceEn from '@/i18n/locales/en/sharedBalance.json';

type MonthLabelKey = keyof typeof sharedBalanceEn['months'];

const MONTH_OPTIONS: { value: number; labelKey: MonthLabelKey }[] = [
  { value: 1, labelKey: 'january' },
  { value: 2, labelKey: 'february' },
  { value: 3, labelKey: 'march' },
  { value: 4, labelKey: 'april' },
  { value: 5, labelKey: 'may' },
  { value: 6, labelKey: 'june' },
  { value: 7, labelKey: 'july' },
  { value: 8, labelKey: 'august' },
  { value: 9, labelKey: 'september' },
  { value: 10, labelKey: 'october' },
  { value: 11, labelKey: 'november' },
  { value: 12, labelKey: 'december' },
];

type Props = {
  years: number[];
  value: EntryPeriodFilter;
  onChange: (filter: EntryPeriodFilter) => void;
};

export function EntryHistoryFilter({ years, value, onChange }: Props) {
  const { t } = useTranslation('sharedBalance');
  return (
    <Stack direction="row" spacing={1.5}>
      <TextField
        select
        size="small"
        label={t('period.year')}
        value={value.year === 'all' ? 'all' : value.year}
        onChange={(event) => {
          const year = event.target.value === 'all' ? 'all' : Number(event.target.value);
          onChange({ year, month: 'all' });
        }}
        sx={{ minWidth: 130 }}
      >
        <MenuItem value="all">{t('period.allYears')}</MenuItem>
        {years.map((year) => (
          <MenuItem key={year} value={year}>{year}</MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label={t('period.month')}
        value={value.month === 'all' ? 'all' : value.month}
        onChange={(event) => {
          const month = event.target.value === 'all' ? 'all' : Number(event.target.value);
          onChange({ ...value, month });
        }}
        sx={{ minWidth: 150 }}
      >
        <MenuItem value="all">{t('period.allMonths')}</MenuItem>
        {MONTH_OPTIONS.map((month) => (
          <MenuItem key={month.value} value={month.value}>{t(`months.${month.labelKey}`)}</MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}
