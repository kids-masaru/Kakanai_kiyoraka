# Kakanai v2 - 介護業務DX

Next.js + FastAPI (Railway) + Cloudflare R2 を使用した介護業務DXアプリケーション

## Architecture

```
Frontend (Vercel)     →  Backend (Railway)  →  Google Sheets
     ↓                        ↓
Cloudflare R2         →  Google Gemini AI
(Audio Storage)
```

## Project Structure

```
Kakanai_kiyoraka/
├── frontend/          # Next.js アプリ (Vercel)
├── backend/           # FastAPI アプリ (Railway)
├── _legacy/           # 旧Streamlitコード（参照用）
└── docs/              # ドキュメント
```

## Getting Started

### Backend (Railway)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend (Vercel)
```bash
cd frontend
npm install
npm run dev
```

## Features

- 📄 PDF/音声ファイルからの情報抽出
- 🧠 AIによるアセスメント支援
- 📊 Googleスプレッドシート自動転記
- 👨‍👩‍👧 ジェノグラム・身体図生成
