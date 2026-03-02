const openid_client = require('openid-client');

const config_api = require('../config');
const logger = require('../logger');

const AUTH_TX_TTL_MS = 10 * 60 * 1000;
const auth_transactions = new Map();

let oidc_configuration = null;
let initialized = false;

function parseBool(input, fallback = false) {
  if (typeof input === 'boolean') return input;
  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function parseCSV(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(value => String(value).trim()).filter(value => value.length > 0);
  return String(input).split(',').map(value => value.trim()).filter(value => value.length > 0);
}

function normalizeRelativePath(return_to) {
  if (!return_to || typeof return_to !== 'string') return '/home';
  const trimmed = return_to.trim();
  if (!trimmed.startsWith('/')) return '/home';
  if (trimmed.startsWith('//')) return '/home';
  return trimmed;
}

function cleanupTransactions() {
  const now = Date.now();
  for (const [state, tx] of auth_transactions.entries()) {
    if (!tx || now - tx.created > AUTH_TX_TTL_MS) {
      auth_transactions.delete(state);
    }
  }
}

function getOIDCConfiguration() {
  return {
    enabled: parseBool(config_api.getConfigItem('ytdl_oidc_enabled'), false),
    issuer_url: config_api.getConfigItem('ytdl_oidc_issuer_url'),
    client_id: config_api.getConfigItem('ytdl_oidc_client_id'),
    client_secret: config_api.getConfigItem('ytdl_oidc_client_secret'),
    redirect_uri: config_api.getConfigItem('ytdl_oidc_redirect_uri'),
    scope: config_api.getConfigItem('ytdl_oidc_scope') || 'openid profile email',
    auto_register: parseBool(config_api.getConfigItem('ytdl_oidc_auto_register'), true),
    admin_claim: config_api.getConfigItem('ytdl_oidc_admin_claim') || 'groups',
    admin_value: config_api.getConfigItem('ytdl_oidc_admin_value') || 'admin',
    groups_claim: config_api.getConfigItem('ytdl_oidc_group_claim') || 'groups',
    allowed_groups: parseCSV(config_api.getConfigItem('ytdl_oidc_allowed_groups')),
    username_claim: config_api.getConfigItem('ytdl_oidc_username_claim') || 'preferred_username',
    display_name_claim: config_api.getConfigItem('ytdl_oidc_display_name_claim') || 'preferred_username'
  };
}

function getClaimByPath(claims, claimPath) {
  if (!claims || !claimPath || typeof claimPath !== 'string') return undefined;
  const pathParts = claimPath.split('.').filter(part => part !== '');
  if (pathParts.length === 0) return undefined;

  let currentValue = claims;
  for (const part of pathParts) {
    if (!currentValue || typeof currentValue !== 'object' || !(part in currentValue)) return undefined;
    currentValue = currentValue[part];
  }
  return currentValue;
}

function claimToArray(claimValue) {
  if (claimValue === undefined || claimValue === null) return [];
  if (Array.isArray(claimValue)) return claimValue.map(value => String(value).trim()).filter(value => value.length > 0);
  if (typeof claimValue === 'string' && claimValue.includes(',')) {
    return claimValue.split(',').map(value => value.trim()).filter(value => value.length > 0);
  }
  const normalized = String(claimValue).trim();
  return normalized ? [normalized] : [];
}

function normalizeURL(url_value, field_name) {
  const normalized = String(url_value || '').trim();
  if (!normalized) {
    throw new Error(`OIDC ${field_name} is missing.`);
  }
  try {
    return new URL(normalized);
  } catch (_err) {
    throw new Error(`OIDC ${field_name} is not a valid URL.`);
  }
}

function getQueryParam(req, key) {
  if (!req || !req.query) return undefined;
  const raw_value = req.query[key];
  if (Array.isArray(raw_value)) return raw_value[0];
  if (raw_value === undefined || raw_value === null) return undefined;
  return String(raw_value);
}

function buildCallbackURL(req, redirect_uri) {
  const callback_url = new URL(String(redirect_uri).trim());
  const search_params = new URLSearchParams();
  if (req && req.query) {
    Object.entries(req.query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        value.forEach(entry => search_params.append(key, String(entry)));
        return;
      }
      search_params.set(key, String(value));
    });
  }
  callback_url.search = search_params.toString();
  return callback_url;
}

function ensureOIDCReady() {
  if (!initialized || !oidc_configuration) {
    throw new Error('OIDC is not initialized.');
  }
}

exports.isEnabled = () => {
  return getOIDCConfiguration().enabled;
}

exports.getConfiguration = () => {
  return getOIDCConfiguration();
}

exports.initialize = async () => {
  const oidc_config = getOIDCConfiguration();
  if (!oidc_config.enabled) {
    oidc_configuration = null;
    initialized = false;
    auth_transactions.clear();
    return true;
  }

  if (!oidc_config.issuer_url || !oidc_config.client_id || !oidc_config.client_secret || !oidc_config.redirect_uri) {
    throw new Error('OIDC is enabled but one or more required settings are missing (issuer_url, client_id, client_secret, redirect_uri).');
  }

  const issuer_url = normalizeURL(oidc_config.issuer_url, 'issuer_url');
  const redirect_uri = normalizeURL(oidc_config.redirect_uri, 'redirect_uri');
  oidc_configuration = await openid_client.discovery(
    issuer_url,
    String(oidc_config.client_id).trim(),
    {
      client_secret: String(oidc_config.client_secret).trim(),
      redirect_uris: [redirect_uri.toString()],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post'
    }
  );
  initialized = true;
  logger.info('OIDC authentication initialized successfully.');
  return true;
}

exports.getStatus = () => {
  const oidc_config = getOIDCConfiguration();
  return {
    enabled: oidc_config.enabled,
    initialized: initialized && !!oidc_configuration,
    auto_register: oidc_config.auto_register
  };
}

exports.createAuthorizationURL = async (return_to = '/home') => {
  ensureOIDCReady();
  cleanupTransactions();
  const oidc_config = getOIDCConfiguration();
  const redirect_uri = normalizeURL(oidc_config.redirect_uri, 'redirect_uri').toString();
  const normalized_return_to = normalizeRelativePath(return_to);
  const code_verifier = openid_client.randomPKCECodeVerifier();
  const code_challenge = await openid_client.calculatePKCECodeChallenge(code_verifier);
  const state = openid_client.randomState();
  const nonce = openid_client.randomNonce();

  auth_transactions.set(state, {
    code_verifier: code_verifier,
    nonce: nonce,
    return_to: normalized_return_to,
    created: Date.now()
  });

  const authorization_url = openid_client.buildAuthorizationUrl(oidc_configuration, {
    scope: oidc_config.scope,
    redirect_uri: redirect_uri,
    code_challenge: code_challenge,
    code_challenge_method: 'S256',
    response_type: 'code',
    state: state,
    nonce: nonce
  });
  return authorization_url.href;
}

exports.consumeAuthorizationCallback = async (req) => {
  ensureOIDCReady();
  cleanupTransactions();

  const state = getQueryParam(req, 'state');
  if (!state || !auth_transactions.has(state)) {
    throw new Error('OIDC callback rejected: missing or invalid state.');
  }

  const tx = auth_transactions.get(state);
  auth_transactions.delete(state);

  const oidc_config = getOIDCConfiguration();
  const redirect_uri = normalizeURL(oidc_config.redirect_uri, 'redirect_uri').toString();
  const callback_url = buildCallbackURL(req, redirect_uri);

  const token_set = await openid_client.authorizationCodeGrant(oidc_configuration, callback_url, {
    expectedState: state,
    expectedNonce: tx.nonce,
    pkceCodeVerifier: tx.code_verifier
  });
  const id_claims = token_set.claims() || {};

  let userinfo_claims = {};
  if (token_set.access_token) {
    try {
      userinfo_claims = await openid_client.fetchUserInfo(
        oidc_configuration,
        token_set.access_token,
        id_claims.sub || openid_client.skipSubjectCheck
      );
    } catch (err) {
      logger.warn(`OIDC userinfo call failed, falling back to ID token claims. ${err.message}`);
    }
  }

  return {
    claims: Object.assign({}, userinfo_claims || {}, id_claims || {}),
    return_to: tx.return_to || '/home'
  };
}

exports.isClaimsAllowed = (claims) => {
  const oidc_config = getOIDCConfiguration();
  const allowed_groups = oidc_config.allowed_groups || [];
  if (!allowed_groups.length) return true;

  const groups_value = getClaimByPath(claims, oidc_config.groups_claim || 'groups');
  const user_groups = claimToArray(groups_value).map(group => group.toLowerCase());
  return allowed_groups.some(group => user_groups.includes(String(group).toLowerCase()));
}
