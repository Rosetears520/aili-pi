#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
PACKAGE_SOURCE='npm:@rosetears/aili-pi@latest'
PACKAGE_ID='npm:@rosetears/aili-pi'
MINIMUM_PI_VERSION='0.84.1'
OFFICIAL_INSTALLER_URL='https://pi.dev/install.sh'
UPDATE_PI=0
PI_STATE='existing'
AILI_PREEXISTING='unknown'

say() {
  printf '%s\n' "$1"
}

fail() {
  say "AILI bootstrap: ERROR stage=$1"
  say "pi_state=$PI_STATE"
  say "aili_state=$AILI_PREEXISTING"
  say 'repair=resolve-the-reported-stage-and-rerun-install.sh'
  exit 1
}

usage() {
  say 'Usage: install.sh [--update-pi]'
  say '  --update-pi  update official Pi before compatibility checks'
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --update-pi) UPDATE_PI=1 ;;
    -h|--help) usage; exit 0 ;;
    *) say "AILI bootstrap: unsupported argument: $1"; usage; exit 2 ;;
  esac
  shift
done

case "$(uname -s 2>/dev/null || true)" in
  Linux) PLATFORM='linux' ;;
  Darwin)
    say 'AILI bootstrap: ERROR stage=platform unsupported=macos'
    say 'aili_state=unknown'
    exit 1
    ;;
  *)
    say 'AILI bootstrap: ERROR stage=platform unsupported=native-windows-or-other'
    say 'aili_state=unknown'
    exit 1
    ;;
esac
ARCHITECTURE=$(uname -m 2>/dev/null || true)
case "$ARCHITECTURE" in
  ''|*[!A-Za-z0-9_.-]*) fail 'platform-architecture' ;;
esac

TEMP_DIR=''
cleanup() {
  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
  fi
}
trap cleanup EXIT HUP INT TERM

has_pi() {
  command -v pi >/dev/null 2>&1
}

ensure_temp_dir() {
  if [ -z "$TEMP_DIR" ]; then
    TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/aili-pi-bootstrap.XXXXXX") || fail 'temporary-directory'
    chmod 700 "$TEMP_DIR" || fail 'temporary-directory-permissions'
  fi
}

install_official_pi() {
  PI_STATE='install-attempted'
  ensure_temp_dir
  installer="$TEMP_DIR/pi-install.sh"

  command -v curl >/dev/null 2>&1 || fail 'official-installer-download-tool'
  curl --fail --silent --show-error --location \
    --proto '=https' --proto-redir '=https' \
    --connect-timeout 15 --max-time 120 --max-filesize 1048576 \
    "$OFFICIAL_INSTALLER_URL" -o "$installer" || fail 'official-installer-download'
  chmod 600 "$installer" || fail 'official-installer-permissions'
  sh "$installer" || fail 'official-pi-install'
  hash -r 2>/dev/null || true
  has_pi || fail 'official-pi-executable'
  PI_STATE='installed'
}

version_compatible() {
  version=$1
  minimum=$2
  old_ifs=$IFS
  IFS=.
  set -- $version
  IFS=$old_ifs
  [ "$#" -eq 3 ] || return 1
  major=$1 minor=$2 patch=$3
  case "$major$minor$patch" in *[!0-9]*) return 1 ;; esac
  old_ifs=$IFS
  IFS=.
  set -- $minimum
  IFS=$old_ifs
  min_major=$1 min_minor=$2 min_patch=$3
  [ "$major" -gt "$min_major" ] && return 0
  [ "$major" -lt "$min_major" ] && return 1
  [ "$minor" -gt "$min_minor" ] && return 0
  [ "$minor" -lt "$min_minor" ] && return 1
  [ "$patch" -ge "$min_patch" ]
}

preflight() {
  raw_version=$(pi --version 2>/dev/null) || fail 'pi-version-probe'
  case "$raw_version" in
    *[!0-9.]*|*.*.*.*|'') fail 'pi-version-format' ;;
  esac
  version=$raw_version
  version_compatible "$version" "$MINIMUM_PI_VERSION" || fail 'pi-version-incompatible'

  help=$(pi --help 2>/dev/null) || fail 'pi-api-probe'
  for required in '--extension' '--no-extensions' '--no-skills' '--no-prompt-templates' '--mode' '--no-session' '--print' '--offline' '--list-models'; do
    printf '%s\n' "$help" | grep -E -- "^[[:space:]]*$required([,[:space:]]|$)" >/dev/null \
      || fail 'pi-api-incompatible'
  done

  list_output=$(pi list 2>/dev/null) || fail 'pi-package-resource-probe'
  case "$list_output" in
    *"$PACKAGE_ID"*|*'@rosetears/aili-pi'*) AILI_PREEXISTING='present-before-run' ;;
    *) AILI_PREEXISTING='absent-before-run' ;;
  esac
  ensure_temp_dir
  smoke_extension="$TEMP_DIR/extension-smoke.mjs"
  cat > "$smoke_extension" <<'EOF'
export default function ailiBootstrapPreflight(pi) {
  if (!pi || typeof pi.registerCommand !== "function") throw new Error("extension-api-unavailable");
  pi.registerCommand("aili-bootstrap-preflight", {
    description: "AILI bootstrap compatibility probe",
    handler: async () => undefined,
  });
}
EOF
  chmod 600 "$smoke_extension" || fail 'pi-headless-load-probe'
  PI_OFFLINE=1 pi --offline --no-session --no-extensions --no-skills --no-prompt-templates \
    --extension "$smoke_extension" --list-models '__aili_preflight_no_match__' >/dev/null 2>&1 \
    || fail 'pi-headless-load-probe'
  OBSERVED_PI_VERSION=$version
}

say "AILI bootstrap: platform=$PLATFORM architecture=$ARCHITECTURE"
if ! has_pi; then
  install_official_pi
elif [ "$UPDATE_PI" -eq 1 ]; then
  PI_STATE='update-attempted-possibly-changed'
  pi update --self >/dev/null 2>&1 || fail 'official-pi-update'
  PI_STATE='updated'
fi

preflight
say "AILI bootstrap: preflight=pass pi_version=$OBSERVED_PI_VERSION"

command -v node >/dev/null 2>&1 || fail 'user-global-settings-runtime'
node "$SCRIPT_DIR/merge-global-settings.mjs" --check || fail 'user-global-settings-validate'
node "$SCRIPT_DIR/merge-global-keybindings.mjs" --check || fail 'user-global-keybindings-validate'

if ! pi install "$PACKAGE_SOURCE" >/dev/null 2>&1; then
  say 'AILI bootstrap: ERROR stage=aili-package-install'
  say "pi_state=$PI_STATE"
  if [ "$AILI_PREEXISTING" = 'present-before-run' ]; then
    say 'aili_state=previous-installation-may-remain'
  else
    say 'aili_state=possibly-partial'
  fi
  say "repair=pi install $PACKAGE_SOURCE"
  say "optional_destructive_remove=pi remove $PACKAGE_ID"
  exit 1
fi

node "$SCRIPT_DIR/merge-global-keybindings.mjs" || fail 'user-global-keybindings-merge'
node "$SCRIPT_DIR/merge-global-settings.mjs" || fail 'user-global-settings-merge'
say "AILI bootstrap: success pi_state=$PI_STATE aili_state=installed"
say 'start=pi'
say 'shared_workflows_status=not-run owner=explicit-user-command'
say 'shared_workflows_install_command=npx -y rose-aili@0.4.7 install'
say 'shared_workflows_update_command=npx -y rose-aili@0.4.7 update'
say "pi_package_update_command=pi update $PACKAGE_ID"
say "pi_package_list_command=pi list"
say "pi_package_remove_command=pi remove $PACKAGE_ID"
