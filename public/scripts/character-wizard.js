/**
 * Character Creation Wizard
 *
 * A guided, step-by-step alternative to the dense character editor. It collects
 * the essentials (name, description, personality, scenario, first message) one
 * screen at a time, with optional preset chips to overcome blank-page paralysis,
 * then writes the values into the existing create form and submits it.
 *
 * Pure front-end: it drives the same fields and create button a user would,
 * so no character data model or backend behavior is changed.
 *
 * Optionally, each free-text field offers a ✨ "AI assist" button that uses the
 * already-connected LLM (via generateRaw) to draft content from what the user
 * has entered so far. No new API or key is involved; if nothing is connected,
 * the button explains that instead.
 */

import { generateRaw, online_status } from '../script.js';

const PERSONALITY_TRAITS = [
    'Warm', 'Stoic', 'Playful', 'Cunning', 'Shy', 'Confident',
    'Sarcastic', 'Caring', 'Ambitious', 'Loyal', 'Curious', 'Reserved',
    'Cheerful', 'Brooding', 'Honest', 'Mischievous', 'Gentle', 'Fierce',
];

const VIBES = ['Friendly companion', 'Mysterious stranger', 'Mentor', 'Rival', 'Comic relief', 'Romantic interest'];

/** @type {HTMLElement|null} */
let overlay = null;
let currentStep = 0;

const state = {
    name: '',
    vibe: '',
    description: '',
    traits: new Set(),
    personalityNotes: '',
    scenario: '',
    firstMessage: '',
};

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const STEPS = [
    { key: 'identity', title: 'Identity', subtitle: 'Who is this character?' },
    { key: 'description', title: 'Description', subtitle: 'Appearance and background' },
    { key: 'personality', title: 'Personality', subtitle: 'How do they behave?' },
    { key: 'scenario', title: 'Scenario', subtitle: 'The setting or situation' },
    { key: 'greeting', title: 'First Message', subtitle: 'How they greet the user' },
    { key: 'review', title: 'Review', subtitle: 'Check and create' },
];

function composePersonality() {
    const traits = [...state.traits].join(', ');
    const notes = state.personalityNotes.trim();
    return [traits, notes].filter(Boolean).join('\n');
}

/* ---------- AI assist ---------- */

const AI_SYSTEM_PROMPT = 'You are helping author a roleplay character card. Reply with only the requested text — no preamble, no quotes around the whole answer, no markdown headers.';

/** Prompt builders for each assisted field, using whatever the user has entered so far. */
const AI_PROMPTS = {
    description: () => {
        const ctx = [state.name && `Name: ${state.name}`, state.vibe && `Concept: ${state.vibe}`].filter(Boolean).join('. ');
        return `Write a vivid character description (appearance, role, background) for a roleplay character. ${ctx}. Use third person, 2–4 sentences, plain prose.`;
    },
    personalityNotes: () => {
        const ctx = [state.name && `Name: ${state.name}`, state.vibe && `Concept: ${state.vibe}`,
            state.traits.size && `Traits: ${[...state.traits].join(', ')}`, state.description && `Description: ${state.description}`].filter(Boolean).join('. ');
        return `Describe this character's personality and demeanour in 1–2 sentences. ${ctx}.`;
    },
    scenario: () => {
        const ctx = [state.name && `Character: ${state.name}`, state.description && `About them: ${state.description}`].filter(Boolean).join('. ');
        return `Write a short roleplay scenario/setting (2–3 sentences) establishing where the conversation begins. ${ctx}. Refer to the user as {{user}}.`;
    },
    firstMessage: () => {
        const ctx = [state.name && `Character: ${state.name}`, state.description && `About them: ${state.description}`,
            composePersonality() && `Personality: ${composePersonality()}`, state.scenario && `Scenario: ${state.scenario}`].filter(Boolean).join('. ');
        return `Write an in-character opening message this character says to greet {{user}}. ${ctx}. Include a little action in *asterisks*. 2–4 sentences, written as {{char}}.`;
    },
};

function aiAvailable() {
    return online_status !== 'no_connection';
}

async function runAI(button, textarea, stateKey) {
    if (!aiAvailable()) {
        if (typeof toastr !== 'undefined') toastr.info('Connect an API (top-left plug icon) to use AI assist.', 'No API connected');
        return;
    }
    if (button.classList.contains('cw-loading')) return;
    button.classList.add('cw-loading');
    try {
        const prompt = AI_PROMPTS[stateKey]();
        const result = await generateRaw({ prompt, systemPrompt: AI_SYSTEM_PROMPT, responseLength: 300 });
        const text = String(result || '').trim();
        if (text) {
            textarea.value = text;
            state[stateKey] = text;
        }
    } catch (err) {
        console.error('[CharacterWizard] AI assist failed', err);
        if (typeof toastr !== 'undefined') toastr.error(String(err?.message || err), 'AI assist failed');
    } finally {
        button.classList.remove('cw-loading');
    }
}

/**
 * Builds a labelled textarea field with a ✨ AI-assist button in the label row.
 * @param {string} label
 * @param {string} hint
 * @param {string} stateKey Key in `state` to read/write.
 * @param {string} placeholder
 * @param {number} rows
 */
function aiField(label, hint, stateKey, placeholder, rows) {
    const wrap = document.createElement('div');
    wrap.className = 'cw-field';

    const head = document.createElement('div');
    head.className = 'cw-fieldhead';
    head.innerHTML = `<label class="cw-label">${label}</label>`;
    const ai = document.createElement('div');
    ai.className = 'cw-ai menu_button' + (aiAvailable() ? '' : ' cw-ai-off');
    ai.title = aiAvailable() ? 'Draft this field with AI' : 'Connect an API to use AI assist';
    ai.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i><span>AI</span>';
    head.appendChild(ai);
    wrap.appendChild(head);

    wrap.insertAdjacentHTML('beforeend', `<div class="cw-hint">${hint}</div>`);

    const ta = textArea(state[stateKey], v => state[stateKey] = v, placeholder, rows);
    wrap.appendChild(ta);

    ai.addEventListener('click', () => runAI(ai, ta, stateKey));
    return wrap;
}

function buildOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'characterWizardOverlay';
    overlay.innerHTML = `
        <div class="cw-card">
            <div class="cw-header">
                <div>
                    <h3 class="cw-title">Guided Character Creation</h3>
                    <small class="cw-stepinfo"></small>
                </div>
                <div class="cw-close menu_button fa-solid fa-xmark" title="Close"></div>
            </div>
            <div class="cw-progress"></div>
            <div class="cw-body"></div>
            <div class="cw-footer">
                <div class="cw-back menu_button"><i class="fa-solid fa-arrow-left"></i> Back</div>
                <div class="cw-spacer"></div>
                <div class="cw-next menu_button"><span>Next</span> <i class="fa-solid fa-arrow-right"></i></div>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('.cw-close').addEventListener('click', closeWizard);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeWizard(); });
    overlay.querySelector('.cw-back').addEventListener('click', () => goTo(currentStep - 1));
    overlay.querySelector('.cw-next').addEventListener('click', onNext);

    const progress = overlay.querySelector('.cw-progress');
    STEPS.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = 'cw-dot';
        dot.addEventListener('click', () => { if (i < currentStep) goTo(i); });
        progress.appendChild(dot);
    });
}

function renderStep() {
    const step = STEPS[currentStep];
    overlay.querySelector('.cw-stepinfo').textContent = `Step ${currentStep + 1} of ${STEPS.length} — ${step.subtitle}`;
    overlay.querySelectorAll('.cw-dot').forEach((d, i) => d.classList.toggle('active', i <= currentStep));

    const body = overlay.querySelector('.cw-body');
    body.innerHTML = '';

    switch (step.key) {
        case 'identity': {
            body.appendChild(field('Name', 'A short, memorable name (required).', textInput(state.name, v => state.name = v, 'e.g. Aria Vance')));
            body.appendChild(chips('Concept (optional)', VIBES, () => new Set(state.vibe ? [state.vibe] : []), (val) => {
                state.vibe = state.vibe === val ? '' : val;
                renderStep();
            }));
            break;
        }
        case 'description': {
            body.appendChild(aiField('Description', 'Looks, role, history — what the AI should know. Plain prose works best.',
                'description', 'Aria is a sharp-witted airship navigator in her late twenties, with...', 8));
            break;
        }
        case 'personality': {
            body.appendChild(chips('Traits (tap to toggle)', PERSONALITY_TRAITS, () => state.traits, (val) => {
                state.traits.has(val) ? state.traits.delete(val) : state.traits.add(val);
                renderStep();
            }));
            body.appendChild(aiField('Extra personality notes (optional)', 'Anything the chips do not cover.',
                'personalityNotes', 'Speaks bluntly but means well; fiercely protective of her crew.', 4));
            break;
        }
        case 'scenario': {
            body.appendChild(aiField('Scenario', 'The situation in which the conversation takes place.',
                'scenario', 'The user has just boarded Aria\'s airship as a new recruit...', 6));
            break;
        }
        case 'greeting': {
            body.appendChild(aiField('First Message', 'The character\'s opening message. Use {{char}} and {{user}} as placeholders.',
                'firstMessage', '*Aria glances up from her charts.* "So you\'re the new recruit, {{user}}? Let\'s see if you can keep up."', 6));
            break;
        }
        case 'review': {
            body.appendChild(reviewRow('Name', state.name || '—'));
            body.appendChild(reviewRow('Description', state.description || '—'));
            body.appendChild(reviewRow('Personality', composePersonality() || '—'));
            body.appendChild(reviewRow('Scenario', state.scenario || '—'));
            body.appendChild(reviewRow('First Message', state.firstMessage || '—'));
            break;
        }
    }

    overlay.querySelector('.cw-back').style.visibility = currentStep === 0 ? 'hidden' : 'visible';
    const next = overlay.querySelector('.cw-next');
    next.querySelector('span').textContent = currentStep === STEPS.length - 1 ? 'Create Character' : 'Next';
    next.querySelector('i').className = currentStep === STEPS.length - 1 ? 'fa-solid fa-user-check' : 'fa-solid fa-arrow-right';
}

/* ---------- small DOM builders ---------- */

function field(label, hint, control) {
    const wrap = document.createElement('div');
    wrap.className = 'cw-field';
    wrap.innerHTML = `<label class="cw-label">${label}</label><div class="cw-hint">${hint}</div>`;
    wrap.appendChild(control);
    return wrap;
}

function textInput(value, onInput, placeholder) {
    const el = document.createElement('input');
    el.type = 'text';
    el.className = 'text_pole';
    el.value = value;
    el.placeholder = placeholder || '';
    el.addEventListener('input', () => onInput(el.value));
    return el;
}

function textArea(value, onInput, placeholder, rows) {
    const el = document.createElement('textarea');
    el.className = 'text_pole';
    el.rows = rows || 5;
    el.value = value;
    el.placeholder = placeholder || '';
    el.addEventListener('input', () => onInput(el.value));
    return el;
}

function chips(label, options, getSelected, onToggle) {
    const wrap = document.createElement('div');
    wrap.className = 'cw-field';
    wrap.innerHTML = `<label class="cw-label">${label}</label>`;
    const row = document.createElement('div');
    row.className = 'cw-chips';
    const selected = getSelected();
    options.forEach(opt => {
        const chip = document.createElement('div');
        chip.className = 'cw-chip' + (selected.has(opt) ? ' selected' : '');
        chip.textContent = opt;
        chip.addEventListener('click', () => onToggle(opt));
        row.appendChild(chip);
    });
    wrap.appendChild(row);
    return wrap;
}

function reviewRow(label, value) {
    const row = document.createElement('div');
    row.className = 'cw-review-row';
    row.innerHTML = `<div class="cw-review-label">${label}</div><div class="cw-review-value"></div>`;
    row.querySelector('.cw-review-value').textContent = value;
    return row;
}

/* ---------- navigation & submit ---------- */

function goTo(step) {
    if (step < 0 || step >= STEPS.length) return;
    currentStep = step;
    renderStep();
}

function onNext() {
    if (STEPS[currentStep].key === 'identity' && !state.name.trim()) {
        const input = overlay.querySelector('.cw-body input');
        input?.classList.add('cw-error');
        input?.focus();
        return;
    }
    if (currentStep === STEPS.length - 1) {
        finish();
        return;
    }
    goTo(currentStep + 1);
}

function fillField(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function finish() {
    closeWizard();
    // Enter create mode with a fresh form (mirrors clicking "Create New Character").
    document.getElementById('rm_button_create')?.click();
    await delay(200);
    fillField('character_name_pole', state.name.trim());
    fillField('description_textarea', state.description.trim());
    fillField('personality_textarea', composePersonality());
    fillField('scenario_pole', state.scenario.trim());
    fillField('firstmessage_textarea', state.firstMessage.trim());
    await delay(50);
    // Submit via the existing create button.
    document.getElementById('create_button')?.click();
}

function openWizard() {
    if (!overlay) buildOverlay();
    // Reset state for a fresh run.
    Object.assign(state, { name: '', vibe: '', description: '', personalityNotes: '', scenario: '', firstMessage: '' });
    state.traits = new Set();
    currentStep = 0;
    overlay.classList.add('open');
    renderStep();
}

function closeWizard() {
    overlay?.classList.remove('open');
}

export function initCharacterWizard() {
    document.getElementById('rm_button_create_wizard')?.addEventListener('click', openWizard);
}
