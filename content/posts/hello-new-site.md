---
title: サイトをリニューアルしました（サンプル記事）
date: 2026-10-08
category: お知らせ
summary: ブログの見た目を確かめるための仮の記事です。
draft: true
thumbnail: /posts/hello-new-site/cover.webp
---

これは**ブログの表示を確かめるためのサンプル記事**です。本物の記事を書いたら、このファイル（`content/posts/hello-new-site.md`）は消してください。

## 見出し（##）

本文はふつうに書くだけで段落になります。
1回の改行は、そのまま改行として表示されます。

空行をはさむと、次の段落になります。

### 小見出し（###）

- 箇条書きは `-` で始めます
- [リンク](https://bastelcolor.booth.pm/) も書けます
- **太字** や _斜体_ も使えます

1. 番号付きのリスト
2. 2つめ

## 画像

![自作トゥーンシェーダーのキュイプル](/posts/hello-new-site/toon.webp)

> 引用は `>` で始めます。

## コード

```csharp
public void TakeDamage(float staminaDamage)
{
    playerStamina.Value -= staminaDamage;
}
```
