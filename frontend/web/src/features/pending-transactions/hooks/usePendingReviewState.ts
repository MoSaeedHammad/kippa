import { useReducer, type SetStateAction } from 'react';
import type { PendingFinancialMessage } from '@kippa/domain';

type State = { accountId: string; categoryId: string; destinationAccountId: string; selected: PendingFinancialMessage | null };
const initial: State = { accountId: '', categoryId: '', destinationAccountId: '', selected: null };
type Action = { [Key in keyof State]: { key: Key; value: SetStateAction<State[Key]> } }[keyof State];

export function usePendingReviewState() {
  const [state, dispatch] = useReducer((current: State, action: Action) => ({ ...current, [action.key]: typeof action.value === 'function' ? (action.value as (previous: State[typeof action.key]) => State[typeof action.key])(current[action.key]) : action.value }), initial);
  const setter = <Key extends keyof State>(key: Key) => (value: SetStateAction<State[Key]>) => dispatch({ key, value } as Action);
  return { ...state, setAccountId: setter('accountId'), setCategoryId: setter('categoryId'), setDestinationAccountId: setter('destinationAccountId'), setSelected: setter('selected') };
}
