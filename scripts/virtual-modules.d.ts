/** scripts/vite-model-sizes.ts が作る、表示用 VRM の大きさ（URL → バイト数） */
declare module 'virtual:model-sizes' {
  const sizes: Record<string, number>;
  export default sizes;
}

/** scripts/vite-model-stats.ts が作る、表示用 VRM のポリゴン数など（URL → 数） */
declare module 'virtual:post-thumbnails' {
  /** scripts/vite-post-thumbnails.ts が作る、記事のサムネイルの横長版（元の画像の URL → 横長の画像の URL） */
  const wide: Record<string, string>;
  export default wide;
}

/** scripts/vite-model-stats.ts が作る、表示用 VRM のポリゴン数など（URL → 数） */
declare module 'virtual:model-stats' {
  const stats: Record<string, import('./vite-model-stats').ModelStats>;
  export default stats;
}
