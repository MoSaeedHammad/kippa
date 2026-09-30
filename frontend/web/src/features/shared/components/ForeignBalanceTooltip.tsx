import type { ReactElement } from 'react';
import { Stack, Tooltip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { CurrencyCode } from '@kippa/domain';
import { Money } from '@/components/Money';

interface ForeignBalanceTooltipProps {
  amount: number;
  currency: CurrencyCode;
  baseCurrency: CurrencyCode;
  rate?: number;
  children: ReactElement;
}

export function ForeignBalanceTooltip({
  amount,
  currency,
  baseCurrency,
  rate,
  children,
}: ForeignBalanceTooltipProps) {
  const { t } = useTranslation('shared');
  if (currency === baseCurrency) return children;

  const hasRate = typeof rate === 'number' && Number.isFinite(rate) && rate > 0;

  return (
    <Tooltip
      arrow
      placement="top"
      enterTouchDelay={300}
      title={
        <Stack spacing={0.5} sx={{ py: 0.25 }}>
          <Typography sx={{ color: 'inherit', fontSize: 12, fontWeight: 700 }}>
            {hasRate ? (
              <>{t('foreignBalance.baseEquivalent')} <Money amount={amount * rate} code={baseCurrency} maxDigits={2} /></>
            ) : t('foreignBalance.baseEquivalentUnavailable')}
          </Typography>
          <Typography sx={{ color: 'inherit', fontSize: 11, fontWeight: 500 }}>
            {hasRate ? (
              <>{t('foreignBalance.currentRate', { from: currency })} <Money amount={rate} code={baseCurrency} maxDigits={4} /></>
            ) : t('foreignBalance.rateUnavailable', { from: currency, to: baseCurrency })}
          </Typography>
        </Stack>
      }
    >
      {children}
    </Tooltip>
  );
}
