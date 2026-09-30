import { AddIcon, SearchIcon } from '@/components/AppIcon';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { Category } from '@kippa/domain';

type CategoryChipsProps = {
  categories: Category[];
  mode: 'expense' | 'income';
  onOpenAll: () => void;
  onSelect: (categoryId: string) => void;
  selectedCategoryId: string | null;
  totalCount: number;
};

export function CategoryChips({
  categories,
  mode,
  onOpenAll,
  onSelect,
  selectedCategoryId,
  totalCount,
}: CategoryChipsProps) {
  const { t } = useTranslation('fastEntry');
  return (
    <Box>
      <Typography variant="sectionLabel" sx={{ mb: 1 }}>
        {t('chips.category')}
      </Typography>
      {totalCount === 0 ? (
        <EmptyLayout
          title={t(`chips.emptyTitle_${mode}`)}
          description={t(`chips.emptyDescription_${mode}`)}
        />
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {categories.map((category) => {
            const isSelected = selectedCategoryId === category.id;
            return (
              <Chip
                key={category.id}
                label={category.name}
                onClick={() => onSelect(category.id)}
                variant={isSelected ? 'filterSelected' : 'filter'}
              />
            );
          })}
          {totalCount > categories.length && (
            <Chip
              icon={<AddIcon fontSize="small" />}
              label={t('chips.more', { count: totalCount - categories.length })}
              onClick={onOpenAll}
              variant="filterAction"
            />
          )}
        </Box>
      )}
    </Box>
  );
}

type CategoryDialogProps = {
  categories: Category[];
  onClose: () => void;
  onSearchChange: (query: string) => void;
  onSelect: (categoryId: string) => void;
  open: boolean;
  search: string;
  selectedCategoryId: string | null;
};

export function CategoryDialog({
  categories,
  onClose,
  onSearchChange,
  onSelect,
  open,
  search,
  selectedCategoryId,
}: CategoryDialogProps) {
  const { t } = useTranslation('fastEntry');
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {t('categoryDialog.title')}
        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {t('categoryDialog.subtitle')}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <TextField
            autoFocus
            fullWidth
            placeholder={t('categoryDialog.searchPlaceholder')}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
          {categories.length > 0 ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {categories.map((category) => {
                const isSelected = selectedCategoryId === category.id;
                return (
                  <Chip
                    key={category.id}
                    label={category.name}
                    onClick={() => onSelect(category.id)}
                    variant={isSelected ? 'filterSelected' : 'filter'}
                  />
                );
              })}
            </Box>
          ) : (
            <EmptyLayout title={t('categoryDialog.noMatchTitle')} description={t('categoryDialog.noMatchDescription')} />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('categoryDialog.cancel')}</Button>
      </DialogActions>
    </Dialog>
  );
}
