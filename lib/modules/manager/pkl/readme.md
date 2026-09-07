Renovate updates [Pkl](https://pkl-lang.org/) dependencies which are referenced by an absolute `package://` URI in a `.pkl` file, whether in an `amends`, `extends` or `import` clause, or in an `import` expression:

```pkl
amends "package://github.com/jdx/hk/releases/download/v1.58.1/hk@1.58.1#/Config.pkl"
import "package://pkg.pkl-lang.org/pkl-pantry/pkl.toml@1.0.3#/toml.pkl"
```

Renovate resolves both forms to GitHub releases:

- URIs pointing at a GitHub release asset are looked up in that repository, with the release tag mapped back onto the version in the URI
- URIs on the `pkg.pkl-lang.org` registry are looked up in the repository the registry redirects to: the one named in the URI for third-party packages, or Apple's repository for the project otherwise

Renovate skips:

- package URIs on any other host, because it cannot discover which versions exist
- URIs which pin a checksum with `::sha256:`, because updating the version would invalidate it
- dependencies declared in a `PklProject` file, and the short-form imports (like `@myPackage/Foo.pkl`) which resolve through them, because `PklProject.deps.json` would have to be regenerated in the same commit
