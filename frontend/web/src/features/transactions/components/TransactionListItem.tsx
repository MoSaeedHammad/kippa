import type { ReactNode } from 'react';
import { Box, CircularProgress, Divider, Stack, Typography } from '@mui/material';

type TransactionListItemProps = {
  /** Left icon/avatar — usually a TransactionIcon (or a progress spinner while deciding). */
  leading: ReactNode;
  title: ReactNode;
  /** Small chips rendered inline after the title (type, state). */
  titleChips?: ReactNode;
  /** Second line: `fieldHint` meta — bank, type, date, specifier, merchant, category. */
  subtitle?: ReactNode;
  /** Right-aligned signed amount. */
  amount?: ReactNode;
  /** Extra chips row rendered under the subtitle (approvals waiting-on, status). */
  metaChips?: ReactNode;
  /** Optional trailing actions (edit/void, approve/decline). */
  trailing?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

/**
 * The canonical approval-style row used by Approvals and the merged
 * transaction history: a 72px tappable row with a leading icon, a bold title
 * + amount line and a muted metadata subtitle. Theme variants only — no
 * ad-hoc typography.
 */
export function TransactionListItem({
  leading,
  title,
  titleChips,
  subtitle,
  amount,
  metaChips,
  trailing,
  onClick,
  disabled,
}: TransactionListItemProps) {
  const body = (
    <>
      {leading}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography noWrap variant="sectionLabel" sx={{ flex: 1, minHeight: 24 }} component="span">
            {title}
          </Typography>
          {titleChips}
          {amount && (
            <Typography variant="sectionLabel" sx={{ whiteSpace: 'nowrap' }} component="span">
              {amount}
            </Typography>
          )}
        </Stack>
        {(subtitle || metaChips) && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25, flexWrap: 'wrap', rowGap: 0.5 }}>
            {metaChips}
            {subtitle && (
              <Typography noWrap variant="fieldHint" color="text.secondary" sx={{ minWidth: 0 }} component="span">
                {subtitle}
              </Typography>
            )}
          </Stack>
        )}
      </Box>
      {trailing && <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>{trailing}</Box>}
    </>
  );

  if (!onClick) {
    return (
      <Box
        sx={{
          width: '100%', minHeight: 72, px: { xs: 2, sm: 2.5 }, py: 1.25,
          display: 'flex', alignItems: 'center', gap: 1.5,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {body}
      </Box>
    );
  }

  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      sx={{
        width: '100%', minHeight: 72, px: { xs: 2, sm: 2.5 }, py: 1.25,
        display: 'flex', alignItems: 'center', gap: 1.5, border: 0,
        bgcolor: 'transparent', color: 'text.primary', textAlign: 'start', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        '&:hover': disabled ? undefined : { bgcolor: 'action.hover' },
      }}
    >
      {body}
    </Box>
  );
}

/** Inset divider matching the row geometry (aligned with the leading icon). */
export function TransactionListItemDivider() {
  return <Divider sx={{ marginInlineStart: 8.5 }} />;
}

/** Spinner sized for the leading slot while an approval decision is in flight. */
export function ListItemSpinner() {
  return <CircularProgress size={32} />;
}
