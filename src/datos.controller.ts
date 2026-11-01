// datos.controller.ts
//
// Todos los endpoints exigen sesión iniciada (JwtAuthGuard) — ver
// auth.guard.ts.

import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './auth.guard';
import { Abono, Producto, ProductosService } from './productos.service';
import { Gasto, GastosService } from './gastos.service';

// Todo junto en un solo pedido — lo que carga la página al abrir y después
// de cada cambio.
@Controller('datos')
@UseGuards(JwtAuthGuard)
export class DatosController {
  constructor(
    private readonly productosService: ProductosService,
    private readonly gastosService: GastosService,
  ) {}

  @Get()
  async todo(): Promise<{ productos: Producto[]; abonos: Abono[]; gastos: Gasto[] }> {
    const [productos, abonos, gastos] = await Promise.all([
      this.productosService.listar(),
      this.productosService.listarAbonos(),
      this.gastosService.listar(),
    ]);
    return { productos, abonos, gastos };
  }
}
