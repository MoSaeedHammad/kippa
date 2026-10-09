import { useEffect, useReducer } from 'react';
import { FinanceTransaction, LedgerLine } from '@kippa/domain';
import { createTransactionEditFields, TransactionEditFields } from '@/libs/transactionEdit';

const EMPTY_FIELDS: TransactionEditFields = {
  description: '', date: '', categoryId: '', accountId: '', amount: '0', type: 'expense', merchant: '',
};

type Action = { type: 'reset'; fields: TransactionEditFields } | { type: 'change'; field: keyof TransactionEditFields; value: string };

function reducer(state: TransactionEditFields, action: Action): TransactionEditFields {
  if (action.type === 'reset') return action.fields;
  return { ...state, [action.field]: action.value } as TransactionEditFields;
}

export function useTransactionEditFields(transaction: FinanceTransaction | null, ledgerLines: LedgerLine[]) {
  const [fields, dispatch] = useReducer(reducer, EMPTY_FIELDS);

  useEffect(() => {
    if (transaction) dispatch({ type: 'reset', fields: createTransactionEditFields(transaction, ledgerLines) });
  }, [transaction, ledgerLines]);

  const setField = (field: keyof TransactionEditFields, value: string) => dispatch({ type: 'change', field, value });
  return { fields, setField };
}
