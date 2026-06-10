# CLAUDE.md

Leitfaden für Claude (und Mitwirkende) zur Weiterentwicklung dieses Forks.

## Zweck dieses Forks

**SillyTavernEVAL** ist ein persönlicher Fork von SillyTavern (Upstream: SillyTavern,
AGPL-3.0), der **schrittweise nach den Bedürfnissen des Maintainers umgebaut** wird.

Leitgedanke (geprägt vom Umstieg von TypingMind):
1. **UX vereinfachen** — die dichte Power-User-Oberfläche entschlacken (progressive
   disclosure, Klartext statt kryptischer Symbole).
2. **Moderner aussehen** — cleane, ruhige Optik („TypingMind-Gefühl").
3. **Gute Ökosystem-Ideen nativ nachbauen** statt fragiler Fremd-Extensions.
4. **Migration/Wissensnutzung** — Inhalte aus TypingMind übernehmen (z. B. als RAG-Wissensbasis).

> Bei neuen Aufgaben gilt: im Zweifel die Variante wählen, die diese vier Ziele
> stützt — und die **update-stabil** gegenüber dem Upstream bleibt.

## Arbeitsweise & Konventionen (WICHTIG)

- **Branch/PR:** PR #1 (`claude/story-consistency-tokens-xiUD9`) wurde beim Stand
  `fd43d24f8` (Charakter-Wizard) nach `release` gemerged. Die danach gepushten Commits
  (TypingMind-Konverter/-Importer, diese CLAUDE.md) liegen **nur auf dem Branch** und
  fehlen noch in `release`. Neue Arbeit: eigenen Branch von `release` abzweigen + PR.
- **Update-Stabilität:** Änderungen möglichst **additiv & datenkompatibel** halten. Kein
  invasiver Umbau am Daten-/Backend-Modell, wo eine Frontend-Schicht reicht. Eigene
  Felder/Elemente klar markieren (Konvention: Klasse `wiAdvanced`, IDs mit sprechendem Präfix).
- **Neues Feature = eigenes Modul:** `public/scripts/<name>.js` (+ optional `public/css/<name>.css`),
  eingebunden über:
  - CSS-Link in `public/index.html` (im `<link>`-Block bei den anderen `css/*.css`),
  - `import { init… } from './scripts/<name>.js'` in `public/script.js` und Aufruf im
    Init-Block (~Zeile 765, neben `initWorldInfo()` / `initCharacterWizard()`).
- **Theme-Konformität:** Eigene UI mit den `--SmartTheme*`-CSS-Variablen stylen
  (`--SmartThemeBlurTintColor`, `--SmartThemeBodyColor`, `--SmartThemeBorderColor`,
  `--SmartThemeQuoteColor` …), damit sie zu jedem Theme (inkl. „Lucid Dark") passt.
- **UI-Einstellungen persistieren:** `accountStorage` (Muster: `SIMPLE_MODE_KEY` in `world-info.js`).
- **LLM-Aufrufe:** `generateRaw({ prompt, systemPrompt, responseLength })` (aus `script.js`);
  Verbindungsstatus über `online_status`. Für **getrennte Modelle** (Input/Output) Connection
  Profiles nutzen: `ConnectionManagerRequestService.sendRequest(profileId, prompt, maxTokens)`
  (aus `public/scripts/extensions/shared.js`).
- **i18n:** Sichtbare Strings mit `data-i18n` versehen.
- **Niemals committen:** Modell-Identifier/„undercover"-IDs, Secrets, Inhalte unter `data/`
  (gitignored), `node_modules/`, ad-hoc Test-Skripte.

## Verifikation / lokale Tests

- **Lint:** `node_modules/.bin/eslint <datei>` (Projekt nutzt ESLint v8 / `.eslintrc.cjs`).
  Hinweis: globales `npx eslint` ist v10 und inkompatibel — immer die lokale Binary nutzen.
- **App starten:** `node server.js` → lauscht auf `http://127.0.0.1:8000/`.
- **Headless-Verifikation:** Puppeteer (Chrome in `~/.cache/puppeteer`, via
  `node_modules/.bin/puppeteer browsers install chrome`). Test-Skript **im Projektordner**
  ablegen (sonst findet es `puppeteer` nicht). Beim ersten Start blockiert ein
  „Welcome"-Popup (Persona) — im Test den sichtbaren „Save"-Button klicken bzw. Overlay entfernen.
- Nach Tests: Server stoppen, Test-Daten in `data/` aufräumen, ad-hoc Skripte löschen.

## Upstream-Updates nachführen

Remotes: `origin` = Paddel87/SillyTavernEVAL (Fork), `upstream` = SillyTavern/SillyTavern.

```bash
git fetch upstream
git merge upstream/release      # auf release; alternativ: git rebase upstream/release
git push origin release         # bei Rebase: --force-with-lease
```

- **Branch-Modell upstream:** Entwicklung auf `staging`, periodische Merges nach
  `release`. Für stabile Updates immer `upstream/release` verwenden.
- **Konflikt-Hotspots:** `public/scripts/world-info.js` (Simple Mode steckt in einer
  großen, upstream aktiv weiterentwickelten Datei); `public/index.html` und
  `public/script.js` (Einhängepunkte der Fork-Module). Eigene Modul-Dateien
  (`character-wizard.js` etc.) sind neu und konfliktfrei.
- **Nach jedem Update:** `npm install` (Dependencies ändern sich häufig), dann App
  starten und Wizard + World-Info-Simple-Mode kurz gegentesten.
- `Update-Instructions.txt` im Repo beschreibt das Update einer Endnutzer-Installation,
  **nicht** das Fork-Nachführen.

## Bisherige Änderungen (Changelog)

Alle live in der laufenden App verifiziert, ESLint sauber.

| Commit | Bereich | Inhalt |
|--------|---------|--------|
| `23b7e1c` / `79b4ea7` / `b2e54b9` | World Info | **Simple Mode** für den Lorebook-Eintrags-Editor: 🪄-Toolbar-Toggle blendet Advanced-Felder aus (nur Titel/Status/Keywords/Inhalt), Klartext-Status (Always on / On mention / Semantic), persistent via `accountStorage`, **default-on**. Spalten-Header mitgeblendet. |
| `112d10a` | Themes | **„Lucid Dark"** — flaches, minimalistisches Theme (kein Glas-Blur, Document-Lesespalte, blauer Akzent). `default/content/themes/Lucid Dark.json` + Registrierung in `index.json`. |
| `8149d2c` / `fd43d24` | Characters | **Charakter-Wizard** (`character-wizard.js`/`.css`): geführte 6-Schritt-Erstellung mit Preset-Chips; treibt das bestehende Create-Formular. Plus optionale **✨-KI-Hilfe** pro Feld via `generateRaw` (nutzt bestehende Verbindung). |
| `b71678e` / `aa3b0e2` | Tools | **TypingMind→Data Bank Konverter** (`tools/typingmind-to-databank.mjs`): extrahiert Assistant-Outputs als RAG-fertigen Textkorpus. Beherrscht String- **und** Array-Content. |
| `c4c0e8d` | Import | **In-App-TypingMind-Importer** (`typingmind-importer.js`): Button im Data-Bank-Wand-Menü → Dateien wählen → Assistant-Outputs als Data-Bank-Anhang. |

## Architektur-Integrationspunkte (Cheat-Sheet)

- **World Info Editor:** Editor-Template `#entry_edit_template` und Karten-Header `world_entry`
  in `public/index.html`; Spalten-Header in `public/scripts/templates/worldInfoKeywordHeaders.html`;
  Logik + `initWorldInfo()` (~Z. 6068), Scan/Token-Budget in `public/scripts/world-info.js`.
- **Charakter-Erstellung:** Felder `#character_name_pole`, `#description_textarea`,
  `#personality_textarea`, `#scenario_pole`, `#firstmessage_textarea`; Submit `#create_button`;
  `create_save` wird bei `input` befüllt, solange `menu_type === 'create'`. Toolbar `#rm_button_bar`.
- **Themes:** `default/content/themes/*.json` + Eintrag in `default/content/index.json`;
  werden beim Erststart nach `data/<user>/themes/` kopiert.
- **Data Bank / RAG:** `uploadFileAttachmentToServer(file, 'global'|'character'|'chat')` aus
  `public/scripts/chats.js`; Wand-Container `#data_bank_wand_container` (aus
  `templates/wandMenu.html`, dynamisch — beim Mounten kurz pollen). Vector Storage Default-Quelle
  `transformers` = **lokale Embeddings, kein API-Key**.
- **Anbieter/Modelle:** Chat-Completion-Quellen in `public/scripts/openai.js`
  (`chat_completion_sources`): u. a. `MAKERSUITE`/`VERTEXAI` (Google/Gemini), `XAI` (Grok),
  `CUSTOM`, OpenAI, Claude, OpenRouter. **Gemini-Safety** ist upstream-nativ in `src/constants.js`
  (`GEMINI_SAFETY`/`VERTEX_SAFETY`, alle `threshold: 'OFF'`), immer aktiv.

## Roadmap (offene Wünsche)

Skala: XS (Minuten) · S · M (≈ Wizard/Theme) · L (mehrere Bausteine).

| # | Punkt | Aufwand | Notiz |
|---|-------|---------|-------|
| 2 | **Auto-Lorebook-Fortschreibung** | M (MVP) → L | LLM-Zusammenfassung → WI-Eintrag mit Keys; **Input/Output via separatem Connection Profile** trennen; optional hierarchische Verdichtung (STMB-Vorbild). |
| 4 | Token-Feedback am Feld | S–M | `getTokenCountAsync`-Badges an Charakter-Editor-Felder + Klartext-Tooltips. |
| 5b | UI-Reduktion über Lorebook hinaus | M (ein Panel) → L | Simple/Advanced-Muster auf Sampler-/Generierungs-Panels ausweiten. |
| 6 | Trigger-Vorschau (Key-Test) | M | „Test"-Button pro WI-Eintrag via `WorldInfoBuffer.matchKeys` gegen letzte Nachrichten. |
| 1c | Sekundäre Keys im Simple-Modus belassen | XS | eine `wiAdvanced`-Klasse entfernen. |
| 1d | Simple/Advanced fürs globale WI-Settings-Panel | M | ~22 Schalter markieren + Toggle anwenden. |
| 1e | Status-Labels als `data-i18n`-Keys | S | „Always on/On mention/Semantic" übersetzbar machen. |

## Bekannte Test-Lücken

- Verbundenes LLM/Embedding-Modell fehlte in der Sandbox → **✨-KI-Hilfe** und der echte
  **RAG-Abruf im Chat** wurden nicht mit echter Modell-Antwort gezeigt (Verdrahtung/Aufnahme
  aber verifiziert). Zum Live-Test eine API verbinden (Google/Gemini oder xAI/Grok; nur Key nötig).
