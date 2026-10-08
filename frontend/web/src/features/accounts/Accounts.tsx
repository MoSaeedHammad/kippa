import { useState } from 'react';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Alert,
  Paper
} from '@mui/material';
import { AccountBalanceIcon } from '@/components/AppIcon';
import { SavingsIcon } from '@/components/AppIcon';
import { PaymentsIcon } from '@/components/AppIcon';
import { CreditCardIcon } from '@/components/AppIcon';
import { DeleteIcon } from '@/components/AppIcon';
import { EditIcon } from '@/components/AppIcon';
import { AddIcon } from '@/components/AppIcon';
import { VisibilityOffIcon } from '@/components/AppIcon';
import { VisibilityIcon } from '@/components/AppIcon';
import {
  useAccounts,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useCards,
  useUpdateCardMutation,
  useDeleteCardMutation,
  useWipeAccountMutation,
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
import { accountLifecycleLib, type AccountWipePreview } from '@/libs/accountLifecycle';
import { useHouseholdBaseCurrency } from '@/hooks/useFinance';
import { Money } from '@/components/Money';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { ForeignBalanceTooltip } from '@/features/shared/components/ForeignBalanceTooltip';
import { AddAccountCard, EditAccountDialog } from './components/AccountForms';
import { useSharedBalanceMembers } from '@/features/shared-balance/hooks/useSharedBalance';

export function Accounts() {
  const { t } = useTranslation('accounts');
  const { enqueueSnackbar } = useSnackbar();
  const { householdId } = useAppContext();
  const baseCurrency = useHouseholdBaseCurrency();
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // Card UI state
  const [addCardForAccount, setAddCardForAccount] = useState<string | null>(null);
  const [detailCard, setDetailCard] = useState<CardType | null>(null);

  // Frozen/void visibility + destructive-removal state
  const [showInactive, setShowInactive] = useState(false);
  const [removingCard, setRemovingCard] = useState<CardType | null>(null);
  const [cardWipePreview, setCardWipePreview] = useState<AccountWipePreview | null>(null);

  // Queries & Mutations
  const { data: accounts = [], isLoading } = useAccounts(householdId);
  const { data: members = [] } = useSharedBalanceMembers(householdId);
  const { data: cards = [] } = useCards(householdId);
  const { data: ledgerLines = [] } = useLedgerLines(householdId);
  const { data: transactions = [] } = useTransactions(householdId);
  const { data: statements = [] } = useCardStatements(householdId);
  const foreignCurrencies = Array.from(new Set(accounts.map(account => account.currency).filter(currency => currency !== baseCurrency)));
  const { data: displayRates = {} } = useDisplayRates(baseCurrency, foreignCurrencies);
  const createAccountMutation = useCreateAccountMutation();
  const updateAccountMutation = useUpdateAccountMutation();
  const updateCard = useUpdateCardMutation();
  const deleteCardMutation = useDeleteCardMutation();
  const wipeAccountMutation = useWipeAccountMutation();

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

  const handleWipeAccount = async () => {
    if (!editingAccount) return;
    try {
      await wipeAccountMutation.mutateAsync({ householdId, accountId: editingAccount.id });
      enqueueSnackbar(t('wipe.done'), { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('wipe.failed'), { variant: 'error' });
    } finally {
      setEditingAccount(null);
    }
  };

  // Opening the removal dialog for a credit card fetches the server-side
  // preview of the hidden debt-account wipe so the user sees real numbers.
  const handleOpenRemoveCard = async (card: CardType) => {
    setRemovingCard(card);
    setCardWipePreview(null);
    if (card.kind === 'credit') {
      try {
        setCardWipePreview(await accountLifecycleLib.previewWipe(householdId, card.parentAccountId));
      } catch {
        setCardWipePreview(null);
      }
    }
  };

  const handleRemoveCard = async () => {
    if (!removingCard) return;
    try {
      await deleteCardMutation.mutateAsync({ householdId, cardId: removingCard.id });
      enqueueSnackbar(t('cardRemove.done'), { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('cardRemove.failed'), { variant: 'error' });
    } finally {
      setRemovingCard(null);
      setCardWipePreview(null);
    }
  };

  const handleCreateAccount = async (draft: { name: string; type: AccountType; currency: CurrencyCode; ownerUid: string | null }) => {
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
  // Frozen/void accounts stay out of the list unless explicitly revealed.
  const inactiveCount = accounts.filter(a => a.type !== 'credit' && !a.isActive).length;
  const visibleAccounts = accounts
    .filter(a => a.type !== 'credit' && (showInactive || a.isActive));

  return (
    <Box sx={{ py: 0.5 }}>
      <Stack spacing={3}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} flexWrap="wrap" useFlexGap>
          <Box>
            <Typography variant="h2" sx={{ fontSize: 24, fontWeight: 800, color: 'text.primary' }}>
              {t('page.title')}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 13, mt: 0.5 }}>
              {t('page.subtitle')}
            </Typography>
          </Box>
          {!isLoading && (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip
                label={t('connected', { count: visibleAccounts.length })}
                sx={{ bgcolor: 'action.hover', color: 'primary.main' }}
              />
              {(inactiveCount > 0 || showInactive) && (
                <Chip
                  icon={showInactive ? <VisibilityIcon sx={{ fontSize: 16 }} /> : <VisibilityOffIcon sx={{ fontSize: 16 }} />}
                  label={showInactive ? t('hideInactive') : t('showInactive')}
                  onClick={() => setShowInactive(current => !current)}
                  variant={showInactive ? 'outlined' : undefined}
                  color={showInactive ? 'primary' : 'default'}
                  sx={{ bgcolor: 'action.hover' }}
                />
              )}
            </Stack>
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
                title={t('empty.title')}
                description={t('empty.description')}
              />
            ) : (
              visibleAccounts.map(acc => {
                const bal = accountBalance(acc.id);
                const allLinked = cards.filter(c => c.parentAccountId === acc.id || c.paymentAccountId === acc.id);
                const linked = allLinked.filter(c => showInactive || c.isActive);
                const hiddenCards = allLinked.length - linked.length;
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
                            <IconButton aria-label={t('editAria', { name: acc.name })} onClick={() => handleOpenEdit(acc)}>
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
                                    onDelete={() => void handleOpenRemoveCard(card)}
                                    onOpenDetail={() => setDetailCard(card)}
                                  />
                                ))}
                              </Box>
                            )}
                            {hiddenCards > 0 && (
                              <Typography variant="fieldHint" color="text.secondary" sx={{ mb: 0.5 }}>
                                {t('hiddenInactive', { count: hiddenCards })}
                              </Typography>
                            )}
                            <Button startIcon={<AddIcon />} onClick={() => setAddCardForAccount(acc.id)} sx={{ color: 'text.secondary' }}>
                              {linked.length > 0 ? t('addAnotherCard') : t('addCard')}
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

          <AddAccountCard baseCurrency={baseCurrency} busy={createAccountMutation.isPending} members={members} onCreate={handleCreateAccount} />
        </Box>
      </Stack>

      {/* Card dialogs */}
      <AddCardDialog
        open={addCardForAccount !== null}
        preselectAccountId={addCardForAccount}
        onClose={() => setAddCardForAccount(null)}
      />
      {detailCard && <CardDetail card={detailCard} onClose={() => setDetailCard(null)} />}

      {/* Card removal confirmation — credit cards wipe their hidden debt account. */}
      <Dialog open={removingCard !== null} onClose={() => { setRemovingCard(null); setCardWipePreview(null); }} fullWidth maxWidth="xs">
        <DialogTitle>{removingCard ? t('cardRemove.title', { name: removingCard.name }) : ''}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Alert severity={removingCard?.kind === 'credit' ? 'error' : 'info'}>
              {removingCard?.kind === 'credit' ? t('cardRemove.credit') : t('cardRemove.debit')}
            </Alert>
            {removingCard?.kind === 'credit' && cardWipePreview && cardWipePreview.transactions > 0 && (
              <Typography variant="body2" color="text.secondary">
                {t('cardRemove.transactions', { count: cardWipePreview.transactions })}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setRemovingCard(null); setCardWipePreview(null); }}>{t('cardRemove.cancel')}</Button>
          <Button color="error" variant="contained" startIcon={<DeleteIcon />} loading={deleteCardMutation.isPending} onClick={() => void handleRemoveCard()}>
            {t('cardRemove.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {editingAccount && (
        <EditAccountDialog
          account={editingAccount}
          busy={updateAccountMutation.isPending}
          members={members}
          onClose={() => setEditingAccount(null)}
          onSave={handleUpdateAccount}
          onDelete={handleWipeAccount}
        />
      )}
    </Box>
  );
}
