const { withAppBuildGradle } = require('@expo/config-plugins');

function replaceOrInsertVersion(contents, pattern, line) {
  if (pattern.test(contents)) {
    return contents.replace(pattern, `        ${line}`);
  }

  if (!/defaultConfig\s*\{/.test(contents)) {
    throw new Error('Dame Pon preview versioning requires a defaultConfig block.');
  }

  return contents.replace(
    /(defaultConfig\s*\{)/,
    `$1\n        ${line}`,
  );
}

module.exports = function withPreviewBuildVersion(config) {
  const runNumber = Number(process.env.GITHUB_RUN_NUMBER);
  if (!Number.isInteger(runNumber) || runNumber < 1) return config;

  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('Dame Pon preview versioning requires a Groovy Android build.gradle.');
    }

    let gradle = modConfig.modResults.contents;
    gradle = replaceOrInsertVersion(gradle, /^\s*versionCode\s+.*$/m, `versionCode ${runNumber}`);
    gradle = replaceOrInsertVersion(gradle, /^\s*versionName\s+.*$/m, `versionName "1.0.${runNumber}"`);
    modConfig.modResults.contents = gradle;
    return modConfig;
  });
};