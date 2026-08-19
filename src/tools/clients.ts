import type { FakturowniaApiClient } from '../api/fakturowniaClient.js';
import type { CeidgClient } from '../api/ceidgClient.js';
import { isJdg, type VatWhitelistClient } from '../api/vatWhitelistClient.js';
import { config } from '../config.js';
import { FakturowniaError } from '../utils/errors.js';
import { cleanNIP } from '../utils/nip.js';
import { getToday } from '../utils/dates.js';
import {
  buildCeidgSuggestedCreatePayload,
  buildVatSuggestedCreatePayload,
  ceidgLookupWarnings,
  resolveJdgDisplayName,
  vatLookupWarnings,
} from '../utils/companyLookup.js';
import { filterClientList, filterClientDetail } from '../utils/responseFilter.js';
import {
  getAllClientsInputSchema,
  getClientByNipInputSchema,
  getClientByNameInputSchema,
  createClientInputSchema,
  lookupCompanyByNipInputSchema,
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

export const lookupCompanyByNipToolDef = defineTool(
  'lookup_company_by_nip',
  'Look up company data by NIP from Polish registries (read-only, does NOT create a Fakturownia client). Companies (KRS): MF VAT whitelist only. JDGs (krs null): whitelist for VAT status, address, bank accounts + CEIDG for trade name (requires CEIDG_API_TOKEN). Never-VAT-registered NIPs: CEIDG-only fallback when whitelist empty shell (subject.name is null). CRITICAL: statusVat "Niezarejestrowany" with a name is still a valid hit (removed payer), not a miss. Returns source, warnings, registry data, and suggested_create_payload for create_client.',
  lookupCompanyByNipInputSchema,
);

export const createClientToolDef = defineTool(
  'create_client',
  'Create a new client in Fakturownia. REQUIRES at least a name. Workflow for NIP import: get_client_by_nip → lookup_company_by_nip → create_client with suggested_create_payload (edit fields as needed). Provide NIP, address, email, phone, bank details as available.',
  createClientInputSchema,
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
    String(c.name || '')
      .toLowerCase()
      .includes(query),
  );
  const filtered = filterClientList(matches);
  return {
    data: filtered,
    count: filtered.length,
    message: `Found ${filtered.length} client(s) matching "${input.name}"`,
  };
}

export async function handleLookupCompanyByNip(
  vatClient: VatWhitelistClient,
  ceidgClient: CeidgClient,
  args: unknown,
) {
  const input = lookupCompanyByNipInputSchema.parse(args);
  const today = getToday();
  const vatCompany = await vatClient.getCompanyByNip(input.nip);

  if (vatCompany) {
    if (isJdg(vatCompany)) {
      if (!config.ceidgApiToken) {
        throw new FakturowniaError(
          'CEIDG_API_TOKEN is required to resolve JDG trade names. The VAT whitelist only returns personal names for sole proprietorships (krs is null).',
        );
      }

      const ceidg = await ceidgClient.tryGetCompanyByNip(input.nip);
      const { name, nameSource } = resolveJdgDisplayName(vatCompany.name, ceidg?.name);
      const warnings = vatLookupWarnings(vatCompany);
      if (ceidg) {
        warnings.push(...ceidgLookupWarnings(ceidg));
      }
      if (nameSource === 'vat_whitelist') {
        warnings.push(
          ceidg
            ? 'CEIDG returned no trade name — using VAT whitelist personal name.'
            : 'CEIDG returned no data — using VAT whitelist personal name.',
        );
      }

      return {
        source: 'vat_whitelist' as const,
        data: {
          name,
          vat_whitelist_name: vatCompany.name,
          name_source: nameSource,
          nip: input.nip,
          status_vat: vatCompany.statusVat,
          account_numbers: vatCompany.accountNumbers,
          removal_basis: vatCompany.removalBasis,
          removal_date: vatCompany.removalDate,
          ...(ceidg ? { ceidg_status: ceidg.status } : {}),
        },
        warnings,
        suggested_create_payload: buildVatSuggestedCreatePayload(
          vatCompany,
          input.nip,
          today,
          name,
        ),
        message: `Found "${name}" on VAT whitelist (JDG, VAT status: ${vatCompany.statusVat})`,
      };
    }

    const warnings = vatLookupWarnings(vatCompany);
    return {
      source: 'vat_whitelist' as const,
      data: {
        name: vatCompany.name,
        nip: input.nip,
        status_vat: vatCompany.statusVat,
        account_numbers: vatCompany.accountNumbers,
        removal_basis: vatCompany.removalBasis,
        removal_date: vatCompany.removalDate,
      },
      warnings,
      suggested_create_payload: buildVatSuggestedCreatePayload(vatCompany, input.nip, today),
      message: `Found "${vatCompany.name}" on VAT whitelist (VAT status: ${vatCompany.statusVat})`,
    };
  }

  const company = await ceidgClient.getCompanyByNip(input.nip);
  const warnings = ceidgLookupWarnings(company);

  return {
    source: 'ceidg' as const,
    data: {
      name: company.name,
      nip: company.nip,
      status: company.status,
      start_date: company.startDate,
    },
    warnings,
    suggested_create_payload: buildCeidgSuggestedCreatePayload(company, today),
    message: `Found "${company.name}" in CEIDG (VAT whitelist had no identity data)`,
  };
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
