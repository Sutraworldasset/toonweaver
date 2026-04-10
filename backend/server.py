from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import bcrypt
import jwt
import secrets
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from enum import Enum
import io

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_ALGORITHM = "HS256"

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

# Create the main app
app = FastAPI(title="Toonweaver API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== ENUMS ==============
class UserRole(str, Enum):
    ADMIN = "admin"
    SUPERVISOR = "supervisor"
    ANIMATOR = "animator"

class ShotStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    RETAKE = "retake"
    APPROVED = "approved"

# ============== MODELS ==============
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: UserRole = UserRole.ANIMATOR

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: datetime

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    onedrive_link: Optional[str] = ""

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    onedrive_link: Optional[str] = None

class TeamMemberAdd(BaseModel):
    user_id: str
    role: UserRole

class ShotCreate(BaseModel):
    shot_id: str
    description: Optional[str] = ""
    frame_start: int
    frame_end: int
    deadline: Optional[datetime] = None

class ShotUpdate(BaseModel):
    description: Optional[str] = None
    frame_start: Optional[int] = None
    frame_end: Optional[int] = None
    deadline: Optional[datetime] = None
    status: Optional[ShotStatus] = None
    assigned_to: Optional[str] = None

class FileLink(BaseModel):
    name: str
    url: str
    file_type: Optional[str] = ""

class FeedbackCreate(BaseModel):
    comment: str
    attachments: Optional[List[FileLink]] = []

# ============== PASSWORD UTILS ==============
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

# ============== JWT UTILS ==============
def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
        "type": "access"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

# ============== AUTH DEPENDENCY ==============
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        del user["_id"]
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_role(roles: List[UserRole]):
    async def role_checker(user: dict = Depends(get_current_user)):
        if user["role"] not in [r.value for r in roles]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return role_checker

# ============== ACTIVITY LOG ==============
async def log_activity(project_id: str, user_id: str, user_name: str, action: str, details: str = ""):
    await db.activity_logs.insert_one({
        "project_id": project_id,
        "user_id": user_id,
        "user_name": user_name,
        "action": action,
        "details": details,
        "timestamp": datetime.now(timezone.utc)
    })

# ============== NOTIFICATIONS ==============
async def create_notification(user_id: str, title: str, message: str, link: str = ""):
    await db.notifications.insert_one({
        "user_id": user_id,
        "title": title,
        "message": message,
        "link": link,
        "read": False,
        "created_at": datetime.now(timezone.utc)
    })

# ============== AUTH ROUTES ==============
@api_router.post("/auth/register")
async def register(user_data: UserCreate, response: Response):
    email = user_data.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed = hash_password(user_data.password)
    user_doc = {
        "email": email,
        "password_hash": hashed,
        "name": user_data.name,
        "role": user_data.role.value,
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    return {
        "id": user_id,
        "email": email,
        "name": user_data.name,
        "role": user_data.role.value,
        "created_at": user_doc["created_at"]
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin, response: Response, request: Request):
    email = credentials.email.lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    
    # Check brute force
    attempts = await db.login_attempts.find_one({"identifier": identifier})
    if attempts and attempts.get("count", 0) >= 5:
        lockout_until = attempts.get("lockout_until")
        if lockout_until and datetime.now(timezone.utc) < lockout_until:
            raise HTTPException(status_code=429, detail="Too many login attempts. Try again in 15 minutes.")
    
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        # Increment failed attempts
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {
                "$inc": {"count": 1},
                "$set": {"lockout_until": datetime.now(timezone.utc) + timedelta(minutes=15)}
            },
            upsert=True
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Clear failed attempts on success
    await db.login_attempts.delete_one({"identifier": identifier})
    
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    return {
        "id": user_id,
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "created_at": user["created_at"]
    }

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")
    return {"message": "Logged out successfully"}

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return user

@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        access_token = create_access_token(str(user["_id"]), user["email"])
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
        return {"message": "Token refreshed"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

# ============== USERS ROUTES ==============
@api_router.get("/users")
async def get_users(user: dict = Depends(get_current_user)):
    if user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    users = await db.users.find({}, {"password_hash": 0}).to_list(1000)
    return [{"id": str(u["_id"]), **{k: v for k, v in u.items() if k != "_id"}} for u in users]

@api_router.get("/users/{user_id}")
async def get_user(user_id: str, user: dict = Depends(get_current_user)):
    target = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": str(target["_id"]), **{k: v for k, v in target.items() if k != "_id"}}

@api_router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, role: UserRole, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can change roles")
    
    result = await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"role": role.value}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Role updated"}

# ============== PROJECTS ROUTES ==============
@api_router.post("/projects")
async def create_project(project: ProjectCreate, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can create projects")
    
    project_doc = {
        "name": project.name,
        "description": project.description,
        "onedrive_link": project.onedrive_link,
        "created_by": user["id"],
        "team_members": [{"user_id": user["id"], "role": "admin"}],
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.projects.insert_one(project_doc)
    project_id = str(result.inserted_id)
    
    await log_activity(project_id, user["id"], user["name"], "project_created", f"Created project: {project.name}")
    
    return {"id": project_id, **{k: v for k, v in project_doc.items() if k != "_id"}}

@api_router.get("/projects")
async def get_projects(user: dict = Depends(get_current_user)):
    if user["role"] == "admin":
        projects = await db.projects.find({}).to_list(1000)
    else:
        projects = await db.projects.find({"team_members.user_id": user["id"]}).to_list(1000)
    
    return [{"id": str(p["_id"]), **{k: v for k, v in p.items() if k != "_id"}} for p in projects]

@api_router.get("/projects/{project_id}")
async def get_project(project_id: str, user: dict = Depends(get_current_user)):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check access
    if user["role"] != "admin":
        member_ids = [m["user_id"] for m in project.get("team_members", [])]
        if user["id"] not in member_ids:
            raise HTTPException(status_code=403, detail="No access to this project")
    
    return {"id": str(project["_id"]), **{k: v for k, v in project.items() if k != "_id"}}

@api_router.put("/projects/{project_id}")
async def update_project(project_id: str, update: ProjectUpdate, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can update projects")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    result = await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    
    await log_activity(project_id, user["id"], user["name"], "project_updated", "Updated project details")
    return {"message": "Project updated"}

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete projects")
    
    result = await db.projects.delete_one({"_id": ObjectId(project_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Also delete related shots and feedback
    await db.shots.delete_many({"project_id": project_id})
    await db.feedback.delete_many({"project_id": project_id})
    
    return {"message": "Project deleted"}

@api_router.post("/projects/{project_id}/team")
async def add_team_member(project_id: str, member: TeamMemberAdd, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage team")
    
    # Check if user exists
    target_user = await db.users.find_one({"_id": ObjectId(member.user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Add to team
    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$addToSet": {"team_members": {"user_id": member.user_id, "role": member.role.value}}}
    )
    
    await log_activity(project_id, user["id"], user["name"], "team_member_added", f"Added {target_user['name']} to team")
    await create_notification(member.user_id, "Added to Project", f"You have been added to a project", f"/projects/{project_id}")
    
    return {"message": "Team member added"}

@api_router.delete("/projects/{project_id}/team/{member_id}")
async def remove_team_member(project_id: str, member_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage team")
    
    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$pull": {"team_members": {"user_id": member_id}}}
    )
    
    await log_activity(project_id, user["id"], user["name"], "team_member_removed", "Removed team member")
    return {"message": "Team member removed"}

# ============== SHOTS ROUTES ==============
@api_router.post("/projects/{project_id}/shots")
async def create_shot(project_id: str, shot: ShotCreate, user: dict = Depends(get_current_user)):
    if user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Only admin or supervisor can create shots")
    
    # Check project exists
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    shot_doc = {
        "project_id": project_id,
        "shot_id": shot.shot_id,
        "description": shot.description,
        "frame_start": shot.frame_start,
        "frame_end": shot.frame_end,
        "deadline": shot.deadline,
        "status": ShotStatus.NOT_STARTED.value,
        "assigned_to": None,
        "file_links": [],
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    result = await db.shots.insert_one(shot_doc)
    shot_id = str(result.inserted_id)
    
    await log_activity(project_id, user["id"], user["name"], "shot_created", f"Created shot: {shot.shot_id}")
    
    return {"id": shot_id, **{k: v for k, v in shot_doc.items() if k != "_id"}}

@api_router.get("/projects/{project_id}/shots")
async def get_shots(project_id: str, status: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"project_id": project_id}
    
    # Animators only see their assigned shots
    if user["role"] == "animator":
        query["assigned_to"] = user["id"]
    
    if status:
        query["status"] = status
    
    shots = await db.shots.find(query).to_list(1000)
    
    # Get assigned user names
    result = []
    for s in shots:
        shot_data = {"id": str(s["_id"]), **{k: v for k, v in s.items() if k != "_id"}}
        if s.get("assigned_to"):
            assigned_user = await db.users.find_one({"_id": ObjectId(s["assigned_to"])}, {"name": 1})
            shot_data["assigned_to_name"] = assigned_user["name"] if assigned_user else "Unknown"
        result.append(shot_data)
    
    return result

@api_router.get("/shots/assigned")
async def get_assigned_shots(user: dict = Depends(get_current_user)):
    """Get all shots assigned to current user across all projects"""
    shots = await db.shots.find({"assigned_to": user["id"]}).to_list(1000)
    
    result = []
    for s in shots:
        shot_data = {"id": str(s["_id"]), **{k: v for k, v in s.items() if k != "_id"}}
        # Get project name
        project = await db.projects.find_one({"_id": ObjectId(s["project_id"])}, {"name": 1})
        shot_data["project_name"] = project["name"] if project else "Unknown"
        result.append(shot_data)
    
    return result

@api_router.get("/projects/{project_id}/shots/{shot_id}")
async def get_shot(project_id: str, shot_id: str, user: dict = Depends(get_current_user)):
    shot = await db.shots.find_one({"_id": ObjectId(shot_id), "project_id": project_id})
    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found")
    
    shot_data = {"id": str(shot["_id"]), **{k: v for k, v in shot.items() if k != "_id"}}
    if shot.get("assigned_to"):
        assigned_user = await db.users.find_one({"_id": ObjectId(shot["assigned_to"])}, {"name": 1})
        shot_data["assigned_to_name"] = assigned_user["name"] if assigned_user else "Unknown"
    
    return shot_data

@api_router.put("/projects/{project_id}/shots/{shot_id}")
async def update_shot(project_id: str, shot_id: str, update: ShotUpdate, user: dict = Depends(get_current_user)):
    shot = await db.shots.find_one({"_id": ObjectId(shot_id), "project_id": project_id})
    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found")
    
    # Animators can only change status to submitted or in_progress
    if user["role"] == "animator":
        if shot.get("assigned_to") != user["id"]:
            raise HTTPException(status_code=403, detail="Not assigned to this shot")
        if update.status and update.status.value not in ["in_progress", "submitted"]:
            raise HTTPException(status_code=403, detail="Animators can only set status to in_progress or submitted")
        # Only allow status update for animators
        update_data = {}
        if update.status:
            update_data["status"] = update.status.value
    else:
        update_data = {k: v.value if isinstance(v, Enum) else v for k, v in update.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    old_status = shot.get("status")
    old_assigned = shot.get("assigned_to")
    
    await db.shots.update_one(
        {"_id": ObjectId(shot_id)},
        {"$set": update_data}
    )
    
    # Notify on status change
    if "status" in update_data and old_status != update_data["status"]:
        if shot.get("assigned_to"):
            await create_notification(
                shot["assigned_to"],
                "Shot Status Changed",
                f"Shot {shot['shot_id']} status changed to {update_data['status']}",
                f"/projects/{project_id}/shots/{shot_id}"
            )
        await log_activity(project_id, user["id"], user["name"], "shot_status_changed", f"Shot {shot['shot_id']} status: {old_status} -> {update_data['status']}")
    
    # Notify on assignment
    if "assigned_to" in update_data and old_assigned != update_data["assigned_to"]:
        if update_data["assigned_to"]:
            await create_notification(
                update_data["assigned_to"],
                "Shot Assigned",
                f"You have been assigned to shot {shot['shot_id']}",
                f"/projects/{project_id}/shots/{shot_id}"
            )
        await log_activity(project_id, user["id"], user["name"], "shot_assigned", f"Assigned shot {shot['shot_id']}")
    
    return {"message": "Shot updated"}

@api_router.delete("/projects/{project_id}/shots/{shot_id}")
async def delete_shot(project_id: str, shot_id: str, user: dict = Depends(get_current_user)):
    if user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Only admin or supervisor can delete shots")
    
    result = await db.shots.delete_one({"_id": ObjectId(shot_id), "project_id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Shot not found")
    
    # Delete related feedback
    await db.feedback.delete_many({"shot_id": shot_id})
    
    await log_activity(project_id, user["id"], user["name"], "shot_deleted", f"Deleted shot")
    return {"message": "Shot deleted"}

@api_router.post("/projects/{project_id}/shots/{shot_id}/files")
async def add_file_link(project_id: str, shot_id: str, file: FileLink, user: dict = Depends(get_current_user)):
    shot = await db.shots.find_one({"_id": ObjectId(shot_id), "project_id": project_id})
    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found")
    
    # Check permission
    if user["role"] == "animator" and shot.get("assigned_to") != user["id"]:
        raise HTTPException(status_code=403, detail="Not assigned to this shot")
    
    file_entry = {
        "name": file.name,
        "url": file.url,
        "file_type": file.file_type,
        "uploaded_by": user["id"],
        "uploaded_by_name": user["name"],
        "uploaded_at": datetime.now(timezone.utc)
    }
    
    await db.shots.update_one(
        {"_id": ObjectId(shot_id)},
        {
            "$push": {"file_links": file_entry},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
    )
    
    await log_activity(project_id, user["id"], user["name"], "file_uploaded", f"Added file to shot {shot['shot_id']}: {file.name}")
    return {"message": "File link added"}

# ============== FEEDBACK ROUTES ==============
@api_router.post("/projects/{project_id}/shots/{shot_id}/feedback")
async def create_feedback(project_id: str, shot_id: str, feedback: FeedbackCreate, user: dict = Depends(get_current_user)):
    shot = await db.shots.find_one({"_id": ObjectId(shot_id), "project_id": project_id})
    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found")
    
    feedback_doc = {
        "project_id": project_id,
        "shot_id": shot_id,
        "user_id": user["id"],
        "user_name": user["name"],
        "user_role": user["role"],
        "comment": feedback.comment,
        "attachments": [a.model_dump() for a in feedback.attachments] if feedback.attachments else [],
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.feedback.insert_one(feedback_doc)
    
    # Notify assigned animator if feedback is from supervisor
    if user["role"] in ["admin", "supervisor"] and shot.get("assigned_to"):
        await create_notification(
            shot["assigned_to"],
            "New Feedback",
            f"New feedback on shot {shot['shot_id']}",
            f"/projects/{project_id}/shots/{shot_id}"
        )
    
    await log_activity(project_id, user["id"], user["name"], "feedback_added", f"Added feedback to shot {shot['shot_id']}")
    
    return {"id": str(result.inserted_id), **{k: v for k, v in feedback_doc.items() if k != "_id"}}

@api_router.get("/projects/{project_id}/shots/{shot_id}/feedback")
async def get_feedback(project_id: str, shot_id: str, user: dict = Depends(get_current_user)):
    feedback_list = await db.feedback.find({"shot_id": shot_id}).sort("created_at", 1).to_list(1000)
    return [{"id": str(f["_id"]), **{k: v for k, v in f.items() if k != "_id"}} for f in feedback_list]

# ============== NOTIFICATIONS ROUTES ==============
@api_router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    notifications = await db.notifications.find({"user_id": user["id"]}).sort("created_at", -1).to_list(100)
    return [{"id": str(n["_id"]), **{k: v for k, v in n.items() if k != "_id"}} for n in notifications]

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: dict = Depends(get_current_user)):
    result = await db.notifications.update_one(
        {"_id": ObjectId(notification_id), "user_id": user["id"]},
        {"$set": {"read": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": user["id"]},
        {"$set": {"read": True}}
    )
    return {"message": "All notifications marked as read"}

# ============== ACTIVITY LOG ROUTES ==============
@api_router.get("/projects/{project_id}/activity")
async def get_activity_log(project_id: str, user: dict = Depends(get_current_user)):
    logs = await db.activity_logs.find({"project_id": project_id}).sort("timestamp", -1).to_list(100)
    return [{"id": str(l["_id"]), **{k: v for k, v in l.items() if k != "_id"}} for l in logs]

# ============== BAT FILE GENERATION ==============
@api_router.get("/projects/{project_id}/drive-mapper")
async def generate_bat_file(project_id: str, user: dict = Depends(get_current_user)):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    onedrive_link = project.get("onedrive_link", "")
    
    bat_content = f"""@echo off
:: Toonweaver Drive Mapper
:: Project: {project['name']}
:: Generated for: {user['name']}
:: Generated at: {datetime.now(timezone.utc).isoformat()}

echo ============================================
echo  Toonweaver Drive Mapper
echo  Project: {project['name']}
echo ============================================
echo.

:: Check if M: drive is already mapped
if exist M:\\ (
    echo M: drive is already mapped.
    echo Disconnecting existing mapping...
    net use M: /delete /y
    echo.
)

:: OneDrive WebDAV path
:: Replace with your OneDrive WebDAV URL
set ONEDRIVE_PATH={onedrive_link if onedrive_link else "https://your-onedrive-url"}

echo Mapping M: drive to OneDrive...
echo Path: %ONEDRIVE_PATH%
echo.

:: Map the network drive
:: For OneDrive, you may need to use RaiDrive or configure WebDAV
net use M: "%ONEDRIVE_PATH%" /persistent:yes

if %errorlevel% equ 0 (
    echo.
    echo SUCCESS! M: drive has been mapped.
    echo You can now access project files at M:\\
) else (
    echo.
    echo FAILED to map drive. Please check:
    echo 1. Your OneDrive link is correct
    echo 2. You are connected to the internet
    echo 3. You have access to the shared folder
    echo.
    echo TIP: For OneDrive, consider using RaiDrive for easier mounting.
    echo Download RaiDrive: https://www.raidrive.com/
)

echo.
pause
"""
    
    return StreamingResponse(
        io.BytesIO(bat_content.encode('utf-8')),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="toonweaver_drive_mapper_{project["name"].replace(" ", "_")}.bat"'}
    )

# ============== STATS ROUTES ==============
@api_router.get("/stats/dashboard")
async def get_dashboard_stats(user: dict = Depends(get_current_user)):
    if user["role"] == "admin":
        total_projects = await db.projects.count_documents({})
        total_shots = await db.shots.count_documents({})
        total_users = await db.users.count_documents({})
    else:
        total_projects = await db.projects.count_documents({"team_members.user_id": user["id"]})
        if user["role"] == "animator":
            total_shots = await db.shots.count_documents({"assigned_to": user["id"]})
        else:
            project_ids = [str(p["_id"]) for p in await db.projects.find({"team_members.user_id": user["id"]}, {"_id": 1}).to_list(1000)]
            total_shots = await db.shots.count_documents({"project_id": {"$in": project_ids}})
        total_users = 0
    
    # Shot status counts
    status_counts = {}
    for status in ShotStatus:
        if user["role"] == "animator":
            count = await db.shots.count_documents({"assigned_to": user["id"], "status": status.value})
        elif user["role"] == "admin":
            count = await db.shots.count_documents({"status": status.value})
        else:
            count = await db.shots.count_documents({"status": status.value})
        status_counts[status.value] = count
    
    return {
        "total_projects": total_projects,
        "total_shots": total_shots,
        "total_users": total_users,
        "status_counts": status_counts
    }

# ============== HEALTH CHECK ==============
@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc)}

# Include the router in the main app
app.include_router(api_router)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============== STARTUP EVENT ==============
@app.on_event("startup")
async def startup_event():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.shots.create_index([("project_id", 1), ("status", 1)])
    await db.shots.create_index("assigned_to")
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.activity_logs.create_index([("project_id", 1), ("timestamp", -1)])
    
    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    
    if existing is None:
        hashed = hash_password(admin_password)
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hashed,
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc)
        })
        logger.info(f"Admin user created: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )
        logger.info(f"Admin password updated")
    
    # Write test credentials
    import os as os_module
    os_module.makedirs("/app/memory", exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write(f"""# Toonweaver Test Credentials

## Admin Account
- Email: {admin_email}
- Password: {admin_password}
- Role: admin

## Auth Endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- POST /api/auth/refresh
""")
    logger.info("Test credentials written to /app/memory/test_credentials.md")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
