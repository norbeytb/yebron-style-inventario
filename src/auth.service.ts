// auth.service.ts
//
// Login SIMPLE a propósito (pedido explícito 02/10): esta herramienta es
// para un solo usuario (Norbey), así que no hace falta una tabla de
// "usuarios" ni registro — el usuario y la clave quedan fijos en dos
// variables de entorno de Railway (INV_USUARIO / INV_CLAVE). Quien entre
// con ese usuario+clave recibe un JWT (JSON Web Token) que el frontend
// guarda y manda en cada pedido ("Authorization: Bearer <token>") — mismo
// mecanismo de sesión que usa el proyecto de la Creadora de Landing
// (auth.service.ts ahí), pero sin la parte de cuentas por correo porque acá
// no hace falta.
//
// Variables de entorno que hay que configurar en Railway:
//   INV_USUARIO   — el usuario con el que vas a entrar (ej. "norbey")
//   INV_CLAVE     — la contraseña con la que vas a entrar
//   JWT_SECRET    — cualquier texto largo y aleatorio (ej. generado con
//                   `openssl rand -hex 32`). Sin esto, el backend arranca
//                   igual pero usa una clave de emergencia insegura — hay
//                   que configurar la de verdad antes de usar esto en serio.

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

export interface SesionResultado {
  token: string;
  usuario: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private get jwtSecret(): string {
    if (!process.env.JWT_SECRET) {
      this.logger.warn('JWT_SECRET no está configurada — usando una clave de emergencia insegura. Configurá JWT_SECRET en Railway antes de usar esto en serio.');
      return 'yebron-style-clave-de-emergencia-insegura-configurar-JWT_SECRET';
    }
    return process.env.JWT_SECRET;
  }

  // Compara en tiempo constante (crypto.timingSafeEqual) para no filtrar,
  // por cuánto tarda la comparación, si el usuario/clave que mandaron
  // acertó parte del valor real — mismo cuidado que usa
  // compararSecretoSso() en el proyecto de la Creadora de Landing.
  private comparar(valor: string, esperado: string): boolean {
    const bufEsperado = Buffer.from(String(esperado || ''));
    const bufRecibido = Buffer.from(String(valor || ''));
    if (bufEsperado.length !== bufRecibido.length) return false;
    return crypto.timingSafeEqual(bufEsperado, bufRecibido);
  }

  login(usuario: string, clave: string): SesionResultado {
    const usuarioEsperado = process.env.INV_USUARIO;
    const claveEsperada = process.env.INV_CLAVE;
    if (!usuarioEsperado || !claveEsperada) {
      this.logger.warn('INV_USUARIO/INV_CLAVE no están configuradas — nadie puede entrar todavía.');
      throw new UnauthorizedException('El login todavía no está configurado en el servidor (faltan INV_USUARIO/INV_CLAVE en Railway).');
    }
    if (!this.comparar(usuario || '', usuarioEsperado) || !this.comparar(clave || '', claveEsperada)) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos.');
    }
    const token = jwt.sign({ sub: usuarioEsperado }, this.jwtSecret, { expiresIn: '30d' });
    return { token, usuario: usuarioEsperado };
  }

  // Usado por JwtAuthGuard en cada pedido protegido.
  verificarToken(token: string): { usuario: string } {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as jwt.JwtPayload;
      return { usuario: String(payload.sub || '') };
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida — volvé a iniciar sesión.');
    }
  }
}
