import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Stack, Typography } from '@mui/material';
import type { MessageIngestionCredential } from '@kippa/domain';
import { ContentCopyIcon, KeyIcon } from '@/components/AppIcon';

type Connection = { endpoint: string; token: string };
type Props = { busy: boolean; credentials: MessageIngestionCredential[]; generated: Connection | null; onClose: () => void; onCopy: (value: string, label: string) => void; onCreate: () => void; onRevoke: (id: string) => void; onDelete: (id: string) => void; open: boolean };

export function MessageConnectionDialog({ busy, credentials, generated, onClose, onCopy, onCreate, onRevoke, onDelete, open }: Props) {
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>Secure message connections<Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Create a private connection for your bank message automation.</Typography></DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          {credentials.length > 0 && <Box><Typography variant="sectionLabel" color="primary">Existing connections</Typography><Divider sx={{ my: 1.5 }} /><Stack spacing={1}>{credentials.map((credential) => (
            <Stack key={credential.id} direction="row" alignItems="center" spacing={1.5} sx={{ p: 1.5 }}>
              <KeyIcon color={credential.enabled ? 'primary' : 'disabled'} />
              <Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="sectionLabel">{credential.label === 'iPhone Shortcut' ? 'Secure message connection' : credential.label}</Typography><Typography variant="body2" color="text.secondary">{credential.lastUsedAt ? `Used ${new Date(credential.lastUsedAt).toLocaleDateString()}` : 'Never used'}</Typography></Box>
              <Chip label={credential.enabled ? 'Active' : 'Disabled'} size="small" color={credential.enabled ? 'success' : 'default'} variant="outlined" />
              {credential.enabled
                ? <Button size="small" disabled={busy} onClick={() => onRevoke(credential.id)}>Disable</Button>
                : <Button size="small" color="error" disabled={busy} onClick={() => onDelete(credential.id)}>Delete</Button>}
            </Stack>
          ))}</Stack></Box>}
          <Box><Typography variant="sectionLabel" color="primary">Connection</Typography><Divider sx={{ my: 1.5 }} />{generated ? <Stack spacing={1.5}>{([['Endpoint', generated.endpoint], ['Bearer token', generated.token]] as const).map(([label, value]) => <Stack key={label} direction="row" alignItems="center" spacing={1} sx={{ p: 1.5 }}><Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="sectionLabel" noWrap>{value}</Typography></Box><IconButton aria-label={`Copy ${label}`} onClick={() => onCopy(value, label)}><ContentCopyIcon fontSize="small" /></IconButton></Stack>)}</Stack> : <Button variant="contained" onClick={onCreate} disabled={busy}>{busy ? 'Creating…' : 'Create secure connection'}</Button>}</Box>
          <Box><Typography variant="sectionLabel" color="primary">Example request</Typography><Divider sx={{ my: 1.5 }} /><Typography component="pre" variant="body2" sx={{ m: 0, p: 1.5, whiteSpace: 'pre-wrap' }}>{'{\n  "message": "Bank message text",\n  "source": "message-automation"\n}'}</Typography></Box>
        </Stack>
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}
