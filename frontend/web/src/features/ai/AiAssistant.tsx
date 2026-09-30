import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, InputBase, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useNotifications } from '@/notifications/useNotifications';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppContext } from '@/hooks/useAppContext';
import { AccountBalanceIcon, BarChartIcon, CategoryIcon, CheckCircleIcon, CloseIcon, ContentCopyIcon, ExpandLessIcon, KeyIcon, NotesIcon } from '@/components/AppIcon';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { aiConversations } from './services/conversations';
import { streamAssistantReply } from './services/assistant';
import { executePendingAiAction } from './services/readTools';
import { AiChart } from './components/AiChart';
import { AiError, type AiChartSpec, type AiConversation, type AiFailureKind, type AiMessage, type PendingAiAction } from './types';

const STARTERS = [
  { label: 'RIGHT NOW', prompt: 'What’s my total balance?', featured: true, Icon: AccountBalanceIcon },
  { label: 'THIS YEAR', prompt: 'Income versus spending', featured: false, Icon: BarChartIcon },
  { label: 'THIS MONTH', prompt: 'Category performance', featured: false, Icon: CategoryIcon },
] as const;

type TurnFailure = { kind: AiFailureKind; message: string; retryAfterMs?: number };

const COOLDOWN_STORAGE_KEY = 'kippa.ai.cooldownUntil';
const COOLDOWN_KIND_STORAGE_KEY = 'kippa.ai.cooldownKind';
const COOLDOWN_MESSAGE = 'Kip has reached Gemini’s free usage limit. Your message is saved and will be ready to retry when the cooldown ends.';
const QUOTA_MESSAGE = 'Kip’s free Gemini allowance has been used for today. It resets at midnight Pacific time, and your message is saved.';
const createCooldownDeadline = (duration: number) => Date.now() + duration;

const FAILURE_TITLES: Record<AiFailureKind, string> = {
  'rate-limit': 'Gemini is busy or the free limit was reached',
  quota: 'Today’s free AI allowance is used',
  authentication: 'Gemini is not configured correctly',
  network: 'Connection interrupted',
  validation: 'Kippa blocked an unsafe request',
  provider: 'The assistant could not finish',
};

export function AiAssistant() {
  const { householdId, userProfile, createHousehold, switchHousehold, requestToJoinHousehold, decideJoinRequest, leaveHousehold } = useAppContext();
  const userId = userProfile?.uid;
  const queryClient = useQueryClient();
  const notifications = useNotifications(householdId);
  const [conversation, setConversation] = useState<AiConversation | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [streamedText, setStreamedText] = useState('');
  const [streamedCharts, setStreamedCharts] = useState<AiChartSpec[]>([]);
  const [error, setError] = useState('');
  const [turnFailure, setTurnFailure] = useState<TurnFailure | null>(() => {
    if (Number(localStorage.getItem(COOLDOWN_STORAGE_KEY)) <= Date.now()) return null;
    const kind = localStorage.getItem(COOLDOWN_KIND_STORAGE_KEY) === 'quota' ? 'quota' : 'rate-limit';
    return { kind, message: kind === 'quota' ? QUOTA_MESSAGE : COOLDOWN_MESSAGE };
  });
  const [isSending, setIsSending] = useState(false);
  const [pendingActions, setPendingActions] = useState<PendingAiAction[]>([]);
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  const executingActionsRef = useRef(new Set<string>());
  const [connectionResult, setConnectionResult] = useState<{ endpoint: string; token: string } | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(() => Number(localStorage.getItem(COOLDOWN_STORAGE_KEY)) || 0);
  const [cooldownTotalMs, setCooldownTotalMs] = useState(60_000);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(() => Math.max(0, (Number(localStorage.getItem(COOLDOWN_STORAGE_KEY)) || 0) - Date.now()));
  const endRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottom = useRef(true);

  useEffect(() => {
    let active = true;
    if (!userId) return () => { active = false; };
    void aiConversations.list(householdId, userId).then(async rows => {
      if (!active || rows.length === 0) return;
      const latest = rows[0];
      const page = await aiConversations.messagesPage(householdId, latest.id);
      if (active) {
        setConversation(latest); setMessages(page.messages); setOlderCursor(page.nextCursor);
        setPendingActions(latest.pendingActions ?? []);
        if (page.messages.at(-1)?.role === 'user') setTurnFailure(current => current?.kind === 'rate-limit' || current?.kind === 'quota' ? current : { kind: 'provider', message: 'This message has no completed response yet. You can retry it safely.' });
      }
    }).catch(() => { if (active) setError('Previous AI conversations could not be loaded.'); }).finally(() => { if (active) setIsHistoryLoading(false); });
    return () => { active = false; };
  }, [householdId, userId]);

  useEffect(() => {
    if (shouldStickToBottom.current) endRef.current?.scrollIntoView({ behavior: streamedText ? 'auto' : 'smooth' });
  }, [messages, streamedText]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const update = () => {
      const remaining = Math.max(0, cooldownUntil - Date.now());
      setCooldownRemainingMs(remaining);
      if (remaining === 0) { localStorage.removeItem(COOLDOWN_STORAGE_KEY); localStorage.removeItem(COOLDOWN_KIND_STORAGE_KEY); }
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const handleScroll = () => {
    const element = scrollerRef.current;
    if (!element) return;
    shouldStickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  };

  const loadOlder = async () => {
    if (!conversation || !olderCursor || isLoadingOlder) return;
    const element = scrollerRef.current;
    const previousHeight = element?.scrollHeight ?? 0;
    setIsLoadingOlder(true);
    try {
      const page = await aiConversations.messagesPage(householdId, conversation.id, olderCursor);
      shouldStickToBottom.current = false;
      setMessages(current => [...page.messages, ...current]);
      setOlderCursor(page.nextCursor);
      requestAnimationFrame(() => {
        if (element) element.scrollTop += element.scrollHeight - previousHeight;
      });
    } catch {
      setError('Older messages could not be loaded.');
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const handleGenerateReply = async (activeConversation: AiConversation, nextMessages: AiMessage[]) => {
    setTurnFailure(null); setStreamedText(''); setStreamedCharts([]); setIsSending(true); shouldStickToBottom.current = true;
    const generatedCharts: AiChartSpec[] = [];
    try {
      const contextPage = await aiConversations.messagesPage(householdId, activeConversation.id, undefined, 100);
      const reply = await streamAssistantReply({
        householdId, userId: userProfile!.uid, userDisplayName: userProfile!.displayName, userPhotoURL: userProfile!.photoURL,
        messages: contextPage.messages.length ? contextPage.messages : nextMessages, onText: setStreamedText,
        onActionProposed: action => setPendingActions(current => {
          const next = current.some(item => item.id === action.id) ? current : [...current, action];
          void aiConversations.savePendingActions(householdId, activeConversation.id, next);
          return next;
        }),
        onChart: chart => { generatedCharts.push(chart); setStreamedCharts([...generatedCharts]); },
      });
      const assistantMessage = await aiConversations.addMessage(householdId, activeConversation.id, 'assistant', reply, generatedCharts);
      setMessages(current => [...current, assistantMessage]);
      setStreamedText(''); setStreamedCharts([]);
    } catch (caught) {
      setStreamedText(''); setStreamedCharts([]);
      const failure = caught instanceof AiError
        ? { kind: caught.kind, message: caught.message, retryAfterMs: caught.retryAfterMs }
        : { kind: 'provider' as const, message: caught instanceof Error ? caught.message : 'The assistant could not respond.' };
      if (failure.kind === 'rate-limit' || failure.kind === 'quota') {
        const duration = failure.retryAfterMs ?? 60_000;
        const until = createCooldownDeadline(duration);
        setCooldownTotalMs(duration); setCooldownUntil(until); setCooldownRemainingMs(duration);
        localStorage.setItem(COOLDOWN_STORAGE_KEY, String(until));
        localStorage.setItem(COOLDOWN_KIND_STORAGE_KEY, failure.kind);
      }
      setTurnFailure(failure);
    } finally {
      setIsSending(false);
    }
  };

  const confirmAction = async (action: PendingAiAction) => {
    if (!conversation || executingActionsRef.current.has(action.id)) return;
    executingActionsRef.current.add(action.id);
    setExecutingActionId(action.id); setError('');
    try {
      const result = await executePendingAiAction(action, {
        householdId, userId: userProfile!.uid, userDisplayName: userProfile!.displayName, userPhotoURL: userProfile!.photoURL,
        appActions: { createHousehold, switchHousehold, requestToJoinHousehold, decideJoinRequest, leaveHousehold, enableNotifications: notifications.requestPermission, disableNotifications: notifications.disable },
      });
      if (action.toolName === 'createMessageConnection' && result && typeof result === 'object' && 'endpoint' in result && 'token' in result) {
        const connection = result as { endpoint: string; token: string };
        setConnectionResult({ endpoint: connection.endpoint, token: connection.token });
      }
      if (action.toolName === 'leaveHousehold') {
        setPendingActions(current => current.filter(item => item.id !== action.id));
        return;
      }
      const content = `Done — ${action.summary}.`;
      const message = await aiConversations.addMessage(householdId, conversation.id, 'assistant', content);
      setMessages(current => [...current, message]);
      setPendingActions(current => current.filter(item => item.id !== action.id));
      await aiConversations.savePendingActions(householdId, conversation.id, pendingActions.filter(item => item.id !== action.id));
      await queryClient.invalidateQueries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Kippa could not complete that action.');
    } finally {
      executingActionsRef.current.delete(action.id);
      setExecutingActionId(null);
    }
  };

  const cancelAction = (actionId: string) => setPendingActions(current => {
    const next = current.filter(item => item.id !== actionId);
    if (conversation) void aiConversations.savePendingActions(householdId, conversation.id, next);
    return next;
  });

  const send = async (suggested?: string) => {
    const content = (suggested ?? draft).trim();
    if (!content || isSending || cooldownRemainingMs > 0) return;
    setError(''); setDraft(''); setTurnFailure(null); setIsSending(true); shouldStickToBottom.current = true;
    const optimisticMessage: AiMessage = {
      id: `optimistic-${crypto.randomUUID()}`, householdId, conversationId: conversation?.id ?? 'pending',
      role: 'user', content, createdAt: new Date().toISOString(),
    };
    const optimisticMessages = [...messages, optimisticMessage];
    setMessages(optimisticMessages);
    try {
      const activeConversation = conversation ?? await aiConversations.create(householdId, userProfile!.uid, content);
      if (!conversation) setConversation(activeConversation);
      const userMessage = await aiConversations.addMessage(householdId, activeConversation.id, 'user', content);
      const nextMessages = optimisticMessages.map(message => message.id === optimisticMessage.id ? userMessage : message);
      setMessages(nextMessages);
      await handleGenerateReply(activeConversation, nextMessages);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The assistant could not respond.');
      setIsSending(false);
    }
  };

  const retryLastTurn = async () => {
    if (!conversation || isSending || cooldownRemainingMs > 0 || messages.at(-1)?.role !== 'user') return;
    setError('');
    await handleGenerateReply(conversation, messages);
  };

  const renderBubble = (message: AiMessage, streaming = false) => {
    const isUser = message.role === 'user';
    return (
      <Box key={message.id} sx={{ width: '100%', display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
        {isUser ? (
          <Paper variant="assistantUserMessage" sx={{ maxWidth: { xs: '88%', sm: '72%' } }}>
            <Typography variant="assistantMessage" sx={{ whiteSpace: 'pre-wrap' }}>{message.content}</Typography>
          </Paper>
        ) : (<>
          <Paper variant="assistantMessageAvatar" sx={{ mt: 0.25, me: 1.5 }}>
            <NotesIcon sx={{ fontSize: 16 }} />
          </Paper>
          <Stack spacing={1.5} sx={{ width: 'calc(100% - 44px)', maxWidth: 620 }}>
            <Paper variant="assistantReply">
              <Typography component="div" variant="assistantMessage"><Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown></Typography>
              {streaming && <Box component="span" sx={{ display: 'inline-block', width: 6, height: 16, ms: 0.5, bgcolor: 'primary.main', verticalAlign: 'text-bottom', animation: 'kipCursor 900ms steps(1) infinite', '@keyframes kipCursor': { '50%': { opacity: 0 } } }} />}
            </Paper>
            {message.charts?.map((chart, index) => <AiChart key={`${message.id}-chart-${index}`} chart={chart} />)}
          </Stack>
        </>)}
      </Box>
    );
  };

  return (
    <Box sx={{ height: { xs: 'calc(100dvh - 148px)', md: 'calc(100dvh - 76px)' }, minHeight: 420, display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', overflow: 'hidden' }}>
      <Box sx={{ width: '100%', maxWidth: 760, mx: 'auto', px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 3 }, pb: 2, flexShrink: 0 }}>
        <PageHeader title="Kip" subtitle="Your financial companion" />
      </Box>
      <Box ref={scrollerRef} onScroll={handleScroll} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', scrollbarGutter: 'stable' }}>
        <Box sx={{ width: '100%', maxWidth: 760, minHeight: '100%', mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 3, sm: 4 }, display: 'flex', flexDirection: 'column' }}>
            {isHistoryLoading ? (
              <Stack alignItems="center" justifyContent="center" sx={{ flex: 1 }}><CircularProgress size={28} /></Stack>
            ) : messages.length === 0 && !streamedText ? (
              <Stack spacing={{ xs: 2, sm: 3 }} alignItems="center" justifyContent="center" sx={{ flex: 1, textAlign: 'center', py: { xs: 2, sm: 4 } }}>
                <Paper variant="assistantAvatar"><NotesIcon /></Paper>
                <Box>
                  <Typography sx={{ fontSize: { xs: 20, sm: 22 }, lineHeight: 1.3, fontWeight: 800, letterSpacing: '-0.025em' }}>How can I help with your money?</Typography>
                  <Typography color="text.secondary" sx={{ mt: 0.75, fontSize: 13, lineHeight: 1.6 }}>Ask about balances, spending, or how you’re doing.</Typography>
                </Box>
                <Box sx={{ width: '100%', maxWidth: 680, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
                  {STARTERS.map(({ Icon, ...starter }) => (
                    <Button
                      key={starter.prompt}
                      variant={starter.featured ? 'assistantPromptFeatured' : 'assistantPrompt'}
                      onClick={() => void send(starter.prompt)}
                      disabled={cooldownRemainingMs > 0}
                      sx={{ gridColumn: { xs: starter.featured ? '1 / -1' : 'auto', sm: 'auto' } }}
                    >
                      <Stack spacing={1.5} alignItems="stretch" justifyContent="space-between" sx={{ width: '100%', height: '100%' }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                          <Typography variant="assistantPromptLabel" color="inherit">{starter.label}</Typography>
                          <Icon fontSize="small" />
                        </Stack>
                        <Typography variant="assistantPromptTitle" color="inherit">{starter.prompt}</Typography>
                      </Stack>
                    </Button>
                  ))}
                </Box>
              </Stack>
            ) : (
              <Stack spacing={3}>
                {olderCursor && <Button size="small" onClick={() => void loadOlder()} loading={isLoadingOlder} sx={{ alignSelf: 'center' }}>Load older messages</Button>}
                {messages.map(message => renderBubble(message))}
                {streamedText && renderBubble({ id: 'streaming', householdId, conversationId: conversation?.id ?? '', role: 'assistant', content: streamedText, createdAt: '' }, true)}
                {streamedCharts.map((chart, index) => <AiChart key={`streamed-chart-${index}`} chart={chart} />)}
                {isSending && !streamedText && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary' }}><Box sx={{ width: 28, height: 28, borderRadius: 2, bgcolor: 'secondary.main', color: 'secondary.contrastText', display: 'grid', placeItems: 'center' }}><CircularProgress size={14} color="inherit" /></Box><Typography variant="fieldHint">Kip is checking your data…</Typography></Box>}
                {pendingActions.map(action => (
                  <Paper key={action.id} variant="assistantAction">
                    <Stack spacing={1.5}>
                      <Box>
                        <Typography variant="sectionLabel">Confirm change</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{action.summary}</Typography>
                      </Box>
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button variant="segmented" startIcon={<CloseIcon fontSize="small" />} onClick={() => cancelAction(action.id)} disabled={executingActionId === action.id}>Cancel</Button>
                        <Button variant="segmentedSelected" startIcon={<CheckCircleIcon fontSize="small" />} onClick={() => void confirmAction(action)} loading={executingActionId === action.id}>Confirm</Button>
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
                {connectionResult && (
                  <Paper variant="assistantAction">
                    <Stack spacing={1.5}>
                      <Box><Typography variant="sectionLabel">Connection created</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Copy these values now. The token is intentionally not saved in chat history.</Typography></Box>
                      {([['Endpoint', connectionResult.endpoint], ['Bearer token', connectionResult.token]] as const).map(([label, value]) => (
                        <Stack key={label} direction="row" alignItems="center" spacing={1.5}>
                          <KeyIcon fontSize="small" />
                          <Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="fieldHint" color="text.secondary">{label}</Typography><Typography variant="sectionLabel" noWrap>{value}</Typography></Box>
                          <Button variant="segmented" startIcon={<ContentCopyIcon fontSize="small" />} onClick={() => void navigator.clipboard.writeText(value)}>Copy</Button>
                        </Stack>
                      ))}
                      <Button variant="segmented" onClick={() => setConnectionResult(null)} sx={{ alignSelf: 'flex-end' }}>Dismiss</Button>
                    </Stack>
                  </Paper>
                )}
                {turnFailure?.kind === 'quota' ? (
                  <Paper variant="assistantCooldown">
                    <Stack spacing={1.5}>
                      <Box><Typography variant="sectionLabel">Free allowance used for today</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{turnFailure.message}</Typography></Box>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                        <Typography variant="fieldHint" color="text.secondary">Available again around {new Date(cooldownUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Typography>
                        <Button variant="segmented" disabled>Saved</Button>
                      </Stack>
                    </Stack>
                  </Paper>
                ) : turnFailure?.kind === 'rate-limit' ? (
                  <Paper variant="assistantCooldown">
                    <Stack spacing={1.5}>
                      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
                        <Box>
                          <Typography variant="sectionLabel">Kip is cooling down</Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{turnFailure.message}</Typography>
                        </Box>
                        <Typography variant="sectionLabel" color="primary.main">{Math.ceil(cooldownRemainingMs / 1000)}s</Typography>
                      </Stack>
                      <LinearProgress color="secondary" variant="determinate" value={cooldownRemainingMs > 0 ? Math.min(100, 100 - (cooldownRemainingMs / cooldownTotalMs) * 100) : 100} />
                      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                        <Typography variant="fieldHint" color="text.secondary">Your message is saved.</Typography>
                        <Button variant={cooldownRemainingMs > 0 ? 'segmented' : 'segmentedSelected'} onClick={() => void retryLastTurn()} disabled={cooldownRemainingMs > 0 || isSending}>{cooldownRemainingMs > 0 ? 'Available soon' : 'Retry now'}</Button>
                      </Stack>
                    </Stack>
                  </Paper>
                ) : turnFailure ? (
                  <Alert
                    severity="warning"
                    action={<Button color="inherit" size="small" onClick={() => void retryLastTurn()} disabled={isSending}>Retry</Button>}
                    sx={{ alignSelf: 'flex-start', width: '100%' }}
                  >
                    <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{FAILURE_TITLES[turnFailure.kind]}</Typography>
                    <Typography sx={{ mt: 0.25, fontSize: 12 }}>{turnFailure.message}</Typography>
                  </Alert>
                ) : null}
                <div ref={endRef} />
              </Stack>
            )}
        </Box>
      </Box>

      <Box sx={{ flexShrink: 0, bgcolor: 'background.paper', px: { xs: 2, sm: 3 }, pt: 1.5, pb: { xs: 1.5, md: 2 } }}>
        <Stack spacing={1} sx={{ width: '100%', maxWidth: 760, mx: 'auto' }}>
          {error && <Alert severity="warning" onClose={() => setError('')}>{error}</Alert>}
          <Paper variant="assistantComposer">
            <InputBase
              fullWidth multiline minRows={1} maxRows={5} value={draft} placeholder="Message Kip"
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }}
              disabled={isSending || cooldownRemainingMs > 0}
              sx={{ py: 1 }}
            />
            <Button variant="assistantSend" aria-label="Send message" onClick={() => void send()} disabled={!draft.trim() || isSending || cooldownRemainingMs > 0} sx={{ mb: 0.25 }}>
              <ExpandLessIcon sx={{ fontSize: 19 }} />
            </Button>
          </Paper>
          <Typography sx={{ textAlign: 'center', fontSize: 10.5, lineHeight: 1.35, color: 'text.secondary' }}>Kip can make mistakes. Financial facts come from your Kippa records.</Typography>
        </Stack>
      </Box>
    </Box>
  );
}
