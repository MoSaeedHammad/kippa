import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { ImportMessageHistoryResult } from '@kippa/domain';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { CardHeading } from '@/features/shared/components/CardHeading';
import { ParsedTemplatesHelp } from './ParsedTemplatesHelp';
import { CheckCircleIcon, DocumentUploadIcon } from '@/components/AppIcon';
import { useAppContext } from '@/hooks/useAppContext';
import { useImportMessageHistoryMutation } from '@/hooks/useFinance';
import {
  chunkMessages,
  extractDuration,
  extractMessages,
  filterByDuration,
  MAX_IMPORT_FILE_BYTES,
  MESSAGES_PER_IMPORT_CALL,
  type ExtractedMessage,
  type MessageHistoryFormat,
} from '@/libs/messageHistoryImport';

type ImportStep = 'choose' | 'preview' | 'result';

/**
 * Imports a phone's message history (Android SMS-backup XML or pasted text),
 * shows the duration the export covers, and stages every recognized bank
 * message as pending items on the Approvals page.
 */
export function MessageImport() {
  const { t } = useTranslation('messageImport');
  const { householdId } = useAppContext();
  const navigate = useNavigate();
  const importMutation = useImportMessageHistoryMutation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [step, setStep] = useState<ImportStep>('choose');
  const [format, setFormat] = useState<MessageHistoryFormat>('text');
  const [messages, setMessages] = useState<ExtractedMessage[]>([]);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportMessageHistoryResult | null>(null);

  const duration = useMemo(() => extractDuration(messages), [messages]);
  const stagedMessages = useMemo(
    () => filterByDuration(messages, rangeFrom || null, rangeTo || null),
    [messages, rangeFrom, rangeTo],
  );

  const scan = (text: string, name: string) => {
    const { format: detected, messages: found } = extractMessages(text, name);
    if (found.length === 0) {
      setError(t('choose.errors.noMessages'));
      return;
    }
    const bounds = extractDuration(found);
    setError(null);
    setFormat(detected);
    setMessages(found);
    setRangeFrom(bounds.from ?? '');
    setRangeTo(bounds.to ?? '');
    setResult(null);
    setStep('preview');
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setError(t('choose.errors.tooLarge'));
      return;
    }
    setFileName(file.name);
    try {
      scan(await file.text(), file.name);
    } catch {
      setError(t('choose.errors.readFailed'));
    }
  };

  const runImport = async () => {
    if (!householdId || stagedMessages.length === 0 || progress) return;
    setError(null);
    let batchId: string | undefined;
    const totals = { staged: 0, duplicates: 0, ignored: 0, unsupported: 0, merged: 0 };
    const chunks = chunkMessages(stagedMessages, MESSAGES_PER_IMPORT_CALL);
    setProgress({ done: 0, total: stagedMessages.length });
    try {
      for (const [index, chunk] of chunks.entries()) {
        const chunkResult = await importMutation.mutateAsync({
          householdId,
          batchId,
          // The forwarder payload contract: text + sender drive the same
          // bank auto-detection as live ingestion.
          messages: chunk.map((message) => ({
            text: message.body,
            ...(message.sender ? { sender: message.sender } : {}),
            ...(message.dateMs ? { dateMs: message.dateMs } : {}),
          })),
          ...(rangeFrom ? { from: rangeFrom } : {}),
          ...(rangeTo ? { to: rangeTo } : {}),
          source: format === 'android-xml' ? 'import-xml' : 'import-text',
        });
        batchId = chunkResult.batchId;
        totals.staged += chunkResult.staged;
        totals.duplicates += chunkResult.duplicates;
        totals.ignored += chunkResult.ignored;
        totals.unsupported += chunkResult.unsupported;
        totals.merged += chunkResult.merged;
        setProgress({
          done: Math.min((index + 1) * MESSAGES_PER_IMPORT_CALL, stagedMessages.length),
          total: stagedMessages.length,
        });
      }
      setResult({ batchId: batchId ?? '', received: stagedMessages.length, ...totals });
      setStep('result');
    } catch {
      setError(t('preview.errors.failed'));
    } finally {
      setProgress(null);
    }
  };

  const reset = () => {
    setStep('choose');
    setMessages([]);
    setFileName(null);
    setPasted('');
    setRangeFrom('');
    setRangeTo('');
    setError(null);
    setResult(null);
  };

  return (
    <Stack spacing={3}>
      <PageHeader title={t('page.title')} subtitle={t('page.subtitle')} />

      {step === 'choose' && (
        <Card>
          <Stack sx={{ p: { xs: 2, sm: 2.5 } }} spacing={2.5}>
            <CardHeading
              icon={<DocumentUploadIcon variant="Bulk" />}
              title={t('choose.cardTitle')}
              subtitle={t('choose.cardSubtitle')}
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
              <Button variant="outlined" startIcon={<DocumentUploadIcon />} onClick={() => fileInputRef.current?.click()}>
                {t('choose.fileButton')}
              </Button>
              {fileName && (
                <Typography variant="fieldHint" noWrap>
                  {t('choose.fileSelected', { name: fileName })}
                </Typography>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml,.txt,text/xml,application/xml,text/plain"
                hidden
                onChange={(event) => {
                  void onPickFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </Stack>
            <Typography variant="fieldHint">{t('choose.fileHint')}</Typography>
            <Divider>
              <Typography variant="fieldHint">{t('choose.pasteLabel')}</Typography>
            </Divider>
            <TextField
              multiline
              minRows={6}
              maxRows={14}
              fullWidth
              label={t('choose.pasteLabel')}
              placeholder={t('choose.pastePlaceholder')}
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
            />
            <Button
              variant="primaryAction"
              onClick={() => (pasted.trim() ? scan(pasted, '') : setError(t('choose.errors.empty')))}
            >
              {t('choose.scan')}
            </Button>
            <ParsedTemplatesHelp />
          </Stack>
        </Card>
      )}

      {step === 'preview' && (
        <Card>
          <Stack sx={{ p: { xs: 2, sm: 2.5 } }} spacing={2.5}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography variant="cardTitle" sx={{ flex: 1 }}>
                {t('preview.title', { count: messages.length })}
              </Typography>
              <Chip size="small" label={format === 'android-xml' ? t('preview.formatXml') : t('preview.formatText')} />
            </Stack>
            {error && <Alert severity="error">{error}</Alert>}
            <Box>
              <Typography variant="fieldHint">{t('preview.durationTitle')}</Typography>
              <Typography variant="sectionLabel" sx={{ mt: 0.5 }}>
                {duration.from && duration.to
                  ? t('preview.durationValue', { from: duration.from, to: duration.to })
                  : t('preview.durationUnknown')}
              </Typography>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                type="date"
                size="small"
                fullWidth
                label={t('preview.from')}
                value={rangeFrom}
                onChange={(event) => setRangeFrom(event.target.value)}
              />
              <TextField
                type="date"
                size="small"
                fullWidth
                label={t('preview.to')}
                value={rangeTo}
                onChange={(event) => setRangeTo(event.target.value)}
              />
            </Stack>
            <Typography variant="fieldHint">
              {rangeFrom || rangeTo
                ? t('preview.rangeHint', { count: stagedMessages.length })
                : t('preview.rangeHintAll', { count: messages.length })}
            </Typography>
            {progress && (
              <Stack spacing={1}>
                <LinearProgress />
                <Typography variant="fieldHint">{t('preview.importing', { done: progress.done, total: progress.total })}</Typography>
              </Stack>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                variant="primaryAction"
                sx={{ flex: 1 }}
                disabled={stagedMessages.length === 0 || !!progress}
                onClick={() => void runImport()}
              >
                {t('preview.importAction', { count: stagedMessages.length })}
              </Button>
              <Button variant="outlined" onClick={reset} disabled={!!progress}>
                {t('preview.changeSource')}
              </Button>
            </Stack>
          </Stack>
        </Card>
      )}

      {step === 'result' && result && (
        <Card>
          <Stack sx={{ p: { xs: 2, sm: 2.5 } }} spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CheckCircleIcon color="success" />
              <Typography variant="cardTitle">{t('result.title')}</Typography>
            </Stack>
            <Stack spacing={0.5}>
              <Typography variant="sectionLabel">{t('result.staged', { count: result.staged })}</Typography>
              {result.duplicates > 0 && (
                <Typography variant="fieldHint">{t('result.duplicates', { count: result.duplicates })}</Typography>
              )}
              {result.merged > 0 && (
                <Typography variant="fieldHint">{t('result.merged', { count: result.merged })}</Typography>
              )}
              {result.ignored > 0 && (
                <Typography variant="fieldHint">{t('result.ignored', { count: result.ignored })}</Typography>
              )}
              {result.unsupported > 0 && (
                <Typography variant="fieldHint">{t('result.unsupported', { count: result.unsupported })}</Typography>
              )}
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button variant="primaryAction" sx={{ flex: 1 }} onClick={() => navigate('/pending')}>
                {t('result.review')}
              </Button>
              <Button variant="outlined" onClick={reset}>
                {t('result.again')}
              </Button>
            </Stack>
            {result.unsupported > 0 && <ParsedTemplatesHelp />}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
