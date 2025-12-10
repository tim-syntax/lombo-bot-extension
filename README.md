# BC.Game Limbo Bot - Chrome Extension

An automated betting bot for BC.Game Limbo that follows a progressive betting strategy.

## Betting Strategy

| Step | Bet Amount | Payout | On Win | On Lose |
| ---- | ---------- | ------ | ------ | ------- |
| 1    | 0.01       | 2x     | Step 1 | Step 2  |
| 2    | 0.02       | 2x     | Step 1 | Step 3  |
| 3    | 0.04       | 2x     | Step 1 | Step 4  |
| 4    | 0.1        | 2x     | Step 1 | Step 5  |
| 5    | 0.2        | 2x     | Step 1 | Step 6  |
| 6    | 0.4        | 2x     | Step 1 | Step 7  |
| 7    | 1          | 2x     | Step 1 | Step 8  |
| 8    | 2          | 2x     | Step 1 | Step 9  |
| 9    | 4          | 2x     | Step 1 | Step 10 |
| 10   | 10         | 2x     | Step 1 | Step 11 |
| 11   | 20         | 2x     | Step 1 | Step 12 |
| 12   | 40         | 2x     | Step 1 | Step 1  |

## Installation

1. **Download/Clone** this extension folder

2. **Add Icons** (Required):

   - Create/add PNG icons in the `icons/` folder:
     - `icon16.png` (16x16 pixels)
     - `icon48.png` (48x48 pixels)
     - `icon128.png` (128x128 pixels)
   - You can use any rocket/bot emoji or create simple icons

3. **Load in Chrome**:

   - Open Chrome and go to `chrome://extensions/`
   - Enable **Developer mode** (toggle in top right)
   - Click **Load unpacked**
   - Select this extension folder

4. **Navigate to BC.Game**:
   - Go to https://bc.game/game/limbo
   - Make sure you're logged in

## Usage

1. Click the extension icon in Chrome toolbar
2. Adjust the **delay between bets** if needed (default: 2000ms)
3. Click **▶ Start** to begin automated betting
4. Click **⏹ Stop** to pause the bot
5. Click **↺ Reset** to reset statistics and go back to Step 1

## Win/Loss Detection

- **WIN**: Result multiplier ≥ 2.0x (displayed in green)
- **LOSE**: Result multiplier < 2.0x (displayed in gray/black)

The bot reads the multiplier value from the result display and compares it to 2.0 threshold.

## Features

- ✅ Automatic bet placement
- ✅ Win/Loss detection based on multiplier value (≥2.0x = win)
- ✅ Progressive betting strategy
- ✅ Real-time statistics with profit tracking
- ✅ Activity log
- ✅ Floating status indicator on page
- ✅ Adjustable bet delay
- ✅ State persistence (remembers step after page refresh)

## Important Notes

⚠️ **Gambling Warning**: This bot is for educational purposes. Gambling involves risk. Never bet more than you can afford to lose.

⚠️ **BC.Game Updates**: If BC.Game updates their website, the bot may need selector adjustments in `content.js`.

⚠️ **Manual Calibration**: You may need to manually adjust the selectors in `content.js` if the bot can't find the input/button elements. Open browser console (F12) to see bot logs.

## Troubleshooting

**Bot can't find elements:**

1. Open browser DevTools (F12)
2. Check console for messages starting with `[Limbo Bot]`
3. Inspect the bet input field and bet button
4. Update selectors in `content.js` under `SELECTORS` object

**Bot not detecting win/lose:**

- Result detection is based on the multiplier value (≥2.0x = win)
- Ensure the page is fully loaded before starting the bot

## File Structure

```
bcg/
├── manifest.json      # Extension configuration
├── popup.html         # Extension popup UI
├── popup.css          # Popup styles
├── popup.js           # Popup logic
├── content.js         # Main bot logic (runs on BC.Game page)
├── content.css        # Page-injected styles
├── icons/             # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md          # This file
```

## License

For personal use only. Use responsibly.
