import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { MessageIngestionCredential } from '@kippa/domain';
import { ContentCopyIcon, DeleteIcon, KeyIcon } from '@/components/AppIcon';

type Connection = { endpoint: string; token: string };
type Props = { busy: boolean; credentials: MessageIngestionCredential[]; generated: Connection | null; onClose: () => void; onCopy: (value: string, label: string) => void; onCreate: () => void; onRevoke: (id: string) => void; open: boolean };

export function MessageConnectionDialog({ busy, credentials, generated, onClose, onCopy, onCreate, onRevoke, open }: Props) {
  const { t } = useTranslation('pendingTransactions');
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>{t('connectionsDialog.title')}<Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{t('connectionsDialog.subtitle')}</Typography></DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          {credentials.length > 0 && <Box><Typography variant="sectionLabel" color="primary">{t('connectionsDialog.existing')}</Typography><Divider sx={{ my: 1.5 }} /><Stack spacing={1}>{credentials.map((credential) => (
            <Stack key={credential.id} direction="row" alignItems="center" spacing={1.5} sx={{ p: 1.5 }}>
              <KeyIcon color={credential.enabled ? 'primary' : 'disabled'} />
              <Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="sectionLabel">{credential.label}</Typography><Typography variant="body2" color="text.secondary">{credential.lastUsedAt ? t('connectionsDialog.used', { date: new Date(credential.lastUsedAt).toLocaleDateString() }) : t('connectionsDialog.neverUsed')}</Typography></Box>
              <Chip label={credential.enabled ? t('connectionsDialog.active') : t('connectionsDialog.disabled')} size="small" color={credential.enabled ? 'success' : 'default'} variant="outlined" />
              {credential.enabled && <IconButton aria-label={t('connectionsDialog.revokeAria', { label: credential.label })} onClick={() => onRevoke(credential.id)}><DeleteIcon fontSize="small" /></IconButton>}
            </Stack>
          ))}</Stack></Box>}
          <Box><Typography variant="sectionLabel" color="primary">{t('connectionsDialog.connection')}</Typography><Divider sx={{ my: 1.5 }} />{generated ? <Stack spacing={1.5}>{([[t('connectionsDialog.endpoint'), generated.endpoint], [t('connectionsDialog.bearerToken'), generated.token]] as const).map(([label, value]) => <Stack key={label} direction="row" alignItems="center" spacing={1} sx={{ p: 1.5 }}><Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="sectionLabel" noWrap>{value}</Typography></Box><IconButton aria-label={t('connectionsDialog.copyAria', { label })} onClick={() => onCopy(value, label)}><ContentCopyIcon fontSize="small" /></IconButton></Stack>)}</Stack> : <Button variant="contained" onClick={onCreate} disabled={busy}>{busy ? t('connectionsDialog.creating') : t('connectionsDialog.create')}</Button>}</Box>
          <Box><Typography variant="sectionLabel" color="primary">{t('connectionsDialog.forwarderRequest')}</Typography><Divider sx={{ my: 1.5 }} /><Typography component="pre" variant="body2" sx={{ m: 0, p: 1.5, whiteSpace: 'pre-wrap' }}>{'{\n  "text": "<SMS text>",\n  "sender": "BankMisr"\n}'}</Typography></Box>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{t('connectionsDialog.close')}</Button></DialogActions>
    </Dialog>
  );
}
