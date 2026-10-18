# ShareT Trello Power-Up

Adds a **"Share via ShareT"** button to every Trello card, letting you generate a ShareT share link without leaving Trello.

## How it works
1. Click the **Share via ShareT** button on any Trello card
2. A popup confirms the card + board details
3. Click **Open ShareT** — ShareT opens pre-filled with the card's data
4. Generate your share link as normal

## Setup (one-time)

### 1. Register the Power-Up with Trello
1. Go to https://trello.com/power-ups/admin
2. Click **New Power-Up**
3. Set **Iframe connector URL** to:
   ```
   https://YOUR_SHARET_URL/power-up/index.html
   ```
   Replace `YOUR_SHARET_URL` with the HTTPS domain configured for your ShareT deployment.

4. Enable capabilities: **card-buttons**, **card-badges**, **card-detail-badges**
5. Save

### 2. Add to a Trello board
1. Open any Trello board
2. Click **Power-Ups** (top menu)
3. Find **ShareT** and click **Add**

That's it — the **Share via ShareT** button now appears on every card's back.

## Files
| File | Purpose |
|---|---|
| `index.html` | Power-Up connector (capabilities manifest) |
| `share-popup.html` | Card button popup — opens ShareT pre-filled |
| `links-popup.html` | Shows previous ShareT links for the card |
| `manifest.json` | Power-Up metadata |
| `icon.svg` | Power-Up icon shown in Trello |

## Notes
- The Power-Up is served from ShareT's own backend at `/power-up/`
- No separate hosting needed
- Works with localhost during development or the configured HTTPS domain in production
