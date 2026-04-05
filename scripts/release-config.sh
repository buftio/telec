#!/usr/bin/env bash

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

package_json_value() {
  local key="$1"

  awk -F '"' -v target="$key" '$2 == target { print $4; exit }' "$ROOT/package.json"
}

export TELEC_APP_NAME="telec"
export TELEC_VERSION="$(package_json_value version)"
export TELEC_RELEASE_TAG="v${TELEC_VERSION}"
export TELEC_HOMEBREW_TAP_REPOSITORY_DEFAULT="buftio/homebrew-tap"
