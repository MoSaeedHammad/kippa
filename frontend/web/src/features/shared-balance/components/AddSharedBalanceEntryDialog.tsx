import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import type { HouseholdMember, RecurringFrequency, SharedBalanceEntry, SharedBalanceEntryKind } from '@kippa/domain';
import { SHARED_BALANCE_TYPE_LABELS } from '@/libs/sharedBalance';
import type sharedBalanceEn from '@/i18n/locales/en/sharedBalance.json';

export type AddEntryRepeat = 'none' | RecurringFrequency;

export type AddSharedBalanceEntryInput = {
  kind: SharedBalanceEntryKind;
  direction: 'caller_paid' | 'counterparty_paid';
  counterpartyUid: string;
  amount: number;
  currency: string;
  typeLabel: string;
  note: string | null;
  date: string;
  repeat: AddEntryRepeat;
};

type Props = {
  open: boolean;
  busy: boolean;
  /** When set, the dialog edits this entry (amount/label/note/date only). */
  entry: SharedBalanceEntry | null;
  members: HouseholdMember[];
  viewerUid: string;
  defaultCurrency: string;
  onClose: () => void;
  onSubmit: (input: AddSharedBalanceEntryInput) => Promise<void>;
  onEditSubmit: (input: { amount: number; typeLabel: string; note: string | null; date: string }) => Promise<void>;
};

type KindLabelKey = keyof typeof sharedBalanceEn['kinds'];
type DirectionLabelKey = keyof typeof sharedBalanceEn['directions'];

const KIND_OPTIONS: { value: SharedBalanceEntryKind; labelKey: KindLabelKey }[] = [
  { value: 'iou', labelKey: 'iou' },
  { value: 'split', labelKey: 'split' },
  { value: 'repayment', labelKey: 'repayment' },
];

function directionOptions(kind: SharedBalanceEntryKind): { value: 'caller_paid' | 'counterparty_paid'; labelKey: DirectionLabelKey }[] {
  if (kind === 'repayment') {
    return [
      { value: 'caller_paid', labelKey: 'callerPaidRepayment' },
      { value: 'counterparty_paid', labelKey: 'counterpartyPaidRepayment' },
    ];
  }
  return [
    { value: 'caller_paid', labelKey: 'callerPaid' },
    { value: 'counterparty_paid', labelKey: 'counterpartyPaid' },
  ];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddSharedBalanceEntryDialog({
  open, busy, entry, members, viewerUid, defaultCurrency, onClose, onSubmit, onEditSubmit,
}: Props) {
  const { t } = useTranslation('sharedBalance');
  const editing = !!entry;
  const [kind, setKind] = useState<SharedBalanceEntryKind>('iou');
  const [direction, setDirection] = useState<'caller_paid' | 'counterparty_paid'>('caller_paid');
  const [counterpartyUid, setCounterpartyUid] = useState('');
  const [amount, setAmount] = useState('');
  const [typeLabel, setTypeLabel] = useState<string>('Cash');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayIso);
  const [repeat, setRepeat] = useState<AddEntryRepeat>('none');

  const otherMembers = members.filter((member) => member.uid !== viewerUid);
  const amountNumber = Number(amount);
  const canSubmit = editing
    ? amountNumber > 0 && typeLabel.trim().length > 0
    : amountNumber > 0 && !!counterpartyUid && typeLabel.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (editing) {
      await onEditSubmit({
        amount: amountNumber,
        typeLabel: typeLabel.trim(),
        note: note.trim() || null,
        date,
      });
      return;
    }
    await onSubmit({
      kind,
      direction,
      counterpartyUid,
      amount: amountNumber,
      currency: defaultCurrency,
      typeLabel: typeLabel.trim(),
      note: note.trim() || null,
      date,
      repeat,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{editing ? t('addEntryDialog.editTitle') : t('addEntryDialog.addTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction="row" spacing={1}>
            {KIND_OPTIONS.map((option) => (
              <Button
                key={option.value}
                fullWidth
                disabled={editing}
                variant={(editing ? entry!.kind : kind) === option.value ? 'segmentedSelected' : 'segmented'}
                onClick={() => {
                  setKind(option.value);
                  setDirection('caller_paid');
                }}
              >
                {t(`kinds.${option.labelKey}`)}
              </Button>
            ))}
          </Stack>
          {!editing && (
            <TextField
              select
              fullWidth
              label={t('addEntryDialog.whoPaid')}
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'caller_paid' | 'counterparty_paid')}
            >
              {directionOptions(kind).map((option) => (
                <MenuItem key={option.value} value={option.value}>{t(`directions.${option.labelKey}`)}</MenuItem>
              ))}
            </TextField>
          )}
          {!editing && (
            <TextField
              select
              fullWidth
              label={t('addEntryDialog.withMember')}
              value={counterpartyUid}
              onChange={(e) => setCounterpartyUid(e.target.value)}
              helperText={otherMembers.length === 0 ? t('addEntryDialog.noOtherMember') : undefined}
            >
              {otherMembers.map((member) => (
                <MenuItem key={member.uid} value={member.uid}>{member.displayName}</MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            fullWidth
            label={t('addEntryDialog.amount')}
            type="number"
            slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            helperText={defaultCurrency}
          />
          <TextField
            select
            fullWidth
            label={t('addEntryDialog.type')}
            value={typeLabel}
            onChange={(e) => setTypeLabel(e.target.value)}
          >
            {SHARED_BALANCE_TYPE_LABELS.map((label) => (
              <MenuItem key={label} value={label}>{label}</MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            label={t('addEntryDialog.date')}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          {!editing && (
            <TextField
              select
              fullWidth
              label={t('addEntryDialog.repeat')}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as AddEntryRepeat)}
              helperText={repeat === 'none'
                ? undefined
                : t('addEntryDialog.repeatHelper')}
            >
              <MenuItem value="none">{t('addEntryDialog.noRepeat')}</MenuItem>
              <MenuItem value="weekly">{t('addEntryDialog.weekly')}</MenuItem>
              <MenuItem value="monthly">{t('addEntryDialog.monthly')}</MenuItem>
              <MenuItem value="yearly">{t('addEntryDialog.yearly')}</MenuItem>
            </TextField>
          )}
          <TextField
            fullWidth
            label={t('addEntryDialog.note')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            maxRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{t('addEntryDialog.cancel')}</Button>
        <Button variant="contained" onClick={handleSubmit} loading={busy} disabled={!canSubmit}>
          {editing ? t('addEntryDialog.saveAndResend') : t('addEntryDialog.sendForApproval')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
