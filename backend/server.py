from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import logging
import bcrypt
import jwt
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Any
from datetime import datetime, timezone, timedelta
from enum import Enum
import io

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'toonweaver')]

JWT_ALGORITHM = "HS256"

def get_jwt_secret() -> str:
    return os.environ.get("JWT_SECRET", "default-secret-change-in-production")

app = FastAPI(title="Toonweaver API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============== ENUMS ==============
class UserRole(str, Enum):
    CLIENT = "client"
    PRODUCTION_MANAGER = "production_manager"
    SUPERVISOR = "supervisor"
    ARTIST = "artist"

class ShotStatus(str, Enum):
    YTS = "yts"
    IN_PROGRESS = "in_progress"
    UPLOADED = "uploaded"
    INTERNAL_REVIEW = "internal_review"
    RETAKE = "retake"
    HOLD = "hold"
    APPROVED = "approved"

class ShotComplexity(str, Enum):
    A = "A"
    B = "B"
    C = "C"

# ============== MODELS ==============
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: UserRole = UserRole.ARTIST

class UserLogin(BaseModel):
    email: EmailStr
    password: str
    role: UserRole

class DriveLink(BaseModel):
    name: str
    url: str
    link_type: Optional[str] = ""

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    thumbnail_url: Optional[str] = ""
    fps: int = 25
    drive_links: Optional[List[DriveLink]] = []

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    fps: Optional[int] = None
    drive_links: Optional[List[DriveLink]] = None
    custom_statuses: Optional[List[dict]] = None
    removed_statuses: Optional[List[str]] = None
    sheets: Optional[List[dict]] = None

class TeamMemberAdd(BaseModel):
    user_id: str
    role: UserRole

class EpisodeCreate(BaseModel):
    episode_number: int
    title: Optional[str] = ""
    description: Optional[str] = ""

class EpisodeUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None

class ShotCreate(BaseModel):
    shot_number: str
    description: Optional[str] = ""
    complexity: Optional[ShotComplexity] = None
    frames: Optional[int] = None
    approved_layout_version: Optional[str] = ""
    deadline: Optional[datetime] = None

class ShotUpdate(BaseModel):
    description: Optional[str] = None
    complexity: Optional[ShotComplexity] = None
    frames: Optional[int] = None
    approved_layout_version: Optional[str] = None
    deadline: Optional[datetime] = None
    status: Optional[ShotStatus] = None
    assigned_to: Optional[str] = None
    feedback_link: Optional[str] = None

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
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
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

# ============== ROLE PERMISSION HELPERS ==============
# What roles each role is allowed to create or assign
ROLE_PERMISSIONS = {
    "client":             ["production_manager", "supervisor", "artist"],
    "production_manager": ["supervisor", "artist"],
    "supervisor":         ["artist"],
    "artist":             [],
}

def check_can_create_user(creator_role: str, new_role: str):
    if new_role not in ROLE_PERMISSIONS.get(creator_role, []):
        raise HTTPException(
            status_code=403,
            detail=f"Your role ({creator_role}) cannot create a user with role ({new_role})"
        )

def check_can_assign_role(assigner_role: str, target_role: str):
    """Check if assigner is allowed to assign target_role to someone."""
    if assigner_role == "client":
        return  # Client can assign any role
    if target_role not in ROLE_PERMISSIONS.get(assigner_role, []):
        raise HTTPException(
            status_code=403,
            detail=f"Your role ({assigner_role}) cannot assign the '{target_role}' role"
        )

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

# ============== SHOT ID GENERATOR ==============
def generate_shot_id(episode_number: int, shot_number: str) -> str:
    return f"ep{episode_number:03d}_{shot_number}"

# ============== AUTH ROUTES ==============
@api_router.post("/auth/register")
async def register(user_data: UserCreate, response: Response, current_user: dict = Depends(get_current_user)):
    check_can_create_user(current_user["role"], user_data.role.value)
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
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.users.insert_one(user_doc)
    return {"id": str(result.inserted_id), "email": email, "name": user_data.name, "role": user_data.role.value, "created_at": user_doc["created_at"]}

@api_router.post("/auth/login")
async def login(credentials: UserLogin, response: Response, request: Request):
    email = credentials.email.lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"

    attempts = await db.login_attempts.find_one({"identifier": identifier})
    if attempts and attempts.get("count", 0) >= 5:
        lockout_until = attempts.get("lockout_until")
        if lockout_until and datetime.now(timezone.utc) < lockout_until:
            raise HTTPException(status_code=429, detail="Too many login attempts. Try again in 15 minutes.")

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"lockout_until": datetime.now(timezone.utc) + timedelta(minutes=15)}},
            upsert=True
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user["role"] != credentials.role.value:
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"lockout_until": datetime.now(timezone.utc) + timedelta(minutes=15)}},
            upsert=True
        )
        raise HTTPException(status_code=401, detail=f"Invalid role. This account is registered as '{user['role']}'")

    await db.login_attempts.delete_one({"identifier": identifier})
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=28800, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    return {"id": user_id, "email": user["email"], "name": user["name"], "role": user["role"], "created_at": user["created_at"]}

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
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=28800, path="/")
        return {"message": "Token refreshed"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

# ============== USERS ROUTES ==============
@api_router.get("/users")
async def get_users(user: dict = Depends(get_current_user)):
    if user["role"] not in ["client", "production_manager", "supervisor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if user["role"] == "supervisor":
        users = await db.users.find({"role": "artist"}, {"password_hash": 0}).to_list(1000)
    elif user["role"] == "production_manager":
        users = await db.users.find({"role": {"$in": ["supervisor", "artist"]}}, {"password_hash": 0}).to_list(1000)
    else:
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
    # Only client and PM can change roles
    if user["role"] not in ["client", "production_manager"]:
        raise HTTPException(status_code=403, detail="Only client or production manager can change roles")

    # Prevent changing your own role
    if user["id"] == user_id:
        raise HTTPException(status_code=403, detail="You cannot change your own role")

    # Enforce role assignment restrictions
    check_can_assign_role(user["role"], role.value)

    # Also check the target user's current role — PM cannot modify a client
    target = await db.users.find_one({"_id": ObjectId(user_id)}, {"role": 1})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if user["role"] == "production_manager" and target["role"] == "client":
        raise HTTPException(status_code=403, detail="Production manager cannot modify a client account")

    result = await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"role": role.value}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Role updated"}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "client":
        raise HTTPException(status_code=403, detail="Only client can delete users")
    if user["id"] == user_id:
        raise HTTPException(status_code=403, detail="You cannot delete your own account")
    result = await db.users.delete_one({"_id": ObjectId(user_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}

# ============== PROJECTS ROUTES ==============
@api_router.post("/projects")
async def create_project(project: ProjectCreate, user: dict = Depends(get_current_user)):
    if user["role"] not in ["client", "production_manager"]:
        raise HTTPException(status_code=403, detail="Only client or production manager can create projects")
    if project.fps not in [24, 25, 30]:
        raise HTTPException(status_code=400, detail="FPS must be 24, 25, or 30")
    project_doc = {
        "name": project.name,
        "description": project.description,
        "thumbnail_url": project.thumbnail_url or "",
        "fps": project.fps,
        "drive_links": [link.model_dump() for link in project.drive_links] if project.drive_links else [],
        "custom_statuses": [],
        "removed_statuses": [],
        "sheets": [],
        "created_by": user["id"],
        "team_members": [{"user_id": user["id"], "role": user["role"]}],
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.projects.insert_one(project_doc)
    project_id = str(result.inserted_id)
    await log_activity(project_id, user["id"], user["name"], "project_created", f"Created project: {project.name}")
    return {"id": project_id, **{k: v for k, v in project_doc.items() if k != "_id"}}

@api_router.get("/projects")
async def get_projects(user: dict = Depends(get_current_user)):
    if user["role"] in ["client", "production_manager"]:
        projects = await db.projects.find({}).to_list(1000)
    else:
        projects = await db.projects.find({"team_members.user_id": user["id"]}).to_list(1000)
    result = []
    for p in projects:
        p_data = {"id": str(p["_id"]), **{k: v for k, v in p.items() if k != "_id"}}
        if "sheets" in p_data:
            p_data["sheet_count"] = len(p_data["sheets"])
            del p_data["sheets"]
        result.append(p_data)
    return result

@api_router.get("/projects/{project_id}")
async def get_project(project_id: str, user: dict = Depends(get_current_user)):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if user["role"] not in ["client", "production_manager"]:
        member_ids = [m["user_id"] for m in project.get("team_members", [])]
        if user["id"] not in member_ids:
            raise HTTPException(status_code=403, detail="No access to this project")
    p_data = {"id": str(project["_id"]), **{k: v for k, v in project.items() if k != "_id"}}
    if user["role"] != "client":
        all_sheets = p_data.get("sheets", [])
        p_data["sheets"] = [
            s for s in all_sheets
            if s.get("visibleTo") and user["role"] in s.get("visibleTo", [])
        ]
    return p_data

@api_router.put("/projects/{project_id}")
async def update_project(project_id: str, update: ProjectUpdate, user: dict = Depends(get_current_user)):
    if user["role"] not in ["client", "production_manager"]:
        raise HTTPException(status_code=403, detail="Only client or production manager can update projects")
    update_data = {}
    for k, v in update.model_dump().items():
        if v is None:
            continue
        if k == "drive_links":
            update_data[k] = [link if isinstance(link, dict) else link.model_dump() for link in v]
        elif k == "fps":
            if v not in [24, 25, 30]:
                raise HTTPException(status_code=400, detail="FPS must be 24, 25, or 30")
            update_data[k] = v
        elif k in ["custom_statuses", "removed_statuses", "sheets"]:
            update_data[k] = v
        else:
            update_data[k] = v
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    result = await db.projects.update_one({"_id": ObjectId(project_id)}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    await log_activity(project_id, user["id"], user["name"], "project_updated", "Updated project details")
    return {"message": "Project updated"}

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    if user["role"] not in ["client", "production_manager"]:
        raise HTTPException(status_code=403, detail="Only client or production manager can delete projects")
    result = await db.projects.delete_one({"_id": ObjectId(project_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.episodes.delete_many({"project_id": project_id})
    await db.shots.delete_many({"project_id": project_id})
    await db.feedback.delete_many({"project_id": project_id})
    await db.activity_logs.delete_many({"project_id": project_id})
    return {"message": "Project deleted"}

@api_router.post("/projects/{project_id}/team")
async def add_team_member(project_id: str, member: TeamMemberAdd, user: dict = Depends(get_current_user)):
    if user["role"] not in ["client", "production_manager"]:
        raise HTTPException(status_code=403, detail="Only client or production manager can manage team")
    target_user = await db.users.find_one({"_id": ObjectId(member.user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.projects.update_one(
        {"_id": ObjectId(project_id)},
        {"$addToSet": {"team_members": {"user_id": member.user_id, "role": member.role.value}}}
    )
    await log_activity(project_id, user["id"], user["name"], "team_member_added", f"Added {target_user['name']} to team")
    await create_notification(member.user_id, "Added to Project", "You have been added to a project", f"/projects/{project_id}")
    return {"message": "Team member added"}

@api_router.delete("/projects/{project_id}/team/{member_id}")
async def remove_team_member(project_id: str, member_id: str, user: dict = Depends(get_current_user)):
    if user["role"] not in ["client", "production_manager"]:
        raise HTTPException(status_code=403, detail="Only client or production manager can manage team")
    await db.projects.update_one({"_id": ObjectId(project_id)}, {"$pull": {"team_members": {"user_id": member_id}}})
    await log_activity(project_id, user["id"], user["name"], "team_member_removed", "Removed team member")
    return {"message": "Team member removed"}

# ============== EPISODES ROUTES ==============
@api_router.post("/projects/{project_id}/episodes")
async def create_episode(project_id: str, episode: EpisodeCreate, user: dict = Depends(get_current_user)):
    if user["role"] not in ["client", "production_manager"]:
        raise HTTPException(status_code=403, detail="Only client or production manager can create episodes")
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    existing = await db.episodes.find_one({"project_id": project_id, "episode_number": episode.episode_number})
    if existing:
        raise HTTPException(status_code=400, detail=f"Episode {episode.episode_number} already exists")
    episode_doc = {
        "project_id": project_id,
        "episode_number": episode.episode_number,
        "episode_code": f"ep{episode.episode_number:03d}",
        "title": episode.title or f"Episode {episode.episode_number}",
        "description": episode.description or "",
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.episodes.insert_one(episode_doc)
    await log_activity(project_id, user["id"], user["name"], "episode_created", f"Created episode: ep{episode.episode_number:03d}")
    return {"id": str(result.inserted_id), **{k: v for k, v in episode_doc.items() if k != "_id"}}

@api_router.get("/projects/{project_id}/episodes")
async def get_episodes(project_id: str, user: dict = Depends(get_current_user)):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if user["role"] not in ["client", "production_manager"]:
        member_ids = [m["user_id"] for m in project.get("team_members", [])]
        if user["id"] not in member_ids:
            raise HTTPException(status_code=403, detail="No access to this project")
    episodes = await db.episodes.find({"project_id": project_id}).sort("episode_number", 1).to_list(1000)
    result = []
    for ep in episodes:
        ep_data = {"id": str(ep["_id"]), **{k: v for k, v in ep.items() if k != "_id"}}
        ep_data["shot_count"] = await db.shots.count_documents({"episode_id": str(ep["_id"])})
        result.append(ep_data)
    return result

@api_router.get("/projects/{project_id}/episodes/{episode_id}")
async def get_episode(project_id: str, episode_id: str, user: dict = Depends(get_current_user)):
    episode = await db.episodes.find_one({"_id": ObjectId(episode_id), "project_id": project_id})
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return {"id": str(episode["_id"]), **{k: v for k, v in episode.items() if k != "_id"}}

@api_router.put("/projects/{project_id}/episodes/{episode_id}")
async def update_episode(project_id: str, episode_id: str, update: EpisodeUpdate, user: dict = Depends(get_current_user)):
    if user["role"] not in ["client", "production_manager"]:
        raise HTTPException(status_code=403, detail="Only client or production manager can update episodes")
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    result = await db.episodes.update_one({"_id": ObjectId(episode_id), "project_id": project_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Episode not found")
    return {"message": "Episode updated"}

@api_router.delete("/projects/{project_id}/episodes/{episode_id}")
async def delete_episode(project_id: str, episode_id: str, user: dict = Depends(get_current_user)):
    if user["role"] not in ["client", "production_manager"]:
        raise HTTPException(status_code=403, detail="Only client or production manager can delete episodes")
    result = await db.episodes.delete_one({"_id": ObjectId(episode_id), "project_id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Episode not found")
    await db.shots.delete_many({"episode_id": episode_id})
    await log_activity(project_id, user["id"], user["name"], "episode_deleted", "Deleted episode")
    return {"message": "Episode deleted"}

# ============== SHOTS ROUTES ==============
@api_router.post("/projects/{project_id}/episodes/{episode_id}/shots")
async def create_shot(project_id: str, episode_id: str, shot: ShotCreate, user: dict = Depends(get_current_user)):
    if user["role"] not in ["client", "production_manager"]:
        raise HTTPException(status_code=403, detail="Only client or production manager can create shots")
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    episode = await db.episodes.find_one({"_id": ObjectId(episode_id), "project_id": project_id})
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    full_shot_id = generate_shot_id(episode["episode_number"], shot.shot_number)
    existing = await db.shots.find_one({"episode_id": episode_id, "shot_number": shot.shot_number})
    if existing:
        raise HTTPException(status_code=400, detail=f"Shot {full_shot_id} already exists")
    fps = project.get("fps", 25)
    duration_seconds = round(shot.frames / fps, 2) if shot.frames else None
    shot_doc = {
        "project_id": project_id,
        "episode_id": episode_id,
        "episode_code": episode["episode_code"],
        "shot_number": shot.shot_number,
        "shot_id": full_shot_id,
        "description": shot.description or "",
        "complexity": shot.complexity.value if shot.complexity else None,
        "frames": shot.frames,
        "fps": fps,
        "duration_seconds": duration_seconds,
        "approved_layout_version": shot.approved_layout_version or "",
        "deadline": shot.deadline,
        "status": ShotStatus.YTS.value,
        "assigned_to": None,
        "feedback_link": "",
        "file_links": [],
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    result = await db.shots.insert_one(shot_doc)
    await log_activity(project_id, user["id"], user["name"], "shot_created", f"Created shot: {full_shot_id}")
    return {"id": str(result.inserted_id), **{k: v for k, v in shot_doc.items() if k != "_id"}}

@api_router.get("/projects/{project_id}/episodes/{episode_id}/shots")
async def get_shots(project_id: str, episode_id: str, status: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"project_id": project_id, "episode_id": episode_id}
    if user["role"] == "artist":
        query["assigned_to"] = user["id"]
    if status:
        query["status"] = status
    shots = await db.shots.find(query).sort("shot_number", 1).to_list(1000)
    user_ids = list(set([s.get("assigned_to") for s in shots if s.get("assigned_to")]))
    user_map = {}
    if user_ids:
        users = await db.users.find({"_id": {"$in": [ObjectId(uid) for uid in user_ids]}}, {"name": 1}).to_list(1000)
        user_map = {str(u["_id"]): u["name"] for u in users}
    result = []
    for s in shots:
        shot_data = {"id": str(s["_id"]), **{k: v for k, v in s.items() if k != "_id"}}
        if s.get("assigned_to"):
            shot_data["assigned_to_name"] = user_map.get(s["assigned_to"], "Unknown")
        result.append(shot_data)
    return result

@api_router.get("/projects/{project_id}/shots")
async def get_all_project_shots(project_id: str, status: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"project_id": project_id}
    if user["role"] == "artist":
        query["assigned_to"] = user["id"]
    if status:
        query["status"] = status
    shots = await db.shots.find(query).sort([("episode_code", 1), ("shot_number", 1)]).to_list(1000)
    user_ids = list(set([s.get("assigned_to") for s in shots if s.get("assigned_to")]))
    user_map = {}
    if user_ids:
        users = await db.users.find({"_id": {"$in": [ObjectId(uid) for uid in user_ids]}}, {"name": 1}).to_list(1000)
        user_map = {str(u["_id"]): u["name"] for u in users}
    result = []
    for s in shots:
        shot_data = {"id": str(s["_id"]), **{k: v for k, v in s.items() if k != "_id"}}
        if s.get("assigned_to"):
            shot_data["assigned_to_name"] = user_map.get(s["assigned_to"], "Unknown")
        result.append(shot_data)
    return result

@api_router.get("/shots/assigned")
async def get_assigned_shots(user: dict = Depends(get_current_user)):
    shots = await db.shots.find({"assigned_to": user["id"]}).to_list(1000)
    project_ids = list(set([s["project_id"] for s in shots]))
    project_map = {}
    if project_ids:
        projects = await db.projects.find({"_id": {"$in": [ObjectId(pid) for pid in project_ids]}}, {"name": 1}).to_list(1000)
        project_map = {str(p["_id"]): p["name"] for p in projects}
    result = []
    for s in shots:
        shot_data = {"id": str(s["_id"]), **{k: v for k, v in s.items() if k != "_id"}}
        shot_data["project_name"] = project_map.get(s["project_id"], "Unknown")
        result.append(shot_data)
    return result

@api_router.get("/projects/{project_id}/episodes/{episode_id}/shots/{shot_id}")
async def get_shot(project_id: str, episode_id: str, shot_id: str, user: dict = Depends(get_current_user)):
    shot = await db.shots.find_one({"_id": ObjectId(shot_id), "project_id": project_id, "episode_id": episode_id})
    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found")
    shot_data = {"id": str(shot["_id"]), **{k: v for k, v in shot.items() if k != "_id"}}
    if shot.get("assigned_to"):
        assigned_user = await db.users.find_one({"_id": ObjectId(shot["assigned_to"])}, {"name": 1})
        shot_data["assigned_to_name"] = assigned_user["name"] if assigned_user else "Unknown"
    return shot_data

@api_router.put("/projects/{project_id}/episodes/{episode_id}/shots/{shot_id}")
async def update_shot(project_id: str, episode_id: str, shot_id: str, update: ShotUpdate, user: dict = Depends(get_current_user)):
    shot = await db.shots.find_one({"_id": ObjectId(shot_id), "project_id": project_id})
    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found")
    if user["role"] == "artist":
        if shot.get("assigned_to") != user["id"]:
            raise HTTPException(status_code=403, detail="Not assigned to this shot")
        if update.status and update.status.value not in ["in_progress", "uploaded"]:
            raise HTTPException(status_code=403, detail="Artists can only set status to in_progress or uploaded")
        update_data = {}
        if update.status:
            update_data["status"] = update.status.value
    elif user["role"] == "supervisor":
        allowed_fields = ["status", "assigned_to", "feedback_link", "approved_layout_version"]
        update_data = {}
        for k, v in update.model_dump().items():
            if v is not None and k in allowed_fields:
                update_data[k] = v.value if isinstance(v, Enum) else v
    else:
        update_data = {}
        for k, v in update.model_dump().items():
            if v is not None:
                update_data[k] = v.value if isinstance(v, Enum) else v
        if "frames" in update_data:
            project = await db.projects.find_one({"_id": ObjectId(project_id)})
            fps = project.get("fps", 25) if project else 25
            update_data["duration_seconds"] = round(update_data["frames"] / fps, 2)
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    update_data["updated_at"] = datetime.now(timezone.utc)
    old_status = shot.get("status")
    old_assigned = shot.get("assigned_to")
    await db.shots.update_one({"_id": ObjectId(shot_id)}, {"$set": update_data})
    if "status" in update_data and old_status != update_data["status"]:
        if shot.get("assigned_to"):
            await create_notification(shot["assigned_to"], "Shot Status Changed",
                f"Shot {shot['shot_id']} status changed to {update_data['status']}",
                f"/projects/{project_id}/episodes/{episode_id}/shots/{shot_id}")
        await log_activity(project_id, user["id"], user["name"], "shot_status_changed",
            f"Shot {shot['shot_id']}: {old_status} → {update_data['status']}")
    if "assigned_to" in update_data and old_assigned != update_data["assigned_to"]:
        if update_data["assigned_to"]:
            await create_notification(update_data["assigned_to"], "Shot Assigned",
                f"You have been assigned to shot {shot['shot_id']}",
                f"/projects/{project_id}/episodes/{episode_id}/shots/{shot_id}")
        await log_activity(project_id, user["id"], user["name"], "shot_assigned", f"Assigned shot {shot['shot_id']}")
    return {"message": "Shot updated"}

@api_router.delete("/projects/{project_id}/episodes/{episode_id}/shots/{shot_id}")
async def delete_shot(project_id: str, episode_id: str, shot_id: str, user: dict = Depends(get_current_user)):
    if user["role"] not in ["client", "production_manager"]:
        raise HTTPException(status_code=403, detail="Only client or production manager can delete shots")
    result = await db.shots.delete_one({"_id": ObjectId(shot_id), "project_id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Shot not found")
    await db.feedback.delete_many({"shot_id": shot_id})
    await log_activity(project_id, user["id"], user["name"], "shot_deleted", "Deleted shot")
    return {"message": "Shot deleted"}

@api_router.post("/projects/{project_id}/episodes/{episode_id}/shots/{shot_id}/files")
async def add_file_link(project_id: str, episode_id: str, shot_id: str, file: FileLink, user: dict = Depends(get_current_user)):
    shot = await db.shots.find_one({"_id": ObjectId(shot_id), "project_id": project_id})
    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found")
    if user["role"] == "artist" and shot.get("assigned_to") != user["id"]:
        raise HTTPException(status_code=403, detail="Not assigned to this shot")
    file_entry = {
        "name": file.name, "url": file.url, "file_type": file.file_type,
        "uploaded_by": user["id"], "uploaded_by_name": user["name"],
        "uploaded_at": datetime.now(timezone.utc)
    }
    await db.shots.update_one({"_id": ObjectId(shot_id)},
        {"$push": {"file_links": file_entry}, "$set": {"updated_at": datetime.now(timezone.utc)}})
    await log_activity(project_id, user["id"], user["name"], "file_uploaded", f"Added file to shot {shot['shot_id']}: {file.name}")
    return {"message": "File link added"}

# ============== FEEDBACK ROUTES ==============
@api_router.post("/projects/{project_id}/episodes/{episode_id}/shots/{shot_id}/feedback")
async def create_feedback(project_id: str, episode_id: str, shot_id: str, feedback: FeedbackCreate, user: dict = Depends(get_current_user)):
    if user["role"] not in ["client", "supervisor"]:
        raise HTTPException(status_code=403, detail="Only client or supervisor can give feedback")
    shot = await db.shots.find_one({"_id": ObjectId(shot_id), "project_id": project_id})
    if not shot:
        raise HTTPException(status_code=404, detail="Shot not found")
    feedback_doc = {
        "project_id": project_id, "episode_id": episode_id, "shot_id": shot_id,
        "user_id": user["id"], "user_name": user["name"], "user_role": user["role"],
        "comment": feedback.comment,
        "attachments": [a.model_dump() for a in feedback.attachments] if feedback.attachments else [],
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.feedback.insert_one(feedback_doc)
    if shot.get("assigned_to"):
        await create_notification(shot["assigned_to"], "New Feedback",
            f"New feedback on shot {shot['shot_id']}",
            f"/projects/{project_id}/episodes/{episode_id}/shots/{shot_id}")
    await log_activity(project_id, user["id"], user["name"], "feedback_added", f"Added feedback to shot {shot['shot_id']}")
    return {"id": str(result.inserted_id), **{k: v for k, v in feedback_doc.items() if k != "_id"}}

@api_router.get("/projects/{project_id}/episodes/{episode_id}/shots/{shot_id}/feedback")
async def get_feedback(project_id: str, episode_id: str, shot_id: str, user: dict = Depends(get_current_user)):
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
        {"_id": ObjectId(notification_id), "user_id": user["id"]}, {"$set": {"read": True}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"]}, {"$set": {"read": True}})
    return {"message": "All notifications marked as read"}

# ============== ACTIVITY LOG ROUTES ==============
@api_router.get("/projects/{project_id}/activity")
async def get_activity_log(project_id: str, user: dict = Depends(get_current_user)):
    logs = await db.activity_logs.find({"project_id": project_id}).sort("timestamp", -1).to_list(100)
    return [{"id": str(l["_id"]), **{k: v for k, v in l.items() if k != "_id"}} for l in logs]

# ============== STATS ROUTES ==============
@api_router.get("/stats/dashboard")
async def get_dashboard_stats(user: dict = Depends(get_current_user)):
    if user["role"] in ["client", "production_manager"]:
        total_projects = await db.projects.count_documents({})
        total_shots = await db.shots.count_documents({})
        total_users = await db.users.count_documents({})
        total_episodes = await db.episodes.count_documents({})
    else:
        total_projects = await db.projects.count_documents({"team_members.user_id": user["id"]})
        total_episodes = await db.episodes.count_documents({})
        if user["role"] == "artist":
            total_shots = await db.shots.count_documents({"assigned_to": user["id"]})
        else:
            project_ids = [str(p["_id"]) for p in await db.projects.find({"team_members.user_id": user["id"]}, {"_id": 1}).to_list(1000)]
            total_shots = await db.shots.count_documents({"project_id": {"$in": project_ids}})
        total_users = 0
    status_counts = {}
    for status in ShotStatus:
        if user["role"] == "artist":
            count = await db.shots.count_documents({"assigned_to": user["id"], "status": status.value})
        else:
            count = await db.shots.count_documents({"status": status.value})
        status_counts[status.value] = count
    return {
        "total_projects": total_projects,
        "total_episodes": total_episodes,
        "total_shots": total_shots,
        "total_users": total_users,
        "status_counts": status_counts
    }

# ============== DRIVE MAPPER ==============
@api_router.get("/projects/{project_id}/drive-mapper")
async def generate_bat_file(project_id: str, user: dict = Depends(get_current_user)):
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    drive_links = project.get("drive_links", [])
    primary_link = ""
    for link in drive_links:
        if link.get("link_type") in ["onedrive", "google_drive"] or \
           "onedrive" in link.get("url", "").lower() or "drive.google" in link.get("url", "").lower():
            primary_link = link.get("url", "")
            break
    if not primary_link and drive_links:
        primary_link = drive_links[0].get("url", "")
    links_section = "".join([f"echo   {i+1}. {l.get('name', 'Link')}: {l.get('url', '')}\n" for i, l in enumerate(drive_links)])
    bat_content = f"""@echo off
:: Toonweaver Drive Mapper — Project: {project['name']} | FPS: {project.get('fps', 25)}
echo ============================================
echo  Toonweaver Drive Mapper — {project['name']}
echo ============================================
echo.
echo Project Links:
{links_section if links_section else "echo   No links configured"}
if exist M:\\ ( net use M: /delete /y )
set DRIVE_PATH={primary_link if primary_link else "https://your-drive-url"}
net use M: "%DRIVE_PATH%" /persistent:yes
if %errorlevel% equ 0 ( echo SUCCESS! M: drive mapped. ) else ( echo FAILED. Try RaiDrive: https://www.raidrive.com/ )
pause
"""
    return StreamingResponse(
        io.BytesIO(bat_content.encode('utf-8')),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="toonweaver_drive_mapper_{project["name"].replace(" ", "_")}.bat"'}
    )

# ============== HEALTH CHECK ==============
@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc)}

app.include_router(api_router)

cors_origins = os.environ.get("CORS_ORIGINS", "https://toonweaver.vercel.app")
allow_origins_list = [origin.strip() for origin in cors_origins.split(",")]
app.add_middleware(CORSMiddleware, allow_origins=allow_origins_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ============== STARTUP ==============
@app.on_event("startup")
async def startup_event():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.episodes.create_index([("project_id", 1), ("episode_number", 1)])
    await db.shots.create_index([("project_id", 1), ("episode_id", 1)])
    await db.shots.create_index([("project_id", 1), ("status", 1)])
    await db.shots.create_index("assigned_to")
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.activity_logs.create_index([("project_id", 1), ("timestamp", -1)])

    client_email = os.environ.get("ADMIN_EMAIL", "client@toonweaver.com")
    client_password = os.environ.get("ADMIN_PASSWORD", "Client123!")
    existing = await db.users.find_one({"email": client_email})
    if existing is None:
        await db.users.insert_one({
            "email": client_email, "password_hash": hash_password(client_password),
            "name": "Client", "role": "client", "created_at": datetime.now(timezone.utc)
        })
        logger.info(f"Client user created: {client_email}")
    else:
        await db.users.update_one({"email": client_email},
            {"$set": {"password_hash": hash_password(client_password), "role": "client"}})
        logger.info(f"Client user updated: {client_email}")
    logger.info("Startup complete")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
