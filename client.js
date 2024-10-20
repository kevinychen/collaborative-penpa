const puzzleId = window.location.pathname.match(/\/([^/]+)\/penpa-edit/)[1];

let initialized = false;

let canvasContainer;
const connectingOverlay = makeConnectingOverlay();
const cursorLayer = makeCursorLayer();
const mainMenuButton = makeMainMenuButton();
const cursors = {};
let ws;

const localUpdates = []; /* Changes sent to server but not yet ack'ed */

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
    } else if (localUpdates[0].timestamp < Date.now() - 5000) {
        ws.close();
        refreshWebsocket();
    } else {
        ws.send(JSON.stringify({ type: "update", update }));
    }
}

window.addEventListener("load", () => {
    canvasContainer = document.getElementById("dvique");
    canvasContainer.appendChild(cursorLayer);
    document.body.appendChild(mainMenuButton);
    document.body.appendChild(connectingOverlay);
    initializeCursorListener();
    refreshWebsocket();
});

// UI helper functions

function makeConnectingOverlay() {
    const connectingOverlay = document.createElement("div");
    connectingOverlay.id = "connecting-overlay";
    connectingOverlay.innerHTML = `
        <div>
            <p>Connecting to server...</p>
            <div class="lds-default">
                <div></div><div></div><div></div><div></div><div></div><div></div>
                <div></div><div></div><div></div><div></div><div></div><div></div>
            </div>

            <p>If this message doesn't disappear, this puzzle may have been removed from the server.</p>
            <p>Here's a <a id="regular-penpa-url" target="_blank">regular Penpa link</a> for this puzzle.</p>
            <button onclick="window.location.href='/'">Main menu</button>
        </div>`;
    return connectingOverlay;
}

function makeCursor(index) {
    const cursor = document.createElement("div");
    cursor.className = "cursor";
    cursor.style.backgroundColor = COLORS[index];
    return cursor;
}

function makeCursorLayer() {
    const cursorLayer = document.createElement("div");
    cursorLayer.id = "cursor-layer";
    return cursorLayer;
}

function makeMainMenuButton() {
    const mainMenuButton = document.createElement("button");
    mainMenuButton.id = "main-menu-button";
    mainMenuButton.textContent = "Main menu";
    mainMenuButton.onclick = () => (window.location.href = "/");
    return mainMenuButton;
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
}

function refreshWebsocket() {
    clearTimeout(ws?.timeout);
    ws = new WebSocket("ws://" + location.host + "/ws");

    const url = window.pu === undefined ? "" : pu.maketext();
    document.getElementById("regular-penpa-url").href =
        "https://swaroopg92.github.io/penpa-edit/" + url.substring(url.indexOf("#"));
    connectingOverlay.style.display = "flex";

    ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "join", puzzleId })));

    ws.addEventListener("close", () => (ws.timeout = setTimeout(refreshWebsocket, 2000)));

    ws.addEventListener("message", event => {
        const msg = JSON.parse(event.data);

        intercepting = false;
        if (msg.type === "sync") {
            if (!initialized) {
                interceptPenpa(flushUnprocessedChanges);
                initialized = true;
            }

            resetPenpa(msg.url);
            localUpdates.length = 0;
            connectingOverlay.style.display = "none";

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
        } else if (msg.type === "cursor") {
            if (msg.pos === undefined) {
                cursors[msg.index]?.remove();
                delete cursors[msg.index];
            } else {
                if (!cursors[msg.index]) {
                    const cursor = makeCursor(msg.index);
                    cursorLayer.appendChild(cursor);
                    cursors[msg.index] = cursor;
                }
                const cursor = cursors[msg.index];
                cursor.style.transform = `translate(${msg.pos.x}px, ${msg.pos.y}px)`;
            }
        } else {
            assert(false, "Unexpected message type");
        }
        intercepting = true;
    });
}
