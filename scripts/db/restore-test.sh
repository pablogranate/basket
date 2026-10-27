#!/usr/bin/env bash
# Moved to scripts/backup/restore-test.sh. Kept so root's old crontab line still runs until
# it is replaced by scripts/backup/nightly.sh (docs/runbooks/backups.md); delete then.
exec "$(dirname "${BASH_SOURCE[0]}")/../backup/restore-test.sh" "$@"
