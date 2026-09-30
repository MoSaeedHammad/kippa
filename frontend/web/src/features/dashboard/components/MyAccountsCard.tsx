import { useState } from 'react';
import { Box, Card, CardContent, Chip, Divider, Paper, Skeleton, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AccountBalanceIcon } from '@/components/AppIcon';
import { SavingsIcon } from '@/components/AppIcon';
import { PaymentsIcon } from '@/components/AppIcon';
import { CreditCardIcon } from '@/components/AppIcon';
import {
  useAccounts,
  useTransactions,
  useLedgerLines,
  useCards,
  useDisplayRates,
  useHouseholdBaseCurrency,
} from '@/hooks/useFinance';
import { useAppContext } from '@/hooks/useAppContext';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { CardTile } from '@/features/cards/CardTile';
import { CardDetail } from '@/features/cards/CardDetail';
import { computeCardSummary } from '@/libs/cardSelectors';
import { Money } from '@/components/Money';
import type { Card as CardType } from '@kippa/domain';
import { ForeignBalanceTooltip } from '@/features/shared/components/ForeignBalanceTooltip';
import { calculateAccountBalances } from '@/libs/financeCalculations';
import { DashboardCardHeading } from './DashboardCardHeading';

export function MyAccountsCard() {
  const { t } = useTranslation('dashboard');
  const { householdId } = useAppContext();
  const { data: accounts, isLoading: accountsLoading } = useAccounts(householdId);
  const { data: transactions, isLoading: txsLoading } = useTransactions(householdId);
  const { data: ledgerLines, isLoading: linesLoading } = useLedgerLines(householdId);
  const { data: cards = [] } = useCards(householdId);
  const baseCurrency = useHouseholdBaseCurrency();
  const foreignCurrencies = Array.from(new Set((accounts ?? []).map(account => account.currency).filter(currency => currency !== baseCurrency)));
  const { data: displayRates = {} } = useDisplayRates(baseCurrency, foreignCurrencies);
  const [detailCard, setDetailCard] = useState<CardType | null>(null);

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'savings': return <SavingsIcon variant="Bulk" />;
      case 'cash':
      case 'wallet': return <PaymentsIcon variant="Bulk" />;
      case 'credit': return <CreditCardIcon variant="Bulk" />;
      case 'running':
      default: return <AccountBalanceIcon variant="Bulk" />;
    }
  };

  const isLoading = accountsLoading || txsLoading || linesLoading;

  if (isLoading || !accounts || !transactions || !ledgerLines) {
    return (
      <Box>
        <Skeleton variant="text" width="30%" height={24} animation="wave" sx={{ mb: 1.5 }} />
        <Stack spacing={1}>
          {[1, 2].map(i => (
            <Card key={i} sx={{ borderRadius: '16px' }}>
              <CardContent sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '60%' }}>
                  <Skeleton variant="circular" width={40} height={40} animation="wave" />
                  <Box sx={{ width: '70%' }}>
                    <Skeleton variant="text" width="80%" height={20} animation="wave" />
                    <Skeleton variant="text" width="60%" height={16} animation="wave" />
                  </Box>
                </Stack>
                <Skeleton variant="text" width="20%" height={20} animation="wave" />
              </CardContent>
            </Card>
          ))}
        </Stack>
      </Box>
    );
  }

  const balancesMap = calculateAccountBalances(accounts, transactions, ledgerLines);

  // Credit accounts are debt buckets — hide from the accounts list.
  const visibleAccounts = accounts.filter(a => a.type !== 'credit');

  const summaryFor = (card: CardType) => {
    const creditBalance = balancesMap[card.parentAccountId] ?? 0;
    return computeCardSummary(card, creditBalance, null, []);
  };

  return (
    <>
      <Card>
        <CardContent>
          <Stack spacing={2.5}>
            <DashboardCardHeading icon={<AccountBalanceIcon variant="Bulk" />} title={t('accounts.title')} subtitle={t('accounts.subtitle')} trailing={<Chip label={t('accounts.count', { count: visibleAccounts.length })} />} />

            {visibleAccounts.length === 0 ? (
              <EmptyLayout title={t('accounts.emptyTitle')} description={t('accounts.emptyDescription')} />
            ) : (
              <Stack divider={<Divider />}>
                {visibleAccounts.map(acc => {
                  const bal = balancesMap[acc.id] || 0;
                  const linked = cards.filter(c => c.parentAccountId === acc.id || c.paymentAccountId === acc.id);
                  return (
                    <Box key={acc.id}>
                      <ForeignBalanceTooltip amount={bal} currency={acc.currency} baseCurrency={baseCurrency} rate={displayRates[acc.currency]}>
                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        spacing={2}
                        tabIndex={acc.currency === baseCurrency ? undefined : 0}
                        sx={{ minHeight: 72, py: 1.5, cursor: acc.currency === baseCurrency ? 'default' : 'help' }}
                      >
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                          <Paper variant="cardHeaderIcon">
                            {getAccountIcon(acc.type)}
                          </Paper>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography noWrap sx={{ fontSize: 13, lineHeight: '20px', fontWeight: 800, color: 'text.primary' }}>{acc.name}</Typography>
                            <Typography sx={{ fontSize: 11, lineHeight: '16px', fontWeight: 600, color: 'text.secondary', textTransform: 'capitalize' }}>{acc.type}</Typography>
                          </Box>
                        </Stack>
                        <Typography noWrap sx={{ fontSize: 15, lineHeight: '22px', fontWeight: 800, color: bal < 0 ? 'error.main' : 'text.primary', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                          <Money amount={bal} code={acc.currency} maxDigits={2} />
                        </Typography>
                      </Stack>
                      </ForeignBalanceTooltip>

                      {linked.length > 0 && (
                        <Box sx={{ pb: 2 }}>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2 }}>
                            {linked.map(card => (
                              <CardTile
                                key={card.id}
                                card={card}
                                summary={summaryFor(card)}
                                parentAccountBalance={balancesMap[card.parentAccountId]}
                                onOpenDetail={() => setDetailCard(card)}
                              />
                            ))}
                          </Box>
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      {detailCard && <CardDetail card={detailCard} onClose={() => setDetailCard(null)} />}
    </>
  );
}
