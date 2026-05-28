# FitStreak セットアップ手順

## STEP 1 : .env.local を作る

ターミナルでこのフォルダに移動して以下を実行：

```bash
touch .env.local
```

中身をテキストエディタで開いて書く：

```
NEXT_PUBLIC_SUPABASE_URL=https://kdchorjxfggikwjqwxvx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=あなたのanonキー
```

---

## STEP 2 : ローカルで動かす

```bash
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開く

---

## STEP 3 : GitHubにプッシュ

```bash
git init
git add .
git commit -m "first commit"
git remote add origin https://github.com/ユーザー名/fitstreak.git
git push -u origin main
```

---

## STEP 4 : Vercelにデプロイ

1. https://vercel.com → New Project → GitHubのリポジトリを選択
2. Environment Variables に以下を追加：
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
3. Deploy を押す → 完了！
