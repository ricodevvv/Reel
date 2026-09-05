# Reel

A self-hosted download panel. Paste a link, and yt-dlp fetches it inside a throwaway container on
your own machine, streaming the log to your browser as it goes. One file comes back as a file; a
playlist comes back as a zip.

It also reads a public Spotify playlist's track list — titles, artists, albums, ISRCs — and hands it
back as a spreadsheet. **Metadata only, and no audio.** See [Spotify](#spotify-playlists) for why.

MIT licensed. It wears the Euronic panel's design: Next.js, shadcn components, dark-first.

## Quick start

On a fresh VPS, as root or with sudo available:

```bash
git clone <this repository> reel
cd reel
./deploy.sh
```

It asks one question:

```
  Domain (e.g. reel.example.com), or blank:
```

Give it a domain that already points at this server and it installs nginx, writes the reverse proxy,
gets a Let's Encrypt certificate with certbot, redirects HTTP to HTTPS, and binds the panel to
localhost so nothing but nginx can reach it. Leave it blank and it serves plain HTTP on port 3200;
you can add the domain later with `./deploy.sh domain reel.example.com you@example.com`.

Either way it installs Docker if it is missing, builds the three images, generates the password and
the secrets, brings the stack up and prints the URL. The password is shown once and stored only as
an scrypt hash, so write it down.

```bash
./deploy.sh update            # rebuild from the current checkout and restart
./deploy.sh update-fetcher    # rebuild the yt-dlp image — this is how yt-dlp gets updated
./deploy.sh spotify <id> <secret>
./deploy.sh password
./deploy.sh logs
./deploy.sh down              # stop, without deleting anything
```

**`update-fetcher` is the one to remember.** Sites change and yt-dlp follows them, often weekly. When
a download that used to work starts failing, that command is almost always the fix.

## Downloading

Paste a URL, pick a format — mp4, m4a or mp3 — and optionally cap the resolution. The job page shows
a progress bar and the live log; the files appear underneath as soon as they exist, individually or
as one zip.

A few decisions worth knowing about:

- **The source is read before anything is fetched.** `yt-dlp --flat-playlist` costs one request even
  for a playlist of hundreds, so the panel knows the title and the item count up front, and a
  playlist over `REEL_MAX_ITEMS` is refused before it starts filling a disk.
- **A partly failed playlist still keeps what worked.** yt-dlp exiting non-zero with files on disk is
  reported as a success with a note, not as a failure with the files thrown away.
- **Files are addressed by index, not by name.** yt-dlp names a file after the title it found, which
  can be anything at all; the real name still reaches the browser in the `Content-Disposition`.
- **The zip is stored, not deflated.** Every file in it is already a compressed media container, so
  compressing again would spend minutes of CPU to save nothing.

yt-dlp supports far more than YouTube, and nothing here restricts it to one site. What is restricted
is the shape of the URL: http and https only, and never an address on this machine's own network.

## Spotify playlists

This reads what a public playlist **contains** and gives you a CSV: position, title, artists, album,
length, ISRC, and a link. That is enough to rebuild the playlist on another service or keep a record
of one, and the ISRC is what a migration actually matches on.

There is no audio, and that is a deliberate limit rather than an unfinished feature. Spotify does not
hand out the recordings, so every tool that claims to "download a Spotify playlist" is really reading
the track list and then fetching a copy of each song from somewhere else. This does not do that.

`./deploy.sh spotify <client-id> <client-secret>` with credentials from
[developer.spotify.com](https://developer.spotify.com/dashboard) turns it on. Client credentials read
public playlists only — a private one would mean asking a person to sign in, and nothing here needs
anything that belongs to a person.

## What you download is your responsibility

This is a self-hosted tool that automates what a browser already does. Whether a given download is
allowed depends on the content, the platform's terms, and where you are — your own uploads, Creative
Commons material and public-domain works are one thing, and a commercial catalogue is another.

Nothing here breaks DRM, and nothing here is a way around paying for a streaming service.

## Layout

```
deploy.sh              the whole installation, and every operation after it
compose.yaml           two services, one network
Dockerfile.fetcher     yt-dlp and ffmpeg, and nothing else
worker/                the download service: probe, fetch, keep
  src/jobs/            queue, runner, logs, archive
  src/routes/          the HTTP API
panel/                 the Next.js panel
```

The worker has **no runtime dependencies** — the Node standard library and nothing else. No database
either: a job is a JSON file and a log file. At this scale that buys a service with nothing to
compile into the image and a history you can read with `cat`.

The fetcher image is built here rather than pulled from someone else's registry. It is six lines, it
is the only place an untrusted binary could enter the stack, and building it is what makes
`update-fetcher` mean something.

## Configuration

`deploy.sh` writes `.env`; every value is documented in `.env.example`. The ones worth knowing:

| Variable | Default | |
|---|---|---|
| `REEL_DATA_ROOT` | `/opt/euronic-reel/data` | Jobs, logs, downloads. See the warning below. |
| `REEL_MAX_CONCURRENT_JOBS` | `2` | |
| `REEL_MAX_ITEMS` | `50` | A playlist longer than this is refused before it starts. |
| `REEL_JOB_RETENTION` | `50` | Jobs that keep their files. Older rows stay, their contents go. |
| `REEL_JOB_TIMEOUT_SECONDS` | `3600` | |
| `REEL_API_TOKEN` | generated | `Authorization: Bearer`, for queueing a download from a script. |

`REEL_DATA_ROOT` is mounted into the worker **at the same path it has on the host**, and that is not
cosmetic. The worker does not run Docker; it asks the host's daemon to run containers, and every path
it passes as a bind mount is resolved by that daemon against the host filesystem. A container-only
path would mount as an empty directory and every download would silently produce nothing. Move the
directory if you need to change it; do not just edit the variable.

## Security

The worker holds the Docker socket, which is equivalent to root on the host. It is not published on
any port: only the panel can reach it, over the compose network. Keep it that way, and keep the
password to yourself.

The fetcher container runs as `nobody`, drops new privileges, has its memory capped, and can see
exactly one directory: the output folder of the job it is running.

## Troubleshooting

**"The fetcher image is not built"** — run `./deploy.sh update-fetcher`.

**A download that used to work now fails** — nearly always yt-dlp being behind the site. Same command.

**"Sign in to confirm you're not a bot"** in a log — YouTube is rate-limiting this server's address.
yt-dlp's own documentation covers the options; none of them is something this panel can do for you.

**"That is N items, and the limit is 50"** — raise `REEL_MAX_ITEMS` in `.env` and `./deploy.sh update`,
having checked there is disk for it.

**The zip is missing a file** — retention took it. `REEL_JOB_RETENTION` decides how many jobs keep
their contents.
