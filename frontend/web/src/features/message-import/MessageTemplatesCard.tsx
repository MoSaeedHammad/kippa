import { useEffect, useState } from 'react';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
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
import type { MessageTemplate } from '@kippa/domain';
import { AddIcon, ContentCopyIcon, DeleteIcon, EditIcon, ExpandLessIcon, InfoOutlinedIcon, TuneIcon } from '@/components/AppIcon';
import { CardHeading } from '@/features/shared/components/CardHeading';
import { useAppContext } from '@/hooks/useAppContext';
import { messageTemplatesLib, type MessageTemplateInput, type TemplateTestMatch } from '@/libs/messageTemplates';
import { PREDEFINED_MESSAGE_TEMPLATES, type PredefinedMessageTemplate } from './predefinedTemplates';
import { BANK_LIST } from '@/features/cards/banks/banks';
import { useQueryClient } from '@tanstack/react-query';

const KINDS = ['expense', 'income', 'transfer'] as const;
const DATE_FORMATS = ['dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd'] as const;

const EXAMPLE_PATTERN = 'بطاقة بنك مصر الائتمانية\\s*\\*+\\s*(?<last4>\\d{4})[،,]?\\s*تم خصم مبلغ\\s*(?:(?<currency>EGP|USD)\\s*)?(?<amount>[\\d,]+(?:\\.\\d{1,2})?)';
const EXAMPLE_SAMPLE = 'بطاقة بنك مصر الائتمانية **2508، تم خصم مبلغ EGP 10 في WE-Mobile-Pre بتاريخ 27/08/2026';

/**
 * Create / edit dialog for one regex message template, with a live tester:
 * paste a sample message and see exactly which fields would be extracted.
 * `prefill` seeds a brand-new copy from a predefined rule (duplicate flow).
 */
function TemplateDialog({ open, template, prefill, onClose }: {
  open: boolean;
  template: MessageTemplate | null;
  prefill?: PredefinedMessageTemplate | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('messageImport');
  const { enqueueSnackbar } = useSnackbar();
  const { householdId } = useAppContext();

  const [name, setName] = useState(template?.name ?? prefill?.name ?? '');
  const [pattern, setPattern] = useState(template?.pattern ?? prefill?.pattern ?? '');
  const [kind, setKind] = useState<(typeof KINDS)[number]>(template?.kind ?? prefill?.kind ?? 'expense');
  const [amountGroup, setAmountGroup] = useState(template?.amountGroup ?? prefill?.amountGroup ?? 'amount');
  const [currencyGroup, setCurrencyGroup] = useState(template?.currencyGroup ?? prefill?.currencyGroup ?? '');
  const [currency, setCurrency] = useState(template?.currency ?? prefill?.currency ?? 'EGP');
  const [dateGroup, setDateGroup] = useState(template?.dateGroup ?? prefill?.dateGroup ?? '');
  const [dateFormat, setDateFormat] = useState<(typeof DATE_FORMATS)[number]>((template?.dateFormat ?? prefill?.dateFormat ?? 'dd/MM/yyyy') as (typeof DATE_FORMATS)[number]);
  const [merchantGroup, setMerchantGroup] = useState(template?.merchantGroup ?? prefill?.merchantGroup ?? '');
  const [last4Group, setLast4Group] = useState(template?.last4Group ?? prefill?.last4Group ?? '');
  const [cardKind, setCardKind] = useState<'debit' | 'credit'>(template?.cardKind ?? prefill?.cardKind ?? 'credit');
  const [bankId, setBankId] = useState(template?.bankId ?? prefill?.bankId ?? 'other');
  const [descriptionGroup, setDescriptionGroup] = useState(template?.descriptionGroup ?? prefill?.descriptionGroup ?? '');
  const [overrideBuiltIn, setOverrideBuiltIn] = useState<boolean>(template?.overrideBuiltIn ?? prefill?.overrideBuiltIn ?? false);
  const [sample, setSample] = useState(prefill?.sample ?? '');
  const [testResult, setTestResult] = useState<TemplateTestMatch | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const draft = (): MessageTemplateInput => ({
    name: name.trim(),
    pattern: pattern.trim(),
    kind,
    amountGroup: amountGroup.trim() || 'amount',
    currencyGroup: currencyGroup.trim() || null,
    currency: currencyGroup.trim() ? null : currency,
    dateGroup: dateGroup.trim() || null,
    dateFormat: dateGroup.trim() ? dateFormat : null,
    merchantGroup: merchantGroup.trim() || null,
    last4Group: last4Group.trim() || null,
    cardKind: last4Group.trim() ? cardKind : null,
    bankId: bankId || null,
    descriptionGroup: descriptionGroup.trim() || null,
    overrideBuiltIn,
    isActive: true,
  });

  const canSave = Boolean(name.trim() && pattern.trim());

  const runTest = async () => {
    setBusy(true);
    setTestResult(undefined);
    try {
      const result = await messageTemplatesLib.test({ householdId, sample: sample.trim(), template: draft() });
      setTestResult(result.match);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('templates.toasts.failed'), { variant: 'error' });
      setTestResult(null);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await messageTemplatesLib.upsert({
        householdId,
        action: template ? 'edit' : 'create',
        templateId: template?.id,
        template: draft(),
      });
      enqueueSnackbar(template ? t('templates.toasts.updated') : t('templates.toasts.created'), { variant: 'success' });
      onClose();
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('templates.toasts.failed'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {template ? t('templates.dialog.editTitle') : prefill ? t('templates.dialog.duplicateTitle') : t('templates.dialog.createTitle')}
        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {t('templates.dialog.subtitle')}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField fullWidth label={t('templates.fields.name')} value={name} onChange={(event) => setName(event.target.value)} />
          <TextField
            fullWidth multiline minRows={3} maxRows={8}
            label={t('templates.fields.pattern')}
            placeholder={EXAMPLE_PATTERN}
            value={pattern}
            onChange={(event) => { setPattern(event.target.value); setTestResult(undefined); }}
            slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 12 } } }}
          />
          <Stack direction="row" spacing={1}>
            {KINDS.map((option) => (
              <Button
                key={option}
                variant={kind === option ? 'segmentedSelected' : 'segmented'}
                sx={{ flex: 1 }}
                onClick={() => setKind(option)}
              >
                {t(`templates.kinds.${option}`)}
              </Button>
            ))}
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField fullWidth label={t('templates.fields.amountGroup')} value={amountGroup} onChange={(event) => setAmountGroup(event.target.value)} />
            <TextField fullWidth label={t('templates.fields.currencyGroup')} value={currencyGroup} onChange={(event) => setCurrencyGroup(event.target.value)} placeholder={t('templates.fields.none')} />
            <TextField
              select fullWidth
              label={t('templates.fields.fallbackCurrency')}
              value={currency}
              disabled={Boolean(currencyGroup.trim())}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED'].map((option) => (
                <MenuItem key={option} value={option}>{option}</MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField fullWidth label={t('templates.fields.merchantGroup')} value={merchantGroup} onChange={(event) => setMerchantGroup(event.target.value)} placeholder={t('templates.fields.none')} />
            <TextField fullWidth label={t('templates.fields.last4Group')} value={last4Group} onChange={(event) => setLast4Group(event.target.value)} placeholder={t('templates.fields.none')} />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField fullWidth label={t('templates.fields.dateGroup')} value={dateGroup} onChange={(event) => setDateGroup(event.target.value)} placeholder={t('templates.fields.none')} />
            <TextField
              select fullWidth
              label={t('templates.fields.dateFormat')}
              value={dateFormat}
              disabled={!dateGroup.trim()}
              onChange={(event) => setDateFormat(event.target.value as (typeof DATE_FORMATS)[number])}
            >
              {DATE_FORMATS.map((option) => (
                <MenuItem key={option} value={option}>{option}</MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              select fullWidth
              label={t('templates.fields.cardKind')}
              value={cardKind}
              disabled={!last4Group.trim()}
              onChange={(event) => setCardKind(event.target.value as 'debit' | 'credit')}
            >
              <MenuItem value="credit">{t('templates.cardKinds.credit')}</MenuItem>
              <MenuItem value="debit">{t('templates.cardKinds.debit')}</MenuItem>
            </TextField>
            <TextField
              select fullWidth
              label={t('templates.fields.bank')}
              value={bankId}
              onChange={(event) => setBankId(event.target.value)}
            >
              {BANK_LIST.map((bank) => (
                <MenuItem key={bank.id} value={bank.id}>{bank.name}</MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField fullWidth label={t('templates.fields.descriptionGroup')} value={descriptionGroup} onChange={(event) => setDescriptionGroup(event.target.value)} placeholder={t('templates.fields.none')} />

          <FormControlLabel
            control={<Switch checked={overrideBuiltIn} onChange={(event) => setOverrideBuiltIn(event.target.checked)} />}
            label={(
              <Box>
                <Typography variant="body2">{t('templates.override.title')}</Typography>
                <Typography variant="fieldHint" color="text.secondary">{t('templates.override.hint')}</Typography>
              </Box>
            )}
          />

          <Divider />
          <TextField
            fullWidth multiline minRows={2} maxRows={5}
            label={t('templates.fields.sample')}
            placeholder={EXAMPLE_SAMPLE}
            value={sample}
            onChange={(event) => { setSample(event.target.value); setTestResult(undefined); }}
          />
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Button variant="outlined" disabled={!sample.trim() || !pattern.trim()} loading={busy} onClick={() => void runTest()}>
              {t('templates.test')}
            </Button>
            {testResult === null && <Typography variant="fieldHint" color="error">{t('templates.noMatch')}</Typography>}
          </Stack>
          {testResult && (
            <Alert severity="success">
              <Stack spacing={0.5}>
                <Typography variant="sectionLabel">
                  {t('templates.matchTitle', {
                    kind: t(`templates.kinds.${testResult.parsed.kind}`),
                    amount: testResult.parsed.amount,
                    currency: testResult.parsed.currency,
                  })}
                </Typography>
                <Typography variant="fieldHint">
                  {[
                    testResult.parsed.date,
                    testResult.parsed.counterparty ?? undefined,
                    testResult.parsed.accountHintLast4 ? `•• ${testResult.parsed.accountHintLast4}` : undefined,
                    testResult.parsed.provider,
                  ].filter(Boolean).join(' · ')}
                </Typography>
              </Stack>
            </Alert>
          )}

          <Accordion>
            <AccordionSummary expandIcon={<ExpandLessIcon fontSize="small" />}>
              <Stack direction="row" spacing={1} alignItems="center">
                <InfoOutlinedIcon fontSize="small" />
                <Typography variant="sectionLabel">{t('templates.help.title')}</Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1.5}>
                <Typography variant="body2" color="text.secondary">{t('templates.help.intro')}</Typography>
                <Box>
                  <Typography variant="fieldHint" color="text.secondary">{t('templates.help.patternLabel')}</Typography>
                  <Typography variant="codeSnippet" sx={{ display: 'block', wordBreak: 'break-all' }}>{EXAMPLE_PATTERN}</Typography>
                </Box>
                <Box>
                  <Typography variant="fieldHint" color="text.secondary">{t('templates.help.sampleLabel')}</Typography>
                  <Typography variant="body2">{EXAMPLE_SAMPLE}</Typography>
                </Box>
                <Box>
                  <Typography variant="fieldHint" color="text.secondary">{t('templates.help.groupsLabel')}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('templates.help.groupsBody', { groups: 'amount, currency, last4' })}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">{t('templates.help.outro')}</Typography>
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('templates.dialog.cancel')}</Button>
        <Button variant="contained" disabled={!canSave} loading={busy} onClick={() => void save()}>
          {template ? t('templates.dialog.save') : t('templates.dialog.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Message templates management card, shown on the import page. */
export function MessageTemplatesCard() {
  const { t } = useTranslation('messageImport');
  const { enqueueSnackbar } = useSnackbar();
  const { householdId } = useAppContext();
  const queryClient = useQueryClient();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [prefill, setPrefill] = useState<PredefinedMessageTemplate | null>(null);
  const [showPredefined, setShowPredefined] = useState(false);

  const reload = async () => {
    try {
      setTemplates(await messageTemplatesLib.list(householdId));
    } catch {
      // Firestore can reject (offline, tests) — the card just renders empty.
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (householdId) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  const remove = async (template: MessageTemplate) => {
    try {
      await messageTemplatesLib.upsert({ householdId, action: 'remove', templateId: template.id });
      await queryClient.invalidateQueries({ queryKey: ['messageTemplates', householdId] });
      enqueueSnackbar(t('templates.toasts.removed'), { variant: 'success' });
      void reload();
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('templates.toasts.failed'), { variant: 'error' });
    }
  };

  const duplicatePredefined = (entry: PredefinedMessageTemplate) => {
    setEditing(null);
    setPrefill(entry);
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setPrefill(null);
    setDialogOpen(true);
  };

  const openEdit = (template: MessageTemplate) => {
    setEditing(template);
    setPrefill(null);
    setDialogOpen(true);
  };

  return (
    <Card sx={{ overflow: 'hidden', '&:hover': { transform: 'none' } }}>
      <CardHeading
        icon={<TuneIcon variant="Bulk" />}
        title={t('templates.title')}
        subtitle={t('templates.subtitle')}
        trailing={(
          <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={openCreate}>
            {t('templates.new')}
          </Button>
        )}
      />
      <Divider />
      {loaded && templates.length === 0 ? (
        <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
          <Typography variant="body2" color="text.secondary">{t('templates.empty')}</Typography>
        </Box>
      ) : (
        templates.map((template, index) => (
          <Box key={template.id}>
            <Box sx={{ minHeight: 64, px: { xs: 2, sm: 2.5 }, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                  <Typography noWrap variant="sectionLabel" sx={{ flex: 1 }}>{template.name}</Typography>
                  {template.overrideBuiltIn && (
                    <Chip label={t('templates.override.chip')} size="small" color="primary" variant="outlined" />
                  )}
                  <Chip label={t(`templates.kinds.${template.kind}`)} size="small" variant="outlined" />
                </Stack>
                <Typography noWrap variant="fieldHint" color="text.secondary" sx={{ mt: 0.25, fontFamily: 'monospace' }}>
                  /{template.pattern}/i
                </Typography>
              </Box>
              <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => openEdit(template)}>
                {t('templates.edit')}
              </Button>
              <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => void remove(template)}>
                {t('templates.delete')}
              </Button>
            </Box>
            {index < templates.length - 1 && <Divider sx={{ marginInlineStart: 8.5 }} />}
          </Box>
        ))
      )}

      {/* Predefined rules: the built-in bank regexes as duplicable catalog. */}
      <Divider />
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="sectionLabel">{t('templates.predefined.title')}</Typography>
            <Typography variant="fieldHint" color="text.secondary" sx={{ mt: 0.25 }}>
              {t('templates.predefined.subtitle')}
            </Typography>
          </Box>
          <Button size="small" variant="outlined" onClick={() => setShowPredefined(current => !current)}>
            {showPredefined ? t('templates.predefined.hide') : t('templates.predefined.show')}
          </Button>
        </Stack>
        {showPredefined && (
          <Stack divider={<Divider flexItem />} sx={{ mt: 1 }}>
            {PREDEFINED_MESSAGE_TEMPLATES.map((entry) => (
              <Box key={entry.name} sx={{ py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                    <Typography noWrap variant="body2" sx={{ fontWeight: 700, flex: 1 }}>{entry.name}</Typography>
                    <Chip label={t(`templates.kinds.${entry.kind}`)} size="small" variant="outlined" />
                  </Stack>
                  <Typography noWrap variant="fieldHint" color="text.secondary" sx={{ mt: 0.25, fontFamily: 'monospace' }}>
                    /{entry.pattern}/i
                  </Typography>
                </Box>
                <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => duplicatePredefined(entry)}>
                  {t('templates.predefined.duplicate')}
                </Button>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      {dialogOpen && (
        <TemplateDialog
          open={dialogOpen}
          template={editing}
          prefill={prefill}
          onClose={() => { setDialogOpen(false); setEditing(null); setPrefill(null); void reload(); }}
        />
      )}
    </Card>
  );
}
