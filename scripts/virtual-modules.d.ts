/** scripts/vite-model-sizes.ts が作る、表示用 VRM の大きさ（URL → バイト数） */
declare module 'virtual:model-sizes' {
  const sizes: Record<string, number>;
  export default sizes;
}
