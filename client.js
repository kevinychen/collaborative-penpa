const puzzleId = window.location.pathname.match(/\/([^/]+)\/penpa-edit/)[1];
const connectingOverlay = document.createElement("div");
let ws;

const unprocessedChanges = []; /* Changes applied in Penpa but not yet sent to server */
const localUpdates = []; /* Changes sent to server but not yet ack'ed */

// Local puzzle state
const undoList = [];
const redoList = [];
let prevUrl;

let applyingInternalChanges = false;

// Called after each Penpa update: sends the intercepted udpdate to the server.
function flushUnprocessedChanges() {
    if (unprocessedChanges.length === 0) {
        return;
    }

    let update = undefined;
    applyingInternalChanges = true;
    if (unprocessedChanges[0] === "command") {
        assert(unprocessedChanges.every(change => change === "command"));

        const mode = pu.mode.qa;
        const commands = [];
        for (const _ of unprocessedChanges) {
            commands.push({});
        }

        for (const command of commands.toReversed()) {
            command.undo = pu[mode].command_undo.pop();
            command.undo_col = pu[mode + "_col"].command_undo.pop();
        }
        for (const command of commands) {
            pu[mode].command_undo.push(command.undo);
            pu[mode + "_col"].command_undo.push(command.undo_col);
        }
        pu.undo();
        for (const command of commands) {
            command.redo = pu[mode].command_redo.pop();
            command.redo_col = pu[mode + "_col"].command_redo.pop();
        }
        for (const command of commands.toReversed()) {
            pu[mode].command_redo.push(command.redo);
            pu[mode + "_col"].command_redo.push(command.redo_col);
        }
        pu.redo();

        update = {
            type: "command",
            changeId: randomId(),
            timestamp: Date.now(),
            mode,
            commands,
        };
        undoList.push(update);
        redoList.length = 0;
    } else if (unprocessedChanges[0] === "overwrite") {
        assert(unprocessedChanges.every(change => change === "overwrite"));

        update = {
            type: "overwrite",
            changeId: randomId(),
            timestamp: Date.now(),
            url: pu.maketext(),
            prevUrl,
        };
        undoList.push(update);
        redoList.length = 0;
    } else if (unprocessedChanges[0] === "undo") {
        assert(unprocessedChanges.length === 1);

        const prevUpdate = undoList.pop();
        if (prevUpdate !== undefined) {
            update = invertUpdate(prevUpdate);
            redoList.push(update);
        }
    } else if (unprocessedChanges[0] === "redo") {
        assert(unprocessedChanges.length === 1);

        const prevUpdate = redoList.pop();
        if (prevUpdate !== undefined) {
            update = invertUpdate(prevUpdate);
            undoList.push(update);
        }
    }
    applyingInternalChanges = false;

    unprocessedChanges.length = 0;
    if (update === undefined) {
        return;
    }

    localUpdates.push(update);
    prevUrl = pu.maketext();

    if (ws.readyState > WebSocket.OPEN) {
        refreshWebsocket();
    } else if (localUpdates[0].timestamp < Date.now() - 5000) {
        ws.close();
        refreshWebsocket();
    } else {
        ws.send(JSON.stringify({ type: "update", puzzleId, update }));
    }
}

// Intercept the calls that update the Penpa variables, such that they also send the updates to the server.
function intercept_penpa() {
    if (window.old_make_class !== undefined) {
        return;
    }

    window.old_make_class = make_class;
    make_class = function () {
        if (!applyingInternalChanges) {
            unprocessedChanges.push("overwrite");
        }
        const newPu = window.old_make_class(...arguments);
        return intercept_pu(newPu);
    };
}

function intercept_pu(pu) {
    const commandMethods = ["record"];
    for (const method of commandMethods) {
        const oldMethod = pu[method];
        pu[method] = function () {
            if (!applyingInternalChanges) {
                unprocessedChanges.push("command");
            }
            oldMethod.call(pu, ...arguments);
        };
    }

    const overwriteMethods = ["reset", "reset_board", "reset_selectedmode", "point_usecheck"];
    for (const method of overwriteMethods) {
        const oldMethod = pu[method];
        pu[method] = function () {
            if (!applyingInternalChanges) {
                unprocessedChanges.push("overwrite");
            }
            oldMethod.call(pu, ...arguments);
        };
    }

    const oldRedraw = pu.redraw;
    pu.redraw = function () {
        oldRedraw.call(pu, ...arguments);
        if (!applyingInternalChanges) {
            flushUnprocessedChanges();
        }
    };

    const oldUndo = pu.undo;
    pu.undo = function () {
        if (applyingInternalChanges) {
            oldUndo.call(pu, ...arguments);
        } else {
            unprocessedChanges.push("undo");
            flushUnprocessedChanges();
        }
    };

    const oldRedo = pu.redo;
    pu.redo = function () {
        if (applyingInternalChanges) {
            oldRedo.call(pu, ...arguments);
        } else {
            unprocessedChanges.push("redo");
            flushUnprocessedChanges();
        }
    };

    pu.set_redoundocolor = function () {
        document.getElementById("tb_redo").disabled = redoList.length === 0 ? "disabled" : "";
        document.getElementById("tb_undo").disabled = undoList.length === 0 ? "disabled" : "";
    };

    return pu;
}

function refreshWebsocket() {
    clearTimeout(ws?.timeout);
    ws = new WebSocket("ws://" + location.host + "/ws");

    const url = window.pu === undefined ? "" : pu.maketext();
    const regularPenpaUrl = "https://swaroopg92.github.io/penpa-edit/" + url.substring(url.indexOf("#"));

    connectingOverlay.id = "connecting-overlay";
    connectingOverlay.innerHTML = `
        <div>
            <p>Connecting to server...</p>
            <div class="lds-default">
                <div></div><div></div><div></div><div></div><div></div><div></div>
                <div></div><div></div><div></div><div></div><div></div><div></div>
            </div>

            <p>If this message doesn't disappear, this puzzle may have been removed from the server.</p>
            <p>Here's a <a href=${regularPenpaUrl}>regular Penpa link</a> for this puzzle.</p>
            <button onclick="window.location.href='/'">Main menu</button>
        </div>`;
    document.body.appendChild(connectingOverlay);

    ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "join", puzzleId })));

    ws.addEventListener("close", () => (ws.timeout = setTimeout(refreshWebsocket, 2000)));

    ws.addEventListener("message", event => {
        const msg = JSON.parse(event.data);
        assert(msg.puzzleId === puzzleId, "Server sent wrong puzzle update");

        applyingInternalChanges = true;
        if (msg.type === "sync") {
            intercept_penpa();
            import_url(msg.url);

            connectingOverlay.remove();
            localUpdates.length = 0;

            undoList.length = 0;
            redoList.length = 0;
            prevUrl = msg.url;

            addToLocalStorage(puzzleId);
        } else if (msg.type === "update") {
            assert(unprocessedChanges.length === 0);

            // First, undo local changes
            for (const update of localUpdates.toReversed()) {
                applyUpdate(invertUpdate(update));
            }

            // Apply the server update
            applyUpdate(msg.update);

            // Reapply local changes, unless it's the same as the server update
            const localIndex = localUpdates.findIndex(update => update.changeId === msg.update.changeId);
            assert(localIndex <= 0, "Server missed local changes");
            if (localIndex === 0) {
                localUpdates.shift();
            }
            for (const update of localUpdates) {
                applyUpdate(update);
            }

            pu.redraw();
        } else {
            assert(false, "Unexpected message type");
        }
        applyingInternalChanges = false;
    });
}

window.addEventListener("load", () => {
    addMainMenuButton();
    refreshWebsocket();
});

function addMainMenuButton() {
    const mainMenuButton = document.createElement("button");
    mainMenuButton.id = "main-menu-button";
    mainMenuButton.textContent = "Main menu";
    mainMenuButton.onclick = () => (window.location.href = "/");
    document.body.appendChild(mainMenuButton);
}

function addToLocalStorage(puzzleId) {
    const puzzleIds = JSON.parse(window.localStorage.getItem("puzzles")) || [];
    if (!puzzleIds.includes(puzzleId)) {
        window.localStorage.setItem("puzzles", JSON.stringify([...puzzleIds, puzzleId]));
    }
}

function assert(value, message = "Internal error") {
    if (!value) {
        throw new Error(message);
    }
}
