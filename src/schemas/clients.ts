import { z } from 'zod';
import { nullishString, idField } from './common.js';
import { cleanNIP, isValidNIP } from '../utils/nip.js';

export const getAllClientsInputSchema = z.object({
  limit: z.number().int().positive().max(100).nullish().transform((val) => val ?? 100),
  page: z.number().int().positive().nullish().transform((val) => val ?? 1),
});

export const getClientByNipInputSchema = z.object({
  nip: z
    .string()
    .min(1, 'NIP is required')
    .transform((val) => cleanNIP(val))
    .refine((val) => isValidNIP(val), 'Invalid NIP checksum'),
});

export const getClientByNameInputSchema = z.object({
  name: z.string().min(1, 'Name search query is required'),
  limit: z.number().int().positive().max(100).nullish().transform((val) => val ?? 100),
});

export const createClientInputSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
  nip: nullishString,
  street: nullishString,
  city: nullishString,
  zip: nullishString,
  country: nullishString,
  email: nullishString,
  phone: nullishString,
  bank: nullishString,
  bank_account: nullishString,
  notes: nullishString,
  shortcut: nullishString,
});

export const createClientByNipInputSchema = z.object({
  nip: z
    .string()
    .min(1, 'NIP is required')
    .transform((val) => cleanNIP(val))
    .refine((val) => isValidNIP(val), 'Invalid NIP checksum'),
  allow_inactive: z.boolean().nullish().transform((val) => val ?? false),
  overrides: z
    .object({
      email: nullishString,
      phone: nullishString,
      bank: nullishString,
      bank_account: nullishString,
      notes: nullishString,
    })
    .nullish()
    .transform((val) => val ?? undefined),
});

export const updateClientInputSchema = z.object({
  id: idField,
  name: nullishString,
  nip: nullishString,
  street: nullishString,
  city: nullishString,
  zip: nullishString,
  country: nullishString,
  email: nullishString,
  phone: nullishString,
  bank: nullishString,
  bank_account: nullishString,
  notes: nullishString,
  shortcut: nullishString,
});

export const deleteClientInputSchema = z.object({
  id: idField,
  confirm: z.boolean().refine((val) => val === true, {
    message: 'You must set confirm=true to delete a client',
  }),
});
