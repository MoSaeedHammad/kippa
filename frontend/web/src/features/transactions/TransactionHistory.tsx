import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Stack,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Card,
  Skeleton,
} from '@mui/material';
import { SearchIcon } from '@/components/AppIcon';

import {
  useAccounts,
  useCards,
  useCategories,
  useTransactions,
  useLedgerLines,
  useVoidTransactionMutation,
  useCycles,
  useActiveCycle,
  useHouseholdBaseCurrency
} from '@/hooks/useFinance';
import { useAppContext } from '@/hooks/useAppContext';
import { usePrivacyMask } from '@/hooks/usePrivacyMask';
import { EditTransactionDialog } from './components/EditTransactionDialog';
import { TransactionDetailDialog } from './components/TransactionDetailDialog';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { useTransactionHistoryUi } from './hooks/useTransactionHistoryUi';
import { usePagedList } from '@/hooks/usePagedList';
import { ListPagination } from '@/features/shared/components/ListPagination';
import { TransactionHistoryRow } from './components/TransactionHistoryRow';
import { useSharedBalanceMembers } from '@/features/shared-balance/hooks/useSharedBalance';
import type { FinanceTransaction } from '@kippa/domain';

export function TransactionHistory() {
  const { t } = useTranslation('transactions');
  const [searchParams, setSearchParams] = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();
  const { householdId } = useAppContext();
  const baseCurrency = useHouseholdBaseCurrency();
  const { maskDigits } = usePrivacyMask();
  
  // Filter States
  const { editingTx, searchTerm, selectedAccount, selectedCategory, selectedCycleId, setEditingTx, setSearchTerm, setSelectedAccount, setSelectedCategory, setSelectedCycleId } = useTransactionHistoryUi();
  const [detailTx, setDetailTx] = useState<FinanceTransaction | null>(null);
  const selectedType = searchParams.get('type') ?? 'all';

  const handleSearch = (value: string) => { setSearchTerm(value); historyPage.setPage(1); };
  const handleCategoryChange = (value: string) => { setSelectedCategory(value); historyPage.setPage(1); };
  const handleAccountChange = (value: string) => { setSelectedAccount(value); historyPage.setPage(1); };
  const handleTypeChange = (value: string) => {
    setSearchParams(value === 'all' ? {} : { type: value });
    historyPage.setPage(1);
  };
  const handleCycleChange = (value: string) => { setSelectedCycleId(value); historyPage.setPage(1); };


  // Queries & Mutations
  const { data: accounts = [], isLoading: accountsLoading } = useAccounts(householdId);
  const { data: cards = [] } = useCards(householdId);
  const { data: members = [] } = useSharedBalanceMembers(householdId);
  // The "Issued by" column only earns its space when several people share the space.
  const memberNames = new Map(members.map((member) => [member.uid, member.displayName]));
  const showIssuer = members.length > 1;
  const { data: categories = [], isLoading: categoriesLoading } = useCategories(householdId);
  const { data: cycles = [] } = useCycles(householdId);
  const { data: activeCycle } = useActiveCycle(householdId);

  const queryCycleId = useMemo(() => {
    if (selectedCycleId === 'all') return undefined;
    if (selectedCycleId === 'active') return activeCycle?.id || cycles[0]?.id;
    return selectedCycleId;
  }, [selectedCycleId, activeCycle, cycles]);

  const { data: transactions = [], isLoading: txsLoading } = useTransactions(householdId, queryCycleId);
  const { data: ledgerLines = [], isLoading: linesLoading } = useLedgerLines(householdId, queryCycleId);

  const voidTxMutation = useVoidTransactionMutation();

  // Void Transaction
  const handleVoid = async (txId: string) => {
    if (window.confirm(t('voidConfirm'))) {
      try {
        await voidTxMutation.mutateAsync({ householdId, transactionId: txId });
        enqueueSnackbar(t('voidedToast'), { variant: 'success' });
      } catch (err: any) {
        enqueueSnackbar(err.message || t('voidFailed'), { variant: 'error' });
      }
    }
  };

  // Filtering Logic
  const filteredTxs = transactions.filter(tx => {
    // 1. Text Search
    const searchMatch = (tx.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    // 2. Category Filter
    let catMatch = true;
    if (selectedCategory !== 'all') {
      catMatch = tx.categoryId === selectedCategory;
    }

    // 3. Account Filter
    let accMatch = true;
    if (selectedAccount !== 'all') {
      const txLines = ledgerLines.filter(l => l.transactionId === tx.id);
      accMatch = txLines.some(l => l.accountId === selectedAccount);
    }

    // 4. Type Filter
    let typeMatch = true;
    if (selectedType !== 'all') {
      typeMatch = tx.type === selectedType;
    }

    return searchMatch && catMatch && accMatch && typeMatch;
  });
  const historyPage = usePagedList(filteredTxs, 10);

  const isLoading = accountsLoading || categoriesLoading || txsLoading || linesLoading;

  if (isLoading) {
    return (
      <Box sx={{ py: 0.5 }}>
        <Stack spacing={3}>
          <Skeleton variant="text" width="40%" height={32} />
          <Skeleton variant="rectangular" width="100%" height={80} sx={{ borderRadius: '16px' }} />
          <Skeleton variant="rectangular" width="100%" height={300} sx={{ borderRadius: '20px' }} />
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ py: 0.5 }}>
      <Stack spacing={2.5}>
        <PageHeader title={t('title')} subtitle={t('subtitle')} />

        <Stack spacing={1.5}>
          <TextField
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={e => handleSearch(e.target.value)}
            fullWidth
            slotProps={{
              input: {
                startAdornment: <SearchIcon sx={{ color: 'text.secondary', marginInlineEnd: 1, fontSize: 20 }} />,
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': { bgcolor: 'surfaceContainerLow' },
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'transparent !important',
                borderWidth: '0 !important',
              },
            }}
          />

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
              gap: 1.5,
            }}
          >
            <FormControl fullWidth>
              <InputLabel id="history-cycle-label">{t('filters.statement')}</InputLabel>
              <Select labelId="history-cycle-label" value={selectedCycleId} label={t('filters.statement')} onChange={e => handleCycleChange(e.target.value)}>
                <MenuItem value="all">{t('filters.allCycles')}</MenuItem>
                <MenuItem value="active">{t('filters.activeCycle')}</MenuItem>
                {cycles.filter(c => c.status !== 'open').map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.name} ({c.status})</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel id="history-account-label">{t('filters.account')}</InputLabel>
              <Select labelId="history-account-label" value={selectedAccount} label={t('filters.account')} onChange={e => handleAccountChange(e.target.value)}>
                <MenuItem value="all">{t('filters.allAccounts')}</MenuItem>
                {accounts.map(a => (
                  <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel id="history-category-label">{t('filters.category')}</InputLabel>
              <Select labelId="history-category-label" value={selectedCategory} label={t('filters.category')} onChange={e => handleCategoryChange(e.target.value)}>
                <MenuItem value="all">{t('filters.allCategories')}</MenuItem>
                {categories.map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel id="history-type-label">{t('filters.type')}</InputLabel>
              <Select labelId="history-type-label" value={selectedType} label={t('filters.type')} onChange={e => handleTypeChange(e.target.value)}>
                <MenuItem value="all">{t('filters.allTypes')}</MenuItem>
                <MenuItem value="expense">{t('types.expense')}</MenuItem>
                <MenuItem value="income">{t('types.income')}</MenuItem>
                <MenuItem value="transfer">{t('types.transfer')}</MenuItem>
                <MenuItem value="adjustment">{t('types.reconciliation')}</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Stack>

        {/* Approval-style transaction list */}
        <Card sx={{ overflow: 'hidden', '&:hover': { transform: 'none' } }}>
          {filteredTxs.length === 0 ? (
            <Box sx={{ p: 2 }}>
              <EmptyLayout
                icon={<SearchIcon sx={{ fontSize: 28 }} />}
                title={t('empty.title')}
                description={t('empty.description')}
              />
            </Box>
          ) : (
            historyPage.pageItems.map((transaction) => (
              <TransactionHistoryRow
                key={transaction.id}
                transaction={transaction}
                accounts={accounts}
                categories={categories}
                cards={cards}
                ledgerLines={ledgerLines}
                baseCurrency={baseCurrency}
                maskDigits={maskDigits}
                onEdit={setEditingTx}
                onVoid={handleVoid}
                onOpen={setDetailTx}
                issuedByName={showIssuer ? (memberNames.get(transaction.createdBy) ?? transaction.createdBy.slice(0, 6)) : undefined}
              />
            ))
          )}
          <ListPagination
            page={historyPage.page}
            pageCount={historyPage.pageCount}
            total={historyPage.total}
            pageSize={10}
            onChange={historyPage.setPage}
          />
        </Card>
      </Stack>

      {/* Shared Edit Dialog */}
      <EditTransactionDialog
        open={Boolean(editingTx)}
        transaction={editingTx}
        onClose={() => setEditingTx(null)}
      />

      {/* Read-only detail popup (F4) */}
      <TransactionDetailDialog
        open={Boolean(detailTx)}
        transaction={detailTx}
        ledgerLines={ledgerLines}
        accounts={accounts}
        cards={cards}
        categories={categories}
        issuedByName={showIssuer && detailTx ? (memberNames.get(detailTx.createdBy) ?? detailTx.createdBy.slice(0, 6)) : undefined}
        onClose={() => setDetailTx(null)}
      />
    </Box>
  );
}
