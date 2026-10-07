import { useTranslation } from 'react-i18next';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography,
} from '@mui/material';
import { ExpandLessIcon } from '@/components/AppIcon';
import { PARSED_TEMPLATE_GROUPS } from './parsedTemplates';

/**
 * Help panel listing every bank-message template the parser recognizes, so
 * users can compare their export against it and spot messages that will be
 * counted as "not recognized".
 */
export function ParsedTemplatesHelp() {
  const { t } = useTranslation('messageImport');
  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandLessIcon />}>
        <Typography variant="sectionLabel">{t('parsedHelp.title')}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <Typography variant="fieldHint">{t('parsedHelp.intro')}</Typography>
          {PARSED_TEMPLATE_GROUPS.map((group) => (
            <Box key={group.bank}>
              <Typography variant="sectionLabel">{t(`parsedHelp.banks.${group.bank}`)}</Typography>
              <Stack spacing={1.25} sx={{ mt: 1 }}>
                {group.templates.map((template) => (
                  <Box key={template.labelKey}>
                    <Typography variant="fieldHint">{t(template.labelKey)}</Typography>
                    <Typography variant="codeSnippet" component="code" sx={{ display: 'block', mt: 0.25, wordBreak: 'break-word' }}>
                      {template.example}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          ))}
          <Typography variant="fieldHint">{t('parsedHelp.notTransactions')}</Typography>
          <Typography variant="fieldHint">{t('parsedHelp.otherBanks')}</Typography>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
