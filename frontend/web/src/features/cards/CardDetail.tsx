import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Stack,
  IconButton,
  LinearProgress,
} from '@mui/material';
import { CloseIcon } from '@/components/AppIcon';
import { useAppContext } from '@/hooks/useAppContext';
import {
  useTransactions,
  useLedgerLines,
  usePayCardMutation,
  useCategories,
  useCycles,
} from '@/hooks/useFinance';
import type { Card } from '@kippa/domain';
import { CardBackground, BankLogo, NetworkLogo, TierLabel, CardChip, ContactlessIcon } from './CardDesign';
import { Money } from '@/components/Money';
import { useFormattedMoney } from '@/hooks/useFormattedMoney';
import { usePrivacyMask } from '@/hooks/usePrivacyMask';
import { calculateCardActivity, type CardCharge } from '@/libs/cardActivity';
import { CardActivityList } from './components/CardActivityList';
import { useCardPaymentState } from './hooks/useCardPaymentState';

export function CardDetail({ card, onClose }: { card: Card; onClose: () => void }) {
  const { t } = useTranslation('cards');
  const { householdId } = useAppContext();
  const formatMoney = useFormattedMoney();
  const { maskText, maskDigits } = usePrivacyMask();
  const { data: allTransactions = [] } = useTransactions(householdId);
  const { data: allLines = [] } = useLedgerLines(householdId);
  const payCard = usePayCardMutation();
  const { data: categories = [] } = useCategories(householdId);
  const { data: allCycles = [] } = useCycles(householdId);
  const activeCycle = allCycles.find(c => c.status === 'open') || null;

  const { amount: payAmount, label: payLabel, open: payOpen, setAmount: setPayAmount, setLabel: setPayLabel, setOpen: setPayOpen, setSettlesChargeIds: setPaySettlesChargeIds, setSettlesDescriptions: setPaySettlesDescriptions, settlesChargeIds: paySettlesChargeIds, settlesDescriptions: paySettlesDescriptions } = useCardPaymentState();

  const isCredit = card.kind === 'credit';
  const creditAccountId = card.parentAccountId;
  const { accountBalance, charges, cycleGroups, totalDebt } = calculateCardActivity(creditAccountId, allTransactions, allLines, allCycles);

  const utilizationPct = card.creditLimit != null && card.creditLimit > 0
    ? Math.min(100, Math.round((totalDebt / card.creditLimit) * 100))
    : null;

  const [visibleCycleCount, setVisibleCycleCount] = useState(1);

  const loadNextCycle = () => {
    setVisibleCycleCount(prev => prev + 1);
  };


  const openPayAll = () => {
    // Record every currently-unpaid charge this lump payment will settle, so
    // the UI can mark them paid as a fact instead of guessing by FIFO later.
    const unpaid = charges.filter(c => !c.paid);
    const settlesIds = unpaid.map(c => c.txId);
    const descriptions = unpaid.map(c => c.description ?? c.txType);
    setPayAmount(Number(totalDebt.toFixed(2)));
    setPayLabel(t('detail.payAllTitle', { amount: formatMoney(totalDebt, card.currency, 2) }));
    setPaySettlesChargeIds(settlesIds);
    setPaySettlesDescriptions(descriptions);
    setPayOpen(true);
  };

  const openPayOne = (charge: CardCharge) => {
    const desc = charge.description ?? charge.txType;
    setPayAmount(Number(charge.amount.toFixed(2)));
    setPayLabel(t('detail.payChargeTitle', { name: desc, amount: formatMoney(charge.amount, card.currency, 2) }));
    setPaySettlesChargeIds([charge.txId]);
    setPaySettlesDescriptions([desc]);
    setPayOpen(true);
  };

  const handlePay = async () => {
    if (payAmount === '' || payAmount <= 0) return;
    try {
      await payCard.mutateAsync({
        householdId, card,
        amount: Number(payAmount),
        settlesChargeIds: paySettlesChargeIds,
        settlesDescriptions: paySettlesDescriptions,
        budgetCycleId: activeCycle?.id ?? null,
      });
      setPayOpen(false);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const formattedBalance = formatMoney(Math.abs(accountBalance), card.currency, 2);

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: '24px',
              overflow: 'hidden',
              p: 0,
            },
          },
        }}
      >
        {/* ── Card Header ──────────────────────────────────────────── */}
        <CardBackground bankId={card.bankId} kind={card.kind} tierId={card.tierId}>
          <Box
            sx={{
              filter: card.isActive ? 'none' : 'grayscale(0.7) brightness(0.7)',
              p: 2.5,
              pb: 3,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              // Match the tall credit-card layout height so debit cards
              // aren't clipped/shorter in the dialog header.
              minHeight: 240,
            }}
          >
            {/* Close button */}
            <IconButton
              onClick={onClose}
              size="small"
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                color: '#fff',
                bgcolor: 'rgba(255,255,255,0.15)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' },
                zIndex: 2,
              }}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>

            <Box sx={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              {/* Top Row: Bank Logo */}
              <Stack direction="row" justifyContent="flex-end" sx={{ mr: 4 }}>
                <BankLogo bankId={card.bankId} kind={card.kind} />
              </Stack>

              {/* Middle Row: Chip + Contactless waves & tier */}
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
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

              {/* Card Number and Expiry */}
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5, mb: 0.5 }}>
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

              {/* Bottom Row: Balance, Actions, and Network Logo */}
              <Box sx={{ mt: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-end">
                  <Box sx={{ flex: 1, mr: 2 }}>
                    {isCredit ? (
                      <>
                        <Typography sx={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
                          <Money amount={totalDebt} code={card.currency} maxDigits={2} />
                        </Typography>
                        <Typography sx={{ fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
                          {t('detail.outstandingBalance')}
                        </Typography>
                        {utilizationPct != null && (
                          <Box sx={{ mt: 1.5 }}>
                            <LinearProgress
                              variant="determinate"
                              value={utilizationPct}
                              sx={{
                                height: 6,
                                borderRadius: 3,
                                bgcolor: 'rgba(255,255,255,0.25)',
                                '& .MuiLinearProgress-bar': {
                                  bgcolor: utilizationPct > 95 ? '#ef4444' : utilizationPct > 80 ? '#F9AB00' : '#4ade80',
                                  borderRadius: 3,
                                },
                              }}
                            />
                            <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                              <Typography sx={{ fontSize: '9px', color: 'rgba(255,255,255,0.7)' }}>
                                {t('tile.utilized', { count: utilizationPct })}
                              </Typography>
                              {card.creditLimit != null && (
                                <Typography sx={{ fontSize: '9px', color: 'rgba(255,255,255,0.7)' }}>
                                  {t('tile.limit', { limit: maskDigits(`${card.currency} ${card.creditLimit.toLocaleString()}`) })}
                                </Typography>
                              )}
                            </Stack>
                          </Box>
                        )}
                        <Button
                          variant="contained"
                          disabled={totalDebt <= 0}
                          onClick={openPayAll}
                          sx={{
                            mt: 2,
                            bgcolor: 'rgba(255,255,255,0.2)',
                            color: '#ffffff',
                            fontWeight: 600,
                            px: 3,
                            borderRadius: '12px',
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' },
                            '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' },
                          }}
                        >
                          {t('detail.payAll')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Typography sx={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
                          {formattedBalance}
                        </Typography>
                        <Typography sx={{ fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>
                          {t('tile.availableBalance')}
                        </Typography>
                      </>
                    )}
                  </Box>
                  <NetworkLogo network={card.network} />
                </Stack>
              </Box>
            </Box>
          </Box>
        </CardBackground>

        {/* ── Activity Section ─────────────────────────────────────── */}
        <DialogContent sx={{ px: 3, pb: 3, pt: 2 }}>
          <CardActivityList card={card} categories={categories} groups={cycleGroups} mask={maskDigits} onLoadMore={loadNextCycle} onPay={openPayOne} visibleCount={visibleCycleCount} />
        </DialogContent>
      </Dialog>

      {/* ── Pay Confirm Dialog ────────────────────────────────────── */}
      <Dialog open={payOpen} onClose={() => setPayOpen(false)}>
        <DialogTitle>{payLabel}</DialogTitle>
        <DialogContent>
          <TextField
            type="number"
            label={t('detail.amountLabel', { currency: card.currency })}
            value={typeof payAmount === 'number' ? maskDigits(String(payAmount)) : payAmount}
            onChange={e => setPayAmount(e.target.value ? Number(e.target.value) : '')}
            autoFocus
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayOpen(false)}>{t('detail.cancel')}</Button>
          <Button variant="contained" disabled={payCard.isPending} onClick={handlePay}>
            {payCard.isPending ? t('detail.saving') : t('detail.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
