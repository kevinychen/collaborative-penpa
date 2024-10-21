const puzzleId = window.location.pathname.match(/\/([^/]+)\/penpa-edit/)[1];

let initialized = false;

let cursorLayer;
let canvasContainer;
let overlayContainer;
let connectingOverlay;
let historyOverlay;
let openHistoryButton;
let restoreButton;

let showingConnectingOverlay = false;
let showingHistoryOverlay = false;

let ws;
const cursors = {};

const localUpdates = []; /* Changes sent to server but not yet ack'ed */
let savedUrl = undefined; /* The latest puzzle, if currently in the history view */

// Called after each Penpa update: sends the intercepted udpdate to the server.
function flushUnprocessedChanges(action) {
    const update = {
        action,
        changeId: randomId(),
        timestamp: Date.now(),
    };

    localUpdates.push(update);

    if (ws.readyState > WebSocket.OPEN) {
        refreshWebsocket();
    } else if (localUpdates[0].timestamp < Date.now() - 5 * SECOND) {
        ws.close();
        refreshWebsocket();
    } else {
        ws.send(JSON.stringify({ type: "update", update }));
    }
}

window.addEventListener("load", () => {
    cursorLayer = document.createElement("div");
    cursorLayer.id = "cursor-layer";

    canvasContainer = document.getElementById("dvique");
    canvasContainer.appendChild(cursorLayer);

    const overlayLayer = document.createElement("div");
    overlayLayer.id = "overlay-layer";
    overlayLayer.innerHTML = `
    <div id="overlay-container">
        <div id="connecting-overlay">
            <p>Connecting to server...</p>
            <div class="lds-default">
                <div></div><div></div><div></div><div></div><div></div><div></div>
                <div></div><div></div><div></div><div></div><div></div><div></div>
            </div>

            <p>If this message doesn't disappear, this puzzle may have been removed from the server.</p>
            <button id="regular-penpa-button">Regular Penpa link</button>
        </div>
        <div id="history-overlay">
            <button id="restore-button">Restore version</button>
            <div id="history-list"></div>
        </div>
    </div>
    <div id="menu-buttons">
        <button id="main-menu-button">Back to all puzzles</button>
        <button id="open-history-button"></button>
    </div>
    `;
    document.body.appendChild(overlayLayer);

    overlayContainer = document.getElementById("overlay-container");
    connectingOverlay = document.getElementById("connecting-overlay");
    historyOverlay = document.getElementById("history-overlay");
    openHistoryButton = document.getElementById("open-history-button");
    restoreButton = document.getElementById("restore-button");

    const regularPenpaButton = document.getElementById("regular-penpa-button");
    regularPenpaButton.onclick = () => {
        const url = pu.maketext();
        const penpaUrl = "https://swaroopg92.github.io/penpa-edit/" + url.substring(url.indexOf("#"));
        window.open(penpaUrl, "_blank").focus();
    };

    const mainMenuButton = document.getElementById("main-menu-button");
    mainMenuButton.onclick = () => (window.location.href = "/");

    updateOverlays();
    initializeCursorListener();
    initializeHistoryListener();
    refreshWebsocket();
});

function updateOverlays() {
    if (showingConnectingOverlay || showingHistoryOverlay) {
        overlayContainer.style.display = "flex";
        cursorLayer.style.display = "none";
    } else {
        overlayContainer.style.display = "none";
        cursorLayer.style.display = "block";
    }

    if (showingConnectingOverlay) {
        connectingOverlay.style.display = "block";
        restoreButton.disabled = true;
    } else {
        connectingOverlay.style.display = "none";
        restoreButton.disabled = false;
    }

    if (showingHistoryOverlay) {
        historyOverlay.style.display = "flex";
        openHistoryButton.textContent = "Back to edit mode";
    } else {
        historyOverlay.style.display = "none";
        openHistoryButton.textContent = "History";
    }
}

function initializeCursorListener() {
    let lastPos = undefined;

    canvasContainer.addEventListener("mousemove", e => {
        if (lastPos === undefined) {
            setTimeout(() => {
                if (ws.readyState == WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "cursor", pos: lastPos }));
                }
                lastPos = undefined;
            }, 100);
        }
        lastPos = { x: e.pageX - canvasContainer.offsetLeft, y: e.pageY - canvasContainer.offsetTop };
    });

    function hideIdleCursors() {
        const now = Date.now();
        for (const cursor of Object.values(cursors)) {
            if (cursor.timestamp < now - 5 * SECOND) {
                cursor.node.style.display = "none";
            }
        }
    }
    setInterval(hideIdleCursors, 5 * SECOND);
}

function initializeHistoryListener() {
    const historyList = document.getElementById("history-list");

    restoreButton.onclick = () => {
        showingHistoryOverlay = false;
        updateOverlays();

        // Simulate an action going from the current url to the restore url
        const restoreUrl = pu.maketext();
        intercepting = false;
        import_url(savedUrl);
        intercepting = true;
        savedUrl = undefined;
        import_url(restoreUrl);
    };

    openHistoryButton.onclick = () => {
        showingHistoryOverlay = !showingHistoryOverlay;
        if (showingHistoryOverlay) {
            savedUrl = pu.maketext();
            restoreButton.style.display = "none";
            historyList.innerHTML = "";
            for (const item of history[puzzleId].toReversed()) {
                const itemButton = document.createElement("button");
                itemButton.textContent = new Date(item.timestamp).toLocaleString();
                itemButton.onclick = () => {
                    restoreButton.style.display = "block";
                    intercepting = false;
                    import_url(item.url);
                    intercepting = true;
                };
                historyList.appendChild(itemButton);
            }
        } else {
            intercepting = false;
            import_url(savedUrl);
            intercepting = true;
            savedUrl = undefined;
        }
        updateOverlays();
    };
}

function processWebsocketMessage(msg) {
    if (msg.type === "sync") {
        if (!initialized) {
            interceptPenpa(flushUnprocessedChanges);
            initialized = true;
        }

        resetPenpa(msg.url);
        localUpdates.length = 0;
        showingConnectingOverlay = false;
        updateOverlays();

        addToLocalStorage(puzzleId);
    } else if (msg.type === "update") {
        // First, undo local changes
        for (const update of localUpdates.toReversed()) {
            applyAction(invertAction(update.action));
        }

        // Apply the server update
        applyAction(msg.update.action);

        // Reapply local changes, unless it's the same as the server update
        const localIndex = localUpdates.findIndex(update => update.changeId === msg.update.changeId);
        assert(localIndex <= 0, "Server missed local changes");
        if (localIndex === 0) {
            localUpdates.shift();
        }
        for (const update of localUpdates) {
            applyAction(update.action);
        }

        pu.redraw();

        saveHistory(puzzleId);
    } else if (msg.type === "cursor") {
        if (msg.pos === undefined) {
            if (cursors[msg.index] !== undefined) {
                cursors[msg.index].style.display = "none";
            }
        } else {
            if (!cursors[msg.index]) {
                const cursor = makeCursor(msg.index);
                cursorLayer.appendChild(cursor);
                cursors[msg.index] = { node: cursor };
            }
            const cursor = cursors[msg.index];
            cursor.timestamp = Date.now();
            cursor.node.style.display = "block";
            cursor.node.style.transform = `translate(${msg.pos.x}px, ${msg.pos.y}px)`;
        }
    } else {
        assert(false, "Unexpected message type");
    }
}

function refreshWebsocket() {
    clearTimeout(ws?.timeout);
    ws = new WebSocket("ws://" + location.host + "/ws");

    showingConnectingOverlay = true;
    updateOverlays();

    ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "join", puzzleId })));

    ws.addEventListener("close", () => (ws.timeout = setTimeout(refreshWebsocket, 2 * SECOND)));

    ws.addEventListener("message", event => {
        const msg = JSON.parse(event.data);

        intercepting = false;
        if (savedUrl === undefined) {
            processWebsocketMessage(msg);
        } else {
            const url = pu.maketext();
            import_url(savedUrl);
            processWebsocketMessage(msg);
            savedUrl = pu.maketext();
            import_url(url);
        }
        intercepting = true;
    });
}
