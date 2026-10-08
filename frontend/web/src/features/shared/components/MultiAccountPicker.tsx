import { Box, Card, CardActionArea, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { Account, CurrencyCode } from '@kippa/domain';
import {
  AccountBalanceIcon,
  CheckCircleIcon,
  PaymentsIcon,
  SavingsIcon,
} from '@/components/AppIcon';
import { Money } from '@/components/Money';

type MultiAccountPickerProps = {
  accounts: Account[];
  /** Share of the entry amount each selected account carries (same order). */
  amountFor?: (account: Account) => number | null;
  currency: CurrencyCode;
  emptyMessage?: string;
  label: string;
  selectedAccountIds: string[];
  onToggle: (accountId: string) => void;
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

/**
 * Multi-select counterpart of AccountPicker: tappable account tiles that
 * toggle membership in a set. When `amountFor` is provided, each selected
 * tile shows the share of the amount it carries.
 */
export function MultiAccountPicker({
  accounts,
  amountFor,
  currency,
  emptyMessage,
  label,
  selectedAccountIds,
  onToggle,
}: MultiAccountPickerProps) {
  const { t } = useTranslation('shared');
  const selected = new Set(selectedAccountIds);
  const count = selectedAccountIds.length;

  return (
    <Box sx={{ width: '100%' }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="sectionLabel">
          {label}
        </Typography>
        {count > 0 && (
          <Typography variant="fieldHint" color="text.secondary">
            {t('multiAccountPicker.selectedCount', { count })}
          </Typography>
        )}
      </Box>

      {accounts.length > 0 ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          {accounts.map((account) => {
            const isSelected = selected.has(account.id);
            const share = isSelected && amountFor ? amountFor(account) : null;
            return (
              <Card
                key={account.id}
                variant={isSelected ? 'selectableSelected' : 'selectable'}
                sx={{
                  flex: { xs: '1 1 calc(50% - 9px)', sm: '1 1 0' },
                  minWidth: 0,
                }}
              >
                <CardActionArea
                  onClick={() => onToggle(account.id)}
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
                  {share !== null && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                      <Money amount={share} code={currency} maxDigits={2} />
                    </Typography>
                  )}
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
