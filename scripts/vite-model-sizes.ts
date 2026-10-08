import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

const MODULE_ID = 'virtual:model-sizes';
const RESOLVED_ID = `\0${MODULE_ID}`;

/**
 * public/models/ の VRM の大きさ（バイト数）を、
 * `import modelSizes from 'virtual:model-sizes'` で読めるようにする。
 *
 * 読み込み中の % 表示に使う。GitHub Pages はファイルを圧縮して送るので、
 * 通信で届く大きさ（Content-Length）が実際の大きさより小さく、
 * それで割ると % が早く 100 になってしまうため。
 */
export function modelSizes(): Plugin {
  const modelsDir = path.resolve('public/models');
  return {
    name: 'model-sizes',
    resolveId(id) {
      return id === MODULE_ID ? RESOLVED_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      const sizes: Record<string, number> = {};
      const names = await readdir(modelsDir).catch(() => []);
      for (const name of names) {
        if (!name.endsWith('.vrm')) continue;
        sizes[`/models/${name}`] = (await stat(path.join(modelsDir, name))).size;
      }
      return `export default ${JSON.stringify(sizes)};`;
    },
  };
}
