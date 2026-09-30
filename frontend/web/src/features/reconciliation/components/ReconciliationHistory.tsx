import { alpha, Box, Card, Divider, Stack, Typography, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { Account, Reconciliation } from '@kippa/domain';
import { AccountBalanceIcon, CheckCircleIcon } from '@/components/AppIcon';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';

type Props = {
  accounts: Account[];
  history: Reconciliation[];
  mask: (value: string) => string;
  renderAccountIcon: (type: string, size?: string) => React.ReactNode;
};

function formatReconciliationDate(dateString: string) {
  const [year, month, day] = dateString.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ReconciliationHistory({ accounts, history, mask, renderAccountIcon }: Props) {
  const theme = useTheme();
  const { t } = useTranslation('reconciliation');
  return (
    <Stack spacing={1.5}>
      <Typography variant="h3">{t('history.title')}</Typography>
      <Card>
        {history.length === 0 ? (
          <Box sx={{ p: 2 }}><EmptyLayout title={t('history.emptyTitle')} description={t('history.emptyDescription')} /></Box>
        ) : history.map((item, index) => {
          const account = accounts.find((candidate) => candidate.id === item.accountId);
          const matched = Math.abs(item.difference) < 0.001;
          const color = matched ? theme.palette.text.secondary : item.difference > 0 ? theme.palette.success.main : theme.palette.error.main;
          return (
            <Box key={item.id}>
              {index > 0 && <Divider />}
              <Box sx={{ p: 2, display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: alpha(color, 0.1), color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {matched ? <CheckCircleIcon color="success" sx={{ fontSize: 18 }} /> : account ? renderAccountIcon(account.type, '18px') : <AccountBalanceIcon sx={{ fontSize: 18 }} />}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="sectionLabel">{account?.name || t('history.unknownAccount')}</Typography>
                  {item.note && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, wordBreak: 'break-word' }}>{item.note}</Typography>}
                  <Typography variant="fieldHint" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                    {formatReconciliationDate(item.date)} · {t('history.actual', { amount: mask(`${item.actualBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${item.currency}`) })}
                  </Typography>
                </Box>
                <Typography variant="sectionLabel" color={matched ? 'text.secondary' : item.difference > 0 ? 'success' : 'error'} sx={{ whiteSpace: 'nowrap', flexShrink: 0, mt: 0.5 }}>
                  {matched ? t('history.matched') : `${item.difference > 0 ? '+' : ''}${mask(`${item.difference.toFixed(2)} ${item.currency}`)}`}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Card>
    </Stack>
  );
}
