import '@mui/material/Chip';
import '@mui/material/Button';
import '@mui/material/Paper';
import '@mui/material/styles';
import '@mui/material/Typography';

declare module '@mui/material/Chip' {
  interface ChipPropsVariantOverrides {
    filter: true;
    filterSelected: true;
    filterAction: true;
  }
}

declare module '@mui/material/Button' {
  interface ButtonPropsVariantOverrides {
    segmented: true;
    segmentedSelected: true;
    keypad: true;
    keypadBack: true;
    compactField: true;
    primaryAction: true;
    assistantPrompt: true;
    assistantPromptFeatured: true;
    assistantSend: true;
  }
}

declare module '@mui/material/Paper' {
  interface PaperPropsVariantOverrides {
    amountPanel: true;
    amountPanelInactive: true;
    selectable: true;
    selectableSelected: true;
    assistantAvatar: true;
    assistantComposer: true;
    assistantUserMessage: true;
    assistantReply: true;
    assistantMessageAvatar: true;
    assistantHeader: true;
    assistantCooldown: true;
    assistantAction: true;
    assistantChart: true;
    saveFeedbackOverlay: true;
  }
}

declare module '@mui/material/styles' {
  interface TypographyVariants {
    sectionLabel: React.CSSProperties;
    fieldHint: React.CSSProperties;
    amountValue: React.CSSProperties;
    amountCurrency: React.CSSProperties;
    assistantPromptLabel: React.CSSProperties;
    assistantPromptTitle: React.CSSProperties;
    assistantMessage: React.CSSProperties;
  }

  interface TypographyVariantsOptions {
    sectionLabel?: React.CSSProperties;
    fieldHint?: React.CSSProperties;
    amountValue?: React.CSSProperties;
    amountCurrency?: React.CSSProperties;
    assistantPromptLabel?: React.CSSProperties;
    assistantPromptTitle?: React.CSSProperties;
    assistantMessage?: React.CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    sectionLabel: true;
    fieldHint: true;
    amountValue: true;
    amountCurrency: true;
    assistantPromptLabel: true;
    assistantPromptTitle: true;
    assistantMessage: true;
  }
}
