#!/system/bin/sh
# =============================================================================
# KSU SSH Tunnel — Central Manager & Supervisor Script
# =============================================================================

MODDIR=$(cd "${0%/*}/.." && pwd)
export MODDIR
export PATH="/data/adb/ksu/bin:/data/adb:/system/bin:/system/xbin:$PATH"

CONFIG_FILE="${MODDIR}/tunnels.json"
LOGS_DIR="${MODDIR}/logs"
RUN_DIR="${MODDIR}/run"
PROP_FILE="${MODDIR}/module.prop"

mkdir -p "$LOGS_DIR" "$RUN_DIR" 2>/dev/null

log_tunnel() {
    local tid="$1"
    shift
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$tid] $*"
}

is_running() {
    local tid="$1"
    local pid_file="$RUN_DIR/${tid}.pid"
    if [ -f "$pid_file" ]; then
        local pid
        pid=$(cat "$pid_file" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi
    if pgrep -f "manager.sh worker ${tid}$" >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

is_ssh_active() {
    local tid="$1"
    local ssh_pid_file="$RUN_DIR/${tid}.ssh.pid"
    if [ -f "$ssh_pid_file" ]; then
        local pid
        pid=$(cat "$ssh_pid_file" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

update_prop() {
    [ ! -f "$PROP_FILE" ] && return 0
    [ ! -f "$CONFIG_FILE" ] && return 0

    local total active
    total=$(jq '[.tunnels[] | select(.enabled == true)] | length' "$CONFIG_FILE" 2>/dev/null || echo 0)
    active=0

    for tid in $(jq -r '.tunnels[] | select(.enabled == true) | .id' "$CONFIG_FILE" 2>/dev/null); do
        if is_running "$tid"; then
            active=$((active + 1))
        fi
    done

    if [ "$active" -eq 0 ]; then
        sed -Ei 's/^description=(\[[^]]+\][[:space:]]*)?/description=[❌Stopped] /g' "$PROP_FILE"
    else
        sed -Ei "s/^description=(\[[^]]+\][[:space:]]*)?/description=[✅${active}\/${total} Running] /g" "$PROP_FILE"
    fi
}

# --- Tunnel Supervisor Worker ---
run_worker() {
    local tid="$1"
    local log_file="$LOGS_DIR/${tid}.log"
    local pid_file="$RUN_DIR/${tid}.pid"
    local ssh_pid_file="$RUN_DIR/${tid}.ssh.pid"

    echo $$ > "$pid_file"

    local current_ssh_pid=""
    local current_sleep_pid=""

    cleanup() {
        log_tunnel "$tid" "Worker shutting down. Cleaning child processes..."
        if [ -n "$current_ssh_pid" ] && kill -0 "$current_ssh_pid" 2>/dev/null; then
            kill -TERM "$current_ssh_pid" 2>/dev/null
            wait "$current_ssh_pid" 2>/dev/null
        fi
        if [ -n "$current_sleep_pid" ] && kill -0 "$current_sleep_pid" 2>/dev/null; then
            kill "$current_sleep_pid" 2>/dev/null
        fi
        rm -f "$pid_file" "$ssh_pid_file"
        log_tunnel "$tid" "Worker stopped."
        "$0" update-prop >/dev/null 2>&1 || true
        exit 0
    }

    trap cleanup TERM INT HUP QUIT

    if [ ! -f "$CONFIG_FILE" ]; then
        log_tunnel "$tid" "Error: Configuration file $CONFIG_FILE not found."
        rm -f "$pid_file"
        exit 1
    fi

    # Read tunnel parameters from config
    local tunnel_json
    tunnel_json=$(jq -c --arg id "$tid" '.tunnels[] | select(.id == $id)' "$CONFIG_FILE" 2>/dev/null)
    if [ -z "$tunnel_json" ]; then
        log_tunnel "$tid" "Error: Tunnel definition '$tid' not found in config."
        rm -f "$pid_file"
        exit 1
    fi

    local t_type remote_host remote_port remote_user identity_file local_host local_port target_host target_port extra_args
    t_type=$(echo "$tunnel_json" | jq -r '.type // "local"')
    remote_host=$(echo "$tunnel_json" | jq -r '.remote_host // ""')
    remote_port=$(echo "$tunnel_json" | jq -r '.remote_port // 22')
    remote_user=$(echo "$tunnel_json" | jq -r '.remote_user // "root"')
    identity_file=$(echo "$tunnel_json" | jq -r '.identity_file // ""')
    local_host=$(echo "$tunnel_json" | jq -r '.local_host // "127.0.0.1"')
    local_port=$(echo "$tunnel_json" | jq -r '.local_port // 0')
    target_host=$(echo "$tunnel_json" | jq -r '.target_host // "127.0.0.1"')
    target_port=$(echo "$tunnel_json" | jq -r '.target_port // 0')
    extra_args=$(echo "$tunnel_json" | jq -r '.extra_args // ""')

    # Fallback default identity from settings if unset
    if [ -z "$identity_file" ] || [ "$identity_file" = "null" ]; then
        identity_file=$(jq -r '.settings.default_identity // "/data/adb/ssh/root/.ssh/id_ed25519"' "$CONFIG_FILE" 2>/dev/null)
    fi

    local keepalive_interval keepalive_count
    keepalive_interval=$(jq -r '.settings.keepalive_interval // 15' "$CONFIG_FILE" 2>/dev/null)
    keepalive_count=$(jq -r '.settings.keepalive_count_max // 3' "$CONFIG_FILE" 2>/dev/null)

    # Dependency checks
    if [ ! -d "/data/adb/modules/ssh" ]; then
        log_tunnel "$tid" "Error: SSH module /data/adb/modules/ssh not found."
        rm -f "$pid_file"
        exit 1
    fi

    if [ ! -x "/system/bin/ssh" ]; then
        log_tunnel "$tid" "Error: SSH binary /system/bin/ssh not executable."
        rm -f "$pid_file"
        exit 1
    fi

    if [ ! -f "$identity_file" ]; then
        log_tunnel "$tid" "Error: Identity file $identity_file not found."
        rm -f "$pid_file"
        exit 1
    fi

    chmod 700 /data/adb/ssh/root/.ssh 2>/dev/null || true
    chmod 600 "$identity_file" 2>/dev/null || true

    # Assemble forwarding argument
    local forward_arg=""
    case "$t_type" in
        "local")
            forward_arg="-L ${local_host}:${local_port}:${target_host}:${target_port}"
            ;;
        "remote")
            forward_arg="-R ${local_port}:${target_host}:${target_port}"
            ;;
        "dynamic")
            forward_arg="-D ${local_host}:${local_port}"
            ;;
        *)
            log_tunnel "$tid" "Error: Unknown tunnel type '$t_type'."
            rm -f "$pid_file"
            exit 1
            ;;
    esac

    log_tunnel "$tid" "Tunnel worker started ($t_type forward: $forward_arg to $remote_user@$remote_host:$remote_port)."

    local backoff=2
    local max_backoff=60

    while true; do
        # Network ping check
        if ! ping -c 1 -W 2 "$remote_host" >/dev/null 2>&1; then
            log_tunnel "$tid" "Remote host $remote_host unreachable via ping. Retrying in ${backoff}s..."
            sleep $backoff &
            current_sleep_pid=$!
            wait $current_sleep_pid 2>/dev/null
            current_sleep_pid=""
            backoff=$(( backoff * 2 ))
            [ $backoff -gt $max_backoff ] && backoff=$max_backoff
            continue
        fi

        log_tunnel "$tid" "Establishing SSH tunnel to $remote_user@$remote_host..."
        local start_ts
        start_ts=$(date +%s)

        ssh -N \
            -p "$remote_port" \
            -o ServerAliveInterval="$keepalive_interval" \
            -o ServerAliveCountMax="$keepalive_count" \
            -o ExitOnForwardFailure=yes \
            -o StrictHostKeyChecking=accept-new \
            -o BatchMode=yes \
            -i "$identity_file" \
            $forward_arg \
            $extra_args \
            "$remote_user@$remote_host" &

        current_ssh_pid=$!
        echo "$current_ssh_pid" > "$ssh_pid_file"
        log_tunnel "$tid" "SSH process active (PID: $current_ssh_pid)."
        "$0" update-prop >/dev/null 2>&1 || true

        wait $current_ssh_pid 2>/dev/null
        local exit_code=$?
        rm -f "$ssh_pid_file"
        current_ssh_pid=""
        "$0" update-prop >/dev/null 2>&1 || true

        local end_ts
        end_ts=$(date +%s)
        local elapsed=$(( end_ts - start_ts ))

        # Reset backoff if the session lasted > 30s
        if [ $elapsed -gt 30 ]; then
            backoff=2
        fi

        log_tunnel "$tid" "SSH process exited with code $exit_code (ran for ${elapsed}s). Reconnecting in ${backoff}s..."
        sleep $backoff &
        current_sleep_pid=$!
        wait $current_sleep_pid 2>/dev/null
        current_sleep_pid=""

        backoff=$(( backoff * 2 ))
        [ $backoff -gt $max_backoff ] && backoff=$max_backoff
    done
}

start_tunnel() {
    local tid="$1"
    if [ -z "$tid" ]; then
        echo "Error: Tunnel ID required" >&2
        return 1
    fi

    if is_running "$tid"; then
        echo "Tunnel '$tid' is already running."
        return 0
    fi

    local log_file="$LOGS_DIR/${tid}.log"
    nohup "$0" worker "$tid" >> "$log_file" 2>&1 &
    sleep 1
    if is_running "$tid"; then
        echo "Tunnel '$tid' started."
        update_prop
        return 0
    else
        echo "Failed to start tunnel '$tid'." >&2
        update_prop
        return 1
    fi
}

stop_tunnel() {
    local tid="$1"
    if [ -z "$tid" ]; then
        echo "Error: Tunnel ID required" >&2
        return 1
    fi

    local pid_file="$RUN_DIR/${tid}.pid"
    local ssh_pid_file="$RUN_DIR/${tid}.ssh.pid"

    local stopped=0
    if [ -f "$pid_file" ]; then
        local pid
        pid=$(cat "$pid_file" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill -TERM "$pid" 2>/dev/null
            stopped=1
        fi
    fi

    # Also signal worker if found by pgrep
    local pids
    pids=$(pgrep -f "manager.sh worker ${tid}$" 2>/dev/null)
    for p in $pids; do
        kill -TERM "$p" 2>/dev/null
        stopped=1
    done

    # Ensure child SSH is killed
    if [ -f "$ssh_pid_file" ]; then
        local spid
        spid=$(cat "$ssh_pid_file" 2>/dev/null)
        if [ -n "$spid" ] && kill -0 "$spid" 2>/dev/null; then
            kill -TERM "$spid" 2>/dev/null
        fi
    fi

    sleep 1

    # Force kill if still lingering
    if [ -f "$pid_file" ]; then
        local pid
        pid=$(cat "$pid_file" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null
        fi
    fi
    if [ -f "$ssh_pid_file" ]; then
        local spid
        spid=$(cat "$ssh_pid_file" 2>/dev/null)
        if [ -n "$spid" ] && kill -0 "$spid" 2>/dev/null; then
            kill -9 "$spid" 2>/dev/null
        fi
    fi

    rm -f "$pid_file" "$ssh_pid_file"
    update_prop
    echo "Tunnel '$tid' stopped."
    return 0
}

restart_tunnel() {
    local tid="$1"
    stop_tunnel "$tid"
    sleep 1
    start_tunnel "$tid"
}

start_all() {
    if [ ! -f "$CONFIG_FILE" ]; then
        echo "Error: Configuration file $CONFIG_FILE not found." >&2
        return 1
    fi

    local ids
    ids=$(jq -r '.tunnels[] | select(.enabled == true) | .id' "$CONFIG_FILE" 2>/dev/null)
    for tid in $ids; do
        start_tunnel "$tid"
    done
    update_prop
}

stop_all() {
    if [ -f "$CONFIG_FILE" ]; then
        local ids
        ids=$(jq -r '.tunnels[].id' "$CONFIG_FILE" 2>/dev/null)
        for tid in $ids; do
            stop_tunnel "$tid"
        done
    fi

    # Also stop any PID file in run dir
    for f in "$RUN_DIR"/*.pid; do
        [ ! -f "$f" ] && continue
        case "$f" in
            *.ssh.pid) continue ;;
            *)
                local base="${f##*/}"
                local tid="${base%.pid}"
                stop_tunnel "$tid"
                ;;
        esac
    done

    update_prop
}

restart_all() {
    stop_all
    sleep 1
    start_all
}

# --- CLI Dispatcher ---
case "$1" in
    worker)
        run_worker "$2"
        ;;
    start)
        if [ -n "$2" ]; then
            start_tunnel "$2"
        else
            start_all
        fi
        ;;
    stop)
        if [ -n "$2" ]; then
            stop_tunnel "$2"
        else
            stop_all
        fi
        ;;
    restart)
        if [ -n "$2" ]; then
            restart_tunnel "$2"
        else
            restart_all
        fi
        ;;
    start-all)
        start_all
        ;;
    stop-all)
        stop_all
        ;;
    restart-all)
        restart_all
        ;;
    update-prop)
        update_prop
        ;;
    status)
        update_prop
        ;;
    *)
        echo "Usage: $0 {start [id]|stop [id]|restart [id]|start-all|stop-all|restart-all|update-prop|worker <id>}"
        exit 1
        ;;
esac
