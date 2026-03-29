/**
 * US Beach Flag Monitor — extension.js
 *
 * Displays live US beach warning flag status in the GNOME top bar,
 * sourced from National Weather Service (NWS) coastal zone alerts.
 *
 * Data source: https://api.weather.gov/alerts/active?zone=<ZONE>
 * Icon source: Phosphor Icons (MIT) — https://phosphoricons.com
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Maps internal flag state → SVG filename in icons/
const FLAG_ICONS = {
    green:     'flag-green.svg',      // Low hazard — calm conditions
    yellow:    'flag-yellow.svg',     // Medium hazard — moderate surf/currents
    red:       'flag-red.svg',        // High hazard — dangerous surf/currents
    doublered: 'flag-doublered.svg',  // Water closed to the public
    purple:    'flag-purple.svg',     // Marine pests present (jellyfish etc.)
    unknown:   'flag-unknown.svg',    // Loading / error state
};

const BeachFlagIndicator = GObject.registerClass(
    class BeachFlagIndicator extends PanelMenu.Button {

        _init(extensionPath, settings) {
            super._init(0.0, 'US Beach Flag Monitor');
            this._extensionPath = extensionPath;
            this._settings = settings;
            this._timeout = null;

            // ── Panel widgets ─────────────────────────────────────
            this._icon = new St.Icon({
                gicon: this._gicon('unknown'),
                style_class: 'system-status-icon beach-flag-icon',
            });
            this.add_child(this._icon);

            this._label = new St.Label({
                text: '…',
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'beach-flag-label',
            });
            this.add_child(this._label);

            // ── Dropdown menu ─────────────────────────────────────
            this._statusItem = new PopupMenu.PopupMenuItem('Loading…', {reactive: false});
            this.menu.addMenuItem(this._statusItem);

            this._locationItem = new PopupMenu.PopupMenuItem('', {reactive: false});
            this.menu.addMenuItem(this._locationItem);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            const openItem = new PopupMenu.PopupMenuItem('Open Okaloosa Beach Safety ↗');
            openItem.connect('activate', () => {
                GLib.spawn_command_line_async('xdg-open https://myokaloosa.com/ps/beach-safety');
            });
            this.menu.addMenuItem(openItem);

            const refreshItem = new PopupMenu.PopupMenuItem('Refresh Now');
            refreshItem.connect('activate', () => this._updateFlag());
            this.menu.addMenuItem(refreshItem);

            // ── HTTP session ──────────────────────────────────────
            this._session = new Soup.Session();

            // ── Settings watchers ─────────────────────────────────
            // Immediately re-fetch when the zone changes
            this._zoneChangedId = this._settings.connect('changed::nws-zone', () => {
                this._label.set_text('…');
                this._icon.set_gicon(this._gicon('unknown'));
                this._updateFlag();
            });

            // Update panel label when location name changes (same zone, different name)
            this._nameChangedId = this._settings.connect('changed::location-name', () => {
                this._updateLocationLabel();
            });

            // Restart poll timer when refresh interval changes
            this._intervalChangedId = this._settings.connect('changed::refresh-interval', () => {
                this._restartTimer();
            });

            // ── Initial load ──────────────────────────────────────
            this._updateLocationLabel();
            this._updateFlag();
            this._startTimer();
        }

        // ── Helpers ───────────────────────────────────────────────

        _gicon(state) {
            const file = `${this._extensionPath}/icons/${FLAG_ICONS[state] ?? FLAG_ICONS.unknown}`;
            return Gio.icon_new_for_string(file);
        }

        _nwsUrl() {
            const zone = this._settings.get_string('nws-zone');
            return `https://api.weather.gov/alerts/active?zone=${zone}`;
        }

        _updateLocationLabel() {
            const name = this._settings.get_string('location-name');
            this._locationItem.label.set_text(`📍 ${name}`);
        }

        // ── Timer management ──────────────────────────────────────

        _startTimer() {
            const interval = this._settings.get_int('refresh-interval');
            this._timeout = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                interval,
                () => {
                    this._updateFlag();
                    return GLib.SOURCE_CONTINUE;
                }
            );
        }

        _restartTimer() {
            if (this._timeout) {
                GLib.Source.remove(this._timeout);
                this._timeout = null;
            }
            this._startTimer();
        }

        // ── NWS fetch ─────────────────────────────────────────────

        _updateFlag() {
            this._updateLocationLabel();

            const message = Soup.Message.new('GET', this._nwsUrl());
            // NWS requires a descriptive User-Agent
            message.request_headers.append(
                'User-Agent',
                '(USBeachFlagMonitorGnomeExtension/1.0 github.com/wishbone305/us-beach-flag-monitor)'
            );

            this._session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                null,
                (session, result) => {
                    try {
                        const bytes = session.send_and_read_finish(result);
                        const text = new TextDecoder().decode(bytes.get_data());
                        const json = JSON.parse(text);
                        const [state, label, detail] = this._parseAlerts(json);

                        this._icon.set_gicon(this._gicon(state));
                        this._label.set_text(label);

                        const now = new Date().toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        });
                        this._statusItem.label.set_text(`${detail}\nLast checked: ${now}`);
                    } catch (e) {
                        console.error(`[BeachFlag] fetch error: ${e}`);
                        this._icon.set_gicon(this._gicon('unknown'));
                        this._label.set_text('?');
                        this._statusItem.label.set_text('Error fetching conditions');
                    }
                }
            );
        }

        // ── Alert parsing → flag state ────────────────────────────

        _parseAlerts(json) {
            const features = (json.features ?? []).filter(f => {
                const event = f.properties?.event ?? '';
                return (
                    event.includes('Rip Current') ||
                    event.includes('High Surf') ||
                    event.includes('Beach Hazard') ||
                    event.includes('Marine Hazard') ||
                    event.includes('Hazardous Seas')
                );
            });

            if (features.length === 0)
                return ['green', 'Green', 'Low hazard — calm conditions'];

            const allDesc = features
                .map(f => (f.properties?.description ?? '').toLowerCase())
                .join(' ');
            const allEvents = features
                .map(f => (f.properties?.event ?? '').toLowerCase())
                .join(' ');
            const severities = features.map(f => f.properties?.severity ?? '');

            // Double red — extreme / life-threatening
            if (
                severities.includes('Extreme') ||
                allDesc.includes('life-threatening') ||
                allDesc.includes('water is closed')
            )
                return ['doublered', 'Double Red', 'Water CLOSED to the public'];

            // Red — high hazard
            if (
                severities.includes('Severe') ||
                allEvents.includes('high surf') ||
                allEvents.includes('hazardous seas') ||
                allDesc.includes('high risk') ||
                allDesc.includes('very high risk')
            )
                return ['red', 'Red', 'High hazard — dangerous surf & currents'];

            // Purple — marine pests (jellyfish, man-o-war, etc.)
            if (
                allEvents.includes('marine hazard') ||
                allDesc.includes('jellyfish') ||
                allDesc.includes('man-of-war') ||
                allDesc.includes('marine pest')
            )
                return ['purple', 'Purple', 'Marine pests present'];

            // Yellow — moderate hazard (most rip current statements)
            return ['yellow', 'Yellow', 'Medium hazard — moderate surf & currents'];
        }

        // ── Cleanup ───────────────────────────────────────────────

        destroy() {
            if (this._zoneChangedId) {
                this._settings.disconnect(this._zoneChangedId);
                this._zoneChangedId = null;
            }
            if (this._nameChangedId) {
                this._settings.disconnect(this._nameChangedId);
                this._nameChangedId = null;
            }
            if (this._intervalChangedId) {
                this._settings.disconnect(this._intervalChangedId);
                this._intervalChangedId = null;
            }
            if (this._timeout) {
                GLib.Source.remove(this._timeout);
                this._timeout = null;
            }
            this._session.abort();
            super.destroy();
        }
    }
);

export default class USBeachFlagExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._indicator = new BeachFlagIndicator(this.path, this._settings);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
