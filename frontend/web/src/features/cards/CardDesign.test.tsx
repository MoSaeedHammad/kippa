import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardTile } from './CardTile';
import { PrivacyModeProvider } from '@/hooks/PrivacyModeProvider';
import type { Card } from '@kippa/domain';

const renderWithProvider = (ui: React.ReactElement) =>
  render(<PrivacyModeProvider>{ui}</PrivacyModeProvider>);

const baseCard = {
  id: 'c',
  householdId: 'h',
  last4: '1234',
  isActive: true,
  createdAt: '',
  parentAccountId: 'a',
  currency: 'EGP' as const,
} as const;

describe('CardTile rendering across banks', () => {
  it('renders HSBC credit card with Advance tier label', () => {
    const card: Card = {
      ...baseCard,
      kind: 'credit',
      name: 'HSBC',
      network: 'mastercard',
      bankId: 'hsbc',
      tierId: 'advance',
    };
    renderWithProvider(<CardTile card={card} />);
    // Tier label appears (HSBC logo renders it inline too, so expect ≥1)
    expect(screen.getAllByText(/advance/i).length).toBeGreaterThan(0);
  });

  it('renders HSBC debit Premier card with HSBC branding', () => {
    const card: Card = {
      ...baseCard,
      kind: 'debit',
      name: 'HSBC',
      network: 'visa',
      bankId: 'hsbc',
      tierId: 'premier',
    };
    const { container } = renderWithProvider(<CardTile card={card} />);
    // HSBC wordmark appears (from the logo function) and the card name row
    // shows the card's name — both match /hsbc/i.
    expect(screen.getAllByText(/hsbc/i).length).toBeGreaterThan(0);
    // last4 rendered
    expect(screen.getByText(/1234/)).toBeInTheDocument();
    expect(container).toBeTruthy();
  });

  it('renders CIB debit platinum card with Platinum tier', () => {
    const card: Card = {
      ...baseCard,
      kind: 'debit',
      name: 'CIB',
      network: 'visa',
      bankId: 'cib',
      tierId: 'platinum',
    };
    renderWithProvider(<CardTile card={card} />);
    expect(screen.getByText(/platinum/i)).toBeInTheDocument();
  });

  it('renders Other-bank card with typed name', () => {
    const card: Card = {
      ...baseCard,
      kind: 'debit',
      name: 'My Local Bank',
      network: 'visa',
      bankId: 'other',
    };
    renderWithProvider(<CardTile card={card} />);
    // No tier label for 'other' debit → falls back to "Debit" text
    expect(screen.getByText(/debit/i)).toBeInTheDocument();
    expect(screen.getByText(/1234/)).toBeInTheDocument();
    // The card's name is printed on the card face
    expect(screen.getByText(/my local bank/i)).toBeInTheDocument();
  });

  it('does NOT show "Debit" label on a credit card with no tier', () => {
    const card: Card = {
      ...baseCard,
      kind: 'credit',
      name: 'Mystery Card',
      network: 'visa',
      bankId: 'other',
    };
    renderWithProvider(<CardTile card={card} />);
    expect(screen.queryByText(/^debit$/i)).toBeNull();
  });

  it('renders masked last4 digits', () => {
    const card: Card = {
      ...baseCard,
      kind: 'debit',
      name: 'NBE',
      network: 'meeza',
      bankId: 'nbe',
      tierId: 'classic',
    };
    renderWithProvider(<CardTile card={card} />);
    expect(screen.getByText(/•••• •••• 1234/)).toBeInTheDocument();
  });
});
