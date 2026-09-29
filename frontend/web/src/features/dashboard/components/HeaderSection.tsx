import { useCycles, useHouseholdName } from '@/hooks/useFinance';
import { useAppContext } from '@/hooks/useAppContext';
import { PageHeader } from '@/features/shared/components/PageHeader';

export function HeaderSection() {
  const { householdId } = useAppContext();
  const { data: householdName = 'My space' } = useHouseholdName(householdId);
  const { data: cycles = [] } = useCycles(householdId);
  const activeCycle = cycles.find(c => c.status === 'open') || null;

  return (
    <PageHeader
      title="Dashboard"
      subtitle={`Keep track of ${householdName}${activeCycle ? ` · ${activeCycle.name}` : ''}`}
    />
  );
}
