import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
  Button,
  IconButton,
  Skeleton,
  Chip,
  Paper
} from '@mui/material';
import { AccountBalanceIcon } from '@/components/AppIcon';
import { SavingsIcon } from '@/components/AppIcon';
import { PaymentsIcon } from '@/components/AppIcon';
import { CreditCardIcon } from '@/components/AppIcon';
import { EditIcon } from '@/components/AppIcon';
import { AddIcon } from '@/components/AppIcon';
import {
  useAccounts,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useCards,
  useUpdateCardMutation,
  useLedgerLines,
  useTransactions,
  useCardStatements,
  useDisplayRates,
} from '@/hooks/useFinance';
import { Account, AccountType, CurrencyCode, Card as CardType } from '@kippa/domain';
import { useAppContext } from '@/hooks/useAppContext';
import { CardTile } from '@/features/cards/CardTile';
import { AddCardDialog } from '@/features/cards/AddCardDialog';
import { CardDetail } from '@/features/cards/CardDetail';
import { calculateAccountBalance } from '@/libs/financeCalculations';
import { computeCardSummary } from '@/libs/cardSelectors';
import { useHouseholdBaseCurrency } from '@/hooks/useFinance';
import { Money } from '@/components/Money';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { ForeignBalanceTooltip } from '@/features/shared/components/ForeignBalanceTooltip';
import { AddAccountCard, EditAccountDialog } from './components/AccountForms';

export function Accounts() {
  const { householdId } = useAppContext();
  const baseCurrency = useHouseholdBaseCurrency();
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // Card UI state
  const [addCardForAccount, setAddCardForAccount] = useState<string | null>(null);
  const [detailCard, setDetailCard] = useState<CardType | null>(null);

  // Queries & Mutations
  const { data: accounts = [], isLoading } = useAccounts(householdId);
  const { data: cards = [] } = useCards(householdId);
  const { data: ledgerLines = [] } = useLedgerLines(householdId);
  const { data: transactions = [] } = useTransactions(householdId);
  const { data: statements = [] } = useCardStatements(householdId);
  const foreignCurrencies = Array.from(new Set(accounts.map(account => account.currency).filter(currency => currency !== baseCurrency)));
  const { data: displayRates = {} } = useDisplayRates(baseCurrency, foreignCurrencies);
  const createAccountMutation = useCreateAccountMutation();
  const updateAccountMutation = useUpdateAccountMutation();
  const updateCard = useUpdateCardMutation();

  // Balance of an account from the ledger.
  const accountBalance = (accountId: string) => {
    return calculateAccountBalance(accountId, transactions, ledgerLines);
  };

  // Compute the summary for a credit card from ledger + statements.
  const summaryFor = (card: CardType) => {
    const creditBalance = accountBalance(card.parentAccountId);
    const cardStmts = statements.filter(s => s.cardId === card.id);
    const last = cardStmts[0] ?? null;
    return computeCardSummary(card, creditBalance, last, cardStmts);
  };

  const handleOpenEdit = (acc: Account) => {
    setEditingAccount(acc);
  };

  const handleUpdateAccount = async (updated: Account) => {
    if (!editingAccount) return;
    await updateAccountMutation.mutateAsync({
      householdId,
      accountId: editingAccount.id,
      updated
    });
    setEditingAccount(null);
  };

  const handleCreateAccount = async (draft: { name: string; type: AccountType; currency: CurrencyCode }) => {
    const nextOrder = accounts.length > 0 ? Math.max(...accounts.map(a => a.sortOrder)) + 1 : 1;

    await createAccountMutation.mutateAsync({
      householdId,
      account: {
        ...draft,
        isActive: true,
        sortOrder: nextOrder
      }
    });
  };

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

  // Credit accounts are debt buckets owned by their cards — hide them from the
  // accounts list (you never transact with them directly outside card flows).
  const visibleAccounts = accounts.filter(a => a.type !== 'credit');

  return (
    <Box sx={{ py: 0.5 }}>
      <Stack spacing={3}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} flexWrap="wrap" useFlexGap>
          <Box>
            <Typography variant="h2" sx={{ fontSize: 24, fontWeight: 800, color: 'text.primary' }}>
              Accounts & Cards
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 13, mt: 0.5 }}>
              Manage accounts, cash, wallets and cards
            </Typography>
          </Box>
          {!isLoading && (
            <Chip
              label={`${visibleAccounts.length} ${visibleAccounts.length === 1 ? 'account' : 'accounts'} connected`}
              sx={{ bgcolor: 'action.hover', color: 'primary.main' }}
            />
          )}
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 7fr) minmax(280px, 3fr)' },
            gap: 3,
            alignItems: 'start',
          }}
        >
          {/* Accounts List — cards nested inside their account */}
          <Stack spacing={2} sx={{ minWidth: 0 }}>
            {isLoading ? (
              [1, 2].map(i => (
                <Skeleton key={i} variant="rectangular" width="100%" height={160} sx={{ borderRadius: '20px' }} animation="wave" />
              ))
            ) : visibleAccounts.length === 0 ? (
              <EmptyLayout
                icon={<AccountBalanceIcon sx={{ fontSize: 28 }} />}
                title="No accounts yet"
                description="Create your first account to begin tracking balances and cards."
              />
            ) : (
              visibleAccounts.map(acc => {
                const bal = accountBalance(acc.id);
                const linked = cards.filter(c => c.parentAccountId === acc.id || c.paymentAccountId === acc.id);
                const canHoldCard = acc.type === 'running' || acc.type === 'savings';
                return (
                  <Card key={acc.id} sx={{ overflow: 'hidden' }}>
                    <CardContent>
                      <Stack spacing={2.5}>
                        <ForeignBalanceTooltip amount={bal} currency={acc.currency} baseCurrency={baseCurrency} rate={displayRates[acc.currency]}>
                        <Stack
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          spacing={2}
                          tabIndex={acc.currency === baseCurrency ? undefined : 0}
                          sx={{ cursor: acc.currency === baseCurrency ? 'default' : 'help' }}
                        >
                          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                            <Paper variant="cardHeaderIcon">
                              {getAccountIcon(acc.type)}
                            </Paper>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography noWrap sx={{ fontSize: 16, lineHeight: '22px', fontWeight: 800, color: 'text.primary' }}>{acc.name}</Typography>
                              <Typography sx={{ color: 'text.secondary', fontSize: 12, fontWeight: 600 }}>
                                {acc.type.toUpperCase()} • {acc.currency}
                              </Typography>
                            </Box>
                          </Stack>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Typography sx={{ fontSize: 14, fontWeight: 800, color: 'text.primary', whiteSpace: 'nowrap' }}>
                              <Money amount={bal} code={acc.currency} maxDigits={2} />
                            </Typography>
                            <IconButton aria-label={`Edit ${acc.name}`} onClick={() => handleOpenEdit(acc)}>
                              <EditIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Stack>
                        </Stack>
                        </ForeignBalanceTooltip>

                        {canHoldCard && (
                          <Box>
                            {linked.length > 0 && (
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 1.5 }}>
                                {linked.map(card => (
                                  <CardTile
                                    key={card.id}
                                    card={card}
                                    summary={summaryFor(card)}
                                    parentAccountBalance={accountBalance(card.parentAccountId)}
                                    onFreeze={() => updateCard.mutate({
                                      householdId, cardId: card.id,
                                      updates: { isActive: !card.isActive }, accounts,
                                    })}
                                    onOpenDetail={() => setDetailCard(card)}
                                  />
                                ))}
                              </Box>
                            )}
                            <Button startIcon={<AddIcon />} onClick={() => setAddCardForAccount(acc.id)} sx={{ color: 'text.secondary' }}>
                              {linked.length > 0 ? 'Add another card' : 'Add card'}
                            </Button>
                          </Box>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </Stack>

          <AddAccountCard baseCurrency={baseCurrency} busy={createAccountMutation.isPending} onCreate={handleCreateAccount} />
        </Box>
      </Stack>

      {/* Card dialogs */}
      <AddCardDialog
        open={addCardForAccount !== null}
        preselectAccountId={addCardForAccount}
        onClose={() => setAddCardForAccount(null)}
      />
      {detailCard && <CardDetail card={detailCard} onClose={() => setDetailCard(null)} />}

      {editingAccount && <EditAccountDialog account={editingAccount} busy={updateAccountMutation.isPending} onClose={() => setEditingAccount(null)} onSave={handleUpdateAccount} />}
    </Box>
  );
}
