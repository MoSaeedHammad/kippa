import { Box, Card, CardContent, Chip, CircularProgress, Divider, IconButton, List, ListItem, ListItemText, Stack, Tooltip, Typography } from '@mui/material';
import type { Household } from '@kippa/domain';
import { HomeIcon, LogoutIcon, SwitchAccountIcon } from '@/components/AppIcon';
import { CardHeading } from '@/features/shared/components/CardHeading';

type Props = {
  activeId: string;
  busy: boolean;
  households: Household[];
  loading: boolean;
  onLeave: (household: Household) => void;
  onSwitch: (householdId: string) => void;
};

export function YourHouseholdsCard({ activeId, busy, households, loading, onLeave, onSwitch }: Props) {
  return (
    <Card>
      <CardContent>
        <CardHeading icon={<HomeIcon variant="Bulk" />} title="Your households" subtitle={`${households.length} financial ${households.length === 1 ? 'space' : 'spaces'} available`} />
      </CardContent>
      <Divider />
      {(loading || busy) ? (
        <Box display="flex" justifyContent="center" alignItems="center" p={4}><CircularProgress size={30} /></Box>
      ) : households.length === 0 ? (
        <Box p={3} textAlign="center"><Typography variant="body2" color="text.secondary">No households found. Please create or request to join one below.</Typography></Box>
      ) : (
        <List disablePadding>
          {households.map((household, index) => {
            const active = household.id === activeId;
            return (
              <Box key={household.id}>
                {index > 0 && <Divider />}
                <ListItem sx={{ px: 2.5, py: 1.5 }} secondaryAction={active ? <Chip label="Active" color="primary" size="small" /> : (
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Switch to this household"><IconButton color="primary" onClick={() => onSwitch(household.id)}><SwitchAccountIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Leave this household"><IconButton color="error" onClick={() => onLeave(household)}><LogoutIcon fontSize="small" /></IconButton></Tooltip>
                  </Stack>
                )}>
                  <ListItemText primary={household.name} secondary={`ID: ${household.id.slice(0, 8)}... • Currency: ${household.baseCurrency}`} />
                </ListItem>
              </Box>
            );
          })}
        </List>
      )}
    </Card>
  );
}
