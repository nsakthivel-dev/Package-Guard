const axios = require('axios');
const dbHandler = require('./dbHandler');

// In-memory cache for fast repeated lookups
// Key format: `${normalizedEcosystem}:${normalizedName}`
const metadataCache = new Map();

// In-flight promise tracking to prevent duplicate concurrent network requests
const inFlightRequests = new Map();

// Configuration
const SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const NOT_FOUND_TTL_MS = 24 * 60 * 60 * 1000;    // 24 hours
const ERROR_BACKOFF_MS = 60 * 1000;              // 1 minute backoff for network errors
const REQUEST_TIMEOUT_MS = 8000;
const MAX_CONCURRENCY = 4;

function normalizeEcosystem(ecosystem) {
  const eco = String(ecosystem || '').toLowerCase().trim();
  if (eco === 'venv' || eco === 'conda' || eco === 'python' || eco === 'pip') {
    return 'pip';
  }
  if (eco === 'pnpm' || eco === 'yarn' || eco === 'npm') {
    return 'npm';
  }
  return eco || 'unknown';
}

function normalizePackageName(name, ecosystem) {
  if (!name || typeof name !== 'string') return '';
  const trimmed = name.trim();
  const eco = normalizeEcosystem(ecosystem);
  if (eco === 'pip') {
    return trimmed.toLowerCase().replace(/[._]/g, '-');
  }
  return trimmed;
}

function getCacheKey(name, ecosystem) {
  const eco = normalizeEcosystem(ecosystem);
  const normName = normalizePackageName(name, eco);
  return `${eco}:${normName}`;
}

function cleanDescriptionText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw.trim();
  // Remove markdown badges like [![...](...)](...) or [![...](...)]
  text = text.replace(/\[!\[[\s\S]*?\]\([\s\S]*?\)\]\([\s\S]*?\)/g, '');
  text = text.replace(/!\[[\s\S]*?\]\([\s\S]*?\)/g, '');
  text = text.replace(/\[![\s\S]*?\]/g, '');
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Remove headers
  text = text.replace(/^#+\s+/gm, '');
  // Clean markdown links [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');

  // Split into paragraphs and filter out noise/license sections
  const paragraphs = text.split(/\r?\n\s*\r?\n/)
    .map(p => p.trim())
    .filter(p => {
      if (!p) return false;
      const lower = p.toLowerCase();
      if (lower.startsWith('license') || lower.startsWith('table of contents')) return false;
      if (lower.startsWith('---') || lower.startsWith('===')) return false;
      if (lower.startsWith('contributing') || lower.startsWith('authors')) return false;
      return true;
    });

  if (paragraphs.length > 0) {
    const combined = paragraphs.slice(0, 2).join('\n\n').trim();
    if (combined.length > 450) {
      const sentenceEnd = combined.indexOf('.', 300);
      if (sentenceEnd !== -1 && sentenceEnd < 500) {
        return combined.slice(0, sentenceEnd + 1).trim();
      }
      return combined.slice(0, 450).trim() + '…';
    }
    return combined;
  }
  return text.trim();
}

/**
 * Normalizes metadata retrieved from PyPI into standardized schema
 */
function normalizePyPiMetadata(data) {
  const info = data?.info || {};
  
  // 1. Short summary for table row
  let rawSummary = typeof info.summary === 'string' ? info.summary.trim() : '';
  let summary = (rawSummary && rawSummary.toUpperCase() !== 'UNKNOWN') ? cleanDescriptionText(rawSummary) : null;

  // 2. Full description for modal details
  let rawDesc = typeof info.description === 'string' ? info.description.trim() : '';
  let cleanDesc = cleanDescriptionText(rawDesc);
  let description = summary || cleanDesc || null;

  // If summary is missing but cleanDesc exists, use cleanDesc as summary
  if (!summary && cleanDesc) {
    summary = cleanDesc.slice(0, 160);
  }

  // 3. Homepage URL
  let homepage = info.home_page || null;
  if (!homepage || homepage === 'UNKNOWN') {
    const projectUrls = info.project_urls || {};
    homepage = projectUrls.Homepage || projectUrls.Documentation || projectUrls.Source || projectUrls.Repository || null;
  }

  return {
    name: info.name || null,
    version: info.version || null,
    summary,
    description: description || summary,
    homepage,
    status: (summary || description) ? 'loaded' : 'missing'
  };
}

/**
 * Normalizes metadata retrieved from npm into standardized schema
 */
function normalizeNpmMetadata(data) {
  let rawSummary = typeof data?.description === 'string' ? data.description.trim() : null;
  let summary = rawSummary ? cleanDescriptionText(rawSummary) : null;
  let rawReadme = typeof data?.readme === 'string' ? data.readme.trim() : '';
  let cleanReadme = cleanDescriptionText(rawReadme);
  let description = summary || cleanReadme || null;
  let homepage = typeof data?.homepage === 'string' ? data.homepage.trim() : null;

  return {
    name: data?.name || null,
    version: data?.version || null,
    summary,
    description: description || summary,
    homepage,
    status: (summary || description) ? 'loaded' : 'missing'
  };
}

/**
 * Fetches metadata for a single package with concurrency control, deduplication, and caching.
 */
async function fetchPackageMetadata(rawName, rawEcosystem) {
  if (!rawName || typeof rawName !== 'string') {
    return { summary: null, description: null, homepage: null, status: 'missing', timestamp: Date.now() };
  }

  const normEco = normalizeEcosystem(rawEcosystem);
  const normName = normalizePackageName(rawName, normEco);
  const cacheKey = `${normEco}:${normName}`;
  const now = Date.now();

  // 1. Check in-memory cache
  if (metadataCache.has(cacheKey)) {
    const cached = metadataCache.get(cacheKey);
    if (cached.status === 'loaded' && (now - cached.timestamp < SUCCESS_TTL_MS)) {
      return cached;
    }
    if (cached.status === 'not_found' && (now - cached.timestamp < NOT_FOUND_TTL_MS)) {
      return cached;
    }
    if (cached.status === 'error' && (now - cached.timestamp < ERROR_BACKOFF_MS)) {
      return cached;
    }
  }

  // 2. Check local database store first
  const existingInDb = dbHandler.getPackages().find(p => {
    return normalizeEcosystem(p.ecosystem) === normEco && normalizePackageName(p.name, p.ecosystem) === normName;
  });

  if (existingInDb && (existingInDb.description || existingInDb.summary)) {
    const meta = {
      summary: existingInDb.summary || existingInDb.description || null,
      description: existingInDb.description || existingInDb.summary || null,
      homepage: existingInDb.homepageUrl || null,
      status: 'loaded',
      timestamp: now
    };
    metadataCache.set(cacheKey, meta);
    return meta;
  }

  // Handle local/internal package scopes
  if (rawName.startsWith('@internal/') || rawName.startsWith('@local/') || rawName.startsWith('@workspace/')) {
    const notFoundMeta = { summary: null, description: null, homepage: null, status: 'not_found', notFound: true, timestamp: now };
    metadataCache.set(cacheKey, notFoundMeta);
    return notFoundMeta;
  }

  // 3. Deduplicate in-flight requests
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  // 4. Perform network request
  const fetchPromise = (async () => {
    try {
      let metaResult;
      if (normEco === 'pip') {
        const url = `https://pypi.org/pypi/${encodeURIComponent(normName)}/json`;
        const res = await axios.get(url, {
          timeout: REQUEST_TIMEOUT_MS,
          headers: { 'Accept': 'application/json' },
          validateStatus: (status) => (status >= 200 && status < 300) || status === 404
        });

        if (res.status === 404) {
          metaResult = { summary: null, description: null, homepage: null, status: 'not_found', notFound: true, timestamp: Date.now() };
        } else {
          const norm = normalizePyPiMetadata(res.data);
          metaResult = {
            ...norm,
            timestamp: Date.now()
          };
        }
      } else if (normEco === 'npm') {
        const url = `https://registry.npmjs.org/${encodeURIComponent(rawName)}/latest`;
        const res = await axios.get(url, {
          timeout: REQUEST_TIMEOUT_MS,
          headers: { 'Accept': 'application/json' },
          validateStatus: (status) => (status >= 200 && status < 300) || status === 404
        });

        if (res.status === 404) {
          metaResult = { summary: null, description: null, homepage: null, status: 'not_found', notFound: true, timestamp: Date.now() };
        } else {
          const norm = normalizeNpmMetadata(res.data);
          metaResult = {
            ...norm,
            timestamp: Date.now()
          };
        }
      } else {
        metaResult = { summary: null, description: null, homepage: null, status: 'missing', timestamp: Date.now() };
      }

      // Update cache
      metadataCache.set(cacheKey, metaResult);

      // Persist successful metadata back to dbHandler for offline reuse
      if (metaResult.status === 'loaded' && (metaResult.summary || metaResult.description)) {
        try {
          const pkgs = dbHandler.getPackages();
          let changed = false;
          for (const p of pkgs) {
            if (normalizeEcosystem(p.ecosystem) === normEco && normalizePackageName(p.name, p.ecosystem) === normName) {
              if (metaResult.summary && p.summary !== metaResult.summary) {
                p.summary = metaResult.summary;
                changed = true;
              }
              if (metaResult.description && p.description !== metaResult.description) {
                p.description = metaResult.description;
                changed = true;
              }
              if (metaResult.homepage && p.homepageUrl !== metaResult.homepage) {
                p.homepageUrl = metaResult.homepage;
                changed = true;
              }
            }
          }
          if (changed) {
            dbHandler.saveStorage();
          }
        } catch (_) {}
      }

      return metaResult;
    } catch (err) {
      // Mark as temporary network error with backoff
      const errorMeta = {
        summary: null,
        description: null,
        homepage: null,
        status: 'error',
        error: true,
        errorMessage: err.message,
        timestamp: Date.now()
      };
      metadataCache.set(cacheKey, errorMeta);
      return errorMeta;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Batch metadata fetcher with bounded concurrency.
 */
async function batchFetchMetadata(items) {
  if (!Array.isArray(items) || items.length === 0) return {};

  const results = {};
  const queue = [];

  // Deduplicate items
  const seen = new Set();
  for (const item of items) {
    if (!item || !item.name) continue;
    const key = getCacheKey(item.name, item.ecosystem);
    if (!seen.has(key)) {
      seen.add(key);
      queue.push({ name: item.name, ecosystem: item.ecosystem, key });
    }
  }

  // Worker pool with MAX_CONCURRENCY limit
  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      try {
        const meta = await fetchPackageMetadata(task.name, task.ecosystem);
        results[task.key] = meta;
      } catch (err) {
        results[task.key] = {
          summary: null,
          description: null,
          homepage: null,
          status: 'error',
          error: true,
          timestamp: Date.now()
        };
      }
    }
  });

  await Promise.all(workers);
  return results;
}

module.exports = {
  normalizePackageName,
  normalizeEcosystem,
  getCacheKey,
  fetchPackageMetadata,
  batchFetchMetadata,
  normalizePyPiMetadata,
  normalizeNpmMetadata,
};
