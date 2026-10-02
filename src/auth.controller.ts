// auth.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService, SesionResultado } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: { usuario?: string; clave?: string }): SesionResultado {
    return this.authService.login(dto?.usuario || '', dto?.clave || '');
  }
}
