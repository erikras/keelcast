# Keelcast

[![Keelcast](./thumbnail.png)](https://youtu.be/LBlaH6tdPxg)

## Structure

- `frontend/` - React Router + Vite frontend application
- `backend/` - Keel backend with functions and subscribers

## Getting Started

### Install Dependencies

```bash
pnpm install
```

### Development

Run both frontend and backend in parallel:
```bash
pnpm dev
```

Run individual packages:
```bash
# Frontend only
pnpm dev:frontend

# Backend only  
pnpm dev:backend
```

### Building

Build all packages:
```bash
pnpm build
```

Build individual packages:
```bash
# Frontend only
pnpm build:frontend

# Backend only
pnpm build:backend
```

### Type Checking

Run type checking across all packages:
```bash
pnpm typecheck
```

## Package Details

### Frontend (@keelcast/frontend)

- **Framework**: React Router v7 with Vite
- **Styling**: Tailwind CSS
- **Location**: `./frontend/`
- **Dev Server**: `pnpm dev:frontend`

### Backend (@keelcast/backend)

- **Framework**: Keel
- **Location**: `./backend/`
- **Dev Server**: `pnpm dev:backend`