from fastapi import FastAPI, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date, datetime
from database import supabase
from auth import verify_user

app = FastAPI(title="ASEAN Startup Gateway Backend")

# --- Models ---

class Profile(BaseModel):
    id: str
    display_name: str = Field(..., min_length=1, max_length=160)

class StartupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    description: str = Field(..., min_length=1, max_length=4000)
    industry: str = Field(..., min_length=1, max_length=120)
    country: str = Field(..., pattern=r'^(BN|KH|ID|LA|MY|MM|PH|SG|TH|TL|VN)$')
    stage: str = Field(..., pattern=r'^(idea|prototype|mvp|growth|scale)$')
    incorporation_date: Optional[date] = None
    company_size: Optional[int] = Field(None, ge=1, le=1000000)
    funding_stage: Optional[str] = Field(None, pattern=r'^(bootstrapped|pre_seed|seed|series_a|series_b_plus)$')

class Startup(StartupCreate):
    id: str
    owner_id: str
    created_at: datetime
    updated_at: datetime

class Opportunity(BaseModel):
    id: str
    title: str
    description: str
    kind: str
    countries: List[str]
    deadline: Optional[datetime] = None
    application_url: str
    source_text: str
    evidence: List[dict]
    is_mock: bool = False
    created_at: datetime

class Application(BaseModel):
    opportunity_id: str
    startup_id: str
    cover_letter: str
    additional_info: Optional[str] = None

# --- Endpoints ---

@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Profiles
@app.get("/profiles/{user_id}", response_model=Profile)
async def get_profile(user_id: str, current_user=Depends(verify_user)):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this profile")

    response = supabase.table("profiles").select("*").eq("id", user_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return response.data[0]

@app.post("/profiles", response_model=Profile, status_code=status.HTTP_201_CREATED)
async def create_profile(profile: Profile, current_user=Depends(verify_user)):
    if current_user.id != profile.id:
        raise HTTPException(status_code=403, detail="Profile ID must match authenticated user ID")

    response = supabase.table("profiles").insert(profile.dict()).execute()
    return response.data[0]

# Startups
@app.post("/startups", response_model=Startup, status_code=status.HTTP_201_CREATED)
async def create_startup(startup: StartupCreate, current_user=Depends(verify_user)):
    data = startup.dict()
    data["owner_id"] = current_user.id

    response = supabase.table("startups").insert(data).execute()
    if not response.data:
        raise HTTPException(status_code=400, detail="Failed to create startup")
    return response.data[0]

@app.get("/startups/me", response_model=Startup)
async def get_my_startup(current_user=Depends(verify_user)):
    response = supabase.table("startups").select("*").eq("owner_id", current_user.id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Startup not found for this user")
    return response.data[0]

@app.put("/startups/me", response_model=Startup)
async def update_my_startup(startup: StartupCreate, current_user=Depends(verify_user)):
    existing = supabase.table("startups").select("id").eq("owner_id", current_user.id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Startup not found")

    startup_id = existing.data[0]["id"]
    response = supabase.table("startups").update(startup.dict()).eq("id", startup_id).execute()
    return response.data[0]

@app.delete("/startups/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_startup(current_user=Depends(verify_user)):
    existing = supabase.table("startups").select("id").eq("owner_id", current_user.id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Startup not found")

    supabase.table("startups").delete().eq("id", existing.data[0]["id"]).execute()
    return None

# Opportunities
@app.get("/opportunities", response_model=List[Opportunity])
async def list_opportunities():
    response = supabase.table("opportunities").select("*").execute()
    return response.data

@app.get("/opportunities/{opp_id}", response_model=Opportunity)
async def get_opportunity(opp_id: str):
    response = supabase.table("opportunities").select("*").eq("id", opp_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    return response.data[0]

# Funding Applications
@app.post("/api/applications", status_code=status.HTTP_201_CREATED)
async def submit_application(application: Application, current_user=Depends(verify_user)):
    # Validate that the startup belongs to the user
    startup_check = supabase.table("startups").select("id").eq("id", application.startup_id).eq("owner_id", current_user.id).execute()
    if not startup_check.data:
        raise HTTPException(status_code=403, detail="You do not own the startup associated with this application")

    # Insert the application into the database
    # Note: The 'applications' table should exist in Supabase. If not, it needs to be created.
    try:
        response = supabase.table("applications").insert({
            "opportunity_id": application.opportunity_id,
            "startup_id": application.startup_id,
            "user_id": current_user.id,
            "cover_letter": application.cover_letter,
            "additional_info": application.additional_info
        }).execute()

        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to submit application")

        return {"message": "Application submitted successfully", "id": response.data[0]["id"]}
    except Exception as e:
        # If the table doesn't exist, we catch the error to notify the user
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
