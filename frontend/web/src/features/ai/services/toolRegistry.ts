import { z } from 'zod';

export type AiToolRisk = 'read' | 'memory' | 'write' | 'sensitive';

export type AiToolContext = {
  householdId: string;
  userId: string;
  userDisplayName?: string;
  userPhotoURL?: string;
  sourceMessageIds?: string[];
  appActions?: {
    createHousehold: (name: string) => Promise<unknown>;
    switchHousehold: (householdId: string) => Promise<void>;
    requestToJoinHousehold: (householdId: string) => Promise<unknown>;
    decideJoinRequest: (householdId: string, requesterUid: string, decision: 'approve' | 'reject') => Promise<void>;
    leaveHousehold: (householdId: string) => Promise<void>;
    enableNotifications: () => Promise<void>;
    disableNotifications: () => Promise<void>;
  };
};

export type AiToolDefinition<TInput extends z.ZodType, TResult> = {
  description: string;
  inputSchema: TInput;
  risk: AiToolRisk;
  confirmation?: (input: z.output<TInput>) => string;
  execute: (input: z.output<TInput>, context: AiToolContext) => Promise<TResult>;
};

export type AiToolRegistry = Record<string, AiToolDefinition<z.ZodType, unknown>>;

export function defineAiTool<TInput extends z.ZodType, TResult>(
  definition: AiToolDefinition<TInput, TResult>,
): AiToolDefinition<TInput, TResult> {
  return definition;
}

export async function executeValidatedTool(
  definition: AiToolDefinition<z.ZodType, unknown>,
  rawInput: unknown,
  context: AiToolContext,
): Promise<unknown> {
  const parsed = await definition.inputSchema.safeParseAsync(rawInput);
  if (!parsed.success) {
    throw new Error(`Invalid tool input: ${z.prettifyError(parsed.error)}`);
  }
  if (!context.householdId || !context.userId) {
    throw new Error('Authenticated space context is required.');
  }
  if (definition.risk !== 'read' && definition.risk !== 'memory') {
    throw new Error('This action requires the confirmed-action pipeline.');
  }
  return definition.execute(parsed.data, context);
}

export async function parseToolInput(
  definition: AiToolDefinition<z.ZodType, unknown>,
  rawInput: unknown,
): Promise<unknown> {
  const parsed = await definition.inputSchema.safeParseAsync(rawInput);
  if (!parsed.success) throw new Error(`Invalid tool input: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export async function executeConfirmedTool(
  definition: AiToolDefinition<z.ZodType, unknown>,
  rawInput: unknown,
  context: AiToolContext,
): Promise<unknown> {
  const parsedResult = definition.inputSchema.safeParse(rawInput);
  if (!parsedResult.success) throw new Error(`Invalid tool input: ${z.prettifyError(parsedResult.error)}`);
  const parsed = parsedResult.data;
  if (!context.householdId || !context.userId) throw new Error('Authenticated space context is required.');
  return definition.execute(parsed, context);
}
