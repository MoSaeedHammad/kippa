import { useState } from 'react';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { Box, Button, Card, CardContent, Chip, Grid, Paper, Skeleton, Stack, Typography } from '@mui/material';
import type { Account, Category, Certificate } from '@kippa/domain';
import { AddIcon, SavingsIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { useAppContext } from '@/hooks/useAppContext';
import { useAccounts, useCategories } from '@/hooks/useFinance';
import { getBank } from '@/features/cards/banks/banks';
import { nextOccurrenceAfter } from '@/libs/recurringSharedEntries';
import type { CertificateInput } from '@/libs/certificates';
import { CertificateDialog } from './CertificateDialog';
import { useCertificates, useUpsertCertificateMutation } from './useCertificates';

/**
 * Certificates: bank deposit certificates whose interest is tracked as
 * recurring income. Each certificate owns a linked recurring income rule,
 * so payouts show up as confirmation drafts in the Approvals page.
 */
export function Certificates() {
  const { t } = useTranslation('certificates');
  const { enqueueSnackbar } = useSnackbar();
  const { householdId } = useAppContext();
  const { data: certificates = [], isLoading } = useCertificates(householdId);
  const { data: accounts = [] } = useAccounts(householdId);
  const { data: categories = [] } = useCategories(householdId);
  const upsertMutation = useUpsertCertificateMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Certificate | null>(null);

  const accountName = (id?: string | null) => accounts.find((account) => account.id === id)?.name;
  const categoryName = (id?: string | null) =>
    id ? categories.find((category) => category.id === id)?.name : undefined;

  const nextPayoutOf = (certificate: Certificate): string | null => {
    if (certificate.status !== 'active') return null;
    return nextOccurrenceAfter({
      frequency: certificate.payoutFrequency,
      anchorDate: certificate.startDate,
      endDate: certificate.maturityDate ?? null,
      maxOccurrences: null,
      occurrencesCreated: 0,
      lastOccurrenceDate: null,
    });
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const save = async (input: CertificateInput) => {
    try {
      const payload = editing
        ? { action: 'edit' as const, certificateId: editing.id, certificate: input }
        : { action: 'create' as const, certificate: input };
      await upsertMutation.mutateAsync(payload);
      enqueueSnackbar(editing ? t('toasts.updated') : t('toasts.created'), { variant: 'success' });
      setFormOpen(false);
      setEditing(null);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.failed'), { variant: 'error' });
    }
  };

  const redeem = async (certificate: Certificate) => {
    try {
      await upsertMutation.mutateAsync({ action: 'redeem', certificateId: certificate.id });
      enqueueSnackbar(t('toasts.redeemed'), { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.failed'), { variant: 'error' });
    }
  };

  return (
    <Stack spacing={3}>
      <PageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        action={(
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            {t('page.create')}
          </Button>
        )}
      />

      {isLoading ? (
        <Grid container spacing={2}>
          {[1, 2].map((i) => (
            <Grid key={i} size={{ xs: 12, md: 6 }}><Skeleton variant="rounded" height={200} /></Grid>
          ))}
        </Grid>
      ) : certificates.length === 0 ? (
        <EmptyLayout
          icon={<SavingsIcon />}
          title={t('empty.title')}
          description={t('empty.description')}
          action={(
            <Button variant="contained" onClick={openCreate}>{t('empty.createFirst')}</Button>
          )}
        />
      ) : (
        <Grid container spacing={2.5}>
          {certificates.map((certificate) => {
            const nextPayout = nextPayoutOf(certificate);
            return (
              <Grid key={certificate.id} size={{ xs: 12, lg: 6 }}>
                <Card>
                  <CardContent>
                    <Stack spacing={2}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Paper variant="cardHeaderIcon">
                            <SavingsIcon variant="Bulk" color="success" />
                          </Paper>
                          <Box>
                            <Typography variant="loanTitle">{certificate.name}</Typography>
                            <Typography variant="loanMeta" color="text.secondary">
                              {[
                                certificate.bankId ? getBank(certificate.bankId)?.name ?? null : null,
                                accountName(certificate.accountId),
                              ].filter(Boolean).join(' · ')}
                            </Typography>
                          </Box>
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip
                            label={t(certificate.status === 'active' ? 'status.active' : 'status.redeemed')}
                            size="small" variant="outlined"
                            color={certificate.status === 'active' ? 'success' : 'default'}
                          />
                          <Button
                            variant="segmented"
                            onClick={() => { setEditing(certificate); setFormOpen(true); }}
                          >
                            {t('card.edit')}
                          </Button>
                        </Stack>
                      </Stack>

                      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                        <Typography variant="loanMetric">
                          <Money amount={certificate.principal} code={certificate.currency} maxDigits={2} />
                        </Typography>
                        <Typography variant="fieldHint" color="text.secondary">
                          {t('card.rate', { rate: certificate.annualRatePct })}
                        </Typography>
                      </Stack>

                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" color="text.secondary">
                          {t('card.payout', { frequency: t(`frequencies.${certificate.payoutFrequency}`) })}
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 700, color: 'success.main' }}>
                          +<Money amount={certificate.payoutAmount} code={certificate.currency} maxDigits={2} />
                        </Typography>
                      </Stack>

                      <Typography variant="body2" color="text.secondary">
                        {nextPayout ? t('card.nextPayout', { date: nextPayout }) : t('card.noUpcoming')}
                      </Typography>
                      {categoryName(certificate.categoryId) && (
                        <Typography variant="body2" color="text.secondary">
                          {t('card.category', { category: categoryName(certificate.categoryId) })}
                        </Typography>
                      )}

                      {certificate.status === 'active' && (
                        <Stack direction="row" justifyContent="flex-end">
                          <Button variant="segmented" color="error" onClick={() => void redeem(certificate)}>
                            {t('card.redeem')}
                          </Button>
                        </Stack>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      <CertificateDialog
        key={`certificate-form-${editing?.id ?? 'new'}-${formOpen}`}
        open={formOpen}
        certificate={editing}
        accounts={accounts as Account[]}
        categories={categories as Category[]}
        busy={upsertMutation.isPending}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSave={save}
      />
    </Stack>
  );
}
