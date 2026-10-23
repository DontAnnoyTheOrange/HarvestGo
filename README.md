# HarvestGo 🌾

**Centralized Farm Operations Monitoring and Compliance Documentation System**

HarvestGo is a standalone web-based management and reporting platform developed for **Kabutihan Farm** in Amadeo, Cavite. Built as an academic capstone project for Cavite State University (COSC 75 Software Engineering II) by team **AgriSulong**, it streamlines farm logging, record-keeping, and the generation of official government compliance reports for the Agricultural Training Institute (DA-ATI RTC IV-A).

---

## 🚀 Key Features & Modules

- **Harvest & Sales Records:** Track crop production, yields, operational expenses, and sales data (raw and value-added items).
- **Training & Seminar Records:** Monitor service activities (trainings, technical assistance, IEC distribution) and capture participant head-counts disaggregated by demographic types (Male/Female counts, strictly non-personally identifiable).
- **ATI-Form Template Generator:** Automatically generate the official quarterly accomplishment report conforming to **ATI-QF/PAD-119 Rev. 00** (5-page landscape layout) via Puppeteer.
- **Operational Issues Tracker:** Log farm problems, actions taken, and recommendations.
- **Security & Identity Management:** Role-based access control (General Manager vs. Administrative Staff), Row-Level Security (RLS), secure cookie-based session handling, and CSRF protection.

---

## 🛠️ Tech Stack & Architecture

HarvestGo is structured as an **npm workspaces monorepo**:

- **Frontend (`apps/web`):** Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript.
- **Backend (`apps/api`):** Node.js, Express 5 (ESM), TypeScript, Vitest, Supertest.
- **Shared Package (`packages/shared`):** Shared Zod schemas, validation rules, and TypeScript interfaces used across web and API.
- **Database & Services:** Supabase (PostgreSQL, Auth, Storage, and Row-Level Security).

---

## 📂 Project Structure

```text
harvestgo/
├── apps/
│   ├── api/             # Express backend server & business logic
│   └── web/             # Next.js frontend application
├── packages/
│   └── shared/          # Shared Zod schemas and TypeScript types
├── supabase/
│   └── migrations/      # SQL database migrations & schema definitions
├── package.json         # Monorepo root configuration & workspaces
├── tsconfig.base.json   # Shared TypeScript configurations
└── README.md

⚙️ Getting Started & Setup
Prerequisites
Ensure you have the following installed on your development machine (Windows 10/11 recommended):

Node.js (v24.11.1 or higher)

npm (v11.6.2 or higher)

Git

1. Clone and Install Dependencies
Clone the repository to your local machine and install all workspace dependencies:

Bash
git clone <repository-url> harvestgo
cd harvestgo
npm install
npm install multer sharp file-type -w @harvestgo/api
npm install -D @types/multer -w @harvestgo/api

2. Configure Environment Variables
Create a root .env file based on your local configuration requirements. Never commit or share your secret keys.
API_PORT=4000
WEB_ORIGIN=http://localhost:3000
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

3. Database Migration
Apply the core schema migration (0001_core_schema.sql) located in supabase/migrations/ to your Supabase project instance using the Supabase CLI or SQL editor. This provisions the 14 core tables, custom enums, RLS policies, and helper functions.

4. Running the Development Servers
To build the shared package and start both the API server (port 4000) and the Next.js web application (port 3000) concurrently, run:
npm run dev

5. Running Tests and Typechecks
Run API tests: npm test

Run TypeScript typechecks across the workspace: npm run typecheck

👥 Roles & Permissions
General Manager (GM): Full administrative access, user management, template configuration, crop catalog management, deleting records/documents, and viewing all entries.

Administrative Staff: Can log harvests, sales, expenses, and service activities. Can view records and edit their own submitted items.

📄 License & Compliance Notes
Developed for educational purposes under Cavite State University.
Note on Data Privacy: Technical and architectural controls support compliance with RA 10173 (Data Privacy Act of 2012), but formal legal compliance requires organization-level administrative review.

