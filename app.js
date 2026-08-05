/* =========================================================================
   REMESAS — App de control de envíos, ventas, gastos y balance
   Almacenamiento 100% local (localStorage). Sin conexión a internet.
   ========================================================================= */

/* ---------------------------------------------------------------------- *
 * 1. BASE DE DATOS LOCAL
 * ---------------------------------------------------------------------- */
const DB_KEY = 'remesas_db_v1';

function defaultDB(){
  const now = Date.now();
  return {
    divisas: [
      {id:1, nombre:'Zelle', simbolo:'$', orden:1, saldo:0},
      {id:2, nombre:'USD', simbolo:'$', orden:2, saldo:0},
      {id:3, nombre:'CUP efectivo', simbolo:'$', orden:3, saldo:0},
      {id:4, nombre:'CUP transferencia', simbolo:'$', orden:4, saldo:0},
      {id:5, nombre:'USDT', simbolo:'$', orden:5, saldo:0},
      {id:6, nombre:'MXN 🇲🇽', simbolo:'$', orden:6, saldo:0},
      {id:7, nombre:'BRL 🇧🇷', simbolo:'R$', orden:7, saldo:0},
      {id:8, nombre:'UYU 🇺🇾', simbolo:'$', orden:8, saldo:0},
    ],
    clientes: [],
    trabajadores: [],
    envios: [],
    ventas: [],
    compras: [],
    gastos: [],
    in_out: [],
    deudas: [],
    paises: [
      {id:1, nombre:'Estados Unidos', es_predefinido:1},
      {id:2, nombre:'México', es_predefinido:1},
      {id:3, nombre:'Brasil', es_predefinido:1},
      {id:4, nombre:'Uruguay', es_predefinido:1},
      {id:5, nombre:'Europa', es_predefinido:1},
    ],
    monedas: [
      {id:1, nombre:'USD'}, {id:2, nombre:'MXN'}, {id:3, nombre:'EUR'},
      {id:4, nombre:'BRL'}, {id:5, nombre:'UYU'},
    ],
    seq: {divisas:9, clientes:1, trabajadores:1, envios:1, ventas:1, compras:1, gastos:1, in_out:1, paises:6, monedas:6, deudas:1},
    meta: {creado: now, nombre_negocio: 'Mi negocio de remesas'}
  };
}

let DB = loadDB();

function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(!raw) { const d = defaultDB(); persist(d); return d; }
    const parsed = JSON.parse(raw);
    // aseguremos que existan todas las claves (por si se agregan campos nuevos)
    const base = defaultDB();
    for(const k of Object.keys(base)){ if(!(k in parsed)) parsed[k] = base[k]; }
    // fusionar sub-claves nuevas dentro de objetos existentes (seq, meta) para actualizaciones
    parsed.seq = Object.assign({}, base.seq, parsed.seq);
    parsed.meta = Object.assign({}, base.meta, parsed.meta);
    return parsed;
  }catch(e){
    console.error('Error cargando datos, se inicia base nueva', e);
    const d = defaultDB(); persist(d); return d;
  }
}

function persist(dbObj){
  localStorage.setItem(DB_KEY, JSON.stringify(dbObj || DB));
}
function save(){ persist(DB); }

function nextId(tabla){
  const id = DB.seq[tabla] || 1;
  DB.seq[tabla] = id + 1;
  return id;
}

/* ---------------------------------------------------------------------- *
 * 2. UTILIDADES
 * ---------------------------------------------------------------------- */
function round2(n){ return Math.round((Number(n)+Number.EPSILON)*100)/100; }

function fmtMoney(n){
  const v = round2(n||0);
  const neg = v < 0;
  const abs = Math.abs(v).toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2});
  return (neg?'-':'') + abs;
}

function fmtDate(ts){
  if(!ts) return '';
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}
function fmtDateShort(ts){
  if(!ts) return '';
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${dd}/${mm}/${String(d.getFullYear()).slice(2)}`;
}

function escapeHtml(str){
  if(str===undefined || str===null) return '';
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function initials(name){
  if(!name) return '?';
  const clean = name.replace(/[^\p{L}\p{N} ]/gu,'').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if(parts.length===0) return name.slice(0,1).toUpperCase();
  if(parts.length===1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0]+parts[1][0]).toUpperCase();
}

function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>el.classList.remove('show'), 2200);
}

function todayRangeStart(){
  const d = new Date(); d.setHours(0,0,0,0); return d.getTime();
}
function startOfWeek(){
  const d = new Date(); const day = (d.getDay()+6)%7; // lunes=0
  d.setDate(d.getDate()-day); d.setHours(0,0,0,0); return d.getTime();
}
function startOfMonth(){
  const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.getTime();
}
function startOfYear(){
  const d = new Date(); d.setMonth(0,1); d.setHours(0,0,0,0); return d.getTime();
}

/* ---------------------------------------------------------------------- *
 * 3. AJUSTE DE BALANCES
 * ---------------------------------------------------------------------- */
function findDivisa(nombre){
  return DB.divisas.find(d => d.nombre === nombre);
}
function adjustBalance(divisaNombre, delta){
  if(!divisaNombre || !delta) return;
  const d = findDivisa(divisaNombre);
  if(!d) return;
  d.saldo = round2(d.saldo + delta);
}

function applyEnvioBalance(envio, sign){
  // sign = 1 aplica el envío, -1 lo revierte
  adjustBalance(envio.divisa_entrega, -1 * sign * (envio.cantidad_pagada||0));
  adjustBalance(envio.divisa_ganancia, 1 * sign * (envio.ganancia||0));
}
function applyVentaBalance(venta, sign){
  adjustBalance(venta.divisa_vendida, -1 * sign * (venta.cantidad_vendida||0));
  adjustBalance(venta.divisa_recibida, 1 * sign * (venta.cantidad_recibida||0));
}
function applyGastoBalance(gasto, sign){
  adjustBalance(gasto.divisa, -1 * sign * (gasto.cantidad||0));
}

/* ---------------------------------------------------------------------- *
 * 4. AGREGAR ENTIDADES AUXILIARES (divisas, monedas, países)
 * ---------------------------------------------------------------------- */
function addDivisa(nombre){
  nombre = (nombre||'').trim();
  if(!nombre) return null;
  let d = DB.divisas.find(x=>x.nombre.toLowerCase()===nombre.toLowerCase());
  if(d) return d;
  d = {id:nextId('divisas'), nombre, simbolo:'', orden:DB.divisas.length+1, saldo:0};
  DB.divisas.push(d); save();
  return d;
}
function addMoneda(nombre){
  nombre = (nombre||'').trim().toUpperCase();
  if(!nombre) return null;
  let m = DB.monedas.find(x=>x.nombre.toUpperCase()===nombre);
  if(m) return m;
  m = {id:nextId('monedas'), nombre};
  DB.monedas.push(m); save();
  return m;
}
function addPais(nombre){
  nombre = (nombre||'').trim();
  if(!nombre) return null;
  let p = DB.paises.find(x=>x.nombre.toLowerCase()===nombre.toLowerCase());
  if(p) return p;
  p = {id:nextId('paises'), nombre, es_predefinido:0};
  DB.paises.push(p); save();
  return p;
}

/* ---------------------------------------------------------------------- *
 * 5. MODALES / DIÁLOGOS GENÉRICOS
 * ---------------------------------------------------------------------- */
function closeModal(){
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
}

function openModal(html, {center=false} = {}){
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop ${center?'center':''}" id="modal-backdrop">
      <div class="modal-sheet" id="modal-sheet">${html}</div>
    </div>`;
  document.getElementById('modal-backdrop').addEventListener('click', (e)=>{
    if(e.target.id === 'modal-backdrop') closeModal();
  });
}

function confirmDialog(msg, onConfirm, opts={}){
  const okLabel = opts.okLabel || 'Eliminar';
  const cancelLabel = opts.cancelLabel || 'Cancelar';
  const danger = opts.danger !== false;
  openModal(`
    <div class="modal-msg" style="font-size:15px;color:var(--ink);font-weight:600;margin-bottom:0;">${msg}</div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="cd-cancel">${cancelLabel}</button>
      <button class="btn ${danger?'btn-danger':'btn-primary'} btn-block" id="cd-ok">${okLabel}</button>
    </div>
  `, {center:true});
  document.getElementById('cd-cancel').onclick = closeModal;
  document.getElementById('cd-ok').onclick = ()=>{ closeModal(); onConfirm(); };
}

function alertDialog(title, msg){
  openModal(`
    <div class="modal-title">${escapeHtml(title)}</div>
    <div class="modal-msg">${msg}</div>
    <div class="modal-actions"><button class="btn btn-primary btn-block" id="ad-ok">Entendido</button></div>
  `, {center:true});
  document.getElementById('ad-ok').onclick = closeModal;
}

// Confirmación de "cambios sin guardar" — se usa opcionalmente desde formularios
function confirmDiscard(onDiscard){
  confirmDialog('Tiene cambios sin guardar. ¿Desea descartarlos?', onDiscard, {okLabel:'Descartar', cancelLabel:'Seguir editando'});
}

/* ---------------------------------------------------------------------- *
 * 6. SELECTOR CON BÚSQUEDA (clientes / trabajadores / cliente+trabajador)
 * ---------------------------------------------------------------------- */
// Abre un picker de búsqueda; onPick(item, tipo) se llama al elegir.
// modo: 'cliente' | 'trabajador' | 'combinado'
function openEntityPicker(modo, onPick){
  const clientesActivos = DB.clientes.filter(c=>c.activo).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  const trabajadoresActivos = DB.trabajadores.filter(t=>t.activo).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));

  function renderList(filter){
    const f = (filter||'').toLowerCase();
    let items = [];
    if(modo==='cliente' || modo==='combinado'){
      items = items.concat(clientesActivos.filter(c=>c.nombre.toLowerCase().includes(f)).map(c=>({...c, __tipo:'cliente'})));
    }
    if(modo==='trabajador' || modo==='combinado'){
      items = items.concat(trabajadoresActivos.filter(t=>t.nombre.toLowerCase().includes(f)).map(t=>({...t, __tipo:'trabajador'})));
    }
    if(items.length===0){
      return `<div class="empty-state"><div class="ei">🔍</div>Sin resultados</div>`;
    }
    return items.map(it => `
      <div class="list-item" data-pick-id="${it.id}" data-pick-tipo="${it.__tipo}">
        <div class="avatar">${it.__tipo==='trabajador'?'👷':initials(it.nombre)}</div>
        <div class="li-main">
          <div class="li-title">${escapeHtml(it.nombre)}</div>
          <div class="li-sub">${it.__tipo==='trabajador' ? 'Trabajador' : escapeHtml(it.pais||'')}</div>
        </div>
      </div>`).join('');
  }

  const title = modo==='trabajador' ? 'Seleccionar trabajador' : (modo==='combinado' ? 'Seleccionar cliente o trabajador' : 'Seleccionar cliente');

  openModal(`
    <div class="modal-title">${title}</div>
    <div class="search-wrap" style="margin-top:12px;">
      <span class="search-icon">🔍</span>
      <input type="text" id="picker-search" placeholder="Buscar por nombre..." autocomplete="off">
    </div>
    ${(modo==='cliente'||modo==='combinado') ? `<button class="btn btn-outline btn-block" id="picker-new-cliente" style="margin-bottom:10px;">➕ Nuevo cliente</button>` : ''}
    <div id="picker-list">${renderList('')}</div>
  `);

  const listEl = document.getElementById('picker-list');
  document.getElementById('picker-search').addEventListener('input', (e)=>{
    listEl.innerHTML = renderList(e.target.value);
    bindPickHandlers();
  });
  function bindPickHandlers(){
    listEl.querySelectorAll('[data-pick-id]').forEach(el=>{
      el.onclick = ()=>{
        const id = Number(el.getAttribute('data-pick-id'));
        const tipo = el.getAttribute('data-pick-tipo');
        const item = tipo==='cliente' ? DB.clientes.find(c=>c.id===id) : DB.trabajadores.find(t=>t.id===id);
        closeModal();
        onPick(item, tipo);
      };
    });
  }
  bindPickHandlers();
  const newBtn = document.getElementById('picker-new-cliente');
  if(newBtn){
    newBtn.onclick = ()=>{
      openClienteFormModal(null, (cliente)=>{
        onPick(cliente, 'cliente');
      });
    };
  }
  setTimeout(()=>document.getElementById('picker-search')?.focus(), 150);
}

/* ---------------------------------------------------------------------- *
 * 7. SELECT CON OPCIÓN "AGREGAR..." (divisas / monedas / países)
 * ---------------------------------------------------------------------- */
function divisaOptionsHtml(selected){
  return DB.divisas.slice().sort((a,b)=>(a.orden||0)-(b.orden||0))
    .map(d=>`<option value="${escapeHtml(d.nombre)}" ${d.nombre===selected?'selected':''}>${escapeHtml(d.nombre)}</option>`).join('')
    + `<option value="__add__">➕ Agregar divisa...</option>`;
}
function monedaOptionsHtml(selected){
  return DB.monedas.map(m=>`<option value="${escapeHtml(m.nombre)}" ${m.nombre===selected?'selected':''}>${escapeHtml(m.nombre)}</option>`).join('')
    + `<option value="__add__">➕ Agregar moneda...</option>`;
}
function paisOptionsHtml(selected){
  return DB.paises.map(p=>`<option value="${escapeHtml(p.nombre)}" ${p.nombre===selected?'selected':''}>${escapeHtml(p.nombre)}</option>`).join('')
    + `<option value="__add__">➕ Agregar país...</option>`;
}

// Adjunta el comportamiento de "Agregar..." a un <select>. addFn crea la entidad, refreshFn re-renderiza opciones.
function bindAddOnSelect(selectEl, addFn, refreshOptionsFn){
  selectEl.addEventListener('change', ()=>{
    if(selectEl.value === '__add__'){
      promptText('Nuevo valor', (val)=>{
        if(!val){ selectEl.value = selectEl.dataset.prev || ''; return; }
        addFn(val);
        selectEl.innerHTML = refreshOptionsFn(val);
        selectEl.dataset.prev = val;
        selectEl.dispatchEvent(new Event('change-programmatic'));
      }, ()=>{ selectEl.value = selectEl.dataset.prev || ''; });
    } else {
      selectEl.dataset.prev = selectEl.value;
    }
  });
  selectEl.dataset.prev = selectEl.value;
}

function promptText(title, onOk, onCancel){
  openModal(`
    <div class="modal-title">${escapeHtml(title)}</div>
    <div class="field" style="margin-top:12px;">
      <input type="text" id="pt-input" placeholder="Escriba aquí...">
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="pt-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="pt-ok">Agregar</button>
    </div>
  `, {center:true});
  const input = document.getElementById('pt-input');
  setTimeout(()=>input.focus(), 150);
  document.getElementById('pt-cancel').onclick = ()=>{ closeModal(); onCancel && onCancel(); };
  document.getElementById('pt-ok').onclick = ()=>{
    const v = input.value.trim();
    closeModal();
    onOk(v);
  };
  input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ document.getElementById('pt-ok').click(); }});
}

/* ---------------------------------------------------------------------- *
 * 8. ROUTER
 * ---------------------------------------------------------------------- */
const TITLES = {
  clientes:'Clientes', envio:'Nuevo envío', trabajadores:'Trabajadores',
  'precio-especial':'Precio especial', historial:'Historial de envíos',
  compras:'Compras', ventas:'Ventas', gastos:'Gastos', 'in-out':'In/Out',
  balance:'Balance', respaldos:'Respaldos', deudas:'Deudas'
};

function parseHash(){
  const h = location.hash.replace(/^#\//,'') || 'clientes';
  const [view, ...rest] = h.split('/');
  return {view: view || 'clientes', param: rest.join('/')};
}

function setActiveMenu(view){
  document.querySelectorAll('.menu-list a').forEach(a=>{
    a.classList.toggle('active', a.dataset.view === view);
  });
  document.getElementById('topbar-title').textContent = TITLES[view] || 'Remesas';
}

function route(){
  const {view, param} = parseHash();
  setActiveMenu(view);
  closeSideMenu();
  const content = document.getElementById('app-content');
  switch(view){
    case 'clientes': return renderClientesList(content, param);
    case 'cliente-detalle': return renderClienteDetalle(content, Number(param));
    case 'envio': return renderEnvioClienteForm(content);
    case 'trabajadores': return renderTrabajadoresList(content);
    case 'trabajador-detalle': return renderTrabajadorDetalle(content, Number(param));
    case 'envio-trabajador': return renderEnvioTrabajadorForm(content, Number(param));
    case 'precio-especial': return renderPrecioEspecialForm(content);
    case 'historial': return renderHistorial(content, param);
    case 'envio-detalle': return renderEnvioDetalle(content, Number(param));
    case 'ventas': return renderVentasList(content);
    case 'compras': return renderComprasList(content);
    case 'gastos': return renderGastosList(content);
    case 'in-out': return renderInOut(content);
    case 'balance': return renderBalance(content);
    case 'respaldos': return renderRespaldos(content);
    case 'deudas': return renderDeudas(content);
    default: return renderClientesList(content);
  }
}

function openSideMenu(){
  document.getElementById('side-menu').classList.add('open');
  document.getElementById('side-overlay').classList.add('open');
}
function closeSideMenu(){
  document.getElementById('side-menu').classList.remove('open');
  document.getElementById('side-overlay').classList.remove('open');
}

window.addEventListener('hashchange', route);
document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('btn-menu').addEventListener('click', openSideMenu);
  document.getElementById('side-overlay').addEventListener('click', closeSideMenu);
  document.querySelectorAll('.menu-list a').forEach(a=>{
    a.addEventListener('click', closeSideMenu);
  });
  if(!location.hash) location.hash = '#/clientes';
  route();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
});

/* ---------------------------------------------------------------------- *
 * 9. MENÚ 1 — CLIENTES
 * ---------------------------------------------------------------------- */
function renderClientesList(content, searchTerm){
  searchTerm = searchTerm || '';
  const items = DB.clientes
    .filter(c=>c.activo)
    .filter(c=>c.nombre.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));

  content.innerHTML = `
    <h1 class="section-title">Clientes</h1>
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input type="text" id="cli-search" placeholder="Buscar cliente..." value="${escapeHtml(searchTerm)}">
    </div>
    <div id="cli-list">${items.length ? items.map(clienteRowHtml).join('') : emptyState('👤','Aún no hay clientes registrados')}</div>
    <button class="fab" id="fab-add-cliente" aria-label="Agregar cliente">+</button>
  `;
  document.getElementById('cli-search').addEventListener('input', e=>{
    document.getElementById('cli-list').innerHTML = renderClienteListInner(e.target.value);
    bindClienteRowClicks();
  });
  document.getElementById('fab-add-cliente').onclick = ()=>openClienteFormModal(null, ()=>route());
  bindClienteRowClicks();

  function bindClienteRowClicks(){
    document.querySelectorAll('#cli-list .list-item').forEach(el=>{
      el.onclick = (e)=>{
        if(e.target.closest('.trash-btn') || e.target.closest('.edit-btn')) return;
        location.hash = `#/cliente-detalle/${el.dataset.id}`;
      };
    });
    document.querySelectorAll('#cli-list .edit-btn').forEach(el=>{
      el.onclick = (e)=>{
        e.stopPropagation();
        openClienteFormModal(Number(el.dataset.id), ()=>{
          document.getElementById('cli-list').innerHTML = renderClienteListInner(document.getElementById('cli-search').value);
          bindClienteRowClicks();
        });
      };
    });
    document.querySelectorAll('#cli-list .trash-btn').forEach(el=>{
      el.onclick = (e)=>{
        e.stopPropagation();
        const c = DB.clientes.find(x=>x.id===Number(el.dataset.id));
        confirmDialog(`¿Eliminar al cliente ${escapeHtml(c.nombre)}?`, ()=>{
          c.activo = 0; save(); toast('Cliente eliminado');
          document.getElementById('cli-list').innerHTML = renderClienteListInner(document.getElementById('cli-search').value);
          bindClienteRowClicks();
        });
      };
    });
  }
}
function renderClienteListInner(searchTerm){
  searchTerm = searchTerm || '';
  const items = DB.clientes.filter(c=>c.activo)
    .filter(c=>c.nombre.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  return items.length ? items.map(clienteRowHtml).join('') : emptyState('👤','Aún no hay clientes registrados');
}
function clienteRowHtml(c){
  return `
    <div class="list-item" data-id="${c.id}">
      <div class="avatar">${initials(c.nombre)}</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(c.nombre)}</div>
        <div class="li-sub">${escapeHtml(c.telefono || 'Sin teléfono')}</div>
      </div>
      <button class="icon-action-btn edit-btn" data-id="${c.id}" aria-label="Editar">✏️</button>
      <button class="icon-action-btn trash-btn" data-id="${c.id}" aria-label="Eliminar">🗑️</button>
    </div>`;
}
function emptyState(icon, text){
  return `<div class="empty-state"><div class="ei">${icon}</div>${escapeHtml(text)}</div>`;
}

function openClienteFormModal(clienteId, onSaved){
  const editing = clienteId ? DB.clientes.find(c=>c.id===clienteId) : null;
  openModal(`
    <div class="modal-title">${editing?'Editar cliente':'Agregar cliente'}</div>
    <label class="field-label">Nombre *</label>
    <input type="text" id="cf-nombre" maxlength="100" value="${escapeHtml(editing?.nombre||'')}" placeholder="Nombre del cliente">
    <label class="field-label">País *</label>
    <select id="cf-pais" class="picker">${paisOptionsHtml(editing?.pais)}</select>
    <label class="field-label">Número de contacto</label>
    <input type="tel" id="cf-tel" maxlength="20" value="${escapeHtml(editing?.telefono||'')}" placeholder="Opcional">
    <label class="field-label">Notas</label>
    <textarea id="cf-notas" maxlength="500" placeholder="Opcional">${escapeHtml(editing?.notas||'')}</textarea>
    <div id="cf-error" style="color:var(--red);font-size:13px;margin-top:10px;display:none;"></div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="cf-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="cf-save">Guardar</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('cf-pais'), addPais, paisOptionsHtml);
  document.getElementById('cf-cancel').onclick = closeModal;
  document.getElementById('cf-save').onclick = ()=>{
    const nombre = document.getElementById('cf-nombre').value.trim();
    const pais = document.getElementById('cf-pais').value;
    const errEl = document.getElementById('cf-error');
    if(!nombre){ errEl.textContent = 'El nombre del cliente es obligatorio.'; errEl.style.display='block'; return; }
    if(!pais || pais==='__add__'){ errEl.textContent = 'El país es obligatorio.'; errEl.style.display='block'; return; }
    const telefono = document.getElementById('cf-tel').value.trim();
    const notas = document.getElementById('cf-notas').value.trim();
    let cliente;
    if(editing){
      editing.nombre = nombre; editing.pais = pais; editing.telefono = telefono; editing.notas = notas;
      cliente = editing;
    } else {
      cliente = {id:nextId('clientes'), nombre, pais, telefono, notas, fecha_registro:Date.now(), activo:1};
      DB.clientes.push(cliente);
    }
    save();
    closeModal();
    toast(editing? 'Cliente actualizado' : 'Cliente agregado');
    onSaved && onSaved(cliente);
  };
}

function renderClienteDetalle(content, id){
  const c = DB.clientes.find(x=>x.id===id);
  if(!c){ content.innerHTML = emptyState('❓','Cliente no encontrado'); return; }
  const envios = DB.envios
    .filter(e => (e.tipo==='cliente_directo' || e.tipo==='precio_especial') && e.cliente_id===id)
    .sort((a,b)=>b.fecha_hora-a.fecha_hora)
    .slice(0,10);

  content.innerHTML = `
    <button class="btn btn-ghost btn-sm" id="back-btn">← Volver</button>
    <div class="card" style="margin-top:10px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="avatar" style="width:52px;height:52px;font-size:19px;">${initials(c.nombre)}</div>
        <div>
          <div style="font-weight:800;font-size:18px;">${escapeHtml(c.nombre)}</div>
          <div class="subtle">${escapeHtml(c.pais)}</div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="sumrow"><span class="k">Contacto</span><span class="v">${escapeHtml(c.telefono || 'No especificado')}</span></div>
      <div class="sumrow"><span class="k">Notas</span><span class="v">${escapeHtml(c.notas || 'Sin notas')}</span></div>
      <div class="sumrow"><span class="k">Registrado</span><span class="v">${fmtDate(c.fecha_registro)}</span></div>
      <div class="modal-actions" style="margin-top:14px;">
        <button class="btn btn-outline btn-block" id="cd-edit">Editar</button>
        <button class="btn btn-danger btn-block" id="cd-del">Eliminar</button>
      </div>
    </div>

    <h3 style="margin:18px 0 10px;font-size:15px;color:var(--teal-900);">Últimos envíos</h3>
    <div id="cd-envios">
      ${envios.length ? envios.map(e=>`
        <div class="list-item" data-eid="${e.id}">
          <div class="avatar">${e.tipo==='precio_especial'?'⭐':'📤'}</div>
          <div class="li-main">
            <div class="li-title">${fmtDateShort(e.fecha_hora)} · ${fmtMoney(e.cantidad_enviada)} ${escapeHtml(e.moneda)}</div>
            <div class="li-sub">Ganancia: ${fmtMoney(e.ganancia)} ${escapeHtml(e.divisa_ganancia)}</div>
          </div>
        </div>`).join('') : emptyState('📤','Este cliente aún no ha realizado envíos')}
    </div>
  `;
  document.getElementById('back-btn').onclick = ()=> history.back();
  document.getElementById('cd-edit').onclick = ()=> openClienteFormModal(c.id, ()=>renderClienteDetalle(content, id));
  document.getElementById('cd-del').onclick = ()=>{
    confirmDialog(`¿Eliminar al cliente ${escapeHtml(c.nombre)}?`, ()=>{
      c.activo = 0; save(); toast('Cliente eliminado'); location.hash = '#/clientes';
    });
  };
  content.querySelectorAll('#cd-envios .list-item').forEach(el=>{
    el.onclick = ()=> location.hash = `#/envio-detalle/${el.dataset.eid}`;
  });
}

/* ---------------------------------------------------------------------- *
 * 10. MENÚ 2 — ENVÍO (CLIENTE DIRECTO)  y  MENÚ 3.5 — ENVÍO DE TRABAJADOR
 *     (comparten el mismo motor de formulario / cálculo)
 * ---------------------------------------------------------------------- */
function envioFormHtml(opts){
  // opts: {tipo, entityLabel, entityName, showEntityPicker}
  return `
    <h1 class="section-title">${opts.titulo}</h1>

    <label class="field-label">${opts.entityLabel} *</label>
    ${opts.showEntityPicker ? `
      <div class="picker" id="ef-entity-picker">
        <span id="ef-entity-name" class="${opts.entityName?'':'ph'}">${escapeHtml(opts.entityName || 'Toca para seleccionar...')}</span>
        <span>🔍</span>
      </div>
      <button class="btn btn-outline btn-sm" id="ef-add-cliente" style="margin-top:8px;">➕ Cliente</button>
    ` : `
      <input type="text" value="${escapeHtml(opts.entityName)}" disabled>
    `}

    <label class="field-label">Cantidad enviada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ef-cantidad" placeholder="0.00">

    <label class="field-label">Moneda *</label>
    <select id="ef-moneda" class="picker">${monedaOptionsHtml('USD')}</select>

    <label class="field-label">Precio *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ef-precio" placeholder="0.00">

    <label class="field-label">Cantidad pagada (Entregar) *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ef-pagada" placeholder="0.00">
    <div class="hint">Se calcula automático: Cantidad enviada × Precio. Puede ajustarlo.</div>

    <label class="field-label">Divisa de entrega *</label>
    <select id="ef-divisa-entrega" class="picker">${divisaOptionsHtml('')}</select>

    <label class="field-label">Cotizado a</label>
    <input type="number" inputmode="decimal" step="0.01" id="ef-cotizado" placeholder="Opcional">

    <label class="field-label">Ganancia *</label>
    <input type="number" inputmode="decimal" step="0.01" id="ef-ganancia" placeholder="0.00">
    <div class="hint">Se calcula automático: Cantidad enviada × (Cotizado a − Precio). Puede ajustarlo.</div>

    <label class="field-label">Divisa de ganancia *</label>
    <select id="ef-divisa-ganancia" class="picker">${divisaOptionsHtml('')}</select>

    <label class="field-label">Forma de ganancia *</label>
    <div class="pill-row" id="ef-forma">
      <div class="pill active" data-v="Efectivo">Efectivo</div>
      <div class="pill" data-v="Transferencia">Transferencia</div>
      <div class="pill" data-v="USD">USD</div>
    </div>

    <label class="field-label">Fecha y hora del envío *</label>
    <input type="datetime-local" id="ef-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <div class="hint">Por defecto es la fecha y hora actual. Puede ajustarla.</div>

    <label class="field-label">Nota</label>
    <textarea id="ef-nota" maxlength="500" placeholder="Opcional"></textarea>

    <button class="btn btn-primary btn-block" id="ef-revisar" style="margin-top:22px;">Revisar y guardar</button>
  `;
}

function wireEnvioForm(content, {tipo, getEntity, setEntity, entityRequired, onSaved}){
  const cantEl = document.getElementById('ef-cantidad');
  const precioEl = document.getElementById('ef-precio');
  const pagadaEl = document.getElementById('ef-pagada');
  const cotizadoEl = document.getElementById('ef-cotizado');
  const gananciaEl = document.getElementById('ef-ganancia');
  const divEntregaEl = document.getElementById('ef-divisa-entrega');
  const divGananciaEl = document.getElementById('ef-divisa-ganancia');
  const monedaEl = document.getElementById('ef-moneda');
  const notaEl = document.getElementById('ef-nota');
  let pagadaTouched = false, gananciaTouched = false;
  let formaGanancia = 'Efectivo';

  bindAddOnSelect(monedaEl, addMoneda, monedaOptionsHtml);
  bindAddOnSelect(divEntregaEl, addDivisa, divisaOptionsHtml);
  bindAddOnSelect(divGananciaEl, addDivisa, divisaOptionsHtml);

  document.querySelectorAll('#ef-forma .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#ef-forma .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      formaGanancia = p.dataset.v;
    };
  });

  function recalc(){
    const cant = parseFloat(cantEl.value)||0;
    const precio = parseFloat(precioEl.value)||0;
    const cotizado = cotizadoEl.value.trim()==='' ? null : parseFloat(cotizadoEl.value);
    if(!pagadaTouched) pagadaEl.value = cant && precio ? round2(cant*precio) : '';
    if(!gananciaTouched){
      gananciaEl.value = (cotizado!==null) ? round2(cant*(cotizado-precio)) : '';
    }
    // Validación visual: cotizado < precio
    if(cotizado!==null && cotizado < precio){
      cotizadoEl.classList.add('err');
      revisarBtn.disabled = true;
      revisarBtn.style.opacity = .5;
    } else {
      cotizadoEl.classList.remove('err');
      revisarBtn.disabled = false;
      revisarBtn.style.opacity = 1;
    }
  }
  const revisarBtn = document.getElementById('ef-revisar');
  [cantEl, precioEl, cotizadoEl].forEach(el=>el.addEventListener('input', recalc));
  pagadaEl.addEventListener('input', ()=>{ pagadaTouched = true; });
  gananciaEl.addEventListener('input', ()=>{ gananciaTouched = true; });

  if(entityRequired){
    const pickerEl = document.getElementById('ef-entity-picker');
    pickerEl.onclick = ()=>{
      openEntityPicker('cliente', (item)=>{
        setEntity(item);
        document.getElementById('ef-entity-name').textContent = item.nombre;
        document.getElementById('ef-entity-name').classList.remove('ph');
      });
    };
    document.getElementById('ef-add-cliente').onclick = ()=>{
      openClienteFormModal(null, (cliente)=>{
        setEntity(cliente);
        document.getElementById('ef-entity-name').textContent = cliente.nombre;
        document.getElementById('ef-entity-name').classList.remove('ph');
      });
    };
  }

  revisarBtn.onclick = ()=>{
    const entity = getEntity();
    if(entityRequired && !entity){ toast('Seleccione un cliente'); return; }
    const cantidad_enviada = parseFloat(cantEl.value);
    const moneda = monedaEl.value.toUpperCase();
    const precio = parseFloat(precioEl.value);
    const cantidad_pagada = parseFloat(pagadaEl.value);
    const divisa_entrega = divEntregaEl.value;
    const cotizado_a = cotizadoEl.value.trim()==='' ? null : parseFloat(cotizadoEl.value);
    const ganancia = parseFloat(gananciaEl.value || 0);
    const divisa_ganancia = divGananciaEl.value;
    const nota = notaEl.value.trim();
    const fechaVal = document.getElementById('ef-fecha').value;

    if(!cantidad_enviada || !precio || isNaN(cantidad_pagada) || !divisa_entrega || !divisa_ganancia || divisa_entrega==='__add__' || divisa_ganancia==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }

    const envio = {
      tipo,
      cliente_id: tipo==='cliente_directo' ? entity.id : (tipo==='trabajador'?null:undefined),
      trabajador_id: tipo==='trabajador' ? entity.id : null,
      cantidad_enviada, moneda, precio, cantidad_pagada,
      cotizado_a, ganancia, divisa_entrega, divisa_ganancia,
      forma_ganancia: formaGanancia, nota,
      fecha_hora: new Date(fechaVal).getTime()
    };
    showEnvioSummary(envio, entity, onSaved);
  };

  recalc();
}

function showEnvioSummary(envio, entity, onSaved){
  openModal(`
    <div class="modal-title">Confirme los datos del envío antes de guardar.</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line);padding:12px;margin-top:10px;">
      <div class="sumrow"><span class="k">${envio.tipo==='trabajador'?'Trabajador':'Cliente'}</span><span class="v">${escapeHtml(entity.nombre)}</span></div>
      <div class="sumrow"><span class="k">Cantidad enviada</span><span class="v">${fmtMoney(envio.cantidad_enviada)} ${escapeHtml(envio.moneda)}</span></div>
      <div class="sumrow"><span class="k">Precio</span><span class="v">${fmtMoney(envio.precio)}</span></div>
      <div class="sumrow"><span class="k">Cantidad pagada</span><span class="v">${fmtMoney(envio.cantidad_pagada)}</span></div>
      <div class="sumrow"><span class="k">Divisa de entrega</span><span class="v">${escapeHtml(envio.divisa_entrega)}</span></div>
      <div class="sumrow"><span class="k">Cotizado a</span><span class="v">${envio.cotizado_a!==null?fmtMoney(envio.cotizado_a):'—'}</span></div>
      <div class="sumrow"><span class="k">Ganancia</span><span class="v">${fmtMoney(envio.ganancia)}</span></div>
      <div class="sumrow"><span class="k">Divisa de ganancia</span><span class="v">${escapeHtml(envio.divisa_ganancia)}</span></div>
      <div class="sumrow"><span class="k">Forma de ganancia</span><span class="v">${escapeHtml(envio.forma_ganancia)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(envio.fecha_hora)}</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="es-volver">Volver a editar</button>
      <button class="btn btn-primary btn-block" id="es-confirmar">Confirmar y guardar</button>
    </div>
  `);
  document.getElementById('es-volver').onclick = closeModal;
  document.getElementById('es-confirmar').onclick = ()=>{
    envio.id = nextId('envios');
    DB.envios.push(envio);
    applyEnvioBalance(envio, 1);
    save();
    closeModal();
    toast('Envío guardado');
    onSaved && onSaved();
  };
}

function renderEnvioClienteForm(content){
  let entity = null;
  content.innerHTML = envioFormHtml({titulo:'Envío a cliente', entityLabel:'Cliente', entityName:'', showEntityPicker:true});
  wireEnvioForm(content, {
    tipo:'cliente_directo',
    getEntity: ()=>entity,
    setEntity: (e)=>{entity=e;},
    entityRequired:true,
    onSaved: ()=>{ location.hash = '#/clientes'; }
  });
}

/* ---------------------------------------------------------------------- *
 * 11. MENÚ 3 — TRABAJADORES
 * ---------------------------------------------------------------------- */
function renderTrabajadoresList(content){
  content.innerHTML = `
    <h1 class="section-title">Trabajadores</h1>
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input type="text" id="tr-search" placeholder="Buscar trabajador..." >
    </div>
    <div id="tr-list">${renderTrabajadorListInner('')}</div>
    <button class="fab" id="fab-add-tr" aria-label="Agregar trabajador">+</button>
  `;
  document.getElementById('tr-search').addEventListener('input', e=>{
    document.getElementById('tr-list').innerHTML = renderTrabajadorListInner(e.target.value);
    bindTrRows();
  });
  document.getElementById('fab-add-tr').onclick = ()=>openTrabajadorFormModal(null, ()=>route());
  bindTrRows();

  function bindTrRows(){
    document.querySelectorAll('#tr-list .list-item').forEach(el=>{
      el.onclick = (e)=>{
        if(e.target.closest('.trash-btn')) return;
        location.hash = `#/trabajador-detalle/${el.dataset.id}`;
      };
    });
    document.querySelectorAll('#tr-list .trash-btn').forEach(el=>{
      el.onclick = (e)=>{
        e.stopPropagation();
        const t = DB.trabajadores.find(x=>x.id===Number(el.dataset.id));
        confirmDialog(`¿Eliminar al trabajador ${escapeHtml(t.nombre)}?`, ()=>{
          t.activo = 0; save(); toast('Trabajador eliminado');
          document.getElementById('tr-list').innerHTML = renderTrabajadorListInner(document.getElementById('tr-search').value);
          bindTrRows();
        });
      };
    });
  }
}
function renderTrabajadorListInner(searchTerm){
  searchTerm = searchTerm||'';
  const items = DB.trabajadores.filter(t=>t.activo)
    .filter(t=>t.nombre.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  return items.length ? items.map(t=>`
    <div class="list-item" data-id="${t.id}">
      <div class="avatar">👷</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(t.nombre)}</div>
        <div class="li-sub">${escapeHtml(t.telefono || 'Sin teléfono')}</div>
      </div>
      <button class="trash-btn" data-id="${t.id}" aria-label="Eliminar">🗑️</button>
    </div>`).join('') : emptyState('👷','Aún no hay trabajadores registrados');
}

function openTrabajadorFormModal(id, onSaved){
  const editing = id ? DB.trabajadores.find(t=>t.id===id) : null;
  openModal(`
    <div class="modal-title">${editing?'Editar trabajador':'Agregar trabajador'}</div>
    <label class="field-label">Nombre *</label>
    <input type="text" id="tf-nombre" maxlength="100" value="${escapeHtml(editing?.nombre||'')}" placeholder="Nombre del trabajador">
    <label class="field-label">Teléfono</label>
    <input type="tel" id="tf-tel" maxlength="20" value="${escapeHtml(editing?.telefono||'')}" placeholder="Opcional">
    <div id="tf-error" style="color:var(--red);font-size:13px;margin-top:10px;display:none;"></div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="tf-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="tf-save">Guardar</button>
    </div>
  `);
  document.getElementById('tf-cancel').onclick = closeModal;
  document.getElementById('tf-save').onclick = ()=>{
    const nombre = document.getElementById('tf-nombre').value.trim();
    if(!nombre){
      const err = document.getElementById('tf-error');
      err.textContent = 'El nombre del trabajador es obligatorio.'; err.style.display='block';
      return;
    }
    const telefono = document.getElementById('tf-tel').value.trim();
    let trabajador;
    if(editing){ editing.nombre = nombre; editing.telefono = telefono; trabajador = editing; }
    else { trabajador = {id:nextId('trabajadores'), nombre, telefono, fecha_registro:Date.now(), activo:1}; DB.trabajadores.push(trabajador); }
    save(); closeModal();
    toast(editing?'Trabajador actualizado':'Trabajador agregado');
    onSaved && onSaved(trabajador);
  };
}

function renderTrabajadorDetalle(content, id){
  const t = DB.trabajadores.find(x=>x.id===id);
  if(!t){ content.innerHTML = emptyState('❓','Trabajador no encontrado'); return; }
  content.innerHTML = `
    <button class="btn btn-ghost btn-sm" id="back-btn">← Volver</button>
    <div class="card" style="margin-top:10px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="avatar" style="width:52px;height:52px;font-size:22px;">👷</div>
        <div>
          <div style="font-weight:800;font-size:18px;">${escapeHtml(t.nombre)}</div>
          <div class="subtle">${escapeHtml(t.telefono || 'Sin teléfono')}</div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="sumrow"><span class="k">Registrado</span><span class="v">${fmtDate(t.fecha_registro)}</span></div>
      <div class="modal-actions" style="margin-top:14px;">
        <button class="btn btn-outline btn-block" id="td-edit">Editar</button>
        <button class="btn btn-danger btn-block" id="td-del">Eliminar</button>
      </div>
    </div>
    <button class="btn btn-gold btn-block" id="td-registrar" style="margin-top:16px;">📤 Registrar envío de este trabajador</button>

    <h3 style="margin:18px 0 10px;font-size:15px;color:var(--teal-900);">Últimos envíos</h3>
    <div id="td-envios">
      ${(()=>{
        const envios = DB.envios.filter(e=>e.tipo==='trabajador' && e.trabajador_id===id).sort((a,b)=>b.fecha_hora-a.fecha_hora).slice(0,10);
        return envios.length ? envios.map(e=>`
          <div class="list-item" data-eid="${e.id}">
            <div class="avatar">📤</div>
            <div class="li-main">
              <div class="li-title">${fmtDateShort(e.fecha_hora)} · ${fmtMoney(e.cantidad_enviada)} ${escapeHtml(e.moneda)}</div>
              <div class="li-sub">Ganancia: ${fmtMoney(e.ganancia)} ${escapeHtml(e.divisa_ganancia)}</div>
            </div>
          </div>`).join('') : emptyState('📤','Este trabajador aún no tiene envíos registrados');
      })()}
    </div>
  `;
  document.getElementById('back-btn').onclick = ()=> history.back();
  document.getElementById('td-edit').onclick = ()=>openTrabajadorFormModal(t.id, ()=>renderTrabajadorDetalle(content,id));
  document.getElementById('td-del').onclick = ()=>{
    confirmDialog(`¿Eliminar al trabajador ${escapeHtml(t.nombre)}?`, ()=>{
      t.activo=0; save(); toast('Trabajador eliminado'); location.hash='#/trabajadores';
    });
  };
  document.getElementById('td-registrar').onclick = ()=> location.hash = `#/envio-trabajador/${id}`;
  content.querySelectorAll('#td-envios .list-item').forEach(el=>{
    el.onclick = ()=> location.hash = `#/envio-detalle/${el.dataset.eid}`;
  });
}

function renderEnvioTrabajadorForm(content, trabajadorId){
  const t = DB.trabajadores.find(x=>x.id===trabajadorId);
  if(!t){ content.innerHTML = emptyState('❓','Trabajador no encontrado'); return; }
  content.innerHTML = envioFormHtml({titulo:'Envío de trabajador', entityLabel:'Trabajador', entityName:t.nombre, showEntityPicker:false});
  wireEnvioForm(content, {
    tipo:'trabajador',
    getEntity: ()=>t,
    setEntity: ()=>{},
    entityRequired:false,
    onSaved: ()=>{ location.hash = `#/trabajador-detalle/${trabajadorId}`; }
  });
}

/* ---------------------------------------------------------------------- *
 * 12. MENÚ 4 — PRECIO ESPECIAL
 * ---------------------------------------------------------------------- */
function renderPrecioEspecialForm(content){
  let entity = null, entityTipo = null;
  content.innerHTML = `
    <h1 class="section-title">⭐ Precio especial</h1>

    <label class="field-label">Cliente o trabajador *</label>
    <div class="picker" id="pe-entity-picker">
      <span id="pe-entity-name" class="ph">Toca para seleccionar...</span>
      <span>🔍</span>
    </div>

    <label class="field-label">Cantidad enviada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="pe-cantidad" placeholder="0.00">

    <label class="field-label">Moneda *</label>
    <select id="pe-moneda" class="picker">${monedaOptionsHtml('USD')}</select>

    <label class="field-label">Precio *</label>
    <input type="number" inputmode="decimal" step="0.01" id="pe-precio" placeholder="0.00">

    <label class="field-label">Cantidad pagada (Entregar) *</label>
    <input type="number" inputmode="decimal" step="0.01" id="pe-pagada" placeholder="0.00">
    <div class="hint">Editable manualmente. No hay cálculo automático.</div>

    <label class="field-label">Divisa de entrega *</label>
    <select id="pe-divisa-entrega" class="picker">${divisaOptionsHtml('')}</select>

    <label class="field-label">Cotizado a</label>
    <input type="number" inputmode="decimal" step="0.01" id="pe-cotizado" placeholder="Opcional — informativo">

    <label class="field-label">Ganancia *</label>
    <input type="number" inputmode="decimal" step="0.01" id="pe-ganancia" placeholder="0.00">
    <div class="hint">Editable manualmente. No hay cálculo automático. Puede ser negativa.</div>

    <label class="field-label">Divisa de ganancia *</label>
    <select id="pe-divisa-ganancia" class="picker">${divisaOptionsHtml('')}</select>

    <label class="field-label">Forma de ganancia *</label>
    <div class="pill-row" id="pe-forma">
      <div class="pill active" data-v="Efectivo">Efectivo</div>
      <div class="pill" data-v="Transferencia">Transferencia</div>
      <div class="pill" data-v="USD">USD</div>
    </div>

    <label class="field-label">Fecha y hora del envío *</label>
    <input type="datetime-local" id="pe-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <div class="hint">Por defecto es la fecha y hora actual. Puede ajustarla.</div>

    <label class="field-label">Nota</label>
    <textarea id="pe-nota" maxlength="500" placeholder="Opcional"></textarea>

    <button class="btn btn-primary btn-block" id="pe-revisar" style="margin-top:22px;">Revisar y guardar</button>
  `;

  document.getElementById('pe-entity-picker').onclick = ()=>{
    openEntityPicker('combinado', (item, tipo)=>{
      entity = item; entityTipo = tipo;
      const label = document.getElementById('pe-entity-name');
      label.textContent = `${tipo==='trabajador'?'👷 ':''}${item.nombre}`;
      label.classList.remove('ph');
    });
  };

  bindAddOnSelect(document.getElementById('pe-moneda'), addMoneda, monedaOptionsHtml);
  bindAddOnSelect(document.getElementById('pe-divisa-entrega'), addDivisa, divisaOptionsHtml);
  bindAddOnSelect(document.getElementById('pe-divisa-ganancia'), addDivisa, divisaOptionsHtml);

  let formaGanancia = 'Efectivo';
  document.querySelectorAll('#pe-forma .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#pe-forma .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active'); formaGanancia = p.dataset.v;
    };
  });

  document.getElementById('pe-revisar').onclick = ()=>{
    if(!entity){ toast('Debe seleccionar al menos un cliente o un trabajador.'); return; }
    const cantidad_enviada = parseFloat(document.getElementById('pe-cantidad').value);
    const moneda = document.getElementById('pe-moneda').value.toUpperCase();
    const precio = parseFloat(document.getElementById('pe-precio').value);
    const cantidad_pagada = parseFloat(document.getElementById('pe-pagada').value);
    const divisa_entrega = document.getElementById('pe-divisa-entrega').value;
    const cotizadoRaw = document.getElementById('pe-cotizado').value.trim();
    const cotizado_a = cotizadoRaw==='' ? null : parseFloat(cotizadoRaw);
    const gananciaRaw = document.getElementById('pe-ganancia').value.trim();
    const divisa_ganancia = document.getElementById('pe-divisa-ganancia').value;
    const nota = document.getElementById('pe-nota').value.trim();
    const fechaVal = document.getElementById('pe-fecha').value;

    if(!cantidad_enviada || !moneda || !precio || gananciaRaw==='' || isNaN(cantidad_pagada) ||
       !divisa_entrega || !divisa_ganancia || divisa_entrega==='__add__' || divisa_ganancia==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const ganancia = parseFloat(gananciaRaw);
    const fecha_hora = new Date(fechaVal).getTime();

    const envio = {
      tipo:'precio_especial',
      cliente_id: entityTipo==='cliente' ? entity.id : null,
      trabajador_id: entityTipo==='trabajador' ? entity.id : null,
      cantidad_enviada, moneda, precio, cantidad_pagada, cotizado_a, ganancia,
      divisa_entrega, divisa_ganancia, forma_ganancia: formaGanancia, nota,
      fecha_hora
    };

    function goToSummary(){
      openModal(`
        <div class="modal-title">Estás registrando un envío especial.</div>
        <div class="modal-msg">La ganancia será de <strong>${fmtMoney(ganancia)} ${escapeHtml(divisa_ganancia)}</strong>. Forma de ganancia: <strong>${escapeHtml(formaGanancia)}</strong>.</div>
        <div class="card" style="box-shadow:none;border:1px solid var(--line);padding:12px;">
          <div class="sumrow"><span class="k">${entityTipo==='trabajador'?'Trabajador':'Cliente'}</span><span class="v">${escapeHtml(entity.nombre)}</span></div>
          <div class="sumrow"><span class="k">Cantidad enviada</span><span class="v">${fmtMoney(cantidad_enviada)} ${escapeHtml(moneda)}</span></div>
          <div class="sumrow"><span class="k">Precio</span><span class="v">${fmtMoney(precio)}</span></div>
          <div class="sumrow"><span class="k">Cantidad pagada</span><span class="v">${fmtMoney(cantidad_pagada)} ${escapeHtml(divisa_entrega)}</span></div>
          <div class="sumrow"><span class="k">Cotizado a</span><span class="v">${cotizado_a!==null?fmtMoney(cotizado_a):'—'}</span></div>
          <div class="sumrow"><span class="k">Ganancia</span><span class="v">${fmtMoney(ganancia)} ${escapeHtml(divisa_ganancia)}</span></div>
          <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(fecha_hora)}</span></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline btn-block" id="pe-volver">Volver a editar</button>
          <button class="btn btn-primary btn-block" id="pe-confirmar">Confirmar y guardar</button>
        </div>
      `);
      document.getElementById('pe-volver').onclick = closeModal;
      document.getElementById('pe-confirmar').onclick = ()=>{
        envio.id = nextId('envios');
        DB.envios.push(envio);
        applyEnvioBalance(envio, 1);
        save(); closeModal();
        toast('Envío especial guardado');
        location.hash = '#/historial';
      };
    }

    if(ganancia < 0){
      confirmDialog(`La ganancia es negativa: -$${fmtMoney(Math.abs(ganancia))}. ¿Confirmar este envío con pérdida?`, goToSummary, {okLabel:'Confirmar', cancelLabel:'Corregir', danger:false});
    } else {
      goToSummary();
    }
  };
}

/* ---------------------------------------------------------------------- *
 * 13. MENÚ 5 — HISTORIAL DE ENVÍOS
 * ---------------------------------------------------------------------- */
let historialFilters = {q:'', tipo:'Todos', fecha:'Todo', fechaDesde:null, fechaHasta:null, forma:'Todas', divisa:'Todas'};

function entityNameForEnvio(e){
  if(e.tipo==='trabajador'){
    const t = DB.trabajadores.find(x=>x.id===e.trabajador_id);
    return t ? (t.nombre + (t.activo?'':' (eliminado)')) : '(eliminado)';
  } else {
    const c = DB.clientes.find(x=>x.id===e.cliente_id);
    return c ? (c.nombre + (c.activo?'':' (eliminado)')) : '(eliminado)';
  }
}

function applyHistorialFilters(list){
  const f = historialFilters;
  return list.filter(e=>{
    if(f.q){
      const name = entityNameForEnvio(e).toLowerCase();
      if(!name.includes(f.q.toLowerCase())) return false;
    }
    if(f.tipo==='Clientes' && e.tipo!=='cliente_directo') return false;
    if(f.tipo==='Trabajadores' && e.tipo!=='trabajador') return false;
    if(f.tipo==='Especiales' && e.tipo!=='precio_especial') return false;
    if(f.forma!=='Todas' && e.forma_ganancia!==f.forma) return false;
    if(f.divisa!=='Todas' && e.divisa_entrega!==f.divisa && e.divisa_ganancia!==f.divisa) return false;
    if(f.fecha==='Hoy' && e.fecha_hora < todayRangeStart()) return false;
    if(f.fecha==='Semanal' && e.fecha_hora < startOfWeek()) return false;
    if(f.fecha==='Mensual' && e.fecha_hora < startOfMonth()) return false;
    if(f.fecha==='Personalizado'){
      if(f.fechaDesde && e.fecha_hora < f.fechaDesde) return false;
      if(f.fechaHasta && e.fecha_hora > f.fechaHasta) return false;
    }
    return true;
  }).sort((a,b)=>b.fecha_hora-a.fecha_hora);
}

function renderHistorial(content, presetParam){
  // soporte para llegar desde Balance con divisa/fecha preseleccionadas
  if(presetParam==='reset'){
    historialFilters = {q:'', tipo:'Todos', fecha:'Todo', fechaDesde:null, fechaHasta:null, forma:'Todas', divisa:'Todas'};
  }
  content.innerHTML = `
    <h1 class="section-title">Historial de envíos</h1>
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input type="text" id="h-search" placeholder="Buscar por nombre..." value="${escapeHtml(historialFilters.q)}">
    </div>
    <div class="chip-row" id="h-tipo-chips">
      ${['Todos','Clientes','Trabajadores','Especiales'].map(t=>`<div class="chip ${historialFilters.tipo===t?'active':''}" data-v="${t}">${t}</div>`).join('')}
    </div>
    <div class="chip-row" id="h-fecha-chips">
      ${['Hoy','Semanal','Mensual','Personalizado','Todo'].map(t=>`<div class="chip ${historialFilters.fecha===t?'active':''}" data-v="${t}">${t}</div>`).join('')}
    </div>
    <div id="h-custom-range" class="two-col" style="margin-bottom:12px;display:${historialFilters.fecha==='Personalizado'?'grid':'none'};">
      <input type="date" id="h-desde" value="${historialFilters.fechaDesde? new Date(historialFilters.fechaDesde).toISOString().slice(0,10):''}">
      <input type="date" id="h-hasta" value="${historialFilters.fechaHasta? new Date(historialFilters.fechaHasta).toISOString().slice(0,10):''}">
    </div>
    <div class="two-col" style="margin-bottom:12px;">
      <select id="h-forma" class="picker">
        ${['Todas','Efectivo','Transferencia','USD'].map(f=>`<option value="${f}" ${historialFilters.forma===f?'selected':''}>${f==='Todas'?'Forma: Todas':f}</option>`).join('')}
      </select>
      <select id="h-divisa" class="picker">
        <option value="Todas" ${historialFilters.divisa==='Todas'?'selected':''}>Divisa: Todas</option>
        ${DB.divisas.map(d=>`<option value="${escapeHtml(d.nombre)}" ${historialFilters.divisa===d.nombre?'selected':''}>${escapeHtml(d.nombre)}</option>`).join('')}
      </select>
    </div>
    <div id="h-list"></div>
  `;

  function refreshList(){
    const list = applyHistorialFilters(DB.envios);
    const el = document.getElementById('h-list');
    el.innerHTML = list.length ? list.map(envioRowHtml).join('') : emptyState('📭','No se encontraron envíos con los filtros aplicados.');
    el.querySelectorAll('.list-item').forEach(li=>{
      li.onclick = ()=> location.hash = `#/envio-detalle/${li.dataset.id}`;
    });
  }

  document.getElementById('h-search').addEventListener('input', e=>{ historialFilters.q = e.target.value; refreshList(); });
  document.querySelectorAll('#h-tipo-chips .chip').forEach(c=>{
    c.onclick = ()=>{ historialFilters.tipo = c.dataset.v; document.querySelectorAll('#h-tipo-chips .chip').forEach(x=>x.classList.remove('active')); c.classList.add('active'); refreshList(); };
  });
  document.querySelectorAll('#h-fecha-chips .chip').forEach(c=>{
    c.onclick = ()=>{
      historialFilters.fecha = c.dataset.v;
      document.querySelectorAll('#h-fecha-chips .chip').forEach(x=>x.classList.remove('active')); c.classList.add('active');
      document.getElementById('h-custom-range').style.display = c.dataset.v==='Personalizado' ? 'grid' : 'none';
      refreshList();
    };
  });
  document.getElementById('h-desde').addEventListener('change', e=>{ historialFilters.fechaDesde = e.target.value ? new Date(e.target.value).getTime() : null; refreshList(); });
  document.getElementById('h-hasta').addEventListener('change', e=>{ historialFilters.fechaHasta = e.target.value ? new Date(e.target.value).getTime()+86399999 : null; refreshList(); });
  document.getElementById('h-forma').addEventListener('change', e=>{ historialFilters.forma = e.target.value; refreshList(); });
  document.getElementById('h-divisa').addEventListener('change', e=>{ historialFilters.divisa = e.target.value; refreshList(); });

  refreshList();
}

function envioRowHtml(e){
  const icon = e.tipo==='trabajador' ? '👷' : (e.tipo==='precio_especial' ? '⭐' : '📤');
  return `
    <div class="list-item" data-id="${e.id}">
      <div class="avatar">${icon}</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(entityNameForEnvio(e))}</div>
        <div class="li-sub">${fmtDate(e.fecha_hora)} · ${fmtMoney(e.cantidad_enviada)} ${escapeHtml(e.moneda)}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount">+${fmtMoney(e.ganancia)}</div>
        <div class="li-sub">${escapeHtml(e.divisa_ganancia)}</div>
      </div>
    </div>`;
}

function renderEnvioDetalle(content, id){
  const e = DB.envios.find(x=>x.id===id);
  if(!e){ content.innerHTML = emptyState('❓','Envío no encontrado'); return; }
  const nombreEntidad = entityNameForEnvio(e);
  content.innerHTML = `
    <button class="btn btn-ghost btn-sm" id="back-btn">← Volver</button>
    ${e.tipo==='precio_especial' ? `<div class="badge badge-gold" style="margin:10px 0;">⭐ Precio especial</div>` : ''}
    <div class="card">
      <div class="sumrow"><span class="k">${e.tipo==='trabajador'?'Trabajador':'Cliente'}</span><span class="v">${escapeHtml(nombreEntidad)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(e.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Cantidad enviada</span><span class="v">${fmtMoney(e.cantidad_enviada)} ${escapeHtml(e.moneda)}</span></div>
      <div class="sumrow"><span class="k">Precio</span><span class="v">${fmtMoney(e.precio)}</span></div>
      <div class="sumrow"><span class="k">Cantidad pagada</span><span class="v">${fmtMoney(e.cantidad_pagada)}</span></div>
      <div class="sumrow"><span class="k">Divisa de entrega</span><span class="v">${escapeHtml(e.divisa_entrega)}</span></div>
      <div class="sumrow"><span class="k">Cotizado a</span><span class="v">${e.cotizado_a!==null && e.cotizado_a!==undefined ? fmtMoney(e.cotizado_a) : '—'}</span></div>
      <div class="sumrow"><span class="k">Ganancia</span><span class="v">${fmtMoney(e.ganancia)}</span></div>
      <div class="sumrow"><span class="k">Divisa de ganancia</span><span class="v">${escapeHtml(e.divisa_ganancia)}</span></div>
      <div class="sumrow"><span class="k">Forma de ganancia</span><span class="v">${escapeHtml(e.forma_ganancia)}</span></div>
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(e.nota || 'Sin nota')}</span></div>
    </div>
    <button class="btn btn-danger btn-block" id="ed-del" style="margin-top:14px;">Eliminar envío</button>
  `;
  document.getElementById('back-btn').onclick = ()=> history.back();
  document.getElementById('ed-del').onclick = ()=>{
    confirmDialog(`¿Eliminar el envío de ${escapeHtml(nombreEntidad)}?`, ()=>{
      applyEnvioBalance(e, -1);
      DB.envios = DB.envios.filter(x=>x.id!==e.id);
      save();
      toast('Envío eliminado');
      location.hash = '#/historial';
    });
  };
}

/* ---------------------------------------------------------------------- *
 * 14. MENÚ 7 — VENTAS  (con switch "deuda pendiente")
 * ---------------------------------------------------------------------- */
function renderVentasList(content){
  const items = DB.ventas.slice().sort((a,b)=>b.fecha_hora-a.fecha_hora);
  content.innerHTML = `
    <h1 class="section-title">Ventas</h1>
    <button class="btn btn-gold btn-block" id="v-nueva">➕ Nueva venta</button>
    <div style="height:14px;"></div>
    <div id="v-list">${items.length ? items.map(ventaRowHtml).join('') : emptyState('💱','Aún no hay ventas registradas')}</div>
  `;
  document.getElementById('v-nueva').onclick = ()=>openVentaForm(()=>renderVentasList(content));
  content.querySelectorAll('#v-list .list-item').forEach(el=>{
    el.onclick = ()=>openVentaDetalle(Number(el.dataset.id), ()=>renderVentasList(content));
  });
}
function ventaRowHtml(v){
  return `
    <div class="list-item" data-id="${v.id}">
      <div class="avatar">💱</div>
      <div class="li-main">
        <div class="li-title">${fmtMoney(v.cantidad_vendida)} ${escapeHtml(v.divisa_vendida)} → ${fmtMoney(v.cantidad_recibida)} ${escapeHtml(v.divisa_recibida)}</div>
        <div class="li-sub">${fmtDate(v.fecha_hora)} ${v.registra_deuda?'· Pendiente de cobro':''}</div>
      </div>
    </div>`;
}
function openVentaForm(onSaved){
  openModal(`
    <div class="modal-title">Registrar venta</div>
    <label class="field-label">Cantidad vendida *</label>
    <input type="number" inputmode="decimal" step="0.01" id="vf-cvendida" placeholder="0.00">
    <label class="field-label">Divisa vendida *</label>
    <select id="vf-dvendida" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Cantidad recibida *</label>
    <input type="number" inputmode="decimal" step="0.01" id="vf-crecibida" placeholder="0.00">
    <label class="field-label">Divisa recibida *</label>
    <select id="vf-drecibida" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Registrar cantidad recibida como deuda pendiente</label>
    <div class="pill-row" id="vf-switch">
      <div class="pill active" data-v="0">No</div>
      <div class="pill" data-v="1">Sí</div>
    </div>
    <div class="hint">Si activa esta opción, la cantidad recibida NO se suma ahora al balance — se crea un registro pendiente en Deudas → Me deben.</div>
    <label class="field-label">Fecha y hora de la venta *</label>
    <input type="datetime-local" id="vf-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <div class="hint">Por defecto es la fecha y hora actual. Puede ajustarla.</div>
    <label class="field-label">Nota</label>
    <textarea id="vf-nota" maxlength="500" placeholder="Opcional"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="vf-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="vf-save">Guardar</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('vf-dvendida'), addDivisa, divisaOptionsHtml);
  bindAddOnSelect(document.getElementById('vf-drecibida'), addDivisa, divisaOptionsHtml);
  let registraDeuda = 0;
  document.querySelectorAll('#vf-switch .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#vf-switch .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      registraDeuda = Number(p.dataset.v);
    };
  });
  document.getElementById('vf-cancel').onclick = closeModal;
  document.getElementById('vf-save').onclick = ()=>{
    const cantidad_vendida = parseFloat(document.getElementById('vf-cvendida').value);
    const divisa_vendida = document.getElementById('vf-dvendida').value;
    const cantidad_recibida = parseFloat(document.getElementById('vf-crecibida').value);
    const divisa_recibida = document.getElementById('vf-drecibida').value;
    const fechaVal = document.getElementById('vf-fecha').value;
    const nota = document.getElementById('vf-nota').value.trim();
    if(!cantidad_vendida || !divisa_vendida || divisa_vendida==='__add__' || !cantidad_recibida || !divisa_recibida || divisa_recibida==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const fecha_hora = new Date(fechaVal).getTime();
    const venta = {id:nextId('ventas'), cantidad_vendida, divisa_vendida, cantidad_recibida, divisa_recibida, nota, fecha_hora, registra_deuda:registraDeuda};
    DB.ventas.push(venta);
    // La cantidad vendida SIEMPRE se resta. La cantidad recibida solo se suma si NO se difiere como deuda.
    adjustBalance(divisa_vendida, -cantidad_vendida);
    if(registraDeuda){
      crearDeudaAutomatica({
        tipo:'me_deben', persona:`Venta pendiente #${venta.id}`, monto:cantidad_recibida,
        divisa:divisa_recibida, fecha:fecha_hora, nota:'Registrado desde venta',
        origen:'venta', origen_id:venta.id
      });
    } else {
      adjustBalance(divisa_recibida, cantidad_recibida);
    }
    save(); closeModal(); toast('Venta guardada');
    onSaved && onSaved();
  };
}
function openVentaDetalle(id, onChange){
  const v = DB.ventas.find(x=>x.id===id);
  if(!v) return;
  openModal(`
    <div class="modal-title">Detalle de venta</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line);padding:12px;">
      <div class="sumrow"><span class="k">Cantidad vendida</span><span class="v">${fmtMoney(v.cantidad_vendida)} ${escapeHtml(v.divisa_vendida)}</span></div>
      <div class="sumrow"><span class="k">Cantidad recibida</span><span class="v">${fmtMoney(v.cantidad_recibida)} ${escapeHtml(v.divisa_recibida)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(v.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Deuda pendiente</span><span class="v">${v.registra_deuda?'Sí — ver en Deudas':'No'}</span></div>
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(v.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="vd-close">Cerrar</button>
      <button class="btn btn-danger btn-block" id="vd-del">Eliminar</button>
    </div>
  `);
  document.getElementById('vd-close').onclick = closeModal;
  document.getElementById('vd-del').onclick = ()=>{
    closeModal();
    confirmDialog('¿Eliminar esta venta?', ()=>{
      adjustBalance(v.divisa_vendida, v.cantidad_vendida); // revertir la resta
      if(v.registra_deuda){
        eliminarDeudaAutomaticaSiPendiente('venta', v.id);
      } else {
        adjustBalance(v.divisa_recibida, -v.cantidad_recibida); // revertir la suma
      }
      DB.ventas = DB.ventas.filter(x=>x.id!==id);
      save(); toast('Venta eliminada'); onChange && onChange();
    });
  };
}



/* ---------------------------------------------------------------------- *
 * 14b. MENÚ 6 — COMPRAS  (homólogo inverso de Ventas, con switch "deuda pendiente")
 * ---------------------------------------------------------------------- */
function renderComprasList(content){
  const items = DB.compras.slice().sort((a,b)=>b.fecha_hora-a.fecha_hora);
  content.innerHTML = `
    <h1 class="section-title">Compras</h1>
    <button class="btn btn-gold btn-block" id="c-nueva">➕ Nueva compra</button>
    <div style="height:14px;"></div>
    <div id="c-list">${items.length ? items.map(compraRowHtml).join('') : emptyState('🛒','Aún no hay compras registradas')}</div>
  `;
  document.getElementById('c-nueva').onclick = ()=>openCompraForm(()=>renderComprasList(content));
  content.querySelectorAll('#c-list .list-item').forEach(el=>{
    el.onclick = ()=>openCompraDetalle(Number(el.dataset.id), ()=>renderComprasList(content));
  });
}
function compraRowHtml(c){
  return `
    <div class="list-item" data-id="${c.id}">
      <div class="avatar">🛒</div>
      <div class="li-main">
        <div class="li-title">${fmtMoney(c.cantidad_pagada)} ${escapeHtml(c.divisa_pagada)} → ${fmtMoney(c.cantidad_comprada)} ${escapeHtml(c.divisa_comprada)}</div>
        <div class="li-sub">${fmtDate(c.fecha_hora)} ${c.registra_deuda?'· Pago pendiente':''}</div>
      </div>
    </div>`;
}
function openCompraForm(onSaved){
  openModal(`
    <div class="modal-title">Registrar compra</div>
    <label class="field-label">Cantidad comprada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="cf-ccomprada" placeholder="0.00">
    <label class="field-label">Divisa comprada *</label>
    <select id="cf-dcomprada" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Cantidad pagada *</label>
    <input type="number" inputmode="decimal" step="0.01" id="cf-cpagada" placeholder="0.00">
    <label class="field-label">Divisa pagada *</label>
    <select id="cf-dpagada" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Registrar cantidad pagada como deuda pendiente</label>
    <div class="pill-row" id="cf-switch">
      <div class="pill active" data-v="0">No</div>
      <div class="pill" data-v="1">Sí</div>
    </div>
    <div class="hint">Si activa esta opción, la cantidad pagada NO se resta ahora del balance — se crea un registro pendiente en Deudas → Pagar a.</div>
    <label class="field-label">Fecha y hora de la compra *</label>
    <input type="datetime-local" id="cf-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <div class="hint">Por defecto es la fecha y hora actual. Puede ajustarla.</div>
    <label class="field-label">Nota</label>
    <textarea id="cf-nota" maxlength="500" placeholder="Opcional"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="cf-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="cf-save">Guardar</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('cf-dcomprada'), addDivisa, divisaOptionsHtml);
  bindAddOnSelect(document.getElementById('cf-dpagada'), addDivisa, divisaOptionsHtml);
  let registraDeuda = 0;
  document.querySelectorAll('#cf-switch .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#cf-switch .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      registraDeuda = Number(p.dataset.v);
    };
  });
  document.getElementById('cf-cancel').onclick = closeModal;
  document.getElementById('cf-save').onclick = ()=>{
    const cantidad_comprada = parseFloat(document.getElementById('cf-ccomprada').value);
    const divisa_comprada = document.getElementById('cf-dcomprada').value;
    const cantidad_pagada = parseFloat(document.getElementById('cf-cpagada').value);
    const divisa_pagada = document.getElementById('cf-dpagada').value;
    const fechaVal = document.getElementById('cf-fecha').value;
    const nota = document.getElementById('cf-nota').value.trim();
    if(!cantidad_comprada || !divisa_comprada || divisa_comprada==='__add__' || !cantidad_pagada || !divisa_pagada || divisa_pagada==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const fecha_hora = new Date(fechaVal).getTime();
    const compra = {id:nextId('compras'), cantidad_comprada, divisa_comprada, cantidad_pagada, divisa_pagada, nota, fecha_hora, registra_deuda:registraDeuda};
    DB.compras.push(compra);
    // La cantidad comprada SIEMPRE se suma. La cantidad pagada solo se resta si NO se difiere como deuda.
    adjustBalance(divisa_comprada, cantidad_comprada);
    if(registraDeuda){
      crearDeudaAutomatica({
        tipo:'pagar_a', persona:`Compra pendiente #${compra.id}`, monto:cantidad_pagada,
        divisa:divisa_pagada, fecha:fecha_hora, nota:'Registrado desde compra',
        origen:'compra', origen_id:compra.id
      });
    } else {
      adjustBalance(divisa_pagada, -cantidad_pagada);
    }
    save(); closeModal(); toast('Compra guardada');
    onSaved && onSaved();
  };
}
function openCompraDetalle(id, onChange){
  const c = DB.compras.find(x=>x.id===id);
  if(!c) return;
  openModal(`
    <div class="modal-title">Detalle de compra</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line);padding:12px;">
      <div class="sumrow"><span class="k">Cantidad comprada</span><span class="v">${fmtMoney(c.cantidad_comprada)} ${escapeHtml(c.divisa_comprada)}</span></div>
      <div class="sumrow"><span class="k">Cantidad pagada</span><span class="v">${fmtMoney(c.cantidad_pagada)} ${escapeHtml(c.divisa_pagada)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(c.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Pago pendiente</span><span class="v">${c.registra_deuda?'Sí — ver en Deudas':'No'}</span></div>
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(c.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="cd2-close">Cerrar</button>
      <button class="btn btn-danger btn-block" id="cd2-del">Eliminar</button>
    </div>
  `);
  document.getElementById('cd2-close').onclick = closeModal;
  document.getElementById('cd2-del').onclick = ()=>{
    closeModal();
    confirmDialog('¿Eliminar esta compra?', ()=>{
      adjustBalance(c.divisa_comprada, -c.cantidad_comprada); // revertir la suma
      if(c.registra_deuda){
        eliminarDeudaAutomaticaSiPendiente('compra', c.id);
      } else {
        adjustBalance(c.divisa_pagada, c.cantidad_pagada); // revertir la resta
      }
      DB.compras = DB.compras.filter(x=>x.id!==id);
      save(); toast('Compra eliminada'); onChange && onChange();
    });
  };
}

/* ---------------------------------------------------------------------- *
 * 15. MENÚ 8 — GASTOS
 * ---------------------------------------------------------------------- */
function renderGastosList(content){
  const items = DB.gastos.slice().sort((a,b)=>b.fecha_hora-a.fecha_hora);
  content.innerHTML = `
    <h1 class="section-title">Gastos</h1>
    <button class="btn btn-gold btn-block" id="g-nuevo">➕ Nuevo gasto</button>
    <div style="height:14px;"></div>
    <div id="g-list">${items.length ? items.map(gastoRowHtml).join('') : emptyState('🧾','Aún no hay gastos registrados')}</div>
  `;
  document.getElementById('g-nuevo').onclick = ()=>openGastoForm(()=>renderGastosList(content));
  content.querySelectorAll('#g-list .list-item').forEach(el=>{
    el.onclick = ()=>openGastoDetalle(Number(el.dataset.id), ()=>renderGastosList(content));
  });
}
function gastoRowHtml(g){
  return `
    <div class="list-item" data-id="${g.id}">
      <div class="avatar">🧾</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(g.concepto)}</div>
        <div class="li-sub">${fmtDate(g.fecha_hora)}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount neg">-${fmtMoney(g.cantidad)}</div>
        <div class="li-sub">${escapeHtml(g.divisa)}</div>
      </div>
    </div>`;
}
function toLocalDatetimeValue(ts){
  const d = new Date(ts);
  const pad = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function openGastoForm(onSaved){
  openModal(`
    <div class="modal-title">Registrar gasto</div>
    <label class="field-label">Concepto o motivo *</label>
    <input type="text" id="gf-concepto" maxlength="200" placeholder="Ej: Alquiler">
    <label class="field-label">Cantidad *</label>
    <input type="number" inputmode="decimal" step="0.01" id="gf-cantidad" placeholder="0.00">
    <label class="field-label">Divisa *</label>
    <select id="gf-divisa" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Fecha y hora *</label>
    <input type="datetime-local" id="gf-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <label class="field-label">Nota</label>
    <textarea id="gf-nota" maxlength="500" placeholder="Opcional"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="gf-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="gf-save">Guardar</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('gf-divisa'), addDivisa, divisaOptionsHtml);
  document.getElementById('gf-cancel').onclick = closeModal;
  document.getElementById('gf-save').onclick = ()=>{
    const concepto = document.getElementById('gf-concepto').value.trim();
    const cantidad = parseFloat(document.getElementById('gf-cantidad').value);
    const divisa = document.getElementById('gf-divisa').value;
    const fechaVal = document.getElementById('gf-fecha').value;
    const nota = document.getElementById('gf-nota').value.trim();
    if(!concepto || !cantidad || !divisa || divisa==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const gasto = {id:nextId('gastos'), concepto, cantidad, divisa, nota, fecha_hora:new Date(fechaVal).getTime()};
    DB.gastos.push(gasto);
    applyGastoBalance(gasto, 1);
    save(); closeModal(); toast('Gasto guardado');
    onSaved && onSaved();
  };
}
function openGastoDetalle(id, onChange){
  const g = DB.gastos.find(x=>x.id===id);
  if(!g) return;
  openModal(`
    <div class="modal-title">Detalle de gasto</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line);padding:12px;">
      <div class="sumrow"><span class="k">Concepto</span><span class="v">${escapeHtml(g.concepto)}</span></div>
      <div class="sumrow"><span class="k">Cantidad</span><span class="v">${fmtMoney(g.cantidad)} ${escapeHtml(g.divisa)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(g.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(g.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="gd-close">Cerrar</button>
      <button class="btn btn-danger btn-block" id="gd-del">Eliminar</button>
    </div>
  `);
  document.getElementById('gd-close').onclick = closeModal;
  document.getElementById('gd-del').onclick = ()=>{
    closeModal();
    confirmDialog('¿Eliminar este gasto?', ()=>{
      applyGastoBalance(g, -1);
      DB.gastos = DB.gastos.filter(x=>x.id!==id);
      save(); toast('Gasto eliminado'); onChange && onChange();
    });
  };
}

/* ---------------------------------------------------------------------- *
 * 15b. MENÚ 9 — IN/OUT  (entradas y salidas manuales de divisas)
 * ---------------------------------------------------------------------- */
function renderInOut(content){
  const items = DB.in_out.slice().sort((a,b)=>b.fecha_hora-a.fecha_hora);
  content.innerHTML = `
    <h1 class="section-title">In/Out</h1>
    <div class="subtle" style="margin-bottom:12px;">Entradas y salidas manuales de divisas, sin asociarlas a un envío, compra, venta o gasto.</div>
    <button class="btn btn-gold btn-block" id="io-nuevo">➕ Registrar movimiento</button>
    <div style="height:14px;"></div>
    <div id="io-list">${items.length ? items.map(inOutRowHtml).join('') : emptyState('🔄','Aún no hay movimientos registrados')}</div>
  `;
  document.getElementById('io-nuevo').onclick = ()=>openInOutForm(()=>renderInOut(content));
  content.querySelectorAll('#io-list .list-item').forEach(el=>{
    el.onclick = ()=>openInOutDetalle(Number(el.dataset.id), ()=>renderInOut(content));
  });
}
function inOutRowHtml(io){
  const esEntrada = io.tipo==='entrada';
  return `
    <div class="list-item" data-id="${io.id}">
      <div class="avatar">${esEntrada?'📥':'📤'}</div>
      <div class="li-main">
        <div class="li-title">${esEntrada?'Entrada':'Salida'} · ${escapeHtml(io.nota || 'Sin nota')}</div>
        <div class="li-sub">${fmtDate(io.fecha_hora)}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount ${esEntrada?'':'neg'}">${esEntrada?'+':'-'}${fmtMoney(io.cantidad)}</div>
        <div class="li-sub">${escapeHtml(io.divisa)}</div>
      </div>
    </div>`;
}
function openInOutForm(onSaved){
  openModal(`
    <div class="modal-title">Registrar In/Out</div>
    <label class="field-label">Tipo de movimiento *</label>
    <div class="pill-row" id="io-tipo">
      <div class="pill active" data-v="entrada">📥 Entrada</div>
      <div class="pill" data-v="salida">📤 Salida</div>
    </div>
    <label class="field-label">Cantidad *</label>
    <input type="number" inputmode="decimal" step="0.01" id="io-cantidad" placeholder="0.00">
    <label class="field-label">Divisa *</label>
    <select id="io-divisa" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Fecha y hora del ajuste *</label>
    <input type="datetime-local" id="io-fecha" value="${toLocalDatetimeValue(Date.now())}">
    <div class="hint">Por defecto es la fecha y hora actual. Puede ajustarla.</div>
    <label class="field-label">Nota</label>
    <textarea id="io-nota" maxlength="500" placeholder="Opcional"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="io-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="io-save">Guardar</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('io-divisa'), addDivisa, divisaOptionsHtml);
  let tipo = 'entrada';
  document.querySelectorAll('#io-tipo .pill').forEach(p=>{
    p.onclick = ()=>{
      document.querySelectorAll('#io-tipo .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      tipo = p.dataset.v;
    };
  });
  document.getElementById('io-cancel').onclick = closeModal;
  document.getElementById('io-save').onclick = ()=>{
    const cantidad = parseFloat(document.getElementById('io-cantidad').value);
    const divisa = document.getElementById('io-divisa').value;
    const fechaVal = document.getElementById('io-fecha').value;
    const nota = document.getElementById('io-nota').value.trim();
    if(!cantidad || !divisa || divisa==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const io = {id:nextId('in_out'), tipo, cantidad, divisa, nota, fecha_hora:new Date(fechaVal).getTime()};
    DB.in_out.push(io);
    adjustBalance(divisa, tipo==='entrada' ? cantidad : -cantidad);
    save(); closeModal(); toast('Movimiento guardado');
    onSaved && onSaved();
  };
}
function openInOutDetalle(id, onChange){
  const io = DB.in_out.find(x=>x.id===id);
  if(!io) return;
  const esEntrada = io.tipo==='entrada';
  openModal(`
    <div class="modal-title">Detalle de movimiento</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line);padding:12px;">
      <div class="sumrow"><span class="k">Tipo</span><span class="v">${esEntrada?'📥 Entrada':'📤 Salida'}</span></div>
      <div class="sumrow"><span class="k">Cantidad</span><span class="v">${fmtMoney(io.cantidad)} ${escapeHtml(io.divisa)}</span></div>
      <div class="sumrow"><span class="k">Fecha y hora</span><span class="v">${fmtDate(io.fecha_hora)}</span></div>
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(io.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="iod-close">Cerrar</button>
      <button class="btn btn-danger btn-block" id="iod-del">Eliminar</button>
    </div>
  `);
  document.getElementById('iod-close').onclick = closeModal;
  document.getElementById('iod-del').onclick = ()=>{
    closeModal();
    confirmDialog('¿Eliminar este movimiento?', ()=>{
      adjustBalance(io.divisa, esEntrada ? -io.cantidad : io.cantidad); // revertir
      DB.in_out = DB.in_out.filter(x=>x.id!==id);
      save(); toast('Movimiento eliminado'); onChange && onChange();
    });
  };
}

/* ---------------------------------------------------------------------- *
 * 16. MENÚ 10 — BALANCE
 * ---------------------------------------------------------------------- */
let balancePeriod = 'Hoy';
let balanceCustomDesde = null, balanceCustomHasta = null;

function periodStart(period){
  if(period==='Hoy') return todayRangeStart();
  if(period==='Semanal') return startOfWeek();
  if(period==='Mensual') return startOfMonth();
  if(period==='Anual') return startOfYear();
  if(period==='Personalizado') return balanceCustomDesde;
  return null;
}
function periodEnd(period){
  if(period==='Personalizado') return balanceCustomHasta;
  return null;
}

function computeFilteredBalance(period){
  const start = periodStart(period);
  const end = periodEnd(period);
  const totals = {}; // divisaNombre -> neto
  function inRange(ts){
    if(start!==null && start!==undefined && ts < start) return false;
    if(end!==null && end!==undefined && ts > end) return false;
    return true;
  }
  DB.envios.filter(e=>inRange(e.fecha_hora)).forEach(e=>{
    totals[e.divisa_entrega] = round2((totals[e.divisa_entrega]||0) - (e.cantidad_pagada||0));
    totals[e.divisa_ganancia] = round2((totals[e.divisa_ganancia]||0) + (e.ganancia||0));
  });
  DB.ventas.filter(v=>inRange(v.fecha_hora)).forEach(v=>{
    totals[v.divisa_vendida] = round2((totals[v.divisa_vendida]||0) - (v.cantidad_vendida||0));
    totals[v.divisa_recibida] = round2((totals[v.divisa_recibida]||0) + (v.cantidad_recibida||0));
  });
  DB.gastos.filter(g=>inRange(g.fecha_hora)).forEach(g=>{
    totals[g.divisa] = round2((totals[g.divisa]||0) - (g.cantidad||0));
  });
  return totals;
}

function renderBalance(content){
  content.innerHTML = `
    <h1 class="section-title">Balance del negocio</h1>

    <h3 style="font-size:14px;color:var(--teal-900);margin-bottom:8px;">Balance filtrado</h3>
    <div class="chip-row" id="b-period-chips">
      ${['Hoy','Semanal','Mensual','Anual','Personalizado'].map(p=>`<div class="chip ${balancePeriod===p?'active':''}" data-v="${p}">${p}</div>`).join('')}
    </div>
    <div id="b-custom-range" class="two-col" style="display:${balancePeriod==='Personalizado'?'grid':'none'};margin-bottom:12px;">
      <input type="date" id="b-desde" value="${balanceCustomDesde? new Date(balanceCustomDesde).toISOString().slice(0,10):''}">
      <input type="date" id="b-hasta" value="${balanceCustomHasta? new Date(balanceCustomHasta).toISOString().slice(0,10):''}">
    </div>
    <div class="bal-grid" id="b-filtered"></div>

    <div class="divider"></div>
    <h3 style="font-size:14px;color:var(--teal-900);margin-bottom:8px;">Balance general (saldo acumulado)</h3>
    <div class="subtle" style="margin-bottom:10px;">Toca un saldo para editarlo manualmente. Toca el nombre para ver su historial.</div>
    <div class="bal-grid" id="b-general"></div>
  `;

  function refreshFiltered(){
    const totals = computeFilteredBalance(balancePeriod);
    const el = document.getElementById('b-filtered');
    const divisasConMovimiento = DB.divisas.filter(d=>totals[d.nombre]!==undefined);
    el.innerHTML = divisasConMovimiento.length ? divisasConMovimiento.map(d=>{
      const v = totals[d.nombre]||0;
      return `<div class="bal-card"><div class="name">${escapeHtml(d.nombre)}</div><div class="amt ${v<0?'neg':(v>0?'pos':'')}">${v>0?'+':''}${fmtMoney(v)}</div></div>`;
    }).join('') : `<div class="empty-state" style="grid-column:1/-1;"><div class="ei">📊</div>Sin movimientos en este período</div>`;
  }
  function refreshGeneral(){
    const el = document.getElementById('b-general');
    el.innerHTML = DB.divisas.slice().sort((a,b)=>(a.orden||0)-(b.orden||0)).map(d=>`
      <div class="bal-card" data-divisa="${escapeHtml(d.nombre)}">
        <div class="name" data-action="ver">${escapeHtml(d.nombre)}</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="amt ${d.saldo<0?'neg':''}" data-action="editar" style="flex:1;">${fmtMoney(d.saldo)}</div>
          <button class="eye-btn" data-action="historial" aria-label="Historial de movimientos">👁️</button>
        </div>
        <div class="bal-edit" data-action="editar">✎ Editar saldo</div>
      </div>`).join('');
    el.querySelectorAll('.bal-card').forEach(card=>{
      const nombre = card.dataset.divisa;
      card.querySelector('[data-action="ver"]').onclick = ()=>{
        historialFilters = {q:'', tipo:'Todos', fecha:'Todo', fechaDesde:null, fechaHasta:null, forma:'Todas', divisa:nombre};
        location.hash = '#/historial';
      };
      card.querySelectorAll('[data-action="editar"]').forEach(elx=>{
        elx.onclick = ()=>editarSaldoDivisa(nombre, refreshGeneral);
      });
      card.querySelector('[data-action="historial"]').onclick = ()=> openHistorialDivisa(nombre);
    });
  }

  document.querySelectorAll('#b-period-chips .chip').forEach(c=>{
    c.onclick = ()=>{
      balancePeriod = c.dataset.v;
      document.querySelectorAll('#b-period-chips .chip').forEach(x=>x.classList.remove('active')); c.classList.add('active');
      document.getElementById('b-custom-range').style.display = balancePeriod==='Personalizado' ? 'grid' : 'none';
      refreshFiltered();
    };
  });
  document.getElementById('b-desde').addEventListener('change', e=>{ balanceCustomDesde = e.target.value? new Date(e.target.value).getTime():null; refreshFiltered(); });
  document.getElementById('b-hasta').addEventListener('change', e=>{ balanceCustomHasta = e.target.value? new Date(e.target.value).getTime()+86399999:null; refreshFiltered(); });

  refreshFiltered();
  refreshGeneral();
}

// Recolecta todos los movimientos que afectaron a una divisa (envíos, ventas, gastos, préstamos)
function movimientosDeDivisa(nombre){
  const mov = [];
  DB.envios.forEach(e=>{
    if(e.divisa_entrega===nombre) mov.push({fecha:e.fecha_hora, tipo:'Envío', concepto:entityNameForEnvio(e), monto:-(e.cantidad_pagada||0)});
    if(e.divisa_ganancia===nombre) mov.push({fecha:e.fecha_hora, tipo:'Envío', concepto:entityNameForEnvio(e), monto:(e.ganancia||0)});
  });
  DB.ventas.forEach(v=>{
    if(v.divisa_vendida===nombre) mov.push({fecha:v.fecha_hora, tipo:'Venta', concepto:`Venta → ${v.divisa_recibida}`, monto:-(v.cantidad_vendida||0)});
    // si el switch "deuda pendiente" está activo, la cantidad recibida no entra aquí — entra cuando se cobra la deuda (más abajo)
    if(v.divisa_recibida===nombre && !v.registra_deuda) mov.push({fecha:v.fecha_hora, tipo:'Venta', concepto:`Venta de ${v.divisa_vendida}`, monto:(v.cantidad_recibida||0)});
  });
  DB.compras.forEach(c=>{
    if(c.divisa_comprada===nombre) mov.push({fecha:c.fecha_hora, tipo:'Compra', concepto:`Compra de ${c.divisa_pagada}`, monto:(c.cantidad_comprada||0)});
    if(c.divisa_pagada===nombre && !c.registra_deuda) mov.push({fecha:c.fecha_hora, tipo:'Compra', concepto:`Pago de compra`, monto:-(c.cantidad_pagada||0)});
  });
  DB.gastos.forEach(g=>{
    if(g.divisa===nombre) mov.push({fecha:g.fecha_hora, tipo:'Gasto', concepto:g.concepto, monto:-(g.cantidad||0)});
  });
  DB.in_out.forEach(io=>{
    if(io.divisa===nombre) mov.push({fecha:io.fecha_hora, tipo:'In/Out', concepto: io.nota || (io.tipo==='entrada'?'Entrada manual':'Salida manual'), monto: io.tipo==='entrada' ? (io.cantidad||0) : -(io.cantidad||0)});
  });
  DB.deudas.forEach(d=>{
    if(d.divisa!==nombre) return;
    if(d.tipo==='me_deben'){
      if(d.afecta_balance){
        mov.push({fecha:d.creado_en||d.fecha, tipo:'Préstamo', concepto:`Préstamo a ${d.persona}`, monto:-(d.monto||0)});
        if(d.estado==='cobrado' && d.fecha_cierre) mov.push({fecha:d.fecha_cierre, tipo:'Préstamo', concepto:`Cobro de ${d.persona}`, monto:(d.monto||0)});
      } else if(d.origen==='venta' && d.estado==='cobrado' && d.fecha_cierre){
        mov.push({fecha:d.fecha_cierre, tipo:'Venta cobrada', concepto:`Cobro de ${d.persona}`, monto:(d.monto||0)});
      }
    } else if(d.tipo==='pagar_a' && d.origen==='compra' && d.estado==='pagado' && d.fecha_cierre){
      mov.push({fecha:d.fecha_cierre, tipo:'Compra pagada', concepto:`Pago a ${d.persona}`, monto:-(d.monto||0)});
    }
  });
  // orden cronológico ascendente para calcular el saldo acumulado real
  mov.sort((a,b)=>a.fecha-b.fecha);
  let acumulado = 0;
  mov.forEach(m=>{ acumulado = round2(acumulado + m.monto); m.saldoAcumulado = acumulado; });
  // se muestra del más reciente al más antiguo
  return mov.reverse();
}

let historialDivisaFiltro = 'todos';

function openHistorialDivisa(nombre){
  historialDivisaFiltro = 'todos';
  const movimientos = movimientosDeDivisa(nombre);

  openModal(`
    <div class="modal-title">Historial — ${escapeHtml(nombre)}</div>
    <div class="chip-row" id="hd-chips" style="margin-top:10px;">
      <div class="chip active" data-v="todos">📊 Todos</div>
      <div class="chip" data-v="ingresos">📈 Ingresos</div>
      <div class="chip" data-v="egresos">📉 Egresos</div>
    </div>
    <div id="hd-list" style="max-height:55vh;overflow-y:auto;"></div>
    <div class="modal-actions"><button class="btn btn-outline btn-block" id="hd-cerrar">Cerrar</button></div>
  `);

  function refresh(){
    const el = document.getElementById('hd-list');
    let items = movimientos;
    if(historialDivisaFiltro==='ingresos') items = movimientos.filter(m=>m.monto>0);
    if(historialDivisaFiltro==='egresos') items = movimientos.filter(m=>m.monto<0);
    el.innerHTML = items.length ? items.map(m=>`
      <div class="card" style="box-shadow:none;border:1px solid var(--line);padding:10px 12px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-weight:700;font-size:14px;">${escapeHtml(m.tipo)}</div>
            <div class="subtle">${escapeHtml(m.concepto)}</div>
            <div class="subtle">${fmtDate(m.fecha)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:800;font-size:15px;color:${m.monto<0?'var(--red)':'var(--green)'};">${m.monto<0?'-':'+'}${fmtMoney(Math.abs(m.monto))}</div>
            <div class="subtle">Saldo: ${fmtMoney(m.saldoAcumulado)}</div>
          </div>
        </div>
      </div>`).join('') : emptyState('📭','Sin movimientos en esta categoría');
  }
  document.querySelectorAll('#hd-chips .chip').forEach(c=>{
    c.onclick = ()=>{
      historialDivisaFiltro = c.dataset.v;
      document.querySelectorAll('#hd-chips .chip').forEach(x=>x.classList.remove('active'));
      c.classList.add('active');
      refresh();
    };
  });
  document.getElementById('hd-cerrar').onclick = closeModal;
  refresh();
}

function editarSaldoDivisa(nombre, onDone){
  const d = findDivisa(nombre);
  if(!d) return;
  openModal(`
    <div class="modal-title">Editar saldo — ${escapeHtml(nombre)}</div>
    <label class="field-label">Nuevo saldo</label>
    <input type="number" inputmode="decimal" step="0.01" id="es-valor" value="${d.saldo}">
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="es-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="es-save">Guardar</button>
    </div>
  `, {center:true});
  document.getElementById('es-cancel').onclick = closeModal;
  document.getElementById('es-save').onclick = ()=>{
    const val = parseFloat(document.getElementById('es-valor').value);
    if(isNaN(val)){ toast('Ingrese un valor válido'); return; }
    d.saldo = round2(val);
    save(); closeModal(); toast('Saldo actualizado');
    onDone && onDone();
  };
}

/* ---------------------------------------------------------------------- *
 * 17. MENÚ 9 — RESPALDOS
 * ---------------------------------------------------------------------- */
function renderRespaldos(content){
  content.innerHTML = `
    <h1 class="section-title">Respaldos</h1>
    <div class="card">
      <div style="font-weight:700;margin-bottom:6px;">Nombre del negocio</div>
      <div class="subtle" style="margin-bottom:10px;">Aparece en el encabezado del reporte ejecutivo.</div>
      <input type="text" id="rp-negocio" value="${escapeHtml(DB.meta.nombre_negocio||'')}" maxlength="100" placeholder="Nombre de tu negocio">
    </div>
    <div class="card">
      <div style="font-weight:700;margin-bottom:6px;">Exportar datos</div>
      <div class="subtle" style="margin-bottom:14px;">Genera un archivo JSON con todos los clientes, trabajadores, envíos, ventas, gastos y divisas (activos e inactivos).</div>
      <button class="btn btn-primary btn-block" id="rp-export">⬇️ Exportar todos los datos (JSON)</button>
    </div>
    <div class="card">
      <div style="font-weight:700;margin-bottom:6px;">Reporte ejecutivo</div>
      <div class="subtle" style="margin-bottom:14px;">Balance por divisa, últimos 10 movimientos y totales acumulados, en un archivo Excel.</div>
      <button class="btn btn-gold btn-block" id="rp-excel">📊 Exportar reporte ejecutivo (Excel)</button>
    </div>
    <div class="card">
      <div style="font-weight:700;margin-bottom:6px;">Importar desde archivo</div>
      <div class="subtle" style="margin-bottom:14px;">Fusiona un respaldo con los datos actuales sin borrar nada.</div>
      <input type="file" id="rp-file" accept="application/json" style="display:none;">
      <button class="btn btn-outline btn-block" id="rp-import">⬆️ Importar desde archivo JSON (fusionar)</button>
    </div>
    <div class="subtle" style="text-align:center;margin-top:10px;">Los datos se guardan localmente en este dispositivo.</div>
  `;

  document.getElementById('rp-negocio').addEventListener('change', e=>{
    DB.meta.nombre_negocio = e.target.value.trim();
    save();
  });
  document.getElementById('rp-excel').onclick = generarReporteEjecutivo;

  document.getElementById('rp-export').onclick = ()=>{
    const data = JSON.parse(JSON.stringify(DB));
    data.exportado_en = {timestamp: Date.now(), iso: new Date().toISOString()};
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const pad = n=>String(n).padStart(2,'0');
    const name = `respaldo_${now.getFullYear()}_${pad(now.getMonth()+1)}_${pad(now.getDate())}_${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}.json`;
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
    toast('Respaldo exportado: ' + name);
  };

  document.getElementById('rp-import').onclick = ()=>{
    confirmDialog(
      'Esta operación NO borrará sus datos actuales. Los clientes, trabajadores y envíos del archivo se fusionarán con los que ya existen. Los clientes con el mismo nombre y país se unificarán (se añadirán sus envíos). ¿Desea continuar?',
      ()=> document.getElementById('rp-file').click(),
      {okLabel:'Continuar', cancelLabel:'Cancelar', danger:false}
    );
  };
  document.getElementById('rp-file').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const incoming = JSON.parse(reader.result);
        const resumen = mergeImport(incoming);
        save();
        alertDialog('Importación completada',
          `Insertados: ${resumen.insertados} · Actualizados: ${resumen.actualizados} · Omitidos (duplicados): ${resumen.omitidos}`);
      }catch(err){
        alertDialog('Error', 'El archivo no es un respaldo JSON válido.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });
}

function mergeImport(incoming){
  let insertados=0, actualizados=0, omitidos=0;

  // Divisas: agregar las que no existan por nombre único.
  // Si ya existe (p.ej. las predefinidas en una instalación nueva) y el saldo local
  // sigue en 0 (sin uso), se adopta el saldo del respaldo — así una restauración
  // completa (reinstalar + importar) recupera los balances reales.
  (incoming.divisas||[]).forEach(d=>{
    const local = DB.divisas.find(x=>x.nombre.toLowerCase()===d.nombre.toLowerCase());
    if(!local){
      DB.divisas.push({id:nextId('divisas'), nombre:d.nombre, simbolo:d.simbolo||'', orden:d.orden||DB.divisas.length+1, saldo:d.saldo||0});
      insertados++;
    } else if(local.saldo===0 && d.saldo){
      local.saldo = d.saldo;
      actualizados++;
    }
  });
  (incoming.paises||[]).forEach(p=>{
    if(!DB.paises.find(x=>x.nombre.toLowerCase()===p.nombre.toLowerCase())){
      DB.paises.push({id:nextId('paises'), nombre:p.nombre, es_predefinido:0});
      insertados++;
    }
  });
  (incoming.monedas||[]).forEach(m=>{
    if(!DB.monedas.find(x=>x.nombre.toUpperCase()===m.nombre.toUpperCase())){
      DB.monedas.push({id:nextId('monedas'), nombre:m.nombre});
      insertados++;
    }
  });

  // Clientes: identificador = nombre + país
  const clienteIdMap = {}; // id_del_archivo -> id_local
  (incoming.clientes||[]).forEach(c=>{
    let local = DB.clientes.find(x=>x.nombre.toLowerCase()===c.nombre.toLowerCase() && x.pais.toLowerCase()===(c.pais||'').toLowerCase());
    if(local){
      // local vacío = respaldo, local lleno = mantener local
      if(!local.telefono && c.telefono) local.telefono = c.telefono;
      if(!local.notas && c.notas) local.notas = c.notas;
      actualizados++;
    } else {
      local = {id:nextId('clientes'), nombre:c.nombre, pais:c.pais, telefono:c.telefono||'', notas:c.notas||'', fecha_registro:c.fecha_registro||Date.now(), activo: c.activo!==undefined?c.activo:1};
      DB.clientes.push(local);
      insertados++;
    }
    clienteIdMap[c.id] = local.id;
  });

  // Trabajadores: identificador = nombre + teléfono (si ambos tienen teléfono), si no, solo nombre
  const trabajadorIdMap = {};
  (incoming.trabajadores||[]).forEach(t=>{
    let local = DB.trabajadores.find(x=>{
      if(x.telefono && t.telefono) return x.nombre.toLowerCase()===t.nombre.toLowerCase() && x.telefono===t.telefono;
      return x.nombre.toLowerCase()===t.nombre.toLowerCase();
    });
    if(local){
      if(!local.telefono && t.telefono) local.telefono = t.telefono;
      actualizados++;
    } else {
      local = {id:nextId('trabajadores'), nombre:t.nombre, telefono:t.telefono||'', fecha_registro:t.fecha_registro||Date.now(), activo:t.activo!==undefined?t.activo:1};
      DB.trabajadores.push(local);
      insertados++;
    }
    trabajadorIdMap[t.id] = local.id;
  });

  // Envíos: duplicado si coincide tipo, cliente/trabajador, mismo segundo, cantidad_enviada, precio, forma_ganancia
  (incoming.envios||[]).forEach(e=>{
    const localClienteId = e.cliente_id!=null ? clienteIdMap[e.cliente_id] : null;
    const localTrabajadorId = e.trabajador_id!=null ? trabajadorIdMap[e.trabajador_id] : null;
    const mismoSegundo = ts => Math.floor(ts/1000);
    const dup = DB.envios.find(x =>
      x.tipo===e.tipo &&
      (x.cliente_id||null)===(localClienteId||null) &&
      (x.trabajador_id||null)===(localTrabajadorId||null) &&
      mismoSegundo(x.fecha_hora)===mismoSegundo(e.fecha_hora) &&
      x.cantidad_enviada===e.cantidad_enviada &&
      x.precio===e.precio &&
      x.forma_ganancia===e.forma_ganancia
    );
    if(dup){ omitidos++; return; }
    const nuevo = {...e, id:nextId('envios'), cliente_id:localClienteId, trabajador_id:localTrabajadorId};
    DB.envios.push(nuevo);
    insertados++;
  });

  // Ventas: duplicado si coinciden todos los campos clave
  const ventaIdMap = {};
  (incoming.ventas||[]).forEach(v=>{
    const dup = DB.ventas.find(x =>
      x.cantidad_vendida===v.cantidad_vendida && x.divisa_vendida===v.divisa_vendida &&
      x.cantidad_recibida===v.cantidad_recibida && x.divisa_recibida===v.divisa_recibida &&
      x.fecha_hora===v.fecha_hora && (x.nota||'')===(v.nota||'')
    );
    if(dup){ omitidos++; ventaIdMap[v.id] = dup.id; return; }
    const nuevaVenta = {...v, id:nextId('ventas')};
    DB.ventas.push(nuevaVenta);
    ventaIdMap[v.id] = nuevaVenta.id;
    insertados++;
  });

  // Compras: duplicado si coinciden todos los campos clave
  const compraIdMap = {};
  (incoming.compras||[]).forEach(c=>{
    const dup = DB.compras.find(x =>
      x.cantidad_comprada===c.cantidad_comprada && x.divisa_comprada===c.divisa_comprada &&
      x.cantidad_pagada===c.cantidad_pagada && x.divisa_pagada===c.divisa_pagada &&
      x.fecha_hora===c.fecha_hora && (x.nota||'')===(c.nota||'')
    );
    if(dup){ omitidos++; compraIdMap[c.id] = dup.id; return; }
    const nuevaCompra = {...c, id:nextId('compras')};
    DB.compras.push(nuevaCompra);
    compraIdMap[c.id] = nuevaCompra.id;
    insertados++;
  });

  // Gastos: duplicado si coinciden todos los campos clave
  (incoming.gastos||[]).forEach(g=>{
    const dup = DB.gastos.find(x =>
      x.concepto===g.concepto && x.cantidad===g.cantidad && x.divisa===g.divisa &&
      x.fecha_hora===g.fecha_hora && (x.nota||'')===(g.nota||'')
    );
    if(dup){ omitidos++; return; }
    DB.gastos.push({...g, id:nextId('gastos')});
    insertados++;
  });

  // In/Out: duplicado si coinciden todos los campos clave
  (incoming.in_out||[]).forEach(io=>{
    const dup = DB.in_out.find(x =>
      x.tipo===io.tipo && x.cantidad===io.cantidad && x.divisa===io.divisa &&
      x.fecha_hora===io.fecha_hora && (x.nota||'')===(io.nota||'')
    );
    if(dup){ omitidos++; return; }
    DB.in_out.push({...io, id:nextId('in_out')});
    insertados++;
  });

  // Deudas: duplicado si coinciden todos los campos clave.
  // Si la deuda viene de una venta/compra, su origen_id se remapea al nuevo id local.
  (incoming.deudas||[]).forEach(d=>{
    const dup = DB.deudas.find(x =>
      x.tipo===d.tipo && x.persona===d.persona && x.monto===d.monto && x.divisa===d.divisa &&
      x.fecha===d.fecha && (x.nota||'')===(d.nota||'')
    );
    if(dup){ omitidos++; return; }
    let origen_id = d.origen_id;
    if(d.origen==='venta' && ventaIdMap[d.origen_id]!==undefined) origen_id = ventaIdMap[d.origen_id];
    if(d.origen==='compra' && compraIdMap[d.origen_id]!==undefined) origen_id = compraIdMap[d.origen_id];
    DB.deudas.push({...d, id:nextId('deudas'), creado_en: d.creado_en || d.fecha, origen_id});
    insertados++;
  });

  return {insertados, actualizados, omitidos};
}

/* ---------------------------------------------------------------------- *
 * 18. MENÚ 9 — DEUDAS  ("Pagar a:" / "Me deben:" / "Historial")
 * ---------------------------------------------------------------------- */
// Crea una deuda automáticamente desde una Venta o Compra (switch "deuda pendiente").
// No toca el balance al crearla — solo se ajusta cuando se marca Pagado/Cobrado.
function crearDeudaAutomatica({tipo, persona, monto, divisa, fecha, nota, origen, origen_id}){
  const deuda = {
    id: nextId('deudas'), tipo, persona, monto, divisa, fecha,
    creado_en: Date.now(),
    afecta_balance: 0,
    estado: 'pendiente', fecha_cierre: null, nota,
    origen, origen_id
  };
  DB.deudas.push(deuda);
  return deuda;
}
// Si una Venta/Compra que generó una deuda automática se elimina y esa deuda sigue
// pendiente (no se ha cobrado/pagado), se elimina también — nunca tocó el balance.
function eliminarDeudaAutomaticaSiPendiente(origen, origen_id){
  DB.deudas = DB.deudas.filter(d => !(d.origen===origen && d.origen_id===origen_id && d.estado==='pendiente'));
}

let deudasTab = 'pagar_a';

function renderDeudas(content){
  content.innerHTML = `
    <h1 class="section-title">Deudas</h1>
    <div class="tabs" id="deudas-tabs">
      <div class="tab ${deudasTab==='pagar_a'?'active':''}" data-v="pagar_a">Pagar a</div>
      <div class="tab ${deudasTab==='me_deben'?'active':''}" data-v="me_deben">Me deben</div>
      <div class="tab ${deudasTab==='historial'?'active':''}" data-v="historial">Historial</div>
    </div>
    <div id="deudas-list"></div>
    ${deudasTab!=='historial' ? `<button class="fab" id="fab-add-deuda" aria-label="Agregar">+</button>` : ''}
  `;

  function refresh(){
    const el = document.getElementById('deudas-list');
    let items;
    if(deudasTab==='historial'){
      items = DB.deudas.filter(d=>d.estado==='pagado'||d.estado==='cobrado')
        .sort((a,b)=>(b.fecha_cierre||0)-(a.fecha_cierre||0));
      el.innerHTML = items.length ? items.map(deudaHistorialRowHtml).join('') :
        emptyState('🗂️','Aún no hay registros pagados o cobrados');
    } else {
      items = DB.deudas.filter(d=>d.tipo===deudasTab && d.estado==='pendiente')
        .sort((a,b)=>(b.creado_en||b.fecha)-(a.creado_en||a.fecha));
      el.innerHTML = items.length ? items.map(deudaRowHtml).join('') :
        emptyState(deudasTab==='pagar_a'?'💸':'🤝', deudasTab==='pagar_a' ? 'No hay deudas pendientes por pagar' : 'No hay registros pendientes por cobrar');
    }
    el.querySelectorAll('.list-item').forEach(li=>{
      li.onclick = ()=> openDeudaDetalle(Number(li.dataset.id), refresh);
    });
  }
  document.querySelectorAll('#deudas-tabs .tab').forEach(t=>{
    t.onclick = ()=>{
      deudasTab = t.dataset.v;
      renderDeudas(content); // re-renderiza para mostrar/ocultar el botón +
    };
  });
  const fab = document.getElementById('fab-add-deuda');
  if(fab) fab.onclick = ()=> openDeudaForm(deudasTab, refresh);
  refresh();
}

function estadoBadgeHtml(estado){
  if(estado==='pendiente') return `<span class="badge badge-gold">Pendiente</span>`;
  if(estado==='pagado') return `<span class="badge badge-teal">Pagado</span>`;
  if(estado==='cobrado') return `<span class="badge badge-teal">Cobrado</span>`;
  return '';
}
function deudaRowHtml(d){
  return `
    <div class="list-item" data-id="${d.id}">
      <div class="avatar">${d.tipo==='pagar_a'?'💸':'🤝'}</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(d.persona)}</div>
        <div class="li-sub">${fmtDateShort(d.fecha)} ${d.afecta_balance?'· Préstamo':''}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount ${d.tipo==='pagar_a'?'neg':''}">${fmtMoney(d.monto)} ${escapeHtml(d.divisa)}</div>
        <div style="margin-top:4px;">${estadoBadgeHtml(d.estado)}</div>
      </div>
    </div>`;
}
function deudaHistorialRowHtml(d){
  const esMeDeben = d.tipo==='me_deben';
  return `
    <div class="list-item" data-id="${d.id}">
      <div class="avatar">${esMeDeben?'🤝':'💸'}</div>
      <div class="li-main">
        <div class="li-title">${escapeHtml(d.persona)}</div>
        <div class="li-sub">${esMeDeben?'Cobrado':'Pagado'} el ${fmtDateShort(d.fecha_cierre)} · Registrado ${fmtDateShort(d.fecha)}</div>
      </div>
      <div class="li-trail">
        <div class="li-amount ${d.tipo==='pagar_a'?'neg':''}">${fmtMoney(d.monto)} ${escapeHtml(d.divisa)}</div>
        <div style="margin-top:4px;">${estadoBadgeHtml(d.estado)}</div>
      </div>
    </div>`;
}

function openDeudaForm(tipo, onSaved){
  const esMeDeben = tipo==='me_deben';
  openModal(`
    <div class="modal-title">${esMeDeben ? 'Nuevo registro — Me deben' : 'Nueva deuda — Pagar a'}</div>
    <label class="field-label">Persona / Entidad *</label>
    <input type="text" id="df-persona" maxlength="100" placeholder="Nombre de la persona o entidad">
    <label class="field-label">Monto *</label>
    <input type="number" inputmode="decimal" step="0.01" id="df-monto" placeholder="0.00">
    <label class="field-label">Divisa *</label>
    <select id="df-divisa" class="picker">${divisaOptionsHtml('')}</select>
    <label class="field-label">Fecha *</label>
    <input type="date" id="df-fecha" value="${new Date().toISOString().slice(0,10)}">
    ${esMeDeben ? `
      <label class="field-label">¿Restar del balance general?</label>
      <div class="pill-row" id="df-afecta">
        <div class="pill active" data-v="0">No</div>
        <div class="pill" data-v="1">Sí — es un préstamo</div>
      </div>
      <div class="hint">Si activa esta opción, el monto se restará ahora del balance general de la divisa elegida.</div>
    ` : ''}
    <label class="field-label">Nota</label>
    <textarea id="df-nota" maxlength="500" placeholder="Opcional"></textarea>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" id="df-cancel">Cancelar</button>
      <button class="btn btn-primary btn-block" id="df-save">Guardar</button>
    </div>
  `);
  bindAddOnSelect(document.getElementById('df-divisa'), addDivisa, divisaOptionsHtml);
  let afectaBalance = 0;
  if(esMeDeben){
    document.querySelectorAll('#df-afecta .pill').forEach(p=>{
      p.onclick = ()=>{
        document.querySelectorAll('#df-afecta .pill').forEach(x=>x.classList.remove('active'));
        p.classList.add('active');
        afectaBalance = Number(p.dataset.v);
      };
    });
  }
  document.getElementById('df-cancel').onclick = closeModal;
  document.getElementById('df-save').onclick = ()=>{
    const persona = document.getElementById('df-persona').value.trim();
    const monto = parseFloat(document.getElementById('df-monto').value);
    const divisa = document.getElementById('df-divisa').value;
    const fechaVal = document.getElementById('df-fecha').value;
    const nota = document.getElementById('df-nota').value.trim();
    if(!persona || !monto || !divisa || divisa==='__add__' || !fechaVal){
      toast('Todos los campos obligatorios deben estar llenos.'); return;
    }
    const ahora = Date.now();
    const deuda = {
      id: nextId('deudas'), tipo, persona, monto, divisa,
      fecha: new Date(fechaVal).getTime(),
      creado_en: ahora,
      afecta_balance: esMeDeben ? afectaBalance : 0,
      estado: 'pendiente', fecha_cierre: null, nota,
      origen: null, origen_id: null
    };
    DB.deudas.push(deuda);
    if(esMeDeben && afectaBalance){
      adjustBalance(divisa, -monto); // préstamo: se resta ahora del balance
    }
    save(); closeModal();
    toast(esMeDeben ? 'Registro guardado' : 'Deuda guardada');
    onSaved && onSaved();
  };
}

function openDeudaDetalle(id, onChange){
  const d = DB.deudas.find(x=>x.id===id);
  if(!d) return;
  const esMeDeben = d.tipo==='me_deben';
  openModal(`
    <div class="modal-title">${esMeDeben?'Me deben':'Pagar a'} — ${escapeHtml(d.persona)}</div>
    <div class="card" style="box-shadow:none;border:1px solid var(--line);padding:12px;margin-top:8px;">
      <div class="sumrow"><span class="k">Persona / Entidad</span><span class="v">${escapeHtml(d.persona)}</span></div>
      <div class="sumrow"><span class="k">Monto</span><span class="v">${fmtMoney(d.monto)} ${escapeHtml(d.divisa)}</span></div>
      <div class="sumrow"><span class="k">Fecha del registro</span><span class="v">${fmtDateShort(d.fecha)}</span></div>
      ${esMeDeben ? `<div class="sumrow"><span class="k">¿Resta del balance?</span><span class="v">${d.afecta_balance?'Sí — Préstamo':'No — informativo'}</span></div>` : ''}
      <div class="sumrow"><span class="k">Estado</span><span class="v">${estadoBadgeHtml(d.estado)}</span></div>
      ${d.fecha_cierre ? `<div class="sumrow"><span class="k">${esMeDeben?'Fecha de cobro':'Fecha de pago'}</span><span class="v">${fmtDate(d.fecha_cierre)}</span></div>` : ''}
      <div class="sumrow"><span class="k">Nota</span><span class="v">${escapeHtml(d.nota || 'Sin nota')}</span></div>
    </div>
    <div class="modal-actions" id="dd-actions"></div>
  `);
  const actions = document.getElementById('dd-actions');
  const btns = [];
  if(d.estado==='pendiente'){
    btns.push(`<button class="btn btn-gold btn-block" id="dd-cerrar">${esMeDeben?'Marcar como cobrado':'Marcar como pagado'}</button>`);
  }
  btns.push(`<button class="btn btn-danger btn-block" id="dd-del">Eliminar</button>`);
  actions.innerHTML = btns.join('');

  const cerrarBtn = document.getElementById('dd-cerrar');
  if(cerrarBtn){
    cerrarBtn.onclick = ()=>{
      if(!esMeDeben){
        const restaAlPagar = d.origen==='compra'; // compra pendiente: al pagarla, el dinero sale del balance
        const msg = restaAlPagar
          ? `Confirmar pago de ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} a ${escapeHtml(d.persona)}? Esta acción RESTARÁ ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} del balance general.`
          : `Confirmar pago de ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} a ${escapeHtml(d.persona)}?`;
        confirmDialog(msg, ()=>{
          d.estado = 'pagado'; d.fecha_cierre = Date.now();
          if(restaAlPagar) adjustBalance(d.divisa, -d.monto);
          save(); closeModal(); toast('Deuda marcada como pagada — pasó al Historial'); onChange && onChange();
        }, {okLabel:'Confirmar', cancelLabel:'Cancelar', danger:false});
      } else if(d.afecta_balance || d.origen==='venta'){
        confirmDialog(`Confirmar cobro de ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} de ${escapeHtml(d.persona)}? Esta acción SUMARÁ ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} al balance general.`, ()=>{
          d.estado = 'cobrado'; d.fecha_cierre = Date.now();
          adjustBalance(d.divisa, d.monto);
          save(); closeModal(); toast('Cobro registrado — pasó al Historial'); onChange && onChange();
        }, {okLabel:'Confirmar', cancelLabel:'Cancelar', danger:false});
      } else {
        confirmDialog(`Confirmar cobro de ${fmtMoney(d.monto)} ${escapeHtml(d.divisa)} de ${escapeHtml(d.persona)}?`, ()=>{
          d.estado = 'cobrado'; d.fecha_cierre = Date.now();
          save(); closeModal(); toast('Cobro registrado — pasó al Historial'); onChange && onChange();
        }, {okLabel:'Confirmar', cancelLabel:'Cancelar', danger:false});
      }
    };
  }
  document.getElementById('dd-del').onclick = ()=>{
    closeModal();
    confirmDialog(`¿Eliminar este registro de ${escapeHtml(d.persona)}?`, ()=>{
      if(d.tipo==='me_deben' && d.afecta_balance && d.estado==='pendiente'){
        adjustBalance(d.divisa, d.monto); // revertir el préstamo aún no cobrado
      }
      DB.deudas = DB.deudas.filter(x=>x.id!==d.id);
      save(); toast('Registro eliminado'); onChange && onChange();
    });
  };
}



/* ---------------------------------------------------------------------- *
 * 19. GENERADOR DE .XLSX PURO (sin librerías, funciona 100% offline)
 * ---------------------------------------------------------------------- */
const XLSX_CRC_TABLE = (() => {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();
function xlsxCrc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = XLSX_CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function xlsxStrToBytes(str){ return new TextEncoder().encode(str); }
function xlsxU16(n){ return [n & 0xFF, (n >> 8) & 0xFF]; }
function xlsxU32(n){ return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >>> 24) & 0xFF]; }
function xlsxConcat(arrays){
  let total = 0; arrays.forEach(a=>total+=a.length);
  const out = new Uint8Array(total); let off=0;
  arrays.forEach(a=>{ out.set(a, off); off += a.length; });
  return out;
}
function xlsxBuildZip(files){
  const localParts = [], centralParts = [];
  let offset = 0;
  const dosTime = 0, dosDate = 0x21;
  files.forEach(f=>{
    const nameBytes = xlsxStrToBytes(f.name);
    const data = f.data;
    const crc = xlsxCrc32(data);
    const localHeader = new Uint8Array([
      0x50,0x4b,0x03,0x04, ...xlsxU16(20), ...xlsxU16(0), ...xlsxU16(0),
      ...xlsxU16(dosTime), ...xlsxU16(dosDate), ...xlsxU32(crc),
      ...xlsxU32(data.length), ...xlsxU32(data.length),
      ...xlsxU16(nameBytes.length), ...xlsxU16(0)
    ]);
    localParts.push(localHeader, nameBytes, data);
    const centralHeader = new Uint8Array([
      0x50,0x4b,0x01,0x02, ...xlsxU16(20), ...xlsxU16(20), ...xlsxU16(0), ...xlsxU16(0),
      ...xlsxU16(dosTime), ...xlsxU16(dosDate), ...xlsxU32(crc),
      ...xlsxU32(data.length), ...xlsxU32(data.length),
      ...xlsxU16(nameBytes.length), ...xlsxU16(0), ...xlsxU16(0),
      ...xlsxU16(0), ...xlsxU16(0), ...xlsxU32(0), ...xlsxU32(offset)
    ]);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + data.length;
  });
  const centralStart = offset;
  let centralSize = 0; centralParts.forEach(p=>centralSize+=p.length);
  const eocd = new Uint8Array([
    0x50,0x4b,0x05,0x06, ...xlsxU16(0), ...xlsxU16(0),
    ...xlsxU16(files.length), ...xlsxU16(files.length),
    ...xlsxU32(centralSize), ...xlsxU32(centralStart), ...xlsxU16(0)
  ]);
  return xlsxConcat([...localParts, ...centralParts, eocd]);
}
function xlsxColLetter(idx){
  let s = ''; idx += 1;
  while (idx > 0) { const rem = (idx-1)%26; s = String.fromCharCode(65+rem)+s; idx = Math.floor((idx-1)/26); }
  return s;
}
function xlsxEscapeXml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m]));
}
function xlsxBuildSheetXml(rows){
  let rowsXml = '';
  rows.forEach((row, rIdx) => {
    const rNum = rIdx + 1;
    let cellsXml = '';
    row.forEach((cell, cIdx) => {
      if (cell === null || cell === undefined || cell === '') return;
      const ref = xlsxColLetter(cIdx) + rNum;
      const style = cell.style || 0;
      if (cell.type === 'n') cellsXml += `<c r="${ref}" s="${style}"><v>${cell.v}</v></c>`;
      else cellsXml += `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xlsxEscapeXml(cell.v)}</t></is></c>`;
    });
    rowsXml += `<row r="${rNum}">${cellsXml}</row>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="34" customWidth="1"/><col min="2" max="5" width="18" customWidth="1"/></cols><sheetData>${rowsXml}</sheetData></worksheet>`;
}
// estilos: 0=normal, 1=negrita/título, 2=numero 2 decimales, 3=encabezado de columna (negrita+relleno)
const XLSX_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="12"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
function xlsxBuildFile(rows){
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Reporte" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  const sheetXml = xlsxBuildSheetXml(rows);
  const files = [
    {name:'[Content_Types].xml', data: xlsxStrToBytes(contentTypes)},
    {name:'_rels/.rels', data: xlsxStrToBytes(rootRels)},
    {name:'xl/workbook.xml', data: xlsxStrToBytes(workbookXml)},
    {name:'xl/_rels/workbook.xml.rels', data: xlsxStrToBytes(workbookRels)},
    {name:'xl/styles.xml', data: xlsxStrToBytes(XLSX_STYLES_XML)},
    {name:'xl/worksheets/sheet1.xml', data: xlsxStrToBytes(sheetXml)},
  ];
  return xlsxBuildZip(files);
}

function s(v){ return {v, type:'s', style:0}; }
function sb(v){ return {v, type:'s', style:1}; }
function n(v){ return {v: round2(v), type:'n', style:2}; }

function generarReporteEjecutivo(){
  const now = Date.now();
  const rows = [];
  rows.push([sb(DB.meta.nombre_negocio || 'Mi negocio de remesas')]);
  rows.push([s('Fecha de exportación: ' + fmtDate(now))]);
  rows.push([]);

  rows.push([sb('Balance general por divisa')]);
  rows.push([sb('Divisa'), sb('Saldo')]);
  DB.divisas.slice().sort((a,b)=>(a.orden||0)-(b.orden||0)).forEach(d=>{
    rows.push([s(d.nombre), n(d.saldo)]);
  });
  rows.push([]);

  rows.push([sb('Últimos 10 movimientos')]);
  rows.push([sb('Fecha'), sb('Tipo'), sb('Concepto'), sb('Divisa'), sb('Monto')]);
  const movimientos = [];
  DB.envios.forEach(e=>{
    movimientos.push({fecha:e.fecha_hora, tipo:'Envío', concepto: entityNameForEnvio(e), divisa:e.divisa_ganancia, monto:e.ganancia});
  });
  DB.compras.forEach(c=>{
    movimientos.push({fecha:c.fecha_hora, tipo:'Compra', concepto:`${fmtMoney(c.cantidad_pagada)} ${c.divisa_pagada} → ${c.divisa_comprada}`, divisa:c.divisa_comprada, monto:c.cantidad_comprada});
  });
  DB.ventas.forEach(v=>{
    movimientos.push({fecha:v.fecha_hora, tipo:'Venta', concepto:`${fmtMoney(v.cantidad_vendida)} ${v.divisa_vendida} → ${v.divisa_recibida}`, divisa:v.divisa_recibida, monto:v.registra_deuda?0:v.cantidad_recibida});
  });
  DB.gastos.forEach(g=>{
    movimientos.push({fecha:g.fecha_hora, tipo:'Gasto', concepto:g.concepto, divisa:g.divisa, monto:-g.cantidad});
  });
  DB.in_out.forEach(io=>{
    movimientos.push({fecha:io.fecha_hora, tipo:'In/Out', concepto: io.nota || (io.tipo==='entrada'?'Entrada manual':'Salida manual'), divisa:io.divisa, monto: io.tipo==='entrada'?io.cantidad:-io.cantidad});
  });
  movimientos.sort((a,b)=>b.fecha-a.fecha).slice(0,10).forEach(m=>{
    rows.push([s(fmtDate(m.fecha)), s(m.tipo), s(m.concepto), s(m.divisa), n(m.monto)]);
  });
  rows.push([]);

  rows.push([sb('Totales acumulados (histórico)')]);
  rows.push([sb('Envíos — ganancia total por divisa')]);
  rows.push([sb('Divisa'), sb('Total')]);
  const totEnvios = {};
  DB.envios.forEach(e=>{ totEnvios[e.divisa_ganancia] = (totEnvios[e.divisa_ganancia]||0) + (e.ganancia||0); });
  Object.keys(totEnvios).forEach(k=> rows.push([s(k), n(totEnvios[k])]));
  rows.push([]);

  rows.push([sb('Compras — total comprado por divisa')]);
  rows.push([sb('Divisa'), sb('Total')]);
  const totCompras = {};
  DB.compras.forEach(c=>{ totCompras[c.divisa_comprada] = (totCompras[c.divisa_comprada]||0) + (c.cantidad_comprada||0); });
  Object.keys(totCompras).forEach(k=> rows.push([s(k), n(totCompras[k])]));
  rows.push([]);

  rows.push([sb('Ventas — total recibido por divisa')]);
  rows.push([sb('Divisa'), sb('Total')]);
  const totVentas = {};
  DB.ventas.forEach(v=>{ if(!v.registra_deuda) totVentas[v.divisa_recibida] = (totVentas[v.divisa_recibida]||0) + (v.cantidad_recibida||0); });
  Object.keys(totVentas).forEach(k=> rows.push([s(k), n(totVentas[k])]));
  rows.push([]);

  rows.push([sb('Gastos — total por divisa')]);
  rows.push([sb('Divisa'), sb('Total')]);
  const totGastos = {};
  DB.gastos.forEach(g=>{ totGastos[g.divisa] = (totGastos[g.divisa]||0) + (g.cantidad||0); });
  Object.keys(totGastos).forEach(k=> rows.push([s(k), n(totGastos[k])]));
  rows.push([]);

  rows.push([sb('In/Out — total neto por divisa')]);
  rows.push([sb('Divisa'), sb('Total')]);
  const totInOut = {};
  DB.in_out.forEach(io=>{ totInOut[io.divisa] = (totInOut[io.divisa]||0) + (io.tipo==='entrada'?io.cantidad:-io.cantidad); });
  Object.keys(totInOut).forEach(k=> rows.push([s(k), n(totInOut[k])]));

  const zipBytes = xlsxBuildFile(rows);
  const blob = new Blob([zipBytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const pad = x=>String(x).padStart(2,'0');
  const name = `reporte_ejecutivo_${d.getFullYear()}_${pad(d.getMonth()+1)}_${pad(d.getDate())}.xlsx`;
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
  toast('Reporte Excel exportado');
}
