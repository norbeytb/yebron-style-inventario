// abonos.controller.ts
//
// Todos los endpoints exigen sesión iniciada (JwtAuthGuard) — ver
// auth.guard.ts.

import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './auth.guard';
import { Abono, CrearAbonoDto, ProductosService } from './productos.service';

@Controller('abonos')
@UseGuards(JwtAuthGuard)
export class AbonosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get()
  listar(): Promise<Abono[]> {
    return this.productosService.listarAbonos();
  }

  @Post()
  crear(@Body() dto: CrearAbonoDto): Promise<Abono> {
    return this.productosService.crearAbono(dto || ({} as CrearAbonoDto));
  }

  @Delete(':id')
  eliminar(@Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    return this.productosService.eliminarAbono(id);
  }
}
