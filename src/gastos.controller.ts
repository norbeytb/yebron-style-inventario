// gastos.controller.ts
//
// Todos los endpoints exigen sesión iniciada (JwtAuthGuard) — ver
// auth.guard.ts.

import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './auth.guard';
import { CrearGastoDto, Gasto, GastosService } from './gastos.service';

@Controller('gastos')
@UseGuards(JwtAuthGuard)
export class GastosController {
  constructor(private readonly gastosService: GastosService) {}

  @Get()
  listar(): Promise<Gasto[]> {
    return this.gastosService.listar();
  }

  @Post()
  crear(@Body() dto: CrearGastoDto): Promise<Gasto> {
    return this.gastosService.crear(dto || ({} as CrearGastoDto));
  }

  @Delete(':id')
  eliminar(@Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    return this.gastosService.eliminar(id);
  }
}
