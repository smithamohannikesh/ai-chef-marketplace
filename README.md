# AI Chef Marketplace

A full-stack mobile application built with React Native, Expo, TypeScript, Node.js, Express, PostgreSQL, Socket.IO, and local AI integration.

This project is a learning and portfolio project focused on practical full-stack development and production-oriented tools.
## Tech Stack

### Frontend
- React Native
- Expo and Expo Router
- TypeScript
- Redux Toolkit

### Backend
- Node.js
- Express.js
- TypeScript
- REST APIs
- JWT authentication
- bcrypt password hashing
- Socket.IO

### Data Storage and AI
- PostgreSQL — backend chef data and orders
- Firebase — Popular Chefs data
- Ollama — local AI-powered recipe suggestions

### Development Tools
- Git and GitHub
- Docker
- Postman

## Features

- Chef list retrieved from the Node.js REST API
- Popular Chefs list retrieved from Firebase
- Shopping cart using Redux Toolkit
- Order creation
- User registration and login
- JWT-protected API endpoints
- AI-powered recipe suggestions using Ollama
- Real-time communication using Socket.IO
- Backend and database health checks
- Dockerized Node.js backend

## Project Structure

- `src/app/` — application screens and routes
- `src/components/` — reusable UI components
- `src/constants/` — shared constants
- `src/hooks/` — reusable React hooks
- `src/services/` — API and Firebase integrations
- `src/store/` — Redux Toolkit state management
- `assets/` — application icons and images
- `ai-chef-backend/` — Express APIs, authentication, PostgreSQL integration, AI routes and Docker configuration
- `scripts/` — project utility scripts






## Prerequisites

- Node.js and npm
- Expo-compatible development environment
- Docker Desktop
- PostgreSQL
- Ollama with a compatible model

## Run the Frontend

From the project root:

```bash
npm ci
npx expo start
```

Open the app using the iOS simulator or another supported Expo development environment.

## Run the Backend with Docker

Navigate to the backend directory:

```bash
cd ai-chef-backend
```

Build the Docker image:

```bash
docker build -t ai-chef-backend .
```

Create your backend `.env` file using the required environment variables. Do not commit secrets to Git.

Run the container:

```bash
docker run -d \
  --name ai-chef-backend-container \
  -p 3000:3000 \
  --env-file .env \
  -e DB_HOST=host.docker.internal \
  -e OLLAMA_URL=http://host.docker.internal:11434 \
  --restart unless-stopped \
  ai-chef-backend
```

This example assumes PostgreSQL and Ollama are running on the host Mac. Configure the database credentials, JWT secret, Ollama model, and other required environment variables before starting the container.

## Health Checks

Check whether the backend is running:

`GET http://localhost:3000/health`

Check the database connection:

`GET http://localhost:3000/health/db`

## Important Notes

- Install frontend dependencies separately from backend dependencies.
- The backend Docker image does not include the PostgreSQL database or Ollama model.
- Configure environment variables for your own development machine.
- Never commit `.env` files, passwords, JWT secrets, or API credentials.
- The frontend API URL must point to the backend address accessible from the simulator or device.

## Project Purpose

This project demonstrates practical skills in mobile development, backend API design, authentication, database integration, real-time communication, local AI integration, and Docker-based backend execution.
