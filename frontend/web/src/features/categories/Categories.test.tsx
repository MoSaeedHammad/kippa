import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Categories } from './Categories';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn().mockResolvedValue(undefined),
  enqueueSnackbar: vi.fn(),
}));

vi.mock('@/hooks/useAppContext', () => ({ useAppContext: () => ({ householdId: 'household' }) }));
vi.mock('notistack', () => ({ useSnackbar: () => ({ enqueueSnackbar: mocks.enqueueSnackbar }) }));
vi.mock('@/hooks/useFinance', () => ({
  useCategories: () => ({ data: [
    { id: 'income-1', householdId: 'household', name: 'Salary', type: 'income', isActive: true, createdAt: '' },
    { id: 'expense-1', householdId: 'household', name: 'Subscriptions', type: 'expense', isActive: true, createdAt: '' },
  ], isLoading: false }),
  useCreateCategoryMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateCategoryMutation: () => ({ isPending: false, mutateAsync: mocks.mutateAsync }),
}));

describe('Categories rename', () => {
  beforeEach(() => {
    mocks.mutateAsync.mockClear();
    mocks.enqueueSnackbar.mockClear();
  });

  it('renames the selected category with a trimmed name', async () => {
    const user = userEvent.setup();
    render(<Categories />);

    await user.click(screen.getByRole('button', { name: 'Rename Subscriptions' }));
    const input = screen.getByLabelText('Category Name');
    expect(input).toHaveValue('Subscriptions');
    await user.clear(input);
    await user.type(input, '  Streaming  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      householdId: 'household',
      categoryId: 'expense-1',
      updates: { name: 'Streaming' },
    });
  });

  it('cancels without writing and disables save for an empty name', async () => {
    const user = userEvent.setup();
    render(<Categories />);

    await user.click(screen.getByRole('button', { name: 'Rename Salary' }));
    const input = screen.getByLabelText('Category Name');
    await user.clear(input);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });
});
