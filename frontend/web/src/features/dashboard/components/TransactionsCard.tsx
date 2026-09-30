import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { 
  useCategories, 
  useTransactions, 
  useLedgerLines,
  useAccounts,
  useVoidTransactionMutation,
} from '@/hooks/useFinance';
import { FinanceTransaction } from '@kippa/domain';
import { useAppContext } from '@/hooks/useAppContext';
import { TransactionsListItem } from './TransactionsListItem';
import { EditTransactionDialog } from '@/features/transactions/components/EditTransactionDialog';
import { ArrowBackIcon, ReceiptLongIcon } from '@/components/AppIcon';
import { DashboardCardHeading } from './DashboardCardHeading';

export function TransactionsCard() {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { householdId } = useAppContext();
  const { data: categories = [] } = useCategories(householdId);
  const { data: transactions, isLoading: txsLoading } = useTransactions(householdId);
  const { data: ledgerLines, isLoading: linesLoading } = useLedgerLines(householdId);
  const { data: accounts = [] } = useAccounts(householdId);
  
  const voidMutation = useVoidTransactionMutation();
  const [editingTx, setEditingTx] = useState<FinanceTransaction | null>(null);

  const handleVoidTransaction = async (txId: string) => {
    if (window.confirm(t('transactions.voidConfirm'))) {
      try {
        await voidMutation.mutateAsync({ householdId, transactionId: txId });
        enqueueSnackbar(t('transactions.voidSuccess'), { variant: 'success' });
      } catch (err: any) {
        enqueueSnackbar(err.message || t('transactions.voidError'), { variant: 'error' });
      }
    }
  };

  const isLoading = txsLoading || linesLoading;

  if (isLoading || !transactions || !ledgerLines) {
    return (
      <Box>
        <Skeleton variant="text" width="40%" height={24} animation="wave" sx={{ mb: 1.5 }} />
        <Skeleton variant="rectangular" width="100%" height={150} sx={{ borderRadius: '20px' }} animation="wave" />
      </Box>
    );
  }

  return (
    <>
      <Card>
        <CardContent>
          <Stack spacing={2.5}>
            <DashboardCardHeading icon={<ReceiptLongIcon variant="Bulk" />} title={t('transactions.title')} subtitle={t('transactions.subtitle')} trailing={<Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" label={t('transactions.recentCount', { count: Math.min(transactions.length, 8) })} sx={{ bgcolor: 'action.hover', color: 'primary.main' }} />
                <IconButton aria-label={t('transactions.viewAllAria')} onClick={() => navigate('/transactions')} size="small" sx={{ width: 36, height: 36, minWidth: 36 }}>
                  <ArrowBackIcon sx={{ fontSize: 18, transform: 'rotate(180deg)' }} />
                </IconButton>
              </Stack>} />

            {transactions.length === 0 ? (
              <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>{t('transactions.empty')}</Typography>
            ) : (
              <Stack spacing={1}>
                {transactions.slice(0, 8).map(tx => (
                  <TransactionsListItem
                    key={tx.id}
                    tx={tx}
                    categories={categories}
                    ledgerLines={ledgerLines}
                    accounts={accounts}
                    onEdit={setEditingTx}
                    onVoid={handleVoidTransaction}
                  />
                ))}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Reusable Edit Dialog */}
      <EditTransactionDialog
        open={Boolean(editingTx)}
        transaction={editingTx}
        onClose={() => setEditingTx(null)}
      />
    </>
  );
}
