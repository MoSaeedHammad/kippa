import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import type { Account, Card, Category, FinanceTransaction, LedgerLine } from '@kippa/domain';
import { Money } from '@/components/Money';
import { TransactionTypeChip } from './TransactionTypeChip';
import { TransactionIcon } from './TransactionIcon';
import { entryTypeOf } from '@/libs/entryType';
import { formatShortTime } from '@/libs/dateFormatting';
import {
  getTransactionSubtitleParts,
  getTransactionPresentation,
  joinSubtitleParts,
} from '@/libs/transactionPresentation';
import { getTransactionLines, getTransferLines } from '@/libs/financeCalculations';

type DetailRow = { label: string; value: React.ReactNode };

/**
 * Read-only detail popup for an approved/posted transaction — the same facts
 * the pending review dialog shows, without any way to update them (F4).
 * Editing stays available through the row's edit action.
 */
export function TransactionDetailDialog({ open, transaction, ledgerLines, accounts, cards, categories, issuedByName, onClose }: {
  open: boolean;
  transaction: FinanceTransaction | null;
  ledgerLines: LedgerLine[];
  accounts: Account[];
  cards: Card[];
  categories: Category[];
  issuedByName?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('transactions');

  const rows = useMemo<DetailRow[]>(() => {
    if (!transaction) return [];
    const lines = getTransactionLines(transaction.id, ledgerLines);
    const presentation = getTransactionPresentation(transaction, ledgerLines, accounts, accounts[0]?.currency ?? 'EGP');
    const subtitle = getTransactionSubtitleParts(transaction, ledgerLines, accounts, cards, categories);
    const transfer = getTransferLines(lines);
    const accountName = (id?: string) => accounts.find((account) => account.id === id)?.name;
    const rows: DetailRow[] = [
      { label: t('detail.type'), value: t(`types.${transaction.type === 'adjustment' ? 'reconciliation' : transaction.type}`) },
      { label: t('editDialog.date'), value: `${transaction.date} · ${formatShortTime(transaction.createdAt)}` },
    ];
    if (subtitle.bank) rows.push({ label: t('detail.bank'), value: subtitle.bank });
    if (transaction.type === 'transfer' && transfer.source && transfer.destination) {
      rows.push({
        label: t('editDialog.account'),
        value: `${accountName(transfer.source.accountId) ?? ''} → ${accountName(transfer.destination.accountId) ?? ''}`,
      });
    } else {
      rows.push({
        label: t('editDialog.account'),
        value: [presentation.details, subtitle.specifier].filter(Boolean).join(' '),
      });
    }
    if (transaction.merchant) rows.push({ label: t('table.merchant'), value: transaction.merchant });
    if (subtitle.category) rows.push({ label: t('editDialog.category'), value: subtitle.category });
    rows.push({ label: t('table.entryType'), value: t(`entryType.${entryTypeOf(transaction)}`) });
    if (transaction.loanId) {
      rows.push({
        label: t('detail.loan'),
        value: t('detail.loanInstallment', { installment: transaction.loanInstallmentNumber ?? '' }),
      });
    }
    if (transaction.originalCharge) {
      rows.push({
        label: t('detail.originalCharge'),
        value: `${transaction.originalCharge.amount} ${transaction.originalCharge.currency}`,
      });
    }
    if (issuedByName) rows.push({ label: t('table.issuedBy'), value: issuedByName });
    if (transaction.status === 'voided') rows.push({ label: t('detail.status'), value: t('row.voidedLabel') });
    return rows;
  }, [transaction, ledgerLines, accounts, cards, categories, issuedByName, t]);

  if (!transaction) return null;
  const presentation = getTransactionPresentation(transaction, ledgerLines, accounts, accounts[0]?.currency ?? 'EGP');
  const isIncome = transaction.type === 'income' || (transaction.type === 'adjustment' && presentation.isIncome);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <TransactionIcon type={transaction.type} size={36} isCreditCard={presentation.isCreditCard} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {transaction.description || t('row.generalFallback')}
          <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
            <TransactionTypeChip type={transaction.type} />
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box>
            <Typography variant="amountCurrency" color={isIncome ? 'success.main' : 'text.primary'}>
              {isIncome ? '+' : '−'}<Money amount={presentation.amount} code={presentation.currency} maxDigits={2} />
            </Typography>
          </Box>
          <Stack spacing={1}>
            {rows.map((row) => (
              <Stack key={row.label} direction="row" justifyContent="space-between" spacing={2}>
                <Typography variant="fieldHint" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{row.label}</Typography>
                <Typography variant="body2" sx={{ textAlign: 'end', minWidth: 0, overflowWrap: 'anywhere' }}>{row.value}</Typography>
              </Stack>
            ))}
          </Stack>
          <Divider />
          <Box>
            <Typography variant="sectionLabel" color="primary">{t('detail.subtitleTitle')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {joinSubtitleParts(Object.values(getTransactionSubtitleParts(transaction, ledgerLines, accounts, cards, categories)), t(`types.${transaction.type === 'adjustment' ? 'reconciliation' : transaction.type}`))}
            </Typography>
          </Box>
          {transaction.sourceMessage && (
            <>
              <Divider />
              <Box>
                <Typography variant="sectionLabel" color="primary">{t('detail.sourceMessage')}</Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                >
                  {transaction.sourceMessage}
                </Typography>
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>{t('detail.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
