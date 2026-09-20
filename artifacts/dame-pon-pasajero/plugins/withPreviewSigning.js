const { withAppBuildGradle } = require('@expo/config-plugins');

function findMatchingBrace(contents, openingBraceIndex) {
  let depth = 0;
  for (let index = openingBraceIndex; index < contents.length; index += 1) {
    if (contents[index] === '{') depth += 1;
    if (contents[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

module.exports = function withPreviewSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('Dame Pon preview signing requires a Groovy Android build.gradle.');
    }

    const gradle = modConfig.modResults.contents;
    const buildTypesMatch = /\bbuildTypes\s*\{/.exec(gradle);
    if (!buildTypesMatch) {
      throw new Error('Dame Pon preview signing requires a buildTypes block.');
    }

    const releaseMatch = /\brelease\s*\{/.exec(
      gradle.slice(buildTypesMatch.index + buildTypesMatch[0].length),
    );
    if (!releaseMatch) {
      throw new Error('Dame Pon preview signing requires a release build type.');
    }

    const releaseStart =
      buildTypesMatch.index +
      buildTypesMatch[0].length +
      releaseMatch.index;
    const openingBrace = gradle.indexOf('{', releaseStart);
    const releaseEnd = findMatchingBrace(gradle, openingBrace);
    if (openingBrace < 0 || releaseEnd < 0) {
      throw new Error('Dame Pon preview signing could not parse the release build type.');
    }

    const releaseBlock = gradle.slice(releaseStart, releaseEnd + 1);
    const signingConfigPattern = /signingConfig\s+signingConfigs\.\w+/;
    const updatedReleaseBlock = signingConfigPattern.test(releaseBlock)
      ? releaseBlock.replace(signingConfigPattern, 'signingConfig signingConfigs.debug')
      : releaseBlock.replace(
          /\{/,
          '{\n            signingConfig signingConfigs.debug',
        );

    modConfig.modResults.contents =
      gradle.slice(0, releaseStart) +
      updatedReleaseBlock +
      gradle.slice(releaseEnd + 1);
    return modConfig;
  });
};