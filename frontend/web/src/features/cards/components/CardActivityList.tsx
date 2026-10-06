import { Box, Button, Divider, Stack, Typography } from '@mui/material';
import type { CardCharge, CardChargeGroup } from '@/libs/cardActivity';
import type { Card, Category } from '@kippa/domain';
import { CheckCircleIcon } from '@/components/AppIcon';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { TransactionIcon } from '@/features/transactions/components/TransactionIcon';

type Props = { card: Card; categories: Category[]; groups: CardChargeGroup[]; mask: (value: string) => string; onLoadMore: () => void; onPay: (charge: CardCharge) => void; visibleCount: number };

export function CardActivityList({ card, categories, groups, mask, onLoadMore, onPay, visibleCount }: Props) {
  if (groups.length === 0) return <EmptyLayout title="No charges yet" description="Transactions on this card will appear here grouped by cycle." />;
  return (
    <Stack divider={<Divider />}>
      {groups.slice(0, visibleCount).map((group) => (
        <Box key={group.groupId}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 1.5 }}>
            <Box>
              <Typography variant="sectionLabel">{group.cycleName}</Typography>
              {group.cycleDateRange && <Typography variant="body2" color="text.secondary">{group.cycleDateRange}</Typography>}
            </Box>
            <Typography variant="body2" color="text.secondary">{group.charges.length} charge{group.charges.length !== 1 ? 's' : ''}</Typography>
          </Stack>
          {group.charges.map((charge) => {
            const category = charge.categoryId ? categories.find((candidate) => candidate.id === charge.categoryId) : null;
            return (
              <Stack key={charge.lineId} direction="row" alignItems="flex-start" spacing={1.5} sx={{ py: 1 }}>
                <TransactionIcon type={charge.txType} size={38} isCreditCard={card.kind === 'credit'} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="sectionLabel" color={charge.paid ? 'text.disabled' : 'text.primary'} sx={{ textDecoration: charge.paid ? 'line-through' : 'none' }}>{category?.name ?? charge.txType}</Typography>
                  {charge.description && <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.25 }}>{charge.description}</Typography>}
                  {charge.feeRate != null && charge.feeRate > 0 && <Typography variant="fieldHint" color="text.secondary">Includes {charge.feeRate}% bank fee</Typography>}
                  <Typography variant="fieldHint" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>{charge.date}</Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0, ml: 1 }}>
                  <Typography variant="sectionLabel" color={charge.paid ? 'text.disabled' : 'text.primary'} sx={{ textDecoration: charge.paid ? 'line-through' : 'none' }}>−{mask(`${card.currency} ${charge.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)}</Typography>
                  {charge.paid ? <CheckCircleIcon color="success" sx={{ fontSize: 18 }} /> : card.kind === 'credit' && <Button size="small" onClick={() => onPay(charge)}>Pay</Button>}
                </Stack>
              </Stack>
            );
          })}
        </Box>
      ))}
      {visibleCount < groups.length && <Box sx={{ textAlign: 'center', py: 1 }}><Button size="small" onClick={onLoadMore}>Load previous cycle ({groups.length - visibleCount} remaining)</Button></Box>}
    </Stack>
  );
}
