const { ipcRenderer } = require("electron");
const { Client } = require("discord-rpc");

let isRpcActive = false;
let userDisconnect = false;
let isAutostartEnabled = false;
let rpcClient = null;
let websocket = null;
let secret = null;
let config = {};

// トークンをローカルストレージに保存する関数
function saveTokenToLocalStorage(token) {
	localStorage.setItem("discordRpcToken", token);
}

// ローカルストレージからトークンを読み込む関数
function loadTokenFromLocalStorage() {
	return localStorage.getItem("discordRpcToken");
}

// ローカルストレージからトークンを削除する関数
function clearTokenFromLocalStorage() {
	localStorage.removeItem("discordRpcToken");
}

/**
 * 提供された設定に基づいてUIをセットアップします
 * @param {Object} config - メインプロセスからの設定オブジェクト
 */
function initializeUI(config) {
	document.title = config.title;

	const header = document.querySelector("header h1");
	header.textContent = config.header;

	const toggleButton = document.getElementById("toggleButton");
	const autoStartButton = document.getElementById("autoStartButton");
	const secretInput = document.getElementById("secretInput");
	const errorText = document.getElementById("errorText");

	// ローカルストレージからトークンを読み込み
	const savedToken = loadTokenFromLocalStorage();
	if (savedToken) {
		secretInput.value = savedToken;
	}

	toggleButton.innerHTML = `<img src="${config.toggle_button_image}" alt="Toggle Button" class="rounded-lg" />`;
	secretInput.placeholder = config.secret_input_placeholder;
	errorText.textContent = config.error_text;

	/**
	 * secret input の変更を監視します
	 */
	secretInput.addEventListener("input", () => {
		const value = secretInput.value;
		console.log(`Input value changed: ${value}`);

		const isValid = /^[a-zA-Z0-9]{16}$/.test(value);

		if (isValid) {
			errorText.style.visibility = "hidden";
			toggleButton.disabled = false;
			// トークンをローカルストレージに保存
			saveTokenToLocalStorage(value);
		} else {
			errorText.style.visibility = "visible";
			toggleButton.disabled = true;
		}
	});

	/**
	 * toggle button のクリックイベントを監視します
	 */
	toggleButton.addEventListener("click", () => {
		errorText.style.visibility = "hidden";
		secret = secretInput.value;
		console.log(`Toggle button clicked. Input value: ${secret}`);

		const isValid = /^[a-zA-Z0-9]{16}$/.test(secret);

		if (!isValid) {
			errorText.style.visibility = "visible";
			return;
		}

		toggleButton.classList.toggle("bg-green");
		isRpcActive = !isRpcActive;
		if (isRpcActive) {
			startDiscordRPC(config, secret);
		} else {
			userDisconnect = true;
			stopDiscordRPC();
			errorText.style.visibility = "hidden";
		}
	});

	autoStartButton.addEventListener("click", () => {
		toggleAutostart();
	});
}

/**
 * Discord RPC クライアントを初期化します
 * @param {Object} config - client_id を含む設定オブジェクト
 * @param {string} sessionId - ユーザー入力からのセッションID
 */
function startDiscordRPC(config, sessionId) {
	const clientId = config.client_id;
	rpcClient = new Client({ transport: "ipc" });
	let userDisconnect = false;

	rpcClient.on("close", () => {
		console.log("Discord RPC connection closed");
		if (!userDisconnect) {
			startWebSocket(config, sessionId);
		}
	});

	rpcClient.on("error", (error) => {
		console.error("Discord RPC error:", error);
		const errorText = document.getElementById("errorText");
		errorText.textContent = config.rpc_error;
		errorText.style.visibility = "visible";
		toggleButton.classList.remove("bg-green");
	});

	rpcClient
		.login({ clientId })
		.then(() => {
			console.log("Discord RPC connected");
			startWebSocket(config, sessionId);
			const errorText = document.getElementById("errorText");
			errorText.style.visibility = "hidden";
			isRpcActive = true;
		})
		.catch((error) => {
			console.error("Error connecting to Discord RPC:", error);
			const errorText = document.getElementById("errorText");
			errorText.textContent = config.rpc_error;
			errorText.style.visibility = "visible";
			toggleButton.classList.remove("bg-green");
		});
}

/**
 * Discord RPC クライアントと WebSocket 接続を停止します
 */
function stopDiscordRPC() {
	if (rpcClient) {
		rpcClient.destroy();
		rpcClient = null;
		console.log("Discord RPC client destroyed");
		isRpcActive = false;
	}
	if (websocket) {
		websocket.close();
		websocket = null;
		console.log("WebSocket connection closed");
	}
}

/**
 * WebSocket 接続を初期化します
 * @param {Object} config - websocket_url を含む設定オブジェクト
 * @param {string} sessionId - ユーザー入力からのセッションID
 */
function startWebSocket(config, sessionId) {
	const { websocket_url } = config;
	const fullWebSocketUrl = `${websocket_url}/${sessionId}`;

	function connectWebSocket() {
		websocket = new WebSocket(fullWebSocketUrl);

		websocket.onopen = () => {
			console.log("WebSocket connected");
			const errorText = document.getElementById("errorText");
			errorText.style.visibility = "hidden";

			rpcClient
				.setActivity({
					state: "Idle",
					startTimestamp: Date.now(),
					largeImageKey: config.large_image_key,
					largeImageText: config.large_image_text,
				})
				.catch((error) => {
					console.error("Failed to set Discord activity:", error);
				});
		};

		websocket.onmessage = (event) => {
			console.log("WebSocket message received:", event.data);

			try {
				const message = JSON.parse(event.data);
				if (message.state === "idle") {
					rpcClient
						.setActivity({
							state: "Idle",
							startTimestamp: Date.now(),
							largeImageKey: config.large_image_key,
							largeImageText: config.large_image_text,
						})
						.catch((error) => {
							console.error("Failed to set Discord activity:", error);
						});
				} else if (message.state === "playing" && message.data) {
					const { title, url, channel } = message.data;
					updateDiscordActivity({ title, url, channel });
				} else {
					console.log("Received message with state:", message.state);
				}
			} catch (error) {
				console.error("Error parsing WebSocket message:", error);
			}
		};

		websocket.onclose = () => {
			console.log("WebSocket connection closed");
			if (!userDisconnect) {
				const errorText = document.getElementById("errorText");
				errorText.textContent = config.socket_closed;
				errorText.style.visibility = "visible";
			}
		};

		websocket.onerror = (error) => {
			console.error("WebSocket error:", error);
			const errorText = document.getElementById("errorText");
			errorText.textContent = config.socket_failure;
			errorText.style.visibility = "visible";

			if (!websocket || websocket.readyState !== WebSocket.OPEN) {
				console.log("WebSocket is not connected. Cannot activate RPC.");
			}
		};
	}

	connectWebSocket();

	setInterval(() => {
		if (
			websocket &&
			websocket.readyState === WebSocket.CLOSED &&
			!userDisconnect
		) {
			const errorText = document.getElementById("errorText");
			errorText.textContent = config.socket_closed;
			errorText.style.visibility = "visible";
			console.log("Attempting to reconnect...");
			connectWebSocket();
		}
	}, 5000);
}

/**
 * RPC クライアントがアクティブな場合、Discord アクティビティを更新します
 * @param {Object} data - title、url、channel を含むデータオブジェクト
 */
function updateDiscordActivity(data) {
	if (rpcClient && isRpcActive) {
		rpcClient
			.setActivity({
				details: data.title,
				state: `By ${data.channel}`,
				startTimestamp: Date.now(),
				largeImageKey: config.large_image_key,
				largeImageText: config.large_image_text,
				buttons: [
					{
						label: config.youtube_label,
						url: data.url,
					},
				],
			})
			.catch((error) => {
				console.error("Failed to set Discord activity:", error);
			});
	}
}

// オートスタートのトグル関数
function toggleAutostart() {
	isAutostartEnabled = !isAutostartEnabled;
	console.log("Toggle autostart:", isAutostartEnabled);
	ipcRenderer.send("toggleAutostart", isAutostartEnabled);

	if (isAutostartEnabled) {
		autoStartButton.classList.add("bg-green");
	} else {
		autoStartButton.classList.remove("bg-green");
	}
}

ipcRenderer.on("autostartStatus", (event, isEnabled) => {
	isAutostartEnabled = isEnabled;
	if (isAutostartEnabled) {
		autoStartButton.classList.add("bg-green");
		const toggleButton = document.getElementById("toggleButton");

		if (toggleButton) {
			const clickEvent = new MouseEvent("click", {
				view: window,
				bubbles: true,
				cancelable: true,
			});

			toggleButton.dispatchEvent(clickEvent);
		} else {
			console.error("toggleButton not found");
		}
	} else {
		autoStartButton.classList.remove("bg-green");
	}
});

// DOM のコンテンツが読み込まれた際のイベントリスナー、設定の読み込みをトリガーします
document.addEventListener("DOMContentLoaded", () => {
	ipcRenderer.on("config", (event, data) => {
		config = data;
		initializeUI(config);
	});
});

// アプリが閉じられる際にローカルストレージからトークンをクリアする
window.addEventListener("beforeunload", () => {
	clearTokenFromLocalStorage();
});
