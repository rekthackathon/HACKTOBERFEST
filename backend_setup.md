# FastAPI Backend Setup

This backend is implemented using FastAPI and Supabase. Its Python package lives in `backend/app/`, separate from the Next.js frontend in `src/app/`. Do not create a root-level `app/` folder: Next.js would ignore `src/app/` and the frontend would return 404.

## Environment Variables

Create a `.env` file in the `backend/` directory with the following variables (never commit it):

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_service_role_key
```

*Note: Use the `service_role` key for backend operations that need to bypass RLS, or the `anon` key if you rely entirely on RLS. Given the current implementation's logic, the `service_role` key is recommended for full CRUD capabilities.*

## Installation

1. Install Python 3.10+
2. Install dependencies:

```sh
pip install fastapi uvicorn supabase python-dotenv
```

## Running the Server

From the repository root, start the FastAPI server using uvicorn:

```sh
cd backend
uvicorn app.api.router:app --reload
```

The server will be available at `http://127.0.0.1:8000`.
The interactive API documentation (Swagger UI) is available at `http://127.0.0.1:8000/docs`.

The existing `from app.core...` imports resolve from `backend/`. This command runs the Python service locally; the frontend Vercel deployment does not deploy this service automatically.

## Authentication

All protected endpoints require a Bearer token in the Authorization header:
`Authorization: Bearer <supabase_jwt_token>`
