import { useMemo } from 'react';
import { useSnackbar } from 'notistack';
import {
  Box,
  Button,
  Divider,
  InputAdornment,
  Stack,
  TextField,
  Skeleton
} from '@mui/material';
import { MobileDatePicker } from '@mui/x-date-pickers/MobileDatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { CalendarTodayIcon, CheckCircleIcon, NotesIcon } from '@/components/AppIcon';
import { isToday, format } from 'date-fns';
import {
  useAccounts,
  useCategories,
  useCategoryFrequency,
  useCycles,
  useCreateTransactionMutation,
  useHouseholdBaseCurrency
} from '@/hooks/useFinance';
import { useAppContext } from '@/hooks/useAppContext';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { AccountPicker } from '@/features/shared/components/AccountPicker';
import { CategoryChips, CategoryDialog } from './components/CategoryPicker';
import { SaveFeedbackOverlay } from './components/SaveFeedbackOverlay';
import { EntryKeypad } from './components/EntryKeypad';
import { buildFastEntryTransaction, type EntryMode } from '@/libs/fastEntryTransaction';
import { useSaveFeedback } from './hooks/useSaveFeedback';
import { useFastEntryFormState } from './hooks/useFastEntryFormState';

export function FastEntry() {
  const { enqueueSnackbar } = useSnackbar();
  const { householdId, userProfile } = useAppContext();
  const baseCurrency = useHouseholdBaseCurrency();
  const isSaveAnimationPreview = import.meta.env.DEV
    && new URLSearchParams(window.location.search).get('preview-save-animation') === '1';

  const { amountStr, categoryDialogOpen, categorySearch, datePickerOpen, description, entryDate, isKeypadForDest, mode, selectedAccountId, selectedCategoryId, setAmountStr, setCategoryDialogOpen, setCategorySearch, setDatePickerOpen, setDescription, setEntryDate, setIsKeypadForDest, setMode, setSelectedAccountId, setSelectedCategoryId, setToAccountId, setToAmountStr, toAccountId, toAmountStr } = useFastEntryFormState();
  const saveFeedback = useSaveFeedback();
  const triggerSaveFeedback = saveFeedback.show;

  // Transfer Specific States

  // Queries & Mutations
  const { data: accounts = [], isLoading: accountsLoading } = useAccounts(householdId);
  const { data: categories = [], isLoading: categoriesLoading } = useCategories(householdId);
  const { data: cycles = [] } = useCycles(householdId);
  const createTxMutation = useCreateTransactionMutation();

  const frequencyScores = useCategoryFrequency(
    householdId,
    mode === 'income' ? 'income' : 'expense'
  );

  const activeCycle = cycles.find(c => c.status === 'open') || null;
  // YYYY-MM-DD string submitted to the backend
  const date = format(entryDate, 'yyyy-MM-dd');
  const dateLabel = isToday(entryDate) ? 'Today' : format(entryDate, 'MMM d');

  // Sort accounts so base-currency running accounts come first, then cash accounts, then everything else (e.g. USD).
  // Priority: base-currency running account (0) -> cash type (1) -> other (2). Stable within each tier.
  const sortedAccounts = [...accounts].sort((a, b) => {
    const rank = (acc: typeof a) => {
      if (acc.currency === baseCurrency && acc.type === 'running') return 0;
      if (acc.type === 'cash') return 1;
      return 2;
    };
    return rank(a) - rank(b);
  });

  // Derive selected items. Accounts default to nothing — the user must
  // explicitly pick one, and we warn via snackbar if they forget on save.
  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || null;

  const toAccount = accounts.find(a => a.id === toAccountId) || null;

  // Filter destination accounts based on chosen mode and source account
  const eligibleDestinationAccounts = sortedAccounts.filter(acc => {
    if (acc.id === selectedAccountId) return false;
    if (!selectedAccount) return true;
    // Transfer accepts any other account — same or different currency.
    if (mode === 'transfer') return true;
    return true;
  });

  // True when the user is making a cross-currency transfer (needs a destination
  // amount + a derived rate). False for same-currency transfers and other modes.
  const isCrossCurrency =
    mode === 'transfer' &&
    !!selectedAccount &&
    !!toAccount &&
    toAccount.currency !== selectedAccount.currency;

  const selectedCategory = (selectedCategoryId && categories.find(c => c.id === selectedCategoryId && c.type === mode))
    || null;

  const sortedCategories = useMemo(() => {
    if (mode !== 'expense' && mode !== 'income') return [];
    return categories
      .filter((c) => c.type === mode)
      .map((c) => ({
        ...c,
        score: frequencyScores[c.id] ?? 0,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score; // score DESC
        return a.name.localeCompare(b.name); // name ASC tiebreak
      });
  }, [categories, mode, frequencyScores]);

  const frequentCategories = useMemo(() => {
    const used = sortedCategories.filter(category => category.score > 0);
    return (used.length > 0 ? used : sortedCategories).slice(0, 8);
  }, [sortedCategories]);

  const displayedCategories = useMemo(() => {
    if (!selectedCategory || frequentCategories.some(category => category.id === selectedCategory.id)) {
      return frequentCategories;
    }
    return [selectedCategory, ...frequentCategories.slice(0, 7)];
  }, [frequentCategories, selectedCategory]);

  const filteredCategories = useMemo(() => {
    const query = categorySearch.trim().toLocaleLowerCase();
    if (!query) return sortedCategories;
    return sortedCategories.filter(category => category.name.toLocaleLowerCase().includes(query));
  }, [categorySearch, sortedCategories]);

  // Event handlers to update state and reset target/destination account if it is invalid for the chosen mode or source account.
  const handleSelectSourceAccount = (id: string | null) => {
    setSelectedAccountId(id);
    if (!id || !toAccountId) return;
    const sourceAcc = accounts.find(a => a.id === id);
    const toAcc = accounts.find(a => a.id === toAccountId);
    if (!sourceAcc || !toAcc) return;

    if (toAccountId === id) {
      setToAccountId(null);
      return;
    }

    // Transfer accepts any currency; only clear if it equals the source.
    // (Equality already handled by the `toAccountId === id` check above.)
  };

  const handleSelectMode = (m: EntryMode) => {
    setMode(m);
    setSelectedCategoryId(null);
    setCategoryDialogOpen(false);
    setCategorySearch('');
    
    if (!toAccountId || !selectedAccountId) return;
    const sourceAcc = accounts.find(a => a.id === selectedAccountId);
    const toAcc = accounts.find(a => a.id === toAccountId);
    if (!sourceAcc || !toAcc) return;

    // No currency-based clearing needed: transfer accepts any currency,
    // and other modes don't use a destination account.
  };

  // Keypad controls
  const handleKeypadPress = (val: string) => {
    const activeSetter = isKeypadForDest ? setToAmountStr : setAmountStr;
    const activeVal = isKeypadForDest ? toAmountStr : amountStr;

    if (val === 'back') {
      activeSetter(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
    } else if (val === '.') {
      if (!activeVal.includes('.')) {
        activeSetter(prev => prev + '.');
      }
    } else {
      activeSetter(prev => prev === '0' ? val : prev + val);
    }
  };

  const handleSave = async () => {
    if (isSaveAnimationPreview) {
      triggerSaveFeedback(mode === 'expense' ? 'Expense logged' : mode === 'income' ? 'Income logged' : 'Transfer sent', `${amountStr === '0' ? '250' : amountStr} ${selectedAccount?.currency ?? baseCurrency}`, mode === 'transfer' ? 'Transfer' : selectedCategory?.name ?? 'Food & dining', mode === 'transfer' ? `${selectedAccount?.name ?? 'EGP Cash'} → ${toAccount?.name ?? 'EGP Bank'}` : selectedAccount?.name ?? 'EGP Cash');
      return;
    }
    try {
      const payload = buildFastEntryTransaction({ activeCycle, amountText: amountStr, category: selectedCategory, createdBy: userProfile!.uid, date, description, destinationAccount: toAccount, destinationAmountText: toAmountStr, mode, sourceAccount: selectedAccount });
      await createTxMutation.mutateAsync({ householdId, ...payload });
      const amount = Number(amountStr);
      triggerSaveFeedback(mode === 'expense' ? 'Expense logged' : mode === 'income' ? 'Income logged' : 'Transfer sent', `${amount} ${selectedAccount!.currency}`, mode === 'transfer' ? 'Transfer' : selectedCategory?.name ?? mode, mode === 'transfer' ? `${selectedAccount!.name} → ${toAccount!.name}` : selectedAccount!.name);
      if (mode === 'expense') localStorage.setItem('ledger_last_used_account', selectedAccount!.id);
      setAmountStr('0');
      setToAmountStr('0');
      setDescription('');
      if (mode !== 'transfer') setSelectedCategoryId(null);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Error occurred saving transaction', { variant: 'error' });
    }
  };
  const currentCurrencySymbol = selectedAccount?.currency ?? baseCurrency;
  const isSaving = createTxMutation.isPending;
  const saveLabel = mode === 'expense' ? 'Save Expense' : mode === 'income' ? 'Save Income' : 'Save Transaction';

  if (accountsLoading || categoriesLoading) {
    return (
      <Box sx={{ py: 0.5, width: '100%', maxWidth: 520, mx: 'auto' }}>
        <Stack spacing={3}>
          <PageHeader title="Fast Entry" subtitle="Log expenses, income & transfers" />
          <Skeleton variant="rectangular" width="100%" height={100} sx={{ borderRadius: '20px' }} />
          <Skeleton variant="rectangular" width="100%" height={250} sx={{ borderRadius: '20px' }} />
        </Stack>
      </Box>
    );
  }

  if (accounts.length === 0) {
    return (
      <Box sx={{ py: 0.5, width: '100%', maxWidth: 520, mx: 'auto' }}>
        <Stack spacing={3}>
          <PageHeader title="Fast Entry" subtitle="Log expenses, income & transfers" />
          <EmptyLayout
            title="No accounts to log entries against"
            description="Add an account first — you'll need one to record expenses, income, or transfers."
          />
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ py: 0.5, pb: { xs: 12, lg: 0 }, width: '100%', maxWidth: 520, mx: 'auto' }}>
      <Stack spacing={2.5}>
        
        {/* Page Header */}
        <PageHeader title="Fast Entry" subtitle="Log expenses, income & transfers" />

        {/* Keep the entry type visible before the amount on every viewport. */}
        <Stack direction="row" spacing={1} sx={{ width: '100%' }}>
          {(['expense', 'income', 'transfer'] as EntryMode[]).map(m => (
            <Button
              key={m}
              onClick={() => handleSelectMode(m)}
              variant={mode === m ? 'segmentedSelected' : 'segmented'}
              sx={{ flex: 1 }}
            >
              {m.toUpperCase()}
            </Button>
          ))}
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
            gap: 3,
            alignItems: 'start',
          }}
        >
          <Box sx={{ order: 2, minWidth: 0 }}>
            <Stack spacing={2.5} divider={<Divider flexItem />}>

        {/* Category Selection (Only for expense/income) */}
        {(mode === 'expense' || mode === 'income') && (
          <CategoryChips
            categories={displayedCategories}
            mode={mode}
            onOpenAll={() => setCategoryDialogOpen(true)}
            onSelect={setSelectedCategoryId}
            selectedCategoryId={selectedCategoryId}
            totalCount={sortedCategories.length}
          />
        )}

        <AccountPicker
          accounts={sortedAccounts}
          label={mode === 'transfer' ? 'Source Account' : 'From Account'}
          onSelect={handleSelectSourceAccount}
          selectedAccountId={selectedAccountId}
        />

        {/* Target Account Selection (Only for transfer) */}
        {mode === 'transfer' && (
          <AccountPicker
            accounts={eligibleDestinationAccounts}
            emptyMessage={selectedAccountId
              ? 'No other accounts available.'
              : 'Please select a Source Account first.'}
            label="Destination Account"
            onSelect={setToAccountId}
            selectedAccountId={toAccountId}
          />
        )}

        {/* Note / Date Area */}
        <Stack direction="row" spacing={1.5} sx={{ width: '100%' }}>
          <TextField
            fullWidth
            placeholder="Note (optional)"
            value={description}
            onChange={event => setDescription(event.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <NotesIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <MobileDatePicker
              value={entryDate}
              onChange={(newValue) => newValue && setEntryDate(newValue)}
              maxDate={new Date()}
              closeOnSelect
              open={datePickerOpen}
              onOpen={() => setDatePickerOpen(true)}
              onClose={() => setDatePickerOpen(false)}
              slots={{ field: DateButtonField }}
              slotProps={{
                field: { dateLabel, setOpen: setDatePickerOpen } as any,
              }}
            />
          </LocalizationProvider>
        </Stack>

        <Button
          fullWidth
          variant="primaryAction"
          loading={isSaving}
          startIcon={<CheckCircleIcon />}
          onClick={handleSave}
          sx={{ display: { xs: 'none', lg: 'flex' } }}
        >
          {saveLabel}
        </Button>
            </Stack>
          </Box>

        <EntryKeypad
          activeDestination={isKeypadForDest}
          amount={amountStr}
          crossCurrency={isCrossCurrency}
          destinationAmount={toAmountStr}
          destinationCurrency={toAccount?.currency ?? baseCurrency}
          mode={mode}
          onDestinationFocus={() => setIsKeypadForDest(true)}
          onKeyPress={handleKeypadPress}
          onSave={handleSave}
          onSourceFocus={() => isCrossCurrency && setIsKeypadForDest(false)}
          saving={isSaving}
          sourceCurrency={currentCurrencySymbol}
        />
        </Box>

        <CategoryDialog
          categories={filteredCategories}
          open={categoryDialogOpen}
          search={categorySearch}
          selectedCategoryId={selectedCategoryId}
          onSearchChange={setCategorySearch}
          onSelect={(categoryId) => {
            setSelectedCategoryId(categoryId);
            setCategoryDialogOpen(false);
            setCategorySearch('');
          }}
          onClose={() => {
            setCategoryDialogOpen(false);
            setCategorySearch('');
          }}
        />

        <SaveFeedbackOverlay content={saveFeedback.content} onClose={saveFeedback.hide} open={saveFeedback.open} />

      </Stack>
    </Box>
  );
}

/**
 * Custom field slot for MobileDatePicker — renders as a compact pill matching the
 * Note button style, instead of the default editable input. Tapping it opens the
 * calendar dialog via the `setOpen` prop passed through `slotProps.field`.
 */
function DateButtonField({ dateLabel, setOpen }: { dateLabel?: string; setOpen?: (open: boolean) => void }) {
  return (
    <Button
      variant="compactField"
      onClick={() => setOpen?.(true)}
      startIcon={<CalendarTodayIcon sx={{ fontSize: 16 }} />}
      sx={{ width: 120 }}
    >
      {dateLabel}
    </Button>
  );
}
