# Backend Handoff – Real-Time Collaborative Code Editor

## Overview
Production-ready backend providing:
- JWT-based authentication
- Document lifecycle management
- Real-time collaboration via WebSocket (Yjs)
- Snapshot persistence and audit logging

---

## Services & Ports

| Service | Port | Notes |
|------|------|------|
| REST API | 3001 | Express + Prisma |
| WebSocket (Collab) | 1234 | Yjs server |
| PostgreSQL | 5432 | Local DB |

---

## API Documentation
Swagger UI:
http://localhost:3001/docs

All REST contracts are frozen as **v1**.

---

## Authentication
- JWT-based
- Login/Register are public
- All `/docs/*` endpoints require JWT
- Authorization header:


Authorization: Bearer <jwt>


---

## Collaboration Flow (Frontend Must Follow)

1. User logs in → receives JWT
2. Frontend requests:


POST /docs/:docId/collab-token

3. Backend returns short-lived collab token
4. Frontend connects to WebSocket:


ws://localhost:1234

5. Collab token is sent during WS handshake
6. Yjs document sync begins

---

## Permissions
- Backend is authoritative
- Frontend must NOT assume permissions
- Join role may be overridden by backend

---

## Persistence Guarantees
- Document state is persisted server-side
- Snapshots are immutable
- Restore operation is auditable

---

## Error Handling
- 401 → Invalid or missing JWT
- 403 → Permission denied
- 404 → Document not found
- 500 → Server error (loggable)

---

## Do NOT
- Do not bypass REST APIs
- Do not connect to WS without collab token
- Do not assume editor permissions
