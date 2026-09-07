import { codeBlock } from 'common-tags';
import { extractPackageFile } from './extract.ts';

describe('modules/manager/pkl/extract', () => {
  describe('extractPackageFile()', () => {
    it('returns null for a file without package URIs', () => {
      const content = codeBlock`
        amends "pkl/Config.pkl"
        import "@myPackage/Foo.pkl"
      `;
      expect(extractPackageFile(content)).toBeNull();
    });

    it('ignores commented-out clauses', () => {
      const content = codeBlock`
        // amends "package://github.com/jdx/hk/releases/download/v1.58.1/hk@1.58.1#/Config.pkl"
        amends "pkl/Config.pkl"
      `;
      expect(extractPackageFile(content)).toBeNull();
    });

    it('extracts a package published as a GitHub release asset', () => {
      const content =
        'amends "package://github.com/jdx/hk/releases/download/v1.58.1/hk@1.58.1#/Config.pkl"';
      expect(extractPackageFile(content)).toEqual({
        deps: [
          {
            depName: 'hk',
            packageName: 'jdx/hk',
            currentValue: '1.58.1',
            datasource: 'github-releases',
            // `RegExp.escape` writes leading identifier characters as hex
            // escapes, so the `v` tag prefix becomes `\\x76`.
            extractVersion: '^\\x76(?<version>.+)$',
            replaceString:
              'package://github.com/jdx/hk/releases/download/v1.58.1/hk@1.58.1#/Config.pkl',
          },
        ],
      });
    });

    it('extracts every clause in the file', () => {
      const content = codeBlock`
        amends "package://github.com/jdx/hk/releases/download/v1.58.1/hk@1.58.1#/Config.pkl"

        import "package://github.com/jdx/hk/releases/download/v1.58.1/hk@1.58.1#/Builtins.pkl"
      `;
      const res = extractPackageFile(content);
      expect(res?.deps).toHaveLength(2);
      expect(res?.deps[1].replaceString).toEndWith('#/Builtins.pkl');
    });

    it('extracts a package from the pkl-lang.org registry', () => {
      const content =
        'import "package://pkg.pkl-lang.org/pkl-pantry/pkl.toml@1.0.3#/toml.pkl"';
      expect(extractPackageFile(content)).toEqual({
        deps: [
          {
            depName: 'pkl.toml',
            packageName: 'apple/pkl-pantry',
            currentValue: '1.0.3',
            datasource: 'github-releases',
            extractVersion: '^\\x70kl\\.toml\\x40(?<version>.+)$',
            replaceString:
              'package://pkg.pkl-lang.org/pkl-pantry/pkl.toml@1.0.3#/toml.pkl',
          },
        ],
      });
    });

    it('extracts a third-party package from the registry', () => {
      const content =
        'import "package://pkg.pkl-lang.org/github.com/element-hq/pkl-tools/staticcode@1.1.0#/StaticCode.pkl"';
      expect(extractPackageFile(content)?.deps).toEqual([
        {
          depName: 'staticcode',
          packageName: 'element-hq/pkl-tools',
          currentValue: '1.1.0',
          datasource: 'github-releases',
          extractVersion: '^\\x73taticcode\\x40(?<version>.+)$',
          replaceString:
            'package://pkg.pkl-lang.org/github.com/element-hq/pkl-tools/staticcode@1.1.0#/StaticCode.pkl',
        },
      ]);
    });

    it('extracts an import expression', () => {
      const content =
        'birds = import("package://github.com/jdx/hk/releases/download/v1.58.1/hk@1.58.1#/Builtins.pkl")';
      expect(extractPackageFile(content)?.deps[0]).toMatchObject({
        depName: 'hk',
        packageName: 'jdx/hk',
        currentValue: '1.58.1',
      });
    });

    it('extracts a registry package which does not name a sub-package', () => {
      const content =
        'amends "package://pkg.pkl-lang.org/github.com/jdx/hk@1.58.1#/Config.pkl"';
      expect(extractPackageFile(content)?.deps[0]).toMatchObject({
        depName: 'hk',
        packageName: 'jdx/hk',
        currentValue: '1.58.1',
        extractVersion: '^\\x68k\\x40(?<version>.+)$',
      });
    });

    it('skips a URI which pins a checksum', () => {
      const content =
        'amends "package://github.com/jdx/hk/releases/download/v1.58.1/hk@1.58.1::sha256:abc123#/Config.pkl"';
      expect(extractPackageFile(content)?.deps[0]).toMatchObject({
        skipReason: 'unsupported',
      });
    });

    it('skips a URI without a version', () => {
      const content = 'amends "package://example.com/foo#/Foo.pkl"';
      expect(extractPackageFile(content)?.deps[0]).toMatchObject({
        skipReason: 'invalid-value',
      });
    });

    it('skips a GitHub URI which is not a release asset', () => {
      const content =
        'amends "package://github.com/jdx/hk/blob/main/hk@1.58.1#/Config.pkl"';
      expect(extractPackageFile(content)?.deps[0]).toMatchObject({
        skipReason: 'unsupported-url',
      });
    });

    it('skips packages on unsupported hosts', () => {
      const content = 'import "package://example.com/foo/bar@1.0.0#/Bar.pkl"';
      expect(extractPackageFile(content)?.deps).toEqual([
        {
          depName: 'package://example.com/foo/bar@1.0.0#/Bar.pkl',
          skipReason: 'unsupported-url',
          replaceString: 'package://example.com/foo/bar@1.0.0#/Bar.pkl',
        },
      ]);
    });

    it.each`
      uri                                                         | skipReason
      ${'package://example.com@1.0.0#/Foo.pkl'}                   | ${'invalid-value'}
      ${'package:///foo@1.0.0#/Foo.pkl'}                          | ${'invalid-value'}
      ${'package://example.com/foo@#/Foo.pkl'}                    | ${'invalid-value'}
      ${'package://pkg.pkl-lang.org/github.com/jdx@1.0.0#/F.pkl'} | ${'unsupported-url'}
      ${'package://pkg.pkl-lang.org/a/b/c@1.0.0#/F.pkl'}          | ${'unsupported-url'}
    `('skips malformed URI $uri', ({ uri, skipReason }) => {
      const content = `amends "${uri}"`;
      expect(extractPackageFile(content)?.deps[0]).toMatchObject({
        skipReason,
      });
    });

    it('skips a release tag which does not contain the version', () => {
      const content =
        'amends "package://github.com/foo/bar/releases/download/latest/bar@1.0.0#/Bar.pkl"';
      expect(extractPackageFile(content)?.deps[0]).toMatchObject({
        depName: 'bar',
        skipReason: 'unsupported-url',
      });
    });
  });
});
