import { Box, Tooltip, Typography } from '@mui/material';
import { versionDetails, versionLabel } from '@/version';

export function AppFooter() {
  return (
    <Box
      component="footer"
      sx={{
        display: 'flex',
        justifyContent: 'center',
        px: 2,
        py: 2.5,
      }}
    >
      <Tooltip title={versionDetails} placement="top">
        <Typography variant="fieldHint" color="text.secondary" sx={{ cursor: 'default' }}>
          {versionLabel}
        </Typography>
      </Tooltip>
    </Box>
  );
}
