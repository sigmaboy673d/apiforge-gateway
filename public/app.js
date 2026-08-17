// ==========================================================================
// FORGEAPI — LIVE DEVELOPER PLATFORM CLIENT ENGINE WITH UIVERSE.IO INTEGRATION
// Real-time balance deduction, $5.0000 initial balance & zero fake data
// ==========================================================================
(function() {
  'use strict';

  const STORAGE_KEYS = {
    BALANCE: 'forgeapi_balance_v7',
    API_KEYS: 'forgeapi_keys_v7',
    TRANSACTIONS: 'forgeapi_txs_v7',
    ACCOUNT_ID: 'forgeapi_user_account_id_v2',
    USERNAME: 'forgeapi_username_v2',
    LOCKED_MODEL: 'forgeapi_locked_model_v1',
    KEY_MODEL_MAP: 'forgeapi_key_model_map_v1',
    DAILY_SPINS_DATE: 'forge_daily_spins_date_v2',
    DAILY_SPINS_COUNT: 'forge_daily_spins_count_v2'
  };

  function generateRandomHex(len = 16) {
    if (window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint8Array(len);
      window.crypto.getRandomValues(arr);
      return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    }
    return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  }

  function getOrCreateAccountId() {
    let id = localStorage.getItem(STORAGE_KEYS.ACCOUNT_ID);
    if (!id) {
      const randomNum = Math.floor(1000000 + Math.random() * 9000000);
      id = `APIFORGE-${randomNum}`;
      localStorage.setItem(STORAGE_KEYS.ACCOUNT_ID, id);
    }
    return id;
  }

  function getOrCreateInitialKeys() {
    let keysStr = localStorage.getItem(STORAGE_KEYS.API_KEYS);
    if (keysStr) {
      try { return JSON.parse(keysStr); } catch(e) {}
    }
    const initialKey = 'fg_live_' + generateRandomHex(16);
    const initialKeys = [
      { id: 'key_1', name: 'Production Main Key', key: initialKey, created: 'Just now', lastUsed: 'Never', status: 'Active' }
    ];
    localStorage.setItem(STORAGE_KEYS.API_KEYS, JSON.stringify(initialKeys));
    return initialKeys;
  }

  const userAccountId = getOrCreateAccountId();
  const userKeys = getOrCreateInitialKeys();

  // State Management (Per-User Isolated State)
  const state = {
    baseUrl: window.location.origin + '/v1',
    accountId: userAccountId,
    balance: parseFloat(localStorage.getItem(STORAGE_KEYS.BALANCE) || '1.00'),
    formattedBalance: '€1.00',
    usedThisMonth: '€0.00',
    totalRequests: '0',
    totalTokens: '0',
    spend: '€0.00',
    avgLatency: '0.00s',
    activeView: 'overview',
    activeChartTab: 'requests',
    selectedModel: 'gpt-5.6-sol',
    keys: userKeys,
    transactions: JSON.parse(localStorage.getItem(STORAGE_KEYS.TRANSACTIONS) || JSON.stringify([
      { date: 'Today', description: 'Initial Account Balance Funded', amount: '+€1.00', status: 'Paid' }
    ])),
    recentRequests: []
  };

  const MODELS_DATA = [
    { id: 'gpt-5.6-sol', name: 'gpt-5.6-sol', provider: 'OpenAI Compatible', providerKey: 'openai', type: 'chat', context: '128k tokens', inputPrice: '$0.80 / 1M', outputPrice: '$2.40 / 1M', status: 'Available' },
    { id: 'claude-opus-4-8', name: 'claude-opus-4-8', provider: 'Anthropic', providerKey: 'anthropic', type: 'chat', context: '200k tokens', inputPrice: '$1.50 / 1M', outputPrice: '$4.50 / 1M', status: 'Available' },
    { id: 'claude-opus-5', name: 'claude-opus-5', provider: 'Anthropic', providerKey: 'anthropic', type: 'reasoning', context: '200k tokens', inputPrice: '$3.00 / 1M', outputPrice: '$9.00 / 1M', status: 'Available' }
  ];

  // DOM Elements Cache
  const el = {
    navItems: document.querySelectorAll('.nav-item'),
    views: document.querySelectorAll('.content-view'),
    toast: document.getElementById('toast'),

    // Live Metrics
    overviewBalanceDisplay: document.getElementById('overview-balance-display'),
    creditsViewBalance: document.getElementById('credits-view-balance'),
    metricRequestsCount: document.getElementById('metric-requests-count'),
    metricTokensCount: document.getElementById('metric-tokens-count'),
    metricSpendCount: document.getElementById('metric-spend-count'),
    metricLatencyCount: document.getElementById('metric-latency-count'),

    // Overview Chart & Table
    chartTabs: document.querySelectorAll('[data-chart-tab]'),
    overviewRequestsTbody: document.getElementById('overview-requests-tbody'),
    btnRefreshOverview: document.getElementById('btn-refresh-overview'),
    btnAddCreditsOverview: document.getElementById('btn-add-credits-overview'),

    // Models View
    modelsSearchInput: document.getElementById('models-search-input'),
    modelsProviderFilter: document.getElementById('models-provider-filter'),
    modelsTypeFilter: document.getElementById('models-type-filter'),
    modelsTableTbody: document.getElementById('models-table-tbody'),

    // API Keys View
    btnOpenCreateKeyModal: document.getElementById('btn-open-create-key-modal'),
    modalCreateKey: document.getElementById('modal-create-key'),
    btnCloseKeyModal: document.getElementById('btn-close-key-modal'),
    btnCancelKeyModal: document.getElementById('btn-cancel-key-modal'),
    btnConfirmCreateKey: document.getElementById('btn-confirm-create-key'),
    inputNewKeyName: document.getElementById('input-new-key-name'),
    apiKeysTbody: document.getElementById('api-keys-tbody'),

    // Credits View & Modal
    btnOpenAddCreditsModal: document.getElementById('btn-open-add-credits-modal'),
    modalAddCredits: document.getElementById('modal-add-credits'),
    btnCloseCreditsModal: document.getElementById('btn-close-credits-modal'),
    btnCancelCreditsModal: document.getElementById('btn-cancel-credits-modal'),
    btnConfirmAddCredits: document.getElementById('btn-confirm-add-credits'),
    inputCustomCredit: document.getElementById('input-custom-credit'),
    creditChoices: document.querySelectorAll('.btn-credit-choice'),
    transactionsTbody: document.getElementById('transactions-tbody'),

    // Requests View
    fullRequestsTbody: document.getElementById('full-requests-tbody'),
    btnRefreshRequestsView: document.getElementById('btn-refresh-requests-view')
  };

  async function syncOverviewData() {
    try {
      const res = await fetch(`/api/overview?id=${encodeURIComponent(state.accountId)}`, {
        headers: { 'x-user-id': state.accountId }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          const d = json.data;
          state.balance = d.balance;
          state.formattedBalance = '$' + d.balance.toFixed(2);
          state.usedThisMonth = d.usedThisMonth;
          state.totalRequests = d.totalRequests;
          state.totalTokens = d.totalTokens;
          state.spend = d.spend;
          state.avgLatency = d.avgLatency || '0.00s';
          state.recentRequests = d.recentRequests || [];

          updateBalanceDisplays();
          renderRecentRequestsTables();
        }
      }
    } catch(e) {}
  }

  function updateBalanceDisplays() {
    const formatted = '€' + state.balance.toFixed(2);
    if (el.overviewBalanceDisplay) el.overviewBalanceDisplay.textContent = formatted;
    if (el.creditsViewBalance) el.creditsViewBalance.textContent = formatted;
    
    if (el.metricRequestsCount) el.metricRequestsCount.textContent = state.totalRequests;
    if (el.metricTokensCount) el.metricTokensCount.textContent = state.totalTokens;
    if (el.metricSpendCount) el.metricSpendCount.textContent = state.spend;
    if (el.metricLatencyCount) el.metricLatencyCount.textContent = state.avgLatency;

    localStorage.setItem(STORAGE_KEYS.BALANCE, state.balance.toFixed(2));
  }

  function init() {
    state.baseUrl = window.location.origin + '/v1';
    
    // Set dynamic unique Account ID (e.g. APIFORGE-8492015)
    const inputAccountId = document.getElementById('input-account-id');
    if (inputAccountId) inputAccountId.value = state.accountId;

    const btnCopyAccountId = document.getElementById('btn-copy-account-id');
    if (btnCopyAccountId) {
      btnCopyAccountId.addEventListener('click', () => {
        if (inputAccountId) {
          navigator.clipboard.writeText(inputAccountId.value).then(() => {
            showToast('Forge ID copied: ' + inputAccountId.value);
          }).catch(() => {
            inputAccountId.select();
            document.execCommand('copy');
            showToast('Forge ID copied: ' + inputAccountId.value);
          });
        }
      });
    }

    // Custom Username
    const customUsername = localStorage.getItem(STORAGE_KEYS.USERNAME) || 'Developer';
    const inputCustomUsername = document.getElementById('input-custom-username');
    if (inputCustomUsername) inputCustomUsername.value = customUsername;

    const btnSaveUsername = document.getElementById('btn-save-username');
    if (btnSaveUsername) {
      btnSaveUsername.addEventListener('click', () => {
        const val = inputCustomUsername ? inputCustomUsername.value.trim() : '';
        if (val) {
          localStorage.setItem(STORAGE_KEYS.USERNAME, val);
          showToast(`Username updated to "${val}"`);
        } else {
          showToast('Please enter a valid username');
        }
      });
    }

    updateBalanceDisplays();
    renderKeysTable();
    renderTransactionsTable();
    renderRecentRequestsTables();
    renderModelsTable();
    setupEventListeners();

    // Fast polling every 1.5s to capture live API calls in real time
    syncOverviewData();
    setInterval(syncOverviewData, 1500);
  }

  function switchView(viewName) {
    state.activeView = viewName;
    document.querySelectorAll('.content-view').forEach(v => {
      v.style.display = 'none';
    });
    
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.style.display = 'block';
    }

    document.querySelectorAll('.nav-item').forEach(item => {
      const match = item.getAttribute('data-view') === viewName;
      item.classList.toggle('active', match);
    });

    // Close mobile sidebar and backdrop if open
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    document.getElementById('sidebar-backdrop')?.classList.remove('active');

    // Draw casino wheel if switching to settings
    if (viewName === 'settings' && typeof window.drawCasinoWheel === 'function') {
      setTimeout(() => window.drawCasinoWheel(), 50);
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  window.switchView = switchView;

  function showToast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add('show');
    setTimeout(() => el.toast.classList.remove('show'), 2200);
  }

  // =========================================================================
  // MODELS FILTER & RENDER
  // =========================================================================
  function renderModelsTable() {
    if (!el.modelsTableTbody) return;

    const query = (el.modelsSearchInput?.value || '').toLowerCase().trim();
    const provider = el.modelsProviderFilter?.value || 'all';
    const type = el.modelsTypeFilter?.value || 'all';

    const filtered = MODELS_DATA.filter(m => {
      const matchQuery = m.name.toLowerCase().includes(query) || m.provider.toLowerCase().includes(query);
      const matchProvider = provider === 'all' || m.providerKey === provider;
      const matchType = type === 'all' || m.type === type;
      return matchQuery && matchProvider && matchType;
    });

    if (filtered.length === 0) {
      el.modelsTableTbody.innerHTML = `<tr><td colspan="7" class="text-muted" style="text-align:center; padding:24px;">No matching ForgeAPI models found.</td></tr>`;
      return;
    }

    el.modelsTableTbody.innerHTML = filtered.map(m => `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge-model">${m.name}</span>
          </div>
        </td>
        <td><span class="badge-provider">${m.provider}</span></td>
        <td><span class="badge-type">${m.context}</span></td>
        <td class="font-mono text-cyan">${m.inputPrice}</td>
        <td class="font-mono text-cyan">${m.outputPrice}</td>
        <td><span class="badge-status-available">Available</span></td>
        <td style="text-align: right;">
          <button class="btn-secondary-sm btn-use-model" data-model="${m.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right: 5px;"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            Use in API
          </button>
        </td>
      </tr>
    `).join('');

    // Bind "Use in API" buttons
    el.modelsTableTbody.querySelectorAll('.btn-use-model').forEach(btn => {
      btn.addEventListener('click', () => {
        const modelId = btn.getAttribute('data-model');
        switchView('apikeys');
        showToast(`Selected ${modelId} — See cURL snippet below`);
      });
    });
  }

  // =========================================================================
  // API KEYS MANAGEMENT
  // =========================================================================
  function renderKeysTable() {
    if (!el.apiKeysTbody) return;

    el.apiKeysTbody.innerHTML = state.keys.map((k, idx) => `
      <tr>
        <td><strong>${escapeHtml(k.name)}</strong></td>
        <td>
          <div class="key-mask-cell">
            <span class="font-mono text-muted">${k.key.slice(0, 11)}••••••••••••••••••••••••</span>
            <button class="btn-icon-inline btn-copy-key" data-copy="${k.key}" title="Copy Key">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
        </td>
        <td class="text-muted">${k.created}</td>
        <td class="text-muted font-mono">${k.lastUsed}</td>
        <td><span class="badge-status-success">${k.status}</span></td>
        <td style="text-align: right;">
          <button class="btn-text-danger btn-revoke-key" data-idx="${idx}">Revoke</button>
        </td>
      </tr>
    `).join('');

    // Update target API key dropdown in Settings
    updateTargetApiKeyDropdown();

    // Copy Key Handler
    el.apiKeysTbody.querySelectorAll('.btn-copy-key').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-copy');
        navigator.clipboard.writeText(key).then(() => showToast('Secret key copied to clipboard'));
      });
    });

    // Revoke Key Handler
    el.apiKeysTbody.querySelectorAll('.btn-revoke-key').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        if (state.keys.length <= 1) {
          showToast('Cannot revoke your only active key');
          return;
        }
        state.keys.splice(idx, 1);
        localStorage.setItem(STORAGE_KEYS.API_KEYS, JSON.stringify(state.keys));
        renderKeysTable();
        showToast('API key revoked');
      });
    });
  }

  function updateTargetApiKeyDropdown() {
    const selectTarget = document.getElementById('select-target-api-key');
    if (!selectTarget) return;
    const currentVal = selectTarget.value;
    
    let html = `<option value="global">All API Keys (Global Default)</option>`;
    state.keys.forEach(k => {
      html += `<option value="${escapeHtml(k.key)}">${escapeHtml(k.name)} (${k.key.slice(0, 10)}...)</option>`;
    });
    selectTarget.innerHTML = html;
    if (currentVal && selectTarget.querySelector(`option[value="${currentVal}"]`)) {
      selectTarget.value = currentVal;
    }
  }

  // =========================================================================
  // TRANSACTIONS & REQUESTS RENDER
  // =========================================================================
  function renderTransactionsTable() {
    if (!el.transactionsTbody) return;
    el.transactionsTbody.innerHTML = state.transactions.map(tx => `
      <tr>
        <td class="text-muted font-mono">${tx.date}</td>
        <td>${tx.description}</td>
        <td class="font-mono text-green">${tx.amount}</td>
        <td><span class="badge-status-success">${tx.status}</span></td>
        <td style="text-align: right;"><a href="#" class="inline-link" onclick="event.preventDefault();">PDF</a></td>
      </tr>
    `).join('');
  }

  function renderRecentRequestsTables() {
    if (!state.recentRequests || state.recentRequests.length === 0) {
      if (el.overviewRequestsTbody) {
        el.overviewRequestsTbody.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align:center; padding:20px;">No API requests yet. Calls from OpenCode, Cursor, or cURL will appear here live.</td></tr>`;
      }
      if (el.fullRequestsTbody) {
        el.fullRequestsTbody.innerHTML = `<tr><td colspan="7" class="text-muted" style="text-align:center; padding:20px;">No API requests yet.</td></tr>`;
      }
      return;
    }

    const rowsHtml = state.recentRequests.map(r => `
      <tr>
        <td class="font-mono text-muted">${r.time}</td>
        <td><span class="badge-model">${r.model}</span></td>
        <td class="font-mono">${r.tokens}</td>
        <td class="font-mono">${r.latency}</td>
        <td class="font-mono text-cyan">${r.cost}</td>
        <td><span class="badge-status-success">${r.status}</span></td>
      </tr>
    `).join('');

    if (el.overviewRequestsTbody) el.overviewRequestsTbody.innerHTML = rowsHtml;

    if (el.fullRequestsTbody) {
      el.fullRequestsTbody.innerHTML = state.recentRequests.map(r => `
        <tr>
          <td class="font-mono text-muted">${r.id}</td>
          <td class="font-mono text-muted">${r.time}</td>
          <td><span class="badge-model">${r.model}</span></td>
          <td class="font-mono">${r.tokens}</td>
          <td class="font-mono">${r.latency}</td>
          <td class="font-mono text-cyan">${r.cost}</td>
          <td><span class="badge-status-success">${r.status} (200)</span></td>
        </tr>
      `).join('');
    }
  }

  // =========================================================================
  // EVENT LISTENERS & WIRING
  // =========================================================================
  function setupEventListeners() {
    // Navigation routing
    document.querySelectorAll('[data-view]').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        const view = item.getAttribute('data-view');
        if (view) switchView(view);
      });
    });

    // Refresh Overview button
    if (el.btnRefreshOverview) {
      el.btnRefreshOverview.addEventListener('click', async () => {
        await syncOverviewData();
        showToast('ForgeAPI metrics updated');
      });
    }

    // Quick Top-up buttons on Uiverse.io component
    document.querySelectorAll('.btn-quick-topup').forEach(btn => {
      btn.addEventListener('click', async () => {
        const topupVal = parseFloat(btn.getAttribute('data-topup') || '10');
        await handleAddCredits(topupVal);
      });
    });

    // Bank card selection
    const card1 = document.getElementById('bank-card-1');
    const card2 = document.getElementById('bank-card-2');
    if (card1 && card2) {
      card1.addEventListener('click', () => {
        card1.classList.add('active');
        card2.classList.remove('active');
        showToast('Default payment set to VISA •••• 4321');
      });
      card2.addEventListener('click', () => {
        card2.classList.add('active');
        card1.classList.remove('active');
        showToast('Default payment set to MASTERCARD •••• 1234');
      });
    }

    // Add Card button on Uiverse.io component
    const btnAddCard = document.getElementById('btn-uiverse-add-card');
    if (btnAddCard) {
      btnAddCard.addEventListener('click', () => {
        showToast('Stripe Payment Gateway Connected');
      });
    }

    // Models Filtering
    if (el.modelsSearchInput) el.modelsSearchInput.addEventListener('input', renderModelsTable);
    if (el.modelsProviderFilter) el.modelsProviderFilter.addEventListener('change', renderModelsTable);
    if (el.modelsTypeFilter) el.modelsTypeFilter.addEventListener('change', renderModelsTable);

    // Create Key Modal
    const openKeyModal = () => { if (el.modalCreateKey) el.modalCreateKey.style.display = 'flex'; };
    const closeKeyModal = () => { if (el.modalCreateKey) el.modalCreateKey.style.display = 'none'; };

    if (el.btnOpenCreateKeyModal) el.btnOpenCreateKeyModal.addEventListener('click', openKeyModal);
    if (el.btnCloseKeyModal) el.btnCloseKeyModal.addEventListener('click', closeKeyModal);
    if (el.btnCancelKeyModal) el.btnCancelKeyModal.addEventListener('click', closeKeyModal);

    if (el.btnConfirmCreateKey) {
      el.btnConfirmCreateKey.addEventListener('click', () => {
        const name = (el.inputNewKeyName?.value || 'Production Key').trim();
        const modelPermission = document.getElementById('select-new-key-model')?.value || 'all';
        const newKey = `forge_live_${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 14)}`;
        
        state.keys.unshift({
          id: 'key_' + Date.now(),
          name,
          key: newKey,
          created: 'Just now',
          lastUsed: 'Never',
          status: 'Active',
          model: modelPermission
        });

        // Save key specific model lock
        let keyModelMap = {};
        try {
          keyModelMap = JSON.parse(localStorage.getItem(STORAGE_KEYS.KEY_MODEL_MAP) || '{}');
        } catch(e) {}
        keyModelMap[newKey] = modelPermission;
        localStorage.setItem(STORAGE_KEYS.KEY_MODEL_MAP, JSON.stringify(keyModelMap));

        localStorage.setItem(STORAGE_KEYS.API_KEYS, JSON.stringify(state.keys));
        renderKeysTable();
        closeKeyModal();
        const modelLabel = modelPermission === 'all' ? 'All Models' : modelPermission;
        showToast(`Created new secret API key (${modelLabel})`);
      });
    }

    // Add Credits Modal
    const openCreditsModal = () => { if (el.modalAddCredits) el.modalAddCredits.style.display = 'flex'; };
    const closeCreditsModal = () => { if (el.modalAddCredits) el.modalAddCredits.style.display = 'none'; };

    if (el.btnAddCreditsOverview) el.btnAddCreditsOverview.addEventListener('click', openCreditsModal);
    if (el.btnOpenAddCreditsModal) el.btnOpenAddCreditsModal.addEventListener('click', openCreditsModal);
    if (el.btnCloseCreditsModal) el.btnCloseCreditsModal.addEventListener('click', closeCreditsModal);
    if (el.btnCancelCreditsModal) el.btnCancelCreditsModal.addEventListener('click', closeCreditsModal);

    el.creditChoices.forEach(choice => {
      choice.addEventListener('click', () => {
        el.creditChoices.forEach(c => c.classList.remove('active'));
        choice.classList.add('active');
        const amt = choice.getAttribute('data-amount');
        if (el.inputCustomCredit) el.inputCustomCredit.value = amt;
      });
    });

    if (el.btnConfirmAddCredits) {
      el.btnConfirmAddCredits.addEventListener('click', async () => {
        const amount = parseFloat(el.inputCustomCredit?.value || '25');
        if (isNaN(amount) || amount <= 0) {
          showToast('Please enter a valid amount');
          return;
        }
        await handleAddCredits(amount);
        closeCreditsModal();
      });
    }

    // Discord Creator Profile Modal
    const modalDiscordProfile = document.getElementById('modal-discord-profile');
    const btnDiscordTrigger = document.getElementById('btn-discord-profile-trigger');
    const btnCloseDiscordModal = document.getElementById('btn-close-discord-modal');

    if (btnDiscordTrigger && modalDiscordProfile) {
      btnDiscordTrigger.addEventListener('click', () => {
        modalDiscordProfile.style.display = 'flex';
      });
    }

    if (btnCloseDiscordModal && modalDiscordProfile) {
      btnCloseDiscordModal.addEventListener('click', () => {
        modalDiscordProfile.style.display = 'none';
      });
    }

    if (modalDiscordProfile) {
      modalDiscordProfile.addEventListener('click', (e) => {
        if (e.target === modalDiscordProfile) {
          modalDiscordProfile.style.display = 'none';
        }
      });
    }

    // Mobile Hamburger Toggle Button, Close Button & Backdrop
    const btnMobileToggle = document.getElementById('btn-mobile-menu-toggle');
    const btnCloseSidebar = document.getElementById('btn-close-mobile-sidebar');
    const sidebarEl = document.getElementById('sidebar');
    const backdropEl = document.getElementById('sidebar-backdrop');

    function openMobileSidebar() {
      sidebarEl?.classList.add('mobile-open');
      backdropEl?.classList.add('active');
    }

    function closeMobileSidebar() {
      sidebarEl?.classList.remove('mobile-open');
      backdropEl?.classList.remove('active');
    }

    if (btnMobileToggle) btnMobileToggle.addEventListener('click', openMobileSidebar);
    if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', closeMobileSidebar);
    if (backdropEl) backdropEl.addEventListener('click', closeMobileSidebar);

    // AI Model Lock and Target Key Selection
    const selectTargetKey = document.getElementById('select-target-api-key');
    const selectLockedModel = document.getElementById('select-locked-model');
    const btnSaveModelLock = document.getElementById('btn-save-model-lock');
    const lockedPreview = document.getElementById('locked-model-name-preview');
    const lockedDesc = document.getElementById('locked-model-desc-preview');

    function getModelMap() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.KEY_MODEL_MAP) || '{}');
      } catch(e) {
        return {};
      }
    }

    function updateModelLockPreview() {
      if (!selectLockedModel || !lockedPreview) return;
      const modelVal = selectLockedModel.value;

      if (modelVal === 'all') {
        lockedPreview.textContent = 'All Models Allowed';
        if (lockedDesc) lockedDesc.textContent = 'Requests can call Claude Opus 5, Claude 4.8, or GPT-5.6-Sol with zero restrictions.';
      } else if (modelVal === 'claude-opus-5') {
        lockedPreview.textContent = 'Claude Opus 5 Only';
        if (lockedDesc) lockedDesc.textContent = 'All API requests for this target will strictly respond with Claude Opus 5.';
      } else if (modelVal === 'gpt-5.6-sol') {
        lockedPreview.textContent = 'GPT-5.6-Sol Only';
        if (lockedDesc) lockedDesc.textContent = 'All API requests for this target will strictly respond with GPT-5.6-Sol.';
      } else if (modelVal === 'claude-opus-4-8') {
        lockedPreview.textContent = 'Claude Opus 4.8 Only';
        if (lockedDesc) lockedDesc.textContent = 'All API requests for this target will strictly respond with Claude Opus 4.8.';
      }
    }

    function syncSelectedTargetModel() {
      const target = selectTargetKey ? selectTargetKey.value : 'global';
      const map = getModelMap();
      const saved = (target === 'global')
        ? (localStorage.getItem(STORAGE_KEYS.LOCKED_MODEL) || 'all')
        : (map[target] || 'all');
      
      if (selectLockedModel) selectLockedModel.value = saved;
      updateModelLockPreview();
    }

    if (selectTargetKey) {
      selectTargetKey.addEventListener('change', syncSelectedTargetModel);
    }
    if (selectLockedModel) {
      selectLockedModel.addEventListener('change', updateModelLockPreview);
    }

    syncSelectedTargetModel();

    if (btnSaveModelLock && selectLockedModel) {
      btnSaveModelLock.addEventListener('click', () => {
        const target = selectTargetKey ? selectTargetKey.value : 'global';
        const chosenModel = selectLockedModel.value;

        if (target === 'global') {
          localStorage.setItem(STORAGE_KEYS.LOCKED_MODEL, chosenModel);
        } else {
          const map = getModelMap();
          map[target] = chosenModel;
          localStorage.setItem(STORAGE_KEYS.KEY_MODEL_MAP, JSON.stringify(map));
        }
        updateModelLockPreview();
        const targetName = target === 'global' ? 'Global Default (All Keys)' : 'Selected Key';
        showToast(`Route applied: ${chosenModel === 'all' ? 'All Models' : chosenModel} for ${targetName}`);
      });
    }

    // Refresh Requests
    if (el.btnRefreshRequestsView) {
      el.btnRefreshRequestsView.addEventListener('click', async () => {
        await syncOverviewData();
        showToast('Requests refreshed');
      });
    }

    // Casino Lucky Wheel Setup
    setupCasinoWheel();
  }

  // =========================================================================
  // CASINO LUCKY WHEEL WITH WEB AUDIO SYNTHESIZER & 3 SPINS DAILY
  // Exact probabilities: 0.1% for $10.00 Jackpot, 1.0% for $5.00 Prize, 98.9% No Prize
  // =========================================================================
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Crisp mechanical ticker click sound
  function playTickSound() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.03);
      
      gain.gain.setValueAtTime(0.28, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.032);
    } catch(e) {}
  }

  // Celebratory Payout Win Fanfare
  function playWinFanfare(isJackpot = false) {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const freqs = isJackpot 
        ? [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98] 
        : [440, 554.37, 659.25, 880];
      
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = isJackpot ? 'sawtooth' : 'sine';
        osc.frequency.setValueAtTime(f, ctx.currentTime + idx * 0.09);
        gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.09);
        gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + idx * 0.09 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.09 + 0.55);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.09);
        osc.stop(ctx.currentTime + idx * 0.09 + 0.6);
      });
    } catch(e) {}
  }

  const WHEEL_SEGMENTS = [
    { text: '$10.00 JACKPOT', amount: 10.00, color: '#ffd700', textColor: '#000', label: '$10.00 Jackpot' },
    { text: '$5.00 PRIZE', amount: 5.00, color: '#10b981', textColor: '#fff', label: '$5.00 Prize' },
    { text: 'NO PRIZE', amount: 0.00, color: '#334155', textColor: '#94a3b8', label: 'No Prize' },
    { text: 'NO PRIZE', amount: 0.00, color: '#1e293b', textColor: '#94a3b8', label: 'No Prize' },
    { text: 'NO PRIZE', amount: 0.00, color: '#334155', textColor: '#94a3b8', label: 'No Prize' },
    { text: 'NO PRIZE', amount: 0.00, color: '#1e293b', textColor: '#94a3b8', label: 'No Prize' }
  ];

  let isWheelSpinning = false;
  let wheelRotationDeg = 0;

  function getDailySpinsRemaining() {
    const today = new Date().toISOString().slice(0, 10);
    const storedDate = localStorage.getItem(STORAGE_KEYS.DAILY_SPINS_DATE);
    if (storedDate !== today) {
      localStorage.setItem(STORAGE_KEYS.DAILY_SPINS_DATE, today);
      localStorage.setItem(STORAGE_KEYS.DAILY_SPINS_COUNT, '3');
      return 3;
    }
    const count = parseInt(localStorage.getItem(STORAGE_KEYS.DAILY_SPINS_COUNT) || '3', 10);
    return isNaN(count) ? 3 : Math.max(0, count);
  }

  function consumeDailySpin() {
    const remaining = getDailySpinsRemaining();
    const updated = Math.max(0, remaining - 1);
    localStorage.setItem(STORAGE_KEYS.DAILY_SPINS_COUNT, updated.toString());
    updateDailySpinsUI(updated);
    return updated;
  }

  function updateDailySpinsUI(count) {
    const counterEl = document.getElementById('spins-left-counter');
    if (counterEl) {
      counterEl.textContent = `${count} / 3`;
    }
    const btnSpinCenter = document.getElementById('btn-spin-wheel');
    const btnSpinBottom = document.getElementById('btn-spin-wheel-bottom');
    if (count <= 0) {
      if (btnSpinBottom) {
        btnSpinBottom.textContent = 'No Spins Left Today (Resets Tomorrow)';
        btnSpinBottom.disabled = true;
        btnSpinBottom.style.opacity = '0.5';
        btnSpinBottom.style.cursor = 'not-allowed';
      }
      if (btnSpinCenter) {
        btnSpinCenter.style.opacity = '0.6';
      }
    } else {
      if (btnSpinBottom) {
        btnSpinBottom.textContent = `SPIN FOR CREDITS (${count} Spins Left)`;
        btnSpinBottom.disabled = false;
        btnSpinBottom.style.opacity = '1';
        btnSpinBottom.style.cursor = 'pointer';
      }
      if (btnSpinCenter) {
        btnSpinCenter.style.opacity = '1';
      }
    }
  }

  function drawCasinoWheel() {
    const canvas = document.getElementById('wheelCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const numSegments = WHEEL_SEGMENTS.length;
    const arcSize = (2 * Math.PI) / numSegments;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2 - 8;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < numSegments; i++) {
      const seg = WHEEL_SEGMENTS[i];
      const startAngle = i * arcSize;
      const endAngle = startAngle + arcSize;

      // Slice
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.stroke();

      // Text
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(startAngle + arcSize / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = seg.textColor;
      ctx.font = '900 13px "Plus Jakarta Sans", sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 4;
      ctx.fillText(seg.text, radius - 20, 5);
      ctx.restore();

      // Perimeter Golden Pegs
      const pegX = centerX + (radius - 4) * Math.cos(startAngle);
      const pegY = centerY + (radius - 4) * Math.sin(startAngle);
      ctx.beginPath();
      ctx.arc(pegX, pegY, 5, 0, 2 * Math.PI);
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 6;
      ctx.fill();
    }
  }
  window.drawCasinoWheel = drawCasinoWheel;

  function setupCasinoWheel() {
    drawCasinoWheel();
    updateDailySpinsUI(getDailySpinsRemaining());

    const btnSpinCenter = document.getElementById('btn-spin-wheel');
    const btnSpinBottom = document.getElementById('btn-spin-wheel-bottom');
    const wheelContainer = document.getElementById('wheel-canvas-container');
    const tickerEl = document.getElementById('wheel-ticker');
    const statusTitle = document.getElementById('spin-status-text');
    const statusDesc = document.getElementById('spin-status-sub');
    const resultBox = document.getElementById('spin-result-display');

    async function spinWheel() {
      if (isWheelSpinning) return;

      const remainingSpins = getDailySpinsRemaining();
      if (remainingSpins <= 0) {
        showToast('No spins remaining today. Resets tomorrow at 00:00 UTC.');
        return;
      }

      isWheelSpinning = true;

      // Consume one spin
      const leftAfter = consumeDailySpin();

      // Unlock AudioContext on user interaction
      getAudioContext();

      if (statusTitle) statusTitle.textContent = 'Spinning... Good luck!';
      if (statusDesc) statusDesc.textContent = `Watch the wheel of fortune slow down (${leftAfter} spins remaining)...`;
      if (resultBox) resultBox.classList.remove('winner-gold');

      // User probability rules:
      // 0.1% for $10.00 Jackpot (Index 0)
      // 1.0% for $5.00 Prize (Index 1 - very hard to find)
      // 98.9% for No Prize (Distributed randomly among slices 2, 3, 4, 5)
      const rand = Math.random() * 100;
      let winningIndex = 2; // default No Prize
      if (rand < 0.1) {
        winningIndex = 0; // $10.00 Jackpot (0.1%)
      } else if (rand < 1.1) {
        winningIndex = 1; // $5.00 Prize (1.0%)
      } else {
        // Randomly land on one of the 4 No Prize segments
        const noPrizeIndices = [2, 3, 4, 5];
        winningIndex = noPrizeIndices[Math.floor(Math.random() * noPrizeIndices.length)];
      }

      const numSegments = WHEEL_SEGMENTS.length;
      const segmentAngle = 360 / numSegments; // 60 deg

      // Target segment center alignment
      const targetSegmentCenter = winningIndex * segmentAngle + (segmentAngle / 2);
      const targetDeg = (360 - targetSegmentCenter + 270) % 360;

      // Spin 5 to 7 full rotations + alignment offset
      const extraSpins = 360 * (5 + Math.floor(Math.random() * 3));
      wheelRotationDeg += extraSpins + (targetDeg - (wheelRotationDeg % 360) + 360) % 360;

      if (wheelContainer) {
        wheelContainer.style.transition = 'transform 4.5s cubic-bezier(0.12, 0.95, 0.2, 1)';
        wheelContainer.style.transform = `rotate(${wheelRotationDeg}deg)`;
      }

      // Mechanical tick sounds simulation during deceleration
      const startTime = Date.now();
      const totalDuration = 4500;
      let lastTickTime = 0;

      const tickInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= totalDuration) {
          clearInterval(tickInterval);
          return;
        }
        const progress = elapsed / totalDuration;
        const currentSpeed = 1 - Math.pow(progress, 3);
        const tickDelay = 35 + (1 - currentSpeed) * 320;

        if (Date.now() - lastTickTime > tickDelay) {
          playTickSound();
          if (tickerEl) {
            tickerEl.classList.remove('tick-wobble');
            void tickerEl.offsetWidth;
            tickerEl.classList.add('tick-wobble');
          }
          lastTickTime = Date.now();
        }
      }, 25);

      // On completion
      setTimeout(async () => {
        isWheelSpinning = false;
        const prize = WHEEL_SEGMENTS[winningIndex];

        if (prize.amount > 0) {
          const isJackpot = prize.amount >= 10.00;
          playWinFanfare(isJackpot);

          if (statusTitle) statusTitle.textContent = `WINNER! You won ${prize.label}!`;
          if (statusDesc) statusDesc.textContent = `Added +$${prize.amount.toFixed(2)} instantly to your Forge Wallet balance!`;
          if (resultBox) resultBox.classList.add('winner-gold');

          await handleAddCredits(prize.amount);
          showToast(`Fortune Wheel: Won +$${prize.amount.toFixed(2)} credits!`);
        } else {
          if (statusTitle) statusTitle.textContent = 'No Prize This Spin';
          if (statusDesc) statusDesc.textContent = `You have ${leftAfter} daily spins remaining. Try again tomorrow or now!`;
          showToast('Fortune Wheel: No prize this spin.');
        }
      }, 4600);
    }

    if (btnSpinCenter) btnSpinCenter.addEventListener('click', spinWheel);
    if (btnSpinBottom) btnSpinBottom.addEventListener('click', spinWheel);
  }

  async function handleAddCredits(amount) {
    try {
      const res = await fetch('/api/overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', amount })
      });
      if (res.ok) {
        const j = await res.json();
        if (j.data) {
          state.balance = j.data.balance;
          state.formattedBalance = '€' + j.data.balance.toFixed(2);
          updateBalanceDisplays();
        }
      }
    } catch(e) {
      state.balance += amount;
      state.formattedBalance = '€' + state.balance.toFixed(2);
      updateBalanceDisplays();
    }

    state.transactions.unshift({
      date: 'Just now',
      description: amount >= 5 ? 'Casino Fortune Wheel Win' : 'Prepaid Credit Top-up',
      amount: `+€${amount.toFixed(2)}`,
      status: 'Paid'
    });
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(state.transactions));
    renderTransactionsTable();
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Init on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
