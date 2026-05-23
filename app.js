/**
 * CONSTROL — Sistema Industrial de Control de Obras
 * app.js — Lógica principal con persistencia via window.storage
 * Arquitectura: Módulos independientes, CRUD completo, sincronización automática
 */

// ===== ESTADO GLOBAL =====
const DB = {
  obra: {},
  cronograma: [],
  gastos: [],
  despacho: [],
  presupuesto: [],
  _nextId: { cronograma: 1, gastos: 1, despacho: 1, presupuesto: 1 }
};

let charts = {};
let saveTimeout = null;
let currentModule = 'dashboard';

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', async () => {
  showLoading();
  updateDateTime();
  setInterval(updateDateTime, 30000);
  await loadFromStorage();
  renderAll();
  hideLoading();
  setSyncStatus('online');
});

function showLoading() {
  const el = document.createElement('div');
  el.id = 'loadingOverlay';
  el.className = 'loading-overlay';
  el.innerHTML = `
    <div class="loading-logo">CONSTROL</div>
    <div class="loading-bar-wrap"><div class="loading-bar"></div></div>
    <div class="loading-text">CARGANDO SISTEMA...</div>
  `;
  document.body.appendChild(el);
}

function hideLoading() {
  const el = document.getElementById('loadingOverlay');
  if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.5s'; setTimeout(() => el.remove(), 500); }
}

function updateDateTime() {
  const el = document.getElementById('datetime');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    + '  ' + now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

// ===== STORAGE (persistencia con window.storage) =====
async function loadFromStorage() {
  try {
    const keys = ['obra', 'cronograma', 'gastos', 'despacho', 'presupuesto', '_nextId'];
    for (const key of keys) {
      try {
        const result = await window.storage.get('constrol_' + key);
        if (result && result.value) {
          DB[key] = JSON.parse(result.value);
        }
      } catch (e) { /* key doesn't exist yet */ }
    }
    // Update display
    if (DB.obra && DB.obra.nombre) {
      document.getElementById('obraNameDisplay').textContent = DB.obra.nombre;
    }
  } catch (e) {
    console.warn('Storage load error:', e);
    setSyncStatus('error');
  }
}

async function saveToStorage(key) {
  try {
    setSyncStatus('syncing');
    await window.storage.set('constrol_' + key, JSON.stringify(DB[key]));
    await window.storage.set('constrol__nextId', JSON.stringify(DB._nextId));
    setSyncStatus('online');
  } catch (e) {
    console.error('Storage save error:', e);
    setSyncStatus('error');
    showToast('Error al guardar datos. Verifique conexión.', 'error');
  }
}

function scheduleSave(key) {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveToStorage(key), 400);
}

function setSyncStatus(status) {
  const dot = document.querySelector('.sync-dot');
  const txt = document.getElementById('syncText');
  if (!dot || !txt) return;
  dot.className = 'sync-dot' + (status === 'syncing' ? ' syncing' : status === 'error' ? ' error' : '');
  txt.textContent = status === 'online' ? 'Sincronizado' : status === 'syncing' ? 'Guardando...' : 'Error de sync';
}

// ===== NAVEGACIÓN =====
function showModule(name) {
  document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const mod = document.getElementById('module-' + name);
  if (mod) mod.classList.add('active');
  const nav = document.querySelector(`[onclick="showModule('${name}')"]`);
  if (nav) nav.classList.add('active');
  currentModule = name;
  const labels = {
    dashboard: 'Dashboard General',
    cronograma: 'Cronograma de Pagos',
    gastos: 'Gastos Adicionales',
    despacho: 'Despacho de Materiales',
    balance: 'Balance de Materiales',
    presupuesto: 'Presupuesto de Materiales',
    desviaciones: 'Análisis de Desviaciones',
    estandar: 'Control Sobre/Sub Estándar'
  };
  document.getElementById('breadcrumb').textContent = labels[name] || name;
  if (name === 'balance') renderBalance();
  if (name === 'desviaciones') renderDesviaciones();
  if (name === 'estandar') renderEstandar();
  if (name === 'dashboard') renderDashboard();
  // Close sidebar on mobile
  if (window.innerWidth <= 900) document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ===== MODALS =====
function openModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// Close on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.style.display = 'none';
    // Reset edit IDs
    ['editCronogramaId','editGastoId','editDespachoId','editPresupuestoId'].forEach(f => {
      const el = document.getElementById(f); if (el) el.value = '';
    });
  }
});

// ===== TOAST =====
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.style.display = 'block';
  clearTimeout(t._to);
  t._to = setTimeout(() => { t.style.display = 'none'; }, 3000);
}

// ===== CONFIRMACIÓN ANTES DE BORRAR =====
function confirmDelete(msg, callback) {
  document.getElementById('confirmMessage').textContent = msg;
  document.getElementById('confirmOkBtn').onclick = () => {
    closeModal('confirmDialog');
    callback();
  };
  openModal('confirmDialog');
}

// ===== FORMATEO =====
function fmt(n) {
  const v = parseFloat(n) || 0;
  return 'S/ ' + v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtN(n) {
  return (parseFloat(n) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n) {
  return (parseFloat(n) || 0).toFixed(1) + '%';
}
function fmtDate(d) {
  if (!d) return '-';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// ===== GENERAR ID =====
function nextId(key) {
  DB._nextId[key] = (DB._nextId[key] || 1);
  return DB._nextId[key]++;
}

// ===== RENDER ALL =====
function renderAll() {
  renderCronograma();
  renderGastos();
  renderDespacho();
  renderPresupuesto();
  renderBalance();
  renderDesviaciones();
  renderEstandar();
  renderDashboard();
}

// ===== OBRA CONFIG =====
function openObraConfig() {
  const o = DB.obra;
  document.getElementById('obraNombre').value = o.nombre || '';
  document.getElementById('obraInicio').value = o.inicio || '';
  document.getElementById('obraFin').value = o.fin || '';
  document.getElementById('obraResponsable').value = o.responsable || '';
  document.getElementById('obraPresupuesto').value = o.presupuesto || '';
  openModal('modalObraConfig');
}

async function saveObraConfig() {
  DB.obra = {
    nombre: document.getElementById('obraNombre').value.trim(),
    inicio: document.getElementById('obraInicio').value,
    fin: document.getElementById('obraFin').value,
    responsable: document.getElementById('obraResponsable').value.trim(),
    presupuesto: parseFloat(document.getElementById('obraPresupuesto').value) || 0
  };
  document.getElementById('obraNameDisplay').textContent = DB.obra.nombre || 'Sin nombre';
  await saveToStorage('obra');
  renderDashboard();
  closeModal('modalObraConfig');
  showToast('Obra configurada correctamente', 'success');
}

// ===== MÓDULO: CRONOGRAMA DE PAGOS =====
function saveCronograma() {
  const etapa = document.getElementById('cronoEtapa').value.trim();
  const fecha = document.getElementById('cronoFecha').value;
  const monto = parseFloat(document.getElementById('cronoMonto').value) || 0;
  const estado = document.getElementById('cronoEstado').value;
  const obs = document.getElementById('cronoObs').value.trim();

  if (!etapa || !fecha || !monto) {
    showToast('Complete los campos obligatorios: Etapa, Fecha y Monto', 'error'); return;
  }

  const editId = document.getElementById('editCronogramaId').value;
  if (editId) {
    const idx = DB.cronograma.findIndex(r => r.id == editId);
    if (idx >= 0) DB.cronograma[idx] = { ...DB.cronograma[idx], etapa, fecha, monto, estado, obs };
    showToast('Pago actualizado', 'success');
  } else {
    DB.cronograma.push({ id: nextId('cronograma'), etapa, fecha, monto, estado, obs });
    showToast('Pago registrado', 'success');
  }
  closeModal('modalCronograma');
  document.getElementById('editCronogramaId').value = '';
  document.getElementById('modalCronogramaTitle').textContent = 'REGISTRAR PAGO';
  clearFormFields(['cronoEtapa','cronoFecha','cronoMonto','cronoEstado','cronoObs']);
  scheduleSave('cronograma');
  renderCronograma();
  renderDashboard();
}

function editCronograma(id) {
  const r = DB.cronograma.find(x => x.id == id);
  if (!r) return;
  document.getElementById('editCronogramaId').value = id;
  document.getElementById('cronoEtapa').value = r.etapa;
  document.getElementById('cronoFecha').value = r.fecha;
  document.getElementById('cronoMonto').value = r.monto;
  document.getElementById('cronoEstado').value = r.estado;
  document.getElementById('cronoObs').value = r.obs || '';
  document.getElementById('modalCronogramaTitle').textContent = 'EDITAR PAGO';
  openModal('modalCronograma');
}

function deleteCronograma(id) {
  confirmDelete('¿Eliminar este pago del cronograma?', async () => {
    DB.cronograma = DB.cronograma.filter(x => x.id != id);
    await saveToStorage('cronograma');
    renderCronograma();
    renderDashboard();
    showToast('Registro eliminado', 'warn');
  });
}

function renderCronograma() {
  const tbody = document.querySelector('#tblCronograma tbody');
  if (!tbody) return;
  if (!DB.cronograma.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Sin registros. Haga clic en "+ Agregar Pago" para comenzar.</td></tr>';
    renderCronogramaSummary();
    return;
  }
  tbody.innerHTML = DB.cronograma.map((r, i) => `
    <tr>
      <td class="num-cell">${i + 1}</td>
      <td><strong>${r.etapa}</strong></td>
      <td>${fmtDate(r.fecha)}</td>
      <td class="num-cell">${fmt(r.monto)}</td>
      <td>${badgeEstado(r.estado)}</td>
      <td style="max-width:200px;font-size:11px">${r.obs || '-'}</td>
      <td><div class="tbl-actions">
        <button class="btn-edit btn-sm" onclick="editCronograma(${r.id})">✏ Editar</button>
        <button class="btn-del btn-sm" onclick="deleteCronograma(${r.id})">✕ Eliminar</button>
      </div></td>
    </tr>`).join('');
  renderCronogramaSummary();
}

function renderCronogramaSummary() {
  const total = DB.cronograma.reduce((s, r) => s + r.monto, 0);
  const pagado = DB.cronograma.filter(r => r.estado === 'PAGADO').reduce((s, r) => s + r.monto, 0);
  const pendiente = total - pagado;
  const el = document.getElementById('cronogramaSummary');
  if (!el) return;
  el.innerHTML = `
    <div class="summary-item"><div class="summary-item-label">TOTAL PROGRAMADO</div><div class="summary-item-value">${fmt(total)}</div></div>
    <div class="summary-item"><div class="summary-item-label">TOTAL PAGADO</div><div class="summary-item-value success">${fmt(pagado)}</div></div>
    <div class="summary-item"><div class="summary-item-label">PENDIENTE</div><div class="summary-item-value danger">${fmt(pendiente)}</div></div>
    <div class="summary-item"><div class="summary-item-label">N° PAGOS</div><div class="summary-item-value">${DB.cronograma.length}</div></div>
  `;
}

function badgeEstado(e) {
  const map = { PAGADO: 'badge-pagado', PENDIENTE: 'badge-pendiente', PARCIAL: 'badge-parcial', VENCIDO: 'badge-vencido' };
  return `<span class="badge ${map[e] || 'badge-pendiente'}">${e}</span>`;
}

// ===== MÓDULO: GASTOS ADICIONALES =====
function calcPendienteGasto() {
  const costo = parseFloat(document.getElementById('gastoCosto').value) || 0;
  const pagado = parseFloat(document.getElementById('gastoPagado').value) || 0;
  document.getElementById('gastoPendiente').value = Math.max(0, costo - pagado).toFixed(2);
}

function saveGasto() {
  const fechaCompra = document.getElementById('gastoFechaCompra').value;
  const descripcion = document.getElementById('gastoDescripcion').value.trim();
  const costo = parseFloat(document.getElementById('gastoCosto').value) || 0;
  const fechaPago = document.getElementById('gastoFechaPago').value;
  const pagado = parseFloat(document.getElementById('gastoPagado').value) || 0;
  const pendiente = Math.max(0, costo - pagado);

  if (!fechaCompra || !descripcion || !costo) {
    showToast('Complete: Fecha, Descripción y Costo', 'error'); return;
  }

  const editId = document.getElementById('editGastoId').value;
  if (editId) {
    const idx = DB.gastos.findIndex(r => r.id == editId);
    if (idx >= 0) DB.gastos[idx] = { ...DB.gastos[idx], fechaCompra, descripcion, costo, fechaPago, pagado, pendiente };
    showToast('Gasto actualizado', 'success');
  } else {
    DB.gastos.push({ id: nextId('gastos'), fechaCompra, descripcion, costo, fechaPago, pagado, pendiente });
    showToast('Gasto registrado', 'success');
  }
  closeModal('modalGasto');
  document.getElementById('editGastoId').value = '';
  document.getElementById('modalGastoTitle').textContent = 'REGISTRAR GASTO ADICIONAL';
  clearFormFields(['gastoFechaCompra','gastoDescripcion','gastoCosto','gastoFechaPago','gastoPagado','gastoPendiente']);
  scheduleSave('gastos');
  renderGastos();
  renderDashboard();
}

function editGasto(id) {
  const r = DB.gastos.find(x => x.id == id);
  if (!r) return;
  document.getElementById('editGastoId').value = id;
  document.getElementById('gastoFechaCompra').value = r.fechaCompra;
  document.getElementById('gastoDescripcion').value = r.descripcion;
  document.getElementById('gastoCosto').value = r.costo;
  document.getElementById('gastoFechaPago').value = r.fechaPago || '';
  document.getElementById('gastoPagado').value = r.pagado;
  document.getElementById('gastoPendiente').value = r.pendiente;
  document.getElementById('modalGastoTitle').textContent = 'EDITAR GASTO';
  openModal('modalGasto');
}

function deleteGasto(id) {
  confirmDelete('¿Eliminar este gasto adicional?', async () => {
    DB.gastos = DB.gastos.filter(x => x.id != id);
    await saveToStorage('gastos');
    renderGastos();
    renderDashboard();
    showToast('Registro eliminado', 'warn');
  });
}

function renderGastos() {
  const tbody = document.querySelector('#tblGastos tbody');
  if (!tbody) return;
  if (!DB.gastos.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Sin gastos adicionales registrados.</td></tr>';
    renderGastosSummary();
    return;
  }
  tbody.innerHTML = DB.gastos.map((r, i) => `
    <tr>
      <td class="num-cell">${i + 1}</td>
      <td>${fmtDate(r.fechaCompra)}</td>
      <td>${r.descripcion}</td>
      <td class="num-cell">${fmt(r.costo)}</td>
      <td>${fmtDate(r.fechaPago)}</td>
      <td class="num-cell">${fmt(r.pagado)}</td>
      <td class="num-cell" style="color:${r.pendiente > 0 ? 'var(--danger)' : 'var(--success)'}">${fmt(r.pendiente)}</td>
      <td><div class="tbl-actions">
        <button class="btn-edit btn-sm" onclick="editGasto(${r.id})">✏ Editar</button>
        <button class="btn-del btn-sm" onclick="deleteGasto(${r.id})">✕ Eliminar</button>
      </div></td>
    </tr>`).join('');
  renderGastosSummary();
}

function renderGastosSummary() {
  const total = DB.gastos.reduce((s, r) => s + r.costo, 0);
  const pagado = DB.gastos.reduce((s, r) => s + r.pagado, 0);
  const pendiente = total - pagado;
  const el = document.getElementById('gastosSummary');
  if (!el) return;
  el.innerHTML = `
    <div class="summary-item"><div class="summary-item-label">TOTAL GASTOS</div><div class="summary-item-value">${fmt(total)}</div></div>
    <div class="summary-item"><div class="summary-item-label">PAGADO</div><div class="summary-item-value success">${fmt(pagado)}</div></div>
    <div class="summary-item"><div class="summary-item-label">PENDIENTE</div><div class="summary-item-value danger">${fmt(pendiente)}</div></div>
    <div class="summary-item"><div class="summary-item-label">N° GASTOS</div><div class="summary-item-value">${DB.gastos.length}</div></div>
  `;
}

// ===== MÓDULO: DESPACHO DE MATERIALES =====
function calcCostoDespacho() {
  const cant = parseFloat(document.getElementById('despCantidad').value) || 0;
  const unit = parseFloat(document.getElementById('despCostoUnit').value) || 0;
  document.getElementById('despCostoTotal').value = (cant * unit).toFixed(2);
}

function saveDespacho() {
  const fecha = document.getElementById('despFecha').value;
  const guia = document.getElementById('despGuia').value.trim();
  const material = document.getElementById('despMaterial').value.trim();
  const unidad = document.getElementById('despUnidad').value.trim();
  const cantidad = parseFloat(document.getElementById('despCantidad').value) || 0;
  const costoUnit = parseFloat(document.getElementById('despCostoUnit').value) || 0;
  const costoTotal = cantidad * costoUnit;
  const responsable = document.getElementById('despResponsable').value.trim();
  const obs = document.getElementById('despObs').value.trim();

  if (!fecha || !material || !cantidad) {
    showToast('Complete: Fecha, Material y Cantidad', 'error'); return;
  }

  const editId = document.getElementById('editDespachoId').value;
  if (editId) {
    const idx = DB.despacho.findIndex(r => r.id == editId);
    if (idx >= 0) DB.despacho[idx] = { ...DB.despacho[idx], fecha, guia, material, unidad, cantidad, costoUnit, costoTotal, responsable, obs };
    showToast('Despacho actualizado', 'success');
  } else {
    DB.despacho.push({ id: nextId('despacho'), fecha, guia, material, unidad, cantidad, costoUnit, costoTotal, responsable, obs });
    showToast('Despacho registrado', 'success');
  }
  closeModal('modalDespacho');
  document.getElementById('editDespachoId').value = '';
  document.getElementById('modalDespachoTitle').textContent = 'REGISTRAR DESPACHO';
  clearFormFields(['despFecha','despGuia','despMaterial','despUnidad','despCantidad','despCostoUnit','despCostoTotal','despResponsable','despObs']);
  scheduleSave('despacho');
  renderDespacho();
  renderDashboard();
}

function editDespacho(id) {
  const r = DB.despacho.find(x => x.id == id);
  if (!r) return;
  document.getElementById('editDespachoId').value = id;
  document.getElementById('despFecha').value = r.fecha;
  document.getElementById('despGuia').value = r.guia || '';
  document.getElementById('despMaterial').value = r.material;
  document.getElementById('despUnidad').value = r.unidad || '';
  document.getElementById('despCantidad').value = r.cantidad;
  document.getElementById('despCostoUnit').value = r.costoUnit;
  document.getElementById('despCostoTotal').value = r.costoTotal;
  document.getElementById('despResponsable').value = r.responsable || '';
  document.getElementById('despObs').value = r.obs || '';
  document.getElementById('modalDespachoTitle').textContent = 'EDITAR DESPACHO';
  openModal('modalDespacho');
}

function deleteDespacho(id) {
  confirmDelete('¿Eliminar este despacho de material?', async () => {
    DB.despacho = DB.despacho.filter(x => x.id != id);
    await saveToStorage('despacho');
    renderDespacho();
    renderDashboard();
    showToast('Registro eliminado', 'warn');
  });
}

function renderDespacho(data) {
  const rows = data || DB.despacho;
  const tbody = document.querySelector('#tblDespacho tbody');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="11">Sin despachos registrados.</td></tr>';
    renderDespachoSummary();
    return;
  }
  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td class="num-cell">${i + 1}</td>
      <td>${fmtDate(r.fecha)}</td>
      <td><span style="font-family:var(--font-mono);font-size:11px">${r.guia || '-'}</span></td>
      <td><strong>${r.material}</strong></td>
      <td>${r.unidad || '-'}</td>
      <td class="num-cell">${fmtN(r.cantidad)}</td>
      <td class="num-cell">${fmt(r.costoUnit)}</td>
      <td class="num-cell"><strong>${fmt(r.costoTotal)}</strong></td>
      <td>${r.responsable || '-'}</td>
      <td style="max-width:160px;font-size:11px">${r.obs || '-'}</td>
      <td><div class="tbl-actions">
        <button class="btn-edit btn-sm" onclick="editDespacho(${r.id})">✏ Editar</button>
        <button class="btn-del btn-sm" onclick="deleteDespacho(${r.id})">✕ Eliminar</button>
      </div></td>
    </tr>`).join('');
  renderDespachoSummary();
}

function renderDespachoSummary() {
  const total = DB.despacho.reduce((s, r) => s + r.costoTotal, 0);
  const cant = DB.despacho.length;
  const mats = [...new Set(DB.despacho.map(r => r.material))].length;
  const el = document.getElementById('despachoSummary');
  if (!el) return;
  el.innerHTML = `
    <div class="summary-item"><div class="summary-item-label">COSTO TOTAL</div><div class="summary-item-value">${fmt(total)}</div></div>
    <div class="summary-item"><div class="summary-item-label">N° DESPACHOS</div><div class="summary-item-value">${cant}</div></div>
    <div class="summary-item"><div class="summary-item-label">TIPOS DE MATERIAL</div><div class="summary-item-value">${mats}</div></div>
  `;
}

function filterTable(module) {
  if (module === 'despacho') {
    const q = document.getElementById('filterDespacho').value.toLowerCase();
    const d1 = document.getElementById('filterDespachoFecha1').value;
    const d2 = document.getElementById('filterDespachoFecha2').value;
    let filtered = DB.despacho.filter(r => {
      const matchText = !q || r.material.toLowerCase().includes(q) || (r.guia || '').toLowerCase().includes(q) || (r.responsable || '').toLowerCase().includes(q);
      const matchD1 = !d1 || r.fecha >= d1;
      const matchD2 = !d2 || r.fecha <= d2;
      return matchText && matchD1 && matchD2;
    });
    renderDespacho(filtered);
  }
  if (module === 'presupuesto') {
    const q = document.getElementById('filterPresupuesto').value.toLowerCase();
    const piso = document.getElementById('filterPresupuestoPiso').value;
    const etapa = document.getElementById('filterPresupuestoEtapa').value;
    let filtered = DB.presupuesto.filter(r => {
      const matchQ = !q || r.material.toLowerCase().includes(q) || r.etapa.toLowerCase().includes(q) || r.piso.toLowerCase().includes(q);
      const matchP = !piso || r.piso === piso;
      const matchE = !etapa || r.etapa === etapa;
      return matchQ && matchP && matchE;
    });
    renderPresupuestoFiltered(filtered);
  }
}

// ===== MÓDULO: BALANCE DE MATERIALES =====
function getBalanceMateriales() {
  const map = {};
  DB.despacho.forEach(r => {
    if (!map[r.material]) map[r.material] = { material: r.material, unidad: r.unidad || '', cantTotal: 0, costoSum: 0, count: 0 };
    map[r.material].cantTotal += r.cantidad;
    map[r.material].costoSum += r.costoTotal;
    map[r.material].count++;
  });
  const totalCosto = Object.values(map).reduce((s, m) => s + m.costoSum, 0);
  return Object.values(map).map(m => ({
    ...m,
    costoUnitProm: m.cantTotal > 0 ? m.costoSum / m.cantTotal : 0,
    pct: totalCosto > 0 ? (m.costoSum / totalCosto * 100) : 0
  })).sort((a, b) => b.costoSum - a.costoSum);
}

function renderBalance() {
  const data = getBalanceMateriales();
  const tbody = document.querySelector('#tblBalance tbody');
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Sin datos. Registre despachos de materiales primero.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map((r, i) => `
    <tr>
      <td class="num-cell">${i + 1}</td>
      <td><strong>${r.material}</strong></td>
      <td>${r.unidad}</td>
      <td class="num-cell">${fmtN(r.cantTotal)}</td>
      <td class="num-cell">${fmt(r.costoUnitProm)}</td>
      <td class="num-cell"><strong>${fmt(r.costoSum)}</strong></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="progress-bar-wrap" style="flex:1;min-width:60px">
            <div class="progress-bar-fill" style="width:${Math.min(r.pct, 100)}%"></div>
          </div>
          <span style="font-family:var(--font-mono);font-size:11px">${r.pct.toFixed(1)}%</span>
        </div>
      </td>
    </tr>`).join('');
}

// ===== MÓDULO: PRESUPUESTO DE MATERIALES =====
function calcValorPresupuesto() {
  const cant = parseFloat(document.getElementById('presupCantidad').value) || 0;
  const unit = parseFloat(document.getElementById('presupCostoUnit').value) || 0;
  document.getElementById('presupValor').value = (cant * unit).toFixed(2);
}

function savePresupuesto() {
  const piso = document.getElementById('presupPiso').value.trim();
  const etapa = document.getElementById('presupEtapa').value.trim();
  const categoria = document.getElementById('presupCategoria').value.trim();
  const material = document.getElementById('presupMaterial').value.trim();
  const unidad = document.getElementById('presupUnidad').value.trim();
  const cantidad = parseFloat(document.getElementById('presupCantidad').value) || 0;
  const costoUnit = parseFloat(document.getElementById('presupCostoUnit').value) || 0;
  const valor = cantidad * costoUnit;

  if (!material || !cantidad) {
    showToast('Complete: Material y Cantidad', 'error'); return;
  }

  const editId = document.getElementById('editPresupuestoId').value;
  if (editId) {
    const idx = DB.presupuesto.findIndex(r => r.id == editId);
    if (idx >= 0) DB.presupuesto[idx] = { ...DB.presupuesto[idx], piso, etapa, categoria, material, unidad, cantidad, costoUnit, valor };
    showToast('Material actualizado', 'success');
  } else {
    DB.presupuesto.push({ id: nextId('presupuesto'), piso, etapa, categoria, material, unidad, cantidad, costoUnit, valor });
    showToast('Material agregado al presupuesto', 'success');
  }
  closeModal('modalPresupuesto');
  document.getElementById('editPresupuestoId').value = '';
  document.getElementById('modalPresupuestoTitle').textContent = 'AGREGAR MATERIAL AL PRESUPUESTO';
  clearFormFields(['presupPiso','presupEtapa','presupCategoria','presupMaterial','presupUnidad','presupCantidad','presupCostoUnit','presupValor']);
  scheduleSave('presupuesto');
  renderPresupuesto();
  updatePresupuestoFilters();
}

function editPresupuesto(id) {
  const r = DB.presupuesto.find(x => x.id == id);
  if (!r) return;
  document.getElementById('editPresupuestoId').value = id;
  document.getElementById('presupPiso').value = r.piso || '';
  document.getElementById('presupEtapa').value = r.etapa || '';
  document.getElementById('presupCategoria').value = r.categoria || '';
  document.getElementById('presupMaterial').value = r.material;
  document.getElementById('presupUnidad').value = r.unidad || '';
  document.getElementById('presupCantidad').value = r.cantidad;
  document.getElementById('presupCostoUnit').value = r.costoUnit;
  document.getElementById('presupValor').value = r.valor;
  document.getElementById('modalPresupuestoTitle').textContent = 'EDITAR MATERIAL';
  openModal('modalPresupuesto');
}

function deletePresupuesto(id) {
  confirmDelete('¿Eliminar este material del presupuesto?', async () => {
    DB.presupuesto = DB.presupuesto.filter(x => x.id != id);
    await saveToStorage('presupuesto');
    renderPresupuesto();
    showToast('Registro eliminado', 'warn');
  });
}

function renderPresupuesto(data) {
  renderPresupuestoFiltered(data || DB.presupuesto);
}

function renderPresupuestoFiltered(data) {
  const tbody = document.querySelector('#tblPresupuesto tbody');
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="10">Sin materiales en el presupuesto.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map((r, i) => `
    <tr>
      <td class="num-cell">${i + 1}</td>
      <td>${r.piso || '-'}</td>
      <td>${r.etapa || '-'}</td>
      <td>${r.categoria || '-'}</td>
      <td><strong>${r.material}</strong></td>
      <td>${r.unidad || '-'}</td>
      <td class="num-cell">${fmtN(r.cantidad)}</td>
      <td class="num-cell">${fmt(r.costoUnit)}</td>
      <td class="num-cell"><strong>${fmt(r.valor)}</strong></td>
      <td><div class="tbl-actions">
        <button class="btn-edit btn-sm" onclick="editPresupuesto(${r.id})">✏ Editar</button>
        <button class="btn-del btn-sm" onclick="deletePresupuesto(${r.id})">✕ Eliminar</button>
      </div></td>
    </tr>`).join('');
}

function updatePresupuestoFilters() {
  const pisos = [...new Set(DB.presupuesto.map(r => r.piso).filter(Boolean))];
  const etapas = [...new Set(DB.presupuesto.map(r => r.etapa).filter(Boolean))];
  const selPiso = document.getElementById('filterPresupuestoPiso');
  const selEtapa = document.getElementById('filterPresupuestoEtapa');
  if (!selPiso || !selEtapa) return;
  const curPiso = selPiso.value;
  const curEtapa = selEtapa.value;
  selPiso.innerHTML = '<option value="">Todos los pisos</option>' + pisos.map(p => `<option ${p===curPiso?'selected':''} value="${p}">${p}</option>`).join('');
  selEtapa.innerHTML = '<option value="">Todas las etapas</option>' + etapas.map(e => `<option ${e===curEtapa?'selected':''} value="${e}">${e}</option>`).join('');
}

// ===== MÓDULO: ANÁLISIS DE DESVIACIONES =====
function getDesviaciones() {
  const balance = getBalanceMateriales();
  const balMap = {};
  balance.forEach(b => { balMap[b.material] = b; });
  const presMap = {};
  DB.presupuesto.forEach(p => {
    if (!presMap[p.material]) presMap[p.material] = { material: p.material, unidad: p.unidad, cantEst: 0, valorEst: 0 };
    presMap[p.material].cantEst += p.cantidad;
    presMap[p.material].valorEst += p.valor;
  });
  const allMats = new Set([...Object.keys(presMap), ...Object.keys(balMap)]);
  return [...allMats].map(mat => {
    const pres = presMap[mat] || { cantEst: 0, valorEst: 0, unidad: balMap[mat]?.unidad || '-' };
    const real = balMap[mat] || { cantTotal: 0, costoSum: 0 };
    const devCant = real.cantTotal - pres.cantEst;
    const pctDev = pres.cantEst > 0 ? (devCant / pres.cantEst * 100) : (real.cantTotal > 0 ? 100 : 0);
    const devEco = real.costoSum - pres.valorEst;
    let estado = 'ok';
    if (Math.abs(pctDev) > 20) estado = 'sobre';
    else if (Math.abs(pctDev) > 10) estado = 'parcial';
    return { mat, unidad: pres.unidad, cantEst: pres.cantEst, cantReal: real.cantTotal, devCant, pctDev, valorEst: pres.valorEst, valorReal: real.costoSum, devEco, estado, sobreconsumo: devEco > 0 };
  });
}

function renderDesviaciones() {
  const data = getDesviaciones();
  const tbody = document.querySelector('#tblDesviaciones tbody');
  if (!tbody) return;
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="10">Sin datos. Registre presupuesto y despachos.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(r => {
    const rowClass = r.devEco > 0 ? 'row-sobre' : r.devEco < 0 ? 'row-sub' : 'row-ok';
    const estadoHtml = r.devEco > 0
      ? '<span class="badge badge-sobre">SOBRE COSTO</span>'
      : r.devEco < 0
      ? '<span class="badge badge-sub">AHORRO</span>'
      : '<span class="badge badge-ok">EN ESTÁNDAR</span>';
    const pctColor = Math.abs(r.pctDev) > 20 ? 'var(--danger)' : Math.abs(r.pctDev) > 10 ? 'var(--warn)' : 'var(--success)';
    return `<tr class="${rowClass}">
      <td><strong>${r.mat}</strong></td>
      <td>${r.unidad}</td>
      <td class="num-cell">${fmtN(r.cantEst)}</td>
      <td class="num-cell">${fmtN(r.cantReal)}</td>
      <td class="num-cell" style="color:${r.devCant > 0 ? 'var(--danger)' : 'var(--success)'}">${r.devCant >= 0 ? '+' : ''}${fmtN(r.devCant)}</td>
      <td class="num-cell" style="color:${pctColor}">${r.pctDev >= 0 ? '+' : ''}${r.pctDev.toFixed(1)}%</td>
      <td class="num-cell">${fmt(r.valorEst)}</td>
      <td class="num-cell">${fmt(r.valorReal)}</td>
      <td class="num-cell" style="color:${r.devEco > 0 ? 'var(--danger)' : 'var(--success)'}"><strong>${r.devEco >= 0 ? '+' : ''}${fmt(r.devEco)}</strong></td>
      <td>${estadoHtml}</td>
    </tr>`;
  }).join('');
}

// ===== MÓDULO: SOBRE/SUB ESTÁNDAR =====
function renderEstandar() {
  const data = getDesviaciones();
  const tbody = document.querySelector('#tblEstandar tbody');
  if (!tbody) return;
  let sobreTotal = 0, subTotal = 0;
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Sin datos disponibles.</td></tr>';
  } else {
    tbody.innerHTML = data.map(r => {
      if (r.devEco > 0) sobreTotal += r.devEco;
      else subTotal += Math.abs(r.devEco);
      const tipo = r.devEco > 0 ? '<span class="badge badge-sobre">SOBRECONSUMO</span>' : r.devEco < 0 ? '<span class="badge badge-sub">SUBCONSUMO</span>' : '<span class="badge badge-ok">NORMAL</span>';
      const estadoClass = Math.abs(r.pctDev) > 20 ? 'estado-red' : Math.abs(r.pctDev) > 10 ? 'estado-yellow' : 'estado-green';
      const estadoTxt = Math.abs(r.pctDev) > 20 ? '● CRÍTICO' : Math.abs(r.pctDev) > 10 ? '● MODERADO' : '● ÓPTIMO';
      return `<tr class="${r.devEco > 0 ? 'row-sobre' : r.devEco < 0 ? 'row-sub' : 'row-ok'}">
        <td><strong>${r.mat}</strong></td>
        <td class="num-cell">${fmt(r.valorEst)}</td>
        <td class="num-cell">${fmt(r.valorReal)}</td>
        <td class="num-cell" style="color:${r.devEco > 0 ? 'var(--danger)' : 'var(--success)'}"><strong>${r.devEco >= 0 ? '+' : ''}${fmt(r.devEco)}</strong></td>
        <td class="num-cell">${r.pctDev >= 0 ? '+' : ''}${r.pctDev.toFixed(1)}%</td>
        <td>${tipo}</td>
        <td><span class="${estadoClass}">${estadoTxt}</span></td>
      </tr>`;
    }).join('');
  }
  const neta = sobreTotal - subTotal;
  const totalEst = data.reduce((s, r) => s + r.valorEst, 0);
  const eficiencia = totalEst > 0 ? Math.max(0, 100 - (sobreTotal / totalEst * 100)) : 100;
  document.getElementById('estandar-sobre').textContent = fmt(sobreTotal);
  document.getElementById('estandar-sub').textContent = fmt(subTotal);
  document.getElementById('estandar-neta').textContent = (neta >= 0 ? '+' : '') + fmt(neta);
  document.getElementById('estandar-neta').style.color = neta > 0 ? 'var(--danger)' : 'var(--success)';
  document.getElementById('estandar-eficiencia').textContent = eficiencia.toFixed(1) + '%';
  document.getElementById('estandar-eficiencia').style.color = eficiencia >= 90 ? 'var(--success)' : eficiencia >= 70 ? 'var(--warn)' : 'var(--danger)';
}

// ===== DASHBOARD =====
function renderDashboard() {
  const totalCrono = DB.cronograma.reduce((s, r) => s + r.monto, 0);
  const totalGastos = DB.gastos.reduce((s, r) => s + r.costo, 0);
  const totalMats = DB.despacho.reduce((s, r) => s + r.costoTotal, 0);
  const totalPagado = DB.cronograma.filter(r => r.estado === 'PAGADO').reduce((s, r) => s + r.monto, 0);
  const totalGastosPag = DB.gastos.reduce((s, r) => s + r.pagado, 0);
  const pendienteCrono = totalCrono - totalPagado;
  const pendienteGastos = DB.gastos.reduce((s, r) => s + r.pendiente, 0);
  const totalReal = totalMats + totalGastos;
  const presupuestoBase = DB.obra?.presupuesto || DB.presupuesto.reduce((s, r) => s + r.valor, 0);
  const desviacion = totalReal - presupuestoBase;
  const avance = totalCrono > 0 ? Math.min(100, (totalPagado / totalCrono * 100)) : 0;

  document.getElementById('kpi-presupuesto').textContent = fmt(presupuestoBase);
  document.getElementById('kpi-real').textContent = fmt(totalReal);
  document.getElementById('kpi-pendiente').textContent = fmt(pendienteCrono + pendienteGastos);
  document.getElementById('kpi-avance').textContent = avance.toFixed(1) + '%';
  document.getElementById('kpi-materiales').textContent = fmt(totalMats);
  document.getElementById('kpi-desviacion').textContent = (desviacion >= 0 ? '+' : '') + fmt(desviacion);
  document.getElementById('kpi-desviacion').style.color = desviacion > 0 ? 'var(--danger)' : 'var(--success)';

  // Últimos pagos
  const tbody = document.querySelector('#tblUltimosPagos tbody');
  if (tbody) {
    const recientes = [...DB.cronograma].sort((a, b) => b.fecha?.localeCompare(a.fecha)).slice(0, 5);
    tbody.innerHTML = recientes.length ? recientes.map(r => `
      <tr>
        <td>${r.etapa}</td>
        <td>${fmtDate(r.fecha)}</td>
        <td class="num-cell">${fmt(r.monto)}</td>
        <td>${badgeEstado(r.estado)}</td>
      </tr>`).join('') : '<tr class="empty-row"><td colspan="4">Sin pagos registrados</td></tr>';
  }

  renderAlertas();
  renderCharts(totalMats, totalGastos, pendienteCrono, presupuestoBase, totalReal, avance);
}

function renderAlertas() {
  const alerts = [];
  // Pagos vencidos
  const hoy = new Date().toISOString().split('T')[0];
  DB.cronograma.forEach(r => {
    if (r.estado === 'PENDIENTE' && r.fecha < hoy) {
      alerts.push({ tipo: 'danger', ico: '⚠', msg: `Pago vencido: ${r.etapa} — ${fmt(r.monto)} (${fmtDate(r.fecha)})` });
    }
  });
  // Sobre costos
  const devs = getDesviaciones();
  devs.filter(d => d.pctDev > 20).forEach(d => {
    alerts.push({ tipo: 'warn', ico: '↑', msg: `Sobreconsumo: ${d.mat} — +${d.pctDev.toFixed(1)}% sobre estándar` });
  });
  // Positivos
  if (!alerts.length) {
    alerts.push({ tipo: 'success', ico: '✓', msg: 'Sin alertas activas. La obra está dentro de parámetros.' });
  }
  const el = document.getElementById('alertasContainer');
  if (!el) return;
  el.innerHTML = alerts.map(a => `
    <div class="alert-item alert-${a.tipo}">
      <span class="alert-icon">${a.ico}</span>
      <span>${a.msg}</span>
    </div>`).join('');
}

function renderCharts(matsCosto, gastosCosto, pendienteCrono, presupuesto, real, avance) {
  // Chart 1: Avance Financiero
  if (charts.financiero) charts.financiero.destroy();
  const ctx1 = document.getElementById('chartFinanciero');
  if (ctx1) {
    charts.financiero = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: ['Presupuesto', 'Gasto Real', 'Materiales', 'Gastos Extra', 'Pendiente'],
        datasets: [{
          data: [presupuesto, real, matsCosto, gastosCosto, pendienteCrono],
          backgroundColor: ['#0084c8','#d73a49','#e8a000','#7c3aed','#10b981'],
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { callback: v => 'S/' + v.toLocaleString('es-PE') }, grid: { color: '#f0f0f0' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Chart 2: Distribución de gastos (doughnut)
  if (charts.distribucion) charts.distribucion.destroy();
  const ctx2 = document.getElementById('chartDistribucion');
  if (ctx2) {
    charts.distribucion = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['Materiales', 'Gastos Adicionales', 'Pendiente Pagos'],
        datasets: [{
          data: [matsCosto, gastosCosto, pendienteCrono],
          backgroundColor: ['#0084c8','#e8a000','#d73a49'],
          hoverOffset: 6
        }]
      },
      options: {
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
        cutout: '60%'
      }
    });
  }

  // Chart 3: Top materiales
  if (charts.materiales) charts.materiales.destroy();
  const ctx3 = document.getElementById('chartMateriales');
  if (ctx3) {
    const top = getBalanceMateriales().slice(0, 6);
    charts.materiales = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: top.map(m => m.material.substring(0, 12)),
        datasets: [{
          data: top.map(m => m.costoSum),
          backgroundColor: '#0084c8',
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { callback: v => 'S/' + v.toLocaleString('es-PE'), font: { size: 10 } }, grid: { color: '#f0f0f0' } },
          y: { ticks: { font: { size: 11 } }, grid: { display: false } }
        }
      }
    });
  }
}

// ===== MÓDULO: LIMPIAR =====
function clearModule(key) {
  const names = { cronograma: 'Cronograma de Pagos', gastos: 'Gastos Adicionales', despacho: 'Despacho de Materiales', presupuesto: 'Presupuesto de Materiales' };
  confirmDelete(`¿Eliminar TODOS los registros de ${names[key]}? Esta acción no se puede deshacer.`, async () => {
    DB[key] = [];
    await saveToStorage(key);
    renderAll();
    showToast('Todos los registros han sido eliminados', 'warn');
  });
}

// ===== EXPORTAR A EXCEL =====
function exportToExcel(module) {
  let data = [], headers = [], name = module;
  if (module === 'cronograma') {
    headers = ['#','Etapa','Fecha Pago','Monto','Estado','Observaciones'];
    data = DB.cronograma.map((r, i) => [i+1, r.etapa, fmtDate(r.fecha), r.monto, r.estado, r.obs || '']);
    name = 'Cronograma_Pagos';
  } else if (module === 'gastos') {
    headers = ['#','Fecha Compra','Descripción','Costo Total','Fecha Pago','Monto Pagado','Pendiente'];
    data = DB.gastos.map((r, i) => [i+1, fmtDate(r.fechaCompra), r.descripcion, r.costo, fmtDate(r.fechaPago), r.pagado, r.pendiente]);
    name = 'Gastos_Adicionales';
  } else if (module === 'despacho') {
    headers = ['#','Fecha','N° Guía','Material','Unidad','Cantidad','Costo Unit.','Costo Total','Responsable','Observaciones'];
    data = DB.despacho.map((r, i) => [i+1, fmtDate(r.fecha), r.guia, r.material, r.unidad, r.cantidad, r.costoUnit, r.costoTotal, r.responsable, r.obs || '']);
    name = 'Despacho_Materiales';
  } else if (module === 'balance') {
    const bal = getBalanceMateriales();
    headers = ['#','Material','Unidad','Cant. Total','Costo Unit. Prom.','Costo Acumulado','% del Total'];
    data = bal.map((r, i) => [i+1, r.material, r.unidad, r.cantTotal, r.costoUnitProm.toFixed(2), r.costoSum.toFixed(2), r.pct.toFixed(1) + '%']);
    name = 'Balance_Materiales';
  } else if (module === 'presupuesto') {
    headers = ['#','Piso','Etapa','Categoría','Material','Unidad','Cant. Estándar','Costo Unit.','Valor Estándar'];
    data = DB.presupuesto.map((r, i) => [i+1, r.piso, r.etapa, r.categoria, r.material, r.unidad, r.cantidad, r.costoUnit, r.valor]);
    name = 'Presupuesto_Materiales';
  } else if (module === 'desviaciones' || module === 'estandar') {
    const dev = getDesviaciones();
    headers = ['Material','Unidad','Cant. Estándar','Cant. Real','Dev. Cantidad','% Dev.','Val. Estándar','Val. Real','Dev. Económica','Estado'];
    data = dev.map(r => [r.mat, r.unidad, r.cantEst, r.cantReal, r.devCant.toFixed(2), r.pctDev.toFixed(1)+'%', r.valorEst.toFixed(2), r.valorReal.toFixed(2), r.devEco.toFixed(2), r.devEco > 0 ? 'SOBRE COSTO' : r.devEco < 0 ? 'AHORRO' : 'EN ESTÁNDAR']);
    name = module === 'desviaciones' ? 'Analisis_Desviaciones' : 'Control_Estandar';
  }
  if (!data.length) { showToast('Sin datos para exportar', 'warn'); return; }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  XLSX.utils.book_append_sheet(wb, ws, name.replace(/_/g, ' '));
  XLSX.writeFile(wb, `CONSTROL_${name}_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('Archivo Excel exportado correctamente', 'success');
}

function exportDashboard() {
  const wb = XLSX.utils.book_new();
  // Sheet 1: Resumen
  const totalMats = DB.despacho.reduce((s, r) => s + r.costoTotal, 0);
  const totalGastos = DB.gastos.reduce((s, r) => s + r.costo, 0);
  const pagado = DB.cronograma.filter(r => r.estado === 'PAGADO').reduce((s, r) => s + r.monto, 0);
  const presupuesto = DB.obra?.presupuesto || DB.presupuesto.reduce((s, r) => s + r.valor, 0);
  const resumen = [
    ['CONSTROL — REPORTE GENERAL DE OBRA'],
    ['Obra:', DB.obra?.nombre || '-'],
    ['Responsable:', DB.obra?.responsable || '-'],
    ['Fecha Reporte:', new Date().toLocaleDateString('es-PE')],
    [],
    ['INDICADOR', 'VALOR'],
    ['Presupuesto Base', presupuesto],
    ['Gasto Real Total', totalMats + totalGastos],
    ['Materiales Despachados', totalMats],
    ['Gastos Adicionales', totalGastos],
    ['Total Pagado (Cronograma)', pagado],
    ['Desviación', (totalMats + totalGastos) - presupuesto],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen');
  XLSX.writeFile(wb, `CONSTROL_Reporte_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('Reporte exportado correctamente', 'success');
}

// ===== UTILS =====
function clearFormFields(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}
