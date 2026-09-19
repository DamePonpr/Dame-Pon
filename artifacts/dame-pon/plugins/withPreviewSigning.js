const { withAppBuildGradle } = require('@expo/config-plugins');

const SIGNING_CONFIG = `
    dameponPreview {
        storeFile file("dame-pon-preview.keystore")
        storePassword "damepon-preview"
        keyAlias "damepon-preview"
        keyPassword "damepon-preview"
    }
`;

module.exports = function withPreviewSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('Dame Pon preview signing requires a Groovy Android build.gradle.');
    }

    let gradle = modConfig.modResults.contents;
    if (!gradle.includes('dameponPreview')) {
      gradle = gradle.replace(
        /signingConfigs\s*\{/,
        (match) => `${match}\n${SIGNING_CONFIG}`,
      );
    }

    gradle = gradle.replace(
      /signingConfig\s+signingConfigs\.debug/,
      'signingConfig signingConfigs.dameponPreview',
    );

    modConfig.modResults.contents = gradle;
    return modConfig;
  });
};