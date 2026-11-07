// esquema.ts
//
// Crea/actualiza las tablas. Lo usan tanto el backend al arrancar
// (db.service.ts) como el script de importación (importar-respaldo.ts), así
// los dos trabajan siempre sobre la misma estructura.
//
// Tablas:
//   productos — un par de zapatos por fila, desde que entra al inventario
//               hasta que se vende (ver productos.service.ts).
//   abonos    — cada pago de una venta por separado. El "abonado" de una
//               venta NO se guarda en productos: es la suma de sus abonos, así
//               el total y el historial nunca se pueden desajustar.
//   gastos    — gastos del negocio (publicidad, empaques, envíos...).
//
// "id_origen" guarda el id que tenía cada registro en la app vieja (el
// artifact "Control de Zapatos"); es UNIQUE para que importar el mismo
// respaldo dos veces no duplique nada.

import { Pool, PoolClient } from 'pg';

export async function prepararEsquema(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await aplicarEsquema(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

// Lo mismo, sobre una transacción que ya abrió quien llama (la usa el
// script de importación para que una simulación no deje ni las tablas).
export async function aplicarEsquema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS productos (
      id SERIAL PRIMARY KEY,
      fecha_compra DATE,
      referencia TEXT,
      talla TEXT NOT NULL,
      costo NUMERIC NOT NULL DEFAULT 0,
      envio NUMERIC NOT NULL DEFAULT 0,
      precio_venta_sugerido NUMERIC,
      imagen TEXT,
      descripcion TEXT,
      estado TEXT NOT NULL DEFAULT 'disponible',
      cliente TEXT,
      fecha_venta DATE,
      valor_venta NUMERIC,
      id_origen TEXT UNIQUE,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS id_origen TEXT UNIQUE`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS abonos (
      id SERIAL PRIMARY KEY,
      producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      monto NUMERIC NOT NULL CHECK (monto > 0),
      fecha DATE NOT NULL,
      nota TEXT,
      tipo TEXT NOT NULL DEFAULT 'abono',
      id_origen TEXT UNIQUE,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS abonos_producto_id_idx ON abonos (producto_id)`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS gastos (
      id SERIAL PRIMARY KEY,
      fecha DATE NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'Otro',
      descripcion TEXT,
      monto NUMERIC NOT NULL CHECK (monto > 0),
      id_origen TEXT UNIQUE,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // ---- Bajo pedido: pares que se le compran a otras bodegas por encargo ----
  await client.query(`
    CREATE TABLE IF NOT EXISTS bodegas (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      frecuente BOOLEAN NOT NULL DEFAULT false,
      activa BOOLEAN NOT NULL DEFAULT true,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS bodegas_nombre_idx ON bodegas (lower(nombre))`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id SERIAL PRIMARY KEY,
      fecha DATE NOT NULL,
      cliente TEXT NOT NULL,
      bodega_id INTEGER REFERENCES bodegas(id),
      referencia TEXT,
      talla TEXT,
      unidades INTEGER NOT NULL DEFAULT 1 CHECK (unidades > 0),
      venta NUMERIC NOT NULL DEFAULT 0,
      costo NUMERIC NOT NULL DEFAULT 0,
      envio NUMERIC NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'pedido',
      nota TEXT,
      id_origen TEXT UNIQUE,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS pedidos_cliente_idx ON pedidos (lower(cliente))`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS pedido_pagos (
      id SERIAL PRIMARY KEY,
      pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
      monto NUMERIC NOT NULL CHECK (monto > 0),
      fecha DATE NOT NULL,
      nota TEXT,
      id_origen TEXT UNIQUE,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS pedido_pagos_pedido_idx ON pedido_pagos (pedido_id)`);
  // Bodegas con las que más se ha vendido: salen primero en el desplegable.
  await client.query(`
    INSERT INTO bodegas (nombre, frecuente) VALUES
      ('Tania', true), ('MN', true), ('ML Sport', true), ('Og Sneaker', true), ('Silvia', true),
      ('Betel', true), ('Mi bodega', true)
    ON CONFLICT (lower(nombre)) DO UPDATE SET frecuente = true
  `);

  // Migración de la primera versión: ahí productos tenía una columna
  // "abono" con el total abonado y no había historial. Ese total pasa a la
  // tabla abonos como un abono "saldo-anterior" (fechado el día de la venta)
  // y recién después se borra la columna — todo dentro de esta transacción,
  // así que si algo falla no se pierde nada.
  const legado = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'productos' AND column_name = 'abono'`,
  );
  if (legado.rowCount) {
    await client.query(`
      INSERT INTO abonos (producto_id, monto, fecha, nota, tipo)
      SELECT p.id, p.abono, COALESCE(p.fecha_venta, CURRENT_DATE), 'Abonado antes de existir el historial', 'saldo-anterior'
      FROM productos p
      WHERE p.estado = 'vendido' AND p.abono > 0
    `);
    await client.query(`ALTER TABLE productos DROP COLUMN abono`);
  }
}
