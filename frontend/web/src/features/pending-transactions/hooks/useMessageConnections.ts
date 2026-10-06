import { useEffect, useState } from 'react';
import { useSnackbar } from 'notistack';
import type { MessageIngestionCredential } from '@kippa/domain';
import { messageIngestionLib } from '@/libs/messageIngestion';

export function useMessageConnections(householdId: string) {
  const { enqueueSnackbar } = useSnackbar();
  const [credentials, setCredentials] = useState<MessageIngestionCredential[]>([]);
  const [generated, setGenerated] = useState<{ credentialId: string; token: string; endpoint: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = async () => setCredentials(await messageIngestionLib.listCredentials(householdId));
  useEffect(() => { messageIngestionLib.listCredentials(householdId).then(setCredentials).catch(() => setCredentials([])); }, [householdId]);
  const create = async () => { if (busy) return; setBusy(true); try { const result = await messageIngestionLib.createCredential(householdId); setGenerated({ credentialId: result.credentialId, token: result.token, endpoint: result.endpoint }); await refresh(); } catch (error) { enqueueSnackbar(error instanceof Error ? error.message : 'Could not create the connection', { variant: 'error' }); } finally { setBusy(false); } };
  const changeConnection = async (id: string, action: 'disable' | 'delete') => {
    if (busy) return;
    setBusy(true);
    try {
      if (action === 'disable') await messageIngestionLib.revokeCredential(id);
      else await messageIngestionLib.deleteCredential(id);
      setGenerated(current => current?.credentialId === id ? null : current);
      setCredentials(current => action === 'delete' ? current.filter(credential => credential.id !== id)
        : current.map(credential => credential.id === id ? { ...credential, enabled: false } : credential));
      await refresh();
      enqueueSnackbar(action === 'delete' ? 'Connection deleted' : 'Connection disabled', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : `Could not ${action} the connection`, { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const revoke = (id: string) => changeConnection(id, 'disable');
  const remove = (id: string) => changeConnection(id, 'delete');
  const copy = async (value: string, label: string) => { await navigator.clipboard.writeText(value); enqueueSnackbar(`${label} copied`, { variant: 'success' }); };
  return { busy, copy, create, credentials, generated, revoke, remove };
}
