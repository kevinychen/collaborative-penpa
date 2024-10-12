Zlib = this.Zlib;
boot();

$.fn.toggleSelect2 = () => {};

// pu.mouse_mode = "down_left";
// pu.mouse_click = 0;
// pu.mouse_click_last = 1;
// pu.mouseevent(38, 38, 30);

// console.log(pu.pu_q.surface);

const randomId = () => (1 + Math.random()).toString(36).substring(2);

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
                puzzles[clients[ws].puzzleId].clients.remove(ws);
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
        } else {
            console.log("Unknown message from client:", msg);
        }
    });
});
app.listen(5000, () => console.log("Starting server"));
