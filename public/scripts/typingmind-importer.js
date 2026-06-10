/**
 * TypingMind Importer
 *
 * Adds a "Import TypingMind chats" button to the Data Bank wand menu. It lets the
 * user pick one or more TypingMind chat exports, extracts the ASSISTANT outputs
 * into a clean text corpus, and stores it as a Data Bank attachment. Vector
 * Storage (local "transformers" embeddings, no API key) then indexes it for
 * retrieval, turning past assistant writing into an information base for new chats.
 *
 * In-app counterpart to tools/typingmind-to-databank.mjs. Pure front-end: it only
 * uploads a generated text file via the existing Data Bank API.
 */

import { uploadFileAttachmentToServer } from './chats.js';
import { callGenericPopup, POPUP_TYPE, POPUP_RESULT } from './popup.js';

/* ---------- conversion (mirrors the CLI tool) ---------- */

/** Normalises the various shapes a TypingMind export may take into a messages array. */
function extractMessages(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.messages)) return parsed.messages;
    if (Array.isArray(parsed?.chat?.messages)) return parsed.chat.messages;
    return [];
}

/**
 * Normalises a message `content` into plain text. TypingMind uses either a plain
 * string or an array of parts ([{ text, type }]); non-text parts are ignored.
 * @param {unknown} content
 * @returns {string}
 */
function normalizeContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map(p => typeof p === 'string' ? p : String(p?.text ?? '')).filter(Boolean).join('\n');
    }
    if (content && typeof content === 'object') return String(content.text ?? '');
    return '';
}

/**
 * Builds assistant-focused text blocks from a chat's messages.
 * @param {any[]} messages
 * @param {{ withPrompts: boolean, minChars: number }} opts
 * @returns {string[]}
 */
function blocksFromMessages(messages, { withPrompts, minChars }) {
    const blocks = [];
    messages.forEach((msg, i) => {
        if (msg?.role !== 'assistant') return;
        const content = normalizeContent(msg.content).trim();
        if (!content || content.length < minChars) return;
        if (withPrompts) {
            for (let j = i - 1; j >= 0; j--) {
                if (messages[j]?.role === 'user') {
                    const prompt = normalizeContent(messages[j].content).trim();
                    if (prompt) {
                        blocks.push(`Prompt: ${prompt}\n\n${content}`);
                        return;
                    }
                }
            }
        }
        blocks.push(content);
    });
    return blocks;
}

/* ---------- UI ---------- */

function buildForm() {
    const content = document.createElement('div');
    content.classList.add('tmi-popup');
    content.innerHTML = `
        <h3>Import TypingMind chats</h3>
        <div class="tmi-hint m-b-1">Extracts the assistant replies into a Data Bank file. Enable Vector Storage afterwards to use them as a searchable knowledge base.</div>
        <div class="flex-container flexFlowColumn flexGap10">
            <label>
                <small data-i18n="TypingMind .json export(s)">TypingMind .json export(s)</small>
                <input id="tmi_files" type="file" accept=".json,application/json" multiple class="text_pole" />
            </label>
            <label class="checkbox_label">
                <input id="tmi_with_prompts" type="checkbox" />
                <span>Include the user prompt before each reply (better retrieval for Q&amp;A)</span>
            </label>
            <div class="flex-container flexGap10">
                <label class="flex1">
                    <small>Min. characters per reply</small>
                    <input id="tmi_min_chars" type="number" min="0" value="0" class="text_pole" />
                </label>
                <label class="flex1">
                    <small>Store in</small>
                    <select id="tmi_target" class="text_pole">
                        <option value="global" selected>Global Data Bank</option>
                        <option value="character">Current character</option>
                        <option value="chat">Current chat</option>
                    </select>
                </label>
            </div>
            <label>
                <small>File name</small>
                <input id="tmi_filename" type="text" class="text_pole" value="TypingMind Import.txt" />
            </label>
        </div>`;
    return content;
}

async function openImporter() {
    const content = buildForm();
    const result = await callGenericPopup(content, POPUP_TYPE.CONFIRM, '', {
        okButton: 'Import',
        cancelButton: 'Cancel',
        wide: true,
        allowVerticalScrolling: true,
    });
    if (result !== POPUP_RESULT.AFFIRMATIVE) return;

    const files = [...(content.querySelector('#tmi_files')?.files ?? [])];
    const withPrompts = !!content.querySelector('#tmi_with_prompts')?.checked;
    const minChars = Number(content.querySelector('#tmi_min_chars')?.value) || 0;
    const target = content.querySelector('#tmi_target')?.value || 'global';
    const fileName = (content.querySelector('#tmi_filename')?.value || 'TypingMind Import.txt').trim() || 'TypingMind Import.txt';

    if (files.length === 0) {
        toastr.warning('No files selected.');
        return;
    }

    const sections = [];
    let totalBlocks = 0;
    let skipped = 0;
    for (const file of files) {
        let parsed;
        try {
            parsed = JSON.parse(await file.text());
        } catch {
            skipped++;
            continue;
        }
        const blocks = blocksFromMessages(extractMessages(parsed), { withPrompts, minChars });
        if (blocks.length === 0) {
            skipped++;
            continue;
        }
        totalBlocks += blocks.length;
        const title = file.name.replace(/\.json$/i, '');
        sections.push(`# ${title}\n\n${blocks.join('\n\n---\n\n')}`);
    }

    if (sections.length === 0) {
        toastr.error('No assistant messages found in the selected files.');
        return;
    }

    const corpus = sections.join('\n\n===\n\n') + '\n';
    const outFile = new File([corpus], fileName.endsWith('.txt') ? fileName : `${fileName}.txt`, { type: 'text/plain' });

    try {
        const url = await uploadFileAttachmentToServer(outFile, target);
        if (url) {
            toastr.success(`${totalBlocks} assistant block(s) added to the Data Bank${skipped ? ` (${skipped} file(s) skipped)` : ''}. Enable Vector Storage to index them.`, 'TypingMind import complete');
        }
    } catch (err) {
        console.error('[TypingMindImporter] upload failed', err);
        toastr.error(String(err?.message || err), 'Import failed');
    }
}

function mountButton(tries = 0) {
    const container = document.getElementById('data_bank_wand_container');
    if (!container) {
        if (tries < 40) setTimeout(() => mountButton(tries + 1), 250);
        return;
    }
    if (document.getElementById('tmi_wand_button')) return;

    const button = document.createElement('div');
    button.id = 'tmi_wand_button';
    button.className = 'list-group-item flex-container flexGap5';
    button.title = 'Import TypingMind chat exports into the Data Bank (assistant outputs).';
    button.innerHTML = '<div class="fa-fw fa-solid fa-file-import extensionsMenuExtensionButton"></div><span>Import TypingMind chats</span>';
    button.addEventListener('click', openImporter);
    container.appendChild(button);
}

export function initTypingMindImporter() {
    mountButton();
}
