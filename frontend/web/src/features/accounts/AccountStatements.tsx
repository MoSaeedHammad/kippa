import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { TransactionType } from '@kippa/domain';
import { Money } from '@/components/Money';
import { AccountBalanceIcon, SearchIcon } from '@/components/AppIcon';
import { useAppContext } from '@/hooks/useAppContext';
import { usePrivacyMask } from '@/hooks/usePrivacyMask';
import { useAccounts, useCategories, useLedgerLines, useTransactions } from '@/hooks/useFinance';
import { calculateAccountBalance } from '@/libs/financeCalculations';
import { buildAccountStatement } from '@/libs/accountStatement';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { TransactionIcon } from '@/features/transactions/components/TransactionIcon';

const DEFAULT_PAGE_SIZE = 25;

function formatStatementDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function transactionLabel(type: TransactionType) {
  if (type === 'adjustment') return 'Reconciliation';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function AccountStatements() {
  const { householdId } = useAppContext();
  const { maskText } = usePrivacyMask();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_PAGE_SIZE);

  const { data: accounts = [], isLoading: accountsLoading } = useAccounts(householdId);
  const { data: categories = [], isLoading: categoriesLoading } = useCategories(householdId);
  const { data: transactions = [], isLoading: transactionsLoading } = useTransactions(householdId);
  const { data: ledgerLines = [], isLoading: linesLoading } = useLedgerLines(householdId);

  const statementAccounts = useMemo(() => accounts.filter(account => account.type !== 'credit' && account.isActive), [accounts]);
  const requestedAccountId = searchParams.get('account');
  const selectedAccount = statementAccounts.find(account => account.id === requestedAccountId) ?? statementAccounts[0] ?? null;

  useEffect(() => {
    if (!selectedAccount || requestedAccountId === selectedAccount.id) return;
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      next.set('account', selectedAccount.id);
      return next;
    }, { replace: true });
  }, [requestedAccountId, selectedAccount, setSearchParams]);

  const resetPage = () => setPage(0);
  const entries = useMemo(() => selectedAccount ? buildAccountStatement(
    selectedAccount.id,
    transactions,
    ledgerLines,
    { search },
  ) : [], [ledgerLines, search, selectedAccount, transactions]);

  const visibleEntries = entries.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const currentBalance = selectedAccount ? calculateAccountBalance(selectedAccount.id, transactions, ledgerLines) : 0;
  const categoryName = (id?: string | null) => categories.find(category => category.id === id)?.name;
  const isLoading = accountsLoading || categoriesLoading || transactionsLoading || linesLoading;

  if (isLoading) {
    return <Stack spacing={3}><Skeleton variant="text" width="40%" height={40} /><Skeleton variant="rounded" height={150} /><Skeleton variant="rounded" height={420} /></Stack>;
  }

  return (
    <Box sx={{ py: 0.5 }}>
      <Stack spacing={3}>
        <PageHeader title="Statements" subtitle="Follow every account movement and its resulting balance." />

        {selectedAccount ? (
          <>
            <Card>
              <CardContent>
                <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" spacing={2.5}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Paper variant="cardHeaderIcon">
                      <AccountBalanceIcon variant="Bulk" />
                    </Paper>
                    <Box>
                      <Typography variant="cardTitle">{selectedAccount.name}</Typography>
                      <Typography variant="cardSubtitle" color="text.secondary">{selectedAccount.type.toUpperCase()} · {selectedAccount.currency}</Typography>
                    </Box>
                  </Stack>
                  <Stack spacing={0.25} alignItems={{ xs: 'flex-start', sm: 'flex-end' }}>
                    <Typography variant="fieldHint" color="text.secondary">Current balance</Typography>
                    <Typography variant="loanMetric"><Money amount={currentBalance} code={selectedAccount.currency} maxDigits={2} /></Typography>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Stack spacing={2.5}>
              <TextField
                fullWidth
                placeholder="Search statement descriptions..."
                value={search}
                onChange={event => { setSearch(event.target.value); resetPage(); }}
                slotProps={{ input: { startAdornment: <SearchIcon sx={{ mr: 1 }} /> } }}
              />
              <Box sx={{ width: '100%', maxWidth: { sm: 420 } }}>
                <FormControl fullWidth>
                  <InputLabel id="statement-account-label">Account</InputLabel>
                  <Select
                    labelId="statement-account-label"
                    label="Account"
                    value={selectedAccount.id}
                    onChange={event => {
                      setSearchParams({ account: event.target.value });
                      resetPage();
                    }}
                  >
                    {statementAccounts.map(account => <MenuItem key={account.id} value={account.id}>{account.name} ({account.currency})</MenuItem>)}
                  </Select>
                </FormControl>
              </Box>
            </Stack>

            <Card sx={{ overflow: 'hidden' }}>
              {entries.length === 0 ? (
                <EmptyLayout icon={<SearchIcon />} title="No statement entries" description="Try another account or search term." />
              ) : (
                <>
                  <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell>Transaction</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell align="right">Change</TableCell>
                          <TableCell align="right">Balance</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {visibleEntries.map(entry => {
                          const title = entry.transaction.description || categoryName(entry.transaction.categoryId) || transactionLabel(entry.transaction.type);
                          return (
                            <TableRow key={entry.transaction.id} hover>
                              <TableCell><Typography variant="body2">{formatStatementDate(entry.transaction.date)}</Typography></TableCell>
                              <TableCell><Typography variant="body1">{maskText(title)}</Typography>{categoryName(entry.transaction.categoryId) && <Typography variant="body2" color="text.secondary">{categoryName(entry.transaction.categoryId)}</Typography>}</TableCell>
                              <TableCell><Chip size="small" label={transactionLabel(entry.transaction.type)} /></TableCell>
                              <TableCell align="right"><Typography variant="sectionLabel" color={entry.amount >= 0 ? 'success.main' : 'text.primary'}>{entry.amount >= 0 ? '+' : '−'}<Money amount={Math.abs(entry.amount)} code={selectedAccount.currency} maxDigits={2} /></Typography></TableCell>
                              <TableCell align="right"><Typography variant="sectionLabel"><Money amount={entry.balance} code={selectedAccount.currency} maxDigits={2} /></Typography></TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  <Stack divider={<Divider flexItem />} sx={{ display: { xs: 'flex', md: 'none' } }}>
                    {visibleEntries.map(entry => {
                      const title = entry.transaction.description || categoryName(entry.transaction.categoryId) || transactionLabel(entry.transaction.type);
                      return (
                        <Stack key={entry.transaction.id} direction="row" spacing={1.5} sx={{ p: 2 }}>
                          <TransactionIcon type={entry.transaction.type} size={40} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body1" noWrap>{maskText(title)}</Typography>
                            <Typography variant="body2" color="text.secondary">{formatStatementDate(entry.transaction.date)} · Balance <Money amount={entry.balance} code={selectedAccount.currency} maxDigits={2} /></Typography>
                          </Box>
                          <Typography variant="sectionLabel" color={entry.amount >= 0 ? 'success.main' : 'text.primary'} sx={{ whiteSpace: 'nowrap' }}>{entry.amount >= 0 ? '+' : '−'}<Money amount={Math.abs(entry.amount)} code={selectedAccount.currency} maxDigits={2} /></Typography>
                        </Stack>
                      );
                    })}
                  </Stack>

                  <TablePagination
                    component="div"
                    count={entries.length}
                    page={page}
                    rowsPerPage={rowsPerPage}
                    rowsPerPageOptions={[10, 25, 50]}
                    onPageChange={(_, nextPage) => setPage(nextPage)}
                    onRowsPerPageChange={event => { setRowsPerPage(Number(event.target.value)); setPage(0); }}
                  />
                </>
              )}
            </Card>
          </>
        ) : (
          <Card><EmptyLayout icon={<SearchIcon />} title="No accounts available" description="Create an account before opening a statement." /></Card>
        )}
      </Stack>
    </Box>
  );
}
