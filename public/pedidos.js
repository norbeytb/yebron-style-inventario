// pedidos.js — pestañas "Bajo pedido" y "Bodegas". Usa los helpers de
// index.html (money, esc, fmtDate, todayISO, guardar, showConfirm...).

let pedidos = [];
let bodegas = [];
let pedPagos = [];
let pedFiltro = { bodega: '', texto: '', desde: '', hasta: '' };
const NUEVA = '__nueva__';
const CATEGORIA_GASTO_PEDIDOS = 'Bajo pedido';

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
    (!pedFiltro.desde || p.fecha >= pedFiltro.desde) &&
    (!pedFiltro.hasta || p.fecha <= pedFiltro.hasta) &&
    (!pedFiltro.bodega || String(p.bodegaId) === pedFiltro.bodega) &&
    (!q || (p.cliente + ' ' + p.referencia).toLowerCase().includes(q)));
  const activos = lista.filter(p => p.estado !== 'cancelado');
  const gastosRango = gastos.filter(g => g.categoria === CATEGORIA_GASTO_PEDIDOS &&
    (!pedFiltro.desde || g.fecha >= pedFiltro.desde) && (!pedFiltro.hasta || g.fecha <= pedFiltro.hasta))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const totalGastos = gastosRango.reduce((t, g) => t + (Number(g.monto) || 0), 0);
  const porCobrar = activos.reduce((s, p) => s + pedResta(p), 0);
  const ganancia = activos.reduce((s, p) => s + pedGanancia(p), 0);
  const suma = (f) => activos.reduce((t, p) => t + f(p), 0);

  const etiqueta = pedFiltro.desde || pedFiltro.hasta
    ? `Del ${pedFiltro.desde ? fmtDate(pedFiltro.desde) : 'inicio'} al ${pedFiltro.hasta ? fmtDate(pedFiltro.hasta) : 'hoy'}`
    : 'Todo el tiempo';
  el.innerHTML = `
    <div class="panel">
      <div class="grid-form">
        <div><label>Desde</label><input type="date" id="pfDesde" value="${pedFiltro.desde}"></div>
        <div><label>Hasta</label><input type="date" id="pfHasta" value="${pedFiltro.hasta}"></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end">
          <button class="btn small secondary" onclick="rangoPedidos('mes')">Este mes</button>
          <button class="btn small secondary" onclick="rangoPedidos('mespasado')">Mes pasado</button>
          <button class="btn small secondary" onclick="rangoPedidos('anio')">Este año</button>
          <button class="btn small secondary" onclick="rangoPedidos('todo')">Todo</button>
        </div>
      </div>
      <p class="muted" style="margin:8px 0 0">Resumen: <strong>${etiqueta}</strong> · ${lista.length} pedidos</p>
    </div>
    <div class="grid-cards">
      <div class="stat"><div class="label">Unidades</div><div class="value">${suma(p => p.unidades)}</div></div>
      <div class="stat"><div class="label">Ventas</div><div class="value">${money(suma(p => p.venta))}</div></div>
      <div class="stat"><div class="label">Costo</div><div class="value">${money(suma(p => p.costo))}</div></div>
      <div class="stat"><div class="label">Envíos</div><div class="value">${money(suma(p => p.envio))}</div></div>
      <div class="stat"><div class="label">Ganancia</div><div class="value">${money(ganancia)}</div></div>
      <div class="stat neg"><div class="label">Gastos</div><div class="value">${money(totalGastos)}</div></div>
      <div class="stat"><div class="label">Ganancia − gastos</div><div class="value">${money(ganancia - totalGastos)}</div></div>
      <div class="stat neg"><div class="label">Por cobrar</div><div class="value">${money(porCobrar)}</div></div>
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
      <h2>Gastos (${gastosRango.length}) · ${money(totalGastos)}</h2>
      <form id="formGastoPedido" class="grid-form">
        <div><label>Fecha</label><input type="date" name="fecha" value="${todayISO()}" required></div>
        <div><label>Valor del gasto</label><input type="number" name="monto" min="1" required></div>
        <div><label>Detalle</label><input type="text" name="descripcion" placeholder="Ej: Publicidad Meta, empaques..." required></div>
        <div><button class="btn" type="submit">Agregar gasto</button></div>
      </form>
      ${gastosRango.length ? `<div class="table-scroll"><table>
        <thead><tr><th>Fecha</th><th>Detalle</th><th>Valor</th><th></th></tr></thead>
        <tbody>${gastosRango.map(g => `<tr><td>${fmtDate(g.fecha)}</td><td>${esc(g.descripcion) || '—'}</td><td>${money(g.monto)}</td>
          <td><button class="btn small danger" onclick="deleteGasto('${g.id}')">✕</button></td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">No hay gastos en este rango.</div>'}
    </div>
    <div class="panel">
      <h2>Pedidos (${lista.length})</h2>
      <div class="grid-form">
        <div><select id="pfBodega"><option value="">Todas las bodegas</option>${bodegas.map(b => `<option value="${b.id}" ${pedFiltro.bodega===String(b.id)?'selected':''}>${esc(b.nombre)}</option>`).join('')}</select></div>
        <div><input type="text" id="pfTexto" placeholder="Buscar cliente o modelo" value="${esc(pedFiltro.texto)}"></div>
      </div>
      ${lista.length ? `<div class="table-scroll"><table>
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Modelo</th><th>Talla</th><th>Bodega</th><th>Unid.</th><th>Venta</th><th>Costo</th><th>Envío</th><th>Ganancia</th><th>Resta</th><th></th></tr></thead>
        <tbody>${lista.map(p => `<tr>
          <td>${fmtDate(p.fecha)}</td><td>${esc(p.cliente)}</td><td>${esc(p.referencia) || '—'}</td>
          <td>${esc(p.talla) || '—'}</td><td>${esc(p.bodega) || '—'}</td><td>${p.unidades}</td><td>${money(p.venta)}</td><td>${money(p.costo)}</td><td>${money(p.envio)}</td><td>${money(pedGanancia(p))}</td>
          <td>${pedResta(p) > 0 ? `<span class="badge pendiente">${money(pedResta(p))}</span>` : `<span class="badge disponible">Pagado</span>`}</td>
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
  document.getElementById('formGastoPedido').addEventListener('submit', async (e) => {
    e.preventDefault(); const g = e.target;
    await guardar(() => Api.crearGasto({ fecha: g.fecha.value, categoria: CATEGORIA_GASTO_PEDIDOS, descripcion: g.descripcion.value.trim(), monto: Number(g.monto.value) || 0 }), 'Gasto registrado');
  });
  const re = () => renderPedidos();
  document.getElementById('pfDesde').onchange = (e) => { pedFiltro.desde = e.target.value; re(); };
  document.getElementById('pfHasta').onchange = (e) => { pedFiltro.hasta = e.target.value; re(); };
  document.getElementById('pfBodega').onchange = (e) => { pedFiltro.bodega = e.target.value; re(); };
  // Filtra mientras se escribe (con una pausa corta) y devuelve el cursor al
  // cuadro, porque al redibujar la pestaña el cuadro se vuelve a crear.
  document.getElementById('pfTexto').oninput = (e) => {
    pedFiltro.texto = e.target.value;
    clearTimeout(pedFiltro._t);
    pedFiltro._t = setTimeout(() => {
      re();
      const c = document.getElementById('pfTexto');
      if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); }
    }, 150);
  };
}

function borrarPedido(id) { showConfirm('¿Eliminar este pedido y sus abonos?', () => guardar(() => Api.eliminarPedido(id), 'Pedido eliminado')); }

function rangoPedidos(tipo) {
  const hoy = todayISO(), a = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7));
  const dos = (n) => String(n).padStart(2, '0');
  const ultimo = (anio, mes) => new Date(anio, mes, 0).getDate();
  if (tipo === 'mes') { pedFiltro.desde = `${a}-${dos(m)}-01`; pedFiltro.hasta = `${a}-${dos(m)}-${dos(ultimo(a, m))}`; }
  else if (tipo === 'mespasado') {
    const pm = m === 1 ? 12 : m - 1, pa = m === 1 ? a - 1 : a;
    pedFiltro.desde = `${pa}-${dos(pm)}-01`; pedFiltro.hasta = `${pa}-${dos(pm)}-${dos(ultimo(pa, pm))}`;
  }
  else if (tipo === 'anio') { pedFiltro.desde = `${a}-01-01`; pedFiltro.hasta = `${a}-12-31`; }
  else { pedFiltro.desde = ''; pedFiltro.hasta = ''; }
  renderPedidos();
}

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
