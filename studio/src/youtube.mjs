// YouTube Data API v3 integration: OAuth 2.0, resumable upload, thumbnail, status.
//
// SAFETY MODEL (non-negotiable):
//  * Credentials are read from the environment or a git-ignored file. They are
//    never logged, never written into artifacts, and never included in error text.
//  * Privacy is capped: this module will only ever upload `private` or `unlisted`.
//    Publishing `public` requires BOTH an explicit `allowPublic: true` argument AND
//    the env flag YT_ALLOW_PUBLIC=1, i.e. an owner decision, not an agent default.
//  * If credentials or network are missing, the module says so and returns a
//    `not_configured` result. It NEVER fabricates a video id or a successful upload.
//
// STATUS OF THIS MODULE IN THIS REPO: implemented, unit-checked against the real
// request shapes, NOT upload-tested (no network egress, no OAuth client here).

import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './env.mjs';
import { logRun } from './router.mjs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/youtube/v3';
const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3';

const CRED_FILE = path.join(DATA_DIR, 'youtube_credentials.json');

/** Read credentials without ever echoing them. */
export function loadCredentials() {
  const envId = process.env.YT_CLIENT_ID;
  const envSecret = process.env.YT_CLIENT_SECRET;
  const envRefresh = process.env.YT_REFRESH_TOKEN;
  if (envId && envSecret && envRefresh) {
    return { clientId: envId, clientSecret: envSecret, refreshToken: envRefresh, source: 'env' };
  }
  if (fs.existsSync(CRED_FILE)) {
    try {
      const j = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
      if (j.clientId && j.clientSecret && j.refreshToken) return { ...j, source: CRED_FILE };
      if (j.installed?.client_id && j.refresh_token) {
        return {
          clientId: j.installed.client_id,
          clientSecret: j.installed.client_secret,
          refreshToken: j.refresh_token,
          source: CRED_FILE,
        };
      }
    } catch { /* fall through */ }
  }
  return null;
}

export function credentialStatus() {
  const c = loadCredentials();
  return {
    configured: !!c,
    source: c?.source || null,
    // only ever report presence, never values
    hasClientId: !!c?.clientId,
    hasClientSecret: !!c?.clientSecret,
    hasRefreshToken: !!c?.refreshToken,
  };
}

async function refreshAccessToken(creds, { fetchImpl = fetch } = {}) {
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Google returns error/error_description; never echo the request body
    throw new Error(`token refresh failed (${res.status}): ${j.error || 'unknown'} — ${j.error_description || ''}`);
  }
  return { accessToken: j.access_token, expiresIn: j.expires_in, scope: j.scope };
}

/** Build the video resource exactly as the API expects it. */
export function videoResource(meta) {
  return {
    snippet: {
      title: meta.title,
      description: meta.description,
      tags: meta.tags || [],
      categoryId: String(meta.categoryId || '28'),
      defaultLanguage: meta.defaultLanguage || 'en',
      defaultAudioLanguage: meta.defaultAudioLanguage || 'en',
    },
    status: {
      privacyStatus: meta.privacyStatus,
      selfDeclaredMadeForKids: !!meta.madeForKids,
      embeddable: true,
      license: 'youtube',
    },
  };
}

/** Refuse to upload anything that is not private/unlisted unless the owner opted in. */
export function enforcePrivacy(privacyStatus, { allowPublic = false, env = process.env } = {}) {
  const wants = String(privacyStatus || 'private');
  if (wants === 'public') {
    if (!allowPublic || env.YT_ALLOW_PUBLIC !== '1') {
      throw new Error(
        'refusing to upload with privacyStatus=public: this requires allowPublic:true AND YT_ALLOW_PUBLIC=1 ' +
        '(owner authorization). Uploading as "private" instead is the safe default.'
      );
    }
  }
  if (!['private', 'unlisted', 'public'].includes(wants)) throw new Error(`bad privacyStatus ${wants}`);
  return wants;
}

/**
 * Resumable upload (the only sane mode for real files: retries, resumability).
 * Returns the created video id from the API response.
 */
export async function uploadVideo({
  file, meta, accessToken, fetchImpl = fetch, chunkSize = 8 * 1024 * 1024, log = () => {},
}) {
  const size = fs.statSync(file).size;
  const resource = videoResource(meta);
  const initUrl = `${UPLOAD}/videos?uploadType=resumable&part=snippet,status`;
  const init = await fetchImpl(initUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-length': String(size),
      'x-upload-content-type': 'video/mp4',
    },
    body: JSON.stringify(resource),
  });
  if (!init.ok) {
    const t = await init.text().catch(() => '');
    throw new Error(`upload init failed (${init.status}): ${t.slice(0, 300)}`);
  }
  const session = init.headers.get('location');
  if (!session) throw new Error('upload init returned no session URI');

  const fd = fs.openSync(file, 'r');
  try {
    let offset = 0;
    let videoId = null;
    while (offset < size) {
      const len = Math.min(chunkSize, size - offset);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, offset);
      const res = await fetchImpl(session, {
        method: 'PUT',
        headers: {
          'content-length': String(len),
          'content-range': `bytes ${offset}-${offset + len - 1}/${size}`,
        },
        body: buf,
      });
      if (res.status === 308) {
        // resumable protocol: 308 = keep going, Range tells us what landed
        const range = res.headers.get('range');
        const done = range ? Number(range.split('-')[1]) + 1 : offset + len;
        offset = done;
        log(`  uploaded ${((offset / size) * 100).toFixed(1)}%`);
        continue;
      }
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`upload chunk failed (${res.status}): ${t.slice(0, 300)}`);
      }
      const j = await res.json();
      videoId = j.id;
      offset = size;
      log(`  upload complete: id=${videoId}`);
    }
    if (!videoId) throw new Error('upload finished without a video id');
    return { videoId, resource };
  } finally {
    fs.closeSync(fd);
  }
}

/** Set the custom thumbnail (PNG < 2MB). */
export async function setThumbnail({ videoId, imageFile, accessToken, fetchImpl = fetch }) {
  if (fs.statSync(imageFile).size > 2 * 1024 * 1024) throw new Error('thumbnail exceeds 2MB');
  const res = await fetchImpl(`${UPLOAD}/thumbnails/set?videoId=${encodeURIComponent(videoId)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'image/png' },
    body: fs.readFileSync(imageFile),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`thumbnail set failed (${res.status}): ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

/** Server-side truth for the upload: status, processing, privacy. */
export async function getVideoStatus({ videoId, accessToken, fetchImpl = fetch }) {
  const res = await fetchImpl(`${API}/videos?part=snippet,status,processingDetails&id=${encodeURIComponent(videoId)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`status check failed (${res.status})`);
  const item = j.items?.[0];
  if (!item) throw new Error('video not found (deleted or not owned by this channel)');
  return {
    videoId: item.id,
    title: item.snippet?.title,
    privacyStatus: item.status?.privacyStatus,
    uploadStatus: item.status?.uploadStatus,
    processingStatus: item.status?.processingDetails?.processingStatus,
    publishAt: item.status?.publishAt || null,
    url: `https://www.youtube.com/watch?v=${item.id}`,
  };
}

/**
 * Full publish path with verification. Returns a structured, honest result:
 * 'uploaded' | 'not_configured' | 'blocked'. Never invents success.
 */
export async function publishVideo({
  file, thumbnail, meta, allowPublic = false, dryRun = false, log = () => {}, fetchImpl = fetch,
}) {
  const privacy = enforcePrivacy(meta.privacyStatus, { allowPublic });
  const creds = loadCredentials();
  const started = Date.now();

  if (!creds) {
    const result = {
      ok: false, status: 'not_configured', privacy,
      reason: 'no YouTube credentials: set YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN (or data/youtube_credentials.json)',
      wouldUpload: { file, thumbnail, resource: videoResource({ ...meta, privacyStatus: privacy }) },
    };
    logRun({ type: 'publish', at: new Date().toISOString(), ...result, file, videoId: null });
    return result;
  }
  if (dryRun) {
    const result = {
      ok: true, status: 'dry_run', privacy,
      wouldUpload: { file, thumbnail, resource: videoResource({ ...meta, privacyStatus: privacy }) },
    };
    logRun({ type: 'publish', at: new Date().toISOString(), ...result, file, videoId: null });
    return result;
  }

  const { accessToken } = await refreshAccessToken(creds, { fetchImpl });
  log('  authenticated (OAuth 2.0 refresh-token flow)');
  const { videoId } = await uploadVideo({ file, meta: { ...meta, privacyStatus: privacy }, accessToken, fetchImpl, log });
  let thumbResult = null, status = null;
  if (thumbnail && fs.existsSync(thumbnail)) {
    try { thumbResult = await setThumbnail({ videoId, imageFile: thumbnail, accessToken, fetchImpl }); }
    catch (e) { thumbResult = { error: e.message }; }
  }
  // verify from the server, not from our own optimistic state
  for (let i = 0; i < 10; i++) {
    status = await getVideoStatus({ videoId, accessToken, fetchImpl });
    if (status.processingStatus === 'succeeded' || status.uploadStatus === 'processed') break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  const result = {
    ok: true, status: 'uploaded', privacy, videoId, thumbnail: thumbResult, video: status,
    url: status?.url, elapsedMs: Date.now() - started,
  };
  logRun({ type: 'publish', at: new Date().toISOString(), ...result, file });
  return result;
}
