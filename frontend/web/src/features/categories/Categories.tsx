import { useState } from 'react';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  TextField,
  Typography,
  InputLabel,
  FormControl,
} from '@mui/material';
import { CategoryIcon, EditIcon, DeleteOutlineIcon, TuneIcon } from '@/components/AppIcon';
import { CardHeading } from '@/features/shared/components/CardHeading';
import { PageHeader } from '@/features/shared/components/PageHeader';
import {
  useCategories,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
} from '@/hooks/useFinance';
import type { Category, CategoryRule } from '@kippa/domain';
import { useAppContext } from '@/hooks/useAppContext';
import {
  useAddCategoryRuleMutation,
  useCategoryRules,
  useRemoveCategoryRuleMutation,
} from './hooks/useCategoryRules';

function CategoryRow({ category, rules }: { category: Category; rules: CategoryRule[] }) {
  const { t } = useTranslation('categories');
  const { enqueueSnackbar } = useSnackbar();
  const { householdId } = useAppContext();
  const updateMutation = useUpdateCategoryMutation();
  const addRuleMutation = useAddCategoryRuleMutation();
  const removeRuleMutation = useRemoveCategoryRuleMutation();

  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(category.name);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [patternsOpen, setPatternsOpen] = useState(false);
  const [pattern, setPattern] = useState('');

  const categoryRules = rules.filter((rule) => rule.categoryId === category.id);

  const rename = async () => {
    try {
      await updateMutation.mutateAsync({
        householdId,
        categoryId: category.id,
        updates: { name: name.trim() },
      });
      enqueueSnackbar(t('row.renamed'), { variant: 'success' });
      setRenameOpen(false);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('row.renameFailed'), { variant: 'error' });
    }
  };

  const deactivate = async () => {
    try {
      await updateMutation.mutateAsync({
        householdId,
        categoryId: category.id,
        updates: { isActive: false },
      });
      enqueueSnackbar(t('row.deactivated'), { variant: 'success' });
      setDeactivateOpen(false);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('row.deactivateFailed'), { variant: 'error' });
    }
  };

  const addPattern = async () => {
    try {
      await addRuleMutation.mutateAsync({ householdId, categoryId: category.id, pattern: pattern.trim() });
      enqueueSnackbar(t('row.ruleAdded'), { variant: 'success' });
      setPattern('');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('row.ruleAddFailed'), { variant: 'error' });
    }
  };

  const removePattern = async (ruleId: string) => {
    try {
      await removeRuleMutation.mutateAsync({ householdId, ruleId });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('row.ruleRemoveFailed'), { variant: 'error' });
    }
  };

  return (
    <Box sx={{ borderRadius: '10px', bgcolor: 'action.hover', border: '1px solid', borderColor: 'transparent' }}>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minHeight: 46, px: 1.25, py: 0.75 }}>
        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: category.type === 'income' ? 'success.main' : 'primary.main', flexShrink: 0 }} />
        <Typography sx={{ color: 'text.primary', fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {category.name}
        </Typography>
        <IconButton size="small" aria-label={t('row.patternsAria')} onClick={() => setPatternsOpen((open) => !open)}>
          <TuneIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label={t('row.renameAria')} onClick={() => { setName(category.name); setRenameOpen(true); }}>
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" aria-label={t('row.deactivateAria')} onClick={() => setDeactivateOpen(true)}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Stack>

      {patternsOpen && (
        <Box sx={{ px: 1.25, pb: 1.25 }}>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="fieldHint" color="text.secondary">{t('row.patternsHint')}</Typography>
          {categoryRules.map((rule) => (
            <Stack key={rule.id} direction="row" alignItems="center" spacing={1} sx={{ mt: 0.75 }}>
              <Chip label={rule.pattern} size="small" variant="filter" />
              <IconButton size="small" aria-label={t('row.removeRuleAria')} onClick={() => removePattern(rule.id)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <TextField
              size="small"
              fullWidth
              label={t('row.patternLabel')}
              placeholder={t('row.patternPlaceholder')}
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 60 } }}
            />
            <Button variant="outlined" disabled={pattern.trim().length < 2 || addRuleMutation.isPending} onClick={addPattern}>
              {t('row.addPattern')}
            </Button>
          </Stack>
        </Box>
      )}

      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('row.renameTitle')}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth margin="normal" label={t('addCard.nameLabel')} value={name}
            onChange={(event) => setName(event.target.value)} slotProps={{ htmlInput: { maxLength: 40 } }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameOpen(false)}>{t('row.cancel')}</Button>
          <Button variant="contained" disabled={!name.trim() || updateMutation.isPending} onClick={rename}>{t('row.save')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deactivateOpen} onClose={() => setDeactivateOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('row.deactivateTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">{t('row.deactivateText', { name: category.name })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeactivateOpen(false)}>{t('row.cancel')}</Button>
          <Button variant="contained" color="error" disabled={updateMutation.isPending} onClick={deactivate}>{t('row.deactivateConfirm')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export function Categories() {
  const { t } = useTranslation('categories');
  const { householdId } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<'income' | 'expense'>('expense');

  // Queries & Mutations
  const { data: categories = [], isLoading } = useCategories(householdId);
  const { data: rules = [] } = useCategoryRules(householdId);
  const createCategoryMutation = useCreateCategoryMutation();

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;

    try {
      await createCategoryMutation.mutateAsync({
        householdId,
        category: {
          name: newCatName,
          type: newCatType,
          isActive: true
        }
      });
      setNewCatName('');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.createFailed'), { variant: 'error' });
    }
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
                  {t(`type.${type}`)}
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
                  <CategoryRow category={category} rules={rules} />
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
