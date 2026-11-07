// importar-pedidos.ts
//
// Carga en "Bajo pedido" el JSON que genera scripts/extraer_pedidos.py.
// Uso:  DATABASE_URL=... npm run importar-pedidos -- pedidos.json [--aplicar]
// Sin --aplicar es una simulación (no guarda nada). Se puede correr más de
// una vez: id_origen evita duplicados.

import { readFileSync } from 'fs';
import { Pool } from 'pg';
import { aplicarEsquema } from './esquema';

async function main() {
  const archivo = process.argv[2];
  const aplicar = process.argv.includes('--aplicar');
  if (!archivo || !process.env.DATABASE_URL) {
    console.error('Uso: DATABASE_URL=... npm run importar-pedidos -- pedidos.json [--aplicar]');
    process.exit(1);
  }
  const { pedidos } = JSON.parse(readFileSync(archivo, 'utf8'));
  // SSL=1 fuerza conexión cifrada (Railway la acepta con o sin cifrar).
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 20000,
    ssl: process.env.SSL === '1' ? { rejectUnauthorized: false } : undefined,
  });
  console.log('Conectando a la base de datos...');
  const client = await pool.connect();
  console.log(`Conectado. Procesando ${pedidos.length} pedidos...`);
  let nuevos = 0, existentes = 0;
  try {
    await client.query('BEGIN');
    await aplicarEsquema(client);
    const cacheBodegas = new Map<string, number>();
    for (const p of pedidos) {
      let bodegaId: number | null = null;
      if (p.bodega) {
        const k = p.bodega.toLowerCase();
        if (!cacheBodegas.has(k)) {
          const b = await client.query(`INSERT INTO bodegas (nombre) VALUES ($1) ON CONFLICT (lower(nombre)) DO UPDATE SET nombre = bodegas.nombre RETURNING id`, [p.bodega]);
          cacheBodegas.set(k, b.rows[0].id);
        }
        bodegaId = cacheBodegas.get(k) as number;
      }
      const r = await client.query(
        `INSERT INTO pedidos (fecha, cliente, bodega_id, referencia, talla, unidades, venta, costo, envio, estado, nota, id_origen)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id_origen) DO NOTHING RETURNING id`,
        [p.fecha, p.cliente, bodegaId, p.referencia || null, p.talla, p.unidades, p.venta, p.costo, p.envio, p.estado, 'Excel: ' + p.textoOriginal, p.idOrigen],
      );
      if (!r.rowCount) { existentes++; continue; }
      nuevos++;
      if (nuevos % 100 === 0) console.log(`  ${nuevos} pedidos...`);
      if (p.abono > 0) {
        await client.query(`INSERT INTO pedido_pagos (pedido_id, monto, fecha, nota, id_origen) VALUES ($1,$2,$3,'Importado del Excel',$4)`, [r.rows[0].id, p.abono, p.fecha, p.idOrigen + '-abono']);
      }
    }
    await client.query(aplicar ? 'COMMIT' : 'ROLLBACK');
    console.log(`${aplicar ? 'Guardados' : 'Simulación (no se guardó nada)'}: ${nuevos} pedidos nuevos, ${existentes} ya existían.`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
