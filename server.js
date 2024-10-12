Zlib = this.Zlib;
boot();

$.fn.toggleSelect2 = () => {};

// pu.mouse_mode = "down_left";
// pu.mouse_click = 0;
// pu.mouse_click_last = 1;
// pu.mouseevent(38, 38, 30);

// console.log(pu.pu_q.surface);

const clients = {};
const puzzles = {};

const app = express();
expressWs(app);
app.get("/", (_, res) => res.redirect("/penpa-edit"));
app.get("/penpa-edit", (_, res) => {
    res.type("html");
    res.send(modifiedClientHtml);
});
app.use("/penpa-edit", express.static("penpa-edit/docs"));
app.ws("/ws", ws => {
    clients[ws] = {};

    ws.on("message", msg => {
        msg = JSON.parse(msg);
        if (msg.operation === "join") {
            if (clients[ws].puzzleId !== undefined) {
                puzzles[clients[ws].puzzleId].clients.delete(ws);
            }
            if (puzzles[msg.puzzleId] === undefined) {
                create_newboard();
                puzzles[msg.puzzleId] = {
                    pu: pu,
                    clients: new Set(),
                };
            }
            clients[ws].puzzleId = msg.puzzleId;
            puzzles[msg.puzzleId].clients.add(ws);
            ws.send(
                JSON.stringify({
                    operation: "sync",
                    puzzleId: msg.puzzleId,
                    url: puzzles[msg.puzzleId].pu.maketext().replace("about:blank", "http://x/penpa-edit/"),
                })
            );
            return;
        } else if (msg.operation === "update") {
            const puzzle = puzzles[msg.puzzleId];
            if (puzzle === undefined) {
                return;
            }
            pu = puzzle.pu;
            console.log(msg);
            pu.mode.qa = msg.mode;
            pu[msg.mode].command_redo.push(msg.pu);
            pu[msg.mode + "_col"].command_redo.push(msg.pu_col);
            pu.redo();
            puzzle.clients.forEach(client => {
                if (client.readyState === client.OPEN) {
                    client.send(
                        JSON.stringify({
                            operation: "update",
                            puzzleId: msg.puzzleId,
                            mode: msg.mode,
                            pu: msg.pu,
                            pu_col: msg.pu_col,
                        })
                    );
                }
            });
        } else {
            console.log("Unknown message from client:", msg);
        }
    });

    ws.on("close", () => {
        if (clients[ws].puzzleId !== undefined) {
            puzzles[clients[ws].puzzleId].clients.delete(ws);
        }
    });
});
app.listen(5000, () => console.log("Starting server"));
