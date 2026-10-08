import { Box, Typography, LinearProgress, Stack, IconButton, Chip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AcUnitIcon } from '@/components/AppIcon';
import { DeleteIcon } from '@/components/AppIcon';
import { EditIcon } from '@/components/AppIcon';
import type { Card } from '@kippa/domain';
import type { CardSummary } from '@/libs/cardSelectors';
import { Money } from '@/components/Money';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { usePrivacyMask } from '@/hooks/usePrivacyMask';
import { CardBackground, BankLogo, NetworkLogo, TierLabel, CardChip, ContactlessIcon } from './CardDesign';

export function CardTile({
  card,
  summary,
  parentAccountBalance,
  onFreeze,
  onDelete,
  onEdit,
  onOpenDetail,
}: {
  card: Card;
  summary?: CardSummary;
  parentAccountBalance?: number;
  onFreeze?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onOpenDetail?: () => void;
}) {
  const utilizationPct = summary?.utilization != null ? Math.round(summary.utilization * 100) : null;
  const barColor = utilizationPct == null ? 'primary' : utilizationPct > 95 ? 'error' : utilizationPct > 80 ? 'warning' : 'success';
  const isCredit = card.kind === 'credit';

  const formatMoney = useFormattedMoney();
  const { t } = useTranslation('cards');
  const { maskText, maskDigits } = usePrivacyMask();
  const formattedBalance = parentAccountBalance != null
    ? formatMoney(parentAccountBalance, card.currency, 2)
    : null;

  return (
    <Box
      onClick={onOpenDetail}
      sx={{
        filter: card.isActive ? 'none' : 'grayscale(0.7) brightness(0.7)',
        borderRadius: '20px',
        color: '#fff',
        cursor: onOpenDetail ? 'pointer' : 'default',
        minHeight: 190,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        border: card.isActive ? '1px solid rgba(255,255,255,0.1)' : '1px solid',
        borderColor: card.isActive ? undefined : 'divider',
        flex: { xs: '1 1 100%', sm: '1 1 280px' },
        maxWidth: { xs: '100%', sm: 340 },
        boxSizing: 'border-box',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        overflow: 'hidden',
        '&:hover': onOpenDetail ? {
          transform: 'translateY(-4px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        } : {},
      }}
    >
      <CardBackground bankId={card.bankId} kind={card.kind} tierId={card.tierId} fill>
        <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: '1 1 auto', boxSizing: 'border-box' }}>
          {!card.isActive && (
            <Chip
              icon={<AcUnitIcon sx={{ fontSize: 14 }} />}
              label={t('tile.frozen')}
              size="small"
              sx={{ position: 'absolute', top: 12, left: 12, bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', zIndex: 2 }}
            />
          )}

          <Stack direction="row" justifyContent="flex-end" sx={{ position: 'relative', zIndex: 1 }}>
            <BankLogo bankId={card.bankId} kind={card.kind} />
          </Stack>

          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1, position: 'relative', zIndex: 1 }}>
            <CardChip />
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <TierLabel bankId={card.bankId} tierId={card.tierId} />
              {!card.tierId && !isCredit && (
                <Typography
                  sx={{
                    fontFamily: '"Inter", sans-serif',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#ffffff',
                    mr: 0.5,
                  }}
                >
                  {t('kind.debit')}
                </Typography>
              )}
              <ContactlessIcon />
            </Stack>
          </Stack>

          {card.name && (
            <Typography
              noWrap
              sx={{
                mt: 0.5,
                mb: -0.5,
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1.2px',
                color: '#ffffff',
                textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                position: 'relative',
                zIndex: 1,
              }}
            >
              {card.name}
            </Typography>
          )}

          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5, mb: 0.5, position: 'relative', zIndex: 1 }}>
            <Typography
              sx={{
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '2px',
                fontFamily: 'monospace',
                color: '#ffffff',
                textShadow: '0 1px 2px rgba(0,0,0,0.3)',
              }}
            >
              •••• •••• {maskText(card.last4 ?? '----')}
            </Typography>

            {card.expiryMonth && card.expiryYear && (
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ opacity: 0.9 }}>
                <Typography sx={{ fontSize: '7px', fontWeight: 700, color: '#ffffff', opacity: 0.7, mr: 0.25 }}>
                  THRU ▶
                </Typography>
                <Typography
                  sx={{
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    color: '#ffffff',
                  }}
                >
                  {maskDigits(`${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`)}
                </Typography>
              </Stack>
            )}
          </Stack>

          <Box sx={{ mt: 'auto', position: 'relative', zIndex: 1 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-end">
              <Box sx={{ flex: 1, mr: 2 }}>
                {isCredit && summary && (
                  <Stack spacing={0.5}>
                    <Typography sx={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.1, color: '#ffffff' }}>
                      <Money amount={summary.currentDebt} code={card.currency} maxDigits={2} />
                    </Typography>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography sx={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#ffffff', opacity: 0.7 }}>
                        {t('tile.outstanding')}
                      </Typography>
                      {summary.nextDueDate && (
                        <Typography sx={{ fontSize: '9px', fontWeight: 600, color: '#ffffff', opacity: 0.8 }}>
                          {t('tile.due', { date: summary.nextDueDate })}
                        </Typography>
                      )}
                    </Stack>
                    {utilizationPct != null && (
                      <Box sx={{ mt: 0.5 }}>
                        <LinearProgress
                          color={barColor as any}
                          variant="determinate"
                          value={Math.min(100, utilizationPct)}
                          sx={{
                            height: 5,
                            borderRadius: 2.5,
                            bgcolor: 'rgba(255,255,255,0.25)',
                          }}
                        />
                        <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.25 }}>
                          <Typography sx={{ fontSize: '8px', color: '#ffffff', opacity: 0.7 }}>
                            {t('tile.utilized', { count: utilizationPct })}
                          </Typography>
                          {card.creditLimit != null && (
                            <Typography sx={{ fontSize: '8px', color: '#ffffff', opacity: 0.7 }}>
                              {t('tile.limit', { limit: maskDigits(`${card.currency} ${card.creditLimit.toLocaleString()}`) })}
                            </Typography>
                          )}
                        </Stack>
                      </Box>
                    )}
                  </Stack>
                )}

                {!isCredit && formattedBalance && (
                  <Stack spacing={0.25}>
                    <Typography sx={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.1, color: '#ffffff' }}>
                      {formattedBalance}
                    </Typography>
                    <Typography sx={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#ffffff', opacity: 0.7 }}>
                      {t('tile.availableBalance')}
                    </Typography>
                  </Stack>
                )}
              </Box>

              <NetworkLogo network={card.network} />
            </Stack>

            {(onFreeze || onDelete || onEdit) && (
              <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1.5 }} onClick={e => e.stopPropagation()}>
                {onFreeze && (
                  <IconButton
                    size="small"
                    onClick={onFreeze}
                    sx={{
                      bgcolor: 'rgba(255,255,255,0.15)',
                      color: '#ffffff',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' }
                    }}
                  >
                    <AcUnitIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                )}
                {onDelete && (
                  <IconButton
                    size="small"
                    onClick={onDelete}
                    aria-label={t('tile.removeAria', { name: card.name })}
                    sx={{
                      bgcolor: 'rgba(255,255,255,0.15)',
                      color: '#ffffff',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' }
                    }}
                  >
                    <DeleteIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                )}
                {onEdit && (
                  <IconButton
                    size="small"
                    onClick={onEdit}
                    sx={{
                      bgcolor: 'rgba(255,255,255,0.15)',
                      color: '#ffffff',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' }
                    }}
                  >
                    <EditIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                )}
              </Stack>
            )}
          </Box>
        </Box>
      </CardBackground>
    </Box>
  );
}
