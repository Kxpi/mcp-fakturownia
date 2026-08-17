import http from 'node:http';
import type { Config } from '../config.js';
import {
  parseFormBody,
  readBody,
  redirect,
  safeEqual,
  sendHtml,
  sendJson,
} from '../http-utils.js';
import { renderConsentForm } from './consent.js';
import { ALLOWED_REDIRECT_URIS } from './constants.js';
import {
  getAuthorizationServerMetadata,
  getProtectedResourceMetadata,
} from './metadata.js';
import { verifyPkceS256 } from './pkce.js';
import {
  consumeAuthCode,
  createAuthCode,
  getClient,
  registerClient,
} from './store.js';
import { issueAccessToken } from './tokens.js';

function isAllowedRedirectUri(uri: string): boolean {
  return (ALLOWED_REDIRECT_URIS as readonly string[]).includes(uri);
}

function oauthError(res: http.ServerResponse, statusCode: number, error: string, description?: string) {
  sendJson(res, statusCode, {
    error,
    error_description: description,
  });
}

export async function handleProtectedResourceMetadata(
  config: Config,
  res: http.ServerResponse,
) {
  sendJson(res, 200, getProtectedResourceMetadata(config));
}

export async function handleAuthorizationServerMetadata(
  config: Config,
  res: http.ServerResponse,
) {
  sendJson(res, 200, getAuthorizationServerMetadata(config));
}

export async function handleRegister(req: http.IncomingMessage, res: http.ServerResponse) {
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

export async function handleAuthorizeGet(
  config: Config,
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

export async function handleAuthorizePost(
  config: Config,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const bodyText = await readBody(req);
  const body = parseFormBody(bodyText);

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
      resource: validation.fields.resource,
      state: validation.fields.state,
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

export async function handleToken(
  config: Config,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const bodyText = await readBody(req);
  const body = parseFormBody(bodyText);

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

export function tryHandleOAuthRoute(
  config: Config,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): boolean | Promise<boolean> {
  if (!config.oauthEnabled) {
    return false;
  }

  if (pathname === '/.well-known/oauth-protected-resource' && req.method === 'GET') {
    return handleProtectedResourceMetadata(config, res).then(() => true);
  }

  if (pathname === '/.well-known/oauth-authorization-server' && req.method === 'GET') {
    return handleAuthorizationServerMetadata(config, res).then(() => true);
  }

  if (pathname === '/oauth/register' && req.method === 'POST') {
    return handleRegister(req, res).then(() => true);
  }

  if (pathname === '/oauth/authorize' && req.method === 'GET') {
    return handleAuthorizeGet(config, req, res).then(() => true);
  }

  if (pathname === '/oauth/authorize' && req.method === 'POST') {
    return handleAuthorizePost(config, req, res).then(() => true);
  }

  if (pathname === '/oauth/token' && req.method === 'POST') {
    return handleToken(config, req, res).then(() => true);
  }

  return false;
}
