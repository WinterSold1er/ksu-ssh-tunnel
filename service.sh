#!/system/bin/sh
# =============================================================================
# KSU SSH Tunnel — KernelSU late_start service entrypoint
# =============================================================================

MODDIR=$(cd "${0%/*}" && pwd)
export MODDIR
export PATH="/data/adb/ksu/bin:/data/adb:/system/bin:/system/xbin:$PATH"

[ -f "$MODDIR/disable" ] && exit 0

start_service() {
    local config_file="${MODDIR}/tunnels.json"
    local manager_script="${MODDIR}/scripts/manager.sh"

    # Check autostart setting
    if [ -f "$config_file" ]; then
        local autostart
        autostart=$(jq -r '.settings.autostart // true' "$config_file" 2>/dev/null)
        if [ "$autostart" = "false" ]; then
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] Autostart disabled in settings." >> "${MODDIR}/logs/service.log" 2>/dev/null
            return 0
        fi
    fi

    # Wait up to 60s for SSH module and network
    local timeout=60
    local elapsed=0
    local test_host
    test_host=$(jq -r '.tunnels[0].remote_host // "100.92.178.83"' "$config_file" 2>/dev/null || echo "100.92.178.83")

    while [ $elapsed -lt $timeout ]; do
        if [ -d "/data/adb/modules/ssh" ] && [ -x "/system/bin/ssh" ] && ping -c 1 -W 2 "$test_host" >/dev/null 2>&1; then
            break
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done

    if [ -x "$manager_script" ]; then
        "$manager_script" start-all
        "$manager_script" update-prop
    fi
}

start_service &
