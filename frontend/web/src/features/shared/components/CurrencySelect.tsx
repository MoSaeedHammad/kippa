import { FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { CurrencyCode } from '@kippa/domain';
import { CURRENCIES } from '@/libs/currencyMeta';

type Props = {
  label?: string;
  labelId: string;
  value: CurrencyCode;
  onChange: (code: CurrencyCode) => void;
};

/** Maps currency codes to their typed i18n keys; codes without a key fall back to `currencyMeta`'s English name. */
const CURRENCY_NAME_KEYS = {
  USD: 'currencyNames.USD',
  EUR: 'currencyNames.EUR',
  GBP: 'currencyNames.GBP',
  EGP: 'currencyNames.EGP',
  SAR: 'currencyNames.SAR',
  AED: 'currencyNames.AED',
  KWD: 'currencyNames.KWD',
  QAR: 'currencyNames.QAR',
  BHD: 'currencyNames.BHD',
  OMR: 'currencyNames.OMR',
  JOD: 'currencyNames.JOD',
  LBP: 'currencyNames.LBP',
  TRY: 'currencyNames.TRY',
  INR: 'currencyNames.INR',
  PKR: 'currencyNames.PKR',
  CNY: 'currencyNames.CNY',
  JPY: 'currencyNames.JPY',
  NGN: 'currencyNames.NGN',
  ZAR: 'currencyNames.ZAR',
  CAD: 'currencyNames.CAD',
  AUD: 'currencyNames.AUD',
  CHF: 'currencyNames.CHF',
  SEK: 'currencyNames.SEK',
} as const;

type CurrencyNameKey = (typeof CURRENCY_NAME_KEYS)[keyof typeof CURRENCY_NAME_KEYS];

export function CurrencySelect({ label, labelId, value, onChange }: Props) {
  const { t } = useTranslation('shared');
  const resolvedLabel = label ?? t('currency.label');
  return (
    <FormControl fullWidth>
      <InputLabel id={labelId}>{resolvedLabel}</InputLabel>
      <Select
        labelId={labelId}
        value={value}
        label={resolvedLabel}
        onChange={(e: SelectChangeEvent) => onChange(e.target.value as CurrencyCode)}
        sx={{ borderRadius: '12px' }}
      >
        {CURRENCIES.map(c => {
          const nameKey: CurrencyNameKey | undefined = CURRENCY_NAME_KEYS[c.code as keyof typeof CURRENCY_NAME_KEYS];
          return (
            <MenuItem key={c.code} value={c.code}>
              {c.code} ({nameKey ? t(nameKey) : c.name})
            </MenuItem>
          );
        })}
      </Select>
    </FormControl>
  );
}
