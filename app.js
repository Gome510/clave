(() => {
  const $ = (id) => document.getElementById(id);
  let root = null, original = null, selected = new Set(), clipboard = null, history = [], future = [], dragged = null;
  const id = () => crypto.randomUUID();
  const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

  function valid(value) { return typeof value === 'string' || (isObject(value) && Object.values(value).every(valid)); }
  function toTree(value, originalPath = []) {
    return { id: id(), key: '__root__', children: Object.entries(value).map(([key, v]) => ({ id: id(), key, originalPath: [...originalPath, key], value: typeof v === 'string' ? v : undefined, children: isObject(v) ? toTree(v, [...originalPath, key]).children : undefined })) };
  }
  function clone(v) { return structuredClone(v); }
  function snapshot() { return clone(root); }
  function save() { if (!root) return; history.push(snapshot()); if (history.length > 100) history.shift(); future = []; updateHistory(); }
  function updateHistory() { const undoButton = $('undo'), redoButton = $('redo'); if (undoButton) undoButton.disabled = !history.length; if (redoButton) redoButton.disabled = !future.length; }
  function undo() { if (!history.length) return; future.push(snapshot()); root = history.pop(); selected.clear(); render(); updateHistory(); }
  function redo() { if (!future.length) return; history.push(snapshot()); root = future.pop(); selected.clear(); render(); updateHistory(); }
  function visit(node, cb, parent = null) { cb(node, parent); node.children?.forEach(n => visit(n, cb, node)); }
  function locate(nodeId) { let found; visit(root, (node, parent) => { if (node.id === nodeId) found = { node, parent }; }); return found; }
  function selectedNodes() { return [...selected].map(x => locate(x)).filter(Boolean); }
  function sameParent(items) { return !items.length || items.every(x => x.parent === items[0].parent); }
  function namesAvailable(parent, nodes, excluded = new Set()) { const seen = new Set(parent.children.filter(n => !excluded.has(n.id)).map(n => n.key)); return nodes.every(n => !seen.has(n.key) && (seen.add(n.key), true)); }
  function pathValue(data, path) { return path.reduce((at, key) => at && at[key], data); }
  function convert(node, translation) { const out = {}; node.children.forEach(child => { out[child.key] = child.children ? convert(child, translation) : (child.originalPath ? (pathValue(translation, child.originalPath) ?? '') : ''); }); return out; }
  function treeToObject(node) { return convert(node, original || {}); }
  function label(node) { return node.key === '__root__' ? 'raíz' : node.key; }

  function render() {
    $('tree').replaceChildren();
    $('editor-empty').classList.toggle('hidden', !!root);
    if (!root) return;
    root.children.forEach(n => $('tree').append(nodeElement(n)));
    $('master-status').textContent = `${root.children.length} claves de nivel superior · ${selected.size ? `${selected.size} seleccionada${selected.size > 1 ? 's' : ''}` : 'sin selección'}`;
    $('selection-status').textContent = selected.size ? `${selected.size} clave${selected.size > 1 ? 's' : ''} seleccionada${selected.size > 1 ? 's' : ''}` : 'Sin selección';
    if (!$('original-panel').classList.contains('hidden')) renderOriginal();
  }
  function nodeElement(node, depth = 0) {
    const el = $('node-template').content.firstElementChild.cloneNode(true), row = el.querySelector('.node-row'), children = el.querySelector('.children'), expand = el.querySelector('.expand');
    el.dataset.id = node.id; row.dataset.id = node.id; row.tabIndex = 0; row.classList.add(`level-${Math.min(depth, 5)}`); row.classList.toggle('leaf', !node.children); row.classList.toggle('selected', selected.has(node.id));
    el.querySelector('.node-key').textContent = node.key;
    const valuePreview = node.children ? '' : JSON.stringify(String(node.value ?? ''));
    el.querySelector('.node-value').textContent = valuePreview.length > 96 ? `${valuePreview.slice(0, 93)}…` : valuePreview;
    el.querySelector('.node-type').textContent = '';
    if (node.children) node.children.forEach(n => children.append(nodeElement(n, depth + 1)));
    else children.remove();
    expand.onclick = (e) => { e.stopPropagation(); children.classList.toggle('collapsed'); expand.textContent = children.classList.contains('collapsed') ? '›' : '⌄'; };
    row.onclick = (e) => selectNode(node, e);
    row.oncontextmenu = (e) => { e.preventDefault(); if (!selected.has(node.id)) { selected = new Set([node.id]); render(); } requestAnimationFrame(() => showActions(e)); };
    row.ondblclick = () => rename([node]);
    row.ondragstart = (e) => { dragged = selected.has(node.id) ? selectedNodes() : [locate(node.id)]; if (!sameParent(dragged)) { e.preventDefault(); alert('Solo puedes mover claves hermanas a la vez.'); return; } e.dataTransfer.effectAllowed = 'move'; };
    row.ondragover = (e) => { if (node.children) { e.preventDefault(); row.classList.add('drop-target'); } };
    row.ondragleave = () => row.classList.remove('drop-target');
    row.ondrop = (e) => { e.preventDefault(); row.classList.remove('drop-target'); moveTo(dragged, node); };
    return el;
  }
  function selectNode(node, e = {}) {
    if (e.metaKey || e.ctrlKey) { selected.has(node.id) ? selected.delete(node.id) : selected.add(node.id); }
    else if (e.shiftKey && selected.size) { const first = locate([...selected][0]); const here = locate(node.id); if (first.parent === here.parent) { const siblings = first.parent.children, a = siblings.indexOf(first.node), b = siblings.indexOf(here.node); selected = new Set(siblings.slice(Math.min(a,b), Math.max(a,b)+1).map(n => n.id)); } else selected = new Set([node.id]); }
    else selected = new Set([node.id]);
    render();
  }
  function moveTo(items, destination) {
    if (!items?.length || !destination.children || !sameParent(items)) return;
    if (items.some(({node}) => node === destination || contains(node, destination))) return alert('No puedes mover un objeto dentro de sí mismo.');
    if (!namesAvailable(destination, items.map(x => x.node), new Set(items.map(x => x.node.id)))) return alert('El destino ya tiene una clave con ese nombre.');
    save(); const source = items[0].parent; const moveIds = new Set(items.map(x => x.node.id)); const moving = source.children.filter(n => moveIds.has(n.id)); source.children = source.children.filter(n => !moveIds.has(n.id)); destination.children.push(...moving); selected = new Set(moving.map(n => n.id)); render();
  }
  function contains(node, maybeChild) { let yes = false; visit(node, n => { if (n === maybeChild) yes = true; }); return yes; }
  function rename(nodes = selectedNodes()) {
    if (!nodes.length) return alert('Selecciona una clave.');
    const initial = nodes.length === 1 ? nodes[0].node.key : '';
    const next = prompt(nodes.length === 1 ? 'Nuevo nombre de clave:' : 'Prefijo que añadir a las claves seleccionadas:', initial);
    if (next === null || !next.trim()) return;
    if (nodes.length > 1) return alert('Para renombrar muchas claves usa Buscar y reemplazar o Formato de claves.');
    const {node,parent} = nodes[0]; if (parent.children.some(n => n !== node && n.key === next.trim())) return alert('Ya existe una clave con ese nombre.');
    save(); node.key = next.trim(); render();
  }
  function add(kind) {
    if (!root) return alert('Importa primero el maestro.'); const target = selected.size ? selectedNodes()[0].node : root;
    if (!target.children) return alert('Selecciona un objeto para crear una clave dentro.');
    const key = prompt(kind === 'object' ? 'Nombre del nuevo objeto:' : 'Nombre de la nueva clave:'); if (!key?.trim()) return;
    if (target.children.some(n => n.key === key.trim())) return alert('Ya existe una clave con ese nombre.'); save(); target.children.push({id:id(), key:key.trim(), children:kind === 'object' ? [] : undefined, value:kind === 'object' ? undefined : ''}); render();
  }
  function remove() { const items = selectedNodes(); if (!items.length) return alert('Selecciona una o más claves.'); if (!sameParent(items)) return alert('Selecciona claves hermanas.'); if (!confirm(`¿Eliminar ${items.length} clave(s)? Sus valores ya no se exportarán.`)) return; save(); const ids = new Set(items.map(x => x.node.id)); items[0].parent.children = items[0].parent.children.filter(n => !ids.has(n.id)); selected.clear(); render(); }
  function cut() { const items = selectedNodes(); if (!items.length || !sameParent(items)) return alert('Selecciona claves hermanas para cortar.'); clipboard = items.map(x => x.node.id); }
  function paste() { if (!clipboard?.length) return alert('No hay claves cortadas.'); const targets = selectedNodes(); const destination = targets.length === 1 && targets[0].node.children ? targets[0].node : root; const items = clipboard.map(locate).filter(Boolean); moveTo(items, destination); clipboard = null; }
  function replaceKeys() {
    const find = $('find-text').value, replace = $('replace-text').value; if (!find) return alert('Escribe el texto que deseas buscar.');
    const scope = selected.size ? selectedNodes().map(x => x.node) : [root]; const targets = [];
    scope.forEach(n => visit(n, (child,parent) => { if (child === root) return; const idx = $('prefix-only').checked ? (child.key.startsWith(find) ? 0 : -1) : child.key.indexOf(find); if (idx >= 0) targets.push({child,parent,next: child.key.slice(0,idx)+replace+child.key.slice(idx+find.length)}); }));
    applyRenameBatch(targets, 'No se encontraron coincidencias.');
  }
  function words(key) { return key.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[^a-zA-Z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean).map(x=>x.toLowerCase()); }
  function formatKey(key, format) { const w=words(key); if(!w.length)return key; if(format==='camel')return w[0]+w.slice(1).map(x=>x[0].toUpperCase()+x.slice(1)).join(''); if(format==='pascal')return w.map(x=>x[0].toUpperCase()+x.slice(1)).join(''); return w.join(format==='kebab'?'-':'_'); }
  function formatKeys() {
    const scope = $('all-keys').checked ? [root] : selected.size ? selectedNodes().map(x=>x.node) : [];
    if (!scope.length) return alert('Selecciona claves o marca “Todas las claves”.'); const targets=[]; scope.forEach(n=>visit(n,(child,parent)=>{if(child!==root)targets.push({child,parent,next:formatKey(child.key,$('case-format').value)});})); applyRenameBatch(targets,'No hay claves que convertir.');
  }
  function applyRenameBatch(targets, empty) {
    targets=targets.filter(x=>x.next!==x.child.key); if(!targets.length)return alert(empty);
    const conflicts=targets.filter(({parent,child,next})=>parent.children.some(n=>n!==child&&!targets.some(t=>t.child===n&&t.parent===parent)&&n.key===next)); if(conflicts.length)return alert(`Hay ${conflicts.length} conflicto(s) de nombres. Corrígelos antes de aplicar.`);
    const preview=targets.slice(0,8).map(x=>`${x.child.key} → ${x.next}`).join('\n'); if(!confirm(`${targets.length} claves cambiarán:\n\n${preview}${targets.length>8?'\n…':''}\n\n¿Aplicar?`))return; save(); targets.forEach(x=>x.child.key=x.next); render();
  }
  function renderOriginal() { $('original-content').textContent = JSON.stringify(original, null, 2); }
  function showActions(event) {
    const dock = $('actions-dock');
    dock.classList.remove('hidden');
    requestAnimationFrame(() => {
      const gap = 8, rect = dock.getBoundingClientRect();
      const x = Math.max(gap, Math.min(event.clientX + 10, window.innerWidth - rect.width - gap));
      const y = Math.max(gap, Math.min(event.clientY + 10, window.innerHeight - rect.height - gap));
      dock.style.left = `${x}px`; dock.style.top = `${y}px`;
    });
  }
  function hideActions() { $('actions-dock').classList.add('hidden'); $('search-popover').classList.add('hidden'); $('format-popover').classList.add('hidden'); }
  function navigateTree(e) {
    if (!root || !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(e.key) || ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
    const rows = [...document.querySelectorAll('#tree .node-row')].filter(row => row.offsetParent !== null);
    const active = document.activeElement.closest?.('.node-row');
    const current = active || rows.find(row => selected.has(row.dataset.id));
    if (!current) return;
    const index = rows.indexOf(current);
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const next = rows[Math.max(0, Math.min(rows.length - 1, index + (e.key === 'ArrowUp' ? -1 : 1)))]; const item = locate(next.dataset.id); selectNode(item.node, {}); requestAnimationFrame(() => document.querySelector(`.node-row[data-id="${next.dataset.id}"]`)?.focus()); return; }
    const item = locate(current.dataset.id), expander = current.querySelector('.expand');
    if (e.key === 'ArrowRight' && item.node.children) { e.preventDefault(); const children = current.parentElement.querySelector('.children'); if (children?.classList.contains('collapsed')) expander.click(); return; }
    if (e.key === 'ArrowLeft' && item.node.children) { e.preventDefault(); const children = current.parentElement.querySelector('.children'); if (!children?.classList.contains('collapsed')) { expander.click(); return; } }
    if (e.key === 'Enter') { e.preventDefault(); rename([item]); }
  }
  function collapseAll() {
    document.querySelectorAll('#tree .children').forEach(children => children.classList.add('collapsed'));
    document.querySelectorAll('#tree .expand').forEach(button => { if (button.offsetParent !== null) button.textContent = '›'; });
  }
  function importMaster(file) { const reader=new FileReader(); reader.onload=()=>{ try { const data=JSON.parse(reader.result); if(!isObject(data)||!valid(data)) throw new Error(); original=data; root=toTree(data); $('master-file-name').textContent = file.name.toUpperCase(); $('reset-master').classList.remove('hidden'); selected.clear(); history=[];future=[];updateHistory();render(); } catch { alert('El maestro debe ser un JSON válido compuesto únicamente por objetos y textos.'); } }; reader.readAsText(file); }
  function resetMaster() { const modal = $('modal'); $('modal-title').textContent = '¿Empezar de nuevo?'; $('modal-text').textContent = 'Se eliminarán los cambios del maestro y los archivos de traducción cargados en esta sesión.'; $('modal-confirm').textContent = 'Borrar y empezar de nuevo'; $('modal-confirm').classList.add('reset-confirm'); modal.dataset.action = 'reset-master'; modal.showModal(); }
  function performResetMaster() { root = null; original = null; selected.clear(); clipboard = null; history = []; future = []; $('master-file-name').textContent = 'SIN MAESTRO'; $('reset-master').classList.add('hidden'); $('master-input').value = ''; $('translation-input').value = ''; $('translation-list').replaceChildren(); hideActions(); updateHistory(); render(); }
  function importTranslations(files) { if(!root)return alert('Importa y edita el maestro primero.'); [...files].forEach(file=>{const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(!isObject(data)||!valid(data))throw new Error(); addTranslation(file.name,data);}catch{alert(`${file.name} no es un JSON de traducción válido.`)}};reader.readAsText(file);}); }
  function addTranslation(name,data) { const output=convert(root,data), row=document.createElement('div');row.className='translation-row';const size=Object.keys(output).length;row.innerHTML=`<strong>${name}</strong><span>Listo · ${size} claves principales</span>`;const btn=document.createElement('button');btn.textContent='Descargar';btn.onclick=()=>download(name,output);row.append(btn);$('translation-list').append(row); }
  function download(name,data) { const blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href); }
  function openTranslations() { if (!root) return alert('Importa y organiza el maestro antes de convertir traducciones.'); $('translations-modal').showModal(); }

  $('master-input').onchange=e=>e.target.files[0]&&importMaster(e.target.files[0]); $('translation-input').onchange=e=>importTranslations(e.target.files); $('collapse-all').onclick=collapseAll; $('rename').onclick=()=>rename();$('new-key').onclick=()=>add('key');$('new-object').onclick=()=>add('object');$('delete').onclick=remove;$('cut').onclick=cut;$('paste').onclick=paste;$('replace').onclick=replaceKeys;$('format-keys').onclick=formatKeys;
  $('reset-master').onclick=resetMaster;
  $('open-translations').onclick=openTranslations; $('close-translations').onclick=()=>$('translations-modal').close();
  $('modal').addEventListener('close', () => { const modal = $('modal'); if (modal.returnValue === 'default' && modal.dataset.action === 'reset-master') performResetMaster(); modal.dataset.action = ''; $('modal-confirm').classList.remove('reset-confirm'); });
  $('toggle-search').onclick=()=>{ $('search-popover').classList.toggle('hidden'); $('format-popover').classList.add('hidden'); };
  $('toggle-format').onclick=()=>{ $('format-popover').classList.toggle('hidden'); $('search-popover').classList.add('hidden'); };
  $('compare-toggle').onchange=e=>{$('original-panel').classList.toggle('hidden',!e.target.checked);if(e.target.checked)renderOriginal();}; $('original-tree-toggle').onclick=()=>renderOriginal();
  document.addEventListener('click', e => { if (!e.target.closest('#actions-dock')) hideActions(); });
  document.addEventListener('keydown',e=>{navigateTree(e);if((e.metaKey||e.ctrlKey)&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){if(e.key==='z'){e.preventDefault();e.shiftKey?redo():undo();}if(e.key==='x'){e.preventDefault();cut();}if(e.key==='v'){e.preventDefault();paste();}}}); updateHistory();
})();
