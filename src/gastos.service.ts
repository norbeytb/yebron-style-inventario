// gastos.service.ts
//
// Gastos del negocio que no son el costo de un par (publicidad, empaques,
// transporte...). Se restan de la ganancia en el Resumen ("ganancia neta").

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from './db.service';
import { fechaOpcional, formatearFecha, hoyColombia, numeroNoNegativo, texto } from './utilidades';

export interface Gasto {
  id: number;
  fecha: string;
  categoria: string;
  descripcion: string | null;
  monto: number;
}

export interface CrearGastoDto {
  fecha?: string;
  categoria?: string;
  descripcion?: string;
  monto: number;
}

@Injectable()
export class GastosService {
  constructor(private readonly db: DbService) {}

  private mapearFila(fila: any): Gasto {
    return {
      id: fila.id,
      fecha: formatearFecha(fila.fecha),
      categoria: fila.categoria,
      descripcion: fila.descripcion || null,
      monto: Number(fila.monto) || 0,
    };
  }

  async listar(): Promise<Gasto[]> {
    const resultado = await this.db.pool().query(`SELECT * FROM gastos ORDER BY fecha DESC, id DESC`);
    return resultado.rows.map((fila) => this.mapearFila(fila));
  }

  async crear(dto: CrearGastoDto): Promise<Gasto> {
    const monto = numeroNoNegativo(dto.monto, 'El monto');
    if (monto <= 0) {
      throw new BadRequestException('El monto del gasto tiene que ser mayor a cero.');
    }
    const resultado = await this.db.pool().query(
      `INSERT INTO gastos (fecha, categoria, descripcion, monto) VALUES ($1, $2, $3, $4) RETURNING *`,
      [fechaOpcional(dto.fecha, 'La fecha') || hoyColombia(), texto(dto.categoria) || 'Otro', texto(dto.descripcion), monto],
    );
    return this.mapearFila(resultado.rows[0]);
  }

  async eliminar(id: number): Promise<{ ok: true }> {
    const resultado = await this.db.pool().query(`DELETE FROM gastos WHERE id = $1`, [id]);
    if (resultado.rowCount === 0) {
      throw new NotFoundException('No existe ese gasto.');
    }
    return { ok: true };
  }
}
