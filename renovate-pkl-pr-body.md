## Changes

Adds a `pkl` manager, which updates [Pkl](https://pkl-lang.org/) dependencies referenced by absolute `package://` URIs in `.pkl` files — in `amends`, `extends` and `import` clauses, and in `import` expressions:

```pkl
amends "package://github.com/jdx/hk/releases/download/v1.58.1/hk@1.58.1#/Config.pkl"
import "package://pkg.pkl-lang.org/pkl-pantry/pkl.toml@1.0.3#/toml.pkl"
```

URIs are split following the grammar in the Pkl language reference (`'package://' <host> <path> '@' <semver> ['::sha256:' <checksum>] '#' <asset path>`, taking the last `@` as `PackageUri.java` does), then mapped by host — **no new datasource is required**:

| URI                                                                        | packageName       | notes                                                       |
| -------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------- |
| `package://github.com/<owner>/<repo>/releases/download/<tag>/<name>@<ver>` | `<owner>/<repo>`  | `extractVersion` derived from how the tag wraps the version |
| `package://pkg.pkl-lang.org/github.com/<owner>/<repo>[/<name>]@<ver>`      | `<owner>/<repo>`  | registry 301s here; tag is `<name>@<ver>`                   |
| `package://pkg.pkl-lang.org/<project>/<name>@<ver>`                        | `apple/<project>` | registry 301s here                                          |
| any other host                                                             | —                 | `skipReason: 'unsupported-url'`                             |
| any URI pinning `::sha256:`                                                | —                 | `skipReason: 'unsupported'`                                 |

Checksum-pinned URIs are skipped because bumping the version would invalidate the pinned checksum, which Renovate cannot recompute.

Dependencies declared in a `PklProject` file are deliberately out of scope: updating them requires `PklProject.deps.json` to be regenerated in the same commit, which means running Pkl itself. `managerFilePatterns` of `/\.pkl$/` does not match `PklProject` (it has no extension), so this manager cannot leave a stale lock file behind.

One useful side effect: `hk` is already first-class in the `mise` manager, and this manager emits the same `depName`/`packageName`, so `mise.toml` and `hk.pkl` group into a single PR with no user configuration.

## Context

Please select one of the following:

- [ ] This closes an existing Issue, Closes: #
- [x] This doesn't close an Issue, but I accept the risk that this PR may be closed if maintainers disagree with its opening or implementation

The New Package Manager Questionnaire is completed in discussion [#45740](https://github.com/renovatebot/renovate/discussions/45740).

## AI assistance disclosure

Did you use AI tools to create any part of this pull request?

- [ ] No — I did not use AI for this contribution.
- [ ] Yes — minimal assistance (e.g., IDE autocomplete, small code completions, grammar fixes).
- [x] Yes — substantive assistance (AI-generated non‑trivial portions of code, tests, or documentation).
- [ ] Yes — other (please describe):

The manager code, unit tests, documentation and this description were written with Claude Code (Claude Opus). I reviewed the result before submitting.

### Use of AI in replying to PR comments

Who answers review comments:

- [ ] @username will read and reply directly. **Name the account.**
- [x] An agent will draft replies and @sahidvelji will read them before they are posted.
- [ ] Nobody has explicitly committed to replying.

## Documentation (please check one with an [x])

- [x] I have updated the documentation, or
- [ ] No documentation update is required

## How I've tested my work (please select one)

I have verified these changes via:

- [ ] Code inspection only, or
- [x] Newly added/modified unit tests, or
- [ ] No unit tests, but ran on a real repository, or
- [ ] Both unit tests + ran on a real repository

100% coverage on the new files, plus `pnpm check` and `pnpm type-check` passing.

Beyond unit tests, I ran extraction against `hk.pkl` files taken from public repositories, and a third-party registry consumer:

| Source file                              | depName      | packageName            | currentValue                          |
| ---------------------------------------- | ------------ | ---------------------- | ------------------------------------- |
| `jdx/xx` `hk.pkl`                        | `hk`         | `jdx/hk`               | `1.48.0` (×2 — `amends` and `import`) |
| `jdx/demand` `hk.pkl`                    | `hk`         | `jdx/hk`               | `1.19.0`                              |
| `jdx/mise` `hk.pkl`                      | `hk`         | `jdx/hk`               | `1.55.0`                              |
| `jdx/aube` `hk.pkl`                      | `hk`         | `jdx/hk`               | `1.44.3`                              |
| `element-hq/element-x-ios` `Secrets.pkl` | `staticcode` | `element-hq/pkl-tools` | `1.1.0`                               |
| `apple/pkl-pantry` `yaml.pkl`            | —            | —                      | no package URIs, file dropped         |

I also ran a `--platform=local` dry run on a repository holding an `hk.pkl` pinned at `1.48.0` next to a `mise.toml` pinning `hk = "1.48.0"`. All three dependencies (one from `mise`, two from `pkl`) resolved to `1.58.1` on a single `renovate/hk-1.x` branch. Driving those upgrades through `doAutoReplace` produced:

```pkl
amends "package://github.com/jdx/hk/releases/download/v1.58.1/hk@1.58.1#/Config.pkl"
import "package://github.com/jdx/hk/releases/download/v1.58.1/hk@1.58.1#/Builtins.pkl"
```

confirming that both lines, and both occurrences of the version within each line, are updated.
