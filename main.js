const { app, BrowserWindow, Tray, Menu, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");

let mainWindow;
let tray = null;

// Obtain the single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
	app.quit();
} else {
	app.on("second-instance", (event, commandLine, workingDirectory) => {
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
		}
	});

	const configPath = path.join(__dirname, "config.yml");
	const config = yaml.load(fs.readFileSync(configPath, "utf8"));

	const { version } = require("./package.json");

	function createMainWindow() {
		mainWindow = new BrowserWindow({
			title: "Jukebox RPC Client",
			icon: path.join(__dirname, "icon.ico"),
			width: 350,
			height: 450,
			resizable: true,
			webPreferences: {
				nodeIntegration: true,
				contextIsolation: false,
			},
			autoHideMenuBar: true,
			show: false,
		});

		mainWindow.once("ready-to-show", () => {
			mainWindow.show();
		});

		mainWindow.loadFile(path.join(__dirname, "index.html"));

		mainWindow.on("close", (event) => {
			if (!app.isQuitting) {
				event.preventDefault();
				mainWindow.hide();
			}
		});

		mainWindow.on("closed", () => {
			mainWindow = null;
		});

		tray = new Tray(path.join(__dirname, "icon.ico"));
		const contextMenu = Menu.buildFromTemplate([
			{
				label: `Build Version ${version}`,
				enabled: false,
			},
			{ type: "separator" },
			{
				label: "Show App",
				click: () => {
					mainWindow.show();
				},
			},
			{
				label: "Quit",
				click: () => {
					app.isQuitting = true;
					app.quit();
				},
			},
		]);
		tray.setToolTip(config.title);
		tray.setContextMenu(contextMenu);
		tray.on("double-click", () => {
			mainWindow.show();
		});

		mainWindow.webContents.on("did-finish-load", () => {
			mainWindow.webContents.send("config", config);
		});
	}

	app.on("ready", createMainWindow);

	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") {
			app.quit();
		}
	});

	app.on("activate", () => {
		if (mainWindow === null) {
			createMainWindow();
		} else {
			mainWindow.show();
		}
	});
}
