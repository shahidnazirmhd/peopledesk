from fastapi import APIRouter

from app.api.endpoints import activities, auth, employees, users

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(employees.router)
api_router.include_router(users.router)
api_router.include_router(activities.router)
