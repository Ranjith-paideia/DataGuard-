import { defineConfig } from '@playwright/test';
import 'dotenv/config';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  projects: [
    {
      name: 'dataguard-local',
      testDir: './tests',
      testIgnore: ['**/parabank/**'],
      use: {
        baseURL: process.env.API_BASE_URL || 'http://localhost:3001',
        trace: 'on-first-retry',
      },
    },
    {
      name: 'parabank',
      testDir: './tests/parabank',
      use: {
        baseURL: 'https://parabank.parasoft.com/parabank/services/bank/',
        extraHTTPHeaders: {
          Accept: 'application/json',
        },
        trace: 'on-first-retry',
      },
    },
  ],
  webServer: {
    command: 'npm run start:mock',
    url: 'http://localhost:3001/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
