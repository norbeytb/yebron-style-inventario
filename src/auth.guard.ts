// auth.guard.ts
//
// Protege cualquier endpoint que lo tenga puesto (@UseGuards(JwtAuthGuard)):
// exige el header "Authorization: Bearer <token>" y, si el token es válido,
// deja seguir el pedido. Mismo patrón que auth.guard.ts del proyecto de la
// Creadora de Landing.

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const header = String(request.headers['authorization'] || '');
    const match = header.match(/^Bearer (.+)$/);
    if (!match) {
      throw new UnauthorizedException('Falta iniciar sesión.');
    }
    const datos = this.authService.verificarToken(match[1]);
    request.usuario = datos.usuario;
    return true;
  }
}
