# Deploying Recruited

Recruited needs Node 20 or later and a Postgres database. `DATABASE_URL` is the only
setting. Every start applies any new migrations, and the first start on an empty
database creates the owner account and prints its email and password to the log, once.
Uploaded files are stored in Postgres, so the app keeps nothing on its own disk and a
redeploy loses nothing.

Applicants open the apply and screening links from wherever you host this, so give it a
real domain with HTTPS before you post a listing. The links are built from the address
the request came in on, so there's nothing to configure when the domain changes; listings
you already posted keep the old address, though.

## Railway

1. In Railway, create a project from this GitHub repository (or your fork of it).
2. Add a Postgres database to the project.
3. On the app's service, add the variable `DATABASE_URL` with the value
   `${{Postgres.DATABASE_URL}}`.
4. Under Settings, Networking, generate a domain (or add your own).
5. Open the deploy logs and find the lines after "Recruited is ready. Sign in with:".
   Sign in, then change the email and password under Connect Claude, Your account.

If you lose the password later, ask Claude for a password reset link while it's connected,
or use "Forgot your password?" on the sign-in page: the link it makes is printed to these
same logs. Links work once, for an hour.

`railway.json` sets everything else: Nixpacks runs `npm run build`, the start command
applies migrations before starting, and the healthcheck waits for `/login`. Railway
builds with Nixpacks rather than the Dockerfile on purpose; see the comment at the top
of `docker/Dockerfile`.

## Docker

```bash
docker compose up -d
docker compose logs app    # the owner email and password, printed once
```

That starts the app on port 3000 and a Postgres 16 beside it, with data in the
`db-data` volume. `docker-compose.yml` lists the two optional variables
(`POSTGRES_PASSWORD`, `PORT`). To upgrade, pull the repository and run
`docker compose up -d --build`; migrations apply on start.

To run only the image against a database you already have:

```bash
docker build -f docker/Dockerfile -t recruited .
docker run -p 3000:3000 -e DATABASE_URL="postgresql://…" recruited
```

## Anywhere else

```bash
npm ci
npm run build
npm start          # prisma migrate deploy && next start
```

Set `PORT` if the host expects a port other than 3000.

## Backups

Everything Recruited keeps, uploaded files and video answers included, is in the one
Postgres database, so backing up the database backs up everything.

**On Railway**, open the Postgres service, then its Backups tab, and add a daily
schedule. Railway keeps volume backups on the schedule you pick and restores one from
the same tab. The tab also offers point-in-time recovery, which restores the database to
any moment in roughly the last four weeks. See Railway's
[backups](https://docs.railway.com/volumes/backups) and
[point-in-time recovery](https://docs.railway.com/volumes/point-in-time-recovery) pages.

**With Docker Compose**, the `backup` service in `docker-compose.yml` writes a dump to
`./backups` once a day, named by date, and keeps the last 14. Copy that folder somewhere
off the machine, because a backup on the same disk goes with the disk. To restore a dump
into a fresh install:

```bash
docker compose up -d db
docker compose exec -T db pg_restore --clean --if-exists --no-owner \
  -U recruited -d recruited < backups/recruited-2026-11-19.dump
docker compose up -d
```

**Anywhere else**, run `pg_dump --format=custom` against `DATABASE_URL` on a schedule
and restore with `pg_restore`, as above.
