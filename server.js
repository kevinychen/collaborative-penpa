const express = require("express");
const expressWs = require("express-ws");

// Hacks to run penpa-edit on NodeJS server side
Zlib = this.Zlib;
$.fn.toggleSelect2 = () => {};

boot();

const app = express();
expressWs(app);

// Static files
const modifiedClientHtml = clientHtml.toString().replace(
    "</head>",
    `<script type="text/javascript">
    ${fs.readFileSync("client.js")}
    </script></head>`
);
app.get("/:puzzleId/penpa-edit", (_, res) => {
    res.type("html");
    res.send(modifiedClientHtml);
});
app.use("/:puzzleId/penpa-edit", express.static("penpa-edit/docs"));
app.use("/", express.static("public"));

// Puzzle API
const randomId = () => (1 + Math.random()).toString(36).substring(2);

const clients = {};
const puzzles = {};
app.use(express.json());
app.post("/api/puzzles", (req, res) => {
    res.send(
        Object.fromEntries(
            req.body.puzzleIds
                .filter(puzzleId => puzzles[puzzleId] !== undefined)
                .map(puzzleId => [puzzleId, { name: puzzles[puzzleId].name }])
        )
    );
});
app.post("/api/create", (req, res) => {
    const puzzleId = randomId();
    create_newboard();
    puzzles[puzzleId] = {
        pu,
        name: req.body.name,
        clients: new Set(),
    };
    res.send({ puzzleId });
});

// Websocket to listen and broadcast puzzle updates
app.ws("/ws", ws => {
    clients[ws] = {};

    ws.on("message", msg => {
        msg = JSON.parse(msg);
        const puzzle = puzzles[msg.puzzleId];
        if (puzzle === undefined) {
            return;
        }
        if (msg.operation === "join") {
            if (clients[ws].puzzleId !== undefined) {
                puzzles[clients[ws].puzzleId].clients.delete(ws);
            }
            clients[ws].puzzleId = msg.puzzleId;
            puzzle.clients.add(ws);
            ws.send(
                JSON.stringify({
                    operation: "sync",
                    puzzleId: msg.puzzleId,
                    url: puzzle.pu.maketext().replace("about:blank", "http://x/penpa-edit/"),
                })
            );
            return;
        } else if (msg.operation === "update") {
            // console.log(msg);
            puzzle.pu.mode.qa = msg.mode;
            for (const record of msg.records) {
                puzzle.pu[msg.mode].command_redo.push(record.change);
                puzzle.pu[msg.mode + "_col"].command_redo.push(record.change_col);
                puzzle.pu.redo();
            }
            puzzle.clients.forEach(client => {
                if (client.readyState === client.OPEN) {
                    client.send(JSON.stringify(msg));
                }
            });
            // console.log(pu.maketext().replace("about:blank", "http://x/penpa-edit/"));
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
