import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#1f3a5f' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#1f3a5f' } },
  },
  images: ['public/icons/favicon.svg'],
});
