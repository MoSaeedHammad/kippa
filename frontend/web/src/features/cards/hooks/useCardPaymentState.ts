import { useReducer, type SetStateAction } from 'react';
type State = { amount: number | ''; feeRate: number | ''; feeAmountOverride?: number; label: string; open: boolean; settlesChargeIds?: string[]; settlesDescriptions?: string[] };
type Action = { [Key in keyof State]-?: { key: Key; value: SetStateAction<State[Key]> } }[keyof State];
export function useCardPaymentState() {
  const [state, dispatch] = useReducer((current: State, action: Action) => ({ ...current, [action.key]: typeof action.value === 'function' ? (action.value as (previous: State[typeof action.key]) => State[typeof action.key])(current[action.key]) : action.value }), { amount: '', feeRate: 3, label: 'Pay', open: false });
  const setter = <Key extends keyof State>(key: Key) => (value: SetStateAction<State[Key]>) => dispatch({ key, value } as Action);
  return { ...state, setAmount: setter('amount'), setFeeRate: setter('feeRate'), setFeeAmountOverride: setter('feeAmountOverride'), setLabel: setter('label'), setOpen: setter('open'), setSettlesChargeIds: setter('settlesChargeIds'), setSettlesDescriptions: setter('settlesDescriptions') };
}
