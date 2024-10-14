const connectingOverlay = document.createElement("div");
const puzzleId = window.location.pathname.match(/\/([^/]+)\/penpa-edit/)[1];
const ws = new WebSocket("ws://" + location.host + "/ws");

const unprocessedChanges = [];
const localUpdates = [];
const undoList = [];
const redoList = [];
let reconnecting = false;
let processing = false;
let prevUrl = undefined;

function send(msg) {
    if (!reconnecting && localUpdates.length > 0 && Date.now() - localUpdates[0].timestamp > 5000) {
        reconnect();
    }
    ws.send(JSON.stringify(msg));
}

// Intercept the calls that update the Penpa variables, such that they also send the updates to the server.
function proxy_makeclass() {
    if (window.old_make_class !== undefined) {
        return;
    }

    window.old_make_class = make_class;
    make_class = function () {
        const newPu = window.old_make_class(...arguments);
        if (!processing) {
            unprocessedChanges.push("overwrite");
        }
        return proxy_pu(newPu);
    };
}

function proxy_pu(pu) {
    const commandMethods = ["record"];
    for (const method of commandMethods) {
        pu["old_" + method] = pu[method];
        pu[method] = function () {
            pu["old_" + method](...arguments);
            if (!processing) {
                unprocessedChanges.push("command");
            }
        };
    }
    const overwriteMethods = ["reset", "reset_board", "reset_arr", "point_usecheck"];
    for (const method of overwriteMethods) {
        pu["old_" + method] = pu[method];
        pu[method] = function () {
            pu["old_" + method](...arguments);
            if (!processing) {
                unprocessedChanges.push("overwrite");
            }
        };
    }

    pu.old_redraw = pu.redraw;
    pu.redraw = function (...args) {
        pu.old_redraw(...args);
        if (processing) {
            return;
        }
        if (unprocessedChanges.length === 0) {
            return;
        }

        processing = true;
        let update;
        if (unprocessedChanges[0] === "command") {
            if (unprocessedChanges.some(change => change !== "command")) {
                throw new Error("Internal error: unsupported change types");
            }
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
        } else if (unprocessedChanges[0] === "overwrite") {
            if (unprocessedChanges.some(change => change !== "overwrite")) {
                throw new Error("Internal error: unsupported change types");
            }
            update = {
                type: "overwrite",
                changeId: randomId(),
                timestamp: Date.now(),
                url: pu.maketext(),
                prevUrl,
            };
        }
        processing = false;

        send({
            type: "update",
            puzzleId,
            update,
        });
        localUpdates.push(update);
        undoList.push(update);
        redoList.length = 0;
        unprocessedChanges.length = 0;
        prevUrl = pu.maketext();
    };

    pu.old_undo = pu.undo;
    pu.undo = function () {
        if (processing) {
            pu.old_undo();
            return;
        }
        const prevUpdate = undoList.pop();
        if (prevUpdate === undefined) {
            return;
        }

        processing = true;
        const update = invertUpdate(prevUpdate);
        processing = false;

        send({
            type: "update",
            puzzleId,
            update,
        });
        localUpdates.push(update);
        redoList.push(update);
    };

    pu.old_redo = pu.redo;
    pu.redo = function () {
        if (processing) {
            pu.old_redo();
            return;
        }
        const prevUpdate = redoList.pop();
        if (prevUpdate === undefined) {
            return;
        }

        processing = true;
        const update = invertUpdate(prevUpdate);
        processing = false;

        send({
            type: "update",
            puzzleId,
            update,
        });
        localUpdates.push(update);
        undoList.push(update);
    };

    pu.set_redoundocolor = function () {
        document.getElementById("tb_redo").disabled = redoList.length === 0 ? "disabled" : "";
        document.getElementById("tb_undo").disabled = undoList.length === 0 ? "disabled" : "";
    };

    return pu;
}

// Handle updates sent from the server
ws.addEventListener("message", event => {
    const msg = JSON.parse(event.data);
    if (msg.puzzleId !== puzzleId) {
        return;
    }

    processing = true;
    if (msg.type === "sync") {
        proxy_makeclass();
        import_url(msg.url);
        reconnecting = false;
        connectingOverlay.remove();

        const puzzleIds = JSON.parse(window.localStorage.getItem("puzzles")) || [];
        if (!puzzleIds.includes(puzzleId)) {
            window.localStorage.setItem("puzzles", JSON.stringify([...puzzleIds, puzzleId]));
        }
    } else if (msg.type === "update") {
        if (unprocessedChanges.length > 0) {
            throw new Error("Internal error: unprocessed changes");
        }

        // First, undo local changes
        for (const update of localUpdates.toReversed()) {
            applyUpdate(invertUpdate(update));
        }

        // Apply the server update
        applyUpdate(msg.update);

        // Reapply local changes, unless it's the same as the server update
        const localIndex = localUpdates.findIndex(update => update.changeId === msg.update.changeId);
        if (localIndex > 0) {
            throw new Error("Unexpected server acknowledgement order");
        } else if (localIndex === 0) {
            localUpdates.shift();
        }
        for (const update of localUpdates) {
            applyUpdate(update);
        }

        pu.redraw();
    } else {
        throw new Error("Unknown message from server:", msg);
    }
    processing = false;
});

// And an overlay that disappears when connected successfully to the server
function reconnect() {
    reconnecting = true;
    connectingOverlay.id = "connecting-overlay";
    connectingOverlay.innerHTML = `
        <div>
            <p>Connecting to server...</p>
            <div class="lds-default">
                <div></div><div></div><div></div><div></div><div></div><div></div>
                <div></div><div></div><div></div><div></div><div></div><div></div>
            </div>
            <p>If this message doesn't disappear, this puzzle may have been removed from the server.</p>
            <button onclick="window.location.href='/'">Main menu</button>
        </div>
    `;
    document.body.appendChild(connectingOverlay);

    send({
        type: "join",
        puzzleId,
    });
}

window.addEventListener("load", () => {
    const mainMenuButton = document.createElement("button");
    mainMenuButton.id = "main-menu-button";
    mainMenuButton.textContent = "Main menu";
    mainMenuButton.onclick = () => (window.location.href = "/");
    document.body.appendChild(mainMenuButton);

    reconnect();
});
