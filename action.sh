#!/system/bin/sh
# =============================================================================
# KSU SSH Tunnel — KernelSU Manager Action Script (Toggle All Tunnels)
# =============================================================================

MODDIR=$(cd "${0%/*}" && pwd)
export MODDIR
export PATH="/data/adb/ksu/bin:/data/adb:/system/bin:/system/xbin:$PATH"

MANAGER_SCRIPT="${MODDIR}/scripts/manager.sh"
CONFIG_FILE="${MODDIR}/tunnels.json"
RUN_DIR="${MODDIR}/run"

toast() {
    if command -v ksud >/dev/null 2>&1; then
        ksud toast "$1" 2>/dev/null || true
    elif [ -x /data/adb/ksud ]; then
        /data/adb/ksud toast "$1" 2>/dev/null || true
    fi
    echo "$1"
}

is_any_running() {
    for f in "$RUN_DIR"/*.pid; do
        [ ! -f "$f" ] && continue
        case "$f" in
            *.ssh.pid) continue ;;
            *)
                local pid
                pid=$(cat "$f" 2>/dev/null)
                if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                    return 0
                fi
                ;;
        esac
    done
    if pgrep -f "manager.sh worker" >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

if is_any_running; then
    "$MANAGER_SCRIPT" stop-all
    toast "KSU SSH Tunnel Stopped"
else
    "$MANAGER_SCRIPT" start-all
    toast "KSU SSH Tunnel Started"
fi
