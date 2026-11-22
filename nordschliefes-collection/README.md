# Nordschliefe's Collection

## Run it
1. Install Node.js 18+ (nodejs.org).
2. Open `.env` and set `WRITER_USERNAME` and `WRITER_PASSWORD` (this is your Writer login).
3. In this folder run:
```
npm install
npm start
```
4. Open http://localhost:3000

## Writer account
The Writer is created from `.env` every time the server starts. Change the password there and restart to change it.
Everyone who registers on the site is always a `reader`; roles are checked on the server for every write action.

## Adding lore
Log in as the Writer, click **✦ WRITER MODE** in the nav, then **ADD UNIVERSE → ADD CATEGORY → ADD ENTRY**.
The entry editor uses Markdown with a toolbar and live preview. Only the three project shells are created on first run. There are no categories and no entries: you add all of them yourself.

## Where things live
- `data/collection.db`: the SQLite database (all lore, users, votes). Back this up.
- `uploads/`: profile pictures and lore images.
- `server.js`: backend and API. `public/`: the website (`css/style.css`, `js/app.js`).

## Deploy to Render
1. Push this folder to GitHub (`.env` is git-ignored).
2. Render: New Web Service, build `npm install`, start `npm start`.
3. Add environment variables: `WRITER_USERNAME`, `WRITER_PASSWORD`, `NODE_ENV=production`, `DATA_DIR=/var/data/db`, `UPLOAD_DIR=/var/data/uploads`.
4. Add a Persistent Disk mounted at `/var/data`. Without it, Render wipes your database and uploads on every deploy.

## Keep your data forever with Google Drive (free)
Drive stores the permanent copy. On startup the server downloads your database and images from Drive; after every change it uploads them back.
1. Go to console.cloud.google.com, create a project, and enable the **Google Drive API**.
2. IAM & Admin → Service Accounts → create one → Keys → Add key → JSON. A key file downloads.
3. In Google Drive, make a folder (e.g. "Collection Backup") and share it with the service account's email (`...@...iam.gserviceaccount.com`) as **Editor**.
4. The folder ID is the last part of its URL.
5. On Render add env vars: `GDRIVE_FOLDER_ID` and `GDRIVE_KEY` (paste the whole JSON file contents).
No Persistent Disk is needed. Note: Google sometimes refuses uploads from service accounts into a normal personal folder ("storage quota" error in the Render logs). If that happens, put the folder in a Shared Drive instead.
If Drive is unreachable at startup, the server refuses to start rather than risk overwriting your backup.
