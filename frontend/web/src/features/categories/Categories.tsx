import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, 
  Card, 
  CardContent, 
  Container, 
  Stack, 
  Typography, 
  Button, 
  TextField, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel,
  Skeleton,
  Grid
} from '@mui/material';
import { CategoryIcon } from '@/components/AppIcon';
import { CardHeading } from '@/features/shared/components/CardHeading';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { 
  useCategories, 
  useCreateCategoryMutation 
} from '@/hooks/useFinance';

import { useAppContext } from '@/hooks/useAppContext';

export function Categories() {
  const { t } = useTranslation('categories');
  const { householdId } = useAppContext();
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<'income' | 'expense'>('expense');

  // Queries & Mutations
  const { data: categories = [], isLoading } = useCategories(householdId);
  const createCategoryMutation = useCreateCategoryMutation();

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;

    await createCategoryMutation.mutateAsync({
      householdId,
      category: {
        name: newCatName,
        type: newCatType,
        isActive: true
      }
    });

    setNewCatName('');
  };

  const renderCategoryGroup = (type: 'income' | 'expense') => {
    const items = categories.filter(category => category.type === type);
    return (
      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Box sx={{ mb: 2 }}>
            <CardHeading
              icon={<CategoryIcon variant="Bulk" />}
              title={t(`groups.${type}`)}
              subtitle={t('groups.configured', { count: items.length })}
              trailing={
                <Typography sx={{ color: type === 'income' ? 'success.main' : 'text.secondary', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {type}
                </Typography>
              }
            />
          </Box>

          {isLoading ? (
            <Grid container spacing={1}>
              {[1, 2, 3, 4].map(item => <Grid key={item} size={{ xs: 12, sm: 6 }}><Skeleton height={48} sx={{ borderRadius: '10px' }} /></Grid>)}
            </Grid>
          ) : items.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center', borderRadius: '12px', bgcolor: 'action.hover' }}>
              <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>{t(`groups.empty_${type}`)}</Typography>
            </Box>
          ) : (
            <Grid container spacing={1}>
              {items.map(category => (
                <Grid key={category.id} size={{ xs: 12, sm: 6 }}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.25}
                    sx={{ minHeight: 46, px: 1.25, py: 0.75, borderRadius: '10px', bgcolor: 'action.hover', border: '1px solid', borderColor: 'transparent' }}
                  >
                    <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: type === 'income' ? 'success.main' : 'primary.main', flexShrink: 0 }} />
                    <Typography sx={{ color: 'text.primary', fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {category.name}
                    </Typography>
                  </Stack>
                </Grid>
              ))}
            </Grid>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <Container maxWidth="xl" sx={{ py: 1, px: { xs: 2, sm: 3, lg: 5 } }}>
      <Stack spacing={3}>
        <PageHeader title={t('page.title')} subtitle={t('page.subtitle')} />

        <Grid container spacing={{ xs: 2, lg: 3 }} alignItems="flex-start">
          <Grid size={{ xs: 12, md: 8 }}>
            <Stack spacing={2}>{renderCategoryGroup('income')}{renderCategoryGroup('expense')}</Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ position: { md: 'sticky' }, top: { md: 96 } }}>
              <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Typography sx={{ fontSize: 15, fontWeight: 750, color: 'text.primary' }}>{t('addCard.title')}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 11.5, mt: 0.5, mb: 2.5 }}>{t('addCard.subtitle')}</Typography>
                <Stack spacing={2}>
              <TextField
                fullWidth
                label={t('addCard.nameLabel')}
                placeholder={t('addCard.namePlaceholder')}
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
              />
              <FormControl fullWidth>
                <InputLabel id="cat-type-label">{t('addCard.type')}</InputLabel>
                <Select
                  labelId="cat-type-label"
                  value={newCatType}
                  label={t('addCard.type')}
                  onChange={e => setNewCatType(e.target.value as 'income' | 'expense')}
                >
                  <MenuItem value="expense">{t('addCard.expense')}</MenuItem>
                  <MenuItem value="income">{t('addCard.income')}</MenuItem>
                </Select>
              </FormControl>
              <Button
                fullWidth
                variant="contained"
                onClick={handleCreateCategory}
                loading={createCategoryMutation.isPending}
                sx={{ borderRadius: '10px', fontWeight: 700 }}
              >
                {t('addCard.create')}
              </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Stack>
    </Container>
  );
}
