# Setup Echo

[![CI](https://github.com/echolang/setup-echo/actions/workflows/ci.yml/badge.svg)](https://github.com/echolang/setup-echo/actions/workflows/ci.yml)

Every Echo library's CI was going to copy the same download, unpack, put-it-on-`PATH` dance. This action is that dance, once.

It installs a released `echoc` and `epm` and leaves the rest of the job to you.

```yaml
- uses: actions/checkout@v5
- uses: echolang/setup-echo@v1
  with:
    version: v0.3.0
- run: echoc test
```

Pin `version`. `latest` moves. A library CI that does not pin will change compiler overnight and then you get to debug a language change in a pull request about windows.

## What you get

Unix archives are two binaries. They land in `~/.echo/bin`, which is added to `PATH`.

The Windows zip is a toolchain: `echoc.exe`, `epm.exe`, `clang`, `lld-link`, plus `lib/` and `sysroot/`. The action unpacks the whole tree, not just the two executables, because `echoc build` needs the siblings.

`echoc run` does not need a linker. `echoc build` shells out to `clang`. macOS runners already have one. The Windows archive ships one. On Linux the action installs the distro `clang` package unless you turn that off.

## A library workflow

The action does not check out your repo, does not run `epm install`, and does not know about X11 or libcurl headers. Those stay in the workflow. A typical matrix looks like this:

```yaml
name: CI

on:
  push:
    branches: [master, main]
  pull_request:

jobs:
  build-test:
    name: ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [macos-15, ubuntu-24.04, windows-2022]
    steps:
      - uses: actions/checkout@v5
      - uses: echolang/setup-echo@v1
        with:
          version: v0.3.0
      - name: Linux headers the library needs
        if: runner.os == 'Linux'
        run: sudo apt-get update && sudo apt-get install -y libx11-dev
      - run: echoc test
```

Drop the extra `apt-get` step when the library has no native headers of its own.

## Releasing a library

The install action does not cut releases. That would fire from every CI matrix cell, which is a bad time.

This repo also has a reusable workflow for that. It patch-bumps `#[version:]` in `module.eco`, opens a release PR, and when you merge that PR it tags `vX.Y.Z` and creates the GitHub release.

```yaml
name: release

on:
  push:
    branches: [master, main]

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  release:
    uses: echolang/setup-echo/.github/workflows/release.yml@v1
    with:
      changelog: true
```

Keep this out of the test workflow. Test workflows often cancel in-progress runs, and that is a bad moment to be tagging.

`changelog: true` writes `CHANGELOG.md` on the release PR. Set it to `false` if you do not want that file. The GitHub release still happens.

The version line in `module.eco` needs the marker release-please looks for:

```echo
#[version: "0.1.0"] // x-release-please-version
```

Without it, the tag moves and `#[version:]` does not.

Under Settings, Actions, General, enable "Allow GitHub Actions to create and approve pull requests". The default `GITHUB_TOKEN` cannot open the release PR without that.

To force a minor or major, put `Release-As: 0.2.0` in a commit body.

## Inputs

| Input | Default | Meaning |
|---|---|---|
| `version` | `latest` | Release tag (`v0.3.0` or `0.3.0`) or `latest`. `latest` is resolved to a concrete tag so the cache key is stable for that run. |
| `cache` | `true` | Cache the downloaded archive. The Windows zip is hundreds of megabytes, so this is on by default. |
| `token` | `${{ github.token }}` | Used only to resolve `latest`. The archive itself is a public release URL. |
| `install-clang` | `true` | Install `clang` on Linux. No-op on macOS and Windows. |

## Outputs

| Output | Meaning |
|---|---|
| `version` | The tag that was actually installed (`v0.3.0`, never `latest`) |
| `echo-dir` | Directory that was put on `PATH` |

```yaml
- uses: echolang/setup-echo@v1
  id: echo
  with:
    version: latest
- run: echo "running ${{ steps.echo.outputs.version }}"
```

## Platforms

Same list as the [Echo installers](https://github.com/echolang/echo):

| Runner | Archive |
|---|---|
| macOS arm64 | `echo-macos-arm64.tar.gz` |
| Linux x86_64 | `echo-linux-x86_64.tar.gz` |
| Windows x86_64 | `echo-windows-x86_64.zip` |

Anything else fails with a message telling you to build from source. The action does not compile the compiler.

## Releases

Echo itself lives at [echolang/echo](https://github.com/echolang/echo). The tags you pass as `version` are Echo's tags, not this repository's.
