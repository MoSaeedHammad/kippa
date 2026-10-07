import { useReducer, type SetStateAction } from 'react';
import type { EntryMode } from '@/libs/fastEntryTransaction';

type State = { amountStr: string; categoryDialogOpen: boolean; categorySearch: string; datePickerOpen: boolean; description: string; entryDate: Date; isKeypadForDest: boolean; mode: EntryMode; selectedAccountId: string | null; selectedCategoryId: string | null; toAccountId: string | null; toAmountStr: string; merchant: string };
const initialState: State = { amountStr: '0', categoryDialogOpen: false, categorySearch: '', datePickerOpen: false, description: '', entryDate: new Date(), isKeypadForDest: false, mode: 'expense', selectedAccountId: null, selectedCategoryId: null, toAccountId: null, toAmountStr: '0', merchant: '' };
type Action = { [Key in keyof State]: { key: Key; value: SetStateAction<State[Key]> } }[keyof State];

export function useFastEntryFormState() {
  const [state, update] = useReducer((current: State, action: Action) => ({ ...current, [action.key]: typeof action.value === 'function' ? (action.value as (previous: State[typeof action.key]) => State[typeof action.key])(current[action.key]) : action.value }), initialState);
  const setter = <Key extends keyof State>(key: Key) => (value: SetStateAction<State[Key]>) => update({ key, value } as Action);
  return { ...state, setAmountStr: setter('amountStr'), setCategoryDialogOpen: setter('categoryDialogOpen'), setCategorySearch: setter('categorySearch'), setDatePickerOpen: setter('datePickerOpen'), setDescription: setter('description'), setEntryDate: setter('entryDate'), setIsKeypadForDest: setter('isKeypadForDest'), setMode: setter('mode'), setSelectedAccountId: setter('selectedAccountId'), setSelectedCategoryId: setter('selectedCategoryId'), setToAccountId: setter('toAccountId'), setToAmountStr: setter('toAmountStr'), setMerchant: setter('merchant') };
}
