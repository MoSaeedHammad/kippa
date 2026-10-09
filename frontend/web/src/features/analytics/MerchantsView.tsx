import { useMemo, useState } from 'react';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { MerchantAggregate } from '@/libs/merchantAnalytics';
import {
  aggregateMerchants,
  transactionsForMerchantAssignment,
} from '@/libs/merchantAnalytics';
import { BeneficiaryIcon, TuneIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { useAppContext } from '@/hooks/useAppContext';
import {
  useCategories,
  useDisplayRates,
  useHouseholdBaseCurrency,
  useLedgerLines,
  useTransactions,
} from '@/hooks/useFinance';
import { financeQueryKeys as keys } from '@/hooks/financeQueryKeys';
import { transactionsLib } from '@/libs/transactions';
import { categoryRulesLib } from '@/libs/categoryRules';
import { useQueryClient } from '@tanstack/react-query';
import type { CurrencyCode } from '@kippa/domain';
import { usePagedList } from '@/hooks/usePagedList';
import { ListPagination } from '@/features/shared/components/ListPagination';

const MAX_ASSIGN_UPDATES = 300;

/**
 * Analytics → Merchants: every merchant/beneficiary aggregated from posted
 * expenses, with one-click category assignment that re-categorizes the
 * matching transactions (and can teach future message approvals a rule).
 */
export function MerchantsView() {
  const { t } = useTranslation('budgetCycles');
  const { enqueueSnackbar } = useSnackbar();
  const { householdId, userProfile } = useAppContext();
  const baseCurrency = useHouseholdBaseCurrency();
  const queryClient = useQueryClient();
  const { data: transactions = [], isLoading } = useTransactions(householdId);
  const { data: lines = [], isLoading: linesLoading } = useLedgerLines(householdId);
  const { data: categories = [] } = useCategories(householdId);
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);
  const [assigning, setAssigning] = useState<MerchantAggregate | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);

  const currencies = useMemo(
    () => Array.from(new Set(lines.map((line) => line.currency)).add(baseCurrency)) as CurrencyCode[],
    [lines, baseCurrency],
  );
  const { data: rates = {} } = useDisplayRates(baseCurrency, currencies.filter((code) => code !== baseCurrency));

  const merchants = useMemo(
    () => aggregateMerchants(transactions, lines, baseCurrency, rates),
    [transactions, lines, baseCurrency, rates],
  );

  const visible = useMemo(
    () => (uncategorizedOnly ? merchants.filter((merchant) => merchant.uncategorizedCount > 0 || !merchant.primaryCategoryId) : merchants),
    [merchants, uncategorizedOnly],
  );
  const merchantsPage = usePagedList(visible, 10);

  const categoryName = (id: string | null) =>
    id ? categories.find((category) => category.id === id)?.name ?? null : null;

  if (isLoading || linesLoading) {
    return (
      <Stack spacing={3}>
        <PageHeader title={t('merchants.title')} subtitle={t('merchants.subtitle')} />
        <Typography variant="body2" color="text.secondary">{t('merchants.loading')}</Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title={t('merchants.title')}
        subtitle={t('merchants.subtitle')}
        action={(
          <Button
            variant={uncategorizedOnly ? 'segmentedSelected' : 'segmented'}
            startIcon={<TuneIcon />}
            onClick={() => setUncategorizedOnly((value) => !value)}
          >
            {t('merchants.uncategorizedOnly')}
          </Button>
        )}
      />

      {visible.length === 0 ? (
        <EmptyLayout
          icon={<BeneficiaryIcon />}
          title={t('merchants.emptyTitle')}
          description={t('merchants.emptyDescription')}
        />
      ) : (
        <Card sx={{ overflow: 'hidden', '&:hover': { transform: 'none' } }}>
          <Divider />
          {merchantsPage.pageItems.map((merchant, index) => {
            const primary = categoryName(merchant.primaryCategoryId);
            const needsAttention = merchant.uncategorizedCount > 0 || !primary;
            return (
              <Box key={merchant.key || '__none__'}>
                <Box sx={{ minHeight: 72, px: { xs: 2, sm: 2.5 }, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <BeneficiaryIcon color={needsAttention ? 'warning' : 'primary'} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography noWrap variant="sectionLabel" sx={{ flex: 1 }}>
                        {merchant.name || t('merchants.noMerchant')}
                      </Typography>
                      <Typography variant="sectionLabel" sx={{ whiteSpace: 'nowrap' }}>
                        <Money amount={Math.round(merchant.totalExpense * 100) / 100} code={baseCurrency} />
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25, flexWrap: 'wrap', rowGap: 0.5 }}>
                      <Chip label={t('merchants.count', { count: merchant.transactionCount })} size="small" variant="outlined" />
                      {primary ? (
                        <Chip label={primary} size="small" variant="outlined" color="success" />
                      ) : (
                        <Chip label={t('merchants.uncategorized')} size="small" variant="outlined" color="warning" />
                      )}
                      <Typography noWrap variant="fieldHint" color="text.secondary">
                        {t('merchants.lastUsed', { date: merchant.lastUsed })}
                      </Typography>
                    </Stack>
                  </Box>
                  <Button
                    size="small"
                    variant="contained"
                    color={needsAttention ? 'success' : 'inherit'}
                    onClick={() => setAssigning(merchant)}
                  >
                    {t('merchants.assign')}
                  </Button>
                </Box>
                {index < merchantsPage.pageItems.length - 1 && <Divider sx={{ marginInlineStart: 8.5 }} />}
              </Box>
            );
          })}
          <ListPagination
            page={merchantsPage.page}
            pageCount={merchantsPage.pageCount}
            total={merchantsPage.total}
            pageSize={10}
            onChange={merchantsPage.setPage}
          />
        </Card>
      )}

      <AssignCategoryDialog
        merchant={assigning}
        categories={categories.filter((category) => category.type === 'expense' && category.isActive)}
        categoryName={categoryName}
        busy={assignBusy}
        onClose={() => setAssigning(null)}
        onAssign={async (categoryId, createRule) => {
          if (!assigning) return;
          setAssignBusy(true);
          try {
            const targets = transactionsForMerchantAssignment(transactions, assigning.key, categoryId)
              .slice(0, MAX_ASSIGN_UPDATES);
            for (const transaction of targets) {
              await transactionsLib.updateTransactionCategory(
                householdId,
                transaction.id,
                categoryId,
                userProfile ? { uid: userProfile.uid, displayName: userProfile.displayName ?? 'User' } : undefined,
              );
            }
            if (createRule && assigning.name) {
              await categoryRulesLib.add({ householdId, categoryId, pattern: assigning.name });
              await queryClient.invalidateQueries({ queryKey: ['categoryRules', householdId] });
            }
            await queryClient.invalidateQueries({ queryKey: keys.transactions(householdId) });
            enqueueSnackbar(t('merchants.toasts.assigned', { count: targets.length }), { variant: 'success' });
          } catch (error) {
            enqueueSnackbar(error instanceof Error ? error.message : t('merchants.toasts.failed'), { variant: 'error' });
          } finally {
            setAssignBusy(false);
            setAssigning(null);
          }
        }}
      />
    </Stack>
  );
}

/** Category picker for one merchant; optionally teaches approvals a merchant rule. */
function AssignCategoryDialog({ merchant, categories, categoryName, busy, onClose, onAssign }: {
  merchant: MerchantAggregate | null;
  categories: { id: string; name: string }[];
  categoryName: (id: string | null) => string | null;
  busy: boolean;
  onClose: () => void;
  onAssign: (categoryId: string, createRule: boolean) => Promise<void>;
}) {
  const { t } = useTranslation('budgetCycles');
  const [categoryId, setCategoryId] = useState('');
  const [createRule, setCreateRule] = useState(true);
  const primary = categoryName(merchant?.primaryCategoryId ?? null);

  return (
    <Dialog open={Boolean(merchant)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {t('merchants.assignTitle', { merchant: merchant?.name || t('merchants.noMerchant') })}
        {primary && (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {t('merchants.currentCategory', { category: primary })}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select fullWidth
            label={t('merchants.categoryLabel')}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            {categories.map((category) => (
              <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={<Switch checked={createRule} onChange={(event) => setCreateRule(event.target.checked)} />}
            label={t('merchants.createRule')}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('merchants.cancel')}</Button>
        <Button
          variant="contained"
          disabled={!categoryId || busy}
          onClick={() => void onAssign(categoryId, createRule)}
        >
          {t('merchants.apply')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
