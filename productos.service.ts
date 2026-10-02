// productos.service.ts
//
// Pedido 02/10: reemplaza el Excel "Yebron Style Listado" (pestañas
// "Inventario" + "2025"/"2026") por una sola tabla en PostgreSQL —
// a propósito NO se separan "Inventario" y "Ventas" en dos tablas: cada
// par de zapatos es UNA fila desde que entra al inventario hasta que se
// vende (mismo criterio que ya se probó y funciona en la app de Claude
// "Control de Zapatos" hecha antes para este mismo negocio) — evita tener
// que mover filas de una tabla a otra al venderse, y deja el historial
// completo (costo, envío, a quién se le vendió, cuánto abonó) en un solo
// lugar.
//
// A propósito NO se incluyen "Vendedores" ni "Listado clientes sorteo"
// (pedido explícito de Norbey — ver la conversación: "menos el tema de los
// vendedores y menos el tema de la lista de clientes de sorteo").
//
// Columnas, comparadas con el Excel:
//   Excel "Inventario": Referencia, Talla, Cantidad, Costo, Precio venta,
//     Imagen, Envio, Descripcion  →  acá: referencia, talla, costo,
//     precio_venta_sugerido, imagen, envio, descripcion. "Cantidad" no
//     existe como número aparte — una fila YA ES una unidad (si compraste
//     3 pares iguales, se agregan 3 filas) — más preciso para poder
//     vender cada par por separado con su propio cliente.
//   Excel "2025"/"2026" (ventas): Fecha Compra, Nombre Cliente, Unidades,
//     Venta, Costo, Envio, Ganancia, Abono, Resta  →  acá: fecha_compra
//     (ya estaba desde que se agregó al inventario), cliente, fecha_venta,
//     valor_venta, abono. "Ganancia" y "Resta" NO se guardan — se calculan
//     al vuelo (ganancia = valor_venta - costo - envio; resta = valor_venta
//     - abono) para que nunca queden desactualizadas si se corrige un dato.
//   "Bodega" (de las dos hojas) no se incluyó — en el Excel está mezclado
//   con el tema de vendedores/dónde está guardado el par, que Norbey pidió
//   dejar afuera de esta primera versión. Si hace falta más adelante, se
//   puede agregar como una columna de texto libre sin romper nada de esto.

import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

export interface Producto {
  id: number;
  fechaCompra: string | null;
  referencia: string;
  talla: string;
  costo: number;
  envio: number;
  precioVentaSugerido: number | null;
  imagen: string | null;
  descripcion: string | null;
  estado: 'disponible' | 'vendido';
  cliente: string | null;
  fechaVenta: string | null;
  valorVenta: number | null;
  abono: number;
  creadoEn: string;
}

export interface CrearProductoDto {
  fechaCompra?: string;
  referencia?: string;
  talla: string;
  costo: number;
  envio?: number;
  precioVentaSugerido?: number;
  imagen?: string;
  descripcion?: string;
}

export interface VenderProductoDto {
  cliente: string;
  fechaVenta?: string;
  valorVenta: number;
  abono?: number;
}

export interface EditarProductoDto {
  fechaCompra?: string;
  referencia?: string;
  talla?: string;
  costo?: number;
  envio?: number;
  precioVentaSugerido?: number;
  imagen?: string;
  descripcion?: string;
}

@Injectable()
export class ProductosService implements OnModuleInit {
  private readonly logger = new Logger(ProductosService.name);
  private pool: Pool | null = null;

  private configurado(): boolean {
    return !!process.env.DATABASE_URL;
  }

  async onModuleInit() {
    if (!this.configurado()) {
      this.logger.warn('DATABASE_URL no está configurada — el inventario no va a funcionar hasta que se agregue el plugin de PostgreSQL en Railway.');
      return;
    }
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await this.pool.query(`
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
          abono NUMERIC NOT NULL DEFAULT 0,
          creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      this.logger.log('Conectado a PostgreSQL — tabla "productos" lista.');
    } catch (error) {
      this.logger.error('No se pudo conectar/crear la tabla de productos: ' + (error as Error).message);
      this.pool = null;
    }
  }

  private requerirPool(): Pool {
    if (!this.pool) {
      throw new NotFoundException('El inventario no está disponible: falta configurar la base de datos en el servidor.');
    }
    return this.pool;
  }

  // El driver "pg" devuelve las columnas DATE como objetos Date de JS (no
  // como texto) — un Date.toString() da algo tipo "Thu Oct 01 2026 00:00:00
  // GMT+0000...", NO el "2026-10-01" que necesita el frontend (ordenar,
  // comparar meses, mostrar con fmtDate). Este helper cubre los dos casos
  // (Date de verdad, o ya viniera como texto) y siempre devuelve YYYY-MM-DD.
  private formatearFecha(valor: any): string | null {
    if (!valor) return null;
    if (valor instanceof Date) {
      // OJO: "pg" arma este Date en hora LOCAL del servidor a partir del
      // DATE que guardó Postgres (no en UTC) — por eso se leen año/mes/día
      // con getFullYear()/getMonth()/getDate() (componentes locales) y NO
      // con toISOString() (que convierte a UTC y, si el servidor corriera
      // en una zona horaria con offset distinto a 0, podría correr la
      // fecha un día para atrás o adelante).
      const año = valor.getFullYear();
      const mes = String(valor.getMonth() + 1).padStart(2, '0');
      const dia = String(valor.getDate()).padStart(2, '0');
      return `${año}-${mes}-${dia}`;
    }
    return String(valor).slice(0, 10);
  }

  private mapearFila(fila: any): Producto {
    return {
      id: fila.id,
      fechaCompra: this.formatearFecha(fila.fecha_compra),
      referencia: fila.referencia || '',
      talla: fila.talla,
      costo: Number(fila.costo) || 0,
      envio: Number(fila.envio) || 0,
      precioVentaSugerido: fila.precio_venta_sugerido !== null ? Number(fila.precio_venta_sugerido) : null,
      imagen: fila.imagen || null,
      descripcion: fila.descripcion || null,
      estado: fila.estado,
      cliente: fila.cliente || null,
      fechaVenta: this.formatearFecha(fila.fecha_venta),
      valorVenta: fila.valor_venta !== null ? Number(fila.valor_venta) : null,
      abono: Number(fila.abono) || 0,
      creadoEn: fila.creado_en,
    };
  }

  async listar(): Promise<Producto[]> {
    const pool = this.requerirPool();
    const resultado = await pool.query(`SELECT * FROM productos ORDER BY creado_en DESC`);
    return resultado.rows.map((fila) => this.mapearFila(fila));
  }

  async crear(dto: CrearProductoDto): Promise<Producto> {
    const pool = this.requerirPool();
    if (!dto.talla || !dto.talla.trim()) {
      throw new NotFoundException('Falta la talla.');
    }
    const resultado = await pool.query(
      `INSERT INTO productos (fecha_compra, referencia, talla, costo, envio, precio_venta_sugerido, imagen, descripcion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'disponible') RETURNING *`,
      [
        dto.fechaCompra || null,
        (dto.referencia || '').trim() || null,
        dto.talla.trim(),
        Number(dto.costo) || 0,
        Number(dto.envio) || 0,
        dto.precioVentaSugerido !== undefined && dto.precioVentaSugerido !== null ? Number(dto.precioVentaSugerido) : null,
        (dto.imagen || '').trim() || null,
        (dto.descripcion || '').trim() || null,
      ],
    );
    return this.mapearFila(resultado.rows[0]);
  }

  async editar(id: number, dto: EditarProductoDto): Promise<Producto> {
    const pool = this.requerirPool();
    const columnas: string[] = [];
    const valores: any[] = [];
    let i = 1;
    const agregar = (columna: string, valor: any) => {
      columnas.push(`${columna} = $${i++}`);
      valores.push(valor);
    };
    if (dto.fechaCompra !== undefined) agregar('fecha_compra', dto.fechaCompra || null);
    if (dto.referencia !== undefined) agregar('referencia', dto.referencia?.trim() || null);
    if (dto.talla !== undefined) agregar('talla', dto.talla?.trim());
    if (dto.costo !== undefined) agregar('costo', Number(dto.costo) || 0);
    if (dto.envio !== undefined) agregar('envio', Number(dto.envio) || 0);
    if (dto.precioVentaSugerido !== undefined) agregar('precio_venta_sugerido', dto.precioVentaSugerido === null ? null : Number(dto.precioVentaSugerido));
    if (dto.imagen !== undefined) agregar('imagen', dto.imagen?.trim() || null);
    if (dto.descripcion !== undefined) agregar('descripcion', dto.descripcion?.trim() || null);
    if (columnas.length === 0) {
      throw new NotFoundException('No hay ningún cambio para guardar.');
    }
    valores.push(id);
    const resultado = await pool.query(`UPDATE productos SET ${columnas.join(', ')} WHERE id = $${i} RETURNING *`, valores);
    if (!resultado.rows[0]) {
      throw new NotFoundException('No existe ese producto.');
    }
    return this.mapearFila(resultado.rows[0]);
  }

  // Marca una unidad del inventario como vendida — equivale a cuando en el
  // Excel se agregaba una fila nueva en la hoja del año con cliente/venta.
  async vender(id: number, dto: VenderProductoDto): Promise<Producto> {
    const pool = this.requerirPool();
    if (!dto.cliente || !dto.cliente.trim()) {
      throw new NotFoundException('Falta el nombre del cliente.');
    }
    const resultado = await pool.query(
      `UPDATE productos SET estado = 'vendido', cliente = $1, fecha_venta = $2, valor_venta = $3, abono = $4 WHERE id = $5 RETURNING *`,
      [dto.cliente.trim(), dto.fechaVenta || new Date().toISOString().slice(0, 10), Number(dto.valorVenta) || 0, Math.min(Number(dto.abono) || 0, Number(dto.valorVenta) || 0), id],
    );
    if (!resultado.rows[0]) {
      throw new NotFoundException('No existe ese producto.');
    }
    return this.mapearFila(resultado.rows[0]);
  }

  // Suma un abono nuevo al que ya tenía (para ventas a crédito/fiado, igual
  // que la columna "Abono"/"Resta" del Excel).
  async abonar(id: number, monto: number): Promise<Producto> {
    const pool = this.requerirPool();
    const actual = await pool.query(`SELECT valor_venta, abono FROM productos WHERE id = $1`, [id]);
    const fila = actual.rows[0];
    if (!fila) {
      throw new NotFoundException('No existe ese producto.');
    }
    const nuevoAbono = Math.min((Number(fila.abono) || 0) + (Number(monto) || 0), Number(fila.valor_venta) || 0);
    const resultado = await pool.query(`UPDATE productos SET abono = $1 WHERE id = $2 RETURNING *`, [nuevoAbono, id]);
    return this.mapearFila(resultado.rows[0]);
  }

  // Vuelve una unidad vendida a "disponible" (por si se registró mal o el
  // cliente devolvió el par) — limpia los datos de la venta, el costo/envío
  // del inventario quedan intactos.
  async revertirVenta(id: number): Promise<Producto> {
    const pool = this.requerirPool();
    const resultado = await pool.query(
      `UPDATE productos SET estado = 'disponible', cliente = NULL, fecha_venta = NULL, valor_venta = NULL, abono = 0 WHERE id = $1 RETURNING *`,
      [id],
    );
    if (!resultado.rows[0]) {
      throw new NotFoundException('No existe ese producto.');
    }
    return this.mapearFila(resultado.rows[0]);
  }

  async eliminar(id: number): Promise<{ ok: true }> {
    const pool = this.requerirPool();
    const resultado = await pool.query(`DELETE FROM productos WHERE id = $1`, [id]);
    if (resultado.rowCount === 0) {
      throw new NotFoundException('No existe ese producto.');
    }
    return { ok: true };
  }
}
