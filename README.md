# Wandr

A Pokémon Go-style city exploration web app that gamifies discovering local businesses and neighborhoods.

## Tech Stack

- **Frontend:** React + TypeScript + Vite
- **Maps:** Google Maps JavaScript API (2D) with Three.js overlay (stretch goal)
- **Backend:** Express.js + TypeScript
- **Database:** PostgreSQL with PostGIS for geospatial queries
- **Auth:** Mock JWT (AWS Cognito ready)
- **AI:** Google Gemini for quest generation and insights

## Project Structure

```
wandr/
├── client/          # React frontend
├── server/          # Express.js backend
├── .env.example     # Environment variables template
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL with PostGIS extension
- Google Maps API key
- (Optional) Google Gemini API key

### Environment Setup

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Fill in your API keys and database credentials in `.env`

### Backend Setup

```bash
cd server
npm install
npm run migrate    # Run database migrations
npm run seed       # Seed demo data
npm run dev        # Start development server
```

### Frontend Setup

```bash
cd client
npm install
npm run dev        # Start Vite dev server
```

## Features

### Consumer App
- 🗺️ Interactive map with business pins
- 📍 Check-in at locations for points
- 🏆 Capture neighborhoods by visiting locations
- 🎯 Complete quests and challenges
- 🎁 Redeem rewards at businesses
- 👥 Social feed with friends
- 📊 Leaderboards and achievements

### Business Dashboard
- 📈 Analytics and visitor insights
- 🎉 Create promotions and challenges
- ⚡ Boost visibility with paid features

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user

### Map & Locations
- `GET /api/businesses` - Nearby businesses (PostGIS)
- `GET /api/businesses/:id` - Business details
- `GET /api/zones` - Zones in viewport

### Check-ins
- `POST /api/checkins` - Create check-in
- `GET /api/checkins/history` - User's check-in history

### Social
- `GET /api/feed` - Activity feed
- `POST /api/feed/:id/like` - Like a post
- `POST /api/feed/:id/comment` - Comment on a post

## Points System

| Action | Points |
|--------|--------|
| Visit new location | 10 |
| Repeat visit | 5 |
| With friend bonus | +5 |
| Off-peak promotion | +10 |
| Complete challenge | 15-50 |
| Complete sidequest | 25-100 |
| Capture neighborhood | 50 |
| Daily streak | 5 × day |

## License

MIT
