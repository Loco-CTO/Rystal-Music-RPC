const { ipcRenderer } = require("electron");
const { Client } = require("discord-rpc");

let isRpcActive = false;
let rpcClient = null;
let websocket = null;
let config = {};

/**
 * Sets up UI based on provided configuration.
 * @param {Object} config - Configuration object from main process.
 */
function initializeUI(config) {
	document.title = config.title;

	const header = document.querySelector("header h1");
	header.textContent = config.header;

	const toggleButton = document.getElementById("toggleButton");
	const secretInput = document.getElementById("secretInput");
	const errorText = document.getElementById("errorText");

	toggleButton.innerHTML = `<img src="${config.toggle_button_image}" alt="Toggle Button" class="rounded-lg" />`;
	secretInput.placeholder = config.secret_input_placeholder;
	errorText.textContent = config.error_text;

	/**
	 * Listens for changes in secret input.
	 */
	secretInput.addEventListener("input", () => {
		const value = secretInput.value;
		console.log(`Input value changed: ${value}`);

		const isValid = /^[a-zA-Z0-9]{16}$/.test(value);

		if (isValid) {
			errorText.style.visibility = "hidden";
			toggleButton.disabled = false;
		} else {
			errorText.style.visibility = "visible";
			toggleButton.disabled = true;
		}
	});

	/**
	 * Listens for toggle button click event.
	 */
	toggleButton.addEventListener("click", () => {
		const value = secretInput.value;
		console.log(`Toggle button clicked. Input value: ${value}`);

		const isValid = /^[a-zA-Z0-9]{16}$/.test(value);

		if (!isValid) {
			errorText.style.visibility = "visible";
			return;
		}

		toggleButton.classList.toggle("bg-green");
		isRpcActive = !isRpcActive;
		if (isRpcActive) {
			startDiscordRPC(config, value);
		} else {
			stopDiscordRPC();
		}
	});
}

/**
 * Initializes Discord RPC client.
 * @param {Object} config - Configuration object with client_id.
 * @param {string} sessionId - Session ID from user input.
 */
function startDiscordRPC(config, sessionId) {
	const clientId = config.client_id;
	rpcClient = new Client({ transport: "ipc" });

	rpcClient.on("close", () => {
		console.log("Discord RPC connection closed");
		// Implement retry logic here
	});

	rpcClient.on("error", (error) => {
		console.error("Discord RPC error:", error);
		const errorText = document.getElementById("errorText");
		errorText.textContent = config.rpc_error;
		errorText.style.visibility = "visible";
	});

	rpcClient
		.login({ clientId })
		.then(() => {
			console.log("Discord RPC connected");
			startWebSocket(config, sessionId); // Pass session ID to startWebSocket
			const errorText = document.getElementById("errorText");
			errorText.style.visibility = "hidden";
		})
		.catch((error) => {
			console.error("Error connecting to Discord RPC:", error);
			const errorText = document.getElementById("errorText");
			errorText.textContent = config.rpc_error;
			errorText.style.visibility = "visible";
		});
}

/**
 * Stops Discord RPC client and WebSocket connection.
 */
function stopDiscordRPC() {
	if (rpcClient) {
		rpcClient.destroy();
		rpcClient = null;
		console.log("Discord RPC client destroyed");
	}

	if (websocket) {
		websocket.close();
		websocket = null;
		console.log("WebSocket connection closed");
	}
}

/**
 * Initializes WebSocket connection.
 * @param {Object} config - Configuration object with websocket_url.
 * @param {string} sessionId - Session ID from user input.
 */
function startWebSocket(config, sessionId) {
	const { websocket_url } = config;
	const fullWebSocketUrl = `${websocket_url}/${sessionId}`;

	websocket = new WebSocket(fullWebSocketUrl);

	websocket.onopen = () => {
		console.log("WebSocket connected");

		const errorText = document.getElementById("errorText");
		errorText.style.visibility = "hidden";

		// Set initial activity
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

			// Handle 'idle' state
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
	};

	websocket.onerror = (error) => {
		console.error("WebSocket error:", error);
		const errorText = document.getElementById("errorText");
		errorText.textContent = config.socket_failure;
		errorText.style.visibility = "visible";
	};
}

/**
 * Updates Discord activity if RPC client is active.
 * @param {Object} data - Data object with title, url, and channel.
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

// Event listener for DOM content loaded, triggers configuration loading.
document.addEventListener("DOMContentLoaded", () => {
	ipcRenderer.on("config", (event, data) => {
		config = data;
		initializeUI(config);
	});
});
