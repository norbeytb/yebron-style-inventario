// pedidos.controller.ts — "Bajo pedido" y bodegas. Todo exige sesión.

import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './auth.guard';
import { Bodega, CrearPedidoDto, Pedido, PedidoPago, PedidosService } from './pedidos.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class PedidosController {
  constructor(private readonly s: PedidosService) {}

  @Get('bodegas') bodegas(): Promise<Bodega[]> { return this.s.listarBodegas(); }
  @Post('bodegas') async crearBodega(@Body() b: { nombre: string }): Promise<{ id: number }> {
    return { id: await this.s.obtenerOCrearBodega(b?.nombre) };
  }

  @Get('pedidos') listar(): Promise<Pedido[]> { return this.s.listar(); }
  @Post('pedidos') crear(@Body() dto: CrearPedidoDto): Promise<Pedido> { return this.s.crear(dto || ({} as CrearPedidoDto)); }
  @Patch('pedidos/:id/estado') estado(@Param('id', ParseIntPipe) id: number, @Body() b: { estado: string }): Promise<Pedido> {
    return this.s.cambiarEstado(id, b?.estado);
  }
  @Delete('pedidos/:id') eliminar(@Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> { return this.s.eliminar(id); }

  @Get('pedido-pagos') pagos(): Promise<PedidoPago[]> { return this.s.listarPagos(); }
  @Post('pedidos/:id/pagos') pago(@Param('id', ParseIntPipe) id: number, @Body() b: { monto: number; fecha?: string; nota?: string }): Promise<PedidoPago> {
    return this.s.crearPago(id, b?.monto, b?.fecha, b?.nota);
  }
  @Delete('pedido-pagos/:id') borrarPago(@Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> { return this.s.eliminarPago(id); }
}
