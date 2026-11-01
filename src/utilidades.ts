// utilidades.ts
//
// Pequeñas funciones compartidas por los servicios: fechas y validación de
// lo que llega en los pedidos.

import { BadRequestException } from '@nestjs/common';

// El driver "pg" devuelve las columnas DATE como objetos Date de JS (no
// como texto) — un Date.toString() da algo tipo "Thu Oct 01 2026 00:00:00
// GMT+0000...", NO el "2026-10-01" que necesita el frontend (ordenar,
// comparar meses, mostrar con fmtDate). Este helper cubre los dos casos
// (Date de verdad, o ya viniera como texto) y siempre devuelve YYYY-MM-DD.
export function formatearFecha(valor: any): string | null {
  if (!valor) return null;
  if (valor instanceof Date) {
    // OJO: "pg" arma este Date en hora LOCAL del servidor a partir del
    // DATE que guardó Postgres (no en UTC) — por eso se leen año/mes/día
    // con getFullYear()/getMonth()/getDate() (componentes locales) y NO
    // con toISOString() (que convierte a UTC y, si el servidor corriera
    // en una zona horaria con offset distinto a 0, podría correr la
    // fecha un día para atrás o adelante).
    const año = valor.getFullYear();
    const mes = String(valor.getMonth() + 1).padStart(2, '0');
    const dia = String(valor.getDate()).padStart(2, '0');
    return `${año}-${mes}-${dia}`;
  }
  return String(valor).slice(0, 10);
}

// Fecha de HOY en Colombia (YYYY-MM-DD). El servidor de Railway corre en
// UTC, así que new Date().toISOString() después de las 7 pm hora
// colombiana ya daría la fecha de mañana.
export function hoyColombia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

// Texto recortado, o null si vino vacío.
export function texto(valor: any): string | null {
  if (valor === undefined || valor === null) return null;
  return String(valor).trim() || null;
}

// Fecha YYYY-MM-DD válida, o null si vino vacía.
export function fechaOpcional(valor: any, nombre: string): string | null {
  const limpio = texto(valor);
  if (!limpio) return null;
  const fecha = new Date(limpio + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio) || isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== limpio) {
    throw new BadRequestException(`${nombre} no es una fecha válida.`);
  }
  return limpio;
}

// Número >= 0 (vacío cuenta como 0).
export function numeroNoNegativo(valor: any, nombre: string): number {
  if (valor === undefined || valor === null || valor === '') return 0;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) {
    throw new BadRequestException(`${nombre} tiene que ser un número mayor o igual a cero.`);
  }
  return numero;
}
