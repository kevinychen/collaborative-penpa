const randomId = () => (1 + Math.random()).toString(36).substring(2);

const mainMenuButton = document.createElement("button");
const connectingOverlay = document.createElement("div");
const puzzleId = window.location.pathname.match(/\/([^/]+)\/penpa-edit/)[1];
const ws = new WebSocket("ws://" + location.host + "/ws");

const unprocessedChanges = [];
const localUpdates = [];
const myUpdatesUndoList = [];
const myUpdatesRedoList = [];
let processing = false;
let prevUrl = undefined;

// Intercept the calls that update the Penpa variables, such that they also send the updates to the server.
function proxy_makeclass() {
    if (window.old_make_class !== undefined) {
        return;
    }

    window.old_make_class = make_class;
    make_class = function () {
        const newPu = window.old_make_class(...arguments);
        if (!processing) {
            unprocessedChanges.push({ type: "reset", prevUrl });
        }
        return proxy_pu(newPu);
    };
}

function proxy_pu(pu) {
    const resetMethods = ["reset", "reset_board", "reset_arr", "point_usecheck"];
    for (const method of resetMethods) {
        pu["old_" + method] = pu[method];
        pu[method] = function () {
            pu["old_" + method](...arguments);
            if (!processing) {
                unprocessedChanges.push({ type: "reset", prevUrl });
            }
        };
    }

    pu.old_record = pu.record;
    pu.record = function () {
        pu.old_record(...arguments);
        if (!processing) {
            unprocessedChanges.push({ type: "diff" });
        }
    };

    pu.old_redraw = pu.redraw;
    pu.redraw = function (...args) {
        pu.old_redraw(...args);
        if (processing) {
            return;
        }
        if (unprocessedChanges.length === 0) {
            return;
        }

        const changeType = unprocessedChanges[0].type;
        const update = {
            changeId: randomId(),
            type: changeType,
        };

        processing = true;
        if (changeType === "diff") {
            if (unprocessedChanges.some(change => change.type !== "diff")) {
                throw new Error("Internal error: unsupported change types");
            }
            const mode = pu.mode.qa;
            for (const change of unprocessedChanges.toReversed()) {
                change.undo = pu[mode].command_undo.pop();
                change.undo_col = pu[mode + "_col"].command_undo.pop();
            }
            for (const change of unprocessedChanges) {
                pu[mode].command_undo.push(change.undo);
                pu[mode + "_col"].command_undo.push(change.undo_col);
            }
            pu.undo();
            for (const change of unprocessedChanges) {
                change.redo = pu[mode].command_redo.pop();
                change.redo_col = pu[mode + "_col"].command_redo.pop();
            }
            for (const change of unprocessedChanges.toReversed()) {
                pu[mode].command_redo.push(change.redo);
                pu[mode + "_col"].command_redo.push(change.redo_col);
            }
            pu.redo();
            update.mode = mode;
            update.changes = [...unprocessedChanges];
        } else if (changeType === "reset") {
            if (unprocessedChanges.some(change => change.type !== "reset")) {
                throw new Error("Internal error: unsupported change types");
            }
            update.prevUrl = unprocessedChanges[0].prevUrl;
            update.url = pu.maketext();
        }
        processing = false;

        ws.send(
            JSON.stringify({
                operation: "update",
                puzzleId,
                ...update,
            })
        );
        localUpdates.push(update);
        myUpdatesUndoList.push(update);
        myUpdatesRedoList.length = 0;
        unprocessedChanges.length = 0;
        prevUrl = pu.maketext();
    };

    pu.old_undo = pu.undo;
    pu.undo = function () {
        if (processing) {
            pu.old_undo();
            return;
        }
        const prevUpdate = myUpdatesUndoList.pop();
        if (prevUpdate === undefined) {
            return;
        }

        const prevChangeType = prevUpdate.type;
        const update = {
            changeId: randomId(),
        };

        processing = true;
        if (prevChangeType === "diff") {
            for (const change of prevUpdate.changes) {
                pu[prevUpdate.mode].command_undo.push(change.undo);
                pu[prevUpdate.mode + "_col"].command_undo.push(change.undo_col);
            }
            const currentMode = pu.mode.qa;
            pu.mode.qa = prevUpdate.mode;
            pu.undo();
            pu.mode.qa = currentMode;
            for (const _ of prevUpdate.changes) {
                pu[prevUpdate.mode].command_redo.pop();
                pu[prevUpdate.mode + "_col"].command_redo.pop();
            }
            update.type = "undo";
            update.mode = prevUpdate.mode;
            update.changes = prevUpdate.changes;
        } else if (prevChangeType === "reset") {
            import_url(prevUpdate.prevUrl);
            update.type = "reset";
            update.prevUrl = prevUpdate.url;
            update.url = prevUpdate.prevUrl;
        }
        processing = false;

        ws.send(
            JSON.stringify({
                operation: "update",
                puzzleId,
                ...update,
            })
        );
        localUpdates.push(update);
        myUpdatesRedoList.push(prevUpdate);
    };

    pu.old_redo = pu.redo;
    pu.redo = function () {
        if (processing) {
            pu.old_redo();
            return;
        }
        const nextUpdate = myUpdatesRedoList.pop();
        if (nextUpdate === undefined) {
            return;
        }

        const nextChangeType = nextUpdate.type;
        const update = {
            changeId: randomId(),
        };

        processing = true;
        if (nextChangeType === "diff") {
            for (const change of nextUpdate.changes.toReversed()) {
                pu[nextUpdate.mode].command_redo.push(change.redo);
                pu[nextUpdate.mode + "_col"].command_redo.push(change.redo_col);
            }
            const currentMode = pu.mode.qa;
            pu.mode.qa = nextUpdate.mode;
            pu.redo();
            pu.mode.qa = currentMode;
            update.type = "diff";
            update.mode = nextUpdate.mode;
            update.changes = nextUpdate.changes;
        } else if (nextChangeType === "reset") {
            import_url(nextUpdate.nextUrl);
            update.type = "reset";
            update.prevUrl = nextUpdate.prevUrl;
            update.url = nextUpdate.url;
        }
        processing = false;

        ws.send(
            JSON.stringify({
                operation: "update",
                puzzleId,
                ...update,
            })
        );
        localUpdates.push(update);
        myUpdatesUndoList.push(nextUpdate);
    };

    return pu;
}

// Handle updates sent from the server
ws.addEventListener("message", event => {
    const msg = JSON.parse(event.data);
    if (msg.puzzleId !== puzzleId) {
        return;
    }

    // console.log(msg);
    processing = true;
    if (msg.operation === "sync") {
        proxy_makeclass();
        import_url(msg.url);
        connectingOverlay.remove();

        const puzzleIds = JSON.parse(window.localStorage.getItem("puzzles")) || [];
        if (!puzzleIds.includes(puzzleId)) {
            window.localStorage.setItem("puzzles", JSON.stringify([...puzzleIds, puzzleId]));
        }
    } else if (msg.operation === "update") {
        if (unprocessedChanges.length > 0) {
            throw new Error("Internal error: unprocessed changes");
        }

        // First, undo local changes
        for (const update of localUpdates.toReversed()) {
            if (update.type === "diff") {
                pu.undo();
            } else if (update.type === "reset") {
                import_url(update.prevUrl);
            } else if (update.type === "undo") {
                for (const change of msg.changes.toReversed()) {
                    pu[msg.mode].command_redo.push(change.redo);
                    pu[msg.mode + "_col"].command_redo.push(change.redo_col);
                }
                const currentMode = pu.mode.qa;
                pu.mode.qa = msg.mode;
                pu.redo();
                pu.mode.qa = currentMode;
                for (const _ of msg.changes) {
                    pu[msg.mode].command_undo.pop();
                    pu[msg.mode + "_col"].command_undo.pop();
                }
            }
        }

        // Apply the server update
        if (msg.type == "diff") {
            for (const change of msg.changes.toReversed()) {
                pu[msg.mode].command_redo.push(change.redo);
                pu[msg.mode + "_col"].command_redo.push(change.redo_col);
            }
            const currentMode = pu.mode.qa;
            pu.mode.qa = msg.mode;
            pu.redo();
            pu.mode.qa = currentMode;
            for (const _ of msg.changes) {
                pu[msg.mode].command_undo.pop();
                pu[msg.mode + "_col"].command_undo.pop();
            }
        } else if (msg.type === "reset") {
            import_url(msg.url);
        } else if (msg.type === "undo") {
            for (const change of msg.changes) {
                pu[msg.mode].command_undo.push(change.undo);
                pu[msg.mode + "_col"].command_undo.push(change.undo_col);
            }
            const currentMode = pu.mode.qa;
            pu.mode.qa = msg.mode;
            pu.undo();
            pu.mode.qa = currentMode;
            for (const _ of msg.changes) {
                pu[msg.mode].command_redo.pop();
                pu[msg.mode + "_col"].command_redo.pop();
            }
        }

        // Reapply local changes
        const localIndex = localUpdates.findIndex(update => update.changeId === msg.changeId);
        if (localIndex > 0) {
            throw new Error("Unexpected server acknowledgement order");
        } else if (localIndex === 0) {
            const update = localUpdates.shift();
            if (update.type === "diff") {
                for (const _ of update.changes) {
                    pu[update.mode].command_redo.pop();
                    pu[update.mode + "_col"].command_redo.pop();
                }
            }
        }
        for (const update of localUpdates) {
            if (update.type === "diff") {
                pu.redo();
            } else if (update.type === "reset") {
                import_url(update.url);
            } else if (update.type === "undo") {
                for (const change of update.changes) {
                    pu[update.mode].command_undo.push(change.undo);
                    pu[update.mode + "_col"].command_undo.push(change.undo_col);
                }
                const currentMode = pu.mode.qa;
                pu.mode.qa = update.mode;
                pu.undo();
                pu.mode.qa = currentMode;
                for (const _ of msg.changes) {
                    pu[update.mode].command_redo.pop();
                    pu[update.mode + "_col"].command_redo.pop();
                }
            }
        }

        pu.redraw();
    } else {
        throw new Error("Unknown message from server:", msg);
    }
    processing = false;
});

// On page load, add some buttons and an overlay that disappears when connected successfully to the server
window.addEventListener("load", () => {
    mainMenuButton.id = "main-menu-button";
    mainMenuButton.textContent = "Main menu";
    mainMenuButton.onclick = () => (window.location.href = "/");
    document.body.appendChild(mainMenuButton);

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

    ws.send(
        JSON.stringify({
            operation: "join",
            puzzleId,
        })
    );
});
