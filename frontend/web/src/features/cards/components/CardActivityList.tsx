import { Box, Button, Divider, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { CardCharge, CardChargeGroup } from '@/libs/cardActivity';
import type { Card, Category } from '@kippa/domain';
import { CheckCircleIcon } from '@/components/AppIcon';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { TransactionIcon } from '@/features/transactions/components/TransactionIcon';

type Props = { card: Card; categories: Category[]; groups: CardChargeGroup[]; mask: (value: string) => string; onLoadMore: () => void; onPay: (charge: CardCharge) => void; visibleCount: number };

export function CardActivityList({ card, categories, groups, mask, onLoadMore, onPay, visibleCount }: Props) {
  const { t } = useTranslation('cards');
  if (groups.length === 0) return <EmptyLayout title={t('activity.emptyTitle')} description={t('activity.emptyDescription')} />;
  return (
    <Stack divider={<Divider />}>
      {groups.slice(0, visibleCount).map((group) => (
        <Box key={group.groupId}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 1.5 }}>
            <Box>
              <Typography variant="sectionLabel">{group.cycleName}</Typography>
              {group.cycleDateRange && <Typography variant="body2" color="text.secondary">{group.cycleDateRange}</Typography>}
            </Box>
            <Typography variant="body2" color="text.secondary">{t('activity.charges', { count: group.charges.length })}</Typography>
          </Stack>
          {group.charges.map((charge) => {
            const category = charge.categoryId ? categories.find((candidate) => candidate.id === charge.categoryId) : null;
            return (
              <Stack key={charge.lineId} direction="row" alignItems="flex-start" spacing={1.5} sx={{ py: 1 }}>
                <TransactionIcon type={charge.txType} size={38} isCreditCard={card.kind === 'credit'} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="sectionLabel" color={charge.paid ? 'text.disabled' : 'text.primary'} sx={{ textDecoration: charge.paid ? 'line-through' : 'none' }}>{category?.name ?? charge.txType}</Typography>
                  {charge.description && <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.25 }}>{charge.description}</Typography>}
                  <Typography variant="fieldHint" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>{charge.date}</Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0, marginInlineStart: 1 }}>
                  <Typography variant="sectionLabel" color={charge.paid ? 'text.disabled' : 'text.primary'} sx={{ textDecoration: charge.paid ? 'line-through' : 'none' }}>−{mask(`${card.currency} ${charge.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)}</Typography>
                  {charge.paid ? <CheckCircleIcon color="success" sx={{ fontSize: 18 }} /> : card.kind === 'credit' && <Button size="small" onClick={() => onPay(charge)}>{t('activity.pay')}</Button>}
                </Stack>
              </Stack>
            );
          })}
        </Box>
      ))}
      {visibleCount < groups.length && <Box sx={{ textAlign: 'center', py: 1 }}><Button size="small" onClick={onLoadMore}>{t('activity.loadPrevious', { count: groups.length - visibleCount })}</Button></Box>}
    </Stack>
  );
}
