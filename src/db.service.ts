// db.service.ts
//
// Conexión única a PostgreSQL para todos los servicios. Si falta
// DATABASE_URL (o la base no responde), el backend arranca igual pero los
// endpoints de datos contestan con un error claro en vez de caerse.

import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { prepararEsquema } from './esquema';

@Injectable()
export class DbService implements OnModuleInit {
  private readonly logger = new Logger(DbService.name);
  private conexion: Pool | null = null;

  async onModuleInit() {
    if (!process.env.DATABASE_URL) {
      this.logger.warn('DATABASE_URL no está configurada — el inventario no va a funcionar hasta que se agregue el plugin de PostgreSQL en Railway.');
      return;
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await prepararEsquema(pool);
      this.conexion = pool;
      this.logger.log('Conectado a PostgreSQL — tablas productos, abonos y gastos listas.');
    } catch (error) {
      this.logger.error('No se pudo conectar/preparar la base de datos: ' + (error as Error).message);
      await pool.end().catch(() => undefined);
    }
  }

  pool(): Pool {
    if (!this.conexion) {
      throw new ServiceUnavailableException('El inventario no está disponible: falta configurar la base de datos en el servidor.');
    }
    return this.conexion;
  }

  // Corre fn dentro de una transacción: o se guarda todo, o nada.
  async transaccion<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool().connect();
    try {
      await client.query('BEGIN');
      const resultado = await fn(client);
      await client.query('COMMIT');
      return resultado;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
