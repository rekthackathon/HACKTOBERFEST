from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import supabase

security = HTTPBearer()

async def verify_user(token: HTTPAuthorizationCredentials = Depends(security)):
    """
    Extracts the Bearer token and verifies it using Supabase.
    Returns the user object if valid, otherwise raises 401.
    """
    try:
        # Verify the JWT token with Supabase
        user_response = supabase.auth.get_user(token.credentials)
        if not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token"
            )
        return user_response.user
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )
