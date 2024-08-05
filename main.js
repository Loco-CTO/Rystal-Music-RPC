// main.js

const { app, BrowserWindow, Tray, Menu, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");

let mainWindow;
let tray = null;

// シングルインスタンスロックの取得
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
	app.quit();
} else {
	// 2つ目のインスタンスが開かれた時の処理
	app.on("second-instance", (event, commandLine, workingDirectory) => {
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
		}
	});

	const configPath = path.join(__dirname, "config.yml");
	const config = yaml.load(fs.readFileSync(configPath, "utf8"));

	const { version } = require("./package.json");

	// メインウィンドウの作成
	function createMainWindow() {
		mainWindow = new BrowserWindow({
			title: "Jukebox RPC Client",
			icon: path.join(__dirname, "icon.ico"),
			width: 350,
			height: 450,
			resizable: false,
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

		// システムトレイの設定
		tray = new Tray(path.join(__dirname, "icon.ico"));
		const contextMenu = Menu.buildFromTemplate([
			{
				label: `ビルドバージョン ${version}`,
				enabled: false,
			},
			{ type: "separator" },
			{
				label: "アプリを表示",
				click: () => {
					mainWindow.show();
				},
			},
			{
				label: "終了",
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

			// オートスタートの状態を取得し、レンダラープロセスに送信
			const autoStartSettings = app.getLoginItemSettings();
			mainWindow.webContents.send(
				"autostartStatus",
				autoStartSettings.openAtLogin
			);
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

	// オートスタートのトグル処理
	ipcMain.on("toggleAutostart", (event, isEnabled) => {
		const autostartPath = app.getPath("exe");
		app.setLoginItemSettings({
			openAtLogin: isEnabled,
			path: autostartPath,
		});
	});
}
