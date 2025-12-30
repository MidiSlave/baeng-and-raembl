/**
 * Settings Panel Tab System
 * Handles tab switching for Bæng (6 tabs) and Ræmbl (5 tabs) settings panels
 */

/**
 * Initialise tab event listeners for all settings panels
 */
export function initSettingsTabs() {
    document.querySelectorAll('.settings-tabs').forEach(tabBar => {
        tabBar.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tabBar, tab));
        });
    });
}

/**
 * Switch to a specific tab
 * @param {HTMLElement} tabBar - The tab bar container
 * @param {HTMLElement} clickedTab - The tab button that was clicked
 */
function switchTab(tabBar, clickedTab) {
    const panelId = tabBar.dataset.settingsFor;
    const tabName = clickedTab.dataset.tab;
    const panel = document.getElementById(`${panelId}-settings-panel`);

    if (!panel) {
        console.warn(`[Settings] Panel not found: ${panelId}-settings-panel`);
        return;
    }

    // Update active tab styling
    tabBar.querySelectorAll('.settings-tab').forEach(t => {
        t.classList.toggle('active', t === clickedTab);
    });

    // Show/hide tab panels
    panel.querySelectorAll('.settings-tab-panel').forEach(p => {
        p.classList.toggle('active', p.dataset.tabPanel === tabName);
    });
}

/**
 * Reset a settings panel to show the first tab (PATCH)
 * Call this when opening a settings panel
 * @param {string} namespace - 'baeng' or 'raembl'
 */
export function resetSettingsTab(namespace) {
    const panel = document.getElementById(`${namespace}-settings-panel`);
    if (!panel) return;

    const tabBar = panel.querySelector('.settings-tabs');
    if (!tabBar) return;

    const firstTab = tabBar.querySelector('.settings-tab');
    if (firstTab) {
        switchTab(tabBar, firstTab);
    }
}
