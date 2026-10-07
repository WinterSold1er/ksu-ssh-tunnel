/* --------------------------------------------------------------------------
       1. KernelSU Bridge & Mock Data Provider
       -------------------------------------------------------------------------- */
    let callbackId = 0;
    const isKernelSU = typeof window.ksu !== 'undefined';
    const API_SCRIPT = '/data/adb/modules/ksu-ssh-tunnel/scripts/api.sh';

    function execAsync(cmd) {
      if (!isKernelSU) {
        return mockExec(cmd);
      }
      return new Promise((resolve, reject) => {
        const cb = 'cb_' + Date.now() + '_' + (callbackId++);
        window[cb] = (errno, stdout, stderr) => {
          delete window[cb];
          resolve({ errno, stdout, stderr });
        };
        try {
          window.ksu.exec(cmd, "{}", cb);
        } catch (err) {
          delete window[cb];
          reject(err);
        }
      });
    }

    // Mock Backend Simulation Engine
    const MOCK_STORAGE_KEY = 'ksu_mock_tunnels_config_v1';
    const MOCK_LOGS_KEY = 'ksu_mock_logs_v1';

    function getMockConfig() {
      const stored = localStorage.getItem(MOCK_STORAGE_KEY);
      if (stored) {
        try { return JSON.parse(stored); } catch (e) {}
      }
      const initial = {
        settings: {
          autostart: true,
          default_identity: "/data/adb/ssh/root/.ssh/id_ed25519",
          keepalive_interval: 15,
          keepalive_count_max: 3
        },
        tunnels: [
          {
            id: "dsh-web",
            name: "DSH Web Service",
            enabled: true,
            type: "local",
            remote_host: "100.92.178.83",
            remote_port: 22,
            remote_user: "csy",
            identity_file: "/data/adb/ssh/root/.ssh/id_ed25519",
            local_host: "127.0.0.1",
            local_port: 3080,
            target_host: "127.0.0.1",
            target_port: 3080,
            extra_args: "-o ServerAliveInterval=15",
            running: true,
            ssh_active: true,
            pid: 14209
          },
          {
            id: "socks-proxy",
            name: "SOCKS5 Proxy (Mobile)",
            enabled: false,
            type: "dynamic",
            remote_host: "100.92.178.83",
            remote_port: 22,
            remote_user: "csy",
            identity_file: "/data/adb/ssh/root/.ssh/id_ed25519",
            local_host: "127.0.0.1",
            local_port: 1080,
            target_host: "dynamic",
            target_port: 1080,
            extra_args: "",
            running: false,
            ssh_active: false,
            pid: null
          }
        ]
      };
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }

    function saveMockConfig(cfg) {
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(cfg));
    }

    async function mockExec(cmd) {
      await new Promise(r => setTimeout(r, 60)); // Simulate realistic delay
      const cfg = getMockConfig();

      if (cmd.includes('api.sh status')) {
        const activeCount = cfg.tunnels.filter(t => t.running).length;
        const res = {
          running: activeCount > 0,
          total: cfg.tunnels.length,
          active: activeCount,
          ssh_ready: true,
          settings: cfg.settings,
          tunnels: cfg.tunnels
        };
        return { errno: 0, stdout: JSON.stringify(res), stderr: '' };
      }

      if (cmd.includes('api.sh start')) {
        const parts = cmd.split(' ');
        const id = parts[parts.indexOf('start') + 1]?.replace(/['"]/g, '');
        if (id) {
          const t = cfg.tunnels.find(x => x.id === id);
          if (t) {
            t.running = true;
            t.ssh_active = true;
            t.pid = Math.floor(Math.random() * 20000 + 10000);
          }
        } else {
          cfg.tunnels.forEach(t => {
            if (t.enabled) {
              t.running = true;
              t.ssh_active = true;
              t.pid = Math.floor(Math.random() * 20000 + 10000);
            }
          });
        }
        saveMockConfig(cfg);
        return { errno: 0, stdout: JSON.stringify({ success: true, message: "Tunnel started" }), stderr: '' };
      }

      if (cmd.includes('api.sh stop')) {
        const parts = cmd.split(' ');
        const id = parts[parts.indexOf('stop') + 1]?.replace(/['"]/g, '');
        if (id) {
          const t = cfg.tunnels.find(x => x.id === id);
          if (t) {
            t.running = false;
            t.ssh_active = false;
            t.pid = null;
          }
        } else {
          cfg.tunnels.forEach(t => {
            if (t.enabled) {
              t.running = false;
              t.ssh_active = false;
              t.pid = null;
            }
          });
        }
        saveMockConfig(cfg);
        return { errno: 0, stdout: JSON.stringify({ success: true, message: "Tunnel stopped" }), stderr: '' };
      }

      if (cmd.includes('api.sh restart')) {
        const parts = cmd.split(' ');
        const id = parts[parts.indexOf('restart') + 1]?.replace(/['"]/g, '');
        if (id) {
          const t = cfg.tunnels.find(x => x.id === id);
          if (t) {
            t.running = true;
            t.ssh_active = true;
            t.pid = Math.floor(Math.random() * 20000 + 10000);
          }
        }
        saveMockConfig(cfg);
        return { errno: 0, stdout: JSON.stringify({ success: true, message: "Tunnel restarted" }), stderr: '' };
      }

      if (cmd.includes('api.sh get_config')) {
        return { errno: 0, stdout: JSON.stringify(cfg), stderr: '' };
      }

      if (cmd.includes('api.sh save_config')) {
        const parts = cmd.split(' ');
        const b64 = parts[parts.indexOf('save_config') + 1]?.replace(/['"]/g, '');
        try {
          const raw = atob(b64);
          const parsed = JSON.parse(raw);
          saveMockConfig(parsed);
          return { errno: 0, stdout: JSON.stringify({ success: true, message: "Saved" }), stderr: '' };
        } catch (e) {
          return { errno: 1, stdout: '', stderr: 'Failed to decode base64 JSON' };
        }
      }

      if (cmd.includes('api.sh get_logs')) {
        const parts = cmd.split(' ');
        const id = parts[parts.indexOf('get_logs') + 1]?.replace(/['"]/g, '') || 'dsh-web';
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const logs = `[${now}] [${id}] Supervisor started (PID: 14209)\n` +
          `[${now}] [${id}] Checking network connectivity to remote host...\n` +
          `[${now}] [${id}] Connection verified: Ping OK (18ms)\n` +
          `[${now}] [${id}] Spawning SSH worker: ssh -N -L 127.0.0.1:3080:127.0.0.1:3080 csy@100.92.178.83\n` +
          `[${now}] [${id}] Authenticated via ed25519 key\n` +
          `[${now}] [${id}] [ACTIVE] Tunnel established and listening on 127.0.0.1:3080\n` +
          `[${now}] [${id}] Keepalive probe healthy. 0 packets dropped.`;
        return { errno: 0, stdout: JSON.stringify({ success: true, id, lines: 10, logs }), stderr: '' };
      }

      if (cmd.includes('api.sh clear_logs')) {
        return { errno: 0, stdout: JSON.stringify({ success: true, message: "Logs cleared" }), stderr: '' };
      }

      if (cmd.includes('api.sh test_connection')) {
        await new Promise(r => setTimeout(r, 200));
        return { errno: 0, stdout: JSON.stringify({ success: true, latency_ms: Math.floor(Math.random() * 25 + 15) }), stderr: '' };
      }

      return { errno: 0, stdout: '{}', stderr: '' };
    }

    /* --------------------------------------------------------------------------
       2. API Wrapper Functions
       -------------------------------------------------------------------------- */
    async function callApi(action, ...args) {
      const escapedArgs = args.map(arg => {
        if (arg === undefined || arg === null) return "''";
        return "'" + String(arg).replace(/'/g, "'\\''") + "'";
      }).join(' ');

      const cmd = `sh ${API_SCRIPT} ${action} ${escapedArgs}`.trim();
      const res = await execAsync(cmd);
      if (res.errno !== 0 && !res.stdout) {
        throw new Error(res.stderr || `Command failed with errno ${res.errno}`);
      }
      try {
        return JSON.parse(res.stdout);
      } catch (e) {
        return res.stdout;
      }
    }

    function toBase64(str) {
      return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
    }

    /* --------------------------------------------------------------------------
       3. Application State Store
       -------------------------------------------------------------------------- */
    const state = {
      status: null,
      config: null,
      editingTunnelId: null,
      logTunnelId: null,
      logInterval: null,
      theme: localStorage.getItem('ksu_theme') || 'dark'
    };

    /* --------------------------------------------------------------------------
       4. Toast Notifications
       -------------------------------------------------------------------------- */
    function showToast(message, type = 'info', duration = 3000) {
      const container = document.getElementById('toastContainer');
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;

      let icon = '';
      if (type === 'success') {
        icon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
      } else if (type === 'error') {
        icon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      } else {
        icon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
      }

      toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px) scale(0.95)';
        setTimeout(() => toast.remove(), 250);
      }, duration);
    }

    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[m]);
    }

    function copyToClipboard(text, label = 'Text') {
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showToast(`Copied ${label} to clipboard`, 'success');
        }).catch(() => {
          prompt('Copy to clipboard:', text);
        });
      } else {
        prompt('Copy to clipboard:', text);
      }
    }

    /* --------------------------------------------------------------------------
       5. Theme Handling
       -------------------------------------------------------------------------- */
    function applyTheme(theme) {
      state.theme = theme;
      localStorage.setItem('ksu_theme', theme);
      const meta = document.getElementById('themeMeta');
      const themeIcon = document.getElementById('themeIcon');

      if (theme === 'light') {
        document.body.classList.add('light');
        meta.setAttribute('content', '#f8fafc');
        themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
      } else {
        document.body.classList.remove('light');
        meta.setAttribute('content', '#090d16');
        themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
      }
    }

    function toggleTheme() {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    }

    /* --------------------------------------------------------------------------
       6. UI Rendering Engine
       -------------------------------------------------------------------------- */
    async function loadData() {
      const btnRefresh = document.getElementById('btnRefresh');
      btnRefresh.classList.add('spinning');

      try {
        const [statusData, configData] = await Promise.all([
          callApi('status'),
          callApi('get_config')
        ]);
        state.status = statusData;
        state.config = configData;
        renderUI();
      } catch (err) {
        console.error('Failed to load status:', err);
        showToast('Error communicating with backend: ' + err.message, 'error');
      } finally {
        setTimeout(() => btnRefresh.classList.remove('spinning'), 400);
      }
    }

    function renderUI() {
      if (!state.status) return;

      const { running, total, active, ssh_ready, settings, tunnels } = state.status;

      // Demo Mode badge
      const demoBadge = document.getElementById('demoModeBadge');
      if (!isKernelSU) {
        demoBadge.style.display = 'inline-flex';
      }

      // SSH Banner notice
      const sshBanner = document.getElementById('sshNoticeBanner');
      if (ssh_ready === false) {
        sshBanner.classList.add('visible');
      } else {
        sshBanner.classList.remove('visible');
      }

      // Hero Status Halo & Text
      const heroHalo = document.getElementById('heroHalo');
      const heroStatusText = document.getElementById('heroStatusText');
      const heroStatusSub = document.getElementById('heroStatusSub');

      if (running && active > 0) {
        heroHalo.className = 'status-halo active';
        heroStatusText.textContent = `Running (${active}/${total})`;
        heroStatusText.style.color = 'var(--emerald)';
        heroStatusSub.textContent = 'All active tunnels routed & healthy';
      } else {
        heroHalo.className = 'status-halo';
        heroStatusText.textContent = 'Stopped';
        heroStatusText.style.color = 'var(--text-main)';
        heroStatusSub.textContent = total > 0 ? 'Tunnels are idle' : 'No tunnels configured';
      }

      // Stats
      document.getElementById('statActive').textContent = active || 0;
      document.getElementById('statActive').className = 'stat-val ' + (active > 0 ? 'active' : '');
      document.getElementById('statTotal').textContent = total || 0;
      document.getElementById('statAutostart').textContent = (settings?.autostart !== false) ? 'ON' : 'OFF';
      document.getElementById('tunnelsCountBadge').textContent = total || 0;

      // Render Tunnel Cards
      const container = document.getElementById('tunnelsListContainer');
      container.innerHTML = '';

      if (!tunnels || tunnels.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <div style="font-weight: 700; font-size: 1rem; color: var(--text-main);">No SSH Tunnels Yet</div>
            <div style="font-size: 0.82rem; max-width: 320px; line-height: 1.4;">
              Create your first tunnel to forward ports or browse through a secure SOCKS5 proxy.
            </div>
            <button class="btn btn-primary" onclick="openAddModal()" style="margin-top: 6px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Add Tunnel
            </button>
          </div>
        `;
        return;
      }

      tunnels.forEach(t => {
        const card = document.createElement('div');
        const isRunning = t.running && t.ssh_active;
        card.className = `tunnel-card ${isRunning ? 'is-running' : 'is-stopped'}`;

        // Type label & class
        let typeClass = 'type-local';
        let typeLabel = 'Local (-L)';
        if (t.type === 'remote') {
          typeClass = 'type-remote';
          typeLabel = 'Remote (-R)';
        } else if (t.type === 'dynamic') {
          typeClass = 'type-dynamic';
          typeLabel = 'SOCKS5 (-D)';
        }

        // Flow diagram endpoints
        let localStr = `${t.local_host || '127.0.0.1'}:${t.local_port}`;
        let remoteStr = `${t.remote_user}@${t.remote_host}:${t.remote_port || 22}`;
        let targetStr = `${t.target_host || '127.0.0.1'}:${t.target_port}`;

        if (t.type === 'dynamic') {
          targetStr = 'Dynamic Internet Proxy';
        }

        card.innerHTML = `
          <div class="card-top">
            <div class="card-title-group">
              <div class="pulse-dot ${isRunning ? 'running' : ''}"></div>
              <div class="card-title-meta">
                <div class="card-name-row">
                  <span class="tunnel-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>
                  <span class="type-badge ${typeClass}">${typeLabel}</span>
                  ${t.pid ? `<span class="pid-badge">PID ${t.pid}</span>` : ''}
                </div>
              </div>
            </div>
            <div class="switch-wrap">
              <label class="switch" title="${isRunning ? 'Turn Off' : 'Turn On'}">
                <input type="checkbox" ${isRunning ? 'checked' : ''} onchange="toggleTunnel('${t.id}', ${isRunning})">
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <!-- Flow Diagram -->
          <div class="flow-diagram">
            <div class="flow-node">
              <span class="node-label">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
                ${t.type === 'remote' ? 'Remote Entry' : 'Local Bind'}
              </span>
              <span class="node-val" onclick="copyToClipboard('${localStr}', 'Local Port')">
                ${escapeHtml(localStr)}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </span>
            </div>

            <div class="flow-arrow ${isRunning ? 'active' : ''}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </div>

            <div class="flow-node">
              <span class="node-label">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg>
                SSH Server
              </span>
              <span class="node-val" onclick="copyToClipboard('${remoteStr}', 'Server Host')">
                ${escapeHtml(remoteStr)}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </span>
            </div>

            <div class="flow-arrow ${isRunning ? 'active' : ''}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </div>

            <div class="flow-node">
              <span class="node-label">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
                ${t.type === 'dynamic' ? 'Proxy Exit' : 'Target Destination'}
              </span>
              <span class="node-val" onclick="copyToClipboard('${targetStr}', 'Target')">
                ${escapeHtml(targetStr)}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </span>
            </div>
          </div>

          <!-- Bottom Card Controls -->
          <div class="card-actions">
            <button class="action-btn" onclick="restartTunnel('${t.id}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
              Restart
            </button>
            <button class="action-btn" onclick="openLogsModal('${t.id}', '${escapeHtml(t.name)}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Logs
            </button>
            <button class="action-btn" onclick="openEditModal('${t.id}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
            <button class="action-btn btn-delete" onclick="promptDelete('${t.id}', '${escapeHtml(t.name)}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete
            </button>
          </div>
        `;

        container.appendChild(card);
      });
    }

    /* --------------------------------------------------------------------------
       7. Tunnel Lifecycle Actions
       -------------------------------------------------------------------------- */
    async function toggleTunnel(id, currentlyRunning) {
      const action = currentlyRunning ? 'stop' : 'start';
      try {
        showToast(`${currentlyRunning ? 'Stopping' : 'Starting'} tunnel ${id}...`, 'info');
        await callApi(action, id);
        showToast(`Tunnel ${id} ${currentlyRunning ? 'stopped' : 'started'}`, 'success');
        await loadData();
      } catch (err) {
        showToast(`Failed to ${action} tunnel: ${err.message}`, 'error');
        await loadData();
      }
    }

    async function startAllTunnels() {
      try {
        showToast('Starting all enabled tunnels...', 'info');
        await callApi('start');
        showToast('All enabled tunnels started', 'success');
        await loadData();
      } catch (err) {
        showToast('Failed to start all tunnels: ' + err.message, 'error');
      }
    }

    async function stopAllTunnels() {
      try {
        showToast('Stopping all tunnels...', 'info');
        await callApi('stop');
        showToast('All tunnels stopped', 'success');
        await loadData();
      } catch (err) {
        showToast('Failed to stop all tunnels: ' + err.message, 'error');
      }
    }

    async function restartTunnel(id) {
      try {
        showToast(`Restarting tunnel ${id}...`, 'info');
        await callApi('restart', id);
        showToast(`Tunnel ${id} restarted successfully`, 'success');
        await loadData();
      } catch (err) {
        showToast(`Restart failed: ${err.message}`, 'error');
      }
    }

    /* --------------------------------------------------------------------------
       8. Add & Edit Tunnel Modal Management
       -------------------------------------------------------------------------- */
    let selectedTunnelType = 'local';

    function setTunnelType(type) {
      selectedTunnelType = type;
      document.querySelectorAll('#tunnelTypeSelector .seg-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-type') === type);
      });

      const targetRow = document.getElementById('targetEndpointsRow');
      if (type === 'dynamic') {
        targetRow.style.display = 'none';
      } else {
        targetRow.style.display = 'grid';
      }
    }

    function openAddModal() {
      state.editingTunnelId = null;
      document.getElementById('modalTitle').innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        Add New Tunnel
      `;
      document.getElementById('presetsBar').style.display = 'flex';

      // Default values
      document.getElementById('inputTunnelName').value = '';
      document.getElementById('inputTunnelId').value = '';
      document.getElementById('inputTunnelId').disabled = false;
      document.getElementById('inputRemoteHost').value = '100.92.178.83';
      document.getElementById('inputRemotePort').value = '22';
      document.getElementById('inputRemoteUser').value = 'csy';
      document.getElementById('inputIdentityFile').value = state.config?.settings?.default_identity || '/data/adb/ssh/root/.ssh/id_ed25519';
      document.getElementById('inputLocalHost').value = '127.0.0.1';
      document.getElementById('inputLocalPort').value = '3080';
      document.getElementById('inputTargetHost').value = '127.0.0.1';
      document.getElementById('inputTargetPort').value = '3080';
      document.getElementById('inputExtraArgs').value = '';
      document.getElementById('inputTunnelEnabled').checked = true;

      setTunnelType('local');
      resetTestBadge();

      document.getElementById('tunnelModal').classList.add('open');
    }

    function openEditModal(id) {
      const t = state.status?.tunnels?.find(x => x.id === id);
      if (!t) return;

      state.editingTunnelId = id;
      document.getElementById('modalTitle').innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Edit Tunnel: ${escapeHtml(t.name)}
      `;
      document.getElementById('presetsBar').style.display = 'none';

      document.getElementById('inputTunnelName').value = t.name || '';
      document.getElementById('inputTunnelId').value = t.id || '';
      document.getElementById('inputTunnelId').disabled = true;
      document.getElementById('inputRemoteHost').value = t.remote_host || '';
      document.getElementById('inputRemotePort').value = t.remote_port || 22;
      document.getElementById('inputRemoteUser').value = t.remote_user || '';
      document.getElementById('inputIdentityFile').value = t.identity_file || '';
      document.getElementById('inputLocalHost').value = t.local_host || '127.0.0.1';
      document.getElementById('inputLocalPort').value = t.local_port || '';
      document.getElementById('inputTargetHost').value = t.target_host || '127.0.0.1';
      document.getElementById('inputTargetPort').value = t.target_port || '';
      document.getElementById('inputExtraArgs').value = t.extra_args || '';
      document.getElementById('inputTunnelEnabled').checked = (t.enabled !== false);

      setTunnelType(t.type || 'local');
      resetTestBadge();

      document.getElementById('tunnelModal').classList.add('open');
    }

    function closeTunnelModal() {
      document.getElementById('tunnelModal').classList.remove('open');
    }

    // Auto slugify id from name
    document.getElementById('inputTunnelName').addEventListener('input', e => {
      if (!state.editingTunnelId) {
        const slug = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        document.getElementById('inputTunnelId').value = slug;
      }
    });

    // Preset click handler
    document.querySelectorAll('.preset-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-preset');
        if (p === 'dsh') {
          setTunnelType('local');
          document.getElementById('inputTunnelName').value = 'DSH Web Service';
          document.getElementById('inputTunnelId').value = 'dsh-web';
          document.getElementById('inputRemoteHost').value = '100.92.178.83';
          document.getElementById('inputRemotePort').value = '22';
          document.getElementById('inputRemoteUser').value = 'csy';
          document.getElementById('inputLocalHost').value = '127.0.0.1';
          document.getElementById('inputLocalPort').value = '3080';
          document.getElementById('inputTargetHost').value = '127.0.0.1';
          document.getElementById('inputTargetPort').value = '3080';
        } else if (p === 'socks') {
          setTunnelType('dynamic');
          document.getElementById('inputTunnelName').value = 'SOCKS5 Proxy';
          document.getElementById('inputTunnelId').value = 'socks-proxy';
          document.getElementById('inputRemoteHost').value = '100.92.178.83';
          document.getElementById('inputRemotePort').value = '22';
          document.getElementById('inputRemoteUser').value = 'csy';
          document.getElementById('inputLocalHost').value = '127.0.0.1';
          document.getElementById('inputLocalPort').value = '1080';
        } else if (p === 'local') {
          setTunnelType('local');
          document.getElementById('inputTunnelName').value = 'Local Forward 8080';
          document.getElementById('inputTunnelId').value = 'local-8080';
          document.getElementById('inputLocalHost').value = '127.0.0.1';
          document.getElementById('inputLocalPort').value = '8080';
          document.getElementById('inputTargetHost').value = '127.0.0.1';
          document.getElementById('inputTargetPort').value = '8080';
        } else if (p === 'remote') {
          setTunnelType('remote');
          document.getElementById('inputTunnelName').value = 'Remote Reverse 9090';
          document.getElementById('inputTunnelId').value = 'remote-9090';
          document.getElementById('inputLocalHost').value = '0.0.0.0';
          document.getElementById('inputLocalPort').value = '9090';
          document.getElementById('inputTargetHost').value = '127.0.0.1';
          document.getElementById('inputTargetPort').value = '8080';
        }
        showToast(`Preset loaded`, 'info');
      });
    });

    // Save Tunnel Form
    async function saveTunnelModal() {
      const name = document.getElementById('inputTunnelName').value.trim();
      const id = document.getElementById('inputTunnelId').value.trim();
      const remote_host = document.getElementById('inputRemoteHost').value.trim();
      const remote_port = parseInt(document.getElementById('inputRemotePort').value, 10) || 22;
      const remote_user = document.getElementById('inputRemoteUser').value.trim();
      const identity_file = document.getElementById('inputIdentityFile').value.trim();
      const local_host = document.getElementById('inputLocalHost').value.trim() || '127.0.0.1';
      const local_port = parseInt(document.getElementById('inputLocalPort').value, 10);
      const target_host = document.getElementById('inputTargetHost').value.trim() || '127.0.0.1';
      const target_port = parseInt(document.getElementById('inputTargetPort').value, 10) || local_port;
      const extra_args = document.getElementById('inputExtraArgs').value.trim();
      const enabled = document.getElementById('inputTunnelEnabled').checked;

      if (!name || !id || !remote_host || !remote_user || !local_port) {
        showToast('Please fill all required fields', 'error');
        return;
      }

      // Fetch fresh config
      const cfg = state.config || (await callApi('get_config'));
      if (!cfg.tunnels) cfg.tunnels = [];

      const tunnelObj = {
        id,
        name,
        enabled,
        type: selectedTunnelType,
        remote_host,
        remote_port,
        remote_user,
        identity_file,
        local_host,
        local_port,
        target_host: selectedTunnelType === 'dynamic' ? 'dynamic' : target_host,
        target_port: selectedTunnelType === 'dynamic' ? local_port : target_port,
        extra_args
      };

      if (state.editingTunnelId) {
        const idx = cfg.tunnels.findIndex(x => x.id === state.editingTunnelId);
        if (idx >= 0) {
          cfg.tunnels[idx] = tunnelObj;
        } else {
          cfg.tunnels.push(tunnelObj);
        }
      } else {
        if (cfg.tunnels.some(x => x.id === id)) {
          showToast(`Tunnel with ID "${id}" already exists`, 'error');
          return;
        }
        cfg.tunnels.push(tunnelObj);
      }

      try {
        const b64 = toBase64(JSON.stringify(cfg, null, 2));
        await callApi('save_config', b64);
        showToast('Tunnel saved successfully', 'success');
        closeTunnelModal();
        await loadData();
      } catch (err) {
        showToast('Failed to save tunnel: ' + err.message, 'error');
      }
    }

    /* --------------------------------------------------------------------------
       9. Connection Health Ping Test
       -------------------------------------------------------------------------- */
    function resetTestBadge() {
      const badge = document.getElementById('testResultBadge');
      badge.className = 'test-result-badge';
      badge.textContent = '';
      badge.style.display = 'none';
    }

    async function testConnection() {
      const host = document.getElementById('inputRemoteHost').value.trim();
      const port = document.getElementById('inputRemotePort').value.trim() || '22';
      const user = document.getElementById('inputRemoteUser').value.trim();
      const key = document.getElementById('inputIdentityFile').value.trim();
      const badge = document.getElementById('testResultBadge');
      const btn = document.getElementById('btnTestConnection');

      if (!host || !user) {
        showToast('Please enter remote host and username', 'error');
        return;
      }

      btn.disabled = true;
      btn.style.opacity = '0.6';
      badge.style.display = 'inline-flex';
      badge.className = 'test-result-badge';
      badge.textContent = 'Testing...';

      try {
        const res = await callApi('test_connection', host, port, user, key);
        if (res && res.success) {
          badge.className = 'test-result-badge success';
          badge.textContent = `⚡ ${res.latency_ms}ms Connected`;
          showToast(`SSH Handshake success (${res.latency_ms}ms)`, 'success');
        } else {
          badge.className = 'test-result-badge error';
          badge.textContent = 'Failed';
          showToast('Connection failed: ' + (res.error || 'Timeout'), 'error');
        }
      } catch (err) {
        badge.className = 'test-result-badge error';
        badge.textContent = 'Error';
        showToast('Ping error: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    }

    /* --------------------------------------------------------------------------
       10. Delete Tunnel Flow
       -------------------------------------------------------------------------- */
    let pendingDeleteId = null;

    function promptDelete(id, name) {
      pendingDeleteId = id;
      document.getElementById('deleteTunnelName').textContent = name || id;
      document.getElementById('confirmDeleteModal').classList.add('open');
    }

    async function confirmDelete() {
      if (!pendingDeleteId) return;
      const id = pendingDeleteId;
      document.getElementById('confirmDeleteModal').classList.remove('open');

      try {
        // Stop it first
        await callApi('stop', id);

        // Remove from config
        const cfg = state.config || (await callApi('get_config'));
        cfg.tunnels = (cfg.tunnels || []).filter(x => x.id !== id);

        const b64 = toBase64(JSON.stringify(cfg, null, 2));
        await callApi('save_config', b64);

        showToast(`Tunnel ${id} deleted`, 'success');
        await loadData();
      } catch (err) {
        showToast('Failed to delete tunnel: ' + err.message, 'error');
      } finally {
        pendingDeleteId = null;
      }
    }

    /* --------------------------------------------------------------------------
       11. Log Viewer Management & Live Polling
       -------------------------------------------------------------------------- */
    function openLogsModal(id, name) {
      state.logTunnelId = id;
      document.getElementById('logModalTunnelName').textContent = name || id;

      // Populate selector
      const sel = document.getElementById('logTunnelSelect');
      sel.innerHTML = '';
      (state.status?.tunnels || []).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.name} (${t.id})`;
        if (t.id === id) opt.selected = true;
        sel.appendChild(opt);
      });

      document.getElementById('logModal').classList.add('open');
      fetchLogs();

      // Start 2s live polling
      if (state.logInterval) clearInterval(state.logInterval);
      state.logInterval = setInterval(fetchLogs, 2000);
    }

    function closeLogsModal() {
      document.getElementById('logModal').classList.remove('open');
      if (state.logInterval) {
        clearInterval(state.logInterval);
        state.logInterval = null;
      }
    }

    async function fetchLogs() {
      if (!state.logTunnelId) return;
      const term = document.getElementById('terminalOutput');
      try {
        const res = await callApi('get_logs', state.logTunnelId, 100);
        if (res && res.logs) {
          const formatted = res.logs.split('\n').map(line => {
            if (!line.trim()) return '';
            // Basic syntax highlighting
            return line
              .replace(/^\[([0-9\-\s:]+)\]/, '<span class="log-line-timestamp">[$1]</span>')
              .replace(/\[([a-zA-Z0-9_\-]+)\]/, '<span class="log-line-tunnel">[$1]</span>')
              .replace(/(ACTIVE|Listening|success|established|Ping OK)/gi, '<span class="log-line-info">$1</span>')
              .replace(/(warning|reconnecting|dropping)/gi, '<span class="log-line-warn">$1</span>')
              .replace(/(error|failed|exit|refused)/gi, '<span class="log-line-error">$1</span>');
          }).join('\n');
          term.innerHTML = formatted || 'Log file is currently empty.';
        } else {
          term.textContent = 'No logs captured yet for this tunnel.';
        }
        term.scrollTop = term.scrollHeight;
      } catch (err) {
        term.textContent = 'Error streaming logs: ' + err.message;
      }
    }

    async function clearLogs() {
      if (!state.logTunnelId) return;
      try {
        await callApi('clear_logs', state.logTunnelId);
        showToast('Logs cleared', 'info');
        fetchLogs();
      } catch (err) {
        showToast('Failed to clear logs: ' + err.message, 'error');
      }
    }

    function copyLogs() {
      const term = document.getElementById('terminalOutput');
      copyToClipboard(term.innerText, 'Tunnel Logs');
    }

    /* --------------------------------------------------------------------------
       12. Global Settings Modal Management
       -------------------------------------------------------------------------- */
    function openSettingsModal() {
      const settings = state.config?.settings || {};
      document.getElementById('settingsAutostart').checked = (settings.autostart !== false);
      document.getElementById('settingsDefaultIdentity').value = settings.default_identity || '/data/adb/ssh/root/.ssh/id_ed25519';
      document.getElementById('settingsKeepaliveInterval').value = settings.keepalive_interval || 15;
      document.getElementById('settingsKeepaliveCount').value = settings.keepalive_count_max || 3;
      document.getElementById('settingsModal').classList.add('open');
    }

    function closeSettingsModal() {
      document.getElementById('settingsModal').classList.remove('open');
    }

    async function saveSettingsModal() {
      const autostart = document.getElementById('settingsAutostart').checked;
      const default_identity = document.getElementById('settingsDefaultIdentity').value.trim();
      const keepalive_interval = parseInt(document.getElementById('settingsKeepaliveInterval').value, 10) || 15;
      const keepalive_count_max = parseInt(document.getElementById('settingsKeepaliveCount').value, 10) || 3;

      const cfg = state.config || (await callApi('get_config'));
      cfg.settings = {
        autostart,
        default_identity,
        keepalive_interval,
        keepalive_count_max
      };

      try {
        const b64 = toBase64(JSON.stringify(cfg, null, 2));
        await callApi('save_config', b64);
        showToast('Global settings updated', 'success');
        closeSettingsModal();
        await loadData();
      } catch (err) {
        showToast('Failed to save settings: ' + err.message, 'error');
      }
    }

    /* --------------------------------------------------------------------------
       13. Event Listeners Initialization
       -------------------------------------------------------------------------- */
    window.addEventListener('DOMContentLoaded', () => {
      applyTheme(state.theme);

      // Header actions
      document.getElementById('btnThemeToggle').addEventListener('click', toggleTheme);
      document.getElementById('btnRefresh').addEventListener('click', loadData);
      document.getElementById('btnSettingsOpen').addEventListener('click', openSettingsModal);

      // Hero Actions
      document.getElementById('btnOpenAddModal').addEventListener('click', openAddModal);
      document.getElementById('btnStartAll').addEventListener('click', startAllTunnels);
      document.getElementById('btnStopAll').addEventListener('click', stopAllTunnels);

      // Add/Edit Modal
      document.getElementById('btnModalClose').addEventListener('click', closeTunnelModal);
      document.getElementById('btnModalCancel').addEventListener('click', closeTunnelModal);
      document.getElementById('btnModalSave').addEventListener('click', saveTunnelModal);
      document.getElementById('btnTestConnection').addEventListener('click', testConnection);

      document.querySelectorAll('#tunnelTypeSelector .seg-item').forEach(el => {
        el.addEventListener('click', () => setTunnelType(el.getAttribute('data-type')));
      });

      // Log Modal
      document.getElementById('btnLogModalClose').addEventListener('click', closeLogsModal);
      document.getElementById('btnLogModalDone').addEventListener('click', closeLogsModal);
      document.getElementById('btnLogRefresh').addEventListener('click', fetchLogs);
      document.getElementById('btnLogClear').addEventListener('click', clearLogs);
      document.getElementById('btnLogCopy').addEventListener('click', copyLogs);
      document.getElementById('logTunnelSelect').addEventListener('change', e => {
        state.logTunnelId = e.target.value;
        const t = state.status?.tunnels?.find(x => x.id === state.logTunnelId);
        document.getElementById('logModalTunnelName').textContent = t ? t.name : state.logTunnelId;
        fetchLogs();
      });

      // Settings Modal
      document.getElementById('btnSettingsClose').addEventListener('click', closeSettingsModal);
      document.getElementById('btnSettingsCancel').addEventListener('click', closeSettingsModal);
      document.getElementById('btnSettingsSave').addEventListener('click', saveSettingsModal);

      // Delete Modal
      document.getElementById('btnCancelDelete').addEventListener('click', () => {
        document.getElementById('confirmDeleteModal').classList.remove('open');
      });
      document.getElementById('btnConfirmDelete').addEventListener('click', confirmDelete);

      // Close modal on background click
      document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
          if (e.target === overlay) {
            overlay.classList.remove('open');
            if (overlay.id === 'logModal' && state.logInterval) {
              clearInterval(state.logInterval);
              state.logInterval = null;
            }
          }
        });
      });

      // Initial Data Load
      loadData();
    });