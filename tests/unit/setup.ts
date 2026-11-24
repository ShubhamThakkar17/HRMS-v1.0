// Unit-test environment. Integration tests use a separate database (TEST_DATABASE_URL).
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/hrms_test?schema=public';
process.env.FACE_TEMPLATE_KEY ??= Buffer.alloc(32, 7).toString('base64');
process.env.APP_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('base64');
process.env.AUTH_SECRET ??= 'test-secret';
(process.env as Record<string, string>).NODE_ENV = 'test';
