#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/release-config.sh"

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required to validate the generated formula." >&2
  exit 1
fi

FORMULA_PATH="${1:-$ROOT/.local/releases/${TELEC_RELEASE_TAG}/telec.rb}"
VALIDATION_TAP_NAME="${TELEC_HOMEBREW_VALIDATION_TAP_NAME:-local/telec-audit}"
TMP_ROOT="$ROOT/.local/tmp"

if [[ ! -f "$FORMULA_PATH" ]]; then
  echo "Formula not found: $FORMULA_PATH" >&2
  exit 1
fi

mkdir -p "$TMP_ROOT"
TMP_TAP_DIR="$(mktemp -d "$TMP_ROOT/homebrew-formula-validate.XXXXXX")"

cleanup() {
  brew untap "$VALIDATION_TAP_NAME" >/dev/null 2>&1 || true
  rm -rf "$TMP_TAP_DIR"
}

trap cleanup EXIT

mkdir -p "$TMP_TAP_DIR/Formula"
cp "$FORMULA_PATH" "$TMP_TAP_DIR/Formula/${TELEC_APP_NAME}.rb"

(
  cd "$TMP_TAP_DIR"
  git init -q
  git add .
  git -c user.name="telec release bot" \
    -c user.email="releases@telec.invalid" \
    commit -qm "Validate generated Homebrew tap"
)

brew untap "$VALIDATION_TAP_NAME" >/dev/null 2>&1 || true
HOMEBREW_NO_AUTO_UPDATE=1 brew tap --custom-remote "$VALIDATION_TAP_NAME" "$TMP_TAP_DIR" >/dev/null
HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_FROM_API=1 brew style --formula "${VALIDATION_TAP_NAME}/${TELEC_APP_NAME}"
HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_FROM_API=1 brew audit --strict --formula "${VALIDATION_TAP_NAME}/${TELEC_APP_NAME}"
