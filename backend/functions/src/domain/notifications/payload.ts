export type NotificationType =
  | 'transaction'
  | 'category_warning'
  | 'daily_reminder'
  | 'card_expiry'
  | 'household_join'
  | 'pending_financial_message'
  | 'card_payment_detected'
  | 'shared_balance';

export interface NotificationPayloadInput {
  type: NotificationType;
  title: string;
  body: string;
  householdId: string;
  deepLink?: string;
}

/** Builds the platform-neutral notification payload sent through FCM. */
export function buildMessagePayload(input: NotificationPayloadInput) {
  return {
    notification: { title: input.title, body: input.body },
    data: {
      type: input.type,
      householdId: input.householdId,
      deepLink: input.deepLink ?? '/',
    },
  };
}
