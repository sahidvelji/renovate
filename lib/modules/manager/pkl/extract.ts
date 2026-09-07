import { newlineRegex, regEx } from '../../../util/regex.ts';
import { GithubReleasesDatasource } from '../../datasource/github-releases/index.ts';
import type { PackageDependency, PackageFileContent } from '../types.ts';

const packageUriPrefix = 'package://';

// A module URI in an `amends`, `extends` or `import` clause, or in an `import`
// expression. The fragment (`#/Config.pkl`) is part of the match, so each
// occurrence gets its own `replaceString`.
const moduleUriRegex = regEx(
  /(?:^\s*(?:amends|extends|import\*?)\s+|\bimport\*?\s*\(\s*)"(?<uri>package:\/\/[^"]+)"/g,
);

const commentRegex = regEx(/^\s*\/\//);

interface PackageUri {
  host: string;
  /** Path segments before the version, e.g. `['jdx', 'hk']`. */
  segments: string[];
  /** The last path segment, which names the package. */
  name: string;
  version: string;
  hasChecksum: boolean;
}

/**
 * Splits a package URI following the grammar in the language reference:
 * `'package://' <host> <path> '@' <semver> ['::sha256:' <checksum>] '#' <asset path>`
 */
function parsePackageUri(uri: string): PackageUri | null {
  const withoutScheme = uri.slice(packageUriPrefix.length);
  const [beforeFragment] = withoutScheme.split('#');

  const checksumIndex = beforeFragment.indexOf('::');
  const hasChecksum = checksumIndex !== -1;
  const withoutChecksum = hasChecksum
    ? beforeFragment.slice(0, checksumIndex)
    : beforeFragment;

  // Pkl takes the last `@`, so a path may contain earlier ones.
  const versionIndex = withoutChecksum.lastIndexOf('@');
  if (versionIndex === -1) {
    return null;
  }

  const version = withoutChecksum.slice(versionIndex + 1);
  const [host, ...segments] = withoutChecksum.slice(0, versionIndex).split('/');
  const name = segments.at(-1);
  if (!host || !name || !version) {
    return null;
  }

  return { host, segments, name, version, hasChecksum };
}

/**
 * Builds an `extractVersion` regex which strips whatever the release tag puts
 * around the version, so that `v1.58.1` and `hk@1.58.1` both yield `1.58.1`.
 */
function extractVersionForTag(tag: string, version: string): string | null {
  const versionIndex = tag.indexOf(version);
  if (versionIndex === -1) {
    return null;
  }
  const prefix = RegExp.escape(tag.slice(0, versionIndex));
  const suffix = RegExp.escape(tag.slice(versionIndex + version.length));
  return `^${prefix}(?<version>.+)${suffix}$`;
}

function githubReleaseDependency(
  repository: string,
  name: string,
  tag: string,
  version: string,
): PackageDependency {
  const extractVersion = extractVersionForTag(tag, version);
  if (!extractVersion) {
    // The release tag does not contain the version from the package URI, so we
    // cannot map GitHub releases back onto the version in this file.
    return { depName: name, skipReason: 'unsupported-url' };
  }

  return {
    depName: name,
    packageName: repository,
    currentValue: version,
    datasource: GithubReleasesDatasource.id,
    extractVersion,
  };
}

/**
 * Packages published as a GitHub release asset, e.g.
 * `package://github.com/jdx/hk/releases/download/v1.58.1/hk@1.58.1#/Config.pkl`
 */
function extractGithubPackage(parsed: PackageUri): PackageDependency {
  const [owner, repo, releases, download, tag, name, ...rest] = parsed.segments;
  if (
    releases !== 'releases' ||
    download !== 'download' ||
    !tag ||
    !name ||
    rest.length
  ) {
    return {
      depName: parsed.segments.join('/'),
      skipReason: 'unsupported-url',
    };
  }

  return githubReleaseDependency(`${owner}/${repo}`, name, tag, parsed.version);
}

/**
 * Packages on the pkl-lang.org registry, which redirects to GitHub releases
 * tagged `<name>@<version>`, for example
 * https://pkg.pkl-lang.org/pkl-pantry/pkl.toml@1.0.3 redirects to
 * https://github.com/apple/pkl-pantry/releases/download/pkl.toml@1.0.3/pkl.toml@1.0.3
 */
function extractRegistryPackage(parsed: PackageUri): PackageDependency {
  const { segments, name, version } = parsed;
  const tag = `${name}@${version}`;

  // Third-party packages name their repository, e.g.
  // `github.com/element-hq/pkl-tools/staticcode`.
  if (segments[0] === 'github.com') {
    const [, owner, repo] = segments;
    if (!owner || !repo) {
      return { depName: name, skipReason: 'unsupported-url' };
    }
    return githubReleaseDependency(`${owner}/${repo}`, name, tag, version);
  }

  // Everything else on the registry is one of Apple's own projects, each
  // published from the repository of the same name.
  if (segments.length === 2) {
    return githubReleaseDependency(`apple/${segments[0]}`, name, tag, version);
  }

  return { depName: name, skipReason: 'unsupported-url' };
}

function extractDependency(uri: string): PackageDependency {
  const parsed = parsePackageUri(uri);
  if (!parsed) {
    return { depName: uri, skipReason: 'invalid-value' };
  }

  if (parsed.hasChecksum) {
    // Updating the version would invalidate the checksum pinned in the URI, and
    // Renovate cannot compute the new one.
    return { depName: uri, skipReason: 'unsupported' };
  }

  if (parsed.host === 'github.com') {
    return extractGithubPackage(parsed);
  }

  if (parsed.host === 'pkg.pkl-lang.org') {
    return extractRegistryPackage(parsed);
  }

  return { depName: uri, skipReason: 'unsupported-url' };
}

export function extractPackageFile(content: string): PackageFileContent | null {
  const deps: PackageDependency[] = [];

  for (const line of content.split(newlineRegex)) {
    if (commentRegex.test(line)) {
      continue;
    }
    for (const match of line.matchAll(moduleUriRegex)) {
      const uri = match.groups!.uri;
      deps.push({ ...extractDependency(uri), replaceString: uri });
    }
  }

  if (!deps.length) {
    return null;
  }

  return { deps };
}
