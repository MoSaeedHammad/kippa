import { useState } from 'react';
import { useSnackbar } from 'notistack';
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
  Grid,
  Paper,
  IconButton,
  Tooltip,
} from '@mui/material';
import { CategoryIcon, EditIcon } from '@/components/AppIcon';
import { CardHeading } from '@/features/shared/components/CardHeading';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { 
  useCategories, 
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
} from '@/hooks/useFinance';
import { CategoryNameDialog } from '@/features/budget-cycles/components/CategoryNameDialog';

import { useAppContext } from '@/hooks/useAppContext';

export function Categories() {
  const { householdId } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<'income' | 'expense'>('expense');
  const [renameCategory, setRenameCategory] = useState<{ id: string; name: string } | null>(null);

  // Queries & Mutations
  const { data: categories = [], isLoading } = useCategories(householdId);
  const createCategoryMutation = useCreateCategoryMutation();
  const updateCategoryMutation = useUpdateCategoryMutation();

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

  const handleRenameCategory = async () => {
    if (!renameCategory || !renameCategory.name.trim() || updateCategoryMutation.isPending) return;
    try {
      await updateCategoryMutation.mutateAsync({
        householdId,
        categoryId: renameCategory.id,
        updates: { name: renameCategory.name.trim() },
      });
      setRenameCategory(null);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Could not rename category', { variant: 'error' });
    }
  };

  const renderCategoryGroup = (type: 'income' | 'expense', title: string) => {
    const items = categories.filter(category => category.type === type);
    return (
      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Box sx={{ mb: 2 }}>
            <CardHeading
              icon={<CategoryIcon variant="Bulk" />}
              title={title}
              subtitle={`${items.length} configured`}
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
              <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>No {type} categories yet</Typography>
            </Box>
          ) : (
            <Grid container spacing={1}>
              {items.map(category => (
                <Grid key={category.id} size={{ xs: 12, sm: 6 }}>
                  <Paper
                    variant="categoryRow"
                    data-category-type={type}
                    sx={{ minHeight: 46, px: 1.25, py: 0.75, display: 'flex', alignItems: 'center', gap: 1.25 }}
                  >
                    <Box className="category-dot" />
                    <Typography variant="cardSubtitle" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {category.name}
                    </Typography>
                    <Tooltip title="Rename">
                      <IconButton
                        size="small"
                        className="category-row-action"
                        aria-label={`Rename ${category.name}`}
                        onClick={() => setRenameCategory({ id: category.id, name: category.name })}
                        sx={{ flexShrink: 0 }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Paper>
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
        <PageHeader title="Categories" subtitle="Organize income and spending for reports and budget cycles" />

        <Grid container spacing={{ xs: 2, lg: 3 }} alignItems="flex-start">
          <Grid size={{ xs: 12, md: 8 }}>
            <Stack spacing={2}>{renderCategoryGroup('income', 'Income categories')}{renderCategoryGroup('expense', 'Expense categories')}</Stack>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ position: { md: 'sticky' }, top: { md: 96 } }}>
              <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Typography sx={{ fontSize: 15, fontWeight: 750, color: 'text.primary' }}>Add a category</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 11.5, mt: 0.5, mb: 2.5 }}>New categories become available immediately in entry and budgeting.</Typography>
                <Stack spacing={2}>
              <TextField
                fullWidth
                label="Category name"
                placeholder="e.g. Subscriptions"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
              />
              <FormControl fullWidth>
                <InputLabel id="cat-type-label">Type</InputLabel>
                <Select
                  labelId="cat-type-label"
                  value={newCatType}
                  label="Type"
                  onChange={e => setNewCatType(e.target.value as 'income' | 'expense')}
                >
                  <MenuItem value="expense">Expense</MenuItem>
                  <MenuItem value="income">Income</MenuItem>
                </Select>
              </FormControl>
              <Button
                fullWidth
                variant="contained"
                onClick={handleCreateCategory}
                loading={createCategoryMutation.isPending}
                sx={{ borderRadius: '10px', fontWeight: 700 }}
              >
                Create Category
              </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Stack>
      <CategoryNameDialog
        open={!!renameCategory}
        title="Rename Category"
        confirmLabel="Save"
        value={renameCategory?.name ?? ''}
        loading={updateCategoryMutation.isPending}
        onChange={(name) => setRenameCategory((current) => current ? { ...current, name } : current)}
        onClose={() => { if (!updateCategoryMutation.isPending) setRenameCategory(null); }}
        onConfirm={handleRenameCategory}
      />
    </Container>
  );
}
