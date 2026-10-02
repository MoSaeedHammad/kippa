import { IconButton, Stack, TableCell, TableRow, Tooltip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Account, Category, CurrencyCode, FinanceTransaction, LedgerLine } from '@kippa/domain';
import { DeleteIcon, EditIcon } from '@/components/AppIcon';
import { getTransactionPresentation } from '@/libs/transactionPresentation';
import { TransactionIcon } from './TransactionIcon';
import { TransactionTypeChip } from './TransactionTypeChip';
import { formatShortTime } from '@/libs/dateFormatting';

interface Props { accounts: Account[]; baseCurrency: CurrencyCode; categories: Category[]; ledgerLines: LedgerLine[]; maskDigits: (value: string) => string; transaction: FinanceTransaction; onEdit: (transaction: FinanceTransaction) => void; onVoid: (id: string) => void; issuedByName?: string | null; }

export function TransactionHistoryRow({ accounts, baseCurrency, categories, ledgerLines, maskDigits, transaction, onEdit, onVoid, issuedByName }: Props) {
  const { t } = useTranslation('transactions');
  const category = categories.find((item) => item.id === transaction.categoryId);
  const presentation = getTransactionPresentation(transaction, ledgerLines, accounts, baseCurrency);
  const title = transaction.type === 'transfer' ? transaction.description || t('row.transferFallback') : transaction.type === 'adjustment' ? t('row.reconciliationFallback') : category?.name || t('row.generalFallback');
  const disabled = transaction.status === 'voided';

  return (
    <TableRow hover sx={{ opacity: disabled ? 0.5 : 1, '& .transaction-actions': { opacity: { xs: 1, md: 0 } }, '&:hover .transaction-actions, &:focus-within .transaction-actions': { opacity: 1 } }}>
      <TableCell align="center" sx={{ py: 1.25 }}><TransactionIcon type={transaction.type} size={36} isCreditCard={presentation.isCreditCard} /></TableCell>
      <TableCell sx={{ py: 1.25, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}><Typography noWrap variant="body1" sx={{ minWidth: 0 }}>{title}</Typography><TransactionTypeChip type={transaction.type} /></Stack>
        <Typography noWrap variant="body2" color="text.secondary">{transaction.date} • {formatShortTime(transaction.createdAt)}{disabled ? ` • ${t('row.voidedLabel')}` : ''}</Typography>
      </TableCell>
      <TableCell sx={{ py: 1.25, display: { xs: 'none', md: 'table-cell' } }}><Typography noWrap variant="body2" color="text.secondary">{presentation.details}</Typography></TableCell>
      {issuedByName !== undefined && (
        <TableCell sx={{ py: 1.25, display: { xs: 'none', md: 'table-cell' } }}><Typography noWrap variant="body2" color="text.secondary">{issuedByName}</Typography></TableCell>
      )}
      <TableCell align="right" sx={{ py: 1.25 }}><Typography variant="body1" color={disabled ? 'text.secondary' : presentation.isIncome ? 'success.main' : 'text.primary'}>{presentation.isCrossCurrencyTransfer ? t('row.transferCompleted') : `${presentation.isIncome ? '+' : '-'}${maskDigits(`${presentation.amount.toLocaleString()} ${presentation.currency}`)}`}</Typography></TableCell>
      <TableCell align="center" sx={{ py: 1.25 }}>
        <Stack className="transaction-actions" direction="row" justifyContent="center">
          <Tooltip title={t('row.editTooltip')}><span><IconButton onClick={() => onEdit(transaction)} disabled={disabled} aria-label={t('row.editTooltip')}><EditIcon fontSize="small" /></IconButton></span></Tooltip>
          <Tooltip title={t('row.voidTooltip')}><span><IconButton color="error" onClick={() => onVoid(transaction.id)} disabled={disabled} aria-label={t('row.voidTooltip')}><DeleteIcon fontSize="small" /></IconButton></span></Tooltip>
        </Stack>
      </TableCell>
    </TableRow>
  );
}
