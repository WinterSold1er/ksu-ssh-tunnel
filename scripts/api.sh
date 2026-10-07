#!/system/bin/sh
# =============================================================================
# KSU SSH Tunnel — JSON API CLI Interface for WebUI & Scripts
# =============================================================================

MODDIR=$(cd "${0%/*}/.." && pwd)
export MODDIR
export PATH="/data/adb/ksu/bin:/data/adb:/system/bin:/system/xbin:$PATH"

CONFIG_FILE="${MODDIR}/tunnels.json"
LOGS_DIR="${MODDIR}/logs"
RUN_DIR="${MODDIR}/run"
MANAGER_SCRIPT="${MODDIR}/scripts/manager.sh"

cmd_status() {
    local ssh_ready=false
    if [ -d "/data/adb/modules/ssh" ] && [ -x "/system/bin/ssh" ]; then
        ssh_ready=true
    fi

    if [ ! -f "$CONFIG_FILE" ]; then
        jq -n --argjson ssh_ready "$ssh_ready" '{
            running: false,
            total: 0,
            active: 0,
            ssh_ready: $ssh_ready,
            settings: {},
            tunnels: []
        }'
        return 0
    fi

    local runtime_entries=""
    for tid in $(jq -r '.tunnels[].id' "$CONFIG_FILE" 2>/dev/null); do
        local r=false s=false p="null" sp="null"
        if [ -f "$RUN_DIR/${tid}.pid" ]; then
            local val
            val=$(cat "$RUN_DIR/${tid}.pid" 2>/dev/null)
            if [ -n "$val" ] && kill -0 "$val" 2>/dev/null; then
                r=true; p=$val
            fi
        fi
        if [ -f "$RUN_DIR/${tid}.ssh.pid" ]; then
            local val
            val=$(cat "$RUN_DIR/${tid}.ssh.pid" 2>/dev/null)
            if [ -n "$val" ] && kill -0 "$val" 2>/dev/null; then
                s=true; sp=$val
            fi
        fi
        runtime_entries="${runtime_entries}\"${tid}\":{\"running\":$r,\"ssh_active\":$s,\"pid\":$p,\"ssh_pid\":$sp},"
    done
    runtime_entries="{${runtime_entries%,}}"

    jq --argjson runtime "$runtime_entries" \
       --argjson ssh_ready "$ssh_ready" '
    {
      running: ([.tunnels[] | select($runtime[.id].running == true)] | length > 0),
      total: (.tunnels | length),
      active: ([.tunnels[] | select($runtime[.id].running == true)] | length),
      ssh_ready: $ssh_ready,
      settings: (.settings // {}),
      tunnels: [
        .tunnels[] | . + ($runtime[.id] // { running: false, ssh_active: false, pid: null, ssh_pid: null })
      ]
    }' "$CONFIG_FILE"
}

cmd_start() {
    local tid="$1"
    local output code
    output=$("$MANAGER_SCRIPT" start "$tid" 2>&1)
    code=$?
    if [ $code -eq 0 ]; then
        jq -n --arg msg "$output" --arg id "$tid" '{ success: true, message: $msg, id: $id }'
    else
        jq -n --arg err "$output" --arg id "$tid" '{ success: false, error: $err, id: $id }'
    fi
}

cmd_stop() {
    local tid="$1"
    local output code
    output=$("$MANAGER_SCRIPT" stop "$tid" 2>&1)
    code=$?
    if [ $code -eq 0 ]; then
        jq -n --arg msg "$output" --arg id "$tid" '{ success: true, message: $msg, id: $id }'
    else
        jq -n --arg err "$output" --arg id "$tid" '{ success: false, error: $err, id: $id }'
    fi
}

cmd_restart() {
    local tid="$1"
    local output code
    output=$("$MANAGER_SCRIPT" restart "$tid" 2>&1)
    code=$?
    if [ $code -eq 0 ]; then
        jq -n --arg msg "$output" --arg id "$tid" '{ success: true, message: $msg, id: $id }'
    else
        jq -n --arg err "$output" --arg id "$tid" '{ success: false, error: $err, id: $id }'
    fi
}

cmd_get_config() {
    if [ -f "$CONFIG_FILE" ]; then
        cat "$CONFIG_FILE"
    else
        echo '{"settings":{},"tunnels":[]}'
    fi
}

cmd_save_config() {
    local input="$1"
    if [ -z "$input" ]; then
        echo '{"success":false,"error":"Missing configuration data"}'
        return 1
    fi

    local json_data=""
    case "$input" in
        "{"*)
            json_data="$input"
            ;;
        *)
            json_data=$(echo "$input" | base64 -d 2>/dev/null)
            ;;
    esac

    if [ -z "$json_data" ]; then
        echo '{"success":false,"error":"Failed to parse or decode configuration"}'
        return 1
    fi

    if ! echo "$json_data" | jq . > "$CONFIG_FILE.tmp" 2>/dev/null; then
        rm -f "$CONFIG_FILE.tmp"
        echo '{"success":false,"error":"Invalid JSON configuration syntax"}'
        return 1
    fi

    mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
    chmod 644 "$CONFIG_FILE"
    "$MANAGER_SCRIPT" update-prop >/dev/null 2>&1 || true
    echo '{"success":true,"message":"Configuration saved successfully"}'
    return 0
}

cmd_get_logs() {
    local tid="$1"
    local lines="${2:-50}"
    if [ -z "$tid" ]; then
        echo '{"success":false,"error":"Tunnel ID required"}'
        return 1
    fi

    local log_file="$LOGS_DIR/${tid}.log"
    if [ ! -f "$log_file" ]; then
        jq -n --arg id "$tid" --argjson lines "$lines" '{
            success: true,
            id: $id,
            lines: 0,
            logs: ""
        }'
        return 0
    fi

    local logs_content
    logs_content=$(tail -n "$lines" "$log_file" 2>/dev/null)
    jq -n --arg id "$tid" --argjson lines "$lines" --arg logs "$logs_content" '{
        success: true,
        id: $id,
        lines: $lines,
        logs: $logs
    }'
}

cmd_clear_logs() {
    local tid="$1"
    if [ -z "$tid" ]; then
        echo '{"success":false,"error":"Tunnel ID required"}'
        return 1
    fi

    local log_file="$LOGS_DIR/${tid}.log"
    if [ -f "$log_file" ]; then
        > "$log_file"
    fi
    echo "{\"success\":true,\"message\":\"Logs cleared for ${tid}\"}"
    return 0
}

cmd_test_connection() {
    local r_host="$1"
    local r_port="${2:-22}"
    local r_user="${3:-csy}"
    local ident="$4"

    if [ -z "$r_host" ]; then
        r_host=$(jq -r '.tunnels[0].remote_host // ""' "$CONFIG_FILE" 2>/dev/null)
        r_port=$(jq -r '.tunnels[0].remote_port // 22' "$CONFIG_FILE" 2>/dev/null)
        r_user=$(jq -r '.tunnels[0].remote_user // "csy"' "$CONFIG_FILE" 2>/dev/null)
        ident=$(jq -r '.tunnels[0].identity_file // ""' "$CONFIG_FILE" 2>/dev/null)
    fi

    if [ -z "$ident" ] || [ "$ident" = "null" ]; then
        ident=$(jq -r '.settings.default_identity // "/data/adb/ssh/root/.ssh/id_ed25519"' "$CONFIG_FILE" 2>/dev/null)
    fi

    if [ -z "$r_host" ]; then
        echo '{"success":false,"error":"Missing remote host"}'
        return 1
    fi

    if [ ! -f "$ident" ]; then
        echo "{\"success\":false,\"error\":\"Identity file $ident not found\"}"
        return 1
    fi

    local start_ms end_ms latency_ms output exit_code
    start_ms=$(date +%s%3N 2>/dev/null || date +%s000)

    output=$(ssh -p "$r_port" \
        -o BatchMode=yes \
        -o ConnectTimeout=5 \
        -o StrictHostKeyChecking=accept-new \
        -i "$ident" \
        "$r_user@$r_host" "true" 2>&1)
    exit_code=$?

    end_ms=$(date +%s%3N 2>/dev/null || date +%s000)
    latency_ms=$(( end_ms - start_ms ))
    [ $latency_ms -lt 0 ] && latency_ms=0

    if [ $exit_code -eq 0 ]; then
        jq -n --argjson lat "$latency_ms" '{ success: true, latency_ms: $lat }'
    else
        jq -n --argjson lat "$latency_ms" --arg err "$output" '{ success: false, latency_ms: $lat, error: $err }'
    fi
}

case "$1" in
    status)
        cmd_status
        ;;
    start)
        cmd_start "$2"
        ;;
    stop)
        cmd_stop "$2"
        ;;
    restart)
        cmd_restart "$2"
        ;;
    get_config)
        cmd_get_config
        ;;
    save_config)
        cmd_save_config "$2"
        ;;
    get_logs)
        cmd_get_logs "$2" "$3"
        ;;
    clear_logs)
        cmd_clear_logs "$2"
        ;;
    test_connection)
        cmd_test_connection "$2" "$3" "$4" "$5"
        ;;
    *)
        echo '{"error":"Invalid API command. Available: status, start, stop, restart, get_config, save_config, get_logs, clear_logs, test_connection"}'
        exit 1
        ;;
esac
