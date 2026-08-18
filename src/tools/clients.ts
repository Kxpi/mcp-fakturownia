import type { FakturowniaApiClient } from '../api/fakturowniaClient.js';
import type { CeidgClient } from '../api/ceidgClient.js';
import { cleanNIP } from '../utils/nip.js';
import { getToday } from '../utils/dates.js';
import { filterClientList, filterClientDetail } from '../utils/responseFilter.js';
import {
  getAllClientsInputSchema,
  getClientByNipInputSchema,
  getClientByNameInputSchema,
  createClientInputSchema,
  createClientByNipInputSchema,
  updateClientInputSchema,
  deleteClientInputSchema,
} from '../schemas/clients.js';
import { defineTool } from './defineTool.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

export const getAllClientsToolDef = defineTool(
  'get_all_clients',
  'List all clients in Fakturownia. Returns basic info: id, name, NIP, address, email, phone. Default limit: 100. Use this to browse clients or find a client ID.',
  getAllClientsInputSchema,
);

export const getClientByNipToolDef = defineTool(
  'get_client_by_nip',
  'Find a single client by their NIP (Polish tax ID). Returns full client details if found. CRITICAL: NIP must be a valid 10-digit Polish tax number (string or number). Dashes are accepted and stripped automatically.',
  getClientByNipInputSchema,
);

export const getClientByNameToolDef = defineTool(
  'get_client_by_name',
  'Search clients by name (partial, case-insensitive match). Use this when you know part of the client name but not their NIP or ID.',
  getClientByNameInputSchema,
);

export const createClientToolDef = defineTool(
  'create_client',
  'Create a new client in Fakturownia with manually provided data. REQUIRES at least a name. Provide NIP, address, email, phone, bank details as available. For auto-importing from CEIDG business registry, use create_client_by_nip instead.',
  createClientInputSchema,
);

export const createClientByNipToolDef = defineTool(
  'create_client_by_nip',
  'Auto-create a client from the CEIDG Polish business registry using NIP only. Fetches company name, address from the registry. REQUIRES a valid NIP (string or number). CRITICAL: Only works for sole proprietorships (JDG). For LLCs and other types, use create_client manually. Inactive companies are rejected unless allow_inactive=true.',
  createClientByNipInputSchema,
);

export const updateClientToolDef = defineTool(
  'update_client',
  'Update an existing client in Fakturownia. REQUIRES the client ID (use get_all_clients or get_client_by_nip to find it). Only provided fields are updated.',
  updateClientInputSchema,
);

export const deleteClientToolDef = defineTool(
  'delete_client',
  'Permanently delete a client from Fakturownia. REQUIRES client ID and confirm=true. This action cannot be undone. Always confirm with the user before calling this.',
  deleteClientInputSchema,
);

export async function handleGetAllClients(client: FakturowniaApiClient, args: unknown) {
  const input = getAllClientsInputSchema.parse(args);
  const clients = await client.listClients({
    per_page: input.limit,
    page: input.page,
  });
  const filtered = filterClientList(clients as AnyRecord[]);
  return { data: filtered, count: filtered.length, message: `Found ${filtered.length} client(s)` };
}

export async function handleGetClientByNip(client: FakturowniaApiClient, args: unknown) {
  const input = getClientByNipInputSchema.parse(args);
  const allClients = await client.listClients({ per_page: 100 });
  const match = (allClients as AnyRecord[]).find((c) => {
    const clientNip = cleanNIP(String(c.tax_no || ''));
    return clientNip === input.nip;
  });

  if (!match) {
    return { data: null, message: `No client found with NIP ${input.nip}` };
  }

  return { data: filterClientDetail(match), message: 'Client found' };
}

export async function handleGetClientByName(client: FakturowniaApiClient, args: unknown) {
  const input = getClientByNameInputSchema.parse(args);
  const allClients = await client.listClients({ per_page: input.limit });
  const query = input.name.toLowerCase();
  const matches = (allClients as AnyRecord[]).filter((c) =>
    String(c.name || '').toLowerCase().includes(query),
  );
  const filtered = filterClientList(matches);
  return { data: filtered, count: filtered.length, message: `Found ${filtered.length} client(s) matching "${input.name}"` };
}

export async function handleCreateClient(client: FakturowniaApiClient, args: unknown) {
  const input = createClientInputSchema.parse(args);
  const payload: AnyRecord = { name: input.name };
  if (input.nip) payload.tax_no = input.nip;
  if (input.street) payload.street = input.street;
  if (input.city) payload.city = input.city;
  if (input.zip) payload.post_code = input.zip;
  if (input.country) payload.country = input.country;
  if (input.email) payload.email = input.email;
  if (input.phone) payload.phone = input.phone;
  if (input.bank) payload.bank = input.bank;
  if (input.bank_account) payload.bank_account = input.bank_account;
  if (input.notes) payload.note = input.notes;
  if (input.shortcut) payload.shortcut = input.shortcut;

  const result = await client.createClient(payload);
  return { data: filterClientDetail(result as AnyRecord), message: 'Client created successfully' };
}

export async function handleCreateClientByNip(
  apiClient: FakturowniaApiClient,
  ceidgClient: CeidgClient,
  args: unknown,
) {
  const input = createClientByNipInputSchema.parse(args);

  const company = await ceidgClient.getCompanyByNip(input.nip);

  if (!input.allow_inactive && company.status !== 'AKTYWNY') {
    return {
      data: null,
      message: `Company with NIP ${input.nip} is ${company.status} (not active). Set allow_inactive=true to override.`,
    };
  }

  const payload: AnyRecord = {
    name: company.name,
    tax_no: input.nip,
    street: company.street,
    city: company.city,
    post_code: company.postCode,
    country: 'PL',
    note: `[Auto-imported from CEIDG on ${getToday()}. Status: ${company.status}]`,
  };

  if (input.overrides?.email) payload.email = input.overrides.email;
  if (input.overrides?.phone) payload.phone = input.overrides.phone;
  if (input.overrides?.bank) payload.bank = input.overrides.bank;
  if (input.overrides?.bank_account) payload.bank_account = input.overrides.bank_account;
  if (input.overrides?.notes) payload.note += `\n${input.overrides.notes}`;

  const result = await apiClient.createClient(payload);
  return {
    data: filterClientDetail(result as AnyRecord),
    message: `Client "${company.name}" created from CEIDG registry`,
  };
}

export async function handleUpdateClient(client: FakturowniaApiClient, args: unknown) {
  const input = updateClientInputSchema.parse(args);
  const payload: AnyRecord = {};
  if (input.name) payload.name = input.name;
  if (input.nip) payload.tax_no = input.nip;
  if (input.street) payload.street = input.street;
  if (input.city) payload.city = input.city;
  if (input.zip) payload.post_code = input.zip;
  if (input.country) payload.country = input.country;
  if (input.email) payload.email = input.email;
  if (input.phone) payload.phone = input.phone;
  if (input.bank) payload.bank = input.bank;
  if (input.bank_account) payload.bank_account = input.bank_account;
  if (input.notes) payload.note = input.notes;
  if (input.shortcut) payload.shortcut = input.shortcut;

  const result = await client.updateClient(input.id, payload);
  return { data: filterClientDetail(result as AnyRecord), message: 'Client updated successfully' };
}

export async function handleDeleteClient(client: FakturowniaApiClient, args: unknown) {
  const input = deleteClientInputSchema.parse(args);
  await client.deleteClient(input.id);
  return { message: `Client ${input.id} deleted successfully` };
}
