// importar-respaldo.ts
//
// Pasa el respaldo de la app vieja "Control de Zapatos" (datos/respaldo.json:
// colecciones units, gastos y abonos) a PostgreSQL. Uso, después de
// "npm run build" y con DATABASE_URL apuntando a la base:
//
//   node dist/importar-respaldo.js ruta/respaldo.json            → SIMULA: hace todo y lo deshace
//   node dist/importar-respaldo.js ruta/respaldo.json --aplicar  → guarda de verdad
//
// Garantías:
//   - Todo va en UNA transacción: o entra todo, o nada.
//   - Antes de guardar, relee de la base cada unidad, abono y gasto importado
//     y lo compara campo por campo con el respaldo (incluido el total abonado
//     de cada venta). Si algo no coincide, deshace todo y avisa.
//   - Cada registro guarda su id viejo en "id_origen" (UNIQUE): correrlo dos
//     veces no duplica nada. Las unidades que ya estaban importadas se saltan
//     con todo lo suyo (abonos), por si las editaste después en la app.
//   - En la app vieja, el "abono" de cada unidad era el total abonado y el
//     historial de abonos empezó después, así que no siempre suman lo mismo.
//     La diferencia entra como un abono "saldo-anterior" fechado el día de la
//     venta: el total abonado de cada venta queda exactamente igual.

import { readFileSync } from 'fs';
import { Pool, PoolClient, types } from 'pg';
import { aplicarEsquema } from './esquema';

// DATE y NUMERIC como texto, para comparar sin conversiones de zona horaria.
types.setTypeParser(1082, (v) => v);

interface Unidad {
  fechaCompra?: string;
  talla?: string;
  modelo?: string;
  costo?: number;
  envio?: number;
  estado?: string;
  cliente?: string;
  fechaVenta?: string;
  venta?: number;
  abono?: number;
}

interface AbonoViejo {
  unitId?: string;
  monto?: number;
  fecha?: string;
  nota?: string;
  tipo?: string;
}

interface GastoViejo {
  fecha?: string;
  categoria?: string;
  descripcion?: string;
  monto?: number;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function vacioANull(valor: any): string | null {
  const limpio = valor === undefined || valor === null ? '' : String(valor).trim();
  return limpio || null;
}

function numero(valor: any): number {
  return Number(valor) || 0;
}

// Revisa el respaldo antes de tocar la base. Devuelve la lista de problemas.
function validar(units: Record<string, Unidad>, abonos: Record<string, AbonoViejo>, gastos: Record<string, GastoViejo>): string[] {
  const problemas: string[] = [];
  const fechaMala = (f: any) => f !== undefined && f !== null && f !== '' && !FECHA.test(String(f));
  const numeroMalo = (n: any) => n !== undefined && n !== null && (!Number.isFinite(Number(n)) || Number(n) < 0);
  for (const [id, u] of Object.entries(units)) {
    if (!vacioANull(u.talla)) problemas.push(`unidad ${id}: no tiene talla`);
    if (u.estado !== 'disponible' && u.estado !== 'vendido') problemas.push(`unidad ${id}: estado desconocido "${u.estado}"`);
    if (fechaMala(u.fechaCompra) || fechaMala(u.fechaVenta)) problemas.push(`unidad ${id}: fecha con formato raro`);
    for (const campo of ['costo', 'envio', 'venta', 'abono'] as const) {
      if (numeroMalo(u[campo])) problemas.push(`unidad ${id}: ${campo} no es un número válido`);
    }
    if (u.estado === 'vendido' && numero(u.abono) > numero(u.venta)) problemas.push(`unidad ${id}: abonó más que el valor de la venta`);
    if (u.estado === 'disponible' && (vacioANull(u.cliente) || numero(u.venta) || numero(u.abono))) {
      problemas.push(`unidad ${id}: está disponible pero tiene datos de venta`);
    }
  }
  const historial: Record<string, number> = {};
  for (const [id, a] of Object.entries(abonos)) {
    const unidad = units[a.unitId || ''];
    if (!unidad) problemas.push(`abono ${id}: su unidad (${a.unitId}) no está en el respaldo`);
    else if (unidad.estado !== 'vendido') problemas.push(`abono ${id}: su unidad no está vendida`);
    if (!(numero(a.monto) > 0)) problemas.push(`abono ${id}: monto inválido`);
    if (!FECHA.test(String(a.fecha || ''))) problemas.push(`abono ${id}: fecha inválida`);
    historial[a.unitId || ''] = (historial[a.unitId || ''] || 0) + numero(a.monto);
  }
  for (const [id, u] of Object.entries(units)) {
    if (u.estado === 'vendido' && (historial[id] || 0) > numero(u.abono)) {
      problemas.push(`unidad ${id}: su historial de abonos suma más que el total abonado`);
    }
  }
  for (const [id, g] of Object.entries(gastos)) {
    if (!(numero(g.monto) > 0)) problemas.push(`gasto ${id}: monto inválido`);
    if (!FECHA.test(String(g.fecha || ''))) problemas.push(`gasto ${id}: fecha inválida`);
  }
  return problemas;
}

async function importar(client: PoolClient, units: Record<string, Unidad>, abonos: Record<string, AbonoViejo>, gastos: Record<string, GastoViejo>) {
  const ids = Object.keys(units);
  const yaEstaban = await client.query(`SELECT id_origen FROM productos WHERE id_origen = ANY($1)`, [ids]);
  const saltadas = new Set<string>(yaEstaban.rows.map((f) => f.id_origen));
  const nuevas = ids.filter((id) => !saltadas.has(id));

  const idNuevo: Record<string, number> = {};
  for (const id of nuevas) {
    const u = units[id];
    const vendido = u.estado === 'vendido';
    const r = await client.query(
      `INSERT INTO productos (fecha_compra, referencia, talla, costo, envio, estado, cliente, fecha_venta, valor_venta, id_origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        vacioANull(u.fechaCompra), vacioANull(u.modelo), vacioANull(u.talla), numero(u.costo), numero(u.envio), u.estado,
        vendido ? vacioANull(u.cliente) : null, vendido ? vacioANull(u.fechaVenta) : null, vendido ? numero(u.venta) : null, id,
      ],
    );
    idNuevo[id] = r.rows[0].id;
  }

  let abonosHistorial = 0;
  for (const [id, a] of Object.entries(abonos)) {
    if (!(a.unitId in idNuevo)) continue;
    const tipo = a.tipo === 'inicial' ? 'inicial' : 'abono';
    const r = await client.query(
      `INSERT INTO abonos (producto_id, monto, fecha, nota, tipo, id_origen) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id_origen) DO NOTHING`,
      [idNuevo[a.unitId], numero(a.monto), a.fecha, vacioANull(a.nota), tipo, id],
    );
    abonosHistorial += r.rowCount;
  }

  let saldosAnteriores = 0;
  for (const id of nuevas) {
    const u = units[id];
    if (u.estado !== 'vendido') continue;
    const enHistorial = Object.values(abonos).filter((a) => a.unitId === id).reduce((s, a) => s + numero(a.monto), 0);
    const diferencia = numero(u.abono) - enHistorial;
    if (diferencia > 0) {
      await client.query(
        `INSERT INTO abonos (producto_id, monto, fecha, nota, tipo, id_origen) VALUES ($1, $2, $3, $4, 'saldo-anterior', $5)`,
        [idNuevo[id], diferencia, vacioANull(u.fechaVenta) || vacioANull(u.fechaCompra), 'Abonado antes de existir el historial', 'saldo-anterior:' + id],
      );
      saldosAnteriores++;
    }
  }

  let gastosNuevos = 0;
  for (const [id, g] of Object.entries(gastos)) {
    const r = await client.query(
      `INSERT INTO gastos (fecha, categoria, descripcion, monto, id_origen) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id_origen) DO NOTHING`,
      [g.fecha, vacioANull(g.categoria) || 'Otro', vacioANull(g.descripcion), numero(g.monto), id],
    );
    gastosNuevos += r.rowCount;
  }

  return { nuevas, saltadas, abonosHistorial, saldosAnteriores, gastosNuevos };
}

// Relee de la base lo importado y lo compara con el respaldo.
async function verificar(client: PoolClient, units: Record<string, Unidad>, abonos: Record<string, AbonoViejo>, gastos: Record<string, GastoViejo>, nuevas: string[]): Promise<string[]> {
  const diferencias: string[] = [];
  const filas = await client.query(
    `SELECT p.*, COALESCE((SELECT SUM(monto) FROM abonos a WHERE a.producto_id = p.id), 0) AS abonado
     FROM productos p WHERE p.id_origen = ANY($1)`,
    [nuevas],
  );
  const porOrigen = new Map<string, any>(filas.rows.map((f) => [f.id_origen, f]));
  for (const id of nuevas) {
    const u = units[id];
    const f = porOrigen.get(id);
    if (!f) { diferencias.push(`unidad ${id}: no quedó en la base`); continue; }
    const vendido = u.estado === 'vendido';
    const esperado: Record<string, any> = {
      fecha_compra: vacioANull(u.fechaCompra), referencia: vacioANull(u.modelo), talla: vacioANull(u.talla),
      costo: numero(u.costo), envio: numero(u.envio), estado: u.estado,
      cliente: vendido ? vacioANull(u.cliente) : null, fecha_venta: vendido ? vacioANull(u.fechaVenta) : null,
      valor_venta: vendido ? numero(u.venta) : null, abonado: vendido ? numero(u.abono) : 0,
    };
    for (const [campo, valor] of Object.entries(esperado)) {
      const real = typeof valor === 'number' ? Number(f[campo]) : f[campo];
      if (real !== valor) diferencias.push(`unidad ${id}: ${campo} esperado ${JSON.stringify(valor)}, quedó ${JSON.stringify(real)}`);
    }
  }
  const historial = await client.query(`SELECT id_origen, monto, fecha FROM abonos WHERE id_origen = ANY($1)`, [Object.keys(abonos)]);
  const abonosEnBase = new Map<string, any>(historial.rows.map((f) => [f.id_origen, f]));
  for (const [id, a] of Object.entries(abonos)) {
    if (!nuevas.includes(a.unitId)) continue;
    const f = abonosEnBase.get(id);
    if (!f || Number(f.monto) !== numero(a.monto) || f.fecha !== a.fecha) diferencias.push(`abono ${id}: no quedó igual que en el respaldo`);
  }
  const gastosBase = await client.query(`SELECT id_origen, monto, fecha, categoria FROM gastos WHERE id_origen = ANY($1)`, [Object.keys(gastos)]);
  const gastosEnBase = new Map<string, any>(gastosBase.rows.map((f) => [f.id_origen, f]));
  for (const [id, g] of Object.entries(gastos)) {
    const f = gastosEnBase.get(id);
    if (!f || Number(f.monto) !== numero(g.monto) || f.fecha !== g.fecha) diferencias.push(`gasto ${id}: no quedó igual que en el respaldo`);
  }
  return diferencias;
}

function dinero(n: number): string {
  return '$' + n.toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

async function main() {
  const ruta = process.argv[2];
  const aplicar = process.argv.includes('--aplicar');
  if (!ruta || ruta.startsWith('--')) {
    console.error('Uso: node dist/importar-respaldo.js ruta/respaldo.json [--aplicar]');
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error('Falta la variable DATABASE_URL (la URL de conexión de PostgreSQL en Railway).');
    process.exit(2);
  }

  const respaldo = JSON.parse(readFileSync(ruta, 'utf8'));
  const units: Record<string, Unidad> = respaldo.units || {};
  const abonos: Record<string, AbonoViejo> = respaldo.abonos || {};
  const gastos: Record<string, GastoViejo> = respaldo.gastos || {};

  const vendidas = Object.values(units).filter((u) => u.estado === 'vendido');
  console.log(`Respaldo: ${Object.keys(units).length} unidades (${vendidas.length} vendidas), ${Object.keys(abonos).length} abonos en el historial, ${Object.keys(gastos).length} gastos.`);
  console.log(`  Costo total ${dinero(Object.values(units).reduce((s, u) => s + numero(u.costo), 0))} · ventas ${dinero(vendidas.reduce((s, u) => s + numero(u.venta), 0))} · abonado ${dinero(vendidas.reduce((s, u) => s + numero(u.abono), 0))} · gastos ${dinero(Object.values(gastos).reduce((s, g) => s + numero(g.monto), 0))}`);

  const problemas = validar(units, abonos, gastos);
  if (problemas.length) {
    console.error('\nEl respaldo tiene problemas; no se importó nada:');
    problemas.forEach((p) => console.error('  - ' + p));
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await aplicarEsquema(client);
      const antes = await client.query(`SELECT (SELECT COUNT(*) FROM productos) AS productos, (SELECT COUNT(*) FROM abonos) AS abonos, (SELECT COUNT(*) FROM gastos) AS gastos`);
      console.log(`\nEn la base antes de importar: ${antes.rows[0].productos} productos, ${antes.rows[0].abonos} abonos, ${antes.rows[0].gastos} gastos.`);

      const r = await importar(client, units, abonos, gastos);
      const diferencias = await verificar(client, units, abonos, gastos, r.nuevas);

      console.log(`\nUnidades nuevas: ${r.nuevas.length} · ya importadas antes (se saltan): ${r.saltadas.size}`);
      console.log(`Abonos del historial: ${r.abonosHistorial} · abonos "saldo-anterior": ${r.saldosAnteriores} · gastos nuevos: ${r.gastosNuevos}`);

      if (diferencias.length) {
        await client.query('ROLLBACK');
        console.error('\nLa verificación encontró diferencias; se deshizo todo:');
        diferencias.forEach((d) => console.error('  - ' + d));
        process.exitCode = 1;
      } else if (aplicar) {
        await client.query('COMMIT');
        console.log('\nVerificación OK: todo quedó igual que en el respaldo. Importación GUARDADA.');
      } else {
        await client.query('ROLLBACK');
        console.log('\nVerificación OK. Esto fue una SIMULACIÓN: no se guardó nada. Para guardar, repetí el comando con --aplicar.');
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Error, no se importó nada: ' + (error as Error).message);
  process.exit(1);
});
