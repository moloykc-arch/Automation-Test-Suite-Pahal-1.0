// env.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  projects: [
    // ---------------- DEV ----------------
    {
      name: 'dev',
      use: {
        cdbuLoginUrl:
          'https://auth.dev.simadvisory.com/auth/realms/D_SPRICED/protocol/openid-connect/auth?client_id=CHN_D_SPRICED_Client&redirect_uri=https%3A%2F%2Fcdbu-dev.alpha.simadvisory.com%2Fspriced-data',
        nrpUrl:
          'https://cdbu-nrp-dev.alpha.simadvisory.com'
      }
    },

    // ---------------- QA ----------------
    {
      name: 'qa',
      use: {
        cdbuLoginUrl:
          'https://auth.dev.simadvisory.com/auth/realms/D_SPRICED/protocol/openid-connect/auth?client_id=CHN_D_SPRICED_Client&redirect_uri=https%3A%2F%2Fcdbu-qa.alpha.simadvisory.com%2F&state=257c5f1f-a782-4e5d-b4fa-44b67d0bb2f4&response_mode=fragment&response_type=code&scope=openid&nonce=140a383a-26d9-4c1a-8e86-15f0618fb431',
        nrpUrl:
          'https://cdbu-nrp-qa.alpha.simadvisory.com'
      }
    },

    // ---------------- PROD ----------------
    {
      name: 'prod',
      use: {
        cdbuLoginUrl:
          'https://auth.prod.simadvisory.com/auth/realms/D_SPRICED/protocol/openid-connect/auth?client_id=CHN_D_SPRICED_Client&redirect_uri=https%3A%2F%2Fcdbu-prod.alpha.simadvisory.com%2Fspriced-data',
        nrpUrl:
          'https://cdbu-nrp-prod.alpha.simadvisory.com'
      }
    }
  ]
});
