// main.ts
//
// Punto de entrada. Arranca el servidor y, además, le dice a Express que
// sirva la carpeta "public/" (ahí vive index.html, la página completa con
// login + Inventario + Ventas + Resumen) — así este MISMO backend atiende
// tanto la API (/auth/..., /productos/...) como la página que ves en el
// navegador, sin tener que publicar el frontend en otro lugar aparte.
//
// __dirname acá, una vez compilado, es la carpeta "dist" (donde queda
// main.js después de "npm run build") — por eso se sube un nivel ("..")
// para llegar a la raíz del proyecto y entrar a "public".

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(json({ limit: '5mb' }));
  app.enableCors({ origin: '*' });
  app.useStaticAssets(join(__dirname, '..', 'public'));

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Yebron Style — Inventario escuchando en el puerto ${port}`);
}
bootstrap();
