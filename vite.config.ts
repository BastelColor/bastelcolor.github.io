import vinext from 'vinext';
import { defineConfig } from 'vite';
import { markdownAsString } from './scripts/vite-markdown';
import { modelSizes } from './scripts/vite-model-sizes';

export default defineConfig({
  server: {
    // 確認用の URL を http://localhost:3000 に固定する（docs/content-guide.md にも記載）
    port: 3000,
  },
  plugins: [markdownAsString(), modelSizes(), vinext()],
});
