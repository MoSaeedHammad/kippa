import { Box, Button, Fab, Paper, Typography } from '@mui/material';
import { BackspaceIcon, CheckCircleIcon } from '@/components/AppIcon';

type Props = { activeDestination: boolean; amount: string; crossCurrency: boolean; destinationAmount: string; destinationCurrency: string; mode: 'expense' | 'income' | 'transfer'; onDestinationFocus: () => void; onKeyPress: (key: string) => void; onSave: () => void; onSourceFocus: () => void; saving: boolean; sourceCurrency: string };
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

export function EntryKeypad(props: Props) {
  const { activeDestination, amount, crossCurrency, destinationAmount, destinationCurrency, mode, onDestinationFocus, onKeyPress, onSave, onSourceFocus, saving, sourceCurrency } = props;
  const sourceActive = !activeDestination || !crossCurrency;
  const source = Number(amount);
  const destination = Number(destinationAmount);
  const saveLabel = mode === 'expense' ? 'Save Expense' : mode === 'income' ? 'Save Income' : 'Save Transaction';
  return (
    <Box sx={{ order: 1, minWidth: 0 }}>
      <Paper onClick={onSourceFocus} variant={sourceActive ? 'amountPanel' : 'amountPanelInactive'} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 2, mb: 1.5, cursor: crossCurrency ? 'pointer' : 'default' }}>
        <Typography variant="body2" color="inherit">{mode === 'transfer' ? 'Source Amount' : 'Amount to Log'}</Typography>
        <Box display="flex" alignItems="baseline" gap={0.5}><Typography color="inherit" variant="amountCurrency">{sourceCurrency}</Typography><Typography color="inherit" variant="amountValue">{amount}</Typography></Box>
      </Paper>
      {crossCurrency && <Paper onClick={onDestinationFocus} variant={activeDestination ? 'amountPanel' : 'amountPanelInactive'} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 1.5, mb: 1.5, cursor: 'pointer' }}>
        <Typography variant="body2" color="inherit">Destination Amount</Typography>
        <Box display="flex" alignItems="baseline" gap={0.5}><Typography color="inherit" variant="amountCurrency">{destinationCurrency}</Typography><Typography color="inherit" variant="amountValue">{destinationAmount}</Typography></Box>
      </Paper>}
      {crossCurrency && source > 0 && destination > 0 && <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 1.5 }}>Rate: 1 {sourceCurrency} = {(destination / source).toFixed(2)} {destinationCurrency}</Typography>}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>{KEYS.map((key) => <Button key={key} onClick={() => onKeyPress(key)} disableRipple fullWidth variant={key === 'back' ? 'keypadBack' : 'keypad'}>{key === 'back' ? <BackspaceIcon /> : key}</Button>)}</Box>
      <Fab variant="extended" color="primary" aria-label={saveLabel} onClick={onSave} disabled={saving} sx={{ display: { xs: 'flex', lg: 'none' }, position: 'fixed', right: 18, bottom: 96, zIndex: (theme) => theme.zIndex.appBar + 1, minWidth: 112, gap: 1 }}><CheckCircleIcon fontSize="small" />{saving ? 'Saving…' : 'Save'}</Fab>
    </Box>
  );
}
