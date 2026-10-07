SKIPUNZIP=0

ui_print "************************************"
ui_print "*      KSU SSH Tunnel Manager      *"
ui_print "*        by WinterSold1er          *"
ui_print "************************************"

# Check Magisk for SSH module dependency
if [ ! -d "/data/adb/modules/ssh" ]; then
    ui_print "! Warning: Magisk for SSH (/data/adb/modules/ssh) is not detected."
    ui_print "! Make sure 'SSH for Magisk' is installed and active for SSH binaries."
fi

set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm_recursive "$MODPATH/scripts" 0 0 0755 0755
set_perm "$MODPATH/service.sh" 0 0 0755
set_perm "$MODPATH/action.sh" 0 0 0755
set_perm "$MODPATH/module.prop" 0 0 0644
set_perm "$MODPATH/tunnels.json" 0 0 0644
set_perm "$MODPATH/webroot/index.html" 0 0 0644

mkdir -p "$MODPATH/logs" "$MODPATH/run"
set_perm "$MODPATH/logs" 0 0 0755
set_perm "$MODPATH/run" 0 0 0755

ui_print "- KSU SSH Tunnel configured successfully!"
