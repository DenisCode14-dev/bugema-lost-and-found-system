# Bugema Lost & Found: backend

1. Install Node.js 18+ and MongoDB (local) or create a free MongoDB Atlas database.
2. `npm install`
3. Copy `.env.example` to `.env` and fill it in (MongoDB address, a long random JWT_SECRET, admin password).
4. `npm run seed`  (creates the first administrator)
5. `npm start`  then open http://localhost:3000

Students register themselves. Administrators are only created by the seed script.

## API (all under /api, send `Authorization: Bearer <token>`)
| Method | Path | Who |
|---|---|---|
| POST | /auth/register, /auth/login | anyone |
| GET | /auth/me | logged in |
| GET / POST | /items/lost, /items/found  (?search= &category= &status=) | logged in |
| GET | /items/:kind/:id | logged in |
| PUT / DELETE | /items/:kind/:id | admin |
| PATCH | /items/found/:id/return | admin |
| GET | /my/reports, /my/summary, /claims/mine | logged in |
| POST | /claims | logged in |
| GET | /claims  (?status=Pending) | admin |
| PATCH | /claims/:id/review  `{decision: Approved/Rejected/Info, reason}` | admin |
| GET | /stats, /users | admin |
| PATCH | /users/:id/active  `{active:true/false}` | admin |
| GET | /notifications | logged in |

Rules built in: the finder's identity is hidden from students; approving a claim reserves the item but does not mark it returned; approve/reject needs a reason.

## Project folder
- `server.js`, `routes.js`, `models.js`, `seed.js`: the backend
- `public/index.html`: the website (student and administrator), connected to the API
- `docs/Bugema-Lost-and-Found-Presentation.pptx`: presentation for the assignment

## First login
- Administrator: the registration number and password you put in `.env` (`ADMIN_REGNO`, `ADMIN_PASSWORD`), after running `npm run seed`.
- Students: use **Sign up** on the login page.
- Always open the site through the server (http://localhost:3000), not by double-clicking `index.html`.
