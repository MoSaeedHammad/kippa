import { useTranslation } from 'react-i18next';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Account, Category, CurrencyCode, FinanceTransaction, LedgerLine } from '@kippa/domain';
import { DeleteIcon, EditIcon } from '@/components/AppIcon';
import { getTransactionPresentation, getTransactionSubtitleParts, joinSubtitleParts } from '@/libs/transactionPresentation';
import { TransactionIcon } from './TransactionIcon';
import { TransactionTypeChip } from './TransactionTypeChip';
import { TransactionListItem, TransactionListItemDivider } from './TransactionListItem';

interface Props { accounts: Account[]; baseCurrency: CurrencyCode; cards: import('@kippa/domain').Card[]; categories: Category[]; ledgerLines: LedgerLine[]; maskDigits: (value: string) => string; transaction: FinanceTransaction; onEdit: (transaction: FinanceTransaction) => void; onVoid: (id: string) => void; onOpen: (transaction: FinanceTransaction) => void; issuedByName?: string | null; }

/**
 * One approved transaction in the merged history list — the approval-style
 * row used across Kippa with the full data subtitle (bank · type · date ·
 * card specifier · merchant · category) and inline edit/void actions. Tapping
 * the row opens the read-only detail popup.
 */
export function TransactionHistoryRow({ accounts, baseCurrency, cards, categories, ledgerLines, maskDigits, transaction, onEdit, onVoid, onOpen, issuedByName }: Props) {
  const { t } = useTranslation('transactions');
  const category = categories.find((item) => item.id === transaction.categoryId);
  const presentation = getTransactionPresentation(transaction, ledgerLines, accounts, baseCurrency);
  const subtitleParts = getTransactionSubtitleParts(transaction, ledgerLines, accounts, cards, categories);
  const typeLabel = t(`types.${transaction.type === 'adjustment' ? 'reconciliation' : transaction.type}`);
  const subtitle = joinSubtitleParts(
    [subtitleParts.bank, subtitleParts.specifier, subtitleParts.merchant, subtitleParts.category, issuedByName ?? undefined],
    typeLabel,
  );
  const title = transaction.type === 'transfer' ? transaction.description || t('row.transferFallback') : transaction.type === 'adjustment' ? t('row.reconciliationFallback') : category?.name || t('row.generalFallback');
  const disabled = transaction.status === 'voided';

  return (
    <Box>
      <TransactionListItem
        leading={<TransactionIcon type={transaction.type} size={40} isCreditCard={presentation.isCreditCard} />}
        title={`${title}${disabled ? ` ${t('row.voidedLabel')}` : ''}`}
        titleChips={<TransactionTypeChip type={transaction.type} />}
        subtitle={subtitle}
        onClick={() => onOpen(transaction)}
        disabled={disabled}
        amount={maskDigits(`${presentation.isIncome ? '+' : '−'}${presentation.amount.toLocaleString()} ${presentation.currency}`)}
        trailing={(
          <>
            <Tooltip title={t('row.editTooltip')}>
              <span>
                <IconButton size="small" onClick={(event) => { event.stopPropagation(); onEdit(transaction); }} disabled={disabled} aria-label={t('row.editTooltip')}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('row.voidTooltip')}>
              <span>
                <IconButton size="small" color="error" onClick={(event) => { event.stopPropagation(); onVoid(transaction.id); }} disabled={disabled} aria-label={t('row.voidTooltip')}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </>
        )}
      />
      <TransactionListItemDivider />
    </Box>
  );
}
