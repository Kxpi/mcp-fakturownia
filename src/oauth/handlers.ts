import http from 'node:http';
import type { Config } from '../config.js';
import { readBody, redirect, safeEqual, sendHtml, sendJson } from '../http-utils.js';
import { renderConsentForm } from './consent.js';
import { verifyPkceS256 } from './pkce.js';
import { consumeAuthCode, createAuthCode, getClient, registerClient } from './store.js';
import { issueAccessToken } from './tokens.js';

const ALLOWED_REDIRECT_URIS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
] as const;

type OAuthRouteHandler = (
  config: Config,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) => Promise<void>;

function isAllowedRedirectUri(uri: string): boolean {
  return (ALLOWED_REDIRECT_URIS as readonly string[]).includes(uri);
}

function oauthError(res: http.ServerResponse, statusCode: number, error: string, description?: string) {
  sendJson(res, statusCode, {
    error,
    error_description: description,
  });
}

function formFields(body: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(body));
}

async function handleProtectedResourceMetadata(
  config: Config,
  _req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  if (!config.mcpPublicUrl || !config.mcpResourceUri) {
    throw new Error('OAuth is not configured');
  }

  sendJson(res, 200, {
    resource: config.mcpResourceUri,
    authorization_servers: [config.mcpPublicUrl],
    bearer_methods_supported: ['header'],
  });
}

async function handleAuthorizationServerMetadata(
  config: Config,
  _req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  if (!config.mcpPublicUrl) {
    throw new Error('OAuth is not configured');
  }

  sendJson(res, 200, {
    issuer: config.mcpPublicUrl,
    authorization_endpoint: `${config.mcpPublicUrl}/oauth/authorize`,
    token_endpoint: `${config.mcpPublicUrl}/oauth/token`,
    registration_endpoint: `${config.mcpPublicUrl}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  });
}

async function handleRegister(
  _config: Config,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  try {
    const bodyText = await readBody(req);
    const body = JSON.parse(bodyText) as {
      redirect_uris?: string[];
      client_name?: string;
    };

    const redirectUris = body.redirect_uris ?? [];
    if (redirectUris.length === 0) {
      oauthError(res, 400, 'invalid_client_metadata', 'redirect_uris is required');
      return;
    }

    for (const uri of redirectUris) {
      if (!isAllowedRedirectUri(uri)) {
        oauthError(res, 400, 'invalid_redirect_uri', `Redirect URI not allowed: ${uri}`);
        return;
      }
    }

    const client = registerClient({
      redirectUris,
      clientName: body.client_name,
    });

    sendJson(res, 201, {
      client_id: client.clientId,
      client_id_issued_at: client.createdAt,
      redirect_uris: client.redirectUris,
      client_name: client.clientName,
      token_endpoint_auth_method: 'none',
    });
  } catch {
    oauthError(res, 400, 'invalid_request', 'Invalid registration request body');
  }
}

function validateAuthorizeParams(params: URLSearchParams): {
  ok: true;
  fields: Record<string, string>;
} | {
  ok: false;
  error: string;
} {
  const responseType = params.get('response_type');
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const codeChallenge = params.get('code_challenge');
  const codeChallengeMethod = params.get('code_challenge_method');

  if (responseType !== 'code') {
    return { ok: false, error: 'Unsupported response_type' };
  }
  if (!clientId || !redirectUri || !codeChallenge || !codeChallengeMethod) {
    return { ok: false, error: 'Missing required OAuth parameters' };
  }
  if (codeChallengeMethod !== 'S256') {
    return { ok: false, error: 'Only S256 PKCE is supported' };
  }
  if (!isAllowedRedirectUri(redirectUri)) {
    return { ok: false, error: 'Redirect URI is not allowed' };
  }

  const client = getClient(clientId);
  if (!client || !client.redirectUris.includes(redirectUri)) {
    return { ok: false, error: 'Unknown client or redirect URI' };
  }

  const fields: Record<string, string> = {
    response_type: responseType,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
  };

  const state = params.get('state');
  const resource = params.get('resource');
  if (state) fields.state = state;
  if (resource) fields.resource = resource;

  return { ok: true, fields };
}

async function handleAuthorizeGet(
  _config: Config,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const url = new URL(req.url || '/', `http://${req.headers.host ?? 'localhost'}`);
  const validation = validateAuthorizeParams(url.searchParams);

  if (!validation.ok) {
    sendHtml(res, 400, renderConsentForm({}, validation.error));
    return;
  }

  sendHtml(res, 200, renderConsentForm(validation.fields));
}

async function handleAuthorizePost(
  config: Config,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const body = formFields(await readBody(req));

  const password = body.password ?? '';
  if (!config.oauthConsentPassword || !safeEqual(password, config.oauthConsentPassword)) {
    const { password: _ignored, ...fields } = body;
    sendHtml(res, 401, renderConsentForm(fields, 'Invalid password'));
    return;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (key !== 'password') {
      params.set(key, value);
    }
  }

  const validation = validateAuthorizeParams(params);
  if (!validation.ok) {
    sendHtml(res, 400, renderConsentForm({}, validation.error));
    return;
  }

  const authCode = createAuthCode(
    {
      clientId: validation.fields.client_id,
      redirectUri: validation.fields.redirect_uri,
      codeChallenge: validation.fields.code_challenge,
      codeChallengeMethod: validation.fields.code_challenge_method,
    },
    config.oauthCodeTtlSeconds * 1000,
  );

  const redirectUrl = new URL(validation.fields.redirect_uri);
  redirectUrl.searchParams.set('code', authCode.code);
  if (validation.fields.state) {
    redirectUrl.searchParams.set('state', validation.fields.state);
  }

  redirect(res, redirectUrl.toString());
}

async function handleToken(
  config: Config,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const body = formFields(await readBody(req));

  if (body.grant_type !== 'authorization_code') {
    oauthError(res, 400, 'unsupported_grant_type', 'Only authorization_code is supported');
    return;
  }

  const { code, redirect_uri: redirectUri, client_id: clientId, code_verifier: codeVerifier } =
    body;

  if (!code || !redirectUri || !clientId || !codeVerifier) {
    oauthError(res, 400, 'invalid_request', 'Missing token request parameters');
    return;
  }

  if (!isAllowedRedirectUri(redirectUri)) {
    oauthError(res, 400, 'invalid_grant', 'Redirect URI is not allowed');
    return;
  }

  const client = getClient(clientId);
  if (!client || !client.redirectUris.includes(redirectUri)) {
    oauthError(res, 400, 'invalid_client', 'Unknown client or redirect URI');
    return;
  }

  const authCode = consumeAuthCode(code);
  if (!authCode) {
    oauthError(res, 400, 'invalid_grant', 'Authorization code is invalid or expired');
    return;
  }

  if (
    authCode.clientId !== clientId ||
    authCode.redirectUri !== redirectUri ||
    authCode.codeChallengeMethod !== 'S256'
  ) {
    oauthError(res, 400, 'invalid_grant', 'Authorization code does not match request');
    return;
  }

  if (!verifyPkceS256(codeVerifier, authCode.codeChallenge)) {
    oauthError(res, 400, 'invalid_grant', 'PKCE verification failed');
    return;
  }

  const accessToken = await issueAccessToken(config);

  sendJson(res, 200, {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: config.oauthAccessTokenTtlSeconds,
  });
}

const oauthRoutes: Array<{ method: string; path: string; handler: OAuthRouteHandler }> = [
  {
    method: 'GET',
    path: '/.well-known/oauth-protected-resource',
    handler: handleProtectedResourceMetadata,
  },
  {
    method: 'GET',
    path: '/.well-known/oauth-authorization-server',
    handler: handleAuthorizationServerMetadata,
  },
  { method: 'POST', path: '/oauth/register', handler: handleRegister },
  { method: 'GET', path: '/oauth/authorize', handler: handleAuthorizeGet },
  { method: 'POST', path: '/oauth/authorize', handler: handleAuthorizePost },
  { method: 'POST', path: '/oauth/token', handler: handleToken },
];

export async function tryHandleOAuthRoute(
  config: Config,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (!config.oauthEnabled) {
    return false;
  }

  const route = oauthRoutes.find((entry) => entry.method === req.method && entry.path === pathname);
  if (!route) {
    return false;
  }

  await route.handler(config, req, res);
  return true;
}
