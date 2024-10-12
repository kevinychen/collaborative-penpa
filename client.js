const ws = new WebSocket("ws://" + location.host + "/ws");

const randomId = () => (1 + Math.random()).toString(36).substring(2);

let puzzleId = "KYC";

let localChanges = [];
let numUnprocessedChanges = 0;

ws.addEventListener("open", () => {
    console.log("Connected to WebSocket server");
});

ws.addEventListener("message", event => {
    const msg = JSON.parse(event.data);
    if (msg.puzzleId !== puzzleId) {
        return;
    }

    if (msg.operation === "sync") {
        import_url(msg.url);

        if (pu.old_record === undefined) {
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
                        pu: pu[mode].command_redo.pop(),
                        pu_col: pu[mode + "_col"].command_redo.pop(),
                    });
                }
                for (let i = numUnprocessedChanges - 1; i >= 0; i--) {
                    pu[mode].command_redo.push(records[i].pu);
                    pu[mode + "_col"].command_redo.push(records[i].pu_col);
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
                ws.send(
                    JSON.stringify({
                        operation: "update",
                        puzzleId,
                        ...change,
                    })
                );
            };
        }
    } else if (msg.operation === "update") {
        if (msg.puzzleId !== puzzleId) {
            return;
        }
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
            pu[msg.mode].command_redo.push(record.pu);
            pu[msg.mode + "_col"].command_redo.push(record.pu_col);
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
    ws.send(
        JSON.stringify({
            operation: "join",
            puzzleId,
        })
    );
});
