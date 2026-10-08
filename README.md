# InvidiousTube

A self-hosted frontend for [Invidious](https://invidious.io) that looks and behaves like the 2024 YouTube desktop site — home feed, watch page, player, channels, playlists, search, library — backed entirely by your own Invidious + invidious-companion instance.

## DISCLAIMER - This was 100% AI Generated with Claude. This is for my personal use only, and only have it public for convienence.

## Features

- **YouTube 2024 UI**: masthead with search suggestions & voice search, responsive guide (full / mini / drawer), chip bars, rich grid with hover previews and watch-progress bars, dark & light themes.
- **Custom player** (Shaka Player, DASH through invidious-companion): up to 4K/8K quality menu, playback-speed panel, captions, chapters with segmented seek bar, storyboard previews, ambient mode, theater mode, miniplayer, full screen, autoplay countdown & end screen, stats for nerds, sleep timer, loop, all of YouTube's keyboard shortcuts.
- **Watch page**: metadata row, like/dislike (with Return YouTube Dislike counts), share, download, save to playlist, expandable description with chapters, threaded comments, related videos, playlist panel with loop/shuffle.
- **Hide Shorts** (on by default): Shorts are filtered out of the home feed, subscriptions, notifications, search, recommendations and autoplay. Invidious' feeds don't mark Shorts, so the server asks `youtube.com/shorts/<id>` for videos of 3 minutes or less and caches the answer.
- **SponsorBlock**: per-category skip / skip-button / show-only, segments on the seek bar, “Skipped sponsor · Undo” notice.
- **Accounts – your choice**: works fully logged out (subscriptions, history, Watch later, likes and playlists stored in the browser), or sign in with your Invidious account to sync subscriptions, history and playlists. Local subscriptions can be imported into the account.
- **Link redirect**: swap `www.youtube.com` / `youtu.be` for your InvidiousTube domain in any YouTube link and it opens here — videos (with timestamps and playlists), Shorts, live, embeds, channels (`/@handle`, `/channel/…`, `/c/…`, `/user/…`), playlists and searches. Pasting a YouTube link into the search box works too, and Settings → Link redirect has a converter and a bookmarklet.
- **Watch parties**: hit *Watch together* under any video (or in a video's ⋮ menu) and share the link. Everyone who joins stays in sync — play, pause, seek and speed — and anyone can click a video to switch the whole party to it. YouTube-live-chat-style panel with **chat**, a shared **queue** (⋮ → *Add to party queue*, drag to reorder, auto-advance) and **people** list. The host can lock the party, kick people, hand over host, and toggle who may pick videos, control playback or queue, queue-instead-of-play, speed sync, autoplay and chat. No accounts needed (just a nickname); party links unfurl in Discord as "Join <host>'s watch party" with what's playing. Parties live in memory and end 30 minutes after the last person leaves.
- **Discord / chat embeds**: paste a video link (`/watch?v=…`, `/<id>`, `/shorts/<id>`, …) into Discord and it unfurls like a real YouTube link — channel name, title, description, red accent and a 360p video that plays right in the chat. Clicking the title opens the watch page (in Discord's built-in browser on mobile). Works with Telegram, Slack, Mastodon, etc. too. Your instance has to be reachable from the internet for the chat app to fetch the preview.
- **Import / export**: YouTube Takeout CSV, NewPipe/Invidious JSON, FreeTube/RSS OPML, and full library backups.

## Utility toolbar (experimental)

Turn on *Settings > Playback > Utility toolbar* for an Enhancer-for-YouTube-style bar under the player (desktop): loop (right-click for an A-B section loop), volume booster (level in Settings), cinema mode, expand player, pop-up (Picture-in-Picture), speed -/+ (scroll the readout to fine-tune, click to reset), video filters (click the caret for brightness, contrast, saturation, hue, rotate, flip...) and frame screenshots.

## Mobile app

Phones automatically get an app-style layout modelled on the YouTube Android/iOS app (override it under Settings > Appearance > Layout):

- Bottom tab bar (Home, Explore, Subscriptions, You), a top bar that hides as you scroll, and full-screen search
- A watch view that slides up over the page you were on, with comments and description in bottom sheets
- Touch player: tap for controls, double-tap the sides to seek 10s, hold for 2x speed, swipe down to minimize, swipe up or rotate the phone for full screen
- A miniplayer docked above the tab bar (swipe it sideways to dismiss)
- Optional Shorts tab (Settings > Playback): a full-screen swipe player fed by your subscriptions' Shorts plus Shorts from trending channels. Independent of *Hide Shorts*, which only keeps them out of your feeds.
- Installable as a full-screen web app: on Android choose *Install app*, on iOS *Share > Add to Home Screen*. Once installed, sharing a YouTube link to it from the YouTube app or a browser opens the video here.

## How it works

```
Browser ──► InvidiousTube (Node, :8080)
              ├─ serves the built SPA
              ├─ /api/v1, /vi, /ggpht, /sb, /s_p ─► Invidious        (thumbnails cached in memory)
              ├─ /companion/*                      ─► invidious-companion (DASH + video streams)
              ├─ /auth/*                            Invidious login → httpOnly session cookie
              ├─ /x/feed                            subscription feed for logged-out users
              ├─ /x/sponsorblock, /x/ryd            cached SponsorBlock / RYD lookups
              ├─ /x/oembed, /x/embed/<id>.mp4       link-preview metadata + inline video (itag 18 via companion)
              ├─ /x/party, /x/party/ws              watch parties (REST + WebSocket sync)
```

Video pages requested by chat-app crawlers (Discordbot, Telegram, Slack, …) get Open Graph / Twitter / oEmbed tags injected into the HTML server side.

Everything is same-origin, so the browser never needs direct access to Invidious or companion — only the InvidiousTube server does.

## Install in an LXC (Debian / Ubuntu)

```bash
git clone <this repo> ~/InvidiousTube
cd ~/InvidiousTube
sudo INVIDIOUS_URL=http://192.168.1.113:3000 COMPANION_URL=http://192.168.1.113:8282 ./deploy/install.sh
```

The script installs Node.js 22 (if needed), copies the app to `/opt/invidioustube`, builds it, writes `/etc/invidioustube.env` and starts the `invidioustube` systemd service. Then open `http://<container-ip>:8080`.

- Logs: `journalctl -u invidioustube -f`
- Config: `/etc/invidioustube.env` (restart with `sudo systemctl restart invidioustube`)
- **Updating**: `git pull` in your checkout, then reboot the container (or `sudo systemctl restart invidioustube`). The service rebuilds itself on start whenever the source changed, and keeps the previous build running if a rebuild fails. Set `AUTO_UPDATE=1` in the env file to have it `git pull` on every start as well.
- If the systemd unit itself changed in an update, run `sudo ./deploy/update.sh` once (pulls, reinstalls the unit, restarts).

### Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | Port to listen on |
| `HOST` | `0.0.0.0` | Bind address |
| `INVIDIOUS_URL` | `http://127.0.0.1:3000` | Your Invidious instance (LAN address recommended) |
| `COMPANION_URL` | `http://127.0.0.1:8282` | invidious-companion base URL (without `/companion`) |
| `ENABLE_SPONSORBLOCK` | `1` | Allow SponsorBlock lookups (sends a 4-char hash prefix to sponsor.ajay.app) |
| `ENABLE_RYD` | `1` | Allow Return YouTube Dislike lookups |
| `ENABLE_SHORTS_CHECK` | `1` | Detect Shorts by asking youtube.com (only for videos ≤ 3 min or of unknown length) |
| `COOKIE_SECURE` | `0` | Set to `1` when serving over HTTPS (marks the login cookie `Secure`) |
| `IMAGE_CACHE_MB` | `256` | In-memory thumbnail cache size |
| `PUBLIC_URL` | request host | Public address (e.g. `https://tube.example.com`) used for absolute URLs in link previews |
| `EMBED_SITE_NAME` | `YouTube` | Site name shown on Discord / chat link previews |
| `EMBED_VIDEO` | `1` | `0` = link previews show only the thumbnail instead of an inline-playable 360p video |
| `SOURCE_DIR` | install checkout | Git checkout the service rebuilds from on start |
| `AUTO_UPDATE` | `0` | `1` = `git pull` the checkout on every start |

### Reverse proxy / HTTPS (optional)

Put any reverse proxy in front and forward everything to the container. Example for Caddy:

```
tube.example.lan {
    reverse_proxy 192.168.1.50:8080
}
```

For nginx make sure buffering is off for streams: `proxy_buffering off; proxy_request_buffering off;`, and pass WebSocket upgrades through for watch parties: `proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";` (Caddy does this automatically). Set `COOKIE_SECURE=1` when using HTTPS.

## Development

```bash
cp .env.example .env   # point INVIDIOUS_URL / COMPANION_URL at your instance
npm install
npm run dev            # Vite on :5173, API server on :8080
```

`npm run build` builds the frontend into `web/dist`; `npm start` serves it together with the proxy.

## Notes & limitations

- Commenting, liking (server side), uploading and reporting are not possible through Invidious — likes and “Not interested” are stored locally.
- Invidious' Watch later/Liked are not part of its API, so those two lists are always stored in the browser.
- Live streams play only when your Invidious instance can play them.
- Newer Invidious versions return incomplete trending data (0 views, no duration); InvidiousTube fetches the details lazily for visible cards.
- The default site name is “YouTube” to complete the look — change it under **Settings → Appearance → Site name**.
