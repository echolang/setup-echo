#!/usr/bin/env bash
# resolve an Echo release tag and the matching platform archive.
# writes `version` and `asset` to GITHUB_OUTPUT.
#
# env:
#   INPUT_VERSION  tag (v0.3.0 / 0.3.0) or `latest` (default latest)
#   INPUT_TOKEN    GitHub token, used only to resolve `latest`
#   RUNNER_OS / RUNNER_ARCH  set by GitHub Actions; uname is the fallback

set -euo pipefail

REPO="echolang/echo"
version="${INPUT_VERSION:-latest}"

if [ -z "${RUNNER_OS:-}" ] || [ -z "${RUNNER_ARCH:-}" ]; then
    case "$(uname -s)-$(uname -m)" in
        Darwin-arm64)  RUNNER_OS=macOS;   RUNNER_ARCH=ARM64 ;;
        Linux-x86_64)  RUNNER_OS=Linux;   RUNNER_ARCH=X64 ;;
        MINGW*|MSYS*|CYGWIN*)
            echo "echo: resolve.sh needs RUNNER_OS/RUNNER_ARCH on Windows." >&2
            exit 1
            ;;
        *)
            echo "echo: no prebuilt Echo for $(uname -s) $(uname -m)." >&2
            echo "build it from source instead: https://github.com/${REPO}" >&2
            exit 1
            ;;
    esac
fi

case "${RUNNER_OS}-${RUNNER_ARCH}" in
    macOS-ARM64)   asset="echo-macos-arm64.tar.gz" ;;
    Linux-X64)     asset="echo-linux-x86_64.tar.gz" ;;
    Windows-X64)   asset="echo-windows-x86_64.zip" ;;
    *)
        echo "echo: no prebuilt Echo for ${RUNNER_OS} ${RUNNER_ARCH}." >&2
        echo "build it from source instead: https://github.com/${REPO}" >&2
        exit 1
        ;;
esac

if [ "${version}" = "latest" ]; then
    api_url="https://api.github.com/repos/${REPO}/releases/latest"
    curl_args=(-fsSL -H "Accept: application/vnd.github+json" -H "User-Agent: echolang-setup-echo")
    if [ -n "${INPUT_TOKEN:-}" ]; then
        curl_args+=(-H "Authorization: Bearer ${INPUT_TOKEN}")
    fi
    if ! json="$(curl "${curl_args[@]}" "${api_url}")"; then
        echo "echo: could not resolve the latest Echo release from ${api_url}" >&2
        exit 1
    fi
    tag="$(printf '%s' "${json}" | python3 -c "import json,sys; print(json.load(sys.stdin)['tag_name'])")"
    if [ -z "${tag}" ]; then
        echo "echo: latest release response had no tag_name." >&2
        exit 1
    fi
else
    case "${version}" in
        v*) tag="${version}" ;;
        *)  tag="v${version}" ;;
    esac
fi

echo "resolved Echo ${tag} (${asset})"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
    {
        echo "version=${tag}"
        echo "asset=${asset}"
    } >> "${GITHUB_OUTPUT}"
fi
