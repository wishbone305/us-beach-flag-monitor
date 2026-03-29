# US Beach Flag Monitor

A GNOME Shell extension that displays live US beach warning flag conditions in your top bar, powered by the [National Weather Service (NWS)](https://www.weather.gov/) alerts API. No API key required.

```
┌─────────────────────────────────────────┐
│  🟡 Yellow  📍 Destin, FL               │  ← top bar
└─────────────────────────────────────────┘

Click to expand:
  Medium hazard — moderate surf & currents
  Last checked: 08:45 AM
  📍 Destin, FL
  ──────────────────────
  Open Okaloosa Beach Safety ↗
  Refresh Now
```

## Features

- **Live flag status** — green, yellow, red, double red, and purple flags
- **Instant location change** — panel refreshes the moment you pick a new zone in settings
- **Zip code lookup** — type any US coastal zip to auto-detect the NWS zone
- **27 preset beaches** — Florida, Gulf Coast, Southeast Atlantic, Northeast, West Coast, Hawaii
- **Custom NWS zone** — enter any `XXZnnn` code manually
- **Configurable refresh interval** — 5 to 60 minutes
- **No API key** — uses the free, public NWS alerts API
- **GNOME 45–49 compatible**

## Flag Colors

| Icon | Flag | Meaning |
|------|------|---------|
| 🟢 | Green | Low hazard — calm conditions |
| 🟡 | Yellow | Medium hazard — moderate surf/currents |
| 🔴 | Red | High hazard — dangerous surf & currents |
| ⛔ | Double Red | Water closed to the public |
| 🟣 | Purple | Marine pests present (jellyfish, man-o-war) |
| ⚪ | Unknown | Loading or network error |

## Requirements

- GNOME Shell **45, 46, 47, 48, or 49**
- `glib-compile-schemas` (included in `glib2` / `libglib2.0-bin`)
- Internet connection (NWS alerts API + Nominatim geocoding)

## Installation

### Automatic (recommended)

```bash
git clone https://github.com/wishbone305/us-beach-flag-monitor.git
cd us-beach-flag-monitor
chmod +x install.sh
./install.sh
```

If this is your first time installing the extension, log out and back in, then run:

```bash
gnome-extensions enable us-beach-flag-monitor@wishbone305
```

### Manual

```bash
UUID="us-beach-flag-monitor@wishbone305"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

mkdir -p "$DEST"
cp -r extension.js prefs.js metadata.json stylesheet.css icons schemas "$DEST/"
glib-compile-schemas "$DEST/schemas/"

# Log out and back in, then:
gnome-extensions enable "$UUID"
```

## Configuration

Open **GNOME Extensions Manager**, find **US Beach Flag Monitor**, and click the gear icon.

| Setting | Description |
|---------|-------------|
| **Zip Code** | Enter a US coastal zip to auto-detect zone |
| **Beach Location** | Choose from 27 preset US beaches |
| **Custom NWS Zone** | Enter any zone code (e.g. `FLZ206`) |
| **Refresh Interval** | How often to poll NWS (5–60 min) |

### Finding Your NWS Zone

1. Visit [alerts.weather.gov](https://alerts.weather.gov/)
2. Click on your beach area on the map
3. Note the zone code (e.g. `FLZ206` for Okaloosa Coastal, FL)

## How It Works

1. The extension calls `https://api.weather.gov/alerts/active?zone=<ZONE>`
2. It filters for rip current, high surf, beach hazard, and marine hazard alerts
3. Alert severity and keywords are mapped to flag colors
4. The panel icon and label update immediately

Zip code lookup uses [Nominatim](https://nominatim.openstreetmap.org/) (OpenStreetMap) to geocode the zip to coordinates, then the NWS `/points` endpoint to resolve the forecast zone.

## Development

```bash
# Clone and install locally
git clone https://github.com/wishbone305/us-beach-flag-monitor.git
cd us-beach-flag-monitor
./install.sh

# After making changes to extension.js or prefs.js,
# re-run install.sh and log out/in to reload

# Validate schema changes
glib-compile-schemas schemas/

# View extension logs
journalctl -f /usr/bin/gnome-shell | grep BeachFlag
```

## Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

Bug reports and location additions (NWS zone codes) are welcome via [Issues](https://github.com/wishbone305/us-beach-flag-monitor/issues).

## License

MIT — see [LICENSE](LICENSE)

---

*Icon design based on [Phosphor Icons](https://phosphoricons.com/) (MIT). Data from [National Weather Service](https://www.weather.gov/) (public domain). Geocoding by [Nominatim / OpenStreetMap](https://nominatim.openstreetmap.org/) (ODbL).*
