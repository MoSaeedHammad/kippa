import { useTranslation } from 'react-i18next';
import { useCycles, useHouseholdName } from '@/hooks/useFinance';
import { useAppContext } from '@/hooks/useAppContext';
import { PageHeader } from '@/features/shared/components/PageHeader';

export function HeaderSection() {
  const { t } = useTranslation('dashboard');
  const { householdId } = useAppContext();
  const { data: householdName } = useHouseholdName(householdId);
  const { data: cycles = [] } = useCycles(householdId);
  const activeCycle = cycles.find(c => c.status === 'open') || null;
  const name = householdName ?? t('header.defaultSpaceName');

  return (
    <PageHeader
      title={t('header.title')}
      subtitle={activeCycle
        ? t('header.subtitleCycle', { name, cycle: activeCycle.name })
        : t('header.subtitle', { name })}
    />
  );
}
