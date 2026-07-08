const axios = require('axios');
const semver = require('semver');

async function getLatestPipVersion(pkgName) {
  try {
    const response = await axios.get(`https://pypi.org/pypi/${pkgName}/json`, { timeout: 5000 });
    return response.data.info.version;
  } catch (error) {
    console.error(`Error fetching pip version for ${pkgName}:`, error.message);
    return null;
  }
}

async function getLatestNpmVersion(pkgName) {
  try {
    const response = await axios.get(`https://registry.npmjs.org/${pkgName}/latest`, { timeout: 5000 });
    return response.data.version;
  } catch (error) {
    console.error(`Error fetching npm version for ${pkgName}:`, error.message);
    return null;
  }
}

function compareVersions(current, latest) {
  if (!current || !latest) return 'unknown';
  if (current === latest) return 'up-to-date';
  
  try {
    const diff = semver.diff(current, latest);
    if (!diff) return 'up-to-date';
    if (diff === 'patch') return 'patch';
    if (diff === 'minor') return 'minor';
    if (diff === 'major') return 'major';
    return 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

module.exports = {
  checkPackage: async (pkg) => {
    let latest = null;
    if (pkg.ecosystem === 'pip' || pkg.ecosystem === 'venv' || pkg.ecosystem === 'conda') {
      latest = await getLatestPipVersion(pkg.name);
    } else if (pkg.ecosystem === 'npm' || pkg.ecosystem === 'nvm') {
      latest = await getLatestNpmVersion(pkg.name);
    }
    
    return {
      ...pkg,
      latestVersion: latest,
      status: compareVersions(pkg.installedVersion, latest)
    };
  }
};
