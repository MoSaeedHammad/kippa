import { Box, Card, CardActionArea, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { Account } from '@kippa/domain';
import {
  AccountBalanceIcon,
  CheckCircleIcon,
  PaymentsIcon,
  SavingsIcon,
} from '@/components/AppIcon';

type AccountPickerProps = {
  accounts: Account[];
  emptyMessage?: string;
  label: string;
  onSelect: (accountId: string) => void;
  selectedAccountId: string | null;
};

function AccountTypeIcon({ type }: { type: string }) {
  const iconSx = { fontSize: 14, color: 'inherit' };
  const normalizedType = type.toLowerCase();

  if (normalizedType === 'savings' || normalizedType === 'savings bank') {
    return <SavingsIcon sx={iconSx} />;
  }
  if (normalizedType === 'cash' || normalizedType === 'wallet') {
    return <PaymentsIcon sx={iconSx} />;
  }
  return <AccountBalanceIcon sx={iconSx} />;
}

export function AccountPicker({
  accounts,
  emptyMessage,
  label,
  onSelect,
  selectedAccountId,
}: AccountPickerProps) {
  const { t } = useTranslation('shared');
  return (
    <Box sx={{ width: '100%' }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="sectionLabel">
          {label}
        </Typography>
        {!selectedAccountId && accounts.length > 0 && (
          <Typography variant="fieldHint" color="error">
            {t('accountPicker.tapToSelect')}
          </Typography>
        )}
      </Box>

      {accounts.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(auto-fill, minmax(160px, 1fr))' },
            gap: 1.5,
          }}
        >
          {accounts.map((account) => {
            const isSelected = selectedAccountId === account.id;
            return (
              <Card
                key={account.id}
                variant={isSelected ? 'selectableSelected' : 'selectable'}
                sx={{ minWidth: 0 }}
              >
                <CardActionArea
                  onClick={() => onSelect(account.id)}
                  aria-pressed={isSelected}
                  sx={{ p: 1.5, height: '100%' }}
                >
                <Box display="flex" alignItems="center" gap={1} sx={{ width: '100%', mb: 0.5 }}>
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <AccountTypeIcon type={account.type} />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                    {account.type}
                  </Typography>
                  {isSelected && <CheckCircleIcon sx={{ marginInlineStart: 'auto', fontSize: 17, color: 'primary.main' }} />}
                </Box>
                <Typography
                  variant="sectionLabel"
                  color={isSelected ? 'primary' : 'text.primary'}
                  sx={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    width: '100%',
                  }}
                >
                  {account.name}
                </Typography>
                </CardActionArea>
              </Card>
            );
          })}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          {emptyMessage}
        </Typography>
      )}
    </Box>
  );
}
