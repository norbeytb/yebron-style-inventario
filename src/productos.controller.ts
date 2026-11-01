// productos.controller.ts
//
// Todos los endpoints exigen sesión iniciada (JwtAuthGuard) — ver
// auth.guard.ts.

import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './auth.guard';
import { CrearProductoDto, EditarProductoDto, Producto, ProductosService, VenderProductoDto } from './productos.service';

@Controller('productos')
@UseGuards(JwtAuthGuard)
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get()
  listar(): Promise<Producto[]> {
    return this.productosService.listar();
  }

  @Post()
  crear(@Body() dto: CrearProductoDto): Promise<Producto> {
    return this.productosService.crear(dto);
  }

  @Patch(':id')
  editar(@Param('id', ParseIntPipe) id: number, @Body() dto: EditarProductoDto): Promise<Producto> {
    return this.productosService.editar(id, dto);
  }

  @Patch(':id/vender')
  vender(@Param('id', ParseIntPipe) id: number, @Body() dto: VenderProductoDto): Promise<Producto> {
    return this.productosService.vender(id, dto);
  }

  @Patch(':id/abonar')
  abonar(@Param('id', ParseIntPipe) id: number, @Body() dto: { monto: number }): Promise<Producto> {
    return this.productosService.abonar(id, dto?.monto);
  }

  @Patch(':id/revertir-venta')
  revertirVenta(@Param('id', ParseIntPipe) id: number): Promise<Producto> {
    return this.productosService.revertirVenta(id);
  }

  @Delete(':id')
  eliminar(@Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    return this.productosService.eliminar(id);
  }
}
