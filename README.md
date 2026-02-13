# CollabCode

A real-time collaborative code editor built with React, Express, Prisma, and PostgreSQL.

## Tech Stack
- **Frontend**: React, Vite, TypeScript, Monaco Editor, Tailwind CSS
- **Backend**: Node.js, Express, Prisma ORM
- **Database**: PostgreSQL
- **Authentication**: JWT

## Prerequisites
- Node.js (v18 or higher recommended)
- PostgreSQL database

## Getting Started

### 1. Clone the repository
```bash
git clone <repository-url>
cd collab-code
```

### 2. Install dependencies
Install dependencies for the root, backend, and client:
```bash
npm run install:all
```

### 3. Environment Setup

#### Backend
Create a `.env` file in the `backend` directory:
```bash
cp backend/.env.example backend/.env
```
Update the `DATABASE_URL` and `JWT_SECRET` in `backend/.env`.

#### Client
Create a `.env` file in the `client` directory:
```bash
cp client/.env.example client/.env
```
Update `VITE_API_URL` if your backend is running on a different port.

### 4. Database Setup
Generate Prisma client and run migrations:
```bash
npm run prisma:generate
npm run prisma:migrate
```

### 5. Run the Application
Start both the backend and client concurrently:
```bash
npm run dev
```
- Frontend: [http://localhost:8080](http://localhost:8080)
- Backend: [http://localhost:3001](http://localhost:3001)

## Project Structure
- `/backend`: Express API and Prisma schema.
- `/client`: React frontend with Monaco editor.
- `/docs`: Project documentation and diagrams.

## Scripts
- `npm run install:all`: Installs all dependencies.
- `npm run dev`: Starts both frontend and backend.
- `npm run dev:backend`: Starts only the backend.
- `npm run dev:client`: Starts only the client.
- `npm run prisma:generate`: Generates Prisma client.
- `npm run prisma:migrate`: Runs database migrations.
