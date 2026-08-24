#!/usr/bin/env bash
# download (unless cached) and unpack a unix Echo archive, then put it on PATH.
#
# env:
#   ECHO_VERSION  resolved tag, e.g. v0.3.0
#   ECHO_ASSET    archive filename, e.g. echo-macos-arm64.tar.gz
#   RUNNER_TEMP   download cache directory parent
#   GITHUB_PATH / GITHUB_OUTPUT  set by Actions

set -euo pipefail

REPO="echolang/echo"

if [ -z "${ECHO_VERSION:-}" ] || [ -z "${ECHO_ASSET:-}" ]; then
    echo "echo: ECHO_VERSION and ECHO_ASSET must be set." >&2
    exit 1
fi

dl="${RUNNER_TEMP:-/tmp}/echo-dl"
bin="${HOME}/.echo/bin"
archive="${dl}/${ECHO_ASSET}"
url="https://github.com/${REPO}/releases/download/${ECHO_VERSION}/${ECHO_ASSET}"

mkdir -p "${dl}" "${bin}"

if [ ! -f "${archive}" ]; then
    echo "downloading ${ECHO_ASSET} ..."
    if ! curl -fsSL -o "${archive}.partial" "${url}"; then
        rm -f "${archive}.partial"
        echo "echo: could not download ${url}" >&2
        echo "see https://github.com/${REPO}/releases for what is available." >&2
        exit 1
    fi
    mv "${archive}.partial" "${archive}"
else
    echo "using cached ${ECHO_ASSET}"
fi

tar -xzf "${archive}" -C "${bin}"

if [ ! -f "${bin}/echoc" ] || [ ! -f "${bin}/epm" ]; then
    echo "echo: the downloaded archive does not contain echoc and epm." >&2
    exit 1
fi

chmod +x "${bin}/echoc" "${bin}/epm"

if [ -n "${GITHUB_PATH:-}" ]; then
    echo "${bin}" >> "${GITHUB_PATH}"
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "echo-dir=${bin}" >> "${GITHUB_OUTPUT}"
fi

echo "installed echoc ${bin}/echoc"
echo "installed epm ${bin}/epm"
