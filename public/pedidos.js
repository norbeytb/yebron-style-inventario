// pedidos.js — pestañas "Bajo pedido" y "Bodegas". Usa los helpers de
// index.html (money, esc, fmtDate, todayISO, guardar, showConfirm...).

let pedidos = [];
let bodegas = [];
let pedPagos = [];
let pedFiltro = { estado: '', bodega: '', texto: '' };
const ESTADOS_PED = [['pedido','Pedido'],['comprado','Comprado'],['enviado','Enviado'],['entregado','Entregado'],['cancelado','Cancelado']];
const NUEVA = '__nueva__';

async function cargarPedidosDatos() {
  const d = await Api.cargarPedidos();
  pedidos = d.pedidos; bodegas = d.bodegas; pedPagos = d.pagos;
}

function pedResta(p) { return p.estado === 'cancelado' ? 0 : Math.max(p.venta - p.pagado, 0); }
function pedGanancia(p) { return p.estado === 'cancelado' ? 0 : p.venta - p.costo - p.envio; }

function opcionesBodega(sel) {
  const act = bodegas.filter(b => b.activa);
  const fr = act.filter(b => b.frecuente), otras = act.filter(b => !b.frecuente);
  const o = (b) => `<option value="${b.id}" ${String(sel) === String(b.id) ? 'selected' : ''}>${esc(b.nombre)}</option>`;
  return `<option value="">— elegir —</option>${fr.map(o).join('')}${otras.length ? `<optgroup label="Otras">${otras.map(o).join('')}</optgroup>` : ''}<option value="${NUEVA}">➕ Otra bodega (agregar nueva)…</option>`;
}

function renderPedidos() {
  const el = document.getElementById('tab-pedidos');
  if (!el) return;
  const q = pedFiltro.texto.toLowerCase();
  const lista = pedidos.filter(p =>
    (!pedFiltro.estado || p.estado === pedFiltro.estado) &&
    (!pedFiltro.bodega || String(p.bodegaId) === pedFiltro.bodega) &&
    (!q || (p.cliente + ' ' + p.referencia).toLowerCase().includes(q)));
  const activos = pedidos.filter(p => p.estado !== 'cancelado');
  const porCobrar = activos.reduce((s, p) => s + pedResta(p), 0);
  const ganancia = activos.reduce((s, p) => s + pedGanancia(p), 0);
  const porComprar = pedidos.filter(p => p.estado === 'pedido').length;

  el.innerHTML = `
    <div class="grid-cards">
      <div class="stat"><div class="label">Por comprar a bodega</div><div class="value">${porComprar}</div></div>
      <div class="stat neg"><div class="label">Por cobrar</div><div class="value">${money(porCobrar)}</div></div>
      <div class="stat"><div class="label">Ganancia (bajo pedido)</div><div class="value">${money(ganancia)}</div></div>
    </div>
    <div class="panel">
      <h2>Nuevo pedido</h2>
      <form id="formPedido" class="grid-form">
        <div><label>Fecha</label><input type="date" name="fecha" value="${todayISO()}" required></div>
        <div><label>Cliente</label><input type="text" name="cliente" required></div>
        <div><label>Bodega</label><select name="bodega">${opcionesBodega('')}</select>
          <input type="text" name="bodegaNueva" placeholder="Nombre de la nueva bodega" style="display:none;margin-top:6px"></div>
        <div><label>Modelo / referencia</label><input type="text" name="referencia" placeholder="Nike Zoom rosados"></div>
        <div><label>Talla</label><input type="text" name="talla" placeholder="EUR 37"></div>
        <div><label>Unidades</label><input type="number" name="unidades" min="1" value="1"></div>
        <div><label>Precio de venta</label><input type="number" name="venta" min="0"></div>
        <div><label>Costo (bodega)</label><input type="number" name="costo" min="0"></div>
        <div><label>Envío</label><input type="number" name="envio" min="0"></div>
        <div><label>Abono inicial</label><input type="number" name="abono" min="0"></div>
        <div><button class="btn" type="submit">Agregar pedido</button></div>
      </form>
    </div>
    <div class="panel">
      <h2>Pedidos (${lista.length})</h2>
      <div class="grid-form">
        <div><select id="pfEstado"><option value="">Todos los estados</option>${ESTADOS_PED.map(([v,l]) => `<option value="${v}" ${pedFiltro.estado===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div><select id="pfBodega"><option value="">Todas las bodegas</option>${bodegas.map(b => `<option value="${b.id}" ${pedFiltro.bodega===String(b.id)?'selected':''}>${esc(b.nombre)}</option>`).join('')}</select></div>
        <div><input type="text" id="pfTexto" placeholder="Buscar cliente o modelo" value="${esc(pedFiltro.texto)}"></div>
      </div>
      ${lista.length ? `<div class="table-scroll"><table>
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Modelo</th><th>Talla</th><th>Bodega</th><th>Venta</th><th>Debe</th><th>Estado</th><th></th></tr></thead>
        <tbody>${lista.map(p => `<tr>
          <td>${fmtDate(p.fecha)}</td><td>${esc(p.cliente)}</td><td>${esc(p.referencia) || '—'}${p.unidades > 1 ? ' ×' + p.unidades : ''}</td>
          <td>${esc(p.talla) || '—'}</td><td>${esc(p.bodega) || '—'}</td><td>${money(p.venta)}</td>
          <td>${pedResta(p) ? money(pedResta(p)) : '✓'}</td>
          <td><select onchange="cambiarEstadoPedido(${p.id}, this.value)">${ESTADOS_PED.map(([v,l]) => `<option value="${v}" ${p.estado===v?'selected':''}>${l}</option>`).join('')}</select></td>
          <td>${pedResta(p) ? `<button class="btn small" onclick="abrirPagoPedido(${p.id})">Abonar</button> ` : ''}<button class="btn small danger" onclick="borrarPedido(${p.id})">✕</button></td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="empty">No hay pedidos con ese filtro.</div>'}
    </div>`;

  const f = document.getElementById('formPedido');
  f.bodega.addEventListener('change', () => { f.bodegaNueva.style.display = f.bodega.value === NUEVA ? 'block' : 'none'; if (f.bodega.value === NUEVA) f.bodegaNueva.focus(); });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nueva = f.bodega.value === NUEVA;
    if (nueva && !f.bodegaNueva.value.trim()) return showToast('Escribí el nombre de la nueva bodega.');
    await guardar(() => Api.crearPedido({
      fecha: f.fecha.value, cliente: f.cliente.value.trim(), bodegaId: nueva ? undefined : Number(f.bodega.value) || undefined,
      bodegaNueva: nueva ? f.bodegaNueva.value.trim() : undefined, referencia: f.referencia.value.trim(), talla: f.talla.value.trim(),
      unidades: Number(f.unidades.value) || 1, venta: Number(f.venta.value) || 0, costo: Number(f.costo.value) || 0,
      envio: Number(f.envio.value) || 0, abono: Number(f.abono.value) || 0,
    }), 'Pedido agregado');
  });
  const re = () => renderPedidos();
  document.getElementById('pfEstado').onchange = (e) => { pedFiltro.estado = e.target.value; re(); };
  document.getElementById('pfBodega').onchange = (e) => { pedFiltro.bodega = e.target.value; re(); };
  document.getElementById('pfTexto').onchange = (e) => { pedFiltro.texto = e.target.value; re(); };
}

function cambiarEstadoPedido(id, estado) { guardar(() => Api.estadoPedido(id, estado), 'Estado actualizado'); }
function borrarPedido(id) { showConfirm('¿Eliminar este pedido y sus abonos?', () => guardar(() => Api.eliminarPedido(id), 'Pedido eliminado')); }

function abrirPagoPedido(id) {
  const p = pedidos.find(x => x.id === id); if (!p) return;
  const resta = pedResta(p);
  const prev = pedPagos.filter(a => a.pedidoId === id);
  document.getElementById('modalRoot').innerHTML = `
    <div class="modal-overlay"><div class="modal">
      <h3>Abono — ${esc(p.cliente)}</h3>
      <p class="muted">${esc(p.referencia)} ${esc(p.talla)} · Venta ${money(p.venta)} · <strong style="color:var(--red)">Debe ${money(resta)}</strong></p>
      <form id="formPago">
        <div class="modal-row"><label>Fecha</label><input type="date" name="fecha" value="${todayISO()}" required></div>
        <div class="modal-row"><label>Monto</label><input type="number" name="monto" min="1" max="${resta}" value="${resta}" required></div>
        <div class="modal-row"><label>Nota</label><input type="text" name="nota"></div>
        ${prev.length ? `<div class="modal-row"><label>Abonos anteriores</label>${prev.map(a => `<div class="muted">${fmtDate(a.fecha)} · ${money(a.monto)} <a href="#" onclick="event.preventDefault();quitarPago(${a.id})">quitar</a></div>`).join('')}</div>` : ''}
        <div class="modal-actions"><button type="button" class="btn secondary" onclick="closeModal()">Cancelar</button><button class="btn" type="submit">Registrar</button></div>
      </form></div></div>`;
  document.getElementById('formPago').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    if (await guardar(() => Api.crearPago(id, Number(f.monto.value), f.fecha.value, f.nota.value.trim()), 'Abono registrado')) closeModal();
  });
}
async function quitarPago(id) { if (await guardar(() => Api.eliminarPago(id), 'Abono quitado')) closeModal(); }

function renderBodegas() {
  const el = document.getElementById('tab-bodegas');
  if (!el) return;
  const filas = bodegas.map(b => {
    const ps = pedidos.filter(p => p.bodegaId === b.id && p.estado !== 'cancelado');
    return { b, n: ps.length, costo: ps.reduce((s, p) => s + p.costo, 0), ganancia: ps.reduce((s, p) => s + pedGanancia(p), 0), cobrar: ps.reduce((s, p) => s + pedResta(p), 0) };
  }).sort((a, b) => b.n - a.n);
  el.innerHTML = `<div class="panel"><h2>Bodegas</h2>
    ${filas.length ? `<div class="table-scroll"><table>
      <thead><tr><th>Bodega</th><th>Pedidos</th><th>Costo total</th><th>Ganancia</th><th>Por cobrar</th></tr></thead>
      <tbody>${filas.map(r => `<tr><td>${esc(r.b.nombre)}${r.b.frecuente ? ' ⭐' : ''}</td><td>${r.n}</td><td>${money(r.costo)}</td><td>${money(r.ganancia)}</td><td>${money(r.cobrar)}</td></tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty">Aún no hay bodegas.</div>'}
    <p class="muted">⭐ = frecuentes (salen primero en el desplegable). Para sumar una nueva, elegí "Otra bodega" al crear un pedido.</p></div>`;
}
