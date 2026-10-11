import { JsonLd, websiteData } from '@/lib/structured-data';

// トップは共通部分（app/(site)/layout.tsx）だけで表示する。ここには検索エンジン向けの説明だけを置く
export default function Home() {
  return <JsonLd data={websiteData()} />;
}
