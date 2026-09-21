import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'uk.co.sable.schemy',
  appName: 'Schemy',
  webDir: 'dist',
  backgroundColor: '#101410',
  android: {
    backgroundColor: '#101410',
    allowMixedContent: false,
  },
};

export default config;
