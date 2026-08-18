import { z } from 'zod';

export function jsonSchemaFor(schema: z.ZodType) {
  return z.toJSONSchema(schema, { unrepresentable: 'any' });
}

export function defineTool(name: string, description: string, schema: z.ZodType) {
  return {
    name,
    description,
    inputSchema: jsonSchemaFor(schema),
  };
}
