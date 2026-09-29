import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { EntryHistoryFilter } from './EntryHistoryFilter';
import type { EntryPeriodFilter } from '@/libs/entryHistoryFilter';

function FilterHarness({ years, onChange }: { years: number[]; onChange: (filter: EntryPeriodFilter) => void }) {
  const [value, setValue] = useState<EntryPeriodFilter>({ year: 2026, month: 'all' });
  return (
    <EntryHistoryFilter
      years={years}
      value={value}
      onChange={(filter) => {
        setValue(filter);
        onChange(filter);
      }}
    />
  );
}

it('lists the years passed in plus an all-years option', async () => {
  const user = userEvent.setup();
  render(<FilterHarness years={[2026, 2025]} onChange={vi.fn()} />);

  await user.click(screen.getByLabelText(/Year/i));

  expect(screen.getByRole('option', { name: 'All years' })).toBeDefined();
  expect(screen.getByRole('option', { name: '2026' })).toBeDefined();
  expect(screen.getByRole('option', { name: '2025' })).toBeDefined();
});

it('reports the chosen year and resets the month when the year changes', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<FilterHarness years={[2026, 2025]} onChange={onChange} />);

  await user.click(screen.getByLabelText(/Year/i));
  await user.click(screen.getByRole('option', { name: '2025' }));

  expect(onChange).toHaveBeenLastCalledWith({ year: 2025, month: 'all' });
});

it('reports a chosen month against the selected year', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<FilterHarness years={[2026]} onChange={onChange} />);

  await user.click(screen.getByLabelText(/Month/i));
  await user.click(screen.getByRole('option', { name: 'March' }));

  expect(onChange).toHaveBeenCalledWith({ year: 2026, month: 3 });
});
