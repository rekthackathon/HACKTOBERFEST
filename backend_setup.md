# FastAPI Backend Setup

This backend is implemented using FastAPI and Supabase.

## Environment Variables

Create a `.env` file in the root directory with the following variables:

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

Start the FastAPI server using uvicorn:

```sh
uvicorn main:app --reload
```

The server will be available at `http://127.0.0.1:8000`.
The interactive API documentation (Swagger UI) is available at `http://127.0.0.1:8000/docs`.

## Authentication

All protected endpoints require a Bearer token in the Authorization header:
`Authorization: Bearer <supabase_jwt_token>`
