const randomId = () => (1 + Math.random()).toString(36).substring(2);

const mainMenuButton = document.createElement("button");
const connectingOverlay = document.createElement("div");
const puzzleId = window.location.pathname.match(/\/([^/]+)\/penpa-edit/)[1];
const ws = new WebSocket("ws://" + location.host + "/ws");

const myUpdates = [];
const localUpdates = [];
const unprocessedChanges = [];
let processing = false;

function add_general_middleware() {
    if (window.old_make_class !== undefined) {
        return;
    }

    window.old_make_class = make_class;
    make_class = function () {
        const prevUrl = pu.maketext();
        const newPu = window.old_make_class(...arguments);
        if (!processing) {
            unprocessedChanges.push({ type: "reset", prevUrl });
        }
        add_pu_middleware(newPu);
        return newPu;
    };
}

function add_pu_middleware(pu) {
    if (pu.old_record !== undefined) {
        return;
    }

    pu.old_resize_board = pu.resize_board;
    pu.resize_board = function (side, sign) {
        pu.old_resize_board(...arguments);
        unprocessedChanges.push({ type: "resize", side, sign });
    };

    pu.old_record = pu.record;
    pu.record = function () {
        pu.old_record(...arguments);
        unprocessedChanges.push({ type: "diff" });
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

        if (new Set(unprocessedChanges.map(change => change.type)).size !== 1) {
            alert("Internal error: multiple change types");
        }
        const type = unprocessedChanges[0].type;
        const update = {
            changeId: randomId(),
            type,
            changes: [...unprocessedChanges],
        };

        processing = true;
        if (type === "diff") {
            const mode = pu.mode.qa;
            update.mode = mode;
            pu.undo();
            for (const change of unprocessedChanges) {
                change.diff = pu[mode].command_redo.pop();
                change.diff_col = pu[mode + "_col"].command_redo.pop();
            }
            for (const change of unprocessedChanges.toReversed()) {
                pu[mode].command_redo.push(change.diff);
                pu[mode + "_col"].command_redo.push(change.diff_col);
            }
            pu.redo();
        } else if (type === "reset") {
            unprocessedChanges[0].url = pu.maketext();
        }
        processing = false;

        localUpdates.push(update);
        unprocessedChanges.length = 0;
        ws.send(
            JSON.stringify({
                operation: "update",
                puzzleId,
                ...update,
            })
        );
    };
}

ws.addEventListener("message", event => {
    const msg = JSON.parse(event.data);
    if (msg.puzzleId !== puzzleId) {
        return;
    }

    // console.log(msg);
    if (msg.operation === "sync") {
        import_url(msg.url);
        connectingOverlay.remove();
        add_general_middleware();
        add_pu_middleware(pu);

        const puzzleIds = JSON.parse(window.localStorage.getItem("puzzles")) || [];
        if (!puzzleIds.includes(puzzleId)) {
            window.localStorage.setItem("puzzles", JSON.stringify([...puzzleIds, puzzleId]));
        }
    } else if (msg.operation === "update") {
        processing = true;
        if (unprocessedChanges.length > 0) {
            alert("Internal error: unprocessed changes");
        }

        // First, undo local changes
        for (const update of localUpdates.toReversed()) {
            if (update.type === "diff") {
                pu.undo();
            } else if (update.type === "reset") {
                import_url(update.prevUrl);
            }
        }

        // Apply the server update
        if (msg.type == "diff") {
            const currentMode = pu.mode.qa;
            pu.mode.qa = msg.mode;
            for (const change of msg.changes) {
                pu[msg.mode].command_redo.push(change.diff);
                pu[msg.mode + "_col"].command_redo.push(change.diff_col);
            }
            pu.redo();
            pu.mode.qa = currentMode;
        } else if (msg.type === "reset") {
            import_url(msg.changes[0].url);
        }

        // Reapply local changes (unless it's what the server just sent)
        const localIndex = localUpdates.findIndex(update => update.changeId === msg.changeId);
        if (localIndex !== -1) {
            localUpdates.splice(localIndex, 1);
        }
        for (const update of localUpdates) {
            if (update.type === "diff") {
                pu.redo();
            } else if (update.type === "reset") {
                import_url(update.url);
            }
        }

        processing = false;
    } else {
        console.log("Unknown message from server:", msg);
    }
});

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
