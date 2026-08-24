import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
// NestJS's --watch build (SWC) doesn't apply the same esModuleInterop
// wrapping tsc does for `import x from 'y'` on a CJS `module.exports = fn`
// package — `import x = require('y')` compiles to a plain require() in
// every compiler and works everywhere.
import compression = require('compression');
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ErrorCollectorService } from './common/error-collector/error-collector.service';
import { config } from 'dotenv';

config();

async function bootstrap() {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? [];
  if (allowedOrigins.length === 0) {
    console.error('FATAL: ALLOWED_ORIGINS env var is required and must not be empty');
    process.exit(1);
  }

  // console.*, not the Nest logger: `bufferLogs` holds every logged line until
  // useLogger() below, so anything that hangs or throws inside
  // NestFactory.create produces a completely silent process. These lines
  // bypass the buffer.
  console.log('[boot] creating Nest application (DB connect + migrations)…');

  const watchdog = setTimeout(() => {
    console.error(
      '[boot] still starting after 60s — most likely the database is unreachable, ' +
        'or a pending migration is blocked on a table lock.',
    );
  }, 60_000);
  watchdog.unref?.();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bufferLogs: true });
  clearTimeout(watchdog);
  console.log('[boot] Nest application created');

  // Express's body-parser defaults to a 100kb JSON limit — too small for
  // legitimate admin payloads (bulk translation saves, product media
  // arrays). `rawBody: true` above is still honored — this re-registers the
  // parser, it doesn't disable raw-body capture, which a future Stripe
  // webhook signature check will depend on.
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true });

  // Requests reach the process through nginx/an ingress in production.
  // Trusting private ranges rather than a fixed hop count means Express
  // walks left past every internal RFC1918/loopback hop and stops at the
  // first public address: the real client, whatever the topology does next.
  app.getHttpAdapter().getInstance().set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

  app.use(compression());

  app.useLogger(app.get(Logger));
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  app.useGlobalFilters(new AllExceptionsFilter(app.get(ErrorCollectorService)));
  const port = process.env.BACK_PORT || 3000; 
  await app.listen(port);
  console.log(`[boot] listening on ${port}`);
}

// Without this an unhandled rejection can leave the process "running" with an
// empty log while the service has no endpoints. Fail loudly and exit so the
// orchestrator restarts it and the reason is on stdout.
bootstrap().catch((err) => {
  console.error('[boot] FAILED to start:', err);
  process.exit(1);
});
