// Módulo raíz: le dice a NestJS qué controladores y servicios existen.

import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './auth.guard';
import { ProductosController } from './productos.controller';
import { ProductosService } from './productos.service';

@Module({
  controllers: [AuthController, ProductosController],
  providers: [AuthService, JwtAuthGuard, ProductosService],
})
export class AppModule {}
