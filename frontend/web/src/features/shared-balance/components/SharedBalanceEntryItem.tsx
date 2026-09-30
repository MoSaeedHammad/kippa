import { Button, Chip, Divider, ListItem, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { SharedBalanceEntry } from '@kippa/domain';
import type sharedBalanceEn from '@/i18n/locales/en/sharedBalance.json';
import { CheckCircleIcon, SwapHorizIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';

type Props = {
  entry: SharedBalanceEntry;
  viewerUid: string;
  busy: boolean;
  onApprove: (entry: SharedBalanceEntry) => void;
  onReject: (entry: SharedBalanceEntry) => void;
  onCancel: (entry: SharedBalanceEntry) => void;
  onEdit: (entry: SharedBalanceEntry) => void;
};

type StatusLabelKey = keyof typeof sharedBalanceEn['status'];

function statusOf(entry: SharedBalanceEntry, viewerUid: string): { labelKey: StatusLabelKey; tone: 'warning' | 'success' | 'error' | 'default' } {
  if (entry.status === 'pending') {
    return entry.createdBy === viewerUid
      ? { labelKey: 'waitingForApproval', tone: 'warning' }
      : { labelKey: 'waitsForYourApproval', tone: 'warning' };
  }
  if (entry.status === 'approved') return { labelKey: 'approved', tone: 'success' };
  if (entry.status === 'rejected') return { labelKey: 'declined', tone: 'error' };
  return { labelKey: 'cancelled', tone: 'default' };
}

/** Display name of the member who created the entry, as seen by the viewer. */
function authorName(entry: SharedBalanceEntry, viewerUid: string): string {
  if (entry.createdBy === viewerUid) return 'You';
  return entry.fromUid === entry.createdBy ? entry.fromDisplayName : entry.toDisplayName;
}

export function SharedBalanceEntryItem({ entry, viewerUid, busy, onApprove, onReject, onCancel, onEdit }: Props) {
  const { t } = useTranslation('sharedBalance');
  const isViewerCreditor = entry.fromUid === viewerUid;
  const relAmount = isViewerCreditor ? entry.amount : -entry.amount;
  const directionText = entry.kind === 'repayment'
    ? (isViewerCreditor ? t('entryDirection.repaymentCreditor', { name: entry.fromDisplayName }) : t('entryDirection.repaymentDebtor', { name: entry.toDisplayName }))
    : (isViewerCreditor ? t('entryDirection.iouCreditor', { name: entry.toDisplayName }) : t('entryDirection.iouDebtor', { name: entry.fromDisplayName }));
  const status = statusOf(entry, viewerUid);
  const author = authorName(entry, viewerUid);
  const isCounterpartyPending = entry.status === 'pending' && entry.createdBy !== viewerUid;
  const isAuthorPending = entry.status === 'pending' && entry.createdBy === viewerUid;

  return (
    <>
      <ListItem disableGutters sx={{ px: { xs: 2, sm: 2.5 }, py: 1.25, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <SwapHorizIcon
          sx={{ mt: 0.5, flexShrink: 0 }}
          color={relAmount >= 0 ? 'success' : 'error'}
        />
        <Stack sx={{ flex: 1, minWidth: 0 }} spacing={0.25}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip label={t(`kinds.${entry.kind}`)} size="small" variant="outlined" />
            <Chip label={entry.typeLabel} size="small" variant="filter" />
            <Typography variant="fieldHint" color="text.secondary">{entry.date}</Typography>
          </Stack>
          <Typography variant="sectionLabel">
            {directionText} · <Money amount={Math.abs(entry.amount)} code={entry.currency} />
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip
              label={t(`status.${status.labelKey}`)}
              size="small"
              color={status.tone === 'default' ? 'default' : status.tone}
              variant="outlined"
              icon={entry.status === 'approved' ? <CheckCircleIcon /> : undefined}
            />
            {entry.note && (
              <Typography noWrap variant="fieldHint" color="text.secondary">{entry.note}</Typography>
            )}
            {entry.createdBy !== viewerUid && (
              <Typography noWrap variant="fieldHint" color="text.secondary">{t('author.addedBy', { name: author === 'You' ? t('author.you') : author })}</Typography>
            )}
          </Stack>
        </Stack>
        <Stack alignItems="flex-end" spacing={0.5}>
          <Typography variant="sectionLabel" color={relAmount >= 0 ? 'success.main' : 'error.main'} sx={{ whiteSpace: 'nowrap' }}>
            {relAmount >= 0 ? '+' : '−'}
            <Money amount={Math.abs(relAmount)} code={entry.currency} />
          </Typography>
          <Stack direction="row" spacing={0.5}>
            {isCounterpartyPending && (
              <>
                <Button size="small" variant="contained" color="success" disabled={busy} onClick={() => onApprove(entry)}>{t('actions.approve')}</Button>
                <Button size="small" variant="outlined" color="error" disabled={busy} onClick={() => onReject(entry)}>{t('actions.decline')}</Button>
              </>
            )}
            {isAuthorPending && (
              <>
                <Button size="small" variant="text" disabled={busy} onClick={() => onEdit(entry)}>{t('actions.edit')}</Button>
                <Button size="small" variant="text" color="error" disabled={busy} onClick={() => onCancel(entry)}>{t('actions.cancel')}</Button>
              </>
            )}
            {entry.status === 'approved' && entry.createdBy === viewerUid && (
              <Button size="small" variant="text" disabled={busy} onClick={() => onEdit(entry)}>{t('actions.edit')}</Button>
            )}
          </Stack>
        </Stack>
      </ListItem>
      <Divider sx={{ ml: 8.5 }} component="li" />
    </>
  );
}
