import { z } from 'zod';
import { nullishString, idField, nipField, nullishNipField } from './common.js';

export const getAllClientsInputSchema = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .nullish()
    .transform((val) => val ?? 100)
    .describe('Max number of clients to return (1-100, default: 100)'),
  page: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((val) => val ?? 1)
    .describe('Page number (default: 1)'),
});

export const getClientByNipInputSchema = z.object({
  nip: nipField('Polish NIP number (10 digits, string or number, dashes accepted)'),
});

export const getClientByNameInputSchema = z.object({
  name: z
    .string()
    .min(1, 'Name search query is required')
    .describe('Name or partial name to search for'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .nullish()
    .transform((val) => val ?? 100)
    .describe('Max results (1-100, default: 100)'),
});

export const createClientInputSchema = z.object({
  name: z.string().min(1, 'Client name is required').describe('Client/company name (REQUIRED)'),
  nip: nullishNipField,
  street: nullishString.describe('Street address'),
  city: nullishString.describe('City'),
  zip: nullishString.describe('Postal code'),
  country: nullishString.describe('Country (default: PL)'),
  email: nullishString.describe('Email address'),
  phone: nullishString.describe('Phone number'),
  bank: nullishString.describe('Bank name'),
  bank_account: nullishString.describe('Bank account number'),
  notes: nullishString.describe('Internal notes'),
  shortcut: nullishString.describe('Short name/abbreviation'),
});

export const createClientByNipInputSchema = z.object({
  nip: nipField('Polish NIP number (10 digits, string or number, REQUIRED)'),
  allow_inactive: z
    .boolean()
    .nullish()
    .transform((val) => val ?? false)
    .describe(
      'Allow importing inactive/suspended CEIDG companies (default: false). Not applied to VAT whitelist hits.',
    ),
  overrides: z
    .object({
      email: nullishString,
      phone: nullishString,
      bank: nullishString,
      bank_account: nullishString,
      notes: nullishString,
    })
    .nullish()
    .transform((val) => val ?? undefined)
    .describe('Override auto-fetched fields (email, phone, bank, bank_account, notes)'),
});

export const updateClientInputSchema = z.object({
  id: idField,
  name: nullishString.describe('Updated company name'),
  nip: nullishNipField,
  street: nullishString.describe('Updated street address'),
  city: nullishString.describe('Updated city'),
  zip: nullishString.describe('Updated postal code'),
  country: nullishString.describe('Updated country'),
  email: nullishString.describe('Updated email'),
  phone: nullishString.describe('Updated phone'),
  bank: nullishString.describe('Updated bank name'),
  bank_account: nullishString.describe('Updated bank account'),
  notes: nullishString.describe('Updated notes'),
  shortcut: nullishString.describe('Updated short name'),
});

export const deleteClientInputSchema = z.object({
  id: idField,
  confirm: z
    .boolean()
    .refine((val) => val === true, {
      message: 'You must set confirm=true to delete a client',
    })
    .describe('Must be true to confirm deletion (REQUIRED)'),
});
