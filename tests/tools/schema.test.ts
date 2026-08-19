import { describe, it, expect } from 'vitest';
import { ALL_TOOL_DEFS } from '../../src/tools/registry.js';

describe('tool JSON schemas', () => {
  it('generates object schemas for every tool', () => {
    expect(ALL_TOOL_DEFS).toHaveLength(25);

    for (const tool of ALL_TOOL_DEFS) {
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
    }
  });

  it('includes lookup_company_by_nip instead of create_client_by_nip', () => {
    const names = ALL_TOOL_DEFS.map((tool) => tool.name);
    expect(names).toContain('lookup_company_by_nip');
    expect(names).not.toContain('create_client_by_nip');
  });
});
