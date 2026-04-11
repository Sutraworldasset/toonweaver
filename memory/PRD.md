# Toonweaver - 3D Animation Production Pipeline

## Overview
Toonweaver is a full-stack web application for managing 3D animation production pipelines, enabling teams to manage projects, shots, and feedback efficiently.

## Architecture
- **Frontend**: React 19 with TailwindCSS and Shadcn/UI components
- **Backend**: FastAPI with Motor (async MongoDB driver)
- **Database**: MongoDB
- **Authentication**: JWT with httpOnly cookies

## User Roles
1. **Admin** - Full system access, project creation, user management
2. **Production Manager** - Project management, team management, shot oversight (new)
3. **Supervisor** - Shot management, review, feedback
4. **Animator** - View assigned shots, submit work, view feedback

## Core Requirements (Static)
- JWT-based authentication with role-based access control
- Project management with OneDrive folder links
- Shot management with status workflow (Not Started → In Progress → Submitted → Retake/Approved)
- Feedback system with comment threads and file attachments
- In-app notifications
- Activity logging
- .bat file generation for OneDrive drive mapping

## What's Been Implemented (MVP - Jan 2026)
✅ JWT authentication with admin/supervisor/animator roles
✅ User registration and login system
✅ Admin seeding on startup
✅ Project CRUD operations
✅ Team member management
✅ Shot CRUD with status workflow
✅ Shot assignment to animators
✅ Feedback system with attachments
✅ In-app notifications
✅ Activity logging
✅ Dashboard with stats overview
✅ Drive mapper .bat file generation
✅ Search and filter shots
✅ Dark theme UI with status color coding
✅ Responsive sidebar navigation

## API Endpoints
- Auth: /api/auth/register, /api/auth/login, /api/auth/logout, /api/auth/me, /api/auth/refresh
- Users: /api/users, /api/users/{id}, /api/users/{id}/role
- Projects: /api/projects (CRUD), /api/projects/{id}/team
- Shots: /api/projects/{id}/shots (CRUD), /api/shots/assigned
- Feedback: /api/projects/{id}/shots/{shot_id}/feedback
- Notifications: /api/notifications, /api/notifications/{id}/read
- Activity: /api/projects/{id}/activity
- Drive Mapper: /api/projects/{id}/drive-mapper
- Stats: /api/stats/dashboard

## Test Credentials
- Admin: admin@toonweaver.com / Admin123!

## Prioritized Backlog

### P0 (MVP Complete) ✅
- Core authentication and authorization
- Project and shot management
- Basic feedback system
- Dashboard

### P1 (Next Phase)
- Email notifications integration
- OneDrive API integration for file management
- Frame-by-frame review player

### P2 (Future)
- In-app annotation tool
- Version comparison tool
- Analytics dashboard
- Mobile app

## Tech Stack
- Frontend: React 19, TailwindCSS, Shadcn/UI, Lucide Icons, date-fns
- Backend: FastAPI, Motor (MongoDB), PyJWT, bcrypt
- Database: MongoDB
