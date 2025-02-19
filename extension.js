/*
 * Dash-To-Panel extension for Gnome 3
 * Copyright 2016 Jason DeRose (jderose9) and Charles Gagnon (charlesg99)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */


import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as WindowManager from 'resource:///org/gnome/shell/ui/windowManager.js';
import * as ExtensionUtils from 'resource:///org/gnome/shell/misc/extensionUtils.js';;

import * as  PanelManager from './panelManager.js';
import * as Utils from './utils.js';
import * as AppIcons from './appIcons.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const Mainloop = imports.mainloop;
const {signals: Signals} = imports;

const UBUNTU_DOCK_UUID = 'ubuntu-dock@ubuntu.com';

let panelManager;
let extensionChangedHandler;
let disabledUbuntuDock;
let extensionSystem = Main.extensionManager;

export var DTP_EXTENSION = null;
export var SETTINGS = null;
export var DESKTOPSETTINGS = null;
export var PERSISTENTSTORAGE = null;
export var EXTENSION_UUID = null;
export var EXTENSION_PATH = null;

export default class DashToPanelExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        console.log(`Initiating ${this.uuid}`);

        this._realHasOverview = Main.sessionMode.hasOverview;

        this.initTranslations();
        
        //create an object that persists until gnome-shell is restarted, even if the extension is disabled
        PERSISTENTSTORAGE = {};
    }

    enable() {
        console.log(_('This is a translatable text'));

        DTP_EXTENSION = this;

        // The Ubuntu Dock extension might get enabled after this extension
        extensionChangedHandler = extensionSystem.connect('extension-state-changed', (data, extension) => {
            if (extension.uuid === UBUNTU_DOCK_UUID && extension.state === 1) {
                _enable(this);
            }
        });

        //create a global object that can emit signals and conveniently expose functionalities to other extensions 
        global.dashToPanel = {};
        Signals.addSignalMethods(global.dashToPanel);
        
        _enable(this);
    }

    disable(reset = false) {
        panelManager.disable();

        DTP_EXTENSION = null;
        SETTINGS = null;
        panelManager = null;

        if (!reset) {
            extensionSystem.disconnect(extensionChangedHandler);
            delete global.dashToPanel;

            // Re-enable Ubuntu Dock if it was disabled by dash to panel
            if (disabledUbuntuDock && Main.sessionMode.allowExtensions) {
                (extensionSystem._callExtensionEnable || extensionSystem.enableExtension).call(extensionSystem, UBUNTU_DOCK_UUID);
            }

            AppIcons.resetRecentlyClickedApp();
        }

        Main.sessionMode.hasOverview = this._realHasOverview;
    }
}

function _enable(extension) {
    let ubuntuDock = Main.extensionManager ?
                     Main.extensionManager.lookup(UBUNTU_DOCK_UUID) : //gnome-shell >= 3.33.4
                     ExtensionUtils.extensions[UBUNTU_DOCK_UUID];

    if (ubuntuDock && ubuntuDock.stateObj && ubuntuDock.stateObj.dockManager) {
        // Disable Ubuntu Dock
        let extensionOrder = (extensionSystem.extensionOrder || extensionSystem._extensionOrder);

        Utils.getStageTheme().get_theme().unload_stylesheet(ubuntuDock.stylesheet);
        ubuntuDock.stateObj.disable();
        disabledUbuntuDock = true;
        ubuntuDock.state = 2; //ExtensionState.DISABLED
        extensionOrder.splice(extensionOrder.indexOf(UBUNTU_DOCK_UUID), 1);

        //reset to prevent conflicts with the ubuntu-dock
        if (panelManager) {
            disable(true);
        }
    }

    if (panelManager) return; //already initialized

    SETTINGS = extension.getSettings('org.gnome.shell.extensions.dash-to-panel');
    DESKTOPSETTINGS = extension.getSettings('org.gnome.desktop.interface');
    EXTENSION_UUID = extension.uuid
    EXTENSION_PATH = extension.path

    Main.layoutManager.startInOverview = !SETTINGS.get_boolean('hide-overview-on-startup');

    if (SETTINGS.get_boolean('hide-overview-on-startup') && Main.layoutManager._startingUp) {
        Main.sessionMode.hasOverview = false;
        Main.layoutManager.connect('startup-complete', () => {
            Main.sessionMode.hasOverview = extension._realHasOverview
        });
    }

    panelManager = new PanelManager.PanelManager();

    panelManager.enable();
}
