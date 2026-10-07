import { describe, expect, it } from 'vitest';
import { entryTypeOf } from './entryType';

describe('entryTypeOf', () => {
  it('classifies hand-typed entries as quick', () => {
    expect(entryTypeOf({})).toBe('quick');
    expect(entryTypeOf({ importedFrom: null })).toBe('quick');
  });

  it('classifies live bank-message approvals as ingested', () => {
    expect(entryTypeOf({ importedFrom: { kind: 'financial-message', pendingId: 'p', provider: 'hsbc', source: 'device' } })).toBe('ingested');
    expect(entryTypeOf({ importedFrom: { kind: 'financial-message', pendingId: 'p', provider: 'hsbc', source: 'ios-shortcut' } })).toBe('ingested');
  });

  it('classifies bulk history imports as imported', () => {
    expect(entryTypeOf({ importedFrom: { kind: 'financial-message', pendingId: 'p', provider: 'bank-misr', source: 'import-xml' } })).toBe('imported');
    expect(entryTypeOf({ importedFrom: { kind: 'financial-message', pendingId: 'p', provider: 'manual', source: 'import-json' } })).toBe('imported');
  });
});
