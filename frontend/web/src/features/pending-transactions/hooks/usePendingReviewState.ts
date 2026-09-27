import { useReducer, type SetStateAction } from 'react';
import type { PendingFinancialMessage } from '@kippa/domain';

export type SharedBalanceTagDraft = { kind: 'none' | 'iou' | 'split'; counterpartyUid: string; share: string };
type State = { accountId: string; categoryId: string; confirmDiscard: boolean; convertedAmount: string; destinationAccountId: string; selected: PendingFinancialMessage | null; sharedBalanceTag: SharedBalanceTagDraft };
const initial: State = { accountId: '', categoryId: '', confirmDiscard: false, convertedAmount: '', destinationAccountId: '', selected: null, sharedBalanceTag: { kind: 'none', counterpartyUid: '', share: '' } };
type Action = { [Key in keyof State]: { key: Key; value: SetStateAction<State[Key]> } }[keyof State];

export function usePendingReviewState() {
  const [state, dispatch] = useReducer((current: State, action: Action) => ({ ...current, [action.key]: typeof action.value === 'function' ? (action.value as (previous: State[typeof action.key]) => State[typeof action.key])(current[action.key]) : action.value }), initial);
  const setter = <Key extends keyof State>(key: Key) => (value: SetStateAction<State[Key]>) => dispatch({ key, value } as Action);
  return {
    ...state,
    setAccountId: setter('accountId'),
    setCategoryId: setter('categoryId'),
    setConfirmDiscard: setter('confirmDiscard'),
    setConvertedAmount: setter('convertedAmount'),
    setDestinationAccountId: setter('destinationAccountId'),
    setSelected: setter('selected'),
    setSharedBalanceTag: setter('sharedBalanceTag'),
  };
}
