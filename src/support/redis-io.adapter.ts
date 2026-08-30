import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';
import { baseRedisOptions } from '../redis/redis.options';

/**
 * Makes the support chat gateway work across more than one API replica.
 *
 * socket.io's default adapter keeps rooms and connected sockets in the
 * process's own memory, so with the HPA scaling the Deployment a
 * `server.to('admin').emit(...)` on pod A never reaches an admin whose socket
 * lives on pod B — messages silently vanish for half the users. The Redis
 * adapter publishes every emit over pub/sub so all replicas fan it out.
 *
 * This is only half the fix: the ingress must also pin a client's HTTP
 * long-polling handshake to one pod (`nginx.ingress.kubernetes.io/affinity:
 * cookie` on back-ingress-service.yaml), otherwise the polling upgrade
 * round-robins across pods and fails with "Session ID unknown" before a
 * websocket is ever established.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private clients: Redis[] = [];

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    // Dedicated connections: a client in subscriber mode can't run normal
    // commands, so these can't be shared with RedisService's client. No
    // commandTimeout either — a subscriber connection is idle by design and
    // must not be torn down for "slow" commands.
    const pubClient = new Redis(baseRedisOptions());
    const subClient = pubClient.duplicate();

    for (const [name, client] of [
      ['pub', pubClient],
      ['sub', subClient],
    ] as const) {
      client.on('error', (e) =>
        this.logger.error(`socket.io ${name} client error: ${e?.message}`),
      );
    }

    this.clients = [pubClient, subClient];
    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('socket.io Redis adapter connected');
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.clients.map((c) => c.quit()));
  }
}
