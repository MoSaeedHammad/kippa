import React, { useMemo } from 'react';
import {
  Autocomplete,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  RadioGroup,
  FormControlLabel,
  Radio,
  Typography,
  Box,
  Stack,
  Divider,
  alpha,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import {
  useAccounts,
  useCategories,
  useLedgerLines,
  useTransactions,
  useUpdateTransactionMutation,
  useHouseholdBaseCurrency,
} from '@/hooks/useFinance';
import { useAppContext } from '@/hooks/useAppContext';
import { FinanceTransaction } from '@kippa/domain';
import { TransactionTypeChip } from './TransactionTypeChip';
import { useTransactionEditFields } from '../hooks/useTransactionEditFields';
import { recordedMerchantNames } from '@/libs/merchantAnalytics';
import { findPrimaryLedgerLine, resolveEditedCurrency, resolveEditedSignedAmount } from '@/libs/transactionEdit';

interface EditTransactionDialogProps {
  open: boolean;
  transaction: FinanceTransaction | null;
  onClose: () => void;
}

export const EditTransactionDialog: React.FC<EditTransactionDialogProps> = ({
  open,
  transaction,
  onClose,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation('transactions');
  const { householdId } = useAppContext();
  const baseCurrency = useHouseholdBaseCurrency();
  const { data: accounts = [] } = useAccounts(householdId);
  const { data: categories = [] } = useCategories(householdId);
  const { data: ledgerLines = [] } = useLedgerLines(householdId);
  const { data: transactions = [] } = useTransactions(householdId);
  const updateMutation = useUpdateTransactionMutation();

  const { fields, setField } = useTransactionEditFields(transaction, ledgerLines);
  const merchantOptions = useMemo(() => recordedMerchantNames(transactions), [transactions]);

  if (!transaction) return null;

  const isRegularTx = transaction.type === 'expense' || transaction.type === 'income';

  const handleSave = async () => {
    const amount = parseFloat(fields.amount);
    if (isNaN(amount) || amount <= 0) {
      enqueueSnackbar(t('editDialog.validAmount'), { variant: 'warning' });
      return;
    }

    const firstLine = findPrimaryLedgerLine(transaction.id, ledgerLines);
    const currency = resolveEditedCurrency(firstLine, baseCurrency);
    const signedAmount = resolveEditedSignedAmount(amount, fields.type, firstLine, isRegularTx);

    try {
      await updateMutation.mutateAsync({
        householdId,
        transactionId: transaction.id,
        transactionUpdates: {
          description: fields.description,
          date: fields.date,
          categoryId: isRegularTx ? (fields.categoryId || null) : null,
          type: isRegularTx ? fields.type : transaction.type,
          merchant: fields.merchant.trim() || null,
        },
        lineUpdates: {
          accountId: fields.accountId,
          signedAmount: signedAmount,
          currency,
        },
      });
      enqueueSnackbar(t('editDialog.updatedToast'), { variant: 'success' });
      onClose();
    } catch (err: any) {
      enqueueSnackbar(err.message || t('editDialog.updateFailed'), { variant: 'error' });
    }
  };

  const getAccountName = (id: string) => {
    return accounts.find((a) => a.id === id)?.name || id;
  };

  const specialTypeLabel =
    transaction.type === 'adjustment'
      ? t('types.reconciliation')
      : transaction.type === 'transfer'
        ? t('types.transfer')
        : transaction.type;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle component="div" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
          {t('editDialog.title')}
        </Typography>
        <TransactionTypeChip type={transaction.type} />
      </DialogTitle>

      <DialogContent sx={{ pt: 1.5 }}>
        <Grid container spacing={3} sx={{ mt: 0.5 }}>
          {/* Read-only Warning and Info for Special Transactions */}
          {!isRegularTx && (
            <Grid size={{ xs: 12 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: '12px',
                  bgcolor: (theme) => alpha(theme.palette.info.main, 0.05),
                  border: (theme) => `1px solid ${alpha(theme.palette.info.main, 0.1)}`,
                }}
              >
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 1.5 }}>
                  {t('editDialog.readonlyWarning', { type: specialTypeLabel })}
                </Typography>
                <Stack spacing={1}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {t('editDialog.amountColon')} <span style={{ fontWeight: 'normal' }}>{fields.amount} {findPrimaryLedgerLine(transaction.id, ledgerLines)?.currency || baseCurrency}</span>
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {t('editDialog.accountColon')} <span style={{ fontWeight: 'normal' }}>{getAccountName(fields.accountId)}</span>
                  </Typography>
                </Stack>
              </Box>
            </Grid>
          )}

          {/* Section 1: Financial Details */}
          <Grid size={{ xs: 12 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {t('editDialog.financialDetails')}
            </Typography>
            <Divider sx={{ mt: 1, mb: 1 }} />
          </Grid>

          {isRegularTx && (
            <Grid size={{ xs: 12 }}>
              <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary', fontWeight: 'medium' }}>
                {t('editDialog.transactionType')}
              </Typography>
              <RadioGroup
                row
                value={fields.type}
                onChange={(e) => setField('type', e.target.value)}
                sx={{ gap: 2 }}
              >
                <FormControlLabel value="expense" control={<Radio />} label={t('types.expense')} />
                <FormControlLabel value="income" control={<Radio />} label={t('types.income')} />
              </RadioGroup>
            </Grid>
          )}

          {isRegularTx ? (
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                type="number"
                fullWidth
                label={t('editDialog.amount')}
                value={fields.amount}
                onChange={(e) => setField('amount', e.target.value)}
              />
            </Grid>
          ) : null}

          {isRegularTx && (
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel id="edit-tx-acc-label">{t('editDialog.account')}</InputLabel>
                <Select
                  labelId="edit-tx-acc-label"
                  value={fields.accountId}
                  label={t('editDialog.account')}
                  onChange={(e) => setField('accountId', e.target.value)}
                >
                  {accounts.map((a) => (
                    <MenuItem key={a.id} value={a.id}>
                      {a.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

          {/* Section 2: Metadata & Notes */}
          <Grid size={{ xs: 12 }} sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {t('editDialog.classification')}
            </Typography>
            <Divider sx={{ mt: 1, mb: 1 }} />
          </Grid>

          {/* Date Picker */}
          <Grid size={{ xs: 12, sm: isRegularTx ? 6 : 12 }}>
            <TextField
              type="date"
              fullWidth
              label={t('editDialog.date')}
              slotProps={{ inputLabel: { shrink: true } }}
              value={fields.date}
              onChange={(e) => setField('date', e.target.value)}
            />
          </Grid>

          {/* Category Selector (Regular only) */}
          {isRegularTx && (
            <Grid size={{ xs: 12, sm: 6 }}>
              {fields.type === 'expense' ? (
                <FormControl fullWidth>
                  <InputLabel id="edit-tx-cat-label">{t('editDialog.category')}</InputLabel>
                  <Select
                    labelId="edit-tx-cat-label"
                    value={fields.categoryId}
                    label={t('editDialog.category')}
                    onChange={(e) => setField('categoryId', e.target.value)}
                  >
                    {categories
                      .filter((c) => c.type === 'expense')
                      .map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              ) : (
                <FormControl fullWidth>
                  <InputLabel id="edit-tx-cat-income-label">{t('editDialog.incomeCategory')}</InputLabel>
                  <Select
                    labelId="edit-tx-cat-income-label"
                    value={fields.categoryId}
                    label={t('editDialog.incomeCategory')}
                    onChange={(e) => setField('categoryId', e.target.value)}
                  >
                    {categories
                      .filter((c) => c.type === 'income')
                      .map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              )}
            </Grid>
          )}

          {/* Merchant (suggestions from previously recorded merchants) */}
          {isRegularTx && (
            <Grid size={{ xs: 12, sm: 6 }}>
              <Autocomplete
                freeSolo
                fullWidth
                options={merchantOptions}
                value={fields.merchant}
                onInputChange={(_, value) => setField('merchant', value ?? '')}
                renderInput={(params) => (
                  <TextField {...params} fullWidth label={t('editDialog.merchant')} placeholder={t('editDialog.merchantPlaceholder')} />
                )}
              />
            </Grid>
          )}

          {/* Description */}
          <Grid size={{ xs: 12 }}>
            <TextField
              fullWidth
              multiline
              rows={2}
              label={t('editDialog.description')}
              placeholder={t('editDialog.descriptionPlaceholder')}
              value={fields.description}
              onChange={(e) => setField('description', e.target.value)}
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} color="inherit">
          {t('editDialog.cancel')}
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          loading={updateMutation.isPending}
        >
          {t('editDialog.saveChanges')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
