const ws = new WebSocket("ws://" + location.host + "/ws");

const randomId = () => (1 + Math.random()).toString(36).substring(2);

let puzzleId = "KYC";

const localChanges = [];

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

        pu.old_record = pu.record;
        pu.record = function (...args) {
            pu.old_record(...args);
            pu.undo();
            const mode = pu.mode.qa;
            const change = {
                mode,
                pu: pu[mode].command_redo.pop(),
                pu_col: pu[mode + "_col"].command_redo.pop(),
            };
            pu[mode].command_redo.push(change.pu);
            pu[mode + "_col"].command_redo.push(change.pu_col);
            console.log(change);
            pu.redo();
            localChanges.push(change);
            ws.send(
                JSON.stringify({
                    operation: "update",
                    puzzleId,
                    ...change,
                })
            );
        };
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
