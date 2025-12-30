// File: js/components/engine-dropdown.js
// Custom dropdown component for engine selection

import { ENGINE_CYCLE_ORDER } from '../modules/engines.js';

/**
 * Display names for engines (matches existing system)
 */
const ENGINE_DISPLAY_NAMES = {
    'DX7': 'DX7',
    'SAMPLE': 'SMPL',
    'aKICK': 'aKCK',
    'aSNARE': 'aSNR',
    'aHIHAT': 'aHAT'
};

/**
 * Get display name for engine
 */
function getEngineDisplayName(engineType) {
    return ENGINE_DISPLAY_NAMES[engineType] || engineType;
}

/**
 * Generate dropdown HTML structure
 * @param {string} currentEngine - The currently selected engine type
 * @returns {string} HTML string for the dropdown
 */
export function generateEngineDropdownHTML(currentEngine) {
    let html = `
        <div class="engine-dropdown-container">
            <button
                class="engine-dropdown-button"
                aria-haspopup="listbox"
                aria-expanded="false"
                aria-label="Select engine type"
            >
                <span class="dropdown-selected-text">${getEngineDisplayName(currentEngine)}</span>
                <svg class="dropdown-arrow" viewBox="0 0 12 8">
                    <path d="M1 1 L6 6 L11 1" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>

            <div
                class="engine-dropdown-menu hidden"
                role="listbox"
                aria-label="Engine types"
            >
    `;

    // Generate engine options from ENGINE_CYCLE_ORDER
    ENGINE_CYCLE_ORDER.forEach(engine => {
        const isSelected = engine === currentEngine;
        const displayName = getEngineDisplayName(engine);

        html += `
                <button
                    class="dropdown-option"
                    role="option"
                    data-engine="${engine}"
                    data-display="${displayName}"
                    aria-selected="${isSelected}"
                >
                    <span class="dropdown-option-text">${displayName}</span>
                </button>
        `;
    });

    html += `
            </div>
        </div>
    `;

    return html;
}

/**
 * Setup event listeners for engine dropdown
 * @param {HTMLElement} dropdownContainer - The dropdown container element
 * @param {Function} onEngineChange - Callback function when engine is selected
 * @returns {Function} Cleanup function to remove event listeners
 */
export function setupEngineDropdown(dropdownContainer, onEngineChange) {
    const button = dropdownContainer.querySelector('.engine-dropdown-button');
    const menu = dropdownContainer.querySelector('.engine-dropdown-menu');
    const options = dropdownContainer.querySelectorAll('.dropdown-option');
    const selectedText = button?.querySelector('.dropdown-selected-text');

    if (!button || !menu) return;

    let isOpen = false;

    // Toggle dropdown
    const handleButtonClick = (e) => {
        e.stopPropagation();
        toggleDropdown();
    };

    button.addEventListener('click', handleButtonClick);

    // Select engine option
    const optionClickHandlers = [];
    options.forEach(option => {
        const handler = (e) => {
            e.stopPropagation();
            const engine = option.dataset.engine;
            const display = option.dataset.display;
            selectEngine(engine, display);
        };
        option.addEventListener('click', handler);
        optionClickHandlers.push({ option, handler });
    });

    // Close on click outside
    const handleDocumentClick = (e) => {
        if (isOpen && !dropdownContainer.contains(e.target)) {
            closeDropdown();
        }
    };

    document.addEventListener('click', handleDocumentClick);

    // Close on Escape key
    const handleEscapeKey = (e) => {
        if (isOpen && e.key === 'Escape') {
            closeDropdown();
            button.focus();
        }
    };

    document.addEventListener('keydown', handleEscapeKey);

    // Keyboard navigation
    const handleMenuKeydown = (e) => {
        if (!isOpen) return;

        const optionButtons = Array.from(options);
        const currentIndex = optionButtons.indexOf(document.activeElement);

        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                const nextIndex = (currentIndex + 1) % optionButtons.length;
                optionButtons[nextIndex].focus();
                break;
            case 'ArrowUp':
                e.preventDefault();
                const prevIndex = (currentIndex - 1 + optionButtons.length) % optionButtons.length;
                optionButtons[prevIndex].focus();
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (document.activeElement.classList.contains('dropdown-option')) {
                    document.activeElement.click();
                }
                break;
        }
    };

    menu.addEventListener('keydown', handleMenuKeydown);

    function toggleDropdown() {
        if (isOpen) {
            closeDropdown();
        } else {
            openDropdown();
        }
    }

    function openDropdown() {
        isOpen = true;
        menu.classList.remove('hidden');
        button.setAttribute('aria-expanded', 'true');

        // Focus first selected option or first option
        const selectedOption = menu.querySelector('.dropdown-option[aria-selected="true"]');
        if (selectedOption) {
            selectedOption.focus();
        } else {
            options[0]?.focus();
        }
    }

    function closeDropdown() {
        isOpen = false;
        menu.classList.add('hidden');
        button.setAttribute('aria-expanded', 'false');
    }

    function selectEngine(engine, display) {
        // Update selected state
        options.forEach(opt => {
            opt.setAttribute('aria-selected', opt.dataset.engine === engine);
        });

        // Update button text
        selectedText.textContent = display;

        // Close dropdown
        closeDropdown();

        // Trigger engine change callback
        if (onEngineChange) {
            onEngineChange(engine);
        }
    }

    // Return cleanup function
    return () => {
        button.removeEventListener('click', handleButtonClick);
        optionClickHandlers.forEach(({ option, handler }) => {
            option.removeEventListener('click', handler);
        });
        document.removeEventListener('click', handleDocumentClick);
        document.removeEventListener('keydown', handleEscapeKey);
        menu.removeEventListener('keydown', handleMenuKeydown);
        if (isOpen) {
            closeDropdown();
        }
    };
}
