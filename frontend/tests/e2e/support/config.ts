export const E2E = {
  authPort: 54329,
  apiPort: 3101,
  webPort: 5174,
  authUrl: 'http://localhost:54329',
  apiUrl: 'http://localhost:3101',
  webUrl: 'http://localhost:5174',
  databaseUrl: process.env['E2E_DATABASE_URL'] ?? 'postgresql://localhost:5432/car_checkup_e2e',
} as const;
