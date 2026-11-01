// api.js
//
// Conexión de la página con el backend (reemplaza a db-local.js de la
// versión local, que guardaba todo en el navegador). Maneja el login y
// traduce los datos del backend a la forma que ya usaba la app:
//   backend                      app
//   referencia                →  modelo
//   valorVenta                →  venta
//   abonos.productoId         →  unitId
//   ids numéricos             →  ids como texto (la app los pone entre comillas en los onclick)

window.Api = (function () {
  const API = ''; // mismo origen: este backend sirve también la página.
  const CLAVE_TOKEN = 'inv_token';

  function leerToken() {
    try { return localStorage.getItem(CLAVE_TOKEN) || ''; } catch (e) { return ''; }
  }
  function guardarToken(valor) {
    try {
      if (valor) localStorage.setItem(CLAVE_TOKEN, valor);
      else localStorage.removeItem(CLAVE_TOKEN);
    } catch (e) {}
  }

  let token = leerToken();
  let alVencerSesion = () => {};

  async function pedir(ruta, opciones = {}) {
    let resp;
    try {
      resp = await fetch(API + ruta, {
        ...opciones,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      });
    } catch (e) {
      throw new Error('Sin conexión con el servidor. Revisá el internet e intentá de nuevo.');
    }
    if (resp.status === 401 && ruta !== '/auth/login') {
      token = '';
      guardarToken('');
      alVencerSesion();
      throw new Error('Tu sesión venció — volvé a entrar.');
    }
    const datos = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = Array.isArray(datos.message) ? datos.message.join(' ') : datos.message;
      throw new Error(msg || 'Ocurrió un error.');
    }
    return datos;
  }

  const comoUnidad = (p) => ({
    id: String(p.id),
    fechaCompra: p.fechaCompra || '',
    talla: p.talla,
    modelo: p.referencia || '',
    costo: p.costo,
    envio: p.envio,
    precioVentaSugerido: p.precioVentaSugerido,
    estado: p.estado,
    cliente: p.cliente || '',
    fechaVenta: p.fechaVenta || '',
    venta: p.valorVenta || 0,
    abono: p.abono || 0,
  });
  const comoAbono = (a) => ({
    id: String(a.id),
    unitId: String(a.productoId),
    cliente: a.cliente || '',
    talla: a.talla || '',
    modelo: a.referencia || '',
    monto: a.monto,
    fecha: a.fecha,
    nota: a.nota || '',
    tipo: a.tipo,
  });
  const comoGasto = (g) => ({ ...g, id: String(g.id), descripcion: g.descripcion || '' });

  return {
    haySesion: () => !!token,
    alVencerSesion(fn) { alVencerSesion = fn; },

    async login(usuario, clave) {
      const r = await pedir('/auth/login', { method: 'POST', body: JSON.stringify({ usuario, clave }) });
      token = r.token;
      guardarToken(token);
    },
    salir() {
      token = '';
      guardarToken('');
    },

    async cargar() {
      const d = await pedir('/datos');
      return { units: d.productos.map(comoUnidad), abonos: d.abonos.map(comoAbono), gastos: d.gastos.map(comoGasto) };
    },

    crearUnidad: (u) => pedir('/productos', {
      method: 'POST',
      body: JSON.stringify({
        fechaCompra: u.fechaCompra, talla: u.talla, referencia: u.modelo, costo: u.costo, envio: u.envio,
        precioVentaSugerido: u.precioVentaSugerido,
      }),
    }),
    eliminarUnidad: (id) => pedir('/productos/' + encodeURIComponent(id), { method: 'DELETE' }),
    vender: (id, v) => pedir('/productos/' + encodeURIComponent(id) + '/vender', {
      method: 'PATCH',
      body: JSON.stringify({ cliente: v.cliente, fechaVenta: v.fechaVenta, valorVenta: v.venta, abono: v.abono }),
    }),
    revertirVenta: (id) => pedir('/productos/' + encodeURIComponent(id) + '/revertir-venta', { method: 'PATCH' }),

    crearAbono: (unitId, monto, fecha, nota) => pedir('/abonos', {
      method: 'POST',
      body: JSON.stringify({ productoId: Number(unitId), monto, fecha, nota }),
    }),
    eliminarAbono: (id) => pedir('/abonos/' + encodeURIComponent(id), { method: 'DELETE' }),

    crearGasto: (g) => pedir('/gastos', { method: 'POST', body: JSON.stringify(g) }),
    eliminarGasto: (id) => pedir('/gastos/' + encodeURIComponent(id), { method: 'DELETE' }),
  };
})();
