import { Avatar, Box, Button, Card, CardContent, Chip, Divider, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import type { HouseholdMember, JoinRequest } from '@kippa/domain';
import { GroupAddIcon } from '@/components/AppIcon';
import { CardHeading } from '@/features/shared/components/CardHeading';

type Props = {
  busy: boolean;
  loading: boolean;
  members: HouseholdMember[];
  onDecide: (userId: string, decision: 'approve' | 'reject') => void;
  requests: JoinRequest[];
};

export function HouseholdMembersCard({ busy, loading, members, onDecide, requests }: Props) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={2}>
          <CardHeading icon={<GroupAddIcon variant="Bulk" />} title="Members" subtitle={`${members.length} people connected to this household`} />
          {members.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{loading ? 'Loading members…' : 'No other members yet. Invite someone or approve a join request to share this household.'}</Typography>
          ) : (
            <List disablePadding>
              {members.map((member, index) => (
                <Box key={member.uid}>
                  {index > 0 && <Divider />}
                  <ListItem disableGutters>
                    <Avatar src={member.photoURL || undefined} sx={{ width: 36, height: 36, mr: 1.5 }}>{member.displayName?.charAt(0)?.toUpperCase() || '?'}</Avatar>
                    <ListItemText primary={member.displayName} secondary={member.email} />
                    {member.isOwner && <Chip label="Owner" size="small" color="primary" variant="outlined" />}
                  </ListItem>
                </Box>
              ))}
            </List>
          )}
          {requests.length > 0 && (
            <>
              <Divider />
              <Typography variant="sectionLabel" color="text.secondary">Pending Requests ({requests.length})</Typography>
              <List disablePadding>
                {requests.map((request, index) => (
                  <Box key={request.uid}>
                    {index > 0 && <Divider />}
                    <ListItem disableGutters secondaryAction={
                      <Stack direction="row" spacing={1}>
                        <Button size="small" variant="contained" color="success" onClick={() => onDecide(request.uid, 'approve')} disabled={busy}>Approve</Button>
                        <Button size="small" variant="outlined" color="error" onClick={() => onDecide(request.uid, 'reject')} disabled={busy}>Reject</Button>
                      </Stack>
                    }>
                      <Avatar src={request.photoURL || undefined} sx={{ width: 36, height: 36, mr: 1.5 }}>{request.displayName?.charAt(0)?.toUpperCase() || '?'}</Avatar>
                      <ListItemText primary={request.displayName} secondary={request.email} />
                    </ListItem>
                  </Box>
                ))}
              </List>
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
