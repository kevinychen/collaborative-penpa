const randomId = () => (1 + Math.random()).toString(36).substring(2);

const connectingOverlay = document.createElement("div");
const puzzleId = window.location.pathname.match(/\/([^/]+)\/penpa-edit/)[1];
const ws = new WebSocket("ws://" + location.host + "/ws");

let localChanges = [];
let numUnprocessedChanges = 0;

function add_pu_middleware() {
    if (pu.old_record !== undefined) {
        return;
    }

    pu.old_record = pu.record;
    pu.record = function (...args) {
        pu.old_record(...args);
        numUnprocessedChanges++;
    };

    pu.old_redraw = pu.redraw;
    pu.redraw = function (...args) {
        pu.old_redraw(...args);
        if (pu.processing) {
            return;
        }
        pu.processing = true;
        for (let i = 0; i < numUnprocessedChanges; i++) {
            pu.undo();
        }
        const mode = pu.mode.qa;
        const records = [];
        for (let i = 0; i < numUnprocessedChanges; i++) {
            records.push({
                change: pu[mode].command_redo.pop(),
                change_col: pu[mode + "_col"].command_redo.pop(),
            });
        }
        for (let i = numUnprocessedChanges - 1; i >= 0; i--) {
            pu[mode].command_redo.push(records[i].change);
            pu[mode + "_col"].command_redo.push(records[i].change_col);
        }
        const change = {
            changeId: randomId(),
            mode,
            records,
        };
        // console.log(JSON.stringify(change));
        for (let i = 0; i < numUnprocessedChanges; i++) {
            pu.redo();
        }
        pu.processing = false;
        localChanges.push(change);
        numUnprocessedChanges = 0;
        ws.send(
            JSON.stringify({
                operation: "update",
                puzzleId,
                ...change,
            })
        );
    };
}

ws.addEventListener("message", event => {
    const msg = JSON.parse(event.data);
    if (msg.puzzleId !== puzzleId) {
        return;
    }

    if (msg.operation === "sync") {
        import_url(msg.url);
        connectingOverlay.remove();
        add_pu_middleware();

        const puzzleIds = JSON.parse(window.localStorage.getItem("puzzles")) || [];
        if (!puzzleIds.includes(puzzleId)) {
            window.localStorage.setItem("puzzles", JSON.stringify([...puzzleIds, puzzleId]));
        }
    } else if (msg.operation === "update") {
        pu.processing = true;
        for (let i = 0; i < numUnprocessedChanges; i++) {
            pu.undo();
        }
        for (let i = 0; i < localChanges.length; i++) {
            pu.undo();
        }
        // console.log("apply", msg);
        const oldMode = pu.mode.qa;
        pu.mode.qa = msg.mode;
        for (const record of msg.records) {
            pu[msg.mode].command_redo.push(record.change);
            pu[msg.mode + "_col"].command_redo.push(record.change_col);
            pu.redo();
        }
        pu.mode.qa = oldMode;
        for (let i = 0; i < localChanges.length; i++) {
            if (localChanges[i] !== msg.changeId) {
                pu.redo();
            }
        }
        for (let i = 0; i < numUnprocessedChanges; i++) {
            pu.redo();
        }
        pu.processing = false;
        localChanges = localChanges.filter(change => change.changeId !== msg.changeId);
    } else {
        console.log("Unknown message from server:", msg);
    }
});

window.addEventListener("load", () => {
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
