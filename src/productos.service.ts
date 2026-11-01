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
//     valor_venta. "Abono" sale de sumar los pagos de la tabla abonos (uno
//     por fila, con fecha y nota — ver esquema.ts). "Ganancia" y "Resta" NO
//     se guardan — se calculan al vuelo (ganancia = valor_venta - costo -
//     envio; resta = valor_venta - abono) para que nunca queden
//     desactualizadas si se corrige un dato.
//   "Bodega" (de las dos hojas) no se incluyó — en el Excel está mezclado
//   con el tema de vendedores/dónde está guardado el par, que Norbey pidió
//   dejar afuera de esta primera versión. Si hace falta más adelante, se
//   puede agregar como una columna de texto libre sin romper nada de esto.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DbService } from './db.service';
import { fechaOpcional, formatearFecha, hoyColombia, numeroNoNegativo, texto } from './utilidades';

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

export interface Abono {
  id: number;
  productoId: number;
  cliente: string | null;
  talla: string;
  referencia: string;
  monto: number;
  fecha: string;
  nota: string | null;
  tipo: 'inicial' | 'abono' | 'saldo-anterior';
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

export interface CrearAbonoDto {
  productoId: number;
  monto: number;
  fecha?: string;
  nota?: string;
}

// Cada producto con su total abonado (suma de la tabla abonos).
const SELECT_PRODUCTOS = `
  SELECT p.*, COALESCE(s.total, 0) AS abono
  FROM productos p
  LEFT JOIN (SELECT producto_id, SUM(monto) AS total FROM abonos GROUP BY producto_id) s ON s.producto_id = p.id
`;

@Injectable()
export class ProductosService {
  constructor(private readonly db: DbService) {}

  private mapearFila(fila: any): Producto {
    return {
      id: fila.id,
      fechaCompra: formatearFecha(fila.fecha_compra),
      referencia: fila.referencia || '',
      talla: fila.talla,
      costo: Number(fila.costo) || 0,
      envio: Number(fila.envio) || 0,
      precioVentaSugerido: fila.precio_venta_sugerido !== null ? Number(fila.precio_venta_sugerido) : null,
      imagen: fila.imagen || null,
      descripcion: fila.descripcion || null,
      estado: fila.estado,
      cliente: fila.cliente || null,
      fechaVenta: formatearFecha(fila.fecha_venta),
      valorVenta: fila.valor_venta !== null ? Number(fila.valor_venta) : null,
      abono: Number(fila.abono) || 0,
      creadoEn: fila.creado_en,
    };
  }

  private mapearAbono(fila: any): Abono {
    return {
      id: fila.id,
      productoId: fila.producto_id,
      cliente: fila.cliente || null,
      talla: fila.talla,
      referencia: fila.referencia || '',
      monto: Number(fila.monto) || 0,
      fecha: formatearFecha(fila.fecha),
      nota: fila.nota || null,
      tipo: fila.tipo,
    };
  }

  private async obtener(id: number, client?: PoolClient): Promise<Producto> {
    const resultado = await (client || this.db.pool()).query(`${SELECT_PRODUCTOS} WHERE p.id = $1`, [id]);
    if (!resultado.rows[0]) {
      throw new NotFoundException('No existe ese producto.');
    }
    return this.mapearFila(resultado.rows[0]);
  }

  async listar(): Promise<Producto[]> {
    const resultado = await this.db.pool().query(`${SELECT_PRODUCTOS} ORDER BY p.creado_en DESC, p.id DESC`);
    return resultado.rows.map((fila) => this.mapearFila(fila));
  }

  async listarAbonos(): Promise<Abono[]> {
    const resultado = await this.db.pool().query(`
      SELECT a.*, p.cliente, p.talla, p.referencia
      FROM abonos a JOIN productos p ON p.id = a.producto_id
      ORDER BY a.fecha DESC, a.id DESC
    `);
    return resultado.rows.map((fila) => this.mapearAbono(fila));
  }

  async crear(dto: CrearProductoDto): Promise<Producto> {
    const talla = texto(dto.talla);
    if (!talla) {
      throw new BadRequestException('Falta la talla.');
    }
    const resultado = await this.db.pool().query(
      `INSERT INTO productos (fecha_compra, referencia, talla, costo, envio, precio_venta_sugerido, imagen, descripcion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'disponible') RETURNING id`,
      [
        fechaOpcional(dto.fechaCompra, 'La fecha de compra'),
        texto(dto.referencia),
        talla,
        numeroNoNegativo(dto.costo, 'El costo'),
        numeroNoNegativo(dto.envio, 'El envío'),
        dto.precioVentaSugerido !== undefined && dto.precioVentaSugerido !== null ? numeroNoNegativo(dto.precioVentaSugerido, 'El precio sugerido') : null,
        texto(dto.imagen),
        texto(dto.descripcion),
      ],
    );
    return this.obtener(resultado.rows[0].id);
  }

  async editar(id: number, dto: EditarProductoDto): Promise<Producto> {
    const columnas: string[] = [];
    const valores: any[] = [];
    let i = 1;
    const agregar = (columna: string, valor: any) => {
      columnas.push(`${columna} = $${i++}`);
      valores.push(valor);
    };
    if (dto.fechaCompra !== undefined) agregar('fecha_compra', fechaOpcional(dto.fechaCompra, 'La fecha de compra'));
    if (dto.referencia !== undefined) agregar('referencia', texto(dto.referencia));
    if (dto.talla !== undefined) {
      if (!texto(dto.talla)) throw new BadRequestException('La talla no puede quedar vacía.');
      agregar('talla', texto(dto.talla));
    }
    if (dto.costo !== undefined) agregar('costo', numeroNoNegativo(dto.costo, 'El costo'));
    if (dto.envio !== undefined) agregar('envio', numeroNoNegativo(dto.envio, 'El envío'));
    if (dto.precioVentaSugerido !== undefined) agregar('precio_venta_sugerido', dto.precioVentaSugerido === null ? null : numeroNoNegativo(dto.precioVentaSugerido, 'El precio sugerido'));
    if (dto.imagen !== undefined) agregar('imagen', texto(dto.imagen));
    if (dto.descripcion !== undefined) agregar('descripcion', texto(dto.descripcion));
    if (columnas.length === 0) {
      throw new BadRequestException('No hay ningún cambio para guardar.');
    }
    valores.push(id);
    const resultado = await this.db.pool().query(`UPDATE productos SET ${columnas.join(', ')} WHERE id = $${i} RETURNING id`, valores);
    if (!resultado.rows[0]) {
      throw new NotFoundException('No existe ese producto.');
    }
    return this.obtener(id);
  }

  // Marca una unidad del inventario como vendida — equivale a cuando en el
  // Excel se agregaba una fila nueva en la hoja del año con cliente/venta.
  // Si pagó algo en el momento (de contado o una parte), queda como abono
  // "inicial" en el historial.
  async vender(id: number, dto: VenderProductoDto): Promise<Producto> {
    const cliente = texto(dto.cliente);
    if (!cliente) {
      throw new BadRequestException('Falta el nombre del cliente.');
    }
    const valorVenta = numeroNoNegativo(dto.valorVenta, 'El precio de venta');
    const abono = Math.min(numeroNoNegativo(dto.abono, 'El abono'), valorVenta);
    const fechaVenta = fechaOpcional(dto.fechaVenta, 'La fecha de venta') || hoyColombia();
    return this.db.transaccion(async (client) => {
      // "AND estado = 'disponible'" evita pisar una venta ya registrada (doble
      // clic, otra pestaña abierta con datos viejos, etc.).
      const resultado = await client.query(
        `UPDATE productos SET estado = 'vendido', cliente = $1, fecha_venta = $2, valor_venta = $3 WHERE id = $4 AND estado = 'disponible' RETURNING id`,
        [cliente, fechaVenta, valorVenta, id],
      );
      if (!resultado.rows[0]) {
        await this.obtener(id, client);
        throw new BadRequestException('Esa unidad ya está vendida.');
      }
      if (abono > 0) {
        await client.query(`INSERT INTO abonos (producto_id, monto, fecha, tipo) VALUES ($1, $2, $3, 'inicial')`, [id, abono, fechaVenta]);
      }
      return this.obtener(id, client);
    });
  }

  // Registra un pago de una venta a crédito/fiado (igual que la columna
  // "Abono"/"Resta" del Excel, pero guardando cada pago con su fecha). Si el
  // monto supera lo que falta, se registra solo lo que falta.
  async crearAbono(dto: CrearAbonoDto): Promise<Abono> {
    const productoId = Number(dto.productoId);
    if (!Number.isInteger(productoId)) {
      throw new BadRequestException('Falta indicar a qué venta corresponde el abono.');
    }
    const monto = numeroNoNegativo(dto.monto, 'El abono');
    if (monto <= 0) {
      throw new BadRequestException('El abono tiene que ser mayor a cero.');
    }
    const fecha = fechaOpcional(dto.fecha, 'La fecha del abono') || hoyColombia();
    return this.db.transaccion(async (client) => {
      // FOR UPDATE bloquea la venta mientras tanto, para que dos abonos casi
      // simultáneos no se pasen del valor de la venta.
      const venta = await client.query(`SELECT estado, valor_venta FROM productos WHERE id = $1 FOR UPDATE`, [productoId]);
      if (!venta.rows[0]) {
        throw new NotFoundException('No existe ese producto.');
      }
      if (venta.rows[0].estado !== 'vendido') {
        throw new BadRequestException('Solo se puede abonar a una unidad vendida.');
      }
      const pagado = await client.query(`SELECT COALESCE(SUM(monto), 0) AS total FROM abonos WHERE producto_id = $1`, [productoId]);
      const resta = (Number(venta.rows[0].valor_venta) || 0) - (Number(pagado.rows[0].total) || 0);
      if (resta <= 0) {
        throw new BadRequestException('Esa venta ya está pagada completa.');
      }
      const insertado = await client.query(
        `INSERT INTO abonos (producto_id, monto, fecha, nota, tipo) VALUES ($1, $2, $3, $4, 'abono') RETURNING id`,
        [productoId, Math.min(monto, resta), fecha, texto(dto.nota)],
      );
      const fila = await client.query(
        `SELECT a.*, p.cliente, p.talla, p.referencia FROM abonos a JOIN productos p ON p.id = a.producto_id WHERE a.id = $1`,
        [insertado.rows[0].id],
      );
      return this.mapearAbono(fila.rows[0]);
    });
  }

  async eliminarAbono(id: number): Promise<{ ok: true }> {
    const resultado = await this.db.pool().query(`DELETE FROM abonos WHERE id = $1`, [id]);
    if (resultado.rowCount === 0) {
      throw new NotFoundException('No existe ese abono.');
    }
    return { ok: true };
  }

  // Vuelve una unidad vendida a "disponible" (por si se registró mal o el
  // cliente devolvió el par) — borra los datos de la venta y sus abonos; el
  // costo/envío del inventario quedan intactos.
  async revertirVenta(id: number): Promise<Producto> {
    return this.db.transaccion(async (client) => {
      const resultado = await client.query(
        `UPDATE productos SET estado = 'disponible', cliente = NULL, fecha_venta = NULL, valor_venta = NULL WHERE id = $1 RETURNING id`,
        [id],
      );
      if (!resultado.rows[0]) {
        throw new NotFoundException('No existe ese producto.');
      }
      await client.query(`DELETE FROM abonos WHERE producto_id = $1`, [id]);
      return this.obtener(id, client);
    });
  }

  // Sus abonos se borran solos (ON DELETE CASCADE en esquema.ts).
  async eliminar(id: number): Promise<{ ok: true }> {
    const resultado = await this.db.pool().query(`DELETE FROM productos WHERE id = $1`, [id]);
    if (resultado.rowCount === 0) {
      throw new NotFoundException('No existe ese producto.');
    }
    return { ok: true };
  }
}
