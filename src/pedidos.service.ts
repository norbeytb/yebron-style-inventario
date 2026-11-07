// pedidos.service.ts
//
// "Bajo pedido": el cliente pide primero, Norbey le compra el par a una
// bodega ajena y se lo entrega. Cada fila de `pedidos` es una línea (una
// referencia/talla, con sus unidades); un cliente con varios pares tiene
// varias filas. Los pagos viven en `pedido_pagos`; ganancia y saldo se
// calculan al vuelo, igual que en el inventario propio.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from './db.service';
import { fechaOpcional, formatearFecha, hoyColombia, numeroNoNegativo, texto } from './utilidades';

export const ESTADOS_PEDIDO = ['pedido', 'comprado', 'enviado', 'entregado', 'cancelado'];

export interface Bodega { id: number; nombre: string; frecuente: boolean; activa: boolean }
export interface Pedido {
  id: number; fecha: string; cliente: string; bodegaId: number | null; bodega: string | null;
  referencia: string; talla: string; unidades: number; venta: number; costo: number; envio: number;
  estado: string; nota: string | null; pagado: number;
}
export interface PedidoPago { id: number; pedidoId: number; monto: number; fecha: string; nota: string | null }

export interface CrearPedidoDto {
  fecha?: string; cliente: string; bodegaId?: number; bodegaNueva?: string; referencia?: string; talla?: string;
  unidades?: number; venta?: number; costo?: number; envio?: number; estado?: string; nota?: string; abono?: number;
}

const SELECT_PEDIDOS = `
  SELECT p.*, b.nombre AS bodega, COALESCE(s.total, 0) AS pagado
  FROM pedidos p
  LEFT JOIN bodegas b ON b.id = p.bodega_id
  LEFT JOIN (SELECT pedido_id, SUM(monto) AS total FROM pedido_pagos GROUP BY pedido_id) s ON s.pedido_id = p.id
`;

@Injectable()
export class PedidosService {
  constructor(private readonly db: DbService) {}

  private mapear(f: any): Pedido {
    return {
      id: f.id, fecha: formatearFecha(f.fecha) as string, cliente: f.cliente, bodegaId: f.bodega_id, bodega: f.bodega,
      referencia: f.referencia || '', talla: f.talla || '', unidades: f.unidades, venta: Number(f.venta),
      costo: Number(f.costo), envio: Number(f.envio), estado: f.estado, nota: f.nota, pagado: Number(f.pagado) || 0,
    };
  }

  async listarBodegas(): Promise<Bodega[]> {
    const r = await this.db.pool().query(`SELECT id, nombre, frecuente, activa FROM bodegas ORDER BY frecuente DESC, lower(nombre)`);
    return r.rows;
  }

  // Crea la bodega si no existe (sin importar mayúsculas/espacios) y devuelve su id.
  async obtenerOCrearBodega(nombre: string): Promise<number> {
    const limpio = texto(nombre)?.replace(/\s+/g, ' ');
    if (!limpio) throw new BadRequestException('Falta el nombre de la bodega.');
    const r = await this.db.pool().query(
      `INSERT INTO bodegas (nombre) VALUES ($1)
       ON CONFLICT (lower(nombre)) DO UPDATE SET activa = true RETURNING id`,
      [limpio],
    );
    return r.rows[0].id;
  }

  async listar(): Promise<Pedido[]> {
    const r = await this.db.pool().query(`${SELECT_PEDIDOS} ORDER BY p.fecha DESC, p.id DESC`);
    return r.rows.map((f) => this.mapear(f));
  }

  async crear(dto: CrearPedidoDto): Promise<Pedido> {
    const cliente = texto(dto.cliente);
    if (!cliente) throw new BadRequestException('Falta el nombre del cliente.');
    const estado = dto.estado || 'entregado';
    if (!ESTADOS_PEDIDO.includes(estado)) throw new BadRequestException('Estado no válido.');
    const unidades = Math.floor(numeroNoNegativo(dto.unidades ?? 1, 'Las unidades'));
    if (unidades < 1) throw new BadRequestException('Las unidades tienen que ser al menos 1.');
    const venta = numeroNoNegativo(dto.venta, 'La venta');
    const abono = Math.min(numeroNoNegativo(dto.abono, 'El abono'), venta);
    const fecha = fechaOpcional(dto.fecha, 'La fecha') || hoyColombia();
    let bodegaId: number | null = dto.bodegaId ? Number(dto.bodegaId) : null;
    if (!bodegaId && texto(dto.bodegaNueva)) bodegaId = await this.obtenerOCrearBodega(dto.bodegaNueva as string);

    const id = await this.db.transaccion(async (client) => {
      const r = await client.query(
        `INSERT INTO pedidos (fecha, cliente, bodega_id, referencia, talla, unidades, venta, costo, envio, estado, nota)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [fecha, cliente, bodegaId, texto(dto.referencia), texto(dto.talla), unidades, venta,
         numeroNoNegativo(dto.costo, 'El costo'), numeroNoNegativo(dto.envio, 'El envío'), estado, texto(dto.nota)],
      );
      if (abono > 0) await client.query(`INSERT INTO pedido_pagos (pedido_id, monto, fecha) VALUES ($1,$2,$3)`, [r.rows[0].id, abono, fecha]);
      return r.rows[0].id as number;
    });
    return this.obtener(id);
  }

  async obtener(id: number): Promise<Pedido> {
    const r = await this.db.pool().query(`${SELECT_PEDIDOS} WHERE p.id = $1`, [id]);
    if (!r.rowCount) throw new NotFoundException('No existe ese pedido.');
    return this.mapear(r.rows[0]);
  }

  async cambiarEstado(id: number, estado: string): Promise<Pedido> {
    if (!ESTADOS_PEDIDO.includes(estado)) throw new BadRequestException('Estado no válido.');
    const r = await this.db.pool().query(`UPDATE pedidos SET estado = $2 WHERE id = $1`, [id, estado]);
    if (!r.rowCount) throw new NotFoundException('No existe ese pedido.');
    return this.obtener(id);
  }

  async eliminar(id: number): Promise<{ ok: true }> {
    const r = await this.db.pool().query(`DELETE FROM pedidos WHERE id = $1`, [id]);
    if (!r.rowCount) throw new NotFoundException('No existe ese pedido.');
    return { ok: true };
  }

  async listarPagos(): Promise<PedidoPago[]> {
    const r = await this.db.pool().query(`SELECT * FROM pedido_pagos ORDER BY fecha DESC, id DESC`);
    return r.rows.map((f) => ({ id: f.id, pedidoId: f.pedido_id, monto: Number(f.monto), fecha: formatearFecha(f.fecha) as string, nota: f.nota }));
  }

  async crearPago(pedidoId: number, montoCrudo: any, fechaCruda?: string, nota?: string): Promise<PedidoPago> {
    const monto = numeroNoNegativo(montoCrudo, 'El abono');
    if (monto <= 0) throw new BadRequestException('El abono tiene que ser mayor a cero.');
    const fecha = fechaOpcional(fechaCruda, 'La fecha del abono') || hoyColombia();
    return this.db.transaccion(async (client) => {
      const p = await client.query(`SELECT venta FROM pedidos WHERE id = $1 FOR UPDATE`, [pedidoId]);
      if (!p.rowCount) throw new NotFoundException('No existe ese pedido.');
      const pagado = await client.query(`SELECT COALESCE(SUM(monto),0) AS t FROM pedido_pagos WHERE pedido_id = $1`, [pedidoId]);
      if (Number(pagado.rows[0].t) + monto > Number(p.rows[0].venta)) {
        throw new ConflictException('El abono supera lo que falta por pagar de este pedido.');
      }
      const r = await client.query(`INSERT INTO pedido_pagos (pedido_id, monto, fecha, nota) VALUES ($1,$2,$3,$4) RETURNING *`, [pedidoId, monto, fecha, texto(nota)]);
      const f = r.rows[0];
      return { id: f.id, pedidoId: f.pedido_id, monto: Number(f.monto), fecha: formatearFecha(f.fecha) as string, nota: f.nota };
    });
  }

  async eliminarPago(id: number): Promise<{ ok: true }> {
    const r = await this.db.pool().query(`DELETE FROM pedido_pagos WHERE id = $1`, [id]);
    if (!r.rowCount) throw new NotFoundException('No existe ese abono.');
    return { ok: true };
  }
}
