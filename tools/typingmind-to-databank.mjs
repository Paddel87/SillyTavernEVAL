#!/usr/bin/env node
/**
 * TypingMind → SillyTavern Data Bank converter.
 *
 * Reads one or more TypingMind chat exports (JSON of the shape
 * `{ "messages": [ { "role": "user"|"assistant"|"system", "content": "..." }, ... ] }`)
 * and produces a single, clean text document of the ASSISTANT outputs, ready to
 * drop into SillyTavern's Data Bank. SillyTavern's Vector Storage (local
 * "transformers" embeddings, no API key) then indexes it for retrieval (RAG),
 * so past assistant writing becomes an information base for new chats.
 *
 * Usage:
 *   node tools/typingmind-to-databank.mjs <inputDir> [outputFile] [options]
 *
 * Options:
 *   --with-prompts     Prefix each assistant block with the user prompt that
 *                      elicited it (improves retrieval; off by default since the
 *                      assistant output is the point).
 *   --separate         Write one .txt per input file (into outputDir) instead of
 *                      one consolidated file.
 *   --min-chars <n>    Skip assistant messages shorter than n characters (default 0).
 *
 * Examples:
 *   node tools/typingmind-to-databank.mjs ./tm-exports ./assistant-corpus.txt
 *   node tools/typingmind-to-databank.mjs ./tm-exports ./out --separate --with-prompts
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));
const minCharsIdx = args.indexOf('--min-chars');
const minChars = minCharsIdx >= 0 ? Number(args[minCharsIdx + 1]) || 0 : 0;

const inputDir = positional[0];
const output = positional[1] || (flags.has('--separate') ? './tm-databank' : './assistant-corpus.txt');
const withPrompts = flags.has('--with-prompts');
const separate = flags.has('--separate');

if (!inputDir) {
    console.error('Usage: node tools/typingmind-to-databank.mjs <inputDir> [outputFile] [--with-prompts] [--separate] [--min-chars n]');
    process.exit(1);
}

/** Normalises the various shapes a TypingMind export may take into a messages array. */
function extractMessages(parsed) {
    if (Array.isArray(parsed)) return parsed;                 // bare array of messages
    if (Array.isArray(parsed?.messages)) return parsed.messages;
    if (Array.isArray(parsed?.chat?.messages)) return parsed.chat.messages;
    return [];
}

/** Builds the assistant-focused text blocks for a single chat's messages. */
function blocksFromMessages(messages) {
    const blocks = [];
    messages.forEach((msg, i) => {
        if (msg?.role !== 'assistant') return;
        const content = String(msg.content ?? '').trim();
        if (!content || content.length < minChars) return;
        if (withPrompts) {
            // Find the nearest preceding user message for lightweight context.
            for (let j = i - 1; j >= 0; j--) {
                if (messages[j]?.role === 'user' && messages[j]?.content) {
                    blocks.push(`Prompt: ${String(messages[j].content).trim()}\n\n${content}`);
                    return;
                }
            }
        }
        blocks.push(content);
    });
    return blocks;
}

async function main() {
    const entries = (await readdir(inputDir)).filter(f => extname(f).toLowerCase() === '.json');
    if (entries.length === 0) {
        console.error(`No .json files found in ${inputDir}`);
        process.exit(1);
    }

    let totalBlocks = 0;
    let totalFiles = 0;
    const consolidated = [];

    if (separate) await mkdir(output, { recursive: true });

    for (const file of entries.sort()) {
        let parsed;
        try {
            parsed = JSON.parse(await readFile(join(inputDir, file), 'utf8'));
        } catch (err) {
            console.warn(`! Skipping ${file}: invalid JSON (${err.message})`);
            continue;
        }
        const blocks = blocksFromMessages(extractMessages(parsed));
        if (blocks.length === 0) {
            console.warn(`! ${file}: no assistant messages found`);
            continue;
        }
        totalFiles++;
        totalBlocks += blocks.length;
        const name = basename(file, '.json');
        const body = blocks.join('\n\n---\n\n');

        if (separate) {
            await writeFile(join(output, `${name}.txt`), body + '\n', 'utf8');
        } else {
            consolidated.push(`# ${name}\n\n${body}`);
        }
    }

    if (!separate) {
        await writeFile(output, consolidated.join('\n\n===\n\n') + '\n', 'utf8');
    }

    console.log(`Done. ${totalBlocks} assistant block(s) from ${totalFiles} chat(s).`);
    console.log(separate ? `Wrote per-chat .txt files to: ${output}` : `Wrote consolidated corpus to: ${output}`);
    console.log('Next: add the file(s) to SillyTavern\'s Data Bank, then enable Vector Storage (source: Local/Transformers) to index them.');
}

main().catch(err => { console.error(err); process.exit(1); });
