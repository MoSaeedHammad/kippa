import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, TextField, Typography, Stack } from '@mui/material';
import { BANK_LIST } from './banks/banks';
import { BankLogo } from './CardDesign';

export function BankPicker({ onPick }: { onPick: (bankId: string) => void }) {
  const { t } = useTranslation('cards');
  const [q, setQ] = useState('');
  const filtered = BANK_LIST.filter(b => b.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Stack spacing={2}>
      <TextField
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={t('bankPicker.searchPlaceholder')}
        size="small"
        fullWidth
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 1.5,
        }}
      >
        {filtered.map(b => (
          <Box
            key={b.id}
            onClick={() => onPick(b.id)}
            sx={{
              cursor: 'pointer',
              height: 90,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'flex-start',
              gap: 1,
              p: 1.5,
              overflow: 'hidden',
              // Use the bank's accent color as the tile background so the
              // white SVG logo (designed for dark card backgrounds) is visible.
              background: `linear-gradient(135deg, ${b.accentColor} 0%, ${shadeColor(b.accentColor, -25)} 100%)`,
              borderRadius: 1,
              transition: 'all 0.15s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: 4,
                filter: 'brightness(1.1)',
              },
            }}
          >
            {/* Render the real bank SVG logo (white on dark) */}
            <Box sx={{ '& svg': { maxWidth: 28, maxHeight: 28 }, zoom: 0.85 }}>
              <BankLogo bankId={b.id} kind="debit" />
            </Box>
            <Typography
              variant="caption"
              noWrap
              sx={{ fontWeight: 600, color: '#ffffff', opacity: 0.9 }}
            >
              {b.name}
            </Typography>
          </Box>
        ))}
      </Box>
    </Stack>
  );
}

/** Darkens a hex color by `percent` (negative = darker). Used for tile gradient. */
function shadeColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
}
