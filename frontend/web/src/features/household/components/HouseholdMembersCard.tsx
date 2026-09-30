import { Avatar, Box, Button, Card, CardContent, Chip, Divider, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { AccessLevel, HouseholdMember, JoinRequest } from '@kippa/domain';
import { GroupAddIcon } from '@/components/AppIcon';
import { CardHeading } from '@/features/shared/components/CardHeading';

type Props = {
  busy: boolean;
  loading: boolean;
  members: HouseholdMember[];
  onDecide: (userId: string, decision: 'approve' | 'reject', accessLevel?: AccessLevel) => void;
  onAccessLevelChange: (memberUid: string, accessLevel: AccessLevel) => void;
  requests: JoinRequest[];
};

export function HouseholdMembersCard({ busy, loading, members, onDecide, onAccessLevelChange, requests }: Props) {
  const { t } = useTranslation('household');
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={2}>
          <CardHeading icon={<GroupAddIcon variant="Bulk" />} title={t('membersCard.title')} subtitle={t('membersCard.connected', { count: members.length })} />
          {members.length === 0 ? (
            <Typography variant="body2" color="text.secondary">{loading ? t('membersCard.loading') : t('membersCard.empty')}</Typography>
          ) : (
            <List disablePadding>
              {members.map((member, index) => (
                <Box key={member.uid}>
                  {index > 0 && <Divider />}
                  <ListItem disableGutters secondaryAction={
                    member.isOwner ? <Chip label={t('membersCard.ownerChip')} size="small" color="primary" variant="outlined" /> : (
                      <Button
                        size="small"
                        variant="text"
                        disabled={busy}
                        onClick={() => onAccessLevelChange(member.uid, member.accessLevel === 'full' ? 'sharedBalanceOnly' : 'full')}
                      >
                        {member.accessLevel === 'full' ? t('membersCard.limitToShared') : t('membersCard.grantFull')}
                      </Button>
                    )
                  }>
                    <Avatar src={member.photoURL || undefined} sx={{ width: 36, height: 36, me: 1.5 }}>{member.displayName?.charAt(0)?.toUpperCase() || '?'}</Avatar>
                    <ListItemText
                      primary={member.displayName}
                      secondary={member.isOwner ? member.email : `${member.email} · ${t(`accessLevels.${member.accessLevel ?? 'full'}`)}`}
                    />
                  </ListItem>
                </Box>
              ))}
            </List>
          )}
          {requests.length > 0 && (
            <>
              <Divider />
              <Typography variant="sectionLabel" color="text.secondary">{t('membersCard.requestsHeading', { count: requests.length })}</Typography>
              <List disablePadding>
                {requests.map((request, index) => (
                  <Box key={request.uid}>
                    {index > 0 && <Divider />}
                    <ListItem disableGutters secondaryAction={
                      <Stack direction="row" spacing={1}>
                        <Button size="small" variant="outlined" color="primary" onClick={() => onDecide(request.uid, 'approve', 'sharedBalanceOnly')} disabled={busy}>{t('membersCard.approveSharedOnly')}</Button>
                        <Button size="small" variant="contained" color="success" onClick={() => onDecide(request.uid, 'approve', 'full')} disabled={busy}>{t('membersCard.approveFull')}</Button>
                        <Button size="small" variant="outlined" color="error" onClick={() => onDecide(request.uid, 'reject')} disabled={busy}>{t('membersCard.reject')}</Button>
                      </Stack>
                    }>
                      <Avatar src={request.photoURL || undefined} sx={{ width: 36, height: 36, me: 1.5 }}>{request.displayName?.charAt(0)?.toUpperCase() || '?'}</Avatar>
                      <ListItemText
                        primary={request.displayName}
                        secondary={request.requestedLevel === 'sharedBalanceOnly'
                          ? `${request.email} · ${t('membersCard.askedForSharedOnly')}`
                          : request.email}
                      />
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
