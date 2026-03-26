// ============================================================
//  MarkPad — app.js  v3  (fixed drag-drop, font picker, persistence)
// ============================================================
(function () {
  'use strict';

  // ── Tiny helpers ───────────────────────────────────────────
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  function escH(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function uid()  { return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

  // ── Storage ────────────────────────────────────────────────
  const KEY = 'markpad_v3';

  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(_){}
  }
  let _saveTimer;
  function queueSave() { clearTimeout(_saveTimer); _saveTimer = setTimeout(saveState, 350); }

  // ── Default data ───────────────────────────────────────────
  const WELCOME = `# Welcome to MarkPad ✍️

A fast, offline-ready Markdown editor with folders, drag & drop, and font picker.

---

## Features

- 🗂 **Folders** — collapsible, nestable file organisation
- 🖱 **Drag & Drop** — reorder files or drop them into folders
- 🔤 **Font Picker** — toolbar **Aa** button to change editor & preview fonts
- 🎨 **6 Themes** — pick from the dropdown in the toolbar
- 💾 **Auto-save** — everything persists in \`localStorage\`

---

## Markdown reference

**bold** / *italic* / ~~strike~~ / \`code\`

> Blockquote example

\`\`\`javascript
const hello = name => \`Hello, \${name}!\`;
\`\`\`

| Col A | Col B |
|-------|-------|
| one   | two   |

- [x] Done
- [ ] Todo

> Right-click any file or folder in the sidebar for more options.
`;

  const DEFAULT = {
    tree: [
      { type:'folder', id:'fold1', name:'Notes', open:true, children:[
          { type:'file', id:'welcome', name:'Welcome.md',  content: WELCOME },
          { type:'file', id:'ideas',   name:'Ideas.md',    content:'# Ideas\n\n- Idea one\n- Idea two\n' },
          { type:'folder', id:'fold2', name:'Archive', open:false, children:[
              { type:'file', id:'archived1', name:'Old Notes.md', content:'# Old Notes\n\nArchived content here.\n' },
          ]},
      ]},
      { type:'file', id:'scratch', name:'Scratch.md', content:'# Scratch\n\nJot things here…\n' },
    ],
    activeId:        'welcome',
    theme:           'slate',
    view:            'split',
    tocOpen:         false,
    editorFontId:    'jetbrains',
    previewFontId:   'lora',
    editorFontSize:  14,
    previewFontSize: 15,
  };

  // ── Load persisted state ───────────────────────────────────
  let state;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = Object.assign({}, DEFAULT, parsed);
      // make sure required keys exist
      if (!Array.isArray(state.tree) || !state.tree.length) state.tree = DEFAULT.tree;
    } else {
      state = JSON.parse(JSON.stringify(DEFAULT)); // deep clone
    }
  } catch(_) {
    state = JSON.parse(JSON.stringify(DEFAULT));
  }

  // ── Tree helpers ───────────────────────────────────────────
  function flatFiles(nodes) {
    const out = [];
    (function walk(ns){ ns.forEach(n => { if(n.type==='file') out.push(n); else if(n.children) walk(n.children); }); })(nodes);
    return out;
  }

  function findNode(id, nodes = state.tree) {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) { const f = findNode(id, n.children); if (f) return f; }
    }
    return null;
  }

  function removeNode(id, nodes = state.tree) {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) { nodes.splice(i,1); return true; }
      if (nodes[i].children && removeNode(id, nodes[i].children)) return true;
    }
    return false;
  }

  function activeFile() { return findNode(state.activeId); }

  // ── Markdown parser ────────────────────────────────────────
  const MD = { parse(src) {
    let h = src;
    const CB=[], IC=[];
    h = h.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_,l,c)=>{ CB.push(`<pre><code${l?` class="lang-${l}"`:''}>${c.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`); return `\x02CB${CB.length-1}\x03`; });
    h = h.replace(/`([^`\n]+)`/g, (_,c)=>{ IC.push(`<code>${c.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code>`); return `\x02IC${IC.length-1}\x03`; });
    h = h.replace(/^(-{3,}|\*{3,}|_{3,})\s*$/gm,'<hr>');
    [6,5,4,3,2,1].forEach(n=>{ h = h.replace(new RegExp(`^#{${n}}\\s+(.+)$`,'gm'),`<h${n}>$1</h${n}>`); });
    h = h.replace(/((?:^>.*\n?)+)/gm,m=>`<blockquote>${m.replace(/^>\s?/gm,'').trim()}</blockquote>`);
    h = h.replace(/^(\|.+\|)\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/gm,(_,hd,bd)=>{
      const ths=hd.split('|').slice(1,-1).map(x=>`<th>${x.trim()}</th>`).join('');
      const trs=bd.trim().split('\n').map(r=>`<tr>${r.split('|').slice(1,-1).map(x=>`<td>${x.trim()}</td>`).join('')}</tr>`).join('');
      return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
    });
    h = h.replace(/^- \[x\]\s+(.+)$/gm,'<li><input type="checkbox" checked disabled> $1</li>');
    h = h.replace(/^- \[ \]\s+(.+)$/gm,'<li><input type="checkbox" disabled> $1</li>');
    h = h.replace(/((?:^[-*+]\s+.+\n?)+)/gm,m=>`<ul>${m.trim().split('\n').map(l=>{const t=l.replace(/^[-*+]\s+/,'');return t.startsWith('<li')?t:`<li>${t}</li>`;}).join('')}</ul>`);
    h = h.replace(/((?:^\d+\.\s+.+\n?)+)/gm,m=>`<ol>${m.trim().split('\n').map(l=>`<li>${l.replace(/^\d+\.\s+/,'')}</li>`).join('')}</ol>`);
    h = h.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,'<img src="$2" alt="$1">');
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>');
    h = h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
    h = h.replace(/__(.+?)__/g,'<strong>$1</strong>');
    h = h.replace(/\*(.+?)\*/g,'<em>$1</em>');
    h = h.replace(/_(.+?)_/g,'<em>$1</em>');
    h = h.replace(/~~(.+?)~~/g,'<del>$1</del>');
    const BLK = /^<(h[1-6]|ul|ol|li|blockquote|pre|table|thead|tbody|tr|th|td|hr|img)/;
    const lines=h.split('\n'); const out=[]; let para=[];
    for(const ln of lines){
      if(!ln.trim()){ if(para.length){out.push(`<p>${para.join(' ')}</p>`);para=[];} }
      else if(BLK.test(ln.trim())||ln.startsWith('\x02CB')){ if(para.length){out.push(`<p>${para.join(' ')}</p>`);para=[];} out.push(ln); }
      else para.push(ln);
    }
    if(para.length) out.push(`<p>${para.join(' ')}</p>`);
    h = out.join('\n');
    h = h.replace(/\x02CB(\d+)\x03/g,(_,i)=>CB[+i]);
    h = h.replace(/\x02IC(\d+)\x03/g,(_,i)=>IC[+i]);
    return h;
  }};

  // ── Font definitions ───────────────────────────────────────
  const EDITOR_FONTS = [
    { id:'jetbrains',   name:'JetBrains Mono', css:"'JetBrains Mono',monospace",  sample:'const x = () => 42;' },
    { id:'fira',        name:'Fira Code',       css:"'Fira Code',monospace",       sample:'function hello() {}' },
    { id:'ibmplex',     name:'IBM Plex Mono',   css:"'IBM Plex Mono',monospace",   sample:'if (x > 0) return x;' },
    { id:'sourcecp',    name:'Source Code Pro', css:"'Source Code Pro',monospace", sample:'let r = arr.map(fn);' },
    { id:'inconsolata', name:'Inconsolata',     css:"'Inconsolata',monospace",     sample:'console.log("hi");' },
    { id:'dmmono',      name:'DM Mono',         css:"'DM Mono',monospace",         sample:'type Foo = Bar|Baz;' },
  ];
  const PREVIEW_FONTS = [
    { id:'lora',         name:'Lora',        css:"'Lora',serif",            sample:'The quick brown fox' },
    { id:'merriweather', name:'Merriweather',css:"'Merriweather',serif",    sample:'The quick brown fox' },
    { id:'ptserif',      name:'PT Serif',    css:"'PT Serif',serif",        sample:'The quick brown fox' },
    { id:'dmsans',       name:'DM Sans',     css:"'DM Sans',sans-serif",    sample:'The quick brown fox' },
    { id:'inter',        name:'Inter',       css:"'Inter',sans-serif",      sample:'The quick brown fox' },
    { id:'nunito',       name:'Nunito',      css:"'Nunito',sans-serif",     sample:'The quick brown fox' },
  ];
  const GFONTS = {
    jetbrains:'JetBrains+Mono', fira:'Fira+Code', ibmplex:'IBM+Plex+Mono',
    sourcecp:'Source+Code+Pro', inconsolata:'Inconsolata', dmmono:'DM+Mono',
    lora:'Lora', merriweather:'Merriweather', ptserif:'PT+Serif',
    dmsans:'DM+Sans', inter:'Inter', nunito:'Nunito',
  };
  const _loadedFonts = new Set(['jetbrains','lora','dmsans']);

  function ensureFont(id) {
    if (_loadedFonts.has(id) || !GFONTS[id]) return;
    const lnk = document.createElement('link');
    lnk.rel = 'stylesheet';
    lnk.href = `https://fonts.googleapis.com/css2?family=${GFONTS[id]}:wght@400;600&display=swap`;
    document.head.appendChild(lnk);
    _loadedFonts.add(id);
  }

  function applyFontVars() {
    const ef = EDITOR_FONTS.find(f=>f.id===state.editorFontId)  || EDITOR_FONTS[0];
    const pf = PREVIEW_FONTS.find(f=>f.id===state.previewFontId) || PREVIEW_FONTS[0];
    ensureFont(state.editorFontId);
    ensureFont(state.previewFontId);
    const r = document.documentElement.style;
    r.setProperty('--font-editor',       ef.css);
    r.setProperty('--font-preview',      pf.css);
    r.setProperty('--editor-font-size',  state.editorFontSize  + 'px');
    r.setProperty('--preview-font-size', state.previewFontSize + 'px');
  }

  // ── DOM refs ───────────────────────────────────────────────
  const editorEl     = $('#editor');
  const previewEl    = $('#preview-content');
  const fileTreeEl   = $('#file-tree');
  const themeSelect  = $('#theme-select');
  const wordCountEl  = $('#word-count');
  const statusColEl  = $('#status-col');
  const statusWdsEl  = $('#status-words');
  const statusLnsEl  = $('#status-lines');
  const statusThmEl  = $('#status-theme');
  const panesEl      = $('#panes');
  const sidebarEl    = $('#sidebar');
  const splitterEl   = $('#splitter');
  const editorPane   = $('#editor-pane');
  const previewPane  = $('#preview-pane');
  const tocSidebar   = $('#toc-sidebar');
  const tocList      = $('#toc-list');
  const tocEmpty     = $('#toc-empty');
  const ctxMenu      = $('#ctx-menu');
  const docTitleText = $('#doc-title-text');
  const shortcutsMdl = $('#shortcuts-modal');
  const fontMdl      = $('#font-modal');
  const backupMdl    = $('#backup-modal');

  // ── Render helpers ─────────────────────────────────────────
  function renderPreview(txt) { previewEl.innerHTML = MD.parse(txt || ''); }

  function updateDocTitle() {
    const f = activeFile();
    const displayName = f ? f.name.replace(/\.md$/i, '') : '';
    if (docTitleText.contentEditable !== 'true') {
      docTitleText.textContent = displayName;
    }
  }

  function beginTitleRename() {
    const f = activeFile(); if (!f) return;
    const original = f.name;
    const displayName = original.replace(/\.md$/i, '');

    docTitleText.contentEditable = 'true';
    docTitleText.textContent = displayName;
    docTitleText.focus();

    // Select all text
    const range = document.createRange();
    range.selectNodeContents(docTitleText);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);

    const finish = (save) => {
      docTitleText.contentEditable = 'false';
      if (save) {
        const raw = docTitleText.textContent.trim();
        const newName = (raw || displayName) + (original.match(/\.[^.]+$/) ? original.match(/\.[^.]+$/)[0] : '.md');
        f.name = newName;
        docTitleText.textContent = newName.replace(/\.md$/i, '');
        renderTree();
        queueSave();
      } else {
        docTitleText.textContent = displayName;
      }
    };

    const onKey = (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); docTitleText.removeEventListener('keydown', onKey); docTitleText.removeEventListener('blur', onBlur); finish(true); }
      if (e.key === 'Escape') { docTitleText.removeEventListener('keydown', onKey); docTitleText.removeEventListener('blur', onBlur); finish(false); }
    };
    const onBlur = () => { docTitleText.removeEventListener('keydown', onKey); finish(true); };
    docTitleText.addEventListener('keydown', onKey);
    docTitleText.addEventListener('blur', onBlur, { once: true });
  }

  docTitleText.addEventListener('click', beginTitleRename);

  function updateStats(txt) {
    const words = txt.trim() ? txt.trim().split(/\s+/).length : 0;
    const chars = txt.length, lines = txt.split('\n').length;
    if (wordCountEl) wordCountEl.textContent = `${words} words · ${chars} chars`;
    if (statusWdsEl) statusWdsEl.textContent = `${words}w ${chars}c`;
    if (statusLnsEl) statusLnsEl.textContent = `L${lines}`;
  }

  function updateCursor() {
    const pre = editorEl.value.substring(0, editorEl.selectionStart);
    const ln = pre.split('\n').length, col = pre.split('\n').pop().length+1;
    if (statusColEl) statusColEl.textContent = `Ln ${ln}, Col ${col}`;
  }

  // ── Tree rendering ─────────────────────────────────────────
  function renderTree() {
    fileTreeEl.innerHTML = treeHTML(state.tree, 0);
  }

  function treeHTML(nodes, depth) {
    return nodes.map(n => n.type==='folder' ? folderHTML(n, depth) : fileHTML(n, depth)).join('');
  }

  // Build a flat list of all folders with ancestry for the move dialog
  function flatFolders(nodes=state.tree, path='') {
    const out = [];
    for (const n of nodes) {
      if (n.type !== 'folder') continue;
      const label = path ? path + ' / ' + n.name : n.name;
      out.push({ id: n.id, label });
      if (n.children) out.push(...flatFolders(n.children, label));
    }
    return out;
  }

  // Check if `ancestorId` is an ancestor of `nodeId` (to prevent circular drops)
  function isAncestor(ancestorId, nodeId) {
    const node = findNode(ancestorId);
    if (!node || !node.children) return false;
    for (const child of node.children) {
      if (child.id === nodeId) return true;
      if (child.type === 'folder' && isAncestor(child.id, nodeId)) return true;
    }
    return false;
  }

  function folderHTML(f, depth) {
    // Use open-folder icon when expanded
    const iconPath = f.open
      ? 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2zM2 10h20'
      : 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z';
    return `<div class="folder-wrap${f.open?' open':''}" data-id="${f.id}" data-type="folder" draggable="true" style="--depth:${depth}">
  <div class="folder-row" data-id="${f.id}" data-type="folder-row">
    <svg class="folder-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
    <svg class="folder-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="${iconPath}"/></svg>
    <span class="folder-name" data-id="${f.id}">${escH(f.name)}</span>
    <div class="folder-actions">
      <button class="tree-btn" data-action="new-subfolder-in" data-id="${f.id}" data-tip="New subfolder inside ${escH(f.name)}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
      </button>
      <button class="tree-btn" data-action="new-file-in" data-id="${f.id}" data-tip="New file inside ${escH(f.name)}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
      </button>
      <button class="tree-btn danger" data-action="delete-folder" data-id="${f.id}" data-tip="Delete folder ${escH(f.name)}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
      </button>
    </div>
  </div>
  <div class="folder-children">${treeHTML(f.children||[], depth+1)}</div>
</div>`;
  }

  function fileHTML(f, depth) {
    const act = f.id===state.activeId?' active':'';
    return `<div class="file-item${act}" data-id="${f.id}" data-type="file" draggable="true" style="--depth:${depth}">
  <svg class="file-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
  <span class="file-name">${escH(f.name)}</span>
  <div class="file-actions">
    <button class="tree-btn" data-action="duplicate-file" data-id="${f.id}" data-tip="Duplicate ${escH(f.name)}">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
    </button>
    <button class="tree-btn danger" data-action="delete-file" data-id="${f.id}" data-tip="Delete ${escH(f.name)}">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
    </button>
  </div>
</div>`;
  }

  // ── File operations ────────────────────────────────────────
  function loadFile(id) {
    const f = findNode(id);
    if (!f || f.type!=='file') return;
    state.activeId = id;
    editorEl.value = f.content;
    renderPreview(f.content);
    updateStats(f.content);
    updateDocTitle();
    renderTree();
    buildToc();
    queueSave();
  }

  function newFile(folderId=null) {
    const n = flatFiles(state.tree).length+1;
    const f = { type:'file', id:uid(), name:`Untitled ${n}.md`, content:`# Untitled ${n}\n\n` };
    if (folderId) {
      const folder = findNode(folderId);
      if (folder && folder.type==='folder') { folder.children.push(f); folder.open=true; }
    } else {
      state.tree.push(f);
    }
    loadFile(f.id);
  }

  function newFolder(parentId=null) {
    // Count total folders for unique name
    const allFolders = flatFolders();
    const n = allFolders.length + 1;
    const f = { type:'folder', id:uid(), name:`Folder ${n}`, open:true, children:[] };
    if (parentId) {
      const parent = findNode(parentId);
      if (parent && parent.type==='folder') { parent.children.push(f); parent.open=true; }
    } else {
      state.tree.push(f);
    }
    renderTree();
    queueSave();
    setTimeout(()=>beginRename(f.id,'folder'), 40);
  }

  function deleteFile(id) {
    if (flatFiles(state.tree).length<=1) { alert('Must keep at least one file.'); return; }
    removeNode(id, state.tree);
    if (state.activeId===id) {
      const rem = flatFiles(state.tree);
      state.activeId = rem[0]?.id||null;
    }
    state.activeId ? loadFile(state.activeId) : renderTree();
    queueSave();
  }

  function duplicateFile(id) {
    const src = findNode(id);
    if (!src || src.type !== 'file') return;

    // Generate a unique "Copy of …" name
    const base = src.name.replace(/\.md$/i, '');
    const newName = `${base} Copy.md`;

    const copy = { type: 'file', id: uid(), name: newName, content: src.content };

    // Insert the copy right after the original in whichever list contains it
    function insertAfter(nodes) {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === id) { nodes.splice(i + 1, 0, copy); return true; }
        if (nodes[i].children && insertAfter(nodes[i].children)) return true;
      }
      return false;
    }
    if (!insertAfter(state.tree)) state.tree.push(copy);

    loadFile(copy.id);   // switches active file, renders tree, queues save
  }

  function deleteFolder(id) {
    const folder = findNode(id); if (!folder) return;
    const kids = flatFiles([folder]);
    if (flatFiles(state.tree).length - kids.length < 1 && kids.length>0) { alert('Cannot delete: need at least one file.'); return; }
    if (kids.length && !confirm(`Delete "${folder.name}" and its ${kids.length} file(s)?`)) return;
    removeNode(id, state.tree);
    if (kids.find(f=>f.id===state.activeId)) {
      const rem = flatFiles(state.tree);
      state.activeId = rem[0]?.id||null;
    }
    state.activeId ? loadFile(state.activeId) : renderTree();
    queueSave();
  }

  // ── Inline rename ──────────────────────────────────────────
  function beginRename(id, type) {
    const sel = type==='folder'
      ? `.folder-wrap[data-id="${id}"] > .folder-row .folder-name`
      : `.file-item[data-id="${id}"] .file-name`;
    const el = fileTreeEl.querySelector(sel);
    if (!el) return;
    const original = el.textContent;
    el.contentEditable = 'true';
    el.classList.add('editing');
    el.focus();
    // select name without extension
    const dot = original.lastIndexOf('.');
    const range = document.createRange();
    range.setStart(el.firstChild||el, 0);
    range.setEnd(el.firstChild||el, dot>0?dot:original.length);
    const sel2 = window.getSelection(); sel2.removeAllRanges(); sel2.addRange(range);

    const finish = (save) => {
      el.contentEditable = 'false';
      el.classList.remove('editing');
      const node = findNode(id);
      if (save && node) {
        node.name = el.textContent.trim() || original;
        el.textContent = node.name;
        queueSave();
        if (node.id === state.activeId) updateDocTitle();
      } else if (node) {
        el.textContent = original;
      }
    };
    const onKey = (e) => {
      if (e.key==='Enter')  { e.preventDefault(); el.removeEventListener('keydown',onKey); el.removeEventListener('blur',onBlur); finish(true); }
      if (e.key==='Escape') { el.removeEventListener('keydown',onKey); el.removeEventListener('blur',onBlur); finish(false); }
    };
    const onBlur = () => { el.removeEventListener('keydown',onKey); finish(true); };
    el.addEventListener('keydown', onKey);
    el.addEventListener('blur', onBlur, { once:true });
  }

  // ── Drag & Drop — full subfolder support ──────────────────
  let _dragId   = null;
  let _dragType = null;

  function clearDropIndicators() {
    $$('.drag-over-top,.drag-over-bottom,.drag-over-folder', fileTreeEl).forEach(el=>{
      el.classList.remove('drag-over-top','drag-over-bottom','drag-over-folder');
    });
  }

  fileTreeEl.addEventListener('dragstart', e => {
    // Folders: the folder-wrap is draggable but we must not trigger on its children
    const folderWrap = e.target.closest('.folder-wrap');
    const fileItem   = e.target.closest('.file-item');
    if (fileItem) {
      _dragId = fileItem.dataset.id; _dragType = 'file';
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _dragId);
      setTimeout(() => fileItem.classList.add('dragging'), 0);
      e.stopPropagation();
      return;
    }
    if (folderWrap) {
      // Only start a folder drag when the grab is on the folder-row itself
      const row = e.target.closest('.folder-row');
      if (!row) { e.preventDefault(); return; }
      _dragId = folderWrap.dataset.id; _dragType = 'folder';
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _dragId);
      setTimeout(() => folderWrap.classList.add('dragging'), 0);
      e.stopPropagation();
    }
  });

  fileTreeEl.addEventListener('dragend', () => {
    $$('.dragging,.drag-over-top,.drag-over-bottom,.drag-over-folder', fileTreeEl).forEach(el=>{
      el.classList.remove('dragging','drag-over-top','drag-over-bottom','drag-over-folder');
    });
    _dragId = null; _dragType = null;
  });

  fileTreeEl.addEventListener('dragover', e => {
    if (!_dragId) return;

    // Targets in priority order: folder-row (drop INTO), file-item (drop ADJACENT)
    const folderRow = e.target.closest('.folder-row');
    const fileItem  = e.target.closest('.file-item');

    // Self-drop guard
    if (folderRow && folderRow.dataset.id === _dragId) return;
    if (fileItem  && fileItem.dataset.id  === _dragId) return;
    // Ancestor guard: can't drop a folder into its own descendant
    if (folderRow && _dragType === 'folder' && isAncestor(_dragId, folderRow.dataset.id)) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDropIndicators();

    if (folderRow) {
      // Hovering a folder row → drop INTO that folder
      folderRow.classList.add('drag-over-folder');
    } else if (fileItem) {
      // Hovering a file → above/below indicator
      const rect = fileItem.getBoundingClientRect();
      fileItem.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drag-over-top' : 'drag-over-bottom');
    }
  });

  fileTreeEl.addEventListener('dragleave', e => {
    if (!fileTreeEl.contains(e.relatedTarget)) clearDropIndicators();
  });

  fileTreeEl.addEventListener('drop', e => {
    e.preventDefault();
    if (!_dragId) return;

    const folderRow = e.target.closest('.folder-row');
    const fileItem  = e.target.closest('.file-item');
    clearDropIndicators();

    if (folderRow) {
      // ── DROP INTO FOLDER ──
      const targetFolderId = folderRow.dataset.id;
      if (targetFolderId === _dragId) return;
      if (_dragType === 'folder' && isAncestor(_dragId, targetFolderId)) return;

      const dragged = findNode(_dragId); if (!dragged) return;
      removeNode(_dragId, state.tree);
      const targetFolder = findNode(targetFolderId);
      if (targetFolder && targetFolder.type === 'folder') {
        targetFolder.children = targetFolder.children || [];
        targetFolder.children.push(dragged);
        targetFolder.open = true;
      }
      renderTree(); queueSave();

    } else if (fileItem) {
      // ── DROP ADJACENT TO FILE ──
      const targetId = fileItem.dataset.id;
      if (targetId === _dragId) return;

      const rect   = fileItem.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      const dragged = findNode(_dragId); if (!dragged) return;
      removeNode(_dragId, state.tree);

      function insertAdj(nodes) {
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].id === targetId) { nodes.splice(before ? i : i+1, 0, dragged); return true; }
          if (nodes[i].children && insertAdj(nodes[i].children)) return true;
        }
        return false;
      }
      if (!insertAdj(state.tree)) state.tree.push(dragged);
      renderTree(); queueSave();
    }

    _dragId = null; _dragType = null;
  });

  // ── Context menu ───────────────────────────────────────────
  fileTreeEl.addEventListener('contextmenu', e => {
    e.preventDefault();
    const file   = e.target.closest('.file-item');
    const folder = e.target.closest('.folder-row');
    if (file)   openCtxMenu(e.clientX, e.clientY, file.dataset.id,   'file');
    if (folder) openCtxMenu(e.clientX, e.clientY, folder.dataset.id, 'folder');
  });

  function openCtxMenu(x, y, id, type) {
    ctxMenu.innerHTML = '';
    const add = (label, fn, danger=false) => {
      const d = document.createElement('div');
      d.className='ctx-item'+(danger?' danger':'');
      d.textContent=label;
      d.addEventListener('click',()=>{ closeCtx(); fn(); });
      ctxMenu.appendChild(d);
    };
    const sep = () => { const d=document.createElement('div'); d.className='ctx-sep'; ctxMenu.appendChild(d); };

    if (type==='file') {
      add('✏️  Rename',        ()=>beginRename(id,'file'));
      add('📋  Duplicate',     ()=>duplicateFile(id));
      add('📁  Move to…',     ()=>moveDialog(id,'file'));
      sep();
      add('🗑  Delete',        ()=>deleteFile(id), true);
    } else {
      add('✏️  Rename',          ()=>beginRename(id,'folder'));
      add('📄  New file here',   ()=>newFile(id));
      add('📂  New subfolder',   ()=>newFolder(id));
      add('📁  Move to…',       ()=>moveDialog(id,'folder'));
      sep();
      add('🗑  Delete folder',   ()=>deleteFolder(id), true);
    }
    ctxMenu.style.cssText = `left:${x}px;top:${y}px;display:block;`;
    ctxMenu.classList.add('open');
    requestAnimationFrame(()=>{
      const r=ctxMenu.getBoundingClientRect();
      if(r.right>innerWidth)  ctxMenu.style.left=(x-r.width)+'px';
      if(r.bottom>innerHeight)ctxMenu.style.top=(y-r.height)+'px';
    });
  }

  function closeCtx() { ctxMenu.classList.remove('open'); ctxMenu.style.display=''; }

  function moveDialog(id, type) {
    const allFolders = flatFolders();
    // For folders, exclude self and own descendants
    const eligible = type === 'folder'
      ? allFolders.filter(f => f.id !== id && !isAncestor(id, f.id))
      : allFolders;

    const lines = ['0: (root level)', ...eligible.map((f,i)=>`${i+1}: ${f.label}`)].join('\n');
    const raw = prompt(`Move "${findNode(id)?.name}" to:\n${lines}\n\nEnter number:`);
    if (raw === null) return;
    const idx = parseInt(raw);
    if (isNaN(idx) || idx < 0 || idx > eligible.length) return;

    const node = findNode(id); if (!node) return;
    removeNode(id, state.tree);
    if (idx === 0) {
      state.tree.push(node);
    } else {
      const tgt = findNode(eligible[idx-1].id);
      if (tgt) { tgt.children = tgt.children||[]; tgt.children.push(node); tgt.open = true; }
    }
    renderTree(); queueSave();
  }

  document.addEventListener('click', e=>{
    if(!ctxMenu.contains(e.target)) closeCtx();
  });

  // ── Font modal ─────────────────────────────────────────────
  function openFontModal() {
    const box = fontMdl.querySelector('.font-modal-box');

    // local pending state
    let pEF = state.editorFontId,  pPF = state.previewFontId;
    let pES = state.editorFontSize, pPS = state.previewFontSize;

    const mkCard = (f, selected, ftype) =>
      `<div class="font-card${selected?' selected':''}" data-fid="${f.id}" data-ftype="${ftype}">
        <div class="font-card-name">${escH(f.name)}</div>
        <div class="font-card-sample" style="font-family:${f.css}">${escH(f.sample)}</div>
       </div>`;

    box.innerHTML = `
      <div class="modal-title">
        Font Settings
        <button class="modal-close" id="fm-close">✕</button>
      </div>
      <div class="font-section-title">Editor Font</div>
      <div class="font-grid">${EDITOR_FONTS.map(f=>mkCard(f,f.id===pEF,'editor')).join('')}</div>
      <div class="font-size-row">
        <span class="font-size-label">Editor size</span>
        <input id="fm-esz" class="font-size-input" type="number" min="10" max="28" value="${pES}"> px
      </div>
      <div class="font-section-title" style="margin-top:18px">Preview Font</div>
      <div class="font-grid">${PREVIEW_FONTS.map(f=>mkCard(f,f.id===pPF,'preview')).join('')}</div>
      <div class="font-size-row">
        <span class="font-size-label">Preview size</span>
        <input id="fm-psz" class="font-size-input" type="number" min="10" max="28" value="${pPS}"> px
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="fm-cancel">Cancel</button>
        <button class="btn-primary"   id="fm-apply">Apply</button>
      </div>`;

    // card selection
    box.addEventListener('click', e=>{
      const card = e.target.closest('.font-card');
      if (!card) return;
      const ftype=card.dataset.ftype, fid=card.dataset.fid;
      box.querySelectorAll(`.font-card[data-ftype="${ftype}"]`).forEach(c=>c.classList.remove('selected'));
      card.classList.add('selected');
      ensureFont(fid);
      if(ftype==='editor') pEF=fid; else pPF=fid;
    });

    $('#fm-esz',box).addEventListener('input',e=>{ pES=parseInt(e.target.value)||14; });
    $('#fm-psz',box).addEventListener('input',e=>{ pPS=parseInt(e.target.value)||15; });
    $('#fm-close',box).addEventListener('click', ()=>fontMdl.classList.remove('open'));
    $('#fm-cancel',box).addEventListener('click',()=>fontMdl.classList.remove('open'));
    $('#fm-apply', box).addEventListener('click',()=>{
      state.editorFontId=pEF; state.previewFontId=pPF;
      state.editorFontSize=pES; state.previewFontSize=pPS;
      applyFontVars();
      fontMdl.classList.remove('open');
      queueSave();
    });

    fontMdl.classList.add('open');
  }

  // ── Editor tools ───────────────────────────────────────────
  function wrap(before, after='') {
    const s=editorEl.selectionStart, e2=editorEl.selectionEnd;
    const sel=editorEl.value.substring(s,e2);
    editorEl.setRangeText(before+(sel||'text')+(after||before),s,e2,'select');
    editorEl.focus(); onInput();
  }
  function linePrefix(pfx) {
    const s=editorEl.selectionStart;
    const ls=editorEl.value.lastIndexOf('\n',s-1)+1;
    const le=editorEl.value.indexOf('\n',s); const end=le===-1?editorEl.value.length:le;
    const line=editorEl.value.substring(ls,end);
    editorEl.setRangeText(line.startsWith(pfx)?line.slice(pfx.length):pfx+line, ls, end, 'end');
    editorEl.focus(); onInput();
  }
  function block(tmpl, cur) {
    const s=editorEl.selectionStart;
    editorEl.setRangeText(tmpl,s,editorEl.selectionEnd,'end');
    if(cur!==undefined) editorEl.selectionStart=editorEl.selectionEnd=s+cur;
    editorEl.focus(); onInput();
  }

  function onInput() {
    const f=activeFile(); if(!f) return;
    f.content=editorEl.value;
    renderPreview(f.content);
    updateStats(f.content);
    debouncedBuildToc();
    queueSave();
  }

  // ── Keyboard shortcuts ─────────────────────────────────────
  editorEl.addEventListener('keydown', e=>{
    const ctrl=e.ctrlKey||e.metaKey;
    if(ctrl&&e.key==='/'){e.preventDefault();shortcutsMdl.classList.toggle('open');return;}
    if(ctrl&&e.key==='b'){e.preventDefault();wrap('**');return;}
    if(ctrl&&e.key==='i'){e.preventDefault();wrap('*');return;}
    if(ctrl&&e.key==='k'){e.preventDefault();wrap('[','](url)');return;}
    if(ctrl&&e.key==='`'){e.preventDefault();wrap('`');return;}
    if(ctrl&&e.shiftKey&&e.key==='K'){e.preventDefault();block('\n```\n\n```',5);return;}
    if(ctrl&&e.key==='s'){e.preventDefault();saveState();return;}
    if(ctrl&&e.key==='f'){e.preventDefault();openSearch(false);return;}
    if(ctrl&&e.key==='h'){e.preventDefault();openSearch(true);return;}
    if(ctrl&&e.shiftKey&&e.key==='E'){e.preventDefault();dlMD();return;}
    if(e.key==='Tab'){e.preventDefault();const s=editorEl.selectionStart;editorEl.setRangeText('  ',s,editorEl.selectionEnd,'end');onInput();return;}
    if(e.key==='Enter'){
      const s=editorEl.selectionStart;
      const ls=editorEl.value.lastIndexOf('\n',s-1)+1;
      const lt=editorEl.value.substring(ls,s);
      const lm=lt.match(/^(\s*)([-*+]|\d+\.)\s/);
      if(lm){
        e.preventDefault();
        if(lt.trim()===lm[0].trim()){ editorEl.setRangeText('\n',ls,s,'end'); }
        else {
          const nm=lm[2].match(/^(\d+)\./);
          if(nm) editorEl.setRangeText(`\n${lm[1]}${+nm[1]+1}. `,s,s,'end');
          else   editorEl.setRangeText('\n'+lm[0],s,s,'end');
        }
        onInput();
      }
    }
  });

  // ── Splitter ───────────────────────────────────────────────
  let _splitDrag=false;
  splitterEl.addEventListener('mousedown',e=>{e.preventDefault();_splitDrag=true;splitterEl.classList.add('dragging');document.body.style.cssText='cursor:col-resize;user-select:none';});
  document.addEventListener('mousemove',e=>{
    if(!_splitDrag) return;
    const r=panesEl.getBoundingClientRect();
    const pct=Math.min(Math.max((e.clientX-r.left)/(r.width-5),0.2),0.8);
    editorPane.style.flex=`0 0 ${pct*100}%`;
    previewPane.style.flex=`0 0 ${(1-pct)*100}%`;
  });
  document.addEventListener('mouseup',()=>{if(_splitDrag){_splitDrag=false;splitterEl.classList.remove('dragging');document.body.style.cssText='';}});

  // ── Backup & Restore ──────────────────────────────────────

  function doBackup() {
    const now = new Date();
    const stamp = now.getFullYear() + '-'
      + String(now.getMonth()+1).padStart(2,'0') + '-'
      + String(now.getDate()).padStart(2,'0') + '_'
      + String(now.getHours()).padStart(2,'0')
      + String(now.getMinutes()).padStart(2,'0');
    const payload = JSON.stringify(state, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([payload], {type:'application/json'}));
    a.download = `markpad-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Backup downloaded ✓');
  }

  function openBackupModal() {
    const box = backupMdl.querySelector('.modal-box');
    box.innerHTML = `
      <div class="modal-title">
        Backup &amp; Restore
        <button class="modal-close" id="bk-close">✕</button>
      </div>

      <div class="bk-section">
        <div class="bk-section-title">💾 Backup</div>
        <p class="bk-desc">Download a <code>.json</code> snapshot of all your files, folders, and settings.</p>
        <button class="btn-primary" id="bk-download">Download backup</button>
      </div>

      <div class="bk-divider"></div>

      <div class="bk-section">
        <div class="bk-section-title">📂 Restore</div>
        <p class="bk-desc">Load a previously saved <code>.json</code> backup. <strong>This replaces your current workspace.</strong></p>

        <div class="bk-drop-zone" id="bk-drop">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span>Drop backup file here</span>
          <span class="bk-drop-sub">or <label class="bk-browse" for="bk-file-input">browse</label></span>
          <input type="file" id="bk-file-input" accept=".json" style="display:none">
        </div>

        <div id="bk-preview" class="bk-preview" style="display:none">
          <div class="bk-preview-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span id="bk-preview-name"></span>
          </div>
          <div id="bk-preview-stats" class="bk-preview-stats"></div>
        </div>

        <div id="bk-error" class="bk-error" style="display:none"></div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" id="bk-cancel">Cancel</button>
        <button class="btn-primary" id="bk-restore-btn" disabled>Restore</button>
      </div>`;

    let pendingRestore = null;

    function setPending(parsed, filename) {
      pendingRestore = parsed;
      const files = flatFiles(parsed.tree || []);
      const folders = (parsed.tree||[]).filter(n=>n.type==='folder').length;
      $('#bk-preview', box).style.display = 'block';
      $('#bk-preview-name', box).textContent = filename;
      $('#bk-preview-stats', box).textContent =
        `${files.length} file${files.length!==1?'s':''} · ${folders} folder${folders!==1?'s':''} · theme: ${parsed.theme||'?'}`;
      $('#bk-error', box).style.display = 'none';
      $('#bk-restore-btn', box).disabled = false;
    }

    function setError(msg) {
      pendingRestore = null;
      $('#bk-preview', box).style.display = 'none';
      $('#bk-error', box).style.display = 'block';
      $('#bk-error', box).textContent = msg;
      $('#bk-restore-btn', box).disabled = true;
    }

    function readFile(file) {
      if (!file || !file.name.endsWith('.json')) { setError('Please select a .json backup file.'); return; }
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (!parsed.tree || !Array.isArray(parsed.tree)) throw new Error('Invalid backup format — missing tree.');
          setPending(parsed, file.name);
        } catch(err) {
          setError('Could not parse backup: ' + err.message);
        }
      };
      reader.onerror = () => setError('Failed to read file.');
      reader.readAsText(file);
    }

    // drag-drop zone
    const zone = $('#bk-drop', box);
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-active'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-active'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag-active');
      readFile(e.dataTransfer.files[0]);
    });

    // file input browse
    $('#bk-file-input', box).addEventListener('change', e => readFile(e.target.files[0]));

    // buttons
    $('#bk-close',       box).addEventListener('click', () => backupMdl.classList.remove('open'));
    $('#bk-cancel',      box).addEventListener('click', () => backupMdl.classList.remove('open'));
    $('#bk-download',    box).addEventListener('click', () => { doBackup(); });
    $('#bk-restore-btn', box).addEventListener('click', () => {
      if (!pendingRestore) return;
      if (!confirm('Replace your entire workspace with this backup? This cannot be undone.')) return;
      // merge into state
      Object.assign(state, pendingRestore);
      saveState();
      applyFontVars();
      applyTheme(state.theme);
      applyView(state.view);
      renderTree();
      const start = findNode(state.activeId) || flatFiles(state.tree)[0];
      if (start) loadFile(start.id);
      backupMdl.classList.remove('open');
      showToast('Workspace restored ✓');
    });

    backupMdl.classList.add('open');
  }

  // ── Toast ──────────────────────────────────────────────────
  let _toastTimer;
  function showToast(msg) {
    let t = $('#mp-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'mp-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ── Import .md files ──────────────────────────────────────

  const importInput = $('#md-import-input');

  function triggerImport() {
    importInput.value = '';   // reset so same file can be re-imported
    importInput.click();
  }

  importInput.addEventListener('change', e => {
    const files = [...e.target.files];
    if (!files.length) return;
    importFiles(files);
  });

  // Also allow drag-and-drop of .md files onto the sidebar
  sidebarEl.addEventListener('dragover', e => {
    const hasMd = [...(e.dataTransfer.items||[])].some(i => i.kind==='file');
    if (!hasMd) return;
    // Only handle external files (not sidebar tree drags)
    if (_dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    sidebarEl.classList.add('import-drop-active');
  });
  sidebarEl.addEventListener('dragleave', e => {
    if (!sidebarEl.contains(e.relatedTarget)) sidebarEl.classList.remove('import-drop-active');
  });
  sidebarEl.addEventListener('drop', e => {
    sidebarEl.classList.remove('import-drop-active');
    if (_dragId) return;   // internal tree drag — ignore
    const files = [...e.dataTransfer.files].filter(f => /\.(md|markdown|txt)$/i.test(f.name));
    if (!files.length) return;
    e.preventDefault();
    importFiles(files);
  });

  function importFiles(files) {
    // Deduplicate by name against existing files in the workspace
    const existingNames = new Set(flatFiles(state.tree).map(f => f.name));

    // Ask where to place them if there are folders
    const allFolders = flatFolders();
    let destFolderId = null;

    if (allFolders.length) {
      const lines = ['0: Root (no folder)', ...allFolders.map((f, i) => `${i+1}: ${f.label}`)].join('\n');
      const raw = prompt(`Import ${files.length} file${files.length!==1?'s':''} — choose destination:\n\n${lines}\n\nEnter number (or press Cancel to abort):`);
      if (raw === null) return;
      const idx = parseInt(raw);
      if (isNaN(idx) || idx < 0 || idx > allFolders.length) return;
      if (idx > 0) destFolderId = allFolders[idx - 1].id;
    }

    let readCount  = 0;
    let imported   = 0;
    let firstId    = null;
    const total    = files.length;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        readCount++;
        let name = file.name;
        // Ensure .md extension
        if (!/\.(md|markdown)$/i.test(name)) name = name.replace(/\.[^.]+$/, '') + '.md';

        // Deduplicate: append (2), (3)… if name already exists
        if (existingNames.has(name)) {
          const base = name.replace(/\.md$/i, '');
          let n = 2;
          while (existingNames.has(`${base} (${n}).md`)) n++;
          name = `${base} (${n}).md`;
        }
        existingNames.add(name);

        const node = { type:'file', id:uid(), name, content: ev.target.result };
        imported++;

        if (destFolderId) {
          const folder = findNode(destFolderId);
          if (folder) { folder.children = folder.children||[]; folder.children.push(node); folder.open = true; }
        } else {
          state.tree.push(node);
        }

        if (!firstId) firstId = node.id;

        // When all files are read, update UI
        if (readCount === total) {
          renderTree();
          queueSave();
          if (firstId) loadFile(firstId);
          const dest = destFolderId ? `"${findNode(destFolderId)?.name}"` : 'root';
          showToast(`Imported ${imported} file${imported!==1?'s':''} → ${dest}`);
        }
      };
      reader.onerror = () => {
        readCount++;
        if (readCount === total && firstId) { renderTree(); queueSave(); loadFile(firstId); }
      };
      reader.readAsText(file);
    });
  }

  // ── Downloads ──────────────────────────────────────────────
  function dlMD(){
    const f=activeFile();if(!f)return;
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([f.content],{type:'text/markdown'}));
    a.download=f.name; a.click(); URL.revokeObjectURL(a.href);
  }
  function dlHTML(){
    const f=activeFile();if(!f)return;
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escH(f.name)}</title>
<style>body{font-family:Georgia,serif;max-width:760px;margin:40px auto;padding:0 24px;line-height:1.7;color:#222}h1,h2,h3{font-family:system-ui,sans-serif}code{background:#f4f4f4;padding:2px 6px;border-radius:4px}pre{background:#f4f4f4;padding:16px;border-radius:6px;overflow-x:auto}blockquote{border-left:3px solid #999;padding-left:16px;color:#666}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px 12px}th{background:#f0f0f0}</style>
</head><body>${MD.parse(f.content)}</body></html>`;
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));
    a.download=f.name.replace(/\.md$/,'')+'.html'; a.click(); URL.revokeObjectURL(a.href);
  }

  // ── Theme / View ───────────────────────────────────────────
  const THEMES=['slate','paper','forest','nord','solarized','midnight'];

  function applyTheme(t){
    document.documentElement.setAttribute('data-theme',t);
    if(themeSelect) themeSelect.value=t;
    if(statusThmEl) statusThmEl.textContent=t[0].toUpperCase()+t.slice(1);
  }
  function applyView(v){
    panesEl.className='';
    if(v==='editor')  panesEl.classList.add('view-editor');
    if(v==='preview') panesEl.classList.add('view-preview');
    $$('.view-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  }

  // ── SINGLE unified click handler ───────────────────────────
  // All button/action clicks handled here — no duplication, no missed events.
  document.addEventListener('click', e=>{
    // view-btn
    const vb=e.target.closest('.view-btn');
    if(vb){ state.view=vb.dataset.view; applyView(state.view); queueSave(); return; }

    // file tree clicks (not buttons)
    if(!e.target.closest('[data-action]')){
      const fRow=e.target.closest('.folder-row');
      if(fRow && fileTreeEl.contains(fRow)){
        const id=fRow.dataset.id, wrap=fRow.closest('.folder-wrap'), node=findNode(id);
        if(node){ node.open=!node.open; wrap.classList.toggle('open',node.open); queueSave(); }
        return;
      }
      const fItem=e.target.closest('.file-item');
      if(fItem && fileTreeEl.contains(fItem)){ loadFile(fItem.dataset.id); return; }
    }

    // data-action buttons
    const btn=e.target.closest('[data-action]'); if(!btn) return;
    const a=btn.dataset.action, id=btn.dataset.id;
    switch(a){
      case 'bold':          wrap('**'); break;
      case 'italic':        wrap('*'); break;
      case 'strikethrough': wrap('~~'); break;
      case 'code':          wrap('`'); break;
      case 'link':          wrap('[','](url)'); break;
      case 'image':         block('![alt text](url)',2); break;
      case 'h1':            linePrefix('# '); break;
      case 'h2':            linePrefix('## '); break;
      case 'h3':            linePrefix('### '); break;
      case 'ul':            linePrefix('- '); break;
      case 'ol':            linePrefix('1. '); break;
      case 'quote':         linePrefix('> '); break;
      case 'codeblock':     block('\n```\n\n```',5); break;
      case 'hr':            block('\n\n---\n\n'); break;
      case 'table':         block('\n| Col 1 | Col 2 | Col 3 |\n|-------|-------|-------|\n| Cell  | Cell  | Cell  |\n'); break;
      case 'new-file':      newFile(); break;
      case 'new-folder':    newFolder(); break;
      case 'new-file-in':   newFile(id); break;
      case 'new-subfolder-in': newFolder(id); break;
      case 'delete-file':   deleteFile(id); break;
      case 'duplicate-file': duplicateFile(id); break;
      case 'delete-folder': deleteFolder(id); break;
      case 'import-md':     triggerImport(); break;
      case 'download-md':   dlMD(); break;
      case 'download-html': dlHTML(); break;
      case 'fonts':         openFontModal(); break;
      case 'backup':        doBackup(); break;
      case 'restore':       openBackupModal(); break;
      case 'open-search':   openSearch(false); break;
      case 'shortcuts':     shortcutsMdl.classList.toggle('open'); break;
      case 'toggle-sidebar':sidebarEl.classList.toggle('collapsed'); break;
      case 'toggle-toc':    toggleToc(); break;
    }
  });

  // theme select
  themeSelect.addEventListener('change',()=>{ state.theme=themeSelect.value; applyTheme(state.theme); queueSave(); });

  // double-click to rename
  fileTreeEl.addEventListener('dblclick',e=>{
    const fItem=e.target.closest('.file-item');
    if(fItem){ beginRename(fItem.dataset.id,'file'); return; }
    const fName=e.target.closest('.folder-name');
    if(fName){ beginRename(fName.dataset.id,'folder'); }
  });

  // editor events
  editorEl.addEventListener('input',onInput);
  editorEl.addEventListener('keyup',updateCursor);
  editorEl.addEventListener('click',updateCursor);

  // modal close
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){ closeCtx(); shortcutsMdl.classList.remove('open'); fontMdl.classList.remove('open'); backupMdl.classList.remove('open'); }
  });
  [shortcutsMdl,fontMdl,backupMdl].forEach(m=>m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('open'); }));

  // ── Search & Replace ──────────────────────────────────────

  const searchBar       = $('#search-bar');
  const searchInput     = $('#search-input');
  const replaceInput    = $('#replace-input');
  const searchCount     = $('#search-count');
  const replaceRow      = $('#replace-row');
  const btnMatchCase    = $('#search-match-case');
  const btnWholeWord    = $('#search-whole-word');
  const btnRegex        = $('#search-regex');
  const btnPrev         = $('#search-prev');
  const btnNext         = $('#search-next');
  const btnToggleReplace= $('#search-toggle-replace');
  const btnClose        = $('#search-close');
  const btnReplaceOne   = $('#replace-one');
  const btnReplaceAll   = $('#replace-all');

  // State
  const srch = {
    matches:    [],   // array of {start, end} in editor value
    current:    -1,   // index into matches
    matchCase:  false,
    wholeWord:  false,
    useRegex:   false,
  };

  function openSearch(withReplace = false) {
    searchBar.classList.remove('hidden');
    if (withReplace) replaceRow.classList.add('visible');
    // Clear first, then pre-fill only if text is selected in editor
    searchInput.value  = '';
    replaceInput.value = '';
    const sel = editorEl.value.substring(editorEl.selectionStart, editorEl.selectionEnd);
    if (sel && !sel.includes('\n')) {
      searchInput.value = sel;
    }
    searchCount.textContent = '';
    searchInput.classList.remove('no-match');
    searchInput.focus();
    searchInput.select();
    runSearch();
  }

  function closeSearch() {
    searchBar.classList.add('hidden');
    replaceRow.classList.remove('visible');
    srch.matches = [];
    srch.current = -1;
    // Clear inputs — use direct property assignment AND setAttribute for robustness
    searchInput.value        = '';
    replaceInput.value       = '';
    searchInput.defaultValue = '';
    replaceInput.defaultValue= '';
    searchCount.textContent  = '';
    searchInput.classList.remove('no-match');
    editorEl.focus();
  }

  function buildRegex(pattern) {
    if (!pattern) return null;
    try {
      let src = srch.useRegex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (srch.wholeWord) src = `\\b${src}\\b`;
      const flags = srch.matchCase ? 'g' : 'gi';
      return new RegExp(src, flags);
    } catch (e) {
      return null;
    }
  }

  function runSearch() {
    const pattern = searchInput.value;
    const text    = editorEl.value;
    srch.matches  = [];
    srch.current  = -1;

    if (!pattern) {
      searchCount.textContent = '';
      searchInput.classList.remove('no-match');
      updateSearchNav();
      return;
    }

    const rx = buildRegex(pattern);
    if (!rx) {
      searchCount.textContent = 'bad regex';
      searchInput.classList.add('no-match');
      updateSearchNav();
      return;
    }

    let m;
    while ((m = rx.exec(text)) !== null) {
      srch.matches.push({ start: m.index, end: m.index + m[0].length });
      if (rx.lastIndex === m.index) rx.lastIndex++; // prevent infinite loop on zero-length match
    }

    if (srch.matches.length === 0) {
      searchCount.textContent = 'No results';
      searchInput.classList.add('no-match');
      updateSearchNav();
      return;
    }

    searchInput.classList.remove('no-match');

    // Find closest match to current cursor
    const cursor = editorEl.selectionStart;
    let best = 0;
    for (let i = 0; i < srch.matches.length; i++) {
      if (srch.matches[i].start >= cursor) { best = i; break; }
      best = i;
    }
    srch.current = best;
    selectMatch(srch.current);
    updateSearchNav();
  }

  function selectMatch(idx, focusEditor = false) {
    if (idx < 0 || idx >= srch.matches.length) return;
    const { start, end } = srch.matches[idx];
    // Only steal focus when user explicitly navigates, not on every keystroke
    if (focusEditor) {
      editorEl.focus();
      editorEl.setSelectionRange(start, end);
    } else {
      // Update selection without stealing focus from search input
      editorEl.setSelectionRange(start, end);
    }
    scrollEditorToMatch(start);
    updateSearchNav();
  }

  function scrollEditorToMatch(charPos) {
    // Estimate line number and scroll
    const before = editorEl.value.substring(0, charPos);
    const lineNum = before.split('\n').length - 1;
    const lineH   = parseFloat(getComputedStyle(editorEl).lineHeight) || 21;
    const target  = lineNum * lineH - editorEl.clientHeight / 2;
    editorEl.scrollTop = Math.max(0, target);
  }

  function updateSearchNav() {
    const total = srch.matches.length;
    const cur   = total ? srch.current + 1 : 0;
    searchCount.textContent = total ? `${cur} / ${total}` : (searchInput.value ? 'No results' : '');
    btnPrev.disabled     = total < 2;
    btnNext.disabled     = total < 2;
    btnReplaceOne.disabled = total === 0;
    btnReplaceAll.disabled = total === 0;
  }

  function stepMatch(dir) {
    if (!srch.matches.length) return;
    srch.current = (srch.current + dir + srch.matches.length) % srch.matches.length;
    selectMatch(srch.current, true);
  }

  function doReplaceOne() {
    if (!srch.matches.length || srch.current < 0) return;
    const { start, end } = srch.matches[srch.current];
    const replacement = replaceInput.value;
    const text = editorEl.value;

    // For regex mode with capture groups, build replacement properly
    const rx = buildRegex(searchInput.value);
    let finalReplacement = replacement;
    if (srch.useRegex && rx) {
      const matchText = text.substring(start, end);
      finalReplacement = matchText.replace(new RegExp(rx.source, rx.flags.replace('g','')), replacement);
    }

    editorEl.setRangeText(finalReplacement, start, end, 'end');
    onInput();
    runSearch();
  }

  function doReplaceAll() {
    if (!srch.matches.length) return;
    const replacement = replaceInput.value;
    const rx = buildRegex(searchInput.value);
    if (!rx) return;

    // Do replacement directly on value — much simpler than iterating matches
    const newText = srch.useRegex
      ? editorEl.value.replace(rx, replacement)
      : editorEl.value.replace(rx, () => replacement);

    const count = srch.matches.length;
    editorEl.value = newText;
    onInput();
    srch.matches = [];
    srch.current = -1;
    searchCount.textContent = `Replaced ${count}`;
    searchInput.classList.remove('no-match');
    updateSearchNav();
    showToast(`Replaced ${count} occurrence${count !== 1 ? 's' : ''}`);
  }

  // Toggle option buttons
  function toggleSearchOpt(btn, key) {
    srch[key] = !srch[key];
    btn.classList.toggle('active', srch[key]);
    runSearch();
  }

  // Wire up search bar events
  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')       { e.preventDefault(); stepMatch(e.shiftKey ? -1 : 1); }
    if (e.key === 'Escape')      { closeSearch(); }
    if (e.key === 'Tab' && replaceRow.classList.contains('visible')) {
      e.preventDefault(); replaceInput.focus();
    }
  });
  replaceInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); doReplaceOne(); }
    if (e.key === 'Escape') { closeSearch(); }
    if (e.key === 'Tab')    { e.preventDefault(); searchInput.focus(); }
  });

  btnMatchCase.addEventListener('click',     () => toggleSearchOpt(btnMatchCase, 'matchCase'));
  btnWholeWord.addEventListener('click',     () => toggleSearchOpt(btnWholeWord, 'wholeWord'));
  btnRegex.addEventListener('click',         () => toggleSearchOpt(btnRegex,     'useRegex'));
  btnPrev.addEventListener('click',          () => stepMatch(-1));
  btnNext.addEventListener('click',          () => stepMatch(1));
  btnToggleReplace.addEventListener('click', () => {
    replaceRow.classList.toggle('visible');
    if (replaceRow.classList.contains('visible')) replaceInput.focus();
    else searchInput.focus();
  });
  btnClose.addEventListener('click',    closeSearch);
  btnReplaceOne.addEventListener('click', doReplaceOne);
  btnReplaceAll.addEventListener('click', doReplaceAll);

  // Also close on Escape globally if search is open
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !searchBar.classList.contains('hidden')) {
      closeSearch();
    }
  }, true);  // capture phase so it fires before other handlers

  // ── Table of Contents ──────────────────────────────────────

  function toggleToc() {
    const collapsed = tocSidebar.classList.toggle('collapsed');
    state.tocOpen = !collapsed;
    queueSave();
    if (!collapsed) buildToc();
  }

  // Parse headings from raw markdown source (much faster than DOM scanning)
  function parseHeadings(src) {
    const headings = [];
    const lines = src.split('\n');
    let inFence = false;
    for (const line of lines) {
      // Skip fenced code blocks
      if (/^```/.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;
      const m = line.match(/^(#{1,6})\s+(.+)/);
      if (m) {
        headings.push({
          level: m[1].length,
          text:  m[2].replace(/[*_`~\[\]]/g, '').trim(),  // strip inline MD
        });
      }
    }
    return headings;
  }

  function buildToc() {
    if (tocSidebar.classList.contains('collapsed')) return;

    const src = editorEl.value;
    const headings = parseHeadings(src);

    tocList.innerHTML = '';

    if (!headings.length) {
      tocEmpty.classList.add('visible');
      return;
    }
    tocEmpty.classList.remove('visible');

    headings.forEach((h, i) => {
      const a = document.createElement('a');
      a.className   = 'toc-item';
      a.dataset.level = h.level;
      a.dataset.index = i;
      a.textContent = h.text;
      a.href        = '#';
      a.addEventListener('click', e => {
        e.preventDefault();
        jumpToHeading(h.text, h.level);
        setActiveTocItem(a);
      });
      tocList.appendChild(a);
    });

    // Highlight the active heading based on scroll position in preview
    syncActiveTocFromScroll();
  }

  // Jump in PREVIEW pane: find the heading element by text match and scroll to it
  // Also jump in EDITOR: find the line and set cursor there
  function jumpToHeading(text, level) {
    // Jump in preview pane
    const previewPane = $('#preview-pane');
    const headingEls  = previewEl.querySelectorAll('h1,h2,h3,h4,h5,h6');
    for (const el of headingEls) {
      if (el.tagName.toLowerCase() === `h${level}` &&
          el.textContent.trim() === text) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Flash the heading briefly
        el.classList.add('toc-flash');
        setTimeout(() => el.classList.remove('toc-flash'), 900);
        break;
      }
    }

    // Also move editor cursor to that heading line
    const lines = editorEl.value.split('\n');
    const hashes = '#'.repeat(level);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(new RegExp(`^${hashes}\\s+`)) &&
          lines[i].replace(/^#+\s+/, '').replace(/[*_`~\[\]]/g, '').trim() === text) {
        // Calculate char offset
        const charPos = lines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
        editorEl.focus();
        editorEl.setSelectionRange(charPos, charPos + lines[i].length);
        editorEl.scrollTop = editorEl.scrollHeight * (i / lines.length);
        break;
      }
    }
  }

  function setActiveTocItem(el) {
    $$('.toc-item.active', tocList).forEach(x => x.classList.remove('active'));
    if (el) el.classList.add('active');
  }

  // Sync active TOC item based on which heading is near the top of preview scroll
  function syncActiveTocFromScroll() {
    if (tocSidebar.classList.contains('collapsed')) return;
    const previewPaneEl = $('#preview-pane');
    const scrollTop = previewPaneEl.scrollTop + 60; // offset for label bar
    const headingEls = [...previewEl.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    if (!headingEls.length) return;

    let activeIdx = 0;
    for (let i = 0; i < headingEls.length; i++) {
      if (headingEls[i].offsetTop <= scrollTop) activeIdx = i;
      else break;
    }

    const items = [...tocList.querySelectorAll('.toc-item')];
    if (items[activeIdx]) setActiveTocItem(items[activeIdx]);
  }

  // Rebuild TOC on editor input (debounced)
  let _tocTimer;
  function debouncedBuildToc() {
    clearTimeout(_tocTimer);
    _tocTimer = setTimeout(buildToc, 300);
  }

  // Sync scroll position to active item
  $('#preview-pane').addEventListener('scroll', syncActiveTocFromScroll);

  // ── Global Tooltip Engine ──────────────────────────────────
  (function () {
    const tip = document.createElement('div');
    tip.id = 'mp-tooltip';
    document.body.appendChild(tip);

    let showTimer = null;
    let activeEl  = null;

    // Find the closest ancestor (or self) that has data-tip
    function tipTarget(el) {
      let node = el;
      while (node && node !== document.body) {
        if (node.dataset && node.dataset.tip) return node;
        node = node.parentElement;
      }
      return null;
    }

    function place(el) {
      const rect = el.getBoundingClientRect();
      const GAP  = 7;
      const vw   = window.innerWidth;
      const vh   = window.innerHeight;
      // tip is always display:block but visibility:hidden when not .visible
      // so offsetWidth/Height are always measurable
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;

      let left = rect.left + rect.width  / 2 - tw / 2;
      let top  = rect.bottom + GAP;

      if (top + th > vh - 8) top = rect.top - th - GAP;
      left = Math.max(8, Math.min(left, vw - tw - 8));

      tip.style.left = left + 'px';
      tip.style.top  = top  + 'px';
    }

    function show(el) {
      activeEl = el;
      tip.textContent = el.dataset.tip;
      place(el);
      tip.classList.add('visible');
    }

    function hide() {
      clearTimeout(showTimer);
      showTimer = null;
      activeEl  = null;
      tip.classList.remove('visible');
    }

    // Use mouseover/mouseout on document but test the *closest* data-tip ancestor.
    // This avoids the SVG-child-element false-negative problem.
    document.addEventListener('mouseover', e => {
      const el = tipTarget(e.target);
      if (!el) { clearTimeout(showTimer); return; }
      if (el === activeEl) return;            // already showing for this target
      clearTimeout(showTimer);
      showTimer = setTimeout(() => show(el), 480);
    });

    document.addEventListener('mouseout', e => {
      // Only hide if we're leaving the active element (not just moving to a child)
      if (!activeEl) { clearTimeout(showTimer); return; }
      const related = tipTarget(e.relatedTarget);
      if (related === activeEl) return;       // still inside same tipped element
      clearTimeout(showTimer);
      hide();
    });

    document.addEventListener('mousedown',  hide);
    document.addEventListener('scroll',     hide, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  })();

  // ── Init ───────────────────────────────────────────────────
  function init(){
    THEMES.forEach(t=>{
      const o=document.createElement('option'); o.value=t; o.textContent=t[0].toUpperCase()+t.slice(1);
      themeSelect.appendChild(o);
    });
    applyFontVars();
    applyTheme(state.theme);
    applyView(state.view);
    if (state.tocOpen) tocSidebar.classList.remove('collapsed');
    renderTree();
    const start=findNode(state.activeId)||flatFiles(state.tree)[0];
    if(start) loadFile(start.id);
    updateCursor();
  }

  init();
})();
