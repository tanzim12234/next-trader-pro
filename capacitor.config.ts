import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.nexttrader.nextai',
  appName: 'NEXT AI',
  webDir: 'www',
  server: { url: 'https://next-trader-ai.vercel.app/next-ai.html', cleartext: false, androidScheme: 'https' },
  android: { allowMixedContent: false }
};
export default config;
