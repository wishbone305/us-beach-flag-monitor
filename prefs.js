/**
 * US Beach Flag Monitor — prefs.js
 *
 * Preferences UI built with libadwaita (GTK4).
 * Opened via GNOME Extensions Manager gear icon.
 *
 * Location lookup flow:
 *   Zip code → Nominatim (OpenStreetMap) → lat/lon
 *             → NWS api.weather.gov/points  → forecast zone (e.g. FLZ206)
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// ---------------------------------------------------------------------------
// Preset US beach locations and their NWS coastal zone codes.
// Full zone map: https://alerts.weather.gov/
// ---------------------------------------------------------------------------
const LOCATIONS = [
    // ── Florida Gulf Coast ───────────────────────────────────────
    {name: 'Pensacola Beach, FL',       zone: 'FLZ202'},
    {name: 'Destin, FL',                zone: 'FLZ206'},
    {name: 'Fort Walton Beach, FL',     zone: 'FLZ206'},
    {name: 'Panama City Beach, FL',     zone: 'FLZ114'},
    {name: 'Clearwater Beach, FL',      zone: 'FLZ050'},
    {name: 'St. Pete Beach, FL',        zone: 'FLZ050'},
    // ── Florida Atlantic Coast ───────────────────────────────────
    {name: 'Daytona Beach, FL',         zone: 'FLZ048'},
    {name: 'Cocoa Beach, FL',           zone: 'FLZ057'},
    {name: 'Fort Lauderdale, FL',       zone: 'FLZ073'},
    {name: 'Miami Beach, FL',           zone: 'FLZ073'},
    // ── Gulf Coast ───────────────────────────────────────────────
    {name: 'Gulf Shores, AL',           zone: 'ALZ262'},
    {name: 'Galveston, TX',             zone: 'TXZ435'},
    {name: 'South Padre Island, TX',    zone: 'TXZ455'},
    // ── Southeast Atlantic ───────────────────────────────────────
    {name: 'Hilton Head, SC',           zone: 'SCZ050'},
    {name: 'Myrtle Beach, SC',          zone: 'SCZ058'},
    {name: 'Outer Banks, NC',           zone: 'NCZ195'},
    {name: 'Virginia Beach, VA',        zone: 'VAZ098'},
    // ── Mid-Atlantic & Northeast ─────────────────────────────────
    {name: 'Ocean City, MD',            zone: 'MDZ025'},
    {name: 'Cape May, NJ',              zone: 'NJZ026'},
    {name: 'Long Beach Island, NJ',     zone: 'NJZ025'},
    {name: 'Hampton Beach, NH',         zone: 'NHZ014'},
    // ── West Coast ───────────────────────────────────────────────
    {name: 'San Diego, CA',             zone: 'CAZ045'},
    {name: 'Los Angeles / Venice, CA',  zone: 'CAZ041'},
    {name: 'Santa Barbara, CA',         zone: 'CAZ039'},
    {name: 'Santa Cruz, CA',            zone: 'CAZ530'},
    // ── Hawaii ───────────────────────────────────────────────────
    {name: 'Oahu (Waikiki), HI',        zone: 'HIZ001'},
    {name: 'Maui, HI',                  zone: 'HIZ011'},
    // ── Custom ───────────────────────────────────────────────────
    {name: 'Custom…',                   zone: null},
];

const CUSTOM_IDX = LOCATIONS.length - 1;

// ---------------------------------------------------------------------------
// Zip code → NWS zone lookup (two async steps)
// ---------------------------------------------------------------------------
function lookupZip(zip, session, onSuccess, onError) {
    // Step 1: Nominatim geocoding (OpenStreetMap, no API key required)
    const nominatimUrl =
        `https://nominatim.openstreetmap.org/search` +
        `?postalcode=${encodeURIComponent(zip)}&country=US&format=json&limit=1`;

    const msg1 = Soup.Message.new('GET', nominatimUrl);
    msg1.request_headers.append(
        'User-Agent',
        'USBeachFlagMonitorGnomeExtension/1.0 (github.com/wishbone305/us-beach-flag-monitor)'
    );

    session.send_and_read_async(msg1, GLib.PRIORITY_DEFAULT, null, (s, r1) => {
        try {
            const data1 = JSON.parse(
                new TextDecoder().decode(s.send_and_read_finish(r1).get_data())
            );

            if (!data1.length) {
                onError('Zip code not found — is it a US coastal zip?');
                return;
            }

            const lat = parseFloat(data1[0].lat).toFixed(4);
            const lon = parseFloat(data1[0].lon).toFixed(4);

            // Step 2: NWS points → forecast zone
            const msg2 = Soup.Message.new(
                'GET',
                `https://api.weather.gov/points/${lat},${lon}`
            );
            msg2.request_headers.append(
                'User-Agent',
                '(USBeachFlagMonitorGnomeExtension/1.0)'
            );

            session.send_and_read_async(msg2, GLib.PRIORITY_DEFAULT, null, (s2, r2) => {
                try {
                    const data2 = JSON.parse(
                        new TextDecoder().decode(s2.send_and_read_finish(r2).get_data())
                    );

                    // forecastZone: "https://api.weather.gov/zones/forecast/FLZ206"
                    const zoneUrl = data2.properties?.forecastZone;
                    if (!zoneUrl) {
                        onError('NWS has no zone for this location');
                        return;
                    }

                    const zone = zoneUrl.split('/').pop();
                    const city  = data2.properties?.relativeLocation?.properties?.city;
                    const state = data2.properties?.relativeLocation?.properties?.state;
                    const name  = city && state ? `Zip ${zip} (${city}, ${state})` : `Zip ${zip}`;

                    onSuccess(zone, name);
                } catch (e) {
                    onError(`NWS error: ${e.message}`);
                }
            });
        } catch (e) {
            onError(`Geocoding error: ${e.message}`);
        }
    });
}

// ---------------------------------------------------------------------------
// Preferences window
// ---------------------------------------------------------------------------
export default class USBeachFlagPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const session  = new Soup.Session();

        const page = new Adw.PreferencesPage({
            title: 'Beach Flag Settings',
            icon_name: 'weather-few-clouds-symbolic',
        });
        window.add(page);

        // ── Zip Code Lookup ───────────────────────────────────────
        const zipGroup = new Adw.PreferencesGroup({
            title: 'Find by Zip Code',
            description: 'Enter any US coastal zip code to auto-detect the NWS zone',
        });
        page.add(zipGroup);

        const zipRow = new Adw.EntryRow({
            title: 'Zip Code',
            input_purpose: Gtk.InputPurpose.DIGITS,
            show_apply_button: true,
        });
        zipGroup.add(zipRow);

        const zipStatusRow = new Adw.ActionRow({
            title: '',
            subtitle: '',
            visible: false,
        });
        zipGroup.add(zipStatusRow);

        zipRow.connect('apply', () => {
            const zip = zipRow.get_text().trim();
            if (!/^\d{5}$/.test(zip)) {
                zipStatusRow.title    = 'Invalid';
                zipStatusRow.subtitle = 'Enter a 5-digit US zip code';
                zipStatusRow.visible  = true;
                return;
            }

            zipStatusRow.title    = 'Looking up…';
            zipStatusRow.subtitle = `Geocoding zip ${zip}`;
            zipStatusRow.visible  = true;

            lookupZip(
                zip, session,
                (zone, name) => {
                    settings.set_string('nws-zone', zone);
                    settings.set_string('location-name', name);
                    zipStatusRow.title    = 'Done ✓';
                    zipStatusRow.subtitle = `Zone set to ${zone} — ${name}`;
                    comboRow.selected     = CUSTOM_IDX;
                    customRow.set_text(zone);
                    customRow.visible = true;
                },
                errMsg => {
                    zipStatusRow.title    = 'Error';
                    zipStatusRow.subtitle = errMsg;
                }
            );
        });

        // ── Preset Locations ──────────────────────────────────────
        const locationGroup = new Adw.PreferencesGroup({
            title: 'Preset Locations',
            description: 'Or pick from popular US beaches',
        });
        page.add(locationGroup);

        const model      = Gtk.StringList.new(LOCATIONS.map(l => l.name));
        const currentZone = settings.get_string('nws-zone');
        const presetIdx  = LOCATIONS.findIndex(l => l.zone === currentZone);
        const initialIdx = presetIdx >= 0 ? presetIdx : CUSTOM_IDX;

        const comboRow = new Adw.ComboRow({
            title: 'Beach Location',
            subtitle: 'Select a preset or choose Custom…',
            model,
            selected: initialIdx,
        });
        locationGroup.add(comboRow);

        const customRow = new Adw.EntryRow({
            title: 'NWS Zone Code',
            text: presetIdx < 0 ? currentZone : '',
            show_apply_button: true,
            visible: initialIdx === CUSTOM_IDX,
        });
        locationGroup.add(customRow);

        customRow.connect('apply', () => {
            const zone = customRow.get_text().trim().toUpperCase();
            if (zone) {
                settings.set_string('nws-zone', zone);
                settings.set_string('location-name', zone);
            }
        });

        comboRow.connect('notify::selected', () => {
            const idx     = comboRow.selected;
            const loc     = LOCATIONS[idx];
            const isCustom = loc.zone === null;
            customRow.visible = isCustom;
            if (!isCustom) {
                settings.set_string('nws-zone', loc.zone);
                settings.set_string('location-name', loc.name);
                zipStatusRow.visible = false;
            }
        });

        // ── Refresh Interval ──────────────────────────────────────
        const refreshGroup = new Adw.PreferencesGroup({
            title: 'Refresh Interval',
            description: 'How often to check NWS for updated alerts',
        });
        page.add(refreshGroup);

        const intervalRow = new Adw.SpinRow({
            title: 'Interval (minutes)',
            subtitle: 'Between 5 and 60 minutes',
            adjustment: new Gtk.Adjustment({
                lower: 5,
                upper: 60,
                step_increment: 5,
                value: settings.get_int('refresh-interval') / 60,
            }),
            digits: 0,
        });
        refreshGroup.add(intervalRow);

        intervalRow.connect('notify::value', () => {
            settings.set_int('refresh-interval', intervalRow.value * 60);
        });

        // ── Help ──────────────────────────────────────────────────
        const helpGroup = new Adw.PreferencesGroup({
            title: 'Finding Your NWS Zone Code',
        });
        page.add(helpGroup);

        const helpRow = new Adw.ActionRow({
            title: 'Visit alerts.weather.gov',
            subtitle: 'Click your beach area to find its coastal zone code (e.g. FLZ206)',
            activatable: true,
        });
        helpRow.add_suffix(new Gtk.Image({
            icon_name: 'adw-external-link-symbolic',
            valign: Gtk.Align.CENTER,
        }));
        helpRow.connect('activated', () => {
            Gtk.show_uri(window, 'https://alerts.weather.gov/', 0);
        });
        helpGroup.add(helpRow);

        const tipRow = new Adw.ActionRow({
            title: 'Tip',
            subtitle: 'Use "Refresh Now" in the panel menu for an instant update at any time.',
        });
        helpGroup.add(tipRow);
    }
}
