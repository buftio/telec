#!/usr/bin/env bash

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

package_json_value() {
  local key="$1"

  awk -F '"' -v target="$key" '$2 == target { print $4; exit }' "$ROOT/package.json"
}

homebrew_tap_name_for_repository() {
  local owner="${1%%/*}"
  local repository="${1#*/}"

  if [[ "$repository" == homebrew-* ]]; then
    repository="${repository#homebrew-}"
  fi

  echo "${owner}/${repository}"
}

export TELEC_APP_NAME="telec"
export TELEC_HOMEPAGE_URL="https://github.com/buftio/telec"
export TELEC_VERSION="$(package_json_value version)"
export TELEC_RELEASE_TAG="v${TELEC_VERSION}"
export TELEC_HOMEBREW_TAP_REPOSITORY_DEFAULT="buftio/homebrew-tap"
export TELEC_HOMEBREW_TAP_NAME_DEFAULT="$(homebrew_tap_name_for_repository "$TELEC_HOMEBREW_TAP_REPOSITORY_DEFAULT")"
