// Módulo raíz: le dice a NestJS qué controladores y servicios existen.

import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './auth.guard';
import { DbService } from './db.service';
import { GastosService } from './gastos.service';
import { AbonosController } from './abonos.controller';
import { DatosController } from './datos.controller';
import { GastosController } from './gastos.controller';
import { ProductosController } from './productos.controller';
import { ProductosService } from './productos.service';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';

@Module({
  controllers: [AuthController, ProductosController, AbonosController, GastosController, DatosController, PedidosController],
  providers: [AuthService, JwtAuthGuard, DbService, ProductosService, GastosService, PedidosService],
})
export class AppModule {}
